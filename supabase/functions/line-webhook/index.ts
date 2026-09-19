// LINE webhook for Classroom add-class, student contact and other active LINE events.
// Retired cancel/reschedule postbacks from historical chats are discarded before
// database or Calendar access. Keep check_conflict, confirm_add_class, and
// start_contact_student behavior intact.

// deno-lint-ignore-file
// @ts-nocheck

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import {
  CALENDAR_TERMINAL_STATE,
  formatCalendarTerminalMessage,
  googleCalendarRequest,
  terminalStateForCalendarFailure,
} from '../_shared/calendar-reliability.mjs';

const LINE_REPLY_URL = 'https://api.line.me/v2/bot/message/reply';
const LINE_PUSH_URL = 'https://api.line.me/v2/bot/message/push';

async function verifySignature(rawBody, signatureHeader, channelSecret) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(channelSecret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sigBuf = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(rawBody));
  const bytes = new Uint8Array(sigBuf);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  const computed = btoa(binary);
  return computed === signatureHeader;
}

async function replyLine(channelToken, replyToken, text) {
  try {
    await fetch(LINE_REPLY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + channelToken },
      body: JSON.stringify({ replyToken, messages: [{ type: 'text', text: String(text).slice(0, 4900) }] }),
    });
  } catch (e) { /* ตอบกลับไม่สำเร็จก็ไม่เป็นไร ฐานข้อมูลอัปเดตไปแล้วเป็นหลัก */ }
}

// 2026-07-16 加：ต่างจาก replyLine ตรงที่ push ส่งหาใครก็ได้ (ไม่ต้องมี replyToken สดๆ)
// ใช้ตอนต้องเด้งไปแจ้ง "อีกฝ่าย" (เช่น นักเรียนกดรับทราบใน LINE → ต้องเด้งไปเตือนครู)
async function pushLine(channelToken, targetUserId, text) {
  try {
    await fetch(LINE_PUSH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + channelToken },
      body: JSON.stringify({ to: targetUserId, messages: [{ type: 'text', text: String(text).slice(0, 4900) }] }),
    });
  } catch (e) { /* push ไม่สำเร็จก็ไม่เป็นไร ฐานข้อมูลอัปเดตไปแล้วเป็นหลัก */ }
}

// ── 2026-07-31 เพิ่ม (งาน C2) — ตัวส่ง LINE แบบ "เช็คผลจริง" ──────────────────────
// ต่างจาก pushLine ข้างบนตรงที่ตัวนั้นกลืน error ทุกอย่างเงียบๆ และไม่คืนค่าอะไรเลย
// → ผู้เรียกไม่มีทางรู้ว่าส่งถึงจริงไหม ทำให้เคยตอบครูว่า "แจ้งนักเรียนแล้ว" ทั้งที่ไม่ได้ส่ง
//
// ทำไมสร้างตัวใหม่แทนที่จะแก้ pushLine เดิม:
//   pushLine ถูกเรียกจากหลายที่ทั่วไฟล์นี้ การเปลี่ยนพฤติกรรมตัวเดิมจะกระทบเป็นวงกว้างโดยไม่จำเป็น
//   → ค่อยๆ ย้ายเส้นทางมาใช้ตัวนี้ทีละเส้นทาง
//
// ✅ 2026-07-31 (รอบ 2): เส้นทาง "เพิ่มคาบ" (ก้อน confirm_add_class) ย้ายมาใช้ตัวนี้แล้วเรียบร้อย
//    เหลือ pushLine ตัวเก่าใช้อยู่ที่: แจ้งเตือนทั่วไป + เส้นทาง "ขอเลื่อน (改期)" ซึ่งยังไม่ได้ตรวจ
//    → ห้ามลบ pushLine · ถ้าจะแก้เส้นทางขอเลื่อน ให้ย้ายมาใช้ pushLineChecked แบบเดียวกัน
async function pushLineChecked(channelToken, targetUserId, text) {
  try {
    const res = await fetch(LINE_PUSH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + channelToken },
      body: JSON.stringify({ to: targetUserId, messages: [{ type: 'text', text: String(text).slice(0, 4900) }] }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(function () { return ''; });
      console.error('[line-webhook] LINE push provider error:', res.status, detail.slice(0, 500));
      return { ok: false, reason: 'LINE 暫時無法送出通知' };
    }
    return { ok: true, reason: '' };
  } catch (e) {
    console.error('[line-webhook] LINE push network error:', (e && e.message) ? e.message : String(e));
    return { ok: false, reason: 'LINE 暫時無法送出通知' };
  }
}

// 2026-07-19 加（Lin 要求）：老師發起取消 → 學生在 LINE 那邊按「我知道了」確認之後，
// 原本推給老師的只是「純文字」叫老師自己去網站按「確認刪除」——現在改成直接附一顆按鈕，
// 老師在 LINE 這裡就能直接按，不用開網站。跟 notify-line/index.ts 的 buildFlexMessage 同一套樣式規則
// （金色主題、按鈕不能放 ✅/❌ emoji，因為 emoji 自帶紅綠色跟網站主題不符）。
function buildFlexMessage(title, bodyText, buttons) {
  const footerContents = (buttons || []).map((b) => ({
    type: 'button',
    style: b.style || 'secondary',
    height: 'sm',
    color: b.color || (b.style === 'primary' ? '#8B6310' : '#FAF4E8'),
    action: b.uri
      ? { type: 'uri', label: b.label.slice(0, 20), uri: b.uri }
      : { type: 'postback', label: b.label.slice(0, 20), data: b.postbackData, displayText: b.label },
  }));
  return {
    type: 'flex',
    altText: title.slice(0, 400),
    contents: {
      type: 'bubble',
      body: {
        type: 'box', layout: 'vertical', spacing: 'md',
        contents: [
          { type: 'text', text: title, weight: 'bold', size: 'md', wrap: true, color: '#1C1C1C' },
          { type: 'text', text: bodyText, size: 'sm', color: '#6b6b6b', wrap: true },
        ],
      },
      footer: footerContents.length
        ? { type: 'box', layout: 'vertical', spacing: 'sm', contents: footerContents }
        : undefined,
    },
  };
}

async function pushLineFlex(channelToken, targetUserId, title, bodyText, buttons) {
  try {
    const flexMsg = buildFlexMessage(title, bodyText, buttons);
    await fetch(LINE_PUSH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + channelToken },
      body: JSON.stringify({ to: targetUserId, messages: [flexMsg] }),
    });
  } catch (e) { /* push ไม่สำเร็จก็ไม่เป็นไร ฐานข้อมูลอัปเดตไปแล้วเป็นหลัก */ }
}

// ════════════════════════════════════════════════════════════
// 2026-07-19 加：Google Calendar (service account) — ให้ปุ่มเดียวใน LINE ลบ Calendar ได้จริง
// ก่อนหน้านี้ทำไม่ได้เพราะ Edge Function ไม่มี OAuth token ของครู (ดูคอมเมนต์บรรทัด 26-30 ด้านบน)
// ต้องตั้ง secret ก่อนใช้: supabase secrets set GOOGLE_SERVICE_ACCOUNT_KEY="$(cat service-account.json)"
// และต้องแชร์ Google Calendar ("primary" ของครู) ให้อีเมล service account สิทธิ์ "Make changes to events"
// เลียนแบบวิธีลบของฝั่งเว็บ (deleteClassEventOnce ใน classroom/index.html) ให้พฤติกรรมตรงกัน:
// ลบทีละ event ตรง id เดียว (ไม่แตะ RRULE/recurring master) 404/410 ถือว่า "ลบไปแล้ว" ไม่ error ซ้ำ
// ════════════════════════════════════════════════════════════
function pemToArrayBuffer(pem) {
  const b64 = String(pem).replace(/-----BEGIN PRIVATE KEY-----/, '').replace(/-----END PRIVATE KEY-----/, '').replace(/\s+/g, '');
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

function base64url(input) {
  let b64;
  if (typeof input === 'string') b64 = btoa(input);
  else {
    const bytes = new Uint8Array(input);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    b64 = btoa(binary);
  }
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

let _cachedGoogleToken = null; // { token, exp } — cache ไว้กันขอ token ซ้ำถ้า 1 request มีหลาย event (cold start ใหม่ทุกครั้งอยู่แล้ว ไม่ลอยค้างข้าม request)

async function getGoogleCalendarToken() {
  const now = Math.floor(Date.now() / 1000);
  if (_cachedGoogleToken && _cachedGoogleToken.exp > now + 30) return _cachedGoogleToken.token;

  const raw = Deno.env.get('GOOGLE_SERVICE_ACCOUNT_KEY');
  if (!raw) { console.error('[calendar-auth] ⚠️ ยังไม่ได้ตั้ง secret GOOGLE_SERVICE_ACCOUNT_KEY'); return null; }
  let sa;
  try { sa = JSON.parse(raw); } catch (e) { console.error('[calendar-auth] GOOGLE_SERVICE_ACCOUNT_KEY parse ไม่ผ่าน:', e.message); return null; }
  if (!sa.private_key || !sa.client_email) { console.error('[calendar-auth] service account json ไม่มี private_key/client_email'); return null; }

  try {
    const header = { alg: 'RS256', typ: 'JWT' };
    const claim = {
      iss: sa.client_email,
      scope: 'https://www.googleapis.com/auth/calendar',
      aud: 'https://oauth2.googleapis.com/token',
      iat: now,
      exp: now + 3600,
    };
    const unsigned = base64url(JSON.stringify(header)) + '.' + base64url(JSON.stringify(claim));
    const key = await crypto.subtle.importKey(
      'pkcs8', pemToArrayBuffer(sa.private_key), { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']
    );
    const sigBuf = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(unsigned));
    const jwt = unsigned + '.' + base64url(sigBuf);

    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: 'grant_type=' + encodeURIComponent('urn:ietf:params:oauth:grant-type:jwt-bearer') + '&assertion=' + jwt,
    });
    const data = await res.json();
    if (!res.ok || !data.access_token) {
      console.error('[calendar-auth] ขอ token ไม่สำเร็จ:', JSON.stringify(data));
      return null;
    }
    _cachedGoogleToken = { token: data.access_token, exp: now + (data.expires_in || 3600) };
    return data.access_token;
  } catch (e) {
    console.error('[calendar-auth] เซ็น JWT/ขอ token พัง:', e.message);
    return null;
  }
}

// 🔴 2026-07-19 แก้บั๊กร้ายแรง (Lin ทดสอบเจอ：กดปุ่มขึ้น "สำเร็จ" แต่ Calendar ไม่ถูกลบจริง):
// เดิม hardcode "primary" — แต่ "primary" ของ service account หมายถึงปฏิทินของ "บัญชีหุ่นยนต์" เอง
// (ปฏิทินว่างๆ อีกอันหนึ่ง) ไม่ใช่ปฏิทินจริงของครูที่แชร์ให้! ทำให้ DELETE ไปโดนคนละปฏิทิน คืน 404
// (หาไม่เจอในปฏิทินหุ่นยนต์) แล้วโค้ดเดิมเข้าใจผิดว่า 404 = "ลบไปแล้ว" (ok:true) ทั้งที่จริงคือ "หาไม่เจอ
// เพราะผิดปฏิทิน" (RELIABILITY FIRST — ต้องไม่ขึ้นสำเร็จถ้ายังไม่ตรวจว่าสำเร็จจริง)
// แก้ 2 จุด: (1) ใช้ GOOGLE_CALENDAR_ID (อีเมลปฏิทินจริงของครู) แทน "primary" ตายตัว
//           (2) หลัง DELETE แล้ว GET ซ้ำอีกครั้งเพื่อ "ยืนยัน" ว่าลบจริง (เหมือน verifyEventDeleted
//               ฝั่งเว็บ) ไม่เชื่อแค่ status code ของ DELETE เฉยๆ
// ต้องตั้ง secret ก่อนใช้: supabase secrets set GOOGLE_CALENDAR_ID=mr.taihualin@gmail.com (อีเมล
// ปฏิทินจริงของครูที่แชร์ให้ service account ไว้แล้ว)
// 🟠 2026-07-31 (งาน C4): เพิ่มช่องรับค่าตัวที่ 2 "expectedDateStr" (ไม่ใส่ = ข้ามการเทียบ เหมือนเดิมทุกอย่าง)
//    ใส่มาเมื่อไหร่ = "ลบได้ต่อเมื่อคาบยังอยู่วันนี้จริงเท่านั้น"
//    ตรวจแล้วว่าฟังก์ชันนี้มีที่เรียกจุดเดียวทั้งไฟล์ (ก้อน confirm_cancel_delete) จึงไม่กระทบใคร
// 🔴 2026-08-01 (ตรวจระบบยกเลิก/เพิ่มคาบ ข้อ 2): เพิ่มช่องรับค่าตัวที่ 3 "beforeDeleteHook"
//    = งานที่ต้อง "ทำให้สำเร็จก่อน" ถึงจะยอมลบ (ใช้เขียนแถวสำรองก่อนลบ) · ไม่ใส่ = ข้ามไป เหมือนเดิมทุกอย่าง
//    ต้องคืนค่า { ok: true } เท่านั้นถึงจะลบต่อ · คืน ok:false = ไม่แตะ Calendar เลยสักนิด
//    ตรวจแล้วว่าฟังก์ชันนี้มีที่เรียกจุดเดียวทั้งไฟล์ (ก้อน confirm_cancel_delete) จึงไม่กระทบใคร
function addOneHourTimeStr(timeStr) {
  const parts = String(timeStr || '00:00').split(':');
  const h = (parseInt(parts[0], 10) + 1) % 24;
  return String(h).padStart(2, '0') + ':' + (parts[1] || '00');
}

function bangkokToIso(dateStr, timeStr) {
  return new Date(dateStr + 'T' + (timeStr || '00:00') + ':00+07:00').toISOString();
}

function buildIcalUntilUtcSimple(untilDateStr) {
  const d = new Date(untilDateStr + 'T23:59:00+07:00');
  const pad = (n) => String(n).padStart(2, '0');
  return d.getUTCFullYear() + pad(d.getUTCMonth() + 1) + pad(d.getUTCDate()) + 'T' + pad(d.getUTCHours()) + pad(d.getUTCMinutes()) + pad(d.getUTCSeconds()) + 'Z';
}

// action=check_conflict 用：查詢服務帳號能看到的那個 Calendar（GOOGLE_CALENDAR_ID，不是 primary，
// 原因跟 deleteCalendarEventById 上面的說明一樣）在這段時間有沒有其他事件卡到。
async function checkFreebusyConflictService(startIso, endIso) {
  const token = await getGoogleCalendarToken();
  if (!token) return { ok: false, reason: 'no_token' };
  const calendarId = Deno.env.get('GOOGLE_CALENDAR_ID');
  if (!calendarId) return { ok: false, reason: 'no_calendar_id' };
  try {
    const res = await fetch('https://www.googleapis.com/calendar/v3/freeBusy', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ timeMin: startIso, timeMax: endIso, items: [{ id: calendarId }] }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      return { ok: false, reason: 'http_' + res.status, detail: detail.slice(0, 300) };
    }
    const data = await res.json();

    // ══════════════════════════════════════════════════════════════════════════
    // 🔴 2026-07-31 (รอบ 4) แก้รูใหญ่ — เดิมบรรทัดนี้เขียนว่า
    //      const busy = (data.calendars && data.calendars[calendarId] && ...busy) || [];
    //      return { ok: true, busy };
    //    = ถ้าหาปฏิทินในคำตอบไม่เจอ จะ "ตอบว่าตรวจสำเร็จ และไม่มีอะไรชน" ทันที
    //
    //    ทำไมอันตราย: Google ตอบ HTTP 200 (สำเร็จ) แม้ตอนที่ปฏิทินใบนั้นมีปัญหา —
    //      ปฏิทินหาไม่เจอ (notFound) · ไม่มีสิทธิ์อ่าน · เจ้าของเลิกแชร์ให้ · ชื่อปฏิทินตัวพิมพ์
    //      ใหญ่-เล็กไม่ตรงกับที่ Google ส่งกลับมา → คำตอบจะมี errors แทน busy
    //      พอโค้ดเดิมอ่านไม่เจอ ก็แปลว่า "ว่าง" หมด = **ด่านหลอก** ที่ปล่อยผ่านทุกครั้ง
    //      ซึ่งแย่กว่าไม่มีด่านเลย (ครูเชื่อว่ามีคนตรวจให้แล้ว)
    //
    //    ตอนนี้: หาไม่เจอ / มี errors = ตอบว่า "ตรวจไม่สำเร็จ" (ok:false) → ฝั่งที่เรียกใช้
    //      เป็นคนตัดสินใจ และก้อน confirm_add_class ตั้งไว้ว่า "ตรวจไม่ได้ = ไม่อนุญาต" (fail-closed)
    // ══════════════════════════════════════════════════════════════════════════
    const cals = data.calendars || {};
    // Google อาจส่งชื่อปฏิทินกลับมาเป็นตัวพิมพ์เล็ก → หาแบบไม่สนตัวพิมพ์ใหญ่-เล็กด้วย
    let entry = cals[calendarId];
    if (!entry) {
      const wantLower = String(calendarId).toLowerCase();
      const hitKey = Object.keys(cals).find((k) => k.toLowerCase() === wantLower);
      if (hitKey) entry = cals[hitKey];
    }
    if (!entry) {
      return { ok: false, reason: 'calendar_not_in_response',
        detail: 'Google ตอบกลับมาแต่ไม่มีปฏิทินใบนี้อยู่ในคำตอบ (ได้: ' + Object.keys(cals).join(', ') + ') — เช็คว่า GOOGLE_CALENDAR_ID ถูกไหม และแชร์ปฏิทินให้ service account แล้วหรือยัง' };
    }
    if (Array.isArray(entry.errors) && entry.errors.length) {
      return { ok: false, reason: 'calendar_error_' + (entry.errors[0].reason || 'unknown'),
        detail: JSON.stringify(entry.errors).slice(0, 200) };
    }
    if (!Array.isArray(entry.busy)) {
      return { ok: false, reason: 'no_busy_field',
        detail: 'คำตอบของ Google ไม่มีรายการช่วงเวลาที่ไม่ว่าง — ไม่กล้าตีความว่า "ว่าง"' };
    }
    return { ok: true, busy: entry.busy };
  } catch (e) {
    return { ok: false, reason: 'fetch_error', detail: e.message };
  }
}

// action=confirm_add_class 用：直接在服務帳號的 Calendar 上建立事件＋建立後回頭 GET 一次確認
// （跟網站端 createCalendarClassEventForStudent 同一套「建立後一定要驗證，不是只信任 API 回應」）。
// 只負責 Calendar 本身，不寫資料庫（資料庫寫入交給呼叫端，因為要決定寫 classroom_schedule 還是
// classroom_recurring_days，那是業務邏輯，這裡只管 Calendar）。
async function createCalendarEventById(eventBody) {
  const token = await getGoogleCalendarToken();
  if (!token) return { ok: false, reason: 'no_token' };
  const calendarId = Deno.env.get('GOOGLE_CALENDAR_ID');
  if (!calendarId) return { ok: false, reason: 'no_calendar_id', detail: 'ยังไม่ได้ตั้ง secret GOOGLE_CALENDAR_ID' };
  try {
    const createRes = await fetch('https://www.googleapis.com/calendar/v3/calendars/' + encodeURIComponent(calendarId) + '/events', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify(eventBody),
    });
    if (!createRes.ok) {
      const detail = await createRes.text().catch(() => '');
      return { ok: false, reason: 'http_' + createRes.status, detail: detail.slice(0, 300) };
    }
    const ev = await createRes.json();
    // 建立完一定要回頭確認真的存在、時間也對，不能只信任建立當下的 API 回應（RELIABILITY FIRST）
    const verifyRes = await fetch('https://www.googleapis.com/calendar/v3/calendars/' + encodeURIComponent(calendarId) + '/events/' + encodeURIComponent(ev.id), {
      headers: { Authorization: 'Bearer ' + token },
    });
    if (!verifyRes.ok) {
      // 建立的 API 說成功，但驗證連線失敗——不確定到底有沒有真的建立，不能放心讓人重按（可能重複建立）
      return { ok: false, reason: 'verify_failed_http_' + verifyRes.status, eventCreatedButUnverified: ev.id };
    }
    const verifyEv = await verifyRes.json();
    const actualStart = verifyEv.start && (verifyEv.start.dateTime || verifyEv.start.date);
    const expectedStart = eventBody.start && eventBody.start.dateTime;
    if (!actualStart || (expectedStart && Math.abs(new Date(actualStart).getTime() - new Date(expectedStart).getTime()) > 60000)) {
      return { ok: false, reason: 'verify_mismatch', detail: 'Calendar 顯示的時間跟預期不一樣（顯示：' + (actualStart || '無') + '）', eventCreatedButUnverified: ev.id };
    }
    // 🟡 2026-07-31 (รอบ 4) เพิ่ม `event`: คืน "ตัวคาบจริงที่ Calendar ยืนยันกลับมา" ออกไปด้วย
    //   ใช้ทำแถวสำรอง (classroom_calendar_backups.old_event_json) ให้ปุ่ม ↩️ 復原 ฝั่งเว็บกดคืนได้
    //   ต้องเป็น verifyEv (ของจริงจาก Calendar) ไม่ใช่ eventBody ที่เราส่งไป — เพราะ Google อาจเติม/
    //   แปลงค่าเอง (เช่น recurrence, timeZone) แล้วปุ่มคืนค่าจะตัดสินใจจากข้อมูลที่ไม่ตรงของจริง
    return { ok: true, eventId: ev.id, event: verifyEv };
  } catch (e) {
    return { ok: false, reason: 'fetch_error', detail: e.message };
  }
}

// 2026-07-22 加：跟網站端 studentFacingTimeLabel 同樣的用途——把 UTC ISO 字串換算成學生自己
// 當地時區的日期+時間，通知學生時才不用一直讓學生自己心算泰國時間。沒有 studentTz 或換算失敗
// 就回傳 null，呼叫端退回顯示泰國時間版本（不會整段訊息壞掉）。
function formatIsoInTz(iso, tz) {
  if (!tz) return null;
  try {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
    }).formatToParts(new Date(iso));
    const map = {}; parts.forEach((p) => { map[p.type] = p.value; });
    return map.year + '-' + map.month + '-' + map.day + ' ' + map.hour + ':' + map.minute;
  } catch (e) { return null; }
}

// 從一個 UTC ISO 字串取出「泰國時間（UTC+7，全年固定不變）」的 HH:MM，給 moveCalendarEventById
// 在學生沒指定新時間（理論上不該發生，防呆用）時，沿用原本事件的時間點。
// ── 2026-07-31 เพิ่ม (งาน C4) — แปลงเวลา ISO เป็น "วันที่ตามเวลาไทย" (YYYY-MM-DD) ──
// ใช้เทียบว่าคาบใน Calendar ยังอยู่วันเดียวกับที่นักเรียนขอไว้ไหม
// คาบแบบ "ทั้งวัน" (all-day) Google ส่งมาเป็น YYYY-MM-DD อยู่แล้ว ใช้ได้เลยไม่ต้องแปลง
function extractBangkokDateStr(iso) {
  if (!iso) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  return new Date(d.getTime() + 7 * 3600 * 1000).toISOString().slice(0, 10);
}

async function handleTeacherTextMessage(supabase, channelToken, event) {
  const teacherUserId = Deno.env.get('LINE_TEACHER_USER_ID');
  const senderUserId = event.source && event.source.userId;
  if (!teacherUserId || !senderUserId || senderUserId !== teacherUserId) return; // 不是老師本人傳的，安全忽略
  const { data: pending } = await supabase
    .from('line_pending_reply')
    .select('student_token, student_name, set_at')
    .eq('id', 1)
    .maybeSingle();
  if (!pending || !pending.student_token) return; // 沒有正在等待轉發的對象，當一般聊天忽略，不回覆什麼

  const setAt = pending.set_at ? new Date(pending.set_at).getTime() : 0;
  const ageMs = Date.now() - setAt;
  if (!setAt || ageMs > 15 * 60 * 1000) {
    await supabase.from('line_pending_reply').update({ student_token: null, student_name: null, set_at: null }).eq('id', 1);
    if (channelToken && event.replyToken) {
      await replyLine(channelToken, event.replyToken, '⚠️ 剛剛選的「聯繫學生」已經過期了（超過 15 分鐘），請重新按一次「💬 聯繫學生」再打字');
    }
    return;
  }

  const { data: stuRow } = await supabase.from('classroom_students').select('line_user_id, name').eq('token', pending.student_token).maybeSingle();
  if (!stuRow || !stuRow.line_user_id) {
    await supabase.from('line_pending_reply').update({ student_token: null, student_name: null, set_at: null }).eq('id', 1);
    if (channelToken && event.replyToken) {
      await replyLine(channelToken, event.replyToken, '⚠️ 找不到這位學生的 LINE 資料了，請到網站手動聯絡');
    }
    return;
  }

  const textToSend = event.message.text || '';
  // 🟠 2026-08-01 แก้ (ตรวจระบบยกเลิก/เพิ่มคาบ ข้อ 5) — เดิมใช้ pushLine ซึ่ง "กลืน error ทุกอย่าง"
  //   แล้วล้างข้อความค้างทิ้งทันที แล้วตอบครูว่า "✅ 已經幫你轉給「X」了" ทุกกรณี
  //   → LINE ปฏิเสธ (นักเรียนบล็อก OA / LINE ล่ม / โควตาหมด) = นักเรียนไม่ได้รับอะไรเลย
  //     ครูเชื่อสนิทว่าส่งแล้ว และข้อความก็ถูกลบทิ้งไปแล้วด้วย พิมพ์ใหม่ไม่ได้เพราะไม่รู้ตัว
  //   ผิดกฎ RELIABILITY FIRST (ห้ามขึ้นว่าสำเร็จถ้ายังไม่ตรวจ) — เส้นทางเพิ่มคาบ/ลบคาบย้ายมาใช้
  //   pushLineChecked หมดแล้ว เหลือปุ่ม 💬 聯繫學生 เป็นจุดสุดท้าย
  //   ส่งไม่สำเร็จ = **ไม่ล้างข้อความค้าง** ครูพิมพ์ใหม่ได้เลยโดยไม่ต้องกดปุ่มใหม่
  const fwdRes = await pushLineChecked(channelToken, stuRow.line_user_id, textToSend);
  if (!fwdRes.ok) {
    console.error('[line-webhook] ⚠️ 轉傳訊息給學生失敗（沒有清掉待回覆狀態，老師可以直接再打一次）：', fwdRes.reason);
    if (channelToken && event.replyToken) {
      await replyLine(channelToken, event.replyToken,
        '⚠️ 沒送出去，學生沒收到這則訊息\n原因：' + fwdRes.reason +
        '\n（還在「回覆「' + (stuRow.name || pending.student_name || '這位學生') + '」」的狀態，直接再打一次就好，不用重按按鈕）');
    }
    return;
  }
  // 送出後立刻清掉，避免老師下一句閒聊被誤轉給同一個學生
  await supabase.from('line_pending_reply').update({ student_token: null, student_name: null, set_at: null }).eq('id', 1);
  if (channelToken && event.replyToken) {
    await replyLine(channelToken, event.replyToken, '✅ 已經幫你轉給「' + (stuRow.name || pending.student_name || '這位學生') + '」了');
  }
}

serve(async (req) => {
  // LINE จะยิง GET มาตอนกด "Verify" ในหน้า console ครั้งแรก ให้ตอบ 200 เฉยๆ ก็พอ
  if (req.method !== 'POST') {
    // 2026-08-01 เพิ่ม log — จะได้แยกออกว่า "ที่บูตขึ้นมาเมื่อกี้" คือ LINE กด Verify หรือคนกดปุ่มจริง
    console.log('[line-webhook] ℹ️ ได้รับ request ที่ไม่ใช่ POST (' + req.method + ') → ตอบ ok เฉยๆ (ปกติคือตอน LINE กด Verify)');
    return new Response('ok', { status: 200 });
  }

  const rawBody = await req.text();
  const channelToken = Deno.env.get('LINE_CHANNEL_ACCESS_TOKEN');
  const channelSecret = Deno.env.get('LINE_CHANNEL_SECRET');

  // ยืนยันว่า request นี้มาจาก LINE จริง ๆ
  // 🔴 2026-08-01 แก้ (งาน B7 — SECURITY FIRST): ไม่มี LINE_CHANNEL_SECRET = ตีกลับ 401 ทันที
  //   เดิม: ไม่มี secret → "ข้ามการตรวจลายเซ็น" แล้วทำงานต่อ (มีแค่ log เตือน) เผื่อไว้ตอน deploy ครั้งแรก
  //   พังยังไง: ฟังก์ชันนี้ deploy ด้วย --no-verify-jwt (LINE ต้องยิงตรงได้) = URL เปิดโล่งอยู่แล้ว
  //     ถ้าวันไหน secret หาย/ตั้งชื่อผิด/ถูกลบตอนย้ายโปรเจกต์ → ใครก็ยิง JSON ปลอมเข้ามาสั่งลบ/ย้าย/
  //     สร้างคาบใน Google Calendar ของครูได้ทันที (ด่านเดียวที่เหลือคือ "userId ต้องตรงกับครู" ซึ่งอยู่
  //     ใน body ที่คนยิงเป็นคนเขียนเอง = ไม่ใช่ด่านเลย) และระบบจะเงียบสนิท เห็นแค่บรรทัด log ที่ไม่มีใครดู
  //   ตอนนี้: ปิดประตูเลย ปลอดภัยกว่า "ทำงานได้แต่ไม่ปลอดภัย" · log บรรทัดเดิมยังอยู่ครบ
  //   เช็ค log ได้จาก Supabase Dashboard → Edge Functions → line-webhook → Logs
  if (!channelSecret) {
    console.error('[line-webhook] ⚠️ ยังไม่ได้ตั้งค่า LINE_CHANNEL_SECRET — ปฏิเสธ request ทั้งหมด (401) จนกว่าจะตั้ง secret นี้ ตั้งด้วย: supabase secrets set LINE_CHANNEL_SECRET=xxxxxxxx');
    return new Response('server not configured', { status: 401 });
  }
  {
    const sig = req.headers.get('x-line-signature') || '';
    const ok = await verifySignature(rawBody, sig, channelSecret);
    // 🔴 2026-08-01 เพิ่ม log (เจอจริง: กดปุ่มแล้วเงียบสนิท หาสาเหตุไม่ได้เลย)
    //   เดิมบรรทัดนี้ return 401 แบบ "ไม่พูดอะไรสักคำ" → ใน log เห็นแค่ booted/shutdown
    //   แยกไม่ออกเลยว่า "LINE ไม่เคยยิงมา" กับ "ยิงมาแล้วแต่ลายเซ็นไม่ผ่าน" ซึ่งแก้คนละวิธีกันคนละเรื่อง
    //   ⚠️ ห้าม log ตัว secret หรือลายเซ็นเต็มๆ — log แค่ "มีหัวลายเซ็นมาไหม / ยาวเท่าไหร่" ก็พอวินิจฉัยแล้ว
    if (!ok) {
      console.error('[line-webhook] 🛑 ลายเซ็นไม่ผ่าน — ปฏิเสธ (401) ไม่ได้ทำอะไรเลย'
        + ' · มีหัว x-line-signature ไหม: ' + (sig ? 'มี (' + sig.length + ' ตัวอักษร)' : 'ไม่มี')
        + ' · ขนาด body: ' + rawBody.length + ' ตัวอักษร'
        + ' · แปลว่าค่า LINE_CHANNEL_SECRET ไม่ตรงกับ channel นี้ (หรือมีช่องว่าง/ขึ้นบรรทัดใหม่ติดมาตอนตั้งค่า)');
      return new Response('invalid signature', { status: 401 });
    }
  }

  let payload;
  try { payload = JSON.parse(rawBody); } catch (e) {
    // 2026-08-01 เพิ่ม log ด้วยเหตุผลเดียวกับด้านบน — เดิมเงียบสนิท
    console.error('[line-webhook] 🛑 อ่าน JSON ที่ส่งมาไม่ได้ — ปฏิเสธ (400):', e && e.message ? e.message : e);
    return new Response('bad json', { status: 400 });
  }

  const supabase = createClient(Deno.env.get('SUPABASE_URL'), Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'));

  const RETIRED_CLASSROOM_POSTBACKS = new Set([
    'accept_offer', 'decline_offer', 'confirm_reschedule_move',
    'confirm_reschedule_pick', 'ack_teacher_cancel', 'confirm_cancel_delete',
  ]);
  for (const event of (payload.events || [])) {
    // 2026-07-20 加（Lin 要求：「聯繫學生」改成按了直接在同一個聊天視窗打字，不用再開網站）：
    // 以前這裡完全不理會純文字訊息，現在多接一種——如果老師剛按過「💬 聯繫學生」，
    // 接下來傳的第一句純文字就會被轉發給對應學生（見 handleTeacherTextMessage）。
    if (event.type === 'message' && event.message && event.message.type === 'text') {
      try {
        await handleTeacherTextMessage(supabase, channelToken, event);
      } catch (e) {
        console.error('[line-webhook] ⚠️ 處理文字訊息（聯繫學生轉發）發生未預期錯誤：', e && e.message ? e.message : e);
      }
      continue;
    }
    if (event.type !== 'postback') continue; // 其他類型（例如貼圖、圖片）還是先忽略
    let actionForLog = 'unknown'; // 2026-07-19 加：ให้ catch ครอบนอกสุดข้างล่างรู้ว่า action ไหนพังอยู่
    try {
      const data = event.postback && event.postback.data ? event.postback.data : '';
      const params = new URLSearchParams(data);
      const action = params.get('action');
      actionForLog = action || 'unknown';
      // Old LINE cards remain in chat history. Reply once, without request or Calendar access.
      if (RETIRED_CLASSROOM_POSTBACKS.has(action || '')) {
        if (channelToken && event.replyToken) {
          await replyLine(channelToken, event.replyToken,
            'ℹ️ 這顆舊的取消／改期按鈕已停用，沒有變更課表。請直接在 LINE 聯絡對方；需要調整時由老師到 Google Calendar 手動處理。');
        }
        continue;
      }
      // 🔴 2026-08-01 เพิ่ม log (เจอจริง: กดปุ่มแล้วเงียบสนิท ไล่หาสาเหตุไม่ได้)
      //   ปุ่มที่ระบบไม่รู้จักจะตกไปที่ท้ายสุด "ไม่ทำอะไรเลย" แบบเงียบๆ (ดูคอมเมนต์ท้าย loop)
      //   บรรทัดนี้ทำให้รู้ทันทีว่า "ปุ่มถูกกดจริง และชื่อปุ่มที่ส่งมาคืออะไร"
      console.log('[line-webhook] 📩 ได้รับการกดปุ่ม action=' + actionForLog + ' · data=' + String(data).slice(0, 200));

      // 2026-07-19 移除（Lin 確認過 LINE 裡已經沒有任何舊版 approve/deny 按鈕的訊息了）：
      // 原本這裡有 action==='approve'||'deny' 的舊版分支，是 2026-07-10 之前發送的按鈕，
      // 不會動 Google Calendar、也完全沒有身分驗證（誰都能按）。Lin 確認訊息已清空，安全移除。

      if (action === 'ack_teacher_add' || action === 'decline_add_class') {
        console.warn('[line-webhook] ℹ️ มีคนกดปุ่มเก่าในประวัติแชท (' + action + ') — ตอบข้อความอย่างเดียว ไม่ทำอะไรกับข้อมูล. request=', params.get('request'));
        if (channelToken && event.replyToken) {
          await replyLine(channelToken, event.replyToken,
            'ℹ️ 這顆按鈕已經停用了（這是以前的舊訊息）。\n' +
            '現在老師排課會直接排進課表，不需要你先按確認。\n' +
            '如果時間不方便，請直接在 LINE 跟老師說一聲。');
        }
        continue;
      }

      if (action === 'check_conflict') {
        // ── 2026-07-20 加（Lin 要求：申請加課的 LINE 卡片也要能直接查衝突，不用開網站）──
        // 只有老師能按（跟其他會碰 Calendar/資料庫的 postback 一樣，fail-closed 檢查身分）。
        const requestIdChk = params.get('request');
        // 🟡 2026-08-02 (ตรวจ 3 ระบบ ข้อ 4.17): เดิม `continue` เงียบสนิท ครูกดแล้วไม่มีอะไรตอบเลย
        //   แยกไม่ออกจาก "ระบบตายทั้งระบบ" — ท้าย loop มีตัวตอบ "ไม่รู้จักปุ่มนี้" อยู่แล้ว ตรงนี้ก็ต้องตอบเหมือนกัน
        if (!requestIdChk) {
          console.error('[line-webhook] ⚠️ check_conflict: ปุ่มไม่มีข้อมูลที่จำเป็นติดมา (ปุ่มเสียหาย/ข้อความเก่ามาก)');
          if (channelToken && event.replyToken) await replyLine(channelToken, event.replyToken, '⚠️ 這顆按鈕的資料不完整（沒有帶申請編號），沒有做任何動作。請到網站處理。');
          continue;
        }
        const teacherUserIdChk = Deno.env.get('LINE_TEACHER_USER_ID');
        const senderIsTeacherChk = event.source && teacherUserIdChk && event.source.userId === teacherUserIdChk;
        if (!senderIsTeacherChk) {
          console.error('[line-webhook] ⚠️ check_conflict: ผู้กดไม่ใช่ครู ถูกปฏิเสธ. request=', requestIdChk);
          // 🟡 2026-07-31 เพิ่ม (บั๊กแฝดข้อ 3 ฝั่งเพิ่มคาบ — ลอกจากก้อน confirm_cancel_delete):
          //   เดิมเงียบสนิท ไม่ตอบอะไรเลย → ถ้าค่า LINE_TEACHER_USER_ID ตั้งผิด หรือ Lin กดจากอีกบัญชี
          //   ปุ่มจะดูเหมือน "ตายสนิท" ไม่มีข้อความ ไม่มีเบาะแส หาสาเหตุยากมาก
          //   ตั้งใจไม่บอกว่าบัญชีไหนถึงจะถูก — คนที่ไม่ใช่ครูก็กดปุ่มนี้ได้ ไม่ควรใบ้อะไรเพิ่ม
          if (channelToken && event.replyToken) {
            await replyLine(channelToken, event.replyToken, '⚠️ 這個 LINE 帳號沒有老師權限，沒有執行任何動作。');
          }
          continue;
        }
        const { data: reqChk } = await supabase
          .from('classroom_requests')
          .select('requested_date,requested_time,proposed_end_time')
          .eq('id', requestIdChk)
          .maybeSingle();
        if (!reqChk || !reqChk.requested_date) {
          if (channelToken && event.replyToken) await replyLine(channelToken, event.replyToken, '⚠️ 找不到這筆申請的時間資料，請到網站確認');
          continue;
        }
        const startTimeChk = reqChk.requested_time || '00:00';
        const endTimeChk = reqChk.proposed_end_time || addOneHourTimeStr(startTimeChk);
        const startIsoChk = bangkokToIso(reqChk.requested_date, startTimeChk);
        const endIsoChk = bangkokToIso(reqChk.requested_date, endTimeChk);
        const fbResult = await checkFreebusyConflictService(startIsoChk, endIsoChk);
        if (channelToken && event.replyToken) {
          let msgChk;
          if (!fbResult.ok) {
            msgChk = '⚠️ 檢查失敗（' + (fbResult.reason || '未知') + (fbResult.detail ? '：' + fbResult.detail : '') + '），請到網站手動檢查';
          } else if (!fbResult.busy.length) {
            msgChk = '✅ 沒有衝突，' + reqChk.requested_date + ' ' + startTimeChk + '–' + endTimeChk + '（泰國時間）這個時段是空的';
          } else {
            msgChk = '⚠️ 這個時段跟其他行程重疊：\n' + fbResult.busy.map((b) => '・' + b.start + ' ~ ' + b.end).join('\n');
          }
          await replyLine(channelToken, event.replyToken, msgChk);
        }
        continue;
      }

      if (action === 'confirm_add_class') {
        // ── 2026-07-20 加（Lin 要求：確認新增 Calendar 要能從 LINE 直接按，跟 confirm_cancel_delete
        // 一鍵刪除同一套模式，只是這次是新增）── 前提（2026-07-19 已確認）：service account 的
        // OAuth scope 是完整的 https://www.googleapis.com/auth/calendar，不是唯讀也不是只能刪除，
        // 建立事件（POST .../events）本來就在同一個 scope 裡，不需要額外授權。
        const requestIdAddC = params.get('request');
        // 🟡 2026-08-02 (ตรวจ 3 ระบบ ข้อ 4.17): เดิม `continue` เงียบสนิท ครูกดแล้วไม่มีอะไรตอบเลย
        //   แยกไม่ออกจาก "ระบบตายทั้งระบบ" — ท้าย loop มีตัวตอบ "ไม่รู้จักปุ่มนี้" อยู่แล้ว ตรงนี้ก็ต้องตอบเหมือนกัน
        if (!requestIdAddC) {
          console.error('[line-webhook] ⚠️ confirm_add_class: ปุ่มไม่มีข้อมูลที่จำเป็นติดมา (ปุ่มเสียหาย/ข้อความเก่ามาก)');
          if (channelToken && event.replyToken) await replyLine(channelToken, event.replyToken, '⚠️ 這顆按鈕的資料不完整（沒有帶申請編號），沒有做任何動作。請到網站處理。');
          continue;
        }

        const teacherUserIdAddC = Deno.env.get('LINE_TEACHER_USER_ID');
        const senderIsTeacherAddC = event.source && teacherUserIdAddC && event.source.userId === teacherUserIdAddC;
        if (!senderIsTeacherAddC) {
          console.error('[line-webhook] ⚠️ confirm_add_class: ผู้กดไม่ใช่ครู ถูกปฏิเสธ. request=', requestIdAddC);
          // 🟡 2026-07-31 เพิ่ม (บั๊กแฝดข้อ 3 ฝั่งเพิ่มคาบ — ลอกจากก้อน confirm_cancel_delete):
          //   เดิมเงียบสนิท ไม่ตอบอะไรเลย ทำให้ปุ่มดูเหมือนตายสนิท หาสาเหตุยากมาก
          //   ตั้งใจไม่บอกว่าบัญชีไหนถึงจะถูก (ไม่ใบ้ให้คนนอก) — เหตุผลเดียวกับก้อนยกเลิก
          if (channelToken && event.replyToken) {
            await replyLine(channelToken, event.replyToken, '⚠️ 這個 LINE 帳號沒有老師權限，沒有執行任何動作。');
          }
          continue;
        }

        const { data: reqRowAddC, error: fetchErrAddC } = await supabase
          .from('classroom_requests')
          // 🗑️ 2026-07-31 (รอบ 4) เอา teacher_add_ack_at กับ initiated_by ออก — ไม่มีใครใช้แล้ว
          //    หลังลบด่าน "ต้องรอนักเรียนกดยอมรับ" ทิ้ง (ดูคอมเมนต์ 🗑️ ด้านล่าง)
          .select('token,status,requested_date,requested_time,proposed_end_time,proposed_recurring,proposed_until,proposed_weekday,student_name')
          .eq('id', requestIdAddC)
          .maybeSingle();

        if (fetchErrAddC || !reqRowAddC) {
          if (channelToken && event.replyToken) await replyLine(channelToken, event.replyToken, '⚠️ 找不到這筆申請了，請到網站確認');
          continue;
        }
        if (reqRowAddC.status === 'acknowledged') {
          if (channelToken && event.replyToken) await replyLine(channelToken, event.replyToken, 'ℹ️ 這筆已經處理過了');
          continue;
        }
        // 2026-07-20 再改（Lin 要求：學生自己申請的加課，老師按這顆就是最終批准，不用等學生
        // 再按一次「我知道了」）——只有「老師自己先提議時段」（initiated_by==='teacher'）才需要
        // 等 teacher_add_ack_at 這個關卡；學生自己申請的（initiated_by==='student'）跳過這關，
        // 直接往下走原子鎖＋建 Calendar。
        // 🗑️ 2026-07-31 (รอบ 4) ลบด่าน `initiated_by === 'teacher' && !teacher_add_ack_at` ทิ้ง
        //   เดิม: ถ้าครูเป็นคนเสนอเวลา ต้องรอนักเรียนกด「我知道了」ก่อนถึงจะสร้างคาบได้
        //   ตอนนี้ **ไม่มีอะไรในระบบตั้งค่า `teacher_add_ack_at` ได้อีกแล้ว** (ปุ่มฝั่งเว็บถูกลบ ปุ่มฝั่ง
        //   LINE เหลือแต่ข้อความ) → ถ้าปล่อยด่านนี้ไว้ แถวเก่าจะติดค้างตลอดกาล ครูกดยังไงก็ได้
        //   ข้อความ "รอนักเรียนกดยืนยัน" ที่ไม่มีวันเป็นจริง = หลอกครูเปล่าๆ
        //   และตรงกับกฎปัจจุบันอยู่แล้ว: ครูกดยืนยัน = ลงปฏิทินทันที ไม่ต้องรอนักเรียน (Lin สั่ง 2026-07-30)
        if (!reqRowAddC.requested_date || !reqRowAddC.requested_time) {
          if (channelToken && event.replyToken) await replyLine(channelToken, event.replyToken, '⚠️ 這筆申請缺少時間資料，請到網站手動處理');
          continue;
        }

        // ── 🔴 2026-07-31 เพิ่ม — ด่านกันวันย้อนหลัง (ข้อ #3 ในรายงานตรวจ) ──────────────
        // พังยังไงถ้าไม่มีด่านนี้: คำขอที่ค้างคิวข้ามวันหยุด วันที่ในนั้นกลายเป็นอดีตไปแล้ว
        //   ครูกดปุ่มเดียวใน LINE = สร้างคาบย้อนหลังทันที
        //   → ขัดกฎเหล็กที่ Lin สั่งไว้เอง และเขียนไว้ในโค้ดฝั่งเว็บแล้วที่ classroom/index.html
        //     ("ห้ามจัด/ย้าย/ตั้งคาบไปวันย้อนหลัง ทุกจุดในแอปนี้ ไม่มีปุ่มยกเว้น")
        //   ฝั่งเว็บกัน 2 ชั้นอยู่แล้ว (lockDateInputToFuture + assertNotPastDate) แต่ประตู LINE ไม่เคยมีเลย
        //
        // ทำไมเช็ค "ก่อน" แย่งล็อก: จะได้ไม่ต้องปลดล็อกคืน (หลักเดียวกับก้อน confirm_cancel_delete)
        // ทำไมไม่มีปุ่ม "ยืนยันอีกรอบแล้วผ่าน": กฎบอกว่าไม่มีข้อยกเว้น และการทำปุ่มผ่านต้องเก็บสถานะ
        //   "เคยเตือนแล้ว" ลงฐานข้อมูล = คอลัมน์ใหม่ + จุดพังใหม่ ไม่คุ้ม
        //   → ส่งไปทำที่เว็บแทน (ท่าเดียวกับที่ก้อนยกเลิกใช้ตอนเจอ "คาบถูกบันทึกเข้าเรียนแล้ว")
        const todayBkkAddC = extractBangkokDateStr(new Date().toISOString());
        if (todayBkkAddC && String(reqRowAddC.requested_date) < todayBkkAddC) {
          console.error('[line-webhook] ⚠️ confirm_add_class: วันที่ย้อนหลัง ถูกปฏิเสธ.',
            'requested=', reqRowAddC.requested_date, 'today(BKK)=', todayBkkAddC, 'request=', requestIdAddC);
          if (channelToken && event.replyToken) {
            await replyLine(channelToken, event.replyToken,
              '🛑 這筆申請的日期（' + reqRowAddC.requested_date + '）已經過去了，沒有新增任何課堂。\n' +
              '今天是 ' + todayBkkAddC + '（泰國時間）。系統一律不排已經過去的課。\n' +
              '請跟學生約一個新的時間，或到網站處理：https://mrtaihualin.com/classroom/#req-row-' + requestIdAddC);
          }
          continue;
        }

        // ── 🟠 2026-07-31 (รอบ 4) เพิ่ม — ด่านตรวจชนปฏิทิน ────────────────────────────────
        // พังยังไงถ้าไม่มีด่านนี้: ครูกดปุ่มเดียวใน LINE = สร้างคาบทับคาบที่มีอยู่แล้วได้ทันที
        //   เงียบสนิท ไม่มีอะไรเตือน → นักเรียน 2 คนได้เวลาเดียวกัน รู้ตัวอีกทีตอนถึงคาบ
        //   ฝั่งเว็บมีด่านนี้มาตลอด (classroom/index.html → checkFreebusyConflict + buildRowOccurrences)
        //   แต่ประตู LINE ไม่เคยมีเลย — ปุ่ม 🔍 檢查是否衝突 มีไว้ให้ "กดเช็คเอง" เท่านั้น ไม่ได้บังคับ
        //
        // ✅ ยืนยันแล้ว 2026-07-31 ว่าปฏิทินที่ตรวจตรงนี้ (GOOGLE_CALENDAR_ID) เป็นใบเดียวกับที่เว็บใช้
        //    (primary) — พิสูจน์จากของจริง: คาบที่ปุ่มนี้สร้าง (description = 系統自動建立（LINE 確認新增）
        //    ซึ่งมีที่เดียวในระบบที่เขียนได้ คือบรรทัด ~1415 ในไฟล์นี้) ไปโผล่ใน primary จริง
        //    ⚠️ ถ้าวันไหนมีคนเปลี่ยนค่า secret GOOGLE_CALENDAR_ID ต้องพิสูจน์ซ้ำ ไม่งั้นด่านนี้กลายเป็น
        //       "ด่านหลอก" (ตรวจแล้วไม่เจออะไรเลยทุกครั้ง) ซึ่งแย่กว่าไม่มีด่าน
        //
        // ทำไมเช็ค "ก่อน" แย่งล็อก: จะได้ไม่ต้องปลดล็อกคืน (หลักเดียวกับด่านกันวันย้อนหลังข้างบน)
        // ทำไมเช็คไม่ได้ = ไม่ให้ผ่าน (fail-closed): "เช็คไม่ได้" ต้องแปลว่า "ไม่อนุญาต" เสมอ
        //   ถ้าปล่อยผ่านตอน Google ล่ม = ด่านจะหายไปเงียบๆ ตอนที่ต้องการมันที่สุด (ผิดกฎ RELIABILITY FIRST)
        //   ฝั่งเว็บก็ทำแบบเดียวกัน (checkFreebusyConflict โยน error ออกมา ไม่ปล่อยผ่าน)
        // ทำไมไม่มีปุ่ม "ยืนยันอีกรอบแล้วผ่าน": ต้องเก็บสถานะ "เคยเตือนแล้ว" ลงฐานข้อมูล = คอลัมน์ใหม่
        //   + จุดพังใหม่ และกฎที่ Lin ตั้งไว้บอกว่าด่านจัดคาบไม่มีข้อยกเว้น → ส่งไปทำที่เว็บแทน
        //
        // คาบทุกสัปดาห์: ยิง Google "ครั้งเดียว" ครอบทั้งช่วง แล้วเอาช่วงไม่ว่างมาเทียบทีละสัปดาห์เอง
        //   (ท่าเดียวกับฝั่งเว็บเป๊ะ) · ไม่ใส่ 固定到 = ไม่มีวันจบ → เช็คไปข้างหน้า 12 สัปดาห์ แล้วบอกครูตรงๆ
        const RECURRING_CHECK_MAX_WEEKS_ADDC = 12; // ตรงกับ RECURRING_CHECK_MAX_WEEKS ฝั่งเว็บ
        const startTimeChkAddC = reqRowAddC.requested_time;
        const endTimeChkAddC = reqRowAddC.proposed_end_time || addOneHourTimeStr(startTimeChkAddC);

        // 🔴 2026-07-31 (รอบ 4) แก้: ต้องครอบ try/catch — `bangkokToIso` ปิดท้ายด้วย .toISOString()
        //    ซึ่ง **โยน error ทิ้ง** เมื่อเจอวันที่/เวลาที่แปลงไม่ได้ (ไม่ได้คืนค่า NaN อย่างที่เคยเข้าใจ)
        //    เคสจริงที่เกิดได้: `proposed_end_time` เป็นคอลัมน์ text ถ้ามีค่าติดวินาทีมา ("21:00:00")
        //    จะได้สตริงเพี้ยน "...T21:00:00:00+07:00" → โยน error → หลุดไปโดนตัวดักรวมด้านนอก
        //    ครูจะเห็นแค่ "系統發生未預期錯誤" ซึ่งไม่บอกอะไรเลย
        //    → ดักตรงนี้เอง แล้วบอกสาเหตุจริงๆ (ยังอยู่ก่อนแย่งล็อก ไม่มีอะไรต้องปลดคืน)
        let firstStartMsAddC = NaN;
        let firstEndMsAddC = NaN;
        let untilMsAddC = null;
        let timeParseErrAddC = '';
        try {
          firstStartMsAddC = new Date(bangkokToIso(reqRowAddC.requested_date, startTimeChkAddC)).getTime();
          firstEndMsAddC = new Date(bangkokToIso(reqRowAddC.requested_date, endTimeChkAddC)).getTime();
          if (reqRowAddC.proposed_recurring && reqRowAddC.proposed_until) {
            // 🟡 แปลงวันจบไม่ได้ = ห้ามเดา ห้ามข้าม — ถ้าข้าม จะไปเช็คเต็ม 12 สัปดาห์เลยวันจบจริง
            //    แล้วอาจ "เจอชน" ในสัปดาห์ที่คอร์สจบไปแล้ว = บล็อกคาบที่ไม่ควรถูกบล็อก โดยไม่มีคำอธิบาย
            untilMsAddC = new Date(bangkokToIso(reqRowAddC.proposed_until, '23:59')).getTime();
            if (!isFinite(untilMsAddC)) throw new Error('อ่านวันสิ้นสุด (固定到) ไม่ได้: ' + reqRowAddC.proposed_until);
          }
        } catch (eTimeAddC) {
          timeParseErrAddC = (eTimeAddC && eTimeAddC.message) ? eTimeAddC.message : String(eTimeAddC);
        }

        // เวลาไม่สมเหตุสมผล = หยุดตรงนี้ ไม่ปล่อยไปสร้าง (เคสจริงที่เจอได้: คาบ 23:00 → addOneHourTimeStr
        // คืน "00:00" ของ "วันเดียวกัน" เพราะหาร 24 → เวลาจบมาก่อนเวลาเริ่ม · ปล่อยไปต่อ Google จะตอบ 400
        // แล้วครูจะเห็นแค่ error ดิบๆ ไม่รู้สาเหตุ — ดักตรงนี้แล้วบอกตรงๆ ดีกว่า)
        if (timeParseErrAddC || !isFinite(firstStartMsAddC) || !isFinite(firstEndMsAddC) || firstEndMsAddC <= firstStartMsAddC) {
          console.error('[line-webhook] ⚠️ confirm_add_class: เวลาไม่สมเหตุสมผล ถูกปฏิเสธ.',
            'date=', reqRowAddC.requested_date, 'start=', startTimeChkAddC, 'end=', endTimeChkAddC, 'request=', requestIdAddC);
          if (channelToken && event.replyToken) {
            await replyLine(channelToken, event.replyToken,
              '🛑 這筆申請的時間怪怪的（' + reqRowAddC.requested_date + ' ' + startTimeChkAddC + '–' + endTimeChkAddC + '），沒有新增任何課堂。\n' +
              (timeParseErrAddC ? ('原因：' + timeParseErrAddC + '\n') : '結束時間沒有比開始時間晚。\n') +
              '請到網站處理：https://mrtaihualin.com/classroom/#req-row-' + requestIdAddC);
          }
          continue;
        }

        // ── 🟠 2026-08-01 เพิ่ม (ตรวจระบบยกเลิก/เพิ่มคาบ ข้อ 7) — ห้ามลงคาบย้อนหลัง "ระดับชั่วโมง" ──
        // ด่านข้างบนเทียบแค่ "สตริงวันที่" (requested_date < todayBkk) → รูที่เหลือคือ **วันนี้ แต่เวลาผ่านไปแล้ว**
        // เคสจริง: นักเรียนขอคาบ "วันนี้ 09:00" ไว้ตั้งแต่เมื่อคืน ครูเปิด LINE ตอน 20:00 แล้วกดยืนยัน
        //   → ด่านวันที่ผ่าน (วันนี้ = วันนี้) → สร้างคาบในปฏิทินที่ผ่านไปแล้ว
        //   → ตรวจชนก็ไม่เจออะไร (เวลาผ่านไปแล้ว ว่างอยู่แล้ว) → นักเรียนได้ LINE ว่า "จัดคาบให้แล้ว"
        // เส้นทาง "ย้ายคาบ" ในไฟล์นี้กันระดับชั่วโมงมาตั้งแต่ต้น (if (newStartMs <= Date.now()))
        //   เส้นทาง "เพิ่มคาบ" ไม่เคยมี — ตอนนี้ใช้เกณฑ์เดียวกันแล้วทั้งไฟล์
        // วางตรงนี้เพราะ firstStartMsAddC ผ่านการตรวจว่าอ่านค่าได้จริงมาแล้ว และยังอยู่ **ก่อนแย่งล็อก**
        //   จึงไม่มีอะไรต้องปลดคืน (หลักเดียวกับ 2 ด่านข้างบน)
        // ⚠️ ยกเว้น "คาบทุกสัปดาห์" (ตรวจซ้ำ 2026-08-01): ชุดคาบประจำที่เริ่ม "วันนี้ แต่เวลาผ่านไปแล้ว"
        //    เป็นการตั้งชุดคาบปกติ ครั้งถัดไป (+7 วัน) เป็นอนาคตทั้งหมด ของเดิมทำได้มาตลอด
        //    ถ้าบล็อกด้วย จะกลายเป็นห้าม Lin ตั้งคาบประจำตอนเย็นโดยไม่มีเหตุผล = พังของที่เคยใช้ได้
        //    (ด่านระดับ "วัน" ยังกันวันย้อนหลังของชุดคาบประจำอยู่เหมือนเดิม ไม่ได้หายไปไหน)
        if (!reqRowAddC.proposed_recurring && firstStartMsAddC <= Date.now()) {
          console.error('[line-webhook] ⚠️ confirm_add_class: เวลาย้อนหลัง (วันนี้แต่เวลาผ่านไปแล้ว) ถูกปฏิเสธ.',
            'date=', reqRowAddC.requested_date, 'start=', startTimeChkAddC, 'request=', requestIdAddC);
          if (channelToken && event.replyToken) {
            await replyLine(channelToken, event.replyToken,
              '🛑 這個時間（' + reqRowAddC.requested_date + ' ' + startTimeChkAddC + ' 泰國時間）已經過去了，沒有新增任何課堂。\n' +
              '系統一律不排已經過去的時間。請跟學生約一個新的時間，或到網站處理：\n' +
              'https://mrtaihualin.com/classroom/#req-row-' + requestIdAddC);
          }
          continue;
        }

        const occsAddC = [];
        if (reqRowAddC.proposed_recurring) {
          // ใช้ untilMsAddC ที่แปลงไว้แล้วข้างบน ห้ามแปลงใหม่ (สูตร 2 ชุด = วันไหนแก้ชุดเดียวก็เพี้ยน)
          const durMsAddC = firstEndMsAddC - firstStartMsAddC;
          for (let k = 0; k < RECURRING_CHECK_MAX_WEEKS_ADDC; k++) {
            const sMs = firstStartMsAddC + k * 7 * 24 * 60 * 60 * 1000;
            if (untilMsAddC !== null && sMs > untilMsAddC) break; // แปลงไม่ได้ถูกตีกลับไปแล้วข้างบน
            occsAddC.push({ start: sMs, end: sMs + durMsAddC });
          }
        }
        // กันพังแบบไม่คาดคิด: ถ้าไม่ได้สักครั้ง ถอยไปเช็คครั้งเดียว (ท่าเดียวกับ buildRowOccurrences ฝั่งเว็บ)
        if (!occsAddC.length) occsAddC.push({ start: firstStartMsAddC, end: firstEndMsAddC });

        const fbAddC = await checkFreebusyConflictService(
          new Date(occsAddC[0].start).toISOString(),
          new Date(occsAddC[occsAddC.length - 1].end).toISOString(),
        );

        if (!fbAddC.ok) {
          console.error('[line-webhook] ⚠️ confirm_add_class: ตรวจชนปฏิทินไม่สำเร็จ ถูกปฏิเสธ (fail-closed):',
            fbAddC.reason, fbAddC.detail || '', 'request=', requestIdAddC);
          if (channelToken && event.replyToken) {
            await replyLine(channelToken, event.replyToken,
              '🛑 沒辦法檢查行事曆有沒有衝突（' + (fbAddC.reason || '未知') + '），所以這次沒有新增任何課堂。\n' +
              '「檢查不了」一律當成「不可以排」，避免不小心排到已經有課的時段。\n' +
              '請稍後再按一次，或到網站處理：https://mrtaihualin.com/classroom/#req-row-' + requestIdAddC);
          }
          continue;
        }

        // 🟡 2026-07-31 (รอบ 4) แก้: นับ "ครั้งที่ชน" แบบไม่ซ้ำ
        //   เดิมเก็บทุกคู่ (สัปดาห์ × ช่วงไม่ว่าง) → คาบประจำ 1 ชุดที่ชนกับคาบประจำอีกชุด
        //   จะได้ 12 รายการ แล้วขึ้นว่า "…還有 7 筆" ทั้งที่จริงๆ ชนอยู่ชุดเดียว = ทำให้ครูตกใจเกินจริง
        //   → รวมตามสัปดาห์ที่ชน (1 สัปดาห์นับ 1 ครั้ง) แล้วบอกจำนวนสัปดาห์ที่ชนตรงๆ
        const hitWeeksAddC = new Map();
        for (const ocAddC of occsAddC) {
          for (const bAddC of (fbAddC.busy || [])) {
            const bStart = new Date(bAddC.start).getTime();
            const bEnd = new Date(bAddC.end).getTime();
            // ทับกันจริงเมื่อ "เริ่มก่อนที่เราจบ" และ "จบหลังที่เราเริ่ม" (ชนขอบพอดีไม่นับว่าทับ)
            if (bStart < ocAddC.end && bEnd > ocAddC.start && !hitWeeksAddC.has(ocAddC.start)) {
              hitWeeksAddC.set(ocAddC.start, bAddC);
            }
          }
        }

        if (hitWeeksAddC.size) {
          console.error('[line-webhook] ⚠️ confirm_add_class: ชนกับคาบอื่น ถูกปฏิเสธ. ชน', hitWeeksAddC.size,
            'สัปดาห์ จากทั้งหมด', occsAddC.length, 'request=', requestIdAddC);
          if (channelToken && event.replyToken) {
            // โชว์แค่ 5 บรรทัดแรก — ข้อความ LINE ยาวเกินจะถูกตัด แล้วบรรทัดสำคัญจะหลุดหาย
            const entriesAddC = Array.from(hitWeeksAddC.entries());
            const listAddC = entriesAddC.slice(0, 5).map(([ocStart, bHit]) =>
              '・' + (formatIsoInTz(new Date(ocStart).toISOString(), 'Asia/Bangkok') || new Date(ocStart).toISOString())
              + ' ← 撞到 ' + (formatIsoInTz(bHit.start, 'Asia/Bangkok') || bHit.start)
              + ' – ' + (formatIsoInTz(bHit.end, 'Asia/Bangkok') || bHit.end)).join('\n');
            await replyLine(channelToken, event.replyToken,
              '🛑 這個時段跟行事曆上已經有的課／行程撞到了，沒有新增任何課堂（泰國時間）：\n' + listAddC +
              (entriesAddC.length > 5 ? '\n・…還有 ' + (entriesAddC.length - 5) + ' 週也撞到' : '') +
              '\n\n請跟學生換一個時間，或到網站處理：https://mrtaihualin.com/classroom/#req-row-' + requestIdAddC);
          }
          continue;
        }

        // 🔎 คาบทุกสัปดาห์ที่ไม่มีวันจบ = เช็คได้แค่ 12 สัปดาห์แรก ต้องบอกครูตรงๆ ห้ามให้เข้าใจผิดว่าเช็คครบ
        //    (ถ้า 固定到 อยู่ในช่วงที่เช็คไปแล้ว = เช็คครบจริง ห้ามเตือนหลอกให้ครูตกใจฟรี)
        let weeksNoteAddC = '';
        if (reqRowAddC.proposed_recurring) {
          const lastOccMsAddC = occsAddC[occsAddC.length - 1].start;
          // ใช้ untilMsAddC ตัวเดียวกับที่ด่านตรวจชนใช้ ห้ามแปลงใหม่ (สูตร 2 ชุด = เพี้ยนได้)
          const checkedAllAddC = untilMsAddC !== null
            && (lastOccMsAddC + 7 * 24 * 60 * 60 * 1000 > untilMsAddC);
          weeksNoteAddC = checkedAllAddC
            ? '\n（已逐週檢查 ' + occsAddC.length + ' 堂，全部沒撞到）'
            : '\n（已逐週檢查最近 ' + occsAddC.length + ' 堂，更久以後的還沒檢查，請自己留意）';
        }

        // ── 原子鎖：跟 confirm_cancel_delete 同一個欄位、同一套語意，防止跟網站同時搶著新增 ──
        // 🛑 2026-07-31 ตัดสินใจ "ไม่" ใส่กฎล็อกหมดอายุ 10 นาทีตรงนี้ (เคยใส่แล้วถอนออก — อ่านก่อนแก้)
        //
        //   ตอนแรกตั้งใจลอกกฎ "ล็อกเก่ากว่า 10 นาที = แย่งใหม่ได้" มาจากก้อน confirm_cancel_delete
        //   แต่ตรวจซ้ำแล้วพบว่า **มันจะทำลายด่านกันสร้างคาบซ้ำ 3 จุดในก้อนนี้เอง**:
        //     (1) createCalendarEventById ตอบ eventCreatedButUnverified — คาบอาจถูกสร้างไปแล้ว
        //     (2) Calendar สร้างสำเร็จ แต่เขียนตารางไม่สำเร็จ
        //     (3) Calendar + ตาราง สำเร็จ แต่อัปเดตสถานะคำขอไม่สำเร็จ
        //   ทั้ง 3 จุด **จงใจ** ไม่ปลดล็อก (อ่านคอมเมนต์ที่จุดนั้นๆ ได้) เพื่อไม่ให้มีใครกดซ้ำแล้วสร้างคาบซ้อน
        //   ถ้าใส่กฎ 10 นาที = พอครบ 10 นาทีล็อกพวกนี้จะถูกปลดเอง แล้วกดซ้ำได้ = สร้างคาบซ้ำจริง
        //   (จุดที่ตั้งใจกันไว้ กลายเป็นช่องโหว่แทน)
        //
        //   ปัญหา "ล็อกค้างเพราะเน็ตหลุด" ที่กฎ 10 นาทีตั้งใจแก้ ตอนนี้มีทางแก้อยู่แล้ว และดีกว่าด้วย:
        //     ปุ่ม 🔓 解鎖這筆 บนการ์ดคิวฝั่งเว็บ (classroom/index.html → unlockStuckRequest)
        //     ขึ้นให้กับคำขอทุกประเภทรวมทั้งเพิ่มคาบ เมื่อค้างเกิน 10 นาที
        //   → ให้ "คน" เป็นคนตัดสินว่าจะปลดเมื่อไหร่ ปลอดภัยกว่าให้ระบบปลดเองแล้วสร้างคาบซ้ำ
        //
        //   ✅ ฝั่งเว็บของ "เพิ่มคาบ" ใช้กฎเข้มเดียวกันนี้แล้ว (classroom/index.html → claimAddClassRequest)
        //      ตอนแรกแก้แต่ฝั่งนี้ แล้วลืมว่าฝั่งเว็บยังใช้ claimRequestForProcessing ที่แย่งล็อกได้
        //      = ล็อกที่ตรงนี้จงใจทิ้งไว้ ถูกเว็บแย่งไปสร้างคาบซ้ำได้หลัง 10 นาที (รูย้ายที่ ไม่ได้หาย)
        //      → สรุปกฎปัจจุบัน: **ยกเลิกคาบ = แย่งล็อกค้างได้ · เพิ่มคาบ = ห้ามแย่ง ต้องให้ครูกด 🔓 เอง**
        //        (ยกเลิกซ้ำ = คาบหายไปแล้ว ไม่มีอะไรเพิ่ม · เพิ่มซ้ำ = ได้คาบซ้อนกันจริงในปฏิทิน)
        //   ⚠️ ใครจะมาใส่กฎ 10 นาทีตรงนี้ในอนาคต ต้องหาวิธีแยกให้ได้ก่อนว่า "ล็อกค้างเพราะเน็ตหลุด"
        //      ต่างจาก "ล็อกที่จงใจค้างเพราะอาจแตะ Calendar ไปแล้ว" อย่างไร ไม่งั้นห้ามใส่
        //      และถ้าใส่ ต้องใส่ทั้ง 2 ฝั่งพร้อมกันเสมอ ห้ามแก้ฝั่งเดียว
        const { data: claimDataAddC, error: claimErrAddC, count: claimCountAddC } = await supabase
          .from('classroom_requests')
          .update({ processing_started_at: new Date().toISOString() }, { count: 'exact' })
          .eq('id', requestIdAddC)
          .eq('status', 'pending')
          .is('processing_started_at', null)
          .select('id');

        if (claimErrAddC) {
          console.error('[line-webhook] ⚠️ confirm_add_class: ล็อกก่อนสร้างพัง:', claimErrAddC.message, 'request=', requestIdAddC);
          if (channelToken && event.replyToken) await replyLine(channelToken, event.replyToken, '⚠️ 準備新增失敗：' + claimErrAddC.message + '\n還沒建立 Calendar');
          continue;
        }
        if (!claimCountAddC) {
          if (channelToken && event.replyToken) await replyLine(channelToken, event.replyToken, 'ℹ️ 這筆已經在別的地方處理中或處理完了');
          continue;
        }

        // 🔴 2026-07-31 (รอบ 4): ใช้ค่าเดียวกับที่ด่านตรวจชนใช้ ห้ามคำนวณใหม่
        //   ถ้าคำนวณใหม่ = มีสูตรเวลา 2 ชุดในก้อนเดียวกัน วันไหนแก้ชุดเดียวจะกลายเป็น
        //   "ตรวจชนเวลาหนึ่ง แต่สร้างจริงอีกเวลาหนึ่ง" = ด่านตรวจชนไร้ความหมายทันที
        const startTimeAddC = startTimeChkAddC;
        const endTimeAddC = endTimeChkAddC;
        const evBodyAddC = {
          summary: reqRowAddC.student_name || '-',
          colorId: '6', // 跟網站端 createCalendarClassEventForStudent 同一色（Tangerine），2026-07-15 就對過了
          description: '系統自動建立（LINE 確認新增）',
          start: { dateTime: bangkokToIso(reqRowAddC.requested_date, startTimeAddC), timeZone: 'Asia/Bangkok' },
          end: { dateTime: bangkokToIso(reqRowAddC.requested_date, endTimeAddC), timeZone: 'Asia/Bangkok' },
        };
        if (reqRowAddC.proposed_recurring) {
          let rule = 'RRULE:FREQ=WEEKLY';
          if (reqRowAddC.proposed_until) rule += ';UNTIL=' + buildIcalUntilUtcSimple(reqRowAddC.proposed_until);
          evBodyAddC.recurrence = [rule];
        }

        const createResultAddC = await createCalendarEventById(evBodyAddC);
        if (!createResultAddC.ok) {
          console.error('[line-webhook] ⚠️ confirm_add_class 建立 Calendar 失敗:', JSON.stringify(createResultAddC), 'request=', requestIdAddC);
          if (createResultAddC.eventCreatedButUnverified) {
            // 可能已經建立但驗證失敗——不敢放鎖讓人重按（可能造成重複事件），請 Lin 手動檢查
            if (channelToken && event.replyToken) await replyLine(channelToken, event.replyToken, '⚠️ Calendar 可能已經建立但無法確認狀態，請直接到 Google Calendar／Supabase 手動檢查這筆（id: ' + requestIdAddC + '），先不要重複點這顆按鈕');
            continue;
          }
          // API 呼叫本身就失敗，還沒有真的建立任何東西 → 放鎖讓之後可以重試
          const { error: unlockErrAddC } = await supabase.from('classroom_requests').update({ processing_started_at: null }).eq('id', requestIdAddC);
          if (unlockErrAddC) console.error('[line-webhook] ⚠️ confirm_add_class: 解鎖失敗:', unlockErrAddC.message, 'request=', requestIdAddC);
          if (channelToken && event.replyToken) {
            await replyLine(channelToken, event.replyToken, '⚠️ 新增 Calendar 失敗（可以重新點一次，或到網站手動處理）\n原因：' + (createResultAddC.reason || '未知') + (createResultAddC.detail ? '\n' + createResultAddC.detail : ''));
          }
          continue;
        }

        // ════════════════════════════════════════════════════════════════════════════
        // 🟡 2026-07-31 (รอบ 4) เพิ่ม — สำรอง "การเพิ่มคาบจาก LINE" ไว้ให้กดคืนค่าได้
        //
        // เดิมไม่สมมาตร: เพิ่มคาบจาก "เว็บ" มีปุ่ม ↩️ 復原 (ทำไปแล้ววันนี้ classroom/index.html
        //   บรรทัด ~2424 `backupCalendarEvent(null, token, 'create', ev, null)`)
        //   แต่เพิ่มจาก "ปุ่มใน LINE" ไม่มีอะไรเลย → กดผิดต้องเปิด Google Calendar ไปลบเอง
        //   + ต้องไปลบแถวตารางเรียนเองอีกที่ ไม่งั้นหน้าเว็บนักเรียนยังโชว์คาบนั้นอยู่
        //
        // ✅ ทำได้แล้วเพราะยืนยัน 2026-07-31 ว่า GOOGLE_CALENDAR_ID (ที่ตรงนี้สร้าง) กับ primary
        //    (ที่ปุ่ม ↩️ 復原 ฝั่งเว็บสั่งลบ) เป็นปฏิทินใบเดียวกันจริง — ถ้าคนละใบ ปุ่มคืนค่าจะลบไม่ได้
        //
        // ⚠️ ห้ามให้ขั้นนี้ล้มแล้วหยุดทั้งงาน (ต่างจากตอนลบ/ย้าย ที่สำรองพัง = ต้องหยุดทันที)
        //    เพราะคาบถูกสร้างขึ้นจริงไปแล้วก่อนถึงบรรทัดนี้ — ถ้าหยุดแล้วตอบว่าไม่สำเร็จ ครูจะกดซ้ำ
        //    = ได้คาบซ้อนกัน 2 คาบจริง (หลักเดียวกับฝั่งเว็บเป๊ะ)
        //    → สำรองไม่สำเร็จก็ไปต่อ แต่ต้อง (1) เตือนดังๆ ใน console (2) บอกครูในข้อความตอบกลับ
        //      ว่าคาบนี้จะไม่มีปุ่มคืนค่า ห้ามเงียบ (กฎ RELIABILITY FIRST ข้อ 1)
        // ════════════════════════════════════════════════════════════════════════════
        let backupWarnAddC = '';
        try {
          const evForBackupAddC = createResultAddC.event || Object.assign({ id: createResultAddC.eventId }, evBodyAddC);
          const oldStartAddC = (evForBackupAddC.start && (evForBackupAddC.start.dateTime || evForBackupAddC.start.date))
            || bangkokToIso(reqRowAddC.requested_date, startTimeAddC);
          const { data: bkDataAddC, error: bkErrAddC } = await supabase
            .from('classroom_calendar_backups')
            .insert({
              request_id: requestIdAddC,
              token: reqRowAddC.token || null,
              action: 'create',
              old_event_id: createResultAddC.eventId,
              new_event_id: null,   // ฝั่งเว็บใส่ null สำหรับ action='create' เหมือนกัน (มีแต่ move ที่ใส่)
              old_event_json: evForBackupAddC,
              old_start: oldStartAddC,
              new_start: null,
            })
            .select()
            .maybeSingle();
          if (bkErrAddC || !bkDataAddC) {
            const whyBkAddC = bkErrAddC ? bkErrAddC.message : 'ไม่ได้ข้อมูลกลับมา';
            console.error('[line-webhook] ⚠️ confirm_add_class: เพิ่มคาบสำเร็จ แต่บันทึกข้อมูลสำรองไม่สำเร็จ '
              + '(คาบนี้จะไม่มีปุ่ม ↩️ 復原 ให้กด):', whyBkAddC, 'request=', requestIdAddC, 'calendar_event_id=', createResultAddC.eventId);
            backupWarnAddC = '\n⚠️ 這堂課沒有存到「可復原」的紀錄（' + whyBkAddC + '），\n'
              + '如果加錯了，要自己到 Google Calendar 刪掉。';
          }
        } catch (bkCatchAddC) {
          const whyBkCatchAddC = (bkCatchAddC && bkCatchAddC.message) ? bkCatchAddC.message : String(bkCatchAddC);
          console.error('[line-webhook] ⚠️ confirm_add_class: บันทึกข้อมูลสำรองพังกลางคัน (คาบยังอยู่ครบ):',
            whyBkCatchAddC, 'request=', requestIdAddC, 'calendar_event_id=', createResultAddC.eventId);
          backupWarnAddC = '\n⚠️ 這堂課沒有存到「可復原」的紀錄（' + whyBkCatchAddC + '），\n'
            + '如果加錯了，要自己到 Google Calendar 刪掉。';
        }

        // Calendar 建立成功——寫進課表資料庫（recurring_days 或 schedule，看是不是每週固定）
        let dbErrAddC = null;
        if (reqRowAddC.proposed_recurring) {
          // ✅ 2026-07-26 (Lin สั่ง: ต้องขึ้นได้ทั้ง Calendar และระบบ) — แก้แบบเดียวกับฝั่งเว็บ
          // (classroom/index.html → createCalendarClassEventForStudent)
          // เดิมชนกันที่ (token, weekday) = นักเรียน 1 คน มีคาบประจำได้วันละ 1 รอบเวลาเท่านั้น
          // → เพิ่มพุธ 19:00 ให้คนที่มีพุธ 10:00 อยู่แล้ว = แถวพุธ 10:00 โดนทับหาย
          //   คาบ 10:00 ยังอยู่ใน Calendar แต่ระบบจำ calendar_event_id ไม่ได้แล้ว = คาบกำพร้า
          // ⚠️ ปุ่มนี้อยู่ในแอป LINE — คนละเส้นทางกับปุ่มในเว็บ ต้องแก้ทั้ง 2 ที่ ไม่งั้นรูยังอยู่
          // ⚠️ ต้องรัน supabase/sql/2026-07-26_recurring_days_multi_slot.sql ก่อน
          //    ยังไม่ได้รัน → error 42P10 → ถอยไปใช้กฎเดิมอัตโนมัติ (ไม่พัง แต่ยังทับกันอยู่)
          // 2026-07-26 加：proposed_weekday อาจเป็นค่าว่างได้ (ตอนบันทึกรายละเอียดคำขอพลาดแบบเงียบๆ)
          // ถ้าปล่อยผ่าน จะได้แถวที่ weekday ว่าง = คาบประจำที่ไม่รู้ว่าวันไหน + ด่านเช็คซ้ำก็มองไม่เห็น
          // → คำนวณจากวันที่ที่ขอมาแทน (เวลาไทย) ยังว่างอีก = หยุด ไม่เขียนมั่ว
          // 2026-07-26 加：proposed_weekday อาจเป็นค่าว่างได้ (ตอนบันทึกรายละเอียดคำขอพลาดแบบเงียบๆ)
          // ถ้าปล่อยผ่าน จะได้แถวที่ weekday ว่าง = คาบประจำที่ไม่รู้ว่าวันไหน + ด่านเช็คซ้ำก็มองไม่เห็น
          // → คำนวณจากวันที่ที่ขอมาแทน (เวลาไทย) · ยังหาไม่ได้อีก = หยุด ไม่เขียนข้อมูลมั่ว
          let weekdayAddC = reqRowAddC.proposed_weekday;
          if (weekdayAddC === null || weekdayAddC === undefined) {
            const wdGuess = new Date(bangkokToIso(reqRowAddC.requested_date, startTimeAddC));
            if (!isNaN(wdGuess.getTime())) {
              const wdName = new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Bangkok', weekday: 'short' }).format(wdGuess);
              const wdIdx = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(wdName);
              weekdayAddC = wdIdx >= 0 ? wdIdx : null;
            } else {
              weekdayAddC = null;
            }
            console.warn('[line-webhook] proposed_weekday ว่าง → คำนวณใหม่จากวันที่ได้:', weekdayAddC, 'request=', requestIdAddC);
          }
          if (weekdayAddC === null || weekdayAddC === undefined) {
            dbErrAddC = { message: '這筆申請沒有記到「星期幾」，無法存成每週固定課（會變成不知道是哪一天的固定課）。Calendar 已建立，請到網站或 Supabase 手動補這筆。' };
          } else {
            const rdRowAddC = { token: reqRowAddC.token, weekday: weekdayAddC, start_time: startTimeAddC, end_time: endTimeAddC, calendar_event_id: createResultAddC.eventId };
            let { error } = await supabase.from('classroom_recurring_days')
              .upsert(rdRowAddC, { onConflict: 'token,weekday,start_time' });
            if (error && (error.code === '42P10' || /no unique or exclusion constraint/i.test(error.message || ''))) {
              // ⚠️ ยังไม่ได้รัน SQL → ฐานข้อมูลยังใช้กฎเดิม (วันละ 1 รอบเวลา)
              // ห้ามถอยไปใช้กฎเดิมเงียบๆ — กฎเดิมจะ "ทับ" แถวคาบเดิมหายแล้วขึ้นว่าสำเร็จ
              // = สร้างคาบกำพร้าซ้ำรอยบั๊กเดิมเป๊ะๆ (แก้แบบเดียวกับฝั่งเว็บ classroom/index.html)
              console.warn('[line-webhook] ยังไม่ได้รัน 2026-07-26_recurring_days_multi_slot.sql');
              // ⚠️ ห้ามกรองด้วย .neq() — แถวที่ start_time เป็นค่าว่าง (NULL) จะหลุดออกจากผลลัพธ์
              // (NULL <> 'x' ได้ผลเป็น NULL ไม่ใช่ true) → ด่านมองไม่เห็นแล้วปล่อยทับทิ้ง
              // → ดึงทุกแถวของวันนั้นมาเทียบเองแทน (เหมือนฝั่งเว็บ classroom/index.html)
              const dupAddC = await supabase.from('classroom_recurring_days').select('start_time')
                .eq('token', reqRowAddC.token).eq('weekday', weekdayAddC);
              const dupOtherAddC = (dupAddC.data || []).filter(
                (x) => String(x.start_time || '').slice(0, 5) !== String(startTimeAddC || '').slice(0, 5));
              if (dupAddC.error || dupOtherAddC.length) {
                error = { message: '這位學生同一個星期幾已經有另一個固定時段（'
                  + (dupOtherAddC.map((x) => x.start_time || '(空白)').join('、') || '讀取失敗')
                  + '），而資料庫還沒升級成「一天可以有多個固定時段」。硬寫下去會蓋掉舊的那筆，所以這次刻意沒寫。'
                  + '請先執行 supabase/sql/2026-07-26_recurring_days_multi_slot.sql' };
              } else {
                ({ error } = await supabase.from('classroom_recurring_days').upsert(rdRowAddC, { onConflict: 'token,weekday' }));
              }
            }
            dbErrAddC = error;
          }
        } else {
          const { error } = await supabase.from('classroom_schedule')
            .upsert({ token: reqRowAddC.token, lesson_date: reqRowAddC.requested_date, start_time: startTimeAddC, end_time: endTimeAddC, title: reqRowAddC.student_name, calendar_event_id: createResultAddC.eventId }, { onConflict: 'token,lesson_date,start_time' });
          dbErrAddC = error;
        }
        if (dbErrAddC) {
          // Calendar 已經真的建立成功了——故意不放鎖（避免有人再按一次造成重複建立事件），
          // 要 Lin 自己去 Supabase 手動補課表資料
          console.error('[line-webhook] ⚠️ confirm_add_class: Calendar 建立成功但寫課表資料庫失敗（鎖故意維持鎖住）:', dbErrAddC.message, 'request=', requestIdAddC, 'calendar_event_id=', createResultAddC.eventId);
          if (channelToken && event.replyToken) {
            // 2026-07-26 แก้：เดิมข้อความตอบกลับไม่บอกสาเหตุเลย ครูที่กดจาก LINE จะไม่มีทางรู้ว่า
            // เกิดอะไรขึ้น (โดยเฉพาะเคส "ยังไม่ได้รัน SQL" ที่มีวิธีแก้ชัดเจนอยู่ในข้อความ)
            // 🟡 2026-07-31 (รอบ 4) เติมทางออก: ตอนนี้มีแถวสำรองแล้ว → ถ้าไม่อยากแก้มือ กดปุ่มคืนค่าลบทิ้งได้
            await replyLine(channelToken, event.replyToken, '⚠️ Calendar 已經建立成功了（事件 ID: ' + createResultAddC.eventId + '），但存課表資料庫失敗，請直接到 Supabase 手動確認這筆（id: ' + requestIdAddC + '），不要重複點這顆按鈕\n\n原因：' + (dbErrAddC.message || '未知')
              // ⚠️ ชื่อหัวข้อต้องตรงกับที่ขึ้นบนเว็บจริง = 「↩️ 最近處理」(classroom/index.html)
              //    เขียนชื่อผิดครูจะหาไม่เจอแล้วคิดว่าไม่มีปุ่มนี้ (เคยเขียนผิดเป็น「📦 課堂備份」)
              + (backupWarnAddC ? backupWarnAddC : '\n\n💡 不想手動處理的話，可以到網站的「↩️ 最近處理」區塊按 ↩️ 復原，把剛剛這堂課直接刪掉重來。'));
          }
          continue;
        }

        // 全部成功——關單（跟 confirm_cancel_delete 一樣，狀態+解鎖同一個 atomic update）
        // 2026-07-20 加（稽核發現 🟠 ORANGE）：以前這裡只看 error，沒檢查真的改到幾筆——如果剛好
        // 更新 0 筆（例如這期間被別的動作搶先關掉了），會誤以為成功、鎖也沒真的解開/確認，
        // 卻完全沒有任何警告。加 count 檢查，0 筆一樣要大聲提醒。
        const { error: updErrAddC, count: updCountAddC } = await supabase
          .from('classroom_requests')
          .update({ status: 'acknowledged', processing_started_at: null }, { count: 'exact' })
          .eq('id', requestIdAddC)
          .eq('status', 'pending');

        if (updErrAddC || !updCountAddC) {
          console.error('[line-webhook] ⚠️ confirm_add_class: Calendar+課表都寫成功但更新申請狀態失敗（鎖故意維持鎖住）:', updErrAddC ? updErrAddC.message : '更新 0 筆', 'request=', requestIdAddC);
          if (channelToken && event.replyToken) {
            await replyLine(channelToken, event.replyToken, '⚠️ Calendar 已新增成功，但更新申請狀態失敗，請直接到 Supabase 手動確認這筆（id: ' + requestIdAddC + '）');
          }
          continue;
        }

        // 🔴 2026-07-31 แก้ (บั๊กแฝดข้อ 1 ฝั่งเพิ่มคาบ — ลอกทั้งชุดจากก้อน confirm_cancel_delete):
        //    เดิม: ตอบครูว่า「✅ 已新增 Calendar 課程，並通知學生了」ทันที
        //          แล้วค่อยส่งหานักเรียนทีหลัง ในกล่อง try/catch เปล่าๆ ที่กลืน error ทุกอย่าง
        //          และใช้ pushLine ตัวเก่าที่ไม่คืนผลอะไรเลย
        //    → นักเรียนที่ยังไม่ผูก LINE หรือ LINE ล่มชั่วคราว = ไม่ได้รับอะไรเลย
        //      แต่ครูเชื่อสนิทใจว่าแจ้งไปแล้ว (ผิดกฎ RELIABILITY FIRST: ห้ามขึ้นว่าสำเร็จถ้ายังไม่ตรวจ)
        //    ตอนนี้: ส่งก่อน → ค่อยตอบครูตามผลจริง · ใช้ pushLineChecked ที่เช็คผลได้
        //    ⚠️ replyToken ของ LINE ใช้ได้ครั้งเดียวต่อการกด 1 ครั้ง → ต้องรวมเป็นข้อความเดียว ห้ามยิง 2 รอบ
        let replyMsgAddC = '✅ 已新增 Calendar 課程，並通知學生了';
        try {
          if (!reqRowAddC.token) {
            replyMsgAddC = '✅ 已新增 Calendar 課程\n⚠️ 但這筆沒有記錄學生代碼，沒辦法通知學生，記得自己說一聲';
          } else if (!channelToken) {
            replyMsgAddC = '✅ 已新增 Calendar 課程\n⚠️ 但系統缺少 LINE 金鑰，沒通知到學生，記得自己說一聲';
          } else {
            const { data: stuRowAddC, error: stuErrAddC } = await supabase
              .from('classroom_students').select('line_user_id').eq('token', reqRowAddC.token).maybeSingle();
            if (stuErrAddC) {
              replyMsgAddC = '✅ 已新增 Calendar 課程\n⚠️ 但查不到學生資料（' + stuErrAddC.message + '），沒通知到學生，記得自己說一聲';
            } else if (!stuRowAddC || !stuRowAddC.line_user_id) {
              replyMsgAddC = '✅ 已新增 Calendar 課程\n⚠️ 但學生還沒連結 LINE，沒收到通知，記得自己說一聲';
            } else {
              // 2026-07-31 แก้ข้อความ 2 เรื่อง:
              //  (1) เส้นทางปกติตอนนี้คือ "ครูกดยืนยัน = ลงปฏิทินเลย" นักเรียนไม่ได้กดยืนยันอะไรมาก่อน
              //      ข้อความเดิม「你確認的加課」จึงไม่ตรงความจริง + ต้องบอกทางออกถ้าเวลานั้นไม่สะดวก
              //  (2) คาบทุกสัปดาห์: เดิมเขียนแค่「每週固定 20:00–21:00」ไม่บอกว่าวันไหน เริ่มเมื่อไหร่
              //      นักเรียนอ่านแล้วไม่รู้เลยว่าคือวันอะไร · และห้ามเรียกว่า「一堂課」เพราะเป็นทั้งชุด
              //      (ปุ่ม「申請取消課堂」ยกเลิกได้ทีละครั้ง ไม่ใช่ทั้งชุด → ต้องบอกให้ทักครูแทน)
              const isRecurAddC = !!reqRowAddC.proposed_recurring;
              const timeLabelAddC = isRecurAddC
                ? ('每週固定 ' + startTimeAddC + '–' + endTimeAddC + '（泰國時間，從 ' + reqRowAddC.requested_date + ' 開始）')
                : (reqRowAddC.requested_date + ' ' + startTimeAddC + '（泰國時間）');
              const pushResAddC = await pushLineChecked(channelToken, stuRowAddC.line_user_id,
                isRecurAddC
                  ? ('✅ 老師幫你排好固定課了：' + timeLabelAddC +
                     '\n已經加到課表了。如果這個時間不方便，請直接跟老師說一聲。')
                  : ('✅ 老師幫你排好一堂課：' + timeLabelAddC +
                     '\n這堂課已經加到課表了。如果那個時間不方便，請直接在 LINE 跟老師說一聲。'));
              if (!pushResAddC.ok) {
                console.error('[line-webhook] ⚠️ confirm_add_class: แจ้งนักเรียนไม่สำเร็จ:', pushResAddC.reason, 'request=', requestIdAddC);
                replyMsgAddC = '✅ 已新增 Calendar 課程\n⚠️ 但 LINE 通知學生失敗（' + pushResAddC.reason + '），請自己再跟學生說一聲';
              }
            }
          }
        } catch (e) {
          const whyNotifyAddC = (e && e.message) ? e.message : String(e);
          console.error('[line-webhook] ⚠️ confirm_add_class: แจ้งนักเรียนพังกลางคัน:', whyNotifyAddC, 'request=', requestIdAddC);
          replyMsgAddC = '✅ 已新增 Calendar 課程\n⚠️ 但通知學生時出錯（' + whyNotifyAddC + '），請自己再跟學生說一聲';
        }

        // 2026-07-31 加：ปุ่มนี้ไม่ได้เช็คโควตาคาบคงเหลือ (ฝั่งเว็บเช็ค) — ต้องบอกครูตรงๆ ห้ามให้เข้าใจผิด
        //   ไม่ย้ายสูตรคิดโควตามาไว้ที่นี่ เพราะจะกลายเป็นสูตร 2 ชุดที่ต้องแก้พร้อมกันตลอดไป
        replyMsgAddC += '\n（提醒：這顆按鈕沒有檢查剩餘堂數，要看的話請到網站加課）';

        // 🟠 2026-07-31 (รอบ 4): คาบทุกสัปดาห์ที่ไม่มีวันจบ ตรวจชนได้แค่ 12 สัปดาห์แรก
        //   ต้องบอกครูตรงๆ ห้ามให้เข้าใจผิดว่าตรวจครบตลอดกาล (ท่าเดียวกับฝั่งเว็บ)
        if (weeksNoteAddC) replyMsgAddC += weeksNoteAddC;

        // 🟡 2026-07-31 (รอบ 4): สำรองไม่สำเร็จ = ต้องบอกครูตรงๆ ห้ามเงียบ (ดูเหตุผลที่ก้อนสำรองด้านบน)
        if (backupWarnAddC) replyMsgAddC += backupWarnAddC;

        if (channelToken && event.replyToken) {
          await replyLine(channelToken, event.replyToken, replyMsgAddC);
        }
        continue;
      }

      if (action === 'start_contact_student') {
        // 2026-07-20 加（Lin 要求：所有「💬 聯繫學生」按鈕統一改成這個，取代原本開網站的
        // contactStudentDeepLink）：老師按下去，記住「接下來打的字要轉給這個學生」，
        // 實際轉發邏輯在 handleTeacherTextMessage（收到老師下一句純文字時處理）。
        const teacherUserIdContact = Deno.env.get('LINE_TEACHER_USER_ID');
        const senderIsTeacherContact = event.source && teacherUserIdContact && event.source.userId === teacherUserIdContact;
        if (!senderIsTeacherContact) {
          // 🟡 2026-07-31 เพิ่ม (งาน C13 ที่เหลือ — จุดนี้เดิมแย่สุด ไม่มีแม้แต่ log):
          //   เดิมเงียบสนิท ไม่ตอบอะไรเลย → ปุ่มจะดูเหมือน "ตายสนิท" ถ้า LINE_TEACHER_USER_ID ตั้งผิด
          console.error('[line-webhook] ⚠️ start_contact_student: ผู้กดไม่ใช่ครู ถูกปฏิเสธ. token=', params.get('token'));
          if (channelToken && event.replyToken) {
            await replyLine(channelToken, event.replyToken, '⚠️ 這個 LINE 帳號沒有老師權限，沒有執行任何動作。');
          }
          continue;
        }
        const contactToken = params.get('token');
        // 🟡 2026-08-02 (ตรวจ 3 ระบบ ข้อ 4.17): เดิม `continue` เงียบสนิท ครูกดแล้วไม่มีอะไรตอบเลย
        //   แยกไม่ออกจาก "ระบบตายทั้งระบบ" — ท้าย loop มีตัวตอบ "ไม่รู้จักปุ่มนี้" อยู่แล้ว ตรงนี้ก็ต้องตอบเหมือนกัน
        if (!contactToken) {
          console.error('[line-webhook] ⚠️ start_contact_student: ปุ่มไม่มีข้อมูลที่จำเป็นติดมา (ปุ่มเสียหาย/ข้อความเก่ามาก)');
          if (channelToken && event.replyToken) await replyLine(channelToken, event.replyToken, '⚠️ 這顆按鈕的資料不完整（沒有帶學生代碼），沒有做任何動作。請到網站處理。');
          continue;
        }
        const { data: stuRowContact } = await supabase.from('classroom_students').select('name').eq('token', contactToken).maybeSingle();
        const contactName = (stuRowContact && stuRowContact.name) || decodeURIComponent(params.get('name') || '') || '這位學生';
        const { error: pendingErr } = await supabase
          .from('line_pending_reply')
          .upsert({ id: 1, student_token: contactToken, student_name: contactName, set_at: new Date().toISOString() });
        if (pendingErr) {
          console.error('[line-webhook] ⚠️ start_contact_student：寫入 line_pending_reply 失敗（可能還沒建這張表，請確認 SQL 已執行）：', pendingErr.message);
          if (channelToken && event.replyToken) await replyLine(channelToken, event.replyToken, '⚠️ 系統還沒設定好聯繫學生功能，請到網站手動聯絡');
          continue;
        }
        if (channelToken && event.replyToken) {
          await replyLine(channelToken, event.replyToken, '好，請直接輸入要跟「' + contactName + '」說的話，我會馬上幫你轉過去（15 分鐘內有效）');
        }
        continue;
      }

      // action 未知的類型 → 忽略，不讓整個 webhook 掛掉
      // 🔴 2026-08-01 เพิ่ม log + ตอบกลับ (เจอจริง: ปุ่มเงียบสนิทหาสาเหตุไม่เจอ)
      //   เดิมมาถึงตรงนี้แล้วจบเงียบๆ ไม่มี log ไม่มีข้อความ = แยกไม่ออกจาก "ระบบไม่ได้ทำงานเลย"
      //   ผิดกฎ RELIABILITY FIRST ข้อ "ห้ามเงียบ" — ครูกดปุ่มแล้วต้องได้คำตอบเสมอ ไม่ว่าผลจะเป็นอะไร
      console.error('[line-webhook] ⚠️ ไม่รู้จักปุ่มนี้ (action=' + actionForLog + ') → ไม่ได้ทำอะไรเลย');
      if (channelToken && event.replyToken) {
        await replyLine(channelToken, event.replyToken, 'ℹ️ 系統不認得這顆按鈕（' + actionForLog + '），沒有做任何動作。可能是很舊的訊息，請到網站處理。');
      }
    } catch (e) {
      // 2026-07-19 加（稽核發現，RED#3）：以前這裡完全靜默——如果 Calendar 已經刪除成功，
      // 但後面存資料庫/回覆 LINE 那段忽然發生未預期的錯誤，老師畫面上什麼都不會看到，
      // 以為沒動作，其實 Calendar 可能已經被動過了。現在一定要留 log + 盡量推播提醒老師去網站確認。
      console.error('[line-webhook] ⚠️ 處理 postback 發生未預期錯誤 action=' + actionForLog + '：', e && e.message ? e.message : e);
      if (channelToken && event.replyToken) {
        await replyLine(channelToken, event.replyToken, '⚠️ 系統發生未預期錯誤，請到網站確認 Calendar 狀態');
      }
    }
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200, headers: { 'Content-Type': 'application/json' },
  });
});
