// ════════════════════════════════════════════════════════════
// Supabase Edge Function: line-webhook
// หน้าที่: รับ Webhook event จาก LINE
//   รองรับ postback หลายชนิด (จำนวนจริง ณ 2026-07-20 มากกว่าตัวเลขนี้แล้ว ดูรายละเอียดแต่ละอันด้านล่าง):
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
//   1) (2026-07-19 移除) action=approve|deny — ปุ่มเก่ารุ่น 2026-07-10 ที่ไม่มีการเช็คตัวตนคนกดเลย
//      และไม่แตะ Google Calendar อะไรทั้งสิ้น เอาออกจากข้อความแจ้งเตือนไปตั้งแต่ 2026-07-13 แล้ว
//      Lin ยืนยันแล้วว่าไม่มีข้อความเก่าค้างใน LINE จึงลบโค้ดฝั่ง webhook ทิ้งด้วย
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
//   4) action=ack_teacher_add (2026-07-18 เพิ่ม, 2026-07-20 แก้：push ตอนนี้เป็นปุ่มกดได้） —
//      ครูสั่งเพิ่มคาบเอง (proposeAddClassDay) ไม่สร้าง Calendar ทันที ต้องรอนักเรียนกด "我知道了" ก่อน
//      (ฝั่ง LINE นี้ หรือฝั่งเว็บก็ได้) → set teacher_add_ack_at แล้ว push แจ้งครูพร้อมปุ่ม
//      "確認新增 Calendar" (action=confirm_add_class ด้านล่าง) กดจาก LINE ได้เลย ไม่ต้องเปิดเว็บ
//   5) action=check_conflict (2026-07-20 เพิ่ม) — ครูกดปุ่ม "🔍 檢查是否衝突" ในการ์ดคำขอเพิ่มคาบ
//      (notifyTeacherClassRequest ฝั่งเว็บตอน type='add_class') → ใช้ service account เช็ค
//      freeBusy ของ GOOGLE_CALENDAR_ID ในช่วงเวลาที่นักเรียนขอ แล้ว reply ผลกลับไปในแชททันที
//      **ไม่แตะ Calendar เอง แค่อ่าน**
//   6) action=confirm_add_class (2026-07-20 เพิ่ม, 2026-07-20 แก้รอบ 2：ผ่อนเงื่อนไขตาม initiated_by) —
//      ครูกดปุ่มเดียวใน LINE ยืนยัน "เพิ่มคาบ" → ตอนนี้ **สร้าง Google Calendar event จริงทันที**
//      ผ่าน service account เดียวกับ confirm_cancel_delete (ดู createCalendarEventById ด้านล่าง)
//      ยืนยันสิทธิ์คนกดเป็นครูก่อนทุกครั้งเหมือนกัน ใช้ atomic lock คอลัมน์เดียวกัน (processing_started_at)
//      กันชนกับเว็บ/กดซ้ำ สร้างสำเร็จแล้วเขียนต่อ classroom_schedule/classroom_recurring_days
//      เหมือนฝั่งเว็บทุกประการ · เงื่อนไข "ต้องรอนักเรียนกด 我知道了 ก่อน" (teacher_add_ack_at)
//      **เดิมบังคับทุกกรณี ตอนนี้เช็คเฉพาะ initiated_by==='teacher'** (ครูเป็นคนเสนอเวลาก่อน ต้องรอ
//      นักเรียนตอบรับก่อนถึงจะสร้างจริงได้) — ถ้า initiated_by==='student' (นักเรียนพิมพ์วันเวลาที่
//      ต้องการเองผ่าน "➕ 申請加課") ครูกดปุ่มนี้คือการอนุมัติขั้นสุดท้ายอยู่แล้ว ไม่มีอะไรต้องรอ
//      นักเรียนตอบรับซ้ำ ข้ามด่านนี้ไปสร้าง Calendar ได้ทันที (ดูเงื่อนไขจริงก่อน atomic lock ด้านล่าง)
//   7) action=decline_add_class (2026-07-20 เพิ่ม, Lin ยืนยัน：「กล่องเดียว มีหลายเวลาให้เลือก มีปุ่ม
//      ได้และไม่ได้」) — ครูเสนอเพิ่มคาบหลายช่วงเวลาในครั้งเดียว (proposeAddClassDay ฝั่งเว็บตอนนี้
//      ส่งข้อความเดียวรวมทุกช่วงเวลา ปุ่ม "接受"/"婉拒" แยกทีละช่วง) นักเรียนกด "婉拒" ช่วงไหน →
//      ปิดคำขอนั้น (status='acknowledged', offer_status='declined' — ไม่มีสถานะ 'declined' ใน status
//      column เอง เพราะติด CHECK constraint classroom_requests_status_check ที่รับแค่
//      pending/acknowledged เท่านั้น จึงยืมฟิลด์ offer_status ที่มีค่า 'declined' อยู่แล้ว (เดิมใช้กับ
//      提議改期 เท่านั้น) มาสื่อความหมายเดียวกัน：「นักเรียนไม่เอา」) **ไม่แตะ Google Calendar เลย**
//      (ยังไม่เคยสร้าง event ตัวนี้ เพราะครูยังไม่ได้กด "確認新增") แค่ปิดคำขอ+แจ้งทั้งสองฝ่าย
//   8) action=start_contact_student (2026-07-20 เพิ่ม, Lin ยืนยัน：「กดแล้วพิมพ์ตอบในแชทเดิมได้เลย」) —
//      ทุกปุ่ม "💬 聯繫學生" (เดิมเป็น uri เปิดเว็บผ่าน contactStudentDeepLink) เปลี่ยนมาใช้ action นี้
//      ทั้งหมดแล้ว: ครูกดปุ่ม → เขียนตาราง line_pending_reply (แถวเดียว id=1) จำว่า "ประโยคถัดไปที่ครูพิมพ์
//      ให้ส่งหานักเรียนคนนี้" → ครูพิมพ์ข้อความธรรมดาในแชทเดิม → event.type==='message' (ดู
//      handleTeacherTextMessage ด้านบน serve()) อ่านตาราง แล้ว pushLine ข้อความนั้นไปหานักเรียนทันที
//      แล้วเคลียร์ตารางทิ้ง (ใช้ได้ครั้งเดียวต่อการกด กันพิมพ์ประโยคถัดๆ ไปหลุดไปหาคนเดิม) หมดอายุ 15 นาที
//      ⚠️ ต้องรัน SQL สร้างตาราง line_pending_reply ก่อน (ดูไฟล์ SQL แยกที่เตรียมให้ Lin รันเอง)
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
  // 2026-07-20 加（Lin 檢查 mockup 發現：從 LINE 一鍵刪除的課堂，網站「↩️ 最近處理（還能復原）」
  // 那張老師端持久通知卡片完全看不到——因為那張卡片是讀 classroom_calendar_backups，而這裡
  // 刪除前只是「順便確認看得到 event」，從沒有把整包事件存進備份表。網站按鈕那條路
  // （processClassRequestInner → backupCalendarEvent）本來就有存，LINE 這條路沒有，造成
  // 老師如果全程都在 LINE 操作，完全看不到網站上有任何持久通知/可復原紀錄。
  // 這裡把「刪除前」讀到的完整事件 JSON 留著回傳給呼叫端，讓呼叫端可以自己寫進備份表。
  let preEventData = null;
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
      preEventData = await preRes.json().catch(() => ({}));
      if (preEventData.status === 'cancelled') return { ok: true, eventData: preEventData }; // ถูกลบไปแล้วจากที่อื่นก่อนหน้านี้
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
    if (verifyRes.status === 404 || verifyRes.status === 410) return { ok: true, eventData: preEventData };
    if (verifyRes.ok) {
      const verifyData = await verifyRes.json().catch(() => ({}));
      if (verifyData.status === 'cancelled') return { ok: true, eventData: preEventData };
      return { ok: false, reason: 'still_exists', detail: 'GET ยืนยันแล้วเจอ event ยังอยู่ (status=' + (verifyData.status || '-') + ')' };
    }
    // ยืนยันไม่ได้ (เช่น network พัง) — ไม่กล้าฟันธงว่าสำเร็จ ให้ครูไปเช็คเองที่เว็บ
    return { ok: false, reason: 'verify_failed_http_' + verifyRes.status };
  } catch (e) {
    return { ok: false, reason: 'fetch_error', detail: e.message };
  }
}

// 2026-07-20 加：把伺服器端（service account）動 Calendar 的紀錄也存進 classroom_calendar_backups，
// 跟網站端 backupCalendarEvent 用同一張表、同一組欄位——這樣不管老師是從網站按「✅ 處理」還是從
// LINE 按按鈕完成，老師網站上「↩️ 最近處理（還能復原）」那張持久通知卡片都看得到、都能復原。
// best-effort：備份失敗不擋主流程（Calendar 已經真的動了），只留 log 讓 Lin 之後手動補。
async function backupCalendarEventServer(supabase, requestId, token, action, eventObj) {
  if (!eventObj) return;
  try {
    const oldStartIso = eventObj.start && (eventObj.start.dateTime || eventObj.start.date);
    const { error } = await supabase.from('classroom_calendar_backups').insert({
      request_id: requestId || null,
      token: token || null,
      action: action,
      old_event_id: eventObj.id,
      new_event_id: null,
      old_event_json: eventObj,
      old_start: oldStartIso,
    });
    if (error) console.error('[line-webhook] ⚠️ 備份 Calendar 事件失敗（不影響已經完成的操作，但老師網站上「最近處理」看不到這筆）：', error.message);
  } catch (e) {
    console.error('[line-webhook] ⚠️ 備份 Calendar 事件時發生例外：', e && e.message ? e.message : e);
  }
}

// ════════════════════════════════════════════════════════════
// 2026-07-20 加：以下 3 個功能都是延伸同一套「服務帳號能讀寫 Calendar」的能力（見上面
// getGoogleCalendarToken／deleteCalendarEventById 的說明，2026-07-19 就確認過 scope 是完整的
// https://www.googleapis.com/auth/calendar，不是唯讀，也不是只能刪除）：
//   1) checkFreebusyConflictService／addOneHourTimeStr — action=check_conflict 用，讓老師在 LINE
//      裡按「🔍 檢查是否衝突」就能查，不用開網站
//   2) createCalendarEventById／buildIcalUntilUtcSimple — action=confirm_add_class 用，讓「確認新增
//      Calendar」也能從 LINE 按（跟 confirm_cancel_delete 一鍵刪除同一套模式，只是這次是新增）
// 泰國時間全年沒有日光節約時間、固定 UTC+7，所以「日期+時間（泰國時間）→ UTC」直接用
// 顯式時區偏移字串 "+07:00" 建構 Date 即可，不需要额外的時區資料庫。
// ════════════════════════════════════════════════════════════
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
    const busy = (data.calendars && data.calendars[calendarId] && data.calendars[calendarId].busy) || [];
    return { ok: true, busy };
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
    return { ok: true, eventId: ev.id };
  } catch (e) {
    return { ok: false, reason: 'fetch_error', detail: e.message };
  }
}

// 2026-07-20 加（Lin 要求：「💬 聯繫學生」不用再跳去網站，按了以後直接在同一個 LINE 聊天視窗打字，
// 系統自動把老師打的下一句話轉給對應的學生）：
// line_pending_reply 是只有 1 列的小表（id 固定 = 1），記住「現在老師打的下一句純文字要轉給誰」。
// 老師按 action=start_contact_student 的按鈕時寫入這張表，老師接下來傳的第一則純文字訊息會被這裡
// 讀出來、轉發給該學生，然後立刻清空，避免老師之後隨口聊天被誤轉給舊的學生。
// 逾時保護：超過 15 分鐘沒打字就視為失效，提醒老師重新按一次「💬 聯繫學生」。
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
  await pushLine(channelToken, stuRow.line_user_id, textToSend);
  // 送出後立刻清掉，避免老師下一句閒聊被誤轉給同一個學生
  await supabase.from('line_pending_reply').update({ student_token: null, student_name: null, set_at: null }).eq('id', 1);
  if (channelToken && event.replyToken) {
    await replyLine(channelToken, event.replyToken, '✅ 已經幫你轉給「' + (stuRow.name || pending.student_name || '這位學生') + '」了');
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

      // 2026-07-19 移除（Lin 確認過 LINE 裡已經沒有任何舊版 approve/deny 按鈕的訊息了）：
      // 原本這裡有 action==='approve'||'deny' 的舊版分支，是 2026-07-10 之前發送的按鈕，
      // 不會動 Google Calendar、也完全沒有身分驗證（誰都能按）。Lin 確認訊息已清空，安全移除。

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
            if (newOfferStatus === 'accepted') {
              const msg = 'ℹ️ 學生已經選好新時間' + (chosenOpt ? '（' + chosenOpt.date + (chosenOpt.time ? ' ' + chosenOpt.time : '') + '）' : '') + '，到網站按「確認並搬 Calendar」';
              await pushLine(channelToken, teacherUserId, msg);
            } else {
              // 2026-07-20 加（Lin 要求：都不方便要能直接聯繫學生）：跟網站端 respondToOfferAsStudent
              // 同一套改法，從純文字警告改成附一顆「💬 聯繫學生」按鈕。
              // 2026-07-20 再改：換成 action=start_contact_student（按了直接在這個聊天視窗打字），
              // 跟其他地方一致，不再是開網站的舊連結。
              const msg = '⚠️ 學生說這些時間都不方便，請直接聯絡學生討論';
              await pushLineFlex(channelToken, teacherUserId, '⚠️ 學生說這些時間都不方便', msg,
                [{ label: '💬 聯繫學生', postbackData: 'action=start_contact_student&token=' + encodeURIComponent(reqRow.token || '') }]);
            }
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
            // 2026-07-20 改（Lin 要求：確認新增 Calendar 要能從 LINE 直接按）：跟 ack_teacher_cancel
            // 推 confirm_cancel_delete 按鈕同一套模式，這裡附 action=confirm_add_class 的按鈕。
            await pushLineFlex(
              channelToken, teacherUserIdAdd,
              '學生已確認收到加課通知',
              '時間：' + rdate + ' ' + rtime + '\n\n可以直接按下方按鈕新增 Calendar，或到網站處理',
              [{ label: '確認新增 Calendar', postbackData: 'action=confirm_add_class&request=' + encodeURIComponent(requestIdAdd), style: 'primary' }],
            );
          }
        }
        continue;
      }

      if (action === 'decline_add_class') {
        // ── 2026-07-20 加（Lin 要求：老師一次提議好幾個加課時段，學生要能針對「每一個」時段
        // 各自按接受或婉拒，不是整批一起回覆）── 跟 ack_teacher_add 同樣是學生在 LINE 這邊按的，
        // 差別是這裡是「不要這個時段」。這個 request 本來就還沒建立 Calendar 事件（老師還沒按
        // 「確認新增」），所以完全不用碰 Google Calendar，只需要：(1) 把這筆申請關掉，不讓老師之後
        // 還誤按「確認新增」建立一個學生已經拒絕的時段 (2) 回覆學生 (3) 推播老師。
        // status 欄位只有 CHECK constraint 允許的 pending/acknowledged 兩種值（同一份 constraint
        // 見 confirm_cancel_delete 上面的說明），不能塞「declined」進 status——沿用既有的
        // offer_status 欄位（本來就已經有 'declined' 這個值，只是原本只給改期提議用，這裡借用
        // 同樣的語意：「學生說不要」），status 依照其他「結案」動作的慣例改成 acknowledged。
        const requestIdDecline = params.get('request');
        // 2026-07-20 加（除錯用）：這幾個「安全忽略」的分支以前完全不留紀錄，Lin 回報「按了婉拒，
        // 老師完全沒收到通知」時根本查不出是卡在哪一關——現在每個分支都留 console.error，
        // 之後到 Supabase Edge Functions 的 Logs 頁面查 line-webhook 就看得到卡在哪。
        if (!requestIdDecline) { console.error('[line-webhook] ⚠️ decline_add_class：postback 沒帶 request id，已忽略。'); continue; }

        const senderUserIdDecline = event.source && event.source.userId;
        const { data: reqRowDecline } = await supabase
          .from('classroom_requests')
          .select('token,status,requested_date,requested_time,processing_started_at')
          .eq('id', requestIdDecline)
          .maybeSingle();
        if (!reqRowDecline) { console.error('[line-webhook] ⚠️ decline_add_class：找不到這筆申請，已忽略。request=', requestIdDecline); continue; }

        // 2026-07-20 加：跟 ack_teacher_add 同一套 fail-closed 身分檢查——按鈕點的人一定要是
        // 這筆申請本人的學生（用 line_user_id 對照），對不上就安全忽略，不回覆任何內容。
        const { data: stuRowDecline } = await supabase.from('classroom_students').select('line_user_id').eq('token', reqRowDecline.token).maybeSingle();
        if (!senderUserIdDecline || !stuRowDecline || stuRowDecline.line_user_id !== senderUserIdDecline) {
          console.error('[line-webhook] ⚠️ decline_add_class：LINE 使用者跟這筆申請的學生對不起來，已忽略。request=', requestIdDecline);
          continue;
        }

        if (reqRowDecline.status === 'acknowledged') {
          if (channelToken && event.replyToken) await replyLine(channelToken, event.replyToken, 'ℹ️ 這筆已經處理過了');
          continue;
        }

        // 2026-07-20 加（稽核發現 🟠 ORANGE）：以前這裡只擋 status='pending'，沒擋
        // processing_started_at——如果老師剛好在同一瞬間按了「✅ 確認新增」（confirm_add_class 會先
        // 搶 processing_started_at 鎖再建立 Calendar，狀態這時還是 'pending'），學生這邊「婉拒」可能
        // 跟老師那邊的建立動作撞期，甚至在 Calendar 已經建立成功後才把這筆改成「declined」。加一樣的
        // .is('processing_started_at', null) 閘，確保正在被處理中的申請不會被婉拒動作打斷。
        const { data: updatedDecline, error: errorDecline, count: countDecline } = await supabase
          .from('classroom_requests')
          .update({ status: 'acknowledged', offer_status: 'declined', processing_started_at: null }, { count: 'exact' })
          .eq('id', requestIdDecline)
          .eq('status', 'pending')
          .is('processing_started_at', null)
          .select('requested_date, requested_time');

        if (channelToken && event.replyToken) {
          let replyTextDecline;
          if (errorDecline) replyTextDecline = '⚠️ 婉拒失敗：' + errorDecline.message;
          else if (!countDecline) replyTextDecline = 'ℹ️ 這筆可能剛好已經被處理過了';
          else replyTextDecline = '已經幫你婉拒這堂課的時間了，如果有其他想約的時間可以再跟老師說';
          await replyLine(channelToken, event.replyToken, replyTextDecline);
        }

        // 只有「這次真的成功把它關掉」（count>0）才推播老師，避免重複按/兩邊搶著按時推兩次
        if (!errorDecline && countDecline && channelToken) {
          const teacherUserIdDecline = Deno.env.get('LINE_TEACHER_USER_ID');
          if (teacherUserIdDecline) {
            const ddate = (updatedDecline && updatedDecline[0] && updatedDecline[0].requested_date) || reqRowDecline.requested_date || '-';
            const dtime = (updatedDecline && updatedDecline[0] && updatedDecline[0].requested_time) || reqRowDecline.requested_time || '';
            // 跟 accept_offer/decline_offer 推「都不方便」給老師同一套模式：附「💬 聯繫學生」按鈕，
            // 不用只留純文字讓老師自己去網站找學生聯絡方式。
            // 2026-07-20 改：這裡以前還是用舊的 #contact-student-<token> 開網站連結（跟網站那邊
            // 4 個地方換掉的是同一個舊機制，這裡漏掉了）——換成跟其他地方一致的
            // action=start_contact_student，按了直接在這個聊天視窗打字就能轉給學生。
            await pushLineFlex(
              channelToken, teacherUserIdDecline,
              '學生婉拒了這堂加課',
              '時間：' + ddate + ' ' + dtime + '（泰國時間）\n\n學生婉拒了這個時段，這筆申請已經關閉，不會再被誤新增，可以直接聯繫學生討論其他時間',
              [{ label: '💬 聯繫學生', postbackData: 'action=start_contact_student&token=' + encodeURIComponent(reqRowDecline.token || '') }],
            );
          }
        }
        continue;
      }

      if (action === 'check_conflict') {
        // ── 2026-07-20 加（Lin 要求：申請加課的 LINE 卡片也要能直接查衝突，不用開網站）──
        // 只有老師能按（跟其他會碰 Calendar/資料庫的 postback 一樣，fail-closed 檢查身分）。
        const requestIdChk = params.get('request');
        if (!requestIdChk) continue;
        const teacherUserIdChk = Deno.env.get('LINE_TEACHER_USER_ID');
        const senderIsTeacherChk = event.source && teacherUserIdChk && event.source.userId === teacherUserIdChk;
        if (!senderIsTeacherChk) {
          console.error('[line-webhook] ⚠️ check_conflict: ผู้กดไม่ใช่ครู ถูกปฏิเสธ. request=', requestIdChk);
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
        if (!requestIdAddC) continue;

        const teacherUserIdAddC = Deno.env.get('LINE_TEACHER_USER_ID');
        const senderIsTeacherAddC = event.source && teacherUserIdAddC && event.source.userId === teacherUserIdAddC;
        if (!senderIsTeacherAddC) {
          console.error('[line-webhook] ⚠️ confirm_add_class: ผู้กดไม่ใช่ครู ถูกปฏิเสธ. request=', requestIdAddC);
          continue;
        }

        const { data: reqRowAddC, error: fetchErrAddC } = await supabase
          .from('classroom_requests')
          .select('token,status,teacher_add_ack_at,requested_date,requested_time,proposed_end_time,proposed_recurring,proposed_until,proposed_weekday,student_name,initiated_by')
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
        if (reqRowAddC.initiated_by === 'teacher' && !reqRowAddC.teacher_add_ack_at) {
          if (channelToken && event.replyToken) await replyLine(channelToken, event.replyToken, 'ℹ️ 學生還沒按「我知道了」確認，先不能新增');
          continue;
        }
        if (!reqRowAddC.requested_date || !reqRowAddC.requested_time) {
          if (channelToken && event.replyToken) await replyLine(channelToken, event.replyToken, '⚠️ 這筆申請缺少時間資料，請到網站手動處理');
          continue;
        }

        // ── 原子鎖：跟 confirm_cancel_delete 同一個欄位、同一套語意，防止跟網站同時搶著新增 ──
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

        const startTimeAddC = reqRowAddC.requested_time;
        const endTimeAddC = reqRowAddC.proposed_end_time || addOneHourTimeStr(startTimeAddC);
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

        // Calendar 建立成功——寫進課表資料庫（recurring_days 或 schedule，看是不是每週固定）
        let dbErrAddC = null;
        if (reqRowAddC.proposed_recurring) {
          const { error } = await supabase.from('classroom_recurring_days')
            .upsert({ token: reqRowAddC.token, weekday: reqRowAddC.proposed_weekday, start_time: startTimeAddC, end_time: endTimeAddC, calendar_event_id: createResultAddC.eventId }, { onConflict: 'token,weekday' });
          dbErrAddC = error;
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
            await replyLine(channelToken, event.replyToken, '⚠️ Calendar 已經建立成功了（事件 ID: ' + createResultAddC.eventId + '），但存課表資料庫失敗，請直接到 Supabase 手動確認這筆（id: ' + requestIdAddC + '），不要重複點這顆按鈕');
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

        if (channelToken && event.replyToken) {
          await replyLine(channelToken, event.replyToken, '✅ 已新增 Calendar 課程，並通知學生了');
        }

        // 通知學生（best-effort，失敗不影響已經成功的新增）
        if (channelToken && reqRowAddC.token) {
          try {
            const { data: stuRowAddC } = await supabase.from('classroom_students').select('line_user_id').eq('token', reqRowAddC.token).maybeSingle();
            if (stuRowAddC && stuRowAddC.line_user_id) {
              const timeLabelAddC = reqRowAddC.proposed_recurring
                ? ('每週固定 ' + startTimeAddC + '–' + endTimeAddC + '（泰國時間）')
                : (reqRowAddC.requested_date + ' ' + startTimeAddC + '（泰國時間）');
              await pushLine(channelToken, stuRowAddC.line_user_id, '✅ 你確認的加課已經排進 Calendar 了：' + timeLabelAddC);
            }
          } catch (e) { /* แจ้งนักเรียนไม่สำเร็จ ไม่กระทบว่าสร้าง Calendar สำเร็จแล้ว */ }
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

        // 2026-07-20 加：跟網站端 processClassRequestInner 一樣，Calendar 真的刪除成功之後
        // 存一筆備份紀錄，老師網站上「↩️ 最近處理（還能復原）」才看得到這筆（best-effort，失敗不擋流程）。
        await backupCalendarEventServer(supabase, requestIdCancel, reqRowCancel.token, 'delete', delResult.eventData);

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

      if (action === 'start_contact_student') {
        // 2026-07-20 加（Lin 要求：所有「💬 聯繫學生」按鈕統一改成這個，取代原本開網站的
        // contactStudentDeepLink）：老師按下去，記住「接下來打的字要轉給這個學生」，
        // 實際轉發邏輯在 handleTeacherTextMessage（收到老師下一句純文字時處理）。
        const teacherUserIdContact = Deno.env.get('LINE_TEACHER_USER_ID');
        const senderIsTeacherContact = event.source && teacherUserIdContact && event.source.userId === teacherUserIdContact;
        if (!senderIsTeacherContact) continue; // 不是老師本人按的，安全忽略
        const contactToken = params.get('token');
        if (!contactToken) continue;
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
