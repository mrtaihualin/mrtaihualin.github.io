// ════════════════════════════════════════════════════════════
// Supabase Edge Function: line-webhook
// หน้าที่: รับ Webhook event จาก LINE
//   รองรับ 2 ชนิด postback:
//   0) action=confirm_cancel_delete (2026-07-19 เพิ่ม) — ครูกดปุ่มเดียวใน LINE ยืนยัน "ยกเลิกคาบ"
//      ที่นักเรียนขอมา → ตอนนี้ **ลบ Google Calendar จริงทันที** ผ่าน Google service account
//      (ดูฟังก์ชัน getGoogleCalendarToken/deleteCalendarEventById ด้านล่าง) ต่างจากข้อ 3/4 ด้านล่างที่ยัง
//      "แตะ Calendar เองไม่ได้" — อันนี้แตะได้แล้วเพราะมี service account credential เป็นของตัวเอง
//      ไม่ต้องพึ่ง OAuth token ของครู เช็คว่าคนกดเป็นครูจริง (LINE_TEACHER_USER_ID) ก่อนทำงานทุกครั้ง
//      ต้องตั้ง secret 2 ตัวก่อน: GOOGLE_SERVICE_ACCOUNT_KEY (ดูคอมเมนต์เหนือ getGoogleCalendarToken)
//      และ GOOGLE_CALENDAR_ID = อีเมลปฏิทินจริงของครู เช่น mr.taihualin@gmail.com (ดูคอมเมนต์เหนือ
//      deleteCalendarEventById — 2026-07-19 แก้บั๊ก：ห้ามใช้ "primary" เพราะนั่นคือปฏิทินของบัญชี
//      หุ่นยนต์เอง ไม่ใช่ปฏิทินของครู) และต้องแชร์ Google Calendar ของครูให้อีเมล service account
//      สิทธิ์ "Make changes to events" ด้วย
//   1) action=approve|deny (แบบเดิม 2026-07-10) — ปุ่มเก่าในข้อความที่เคยส่งให้ครูก่อนหน้านี้
//      2026-07-13 แก้: status เปลี่ยนจาก approved/denied → acknowledged (ตาม constraint จริงในฐานข้อมูล
//      classroom_requests_status_check ที่รองรับแค่ pending/acknowledged เท่านั้น) — เก็บไว้เผื่อมีข้อความ
//      เก่าที่ยังไม่ถูกกดค้างอยู่ใน LINE ของครู กดแล้วจะไม่ error แต่ **ไม่ได้แตะ Google Calendar ใดๆ ทั้งสิ้น**
//      (ตอนนี้ปุ่มนี้เป็นเวอร์ชันเก่าที่เลิกส่งใหม่แล้ว — ดูข้อ 2026-07-13 ด้านล่าง)
//   2) action=accept_offer|decline_offer (2026-07-13 เพิ่ม, 2026-07-16 แก้：รองรับสูงสุด 3 ตัวเลือก) —
//      ปุ่มที่นักเรียนกดตอบรับ/ปฏิเสธเวลาครูเสนอ (ดู submitProposeTime ในเว็บ) → accept_offer ตอนนี้
//      แนบ opt=<index> บอกว่าเลือกตัวเลือกไหนใน proposed_options (สูงสุด 3 อัน) แล้วอัปเดต
//      requested_date/requested_time + offer_status='accepted' · decline_offer = ทั้งหมดไม่สะดวก
//      **ไม่แตะ Google Calendar** (Edge Function ไม่มี Google OAuth token ของครู ทำไม่ได้จากฝั่งนี้)
//      ครูต้องกลับไปเปิดหน้าเว็บเพื่อกด "✅ ยืนยันและย้าย Calendar" เอง ระบบจะโชว์ให้เห็นในหน้าแรกอัตโนมัติ
//      ทั้งสองแบบตอนนี้ push แจ้งครูทันที (Lin ขอ) ไม่ต้องรอครูเปิดเว็บเองถึงจะรู้
//   3) action=ack_teacher_cancel (2026-07-16 เพิ่ม) — ครูสั่งยกเลิกคาบ (teacherCancelClassNowInner)
//      ไม่ลบ Calendar ทันทีแล้ว ต้องรอนักเรียนกด "我知道了" ก่อน (กดฝั่ง LINE นี้ หรือฝั่งเว็บก็ได้ อันไหน
//      กดก่อนนับอันนั้น) → set teacher_cancel_ack_at แล้ว push แจ้งครูว่ากดยืนยันลบได้แล้ว
//      **ไม่แตะ Google Calendar เอง** (ครูต้องกลับไปกด "確認刪除 Calendar" ที่เว็บเอง)
//   4) action=ack_teacher_add (2026-07-18 เพิ่ม) — ครูสั่งเพิ่มคาบเอง (proposeAddClassDay)
//      ไม่สร้าง Calendar ทันที ต้องรอนักเรียนกด "我知道了" ก่อน (ฝั่ง LINE นี้ หรือฝั่งเว็บก็ได้) →
//      set teacher_add_ack_at แล้ว push แจ้งครูว่ากดยืนยันเพิ่มได้แล้ว **ไม่แตะ Google Calendar เอง**
//      (ครูต้องกลับไปกด "確認新增 Calendar" ที่เว็บเอง — ดู confirmTeacherAddClass ในเว็บ)
//
// 2026-07-13 สำคัญมาก：ตั้งแต่เปลี่ยนมาให้ "處理" ปุ่มบนเว็บค้นหา+ย้าย/ลบ Calendar เองแล้ว
//   ปุ่ม "✅ 已處理"/"❌ 婉拒" แบบเดิมที่เคยส่งไปให้ครูกดตรงจาก LINE **เอาออกจากข้อความแจ้งเตือนใหม่แล้ว**
//   (ดู notifyTeacherClassRequest ในเว็บ) เพราะกดจาก LINE แล้วจะ "ดูเหมือนจัดการเสร็จ" ทั้งที่ Google Calendar
//   ไม่ได้ถูกแตะเลย (Edge Function ไม่มีสิทธิ์ Calendar ของครู) — เสี่ยงข้อมูลไม่ตรงกันแบบอันตราย
//   (RELIABILITY FIRST) ตอนนี้ข้อความแจ้งเตือนครูจะมีแค่ลิงก์ "🔗 開 Calendar" + "📋 到網站處理" แทน
//
// ⚠️ นี่คือ Webhook — ต่างจาก notify-line/link-line ตรงที่ "LINE เป็นฝ่ายเรียกเรา" ไม่ใช่เว็บเรียก
//   ดังนั้นต้องไปตั้งค่า Webhook URL ในหน้า LINE Developers Console ด้วย (ดูขั้นตอนด้านล่าง)
//
// วิธี deploy (ทำต่อจาก notify-line ได้เลย ใช้ secret ชุดเดียวกันบางส่วน):
//   1. supabase secrets set LINE_CHANNEL_SECRET=xxxxxxxx
//      (หาได้จาก LINE Developers Console → channel ตัวเดียวกับที่ตั้ง LINE_CHANNEL_ACCESS_TOKEN
//       → Basic settings → Channel secret)
//   2. supabase functions deploy line-webhook --no-verify-jwt
//      ⚠️ ต้องมี --no-verify-jwt เพราะ LINE เรียกเราตรงๆ ไม่มี Supabase auth token แนบมา
//   3. เอา URL ของฟังก์ชันที่ deploy เสร็จ (รูปแบบ https://qzkxlhpcputsvbqmtqfi.supabase.co/functions/v1/line-webhook)
//      ไปวางใน LINE Developers Console → channel → Messaging API → Webhook URL → กด Verify
//   4. เปิดสวิตช์ "Use webhook" ให้เป็นเปิด (สำคัญมาก ไม่เปิดจะไม่ทำงาน)
//   5. ปิด "Auto-reply messages" กับ "Greeting messages" ในหน้า LINE Official Account Manager
//      (ไม่บังคับ แต่แนะนำ กันข้อความอัตโนมัติของ LINE เองไปกวนตอนครูกดปุ่ม)
// ════════════════════════════════════════════════════════════

// deno-lint-ignore-file
// @ts-nocheck

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

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
async function deleteCalendarEventById(eventId) {
  const token = await getGoogleCalendarToken();
  if (!token) return { ok: false, reason: 'no_token' };
  const calendarId = Deno.env.get('GOOGLE_CALENDAR_ID');
  if (!calendarId) return { ok: false, reason: 'no_calendar_id', detail: 'ยังไม่ได้ตั้ง secret GOOGLE_CALENDAR_ID' };
  const eventUrl = 'https://www.googleapis.com/calendar/v3/calendars/' + encodeURIComponent(calendarId) + '/events/' + encodeURIComponent(eventId);
  try {
    // ── 2026-07-19 加（บั๊กจริงที่เจอ）：เดิมยิง DELETE เลยแล้วเชื่อว่า 404 = "ลบสำเร็จแล้ว"
    // แต่ 404 ก็ขึ้นได้ตอน service account "มองไม่เห็นปฏิทินนี้เลย" (ยังไม่ได้แชร์ปฏิทินให้ / แชร์ผิดอีเมล /
    // GOOGLE_CALENDAR_ID พิมพ์ผิด) — เคส "มองไม่เห็นเลย" กับ "ลบสำเร็จ" ตอบ 404 เหมือนกันทุกประการ
    // แยกไม่ออกจาก DELETE+verify GET อย่างเดียว (สอง GET ก็ 404 เหมือนกันทั้งคู่ ทำให้ขึ้น "สำเร็จ" ทั้งที่
    // ความจริงคือไม่มีสิทธิ์เห็น calendar นี้เลยตั้งแต่ต้น ไม่เคยแตะ event จริงเลย)
    // แก้：ต้อง GET "ก่อน" ลบก่อนเสมอ พิสูจน์ว่า service account เห็น event ตัวนี้จริงๆ (status สด ๆ)
    // เห็นแล้วค่อยลบ — ถ้า GET ก่อนลบก็ 404 อยู่แล้ว แปลว่าปัญหาอยู่ที่การเชื่อมต่อ/สิทธิ์ ไม่ใช่ลบสำเร็จ
    const preRes = await fetch(eventUrl, { headers: { Authorization: 'Bearer ' + token } });
    if (preRes.status === 404 || preRes.status === 410) {
      return { ok: false, reason: 'not_visible_before_delete', detail: 'ก่อนลบ service account มองไม่เห็น event นี้เลย (' + preRes.status + ') — เช็ค: (1) แชร์ Google Calendar ให้อีเมล service account สิทธิ์ "Make changes to events" แล้วหรือยัง (2) GOOGLE_CALENDAR_ID ตรงกับปฏิทินจริงไหม' };
    }
    if (preRes.ok) {
      const preData = await preRes.json().catch(() => ({}));
      if (preData.status === 'cancelled') return { ok: true }; // ถูกลบไปแล้วจากที่อื่นก่อนหน้านี้
    } else {
      const detail = await preRes.text().catch(() => '');
      return { ok: false, reason: 'pre_check_http_' + preRes.status, detail: detail.slice(0, 300) };
    }

    const delRes = await fetch(eventUrl, { method: 'DELETE', headers: { Authorization: 'Bearer ' + token } });
    if (!delRes.ok && delRes.status !== 404 && delRes.status !== 410) {
      const detail = await delRes.text().catch(() => '');
      return { ok: false, reason: 'http_' + delRes.status, detail: detail.slice(0, 300) };
    }
    // ── ยืนยันซ้ำว่าลบจริง (ตอนนี้พิสูจน์แล้วว่ามองเห็น calendar/event นี้จริงตั้งแต่ก่อนลบ (preRes.ok
    // ด้านบน) ดังนั้น 404 ตรงนี้แปลว่า "ลบสำเร็จจริง" ไม่ใช่ "มองไม่เห็นตั้งแต่ต้น" อีกแล้ว) ──
    const verifyRes = await fetch(eventUrl, { headers: { Authorization: 'Bearer ' + token } });
    if (verifyRes.status === 404 || verifyRes.status === 410) return { ok: true };
    if (verifyRes.ok) {
      const verifyData = await verifyRes.json().catch(() => ({}));
      if (verifyData.status === 'cancelled') return { ok: true };
      return { ok: false, reason: 'still_exists', detail: 'GET ยืนยันแล้วเจอ event ยังอยู่ (status=' + (verifyData.status || '-') + ')' };
    }
    // ยืนยันไม่ได้ (เช่น network พัง) — ไม่กล้าฟันธงว่าสำเร็จ ให้ครูไปเช็คเองที่เว็บ
    return { ok: false, reason: 'verify_failed_http_' + verifyRes.status };
  } catch (e) {
    return { ok: false, reason: 'fetch_error', detail: e.message };
  }
}

serve(async (req) => {
  // LINE จะยิง GET มาตอนกด "Verify" ในหน้า console ครั้งแรก ให้ตอบ 200 เฉยๆ ก็พอ
  if (req.method !== 'POST') {
    return new Response('ok', { status: 200 });
  }

  const rawBody = await req.text();
  const channelToken = Deno.env.get('LINE_CHANNEL_ACCESS_TOKEN');
  const channelSecret = Deno.env.get('LINE_CHANNEL_SECRET');

  // ยืนยันว่า request นี้มาจาก LINE จริง ๆ (มี channel secret ตั้งไว้ถึงจะเช็ค — ถ้ายังไม่ตั้งจะข้ามการเช็ค
  // ไปก่อน เพื่อให้ deploy ครั้งแรกแล้วทดสอบง่ายๆ ได้ แต่ **แนะนำให้ตั้ง secret นี้เสมอ** ก่อนใช้งานจริง)
  if (channelSecret) {
    const sig = req.headers.get('x-line-signature') || '';
    const ok = await verifySignature(rawBody, sig, channelSecret);
    if (!ok) return new Response('invalid signature', { status: 401 });
  } else {
    // 2026-07-14 加：เดิมข้ามการเช็คแบบเงียบๆ ถ้ายังไม่ตั้ง secret — เผื่อไว้สำหรับตอน deploy ครั้งแรก
    // แต่ถ้าลืมตั้ง secret แล้วปล่อยไว้แบบนี้จริงจัง ใครก็ยิง request ปลอมมาสั่งงานฟังก์ชันนี้ได้
    // (SECURITY/RELIABILITY FIRST) ต้อง log ดังๆ ทุกครั้งที่เกิดแบบนี้ ไม่ให้เงียบหายไป
    // เช็ค log ได้จาก Supabase Dashboard → Edge Functions → line-webhook → Logs
    console.error('[line-webhook] ⚠️ ยังไม่ได้ตั้งค่า LINE_CHANNEL_SECRET — ข้ามการตรวจลายเซ็นไปเฉยๆ (เสี่ยงมีคนปลอม request มาสั่งงาน) ควรตั้ง secret นี้โดยเร็ว');
  }

  let payload;
  try { payload = JSON.parse(rawBody); } catch (e) {
    return new Response('bad json', { status: 400 });
  }

  const supabase = createClient(Deno.env.get('SUPABASE_URL'), Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'));

  for (const event of (payload.events || [])) {
    if (event.type !== 'postback') continue; // ตอนนี้สนใจแค่ postback (ปุ่มในข้อความ) เท่านั้น
    let actionForLog = 'unknown'; // 2026-07-19 加：ให้ catch ครอบนอกสุดข้างล่างรู้ว่า action ไหนพังอยู่
    try {
      const data = event.postback && event.postback.data ? event.postback.data : '';
      const params = new URLSearchParams(data);
      const action = params.get('action');
      actionForLog = action || 'unknown';

      if (action === 'approve' || action === 'deny') {
        // ── 2026-07-10 แบบเก่า：เก็บไว้เผื่อมีข้อความค้างที่ยังไม่ถูกกด ไม่ได้แตะ Calendar ──
        const token = params.get('token');
        const type = params.get('type');
        const odate = params.get('odate');
        if (!token || !type || !odate) continue;

        const { error, count } = await supabase
          .from('classroom_requests')
          .update({ status: 'acknowledged' }, { count: 'exact' })
          .eq('token', token)
          .eq('request_type', type)
          .eq('original_date', odate)
          .eq('status', 'pending');

        if (channelToken && event.replyToken) {
          let replyText;
          if (error) replyText = '⚠️ 更新失敗：' + error.message;
          else if (!count) replyText = 'ℹ️ 這筆申請可能已經被處理過了';
          else replyText = 'ℹ️ 已標記完成，但這個舊版按鈕不會動 Google Calendar，記得自己到 Calendar 確認調整好了';
          await replyLine(channelToken, event.replyToken, replyText);
        }
        continue;
      }

      if (action === 'accept_offer' || action === 'decline_offer') {
        // ── 2026-07-13 加：นักเรียนตอบรับ/ปฏิเสธเวลาใหม่ที่ครูเสนอ ──
        // แค่บันทึก offer_status ลงฐานข้อมูล **ไม่แตะ Calendar** — ครูต้องเปิดหน้าเว็บกดยืนยันเองอีกที
        // ถึงจะย้าย Calendar จริง (Edge Function ไม่มี Google OAuth token ของครู ทำเองไม่ได้)
        // 2026-07-16 加（Lin 要求：最多 3 個時間選項）：accept_offer 現在會帶 opt=<index>，
        // 指出學生選了 proposed_options 裡第幾個——先查一次這筆申請，把選到的那個存進
        // requested_date/requested_time（老師「確認並搬 Calendar」讀的就是這兩欄，
        // 完全不用改那段既有的搬 Calendar 邏輯）。
        const requestId = params.get('request');
        if (!requestId) continue;
        const newOfferStatus = action === 'accept_offer' ? 'accepted' : 'declined';

        // 2026-07-16 加（稽核發現，ORANGE#5）：先查這筆申請屬於哪個學生（token），連同
        // accept_offer 要用的候選時間一起查一次。
        const { data: reqRow } = await supabase
          .from('classroom_requests')
          .select('token,proposed_options,requested_date,requested_time')
          .eq('id', requestId)
          .maybeSingle();
        if (!reqRow) continue; // 這筆申請不存在，安全忽略，不用回覆什麼

        // 2026-07-16 加（稽核發現，ORANGE#5）：以前這裡只認 request id，沒有確認按按鈕的
        // LINE 使用者是不是這筆申請真正的學生本人——多加這層防護（防禦性加強，不是因為
        // 已知有真的被利用，是稽核時發現「理論上少了這一層」）。對不上就安全忽略，不回覆任何內容
        // （避免透露「這筆申請存在/不存在」這種資訊給不是本人的人）。
        // 2026-07-19 改（稽核發現，YELLOW）：原本 if(senderUserId){檢查} 意味著萬一
        // senderUserId 是空值（理論上 LINE postback 一定會帶，但不該假設），這層檢查會被整段跳過（fail-open）。
        // 改成 fail-closed：沒有 senderUserId 或對不起來都直接拒絕。
        const senderUserId = event.source && event.source.userId;
        const { data: stuRow } = await supabase.from('classroom_students').select('line_user_id').eq('token', reqRow.token).maybeSingle();
        if (!senderUserId || !stuRow || stuRow.line_user_id !== senderUserId) {
          console.error('[line-webhook] ⚠️ accept/decline_offer：LINE 使用者跟這筆申請的學生對不起來，已忽略。request=', requestId);
          continue;
        }

        const updateFields = { offer_status: newOfferStatus };
        let chosenOpt = null;
        if (action === 'accept_offer') {
          const optIdxRaw = params.get('opt');
          const optIdx = optIdxRaw === null ? 0 : parseInt(optIdxRaw, 10);
          const opts = (Array.isArray(reqRow.proposed_options) && reqRow.proposed_options.length)
            ? reqRow.proposed_options
            : [{ date: reqRow.requested_date, time: reqRow.requested_time }];
          // 2026-07-16 加（稽核發現，RED#2）：以前這裡選項對不到（例如老師剛好把提議改成剩 2 個選項，
          // 學生卻點了舊訊息裡的第 3 個按鈕）會偷偷退回選第一個，等於老師之後搬 Calendar 搬到
          // 學生根本沒選過的時間，而且完全沒有警告。現在改成：對不到就直接當失敗處理，
          // 不寫入 accepted，回覆學生請重新整理網頁看最新選項再選一次。
          if (!Number.isInteger(optIdx) || optIdx < 0 || optIdx >= opts.length || !opts[optIdx]) {
            if (channelToken && event.replyToken) {
              await replyLine(channelToken, event.replyToken, '⚠️ 這個選項好像已經失效了（老師可能剛修改過提議），請重新整理網頁看最新的選項再選一次。');
            }
            continue;
          }
          chosenOpt = opts[optIdx];
          updateFields.requested_date = chosenOpt.date;
          updateFields.requested_time = chosenOpt.time;
          // 2026-07-16 加（稽核發現，ORANGE#4）：學生接受之後，48 小時提醒的計時器要重新開始算
          // 「等老師去確認搬 Calendar」，不然這筆申請的 sla_reminder_sent 可能早在「等學生回覆」
          // 階段就已經是 true 了，導致老師永遠收不到「學生已經回覆很久了，記得去確認」的提醒。
          updateFields.offer_accepted_at = new Date().toISOString();
          updateFields.sla_reminder_sent = false;
        }

        const { error, count } = await supabase
          .from('classroom_requests')
          .update(updateFields, { count: 'exact' })
          .eq('id', requestId)
          .eq('offer_status', 'proposed');

        if (channelToken && event.replyToken) {
          let replyText;
          if (error) replyText = '⚠️ 回覆失敗：' + error.message;
          else if (!count) replyText = 'ℹ️ 這個提議可能已經被回覆過了，重新整理網頁看看目前狀態';
          else replyText = newOfferStatus === 'accepted'
            ? '✅ 已回覆，等老師開電腦確認後才會真的調整行事曆喔'
            : '✅ 已回覆都不方便，老師會直接聯絡你討論時間';
          await replyLine(channelToken, event.replyToken, replyText);
        }

        // 2026-07-16 加（Lin 要求）：不管選了時間還是都不方便，都要推播通知老師——老師可能不在電腦前，
        // 不然要自己開網站才會知道學生回覆了。只有這次真的成功翻到 accepted/declined（count>0）才通知，
        // 避免重複按/兩邊搶著按時推兩次給老師。
        if (!error && count && channelToken) {
          const teacherUserId = Deno.env.get('LINE_TEACHER_USER_ID');
          if (teacherUserId) {
            const msg = newOfferStatus === 'accepted'
              ? ('ℹ️ 學生已經選好新時間' + (chosenOpt ? '（' + chosenOpt.date + (chosenOpt.time ? ' ' + chosenOpt.time : '') + '）' : '') + '，到網站按「確認並搬 Calendar」')
              : '⚠️ 學生說這些時間都不方便，請直接聯絡學生討論';
            await pushLine(channelToken, teacherUserId, msg);
          }
        }
        continue;
      }

      if (action === 'ack_teacher_cancel') {
        // ── 2026-07-16 加：老師發起的取消，學生在 LINE 這邊按「我知道了」確認收到 ──
        // 網站那邊也有一顆一樣功能的按鈕（見 ackTeacherCancel in classroom/index.html）
        // 哪邊先按都算數，兩邊共用同一個欄位 teacher_cancel_ack_at，用 .is(null) 當保險閘
        // 防止兩邊同時按/重複按 push 兩次通知給老師。
        const requestId = params.get('request');
        if (!requestId) continue;

        // 2026-07-16 加（稽核發現，ORANGE#5）：跟 accept/decline_offer 一樣，多加一層確認
        // 按按鈕的人是不是這筆通知真正要給的那個學生。
        // 2026-07-19 改（稽核發現，YELLOW）：fail-closed，不能因為 senderUserIdAck 空值就跳過檢查
        const senderUserIdAck = event.source && event.source.userId;
        const { data: reqRowAck } = await supabase.from('classroom_requests').select('token').eq('id', requestId).maybeSingle();
        if (!reqRowAck) continue;
        const { data: stuRowAck } = await supabase.from('classroom_students').select('line_user_id').eq('token', reqRowAck.token).maybeSingle();
        if (!senderUserIdAck || !stuRowAck || stuRowAck.line_user_id !== senderUserIdAck) {
          console.error('[line-webhook] ⚠️ ack_teacher_cancel：LINE 使用者跟這筆申請的學生對不起來，已忽略。request=', requestId);
          continue;
        }

        // 2026-07-19 加（稽核發現，ORANGE#6）：學生確認收到取消通知之後，還要等老師去網站按
        // 「確認刪除 Calendar」才算真的完成——這裡把 sla_reminder_sent 重設回 false，讓
        // request-sla-cron 可以在老師忘記時繼續每 48 小時提醒一次（不然這筆申請可能永遠沒人再提醒）。
        const { data: updated, error, count } = await supabase
          .from('classroom_requests')
          .update({ teacher_cancel_ack_at: new Date().toISOString(), sla_reminder_sent: false }, { count: 'exact' })
          .eq('id', requestId)
          .is('teacher_cancel_ack_at', null)
          .select('original_date');

        if (channelToken && event.replyToken) {
          let replyText;
          if (error) replyText = '⚠️ 確認失敗：' + error.message;
          else if (!count) replyText = 'ℹ️ 這筆通知可能已經確認過了';
          else replyText = '✅ 已確認收到，老師會盡快處理';
          await replyLine(channelToken, event.replyToken, replyText);
        }

        // 只有「這次真的是我讓它從 null 變成有值」（count>0）才通知老師，避免重複按/兩邊搶著按時推兩次
        if (!error && count && channelToken) {
          const teacherUserId = Deno.env.get('LINE_TEACHER_USER_ID');
          if (teacherUserId) {
            const odate = (updated && updated[0] && updated[0].original_date) || '-';
            // 2026-07-19 改：原本只推純文字叫老師去網站按，現在直接附一顆按鈕，共用同一個
            // action=confirm_cancel_delete（跟學生自己申請取消那顆按鈕完全同一套邏輯／同一個 Edge Function 分支）
            await pushLineFlex(
              channelToken, teacherUserId,
              '學生已確認收到取消通知',
              '時間：' + odate + '\n\n可以直接按下方按鈕刪除 Calendar，或到網站處理',
              [{ label: '確認刪除 Calendar', postbackData: 'action=confirm_cancel_delete&request=' + encodeURIComponent(requestId), style: 'primary' }],
            );
          }
        }
        continue;
      }

      if (action === 'ack_teacher_add') {
        // ── 2026-07-18 加：老師發起的加課，學生在 LINE 這邊按「我知道了」確認 ──
        // 網站那邊也有一顆一樣功能的按鈕（見 ackTeacherAdd in classroom/index.html）
        // 哪邊先按都算數，兩邊共用同一個欄位 teacher_add_ack_at，用 .is(null) 當保險閘。
        // 跟 ack_teacher_cancel 同一套模式，只是欄位/文字換成加課版本。
        const requestIdAdd = params.get('request');
        if (!requestIdAdd) continue;

        // 2026-07-19 改（稽核發現，YELLOW）：fail-closed，同上
        const senderUserIdAckAdd = event.source && event.source.userId;
        const { data: reqRowAckAdd } = await supabase.from('classroom_requests').select('token').eq('id', requestIdAdd).maybeSingle();
        if (!reqRowAckAdd) continue;
        const { data: stuRowAckAdd } = await supabase.from('classroom_students').select('line_user_id').eq('token', reqRowAckAdd.token).maybeSingle();
        if (!senderUserIdAckAdd || !stuRowAckAdd || stuRowAckAdd.line_user_id !== senderUserIdAckAdd) {
          console.error('[line-webhook] ⚠️ ack_teacher_add：LINE 使用者跟這筆申請的學生對不起來，已忽略。request=', requestIdAdd);
          continue;
        }

        // 2026-07-19 加（稽核發現，ORANGE#6 同一套邏輯，加課版本）：重設 sla_reminder_sent 讓
        // cron 可以在老師忘記按「確認新增 Calendar」時繼續提醒。
        const { data: updatedAdd, error: errorAdd, count: countAdd } = await supabase
          .from('classroom_requests')
          .update({ teacher_add_ack_at: new Date().toISOString(), sla_reminder_sent: false }, { count: 'exact' })
          .eq('id', requestIdAdd)
          .is('teacher_add_ack_at', null)
          .select('requested_date, requested_time');

        if (channelToken && event.replyToken) {
          let replyTextAdd;
          if (errorAdd) replyTextAdd = '⚠️ 確認失敗：' + errorAdd.message;
          else if (!countAdd) replyTextAdd = 'ℹ️ 這筆通知可能已經確認過了';
          else replyTextAdd = '✅ 已確認收到，老師會盡快處理';
          await replyLine(channelToken, event.replyToken, replyTextAdd);
        }

        if (!errorAdd && countAdd && channelToken) {
          const teacherUserIdAdd = Deno.env.get('LINE_TEACHER_USER_ID');
          if (teacherUserIdAdd) {
            const rdate = (updatedAdd && updatedAdd[0] && updatedAdd[0].requested_date) || '-';
            const rtime = (updatedAdd && updatedAdd[0] && updatedAdd[0].requested_time) || '';
            await pushLine(channelToken, teacherUserIdAdd, 'ℹ️ 學生已確認收到加課通知（' + rdate + ' ' + rtime + '），可以到網站按「確認新增」了');
          }
        }
        continue;
      }
      if (action === 'confirm_cancel_delete') {
        // ── 2026-07-19 加：ครูกดปุ่มเดียวใน LINE → ลบ Calendar จริงทันที (ใช้ Google service account) ──
        // เดิมทำไม่ได้เพราะไม่มี OAuth token ของครู (ดูคอมเมนต์บรรทัด 26-30) ตอนนี้มี service account แล้ว
        // ใช้ calendar_event_id ตรงตัว ไม่เดาจากชื่อ+วันที่ (เหมือน deleteClassEventOnce ฝั่งเว็บ)
        const requestIdCancel = params.get('request');
        if (!requestIdCancel) continue;

        // เฉพาะครูเท่านั้นที่กดปุ่มนี้ได้ (กันคนอื่นกดสั่งลบ Calendar ของครูได้)
        const teacherUserIdCheck = Deno.env.get('LINE_TEACHER_USER_ID');
        const senderIsTeacher = event.source && teacherUserIdCheck && event.source.userId === teacherUserIdCheck;
        if (!senderIsTeacher) {
          console.error('[line-webhook] ⚠️ confirm_cancel_delete: ผู้กดไม่ใช่ครู ถูกปฏิเสธ. request=', requestIdCancel);
          continue;
        }

        const { data: reqRowCancel, error: fetchErrCancel } = await supabase
          .from('classroom_requests')
          .select('calendar_event_id,status,token,original_date,original_time')
          .eq('id', requestIdCancel)
          .maybeSingle();

        if (fetchErrCancel || !reqRowCancel) {
          if (channelToken && event.replyToken) await replyLine(channelToken, event.replyToken, '⚠️ 找不到這筆申請了，請到網站確認');
          continue;
        }
        if (reqRowCancel.status === 'acknowledged') {
          if (channelToken && event.replyToken) await replyLine(channelToken, event.replyToken, 'ℹ️ 這筆已經處理過了');
          continue;
        }
        if (!reqRowCancel.calendar_event_id) {
          if (channelToken && event.replyToken) await replyLine(channelToken, event.replyToken, '⚠️ 這筆沒有記錄 Calendar 事件 ID，請到網站手動處理');
          continue;
        }

        // ── 2026-07-19 เพิ่ม（แก้ ORANGE：ครูกดลบจาก LINE กับเว็บพร้อมกัน ชนกันได้）──
        // เดิม: เช็คแค่ status ด้านบน (อ่านเฉยๆ ไม่ atomic) แล้วยิงลบ Calendar เลย → ถ้าเว็บกับ LINE
        // อ่านผ่านพร้อมกันภายในไม่กี่วินาที ทั้งคู่จะยิง deleteCalendarEventById ซ้อนกันจริง
        // ตอนนี้ต้อง "ล็อกแบบ atomic" ก่อนแตะ Calendar เสมอ — ใช้คอลัมน์ processing_started_at แยกจาก
        // status (status มี CHECK constraint classroom_requests_status_check รองรับแค่
        // pending/acknowledged เท่านั้น เอามาใช้เป็นล็อกที่ 3 ไม่ได้) ฝั่งเว็บ (classroom/index.html
        // claimRequestForProcessing) ใช้ล็อกคอลัมน์เดียวกัน ความหมายเดียวกัน
        const { data: claimDataCancel, error: claimErrCancel, count: claimCountCancel } = await supabase
          .from('classroom_requests')
          .update({ processing_started_at: new Date().toISOString() }, { count: 'exact' })
          .eq('id', requestIdCancel)
          .eq('status', 'pending')
          .is('processing_started_at', null)
          .select('id');

        if (claimErrCancel) {
          console.error('[line-webhook] ⚠️ confirm_cancel_delete: ล็อกก่อนลบพัง:', claimErrCancel.message, 'request=', requestIdCancel);
          if (channelToken && event.replyToken) await replyLine(channelToken, event.replyToken, '⚠️ เตรียมประมวลผลไม่สำเร็จ：' + claimErrCancel.message + '\nยังไม่ได้แตะ Calendar');
          continue;
        }
        if (!claimCountCancel) {
          // ล็อกไม่ได้ = อีกฝั่ง (เว็บ หรือกด LINE ซ้ำ) กำลังทำอยู่/ทำเสร็จไปแล้ว → ห้ามแตะ Calendar ซ้ำ
          if (channelToken && event.replyToken) await replyLine(channelToken, event.replyToken, 'ℹ️ 這筆已經在別的地方處理中或處理完了');
          continue;
        }

        const delResult = await deleteCalendarEventById(reqRowCancel.calendar_event_id);
        if (!delResult.ok) {
          console.error('[line-webhook] ⚠️ confirm_cancel_delete 刪除 Calendar 失敗:', JSON.stringify(delResult), 'request=', requestIdCancel);
          // Calendar ยังไม่ถูกแตะจริง (API ล้มเหลว) → ปลดล็อกคืน ให้กดใหม่/ไปทำที่เว็บได้โดยไม่ติดล็อกค้าง
          const { error: unlockErrCancel } = await supabase.from('classroom_requests').update({ processing_started_at: null }).eq('id', requestIdCancel);
          if (unlockErrCancel) console.error('[line-webhook] ⚠️ confirm_cancel_delete: ปลดล็อกคืนไม่สำเร็จหลัง Calendar ลบพัง:', unlockErrCancel.message, 'request=', requestIdCancel);
          if (channelToken && event.replyToken) {
            // 2026-07-19 加：把失敗原因直接秀給老師看（不用再翻 log），先前遇過「回覆✅但其實沒刪到」
            // 的假成功，之後任何失敗都要讓老師當場看到原因，不能只說「失敗，去網站處理」含糊帶過
            await replyLine(channelToken, event.replyToken, '⚠️ 刪除 Calendar 失敗（不要重複點這顆按鈕，請到網站手動處理）\n原因：' + (delResult.reason || '未知') + (delResult.detail ? '\n' + delResult.detail : ''));
          }
          continue;
        }

        // Calendar ลบสำเร็จแล้วจริง — ปิดสถานะ + ปลดล็อกพร้อมกันในคำสั่งเดียว (atomic)
        // 2026-07-19 加：ถ้า update นี้ล้มเหลว แปลว่า Calendar ลบสำเร็จแล้วแต่บันทึกฐานข้อมูลพัง —
        // จงใจ "ไม่ปลดล็อก" (เพราะ update ทั้งก้อนพังหมด ไม่มีฟิลด์ไหนถูกเปลี่ยนอยู่แล้ว) กันไม่ให้ใครกดซ้ำ
        // แล้วไปลบ Calendar ที่ถูกลบไปแล้วซ้ำอีกรอบ — ต้องให้ Lin เข้าไปเช็คมือใน Supabase
        const { error: updErrCancel, count: updCountCancel } = await supabase
          .from('classroom_requests')
          .update({ status: 'acknowledged', processing_started_at: null }, { count: 'exact' })
          .eq('id', requestIdCancel)
          .eq('status', 'pending');

        if (updErrCancel) {
          // Calendar ลบสำเร็จแล้วจริง แต่บันทึกฐานข้อมูลไม่สำเร็จ — ต้องบอกครูดังๆ ไม่ให้เข้าใจผิดว่ายังไม่ได้ลบ
          console.error('[line-webhook] ⚠️ confirm_cancel_delete: Calendar ลบแล้วแต่อัปเดตฐานข้อมูลพัง (ล็อกจะค้างไว้ตั้งใจ ต้องเช็คมือ):', updErrCancel.message, 'request=', requestIdCancel);
          if (channelToken && event.replyToken) {
            await replyLine(channelToken, event.replyToken, '⚠️ Calendar 刪除成功，但存資料庫失敗，請直接到 Supabase 手動確認這筆（id: ' + requestIdCancel + '）');
          }
          continue;
        }

        if (channelToken && event.replyToken) {
          await replyLine(channelToken, event.replyToken, '✅ 已刪除 Calendar 課程，並通知學生了');
        }

        // แจ้งนักเรียนว่ายกเลิกเรียบร้อยแล้วจริง (best-effort ไม่บล็อกถ้าหาไม่เจอ)
        if (channelToken && reqRowCancel.token) {
          try {
            const { data: stuRowCancel } = await supabase.from('classroom_students').select('line_user_id').eq('token', reqRowCancel.token).maybeSingle();
            if (stuRowCancel && stuRowCancel.line_user_id) {
              const odateMsg = (reqRowCancel.original_date || '') + (reqRowCancel.original_time ? ' ' + reqRowCancel.original_time : '');
              await pushLine(channelToken, stuRowCancel.line_user_id, '✅ 老師已確認，' + odateMsg + ' 的課程已經取消囉');
            }
          } catch (e) { /* แจ้งนักเรียนไม่สำเร็จ ไม่กระทบว่าลบ Calendar สำเร็จแล้ว */ }
        }
        continue;
      }

      // action 未知的類型 → 忽略，不讓整個 webhook 掛掉
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
