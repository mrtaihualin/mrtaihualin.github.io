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
//      **ไม่แตะ Google Calendar เอง** (แค่บันทึก offer_status/requested_date/requested_time)
//      ทั้งสองแบบตอนนี้ push แจ้งครูทันที (Lin ขอ) ไม่ต้องรอครูเปิดเว็บเองถึงจะรู้ · accept_offer
//      ตอนนี้ push เป็นปุ่ม "✅ 確認並搬 Calendar" กดจาก LINE ได้เลย (2026-07-22 加，ดูข้อ 9 ด้านล่าง)
//      ไม่ต้องเปิดเว็บอีกต่อไป (เดิมต้องเปิดเว็บกด "✅ 確認並搬 Calendar" เอง ก่อน service account พร้อม)
//   3) action=ack_teacher_cancel (2026-07-16 เพิ่ม) — ครูสั่งยกเลิกคาบ (teacherCancelClassNowInner)
//      ไม่ลบ Calendar ทันทีแล้ว ต้องรอนักเรียนกด "我知道了" ก่อน (กดฝั่ง LINE นี้ หรือฝั่งเว็บก็ได้ อันไหน
//      กดก่อนนับอันนั้น) → set teacher_cancel_ack_at แล้ว push แจ้งครูว่ากดยืนยันลบได้แล้ว
//      **ไม่แตะ Google Calendar เอง** (ครูต้องกลับไปกด "確認刪除 Calendar" ที่เว็บเอง)
//   4) action=ack_teacher_add — 🗑️ เลิกใช้แล้ว 2026-07-31 (ระบบ "รอนักเรียนกดยอมรับก่อนเพิ่มคาบ"
//      ถูกยกเลิกโดย Lin เมื่อ 2026-07-30) · เหลือไว้แค่ตัวตอบข้อความว่า "ปุ่มนี้เลิกใช้แล้ว" เพราะปุ่มเก่า
//      ค้างอยู่ในประวัติแชทของนักเรียนตลอดกาล ลบออกไม่ได้ · ไม่แตะฐานข้อมูล ไม่แตะ Calendar
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
//   7) action=decline_add_class — 🗑️ เลิกใช้แล้ว 2026-07-31 · เหตุผลเดียวกับข้อ 4 ด้านบน
//      (รวมเป็นตัวรับเดียวกันกับ ack_teacher_add แล้ว ตอบข้อความอย่างเดียว)
//   8) action=start_contact_student (2026-07-20 เพิ่ม, Lin ยืนยัน：「กดแล้วพิมพ์ตอบในแชทเดิมได้เลย」) —
//      ทุกปุ่ม "💬 聯繫學生" (เดิมเป็น uri เปิดเว็บผ่าน contactStudentDeepLink) เปลี่ยนมาใช้ action นี้
//      ทั้งหมดแล้ว: ครูกดปุ่ม → เขียนตาราง line_pending_reply (แถวเดียว id=1) จำว่า "ประโยคถัดไปที่ครูพิมพ์
//      ให้ส่งหานักเรียนคนนี้" → ครูพิมพ์ข้อความธรรมดาในแชทเดิม → event.type==='message' (ดู
//      handleTeacherTextMessage ด้านบน serve()) อ่านตาราง แล้ว pushLine ข้อความนั้นไปหานักเรียนทันที
//      แล้วเคลียร์ตารางทิ้ง (ใช้ได้ครั้งเดียวต่อการกด กันพิมพ์ประโยคถัดๆ ไปหลุดไปหาคนเดิม) หมดอายุ 15 นาที
//      ⚠️ ต้องรัน SQL สร้างตาราง line_pending_reply ก่อน (ดูไฟล์ SQL แยกที่เตรียมให้ Lin รันเอง)
//   9) action=confirm_reschedule_move (2026-07-22 เพิ่ม, Lin ขอ：改期也要能直接在 LINE 按一顆按鈕完成) —
//      ครูกดปุ่มเดียวใน LINE ยืนยัน "搬課堂" (หลังนักเรียนกด accept_offer เลือกเวลาใหม่แล้ว) → ตอนนี้
//      **PATCH เวลาของ Google Calendar event เดิมจริงทันที** ผ่าน service account (ดูฟังก์ชัน
//      moveCalendarEventById ด้านล่าง — เหมือน confirm_add_class/confirm_cancel_delete แต่เป็นการ "ย้าย"
//      ไม่ใช่สร้าง/ลบ) ใช้ classroom_requests.calendar_event_id ตรงตัว (ไม่เดาจากชื่อ+วันที่เหมือนเว็บรุ่นเก่า
//      confirmAcceptedOfferInner) เงื่อนไข: offer_status ต้องเป็น 'accepted' ก่อน (นักเรียนเลือกเวลาแล้ว)
//      ยืนยันสิทธิ์คนกดเป็นครู + atomic lock คอลัมน์เดียวกัน (processing_started_at) เหมือนข้อ 6
//      ย้ายสำเร็จแล้วเขียนบันทึกลง classroom_calendar_backups (action='move') ให้หน้าเว็บ "↩️ 最近處理
//      （還能復原）" เห็น+復原ได้เหมือนกดจากเว็บทุกประการ แล้วแจ้งทั้งนักเรียน(換算เป็นเวลาท้องถิ่นของ
//      นักเรียนเอง ถ้ามีข้อมูล timezone)และครูเอง
//   10) action=confirm_reschedule_pick (2026-07-22 เพิ่ม, Lin ขอ：學生自己申請改期，老師只能到網站處理，
//      系統不完整) — ทิศทางตรงข้ามกับข้อ 9: ข้อ 9 คือ "ครูเสนอเวลา รอนักเรียนเลือก" (offer_status ต้อง
//      ='accepted' ก่อน) ส่วนอันนี้คือ "นักเรียนเสนอ 1-3 เวลาเอง ครูเป็นคนตัดสินใจ" (offer_status ยังเป็น
//      'proposed' อยู่ ไม่ต้องรอใคร accept) ครูกดเลือกช่วงเวลาไหนใน LINE ก็ย้าย Calendar ทันทีช่วงนั้น
//      (ดู moveCalendarEventById ตัวเดียวกับข้อ 9) เช็ค initiated_by==='student' ก่อนเสมอ (กันครูกด
//      ปุ่มนี้ผิดกับรายการที่ตัวเองเป็นคนเสนอ ต้องไปกด accept_offer/confirm_reschedule_move แทน)
//      เหมือนฝั่งเว็บ teacherPickRescheduleOption → processClassRequestInner ทุกประการ
//      🆕 2026-08-01 ปุ่มนี้ต้องพก "เวลาที่เขียนอยู่บนปุ่ม" มาด้วย (&d=YYYY-MM-DD&t=HH:MM) เอาไว้เทียบ
//         กับตัวเลือกที่อ่านจากฐานข้อมูลตอนกด — ไม่ตรง = การ์ดล้าสมัย ไม่ย้าย (ปุ่มเก่าที่ไม่มี d/t
//         ยังกดได้เหมือนเดิม แต่ระบบจะบอกครูว่าเทียบให้ไม่ได้) ฝั่งที่สร้างปุ่มคือ
//         classroom/index.html → notifyTeacherClassRequest
//
// ── 🔴 2026-08-01 (งาน B1-B7) เพิ่มด่านให้ปุ่ม "ย้ายคาบ" 2 ตัว (ข้อ 9 กับ 10) เท่าเทียมกับฝั่งเว็บ ──
//   ก่อนหน้านี้ปุ่มทั้งสองยิง PATCH Calendar ได้เลยโดยแทบไม่มีด่านอะไรกั้น ทั้งที่ฝั่งเว็บ
//   (classroom/index.html → processClassRequestInner) มีครบมานานแล้ว ตอนนี้เพิ่มครบ:
//     B1 สำรองข้อมูล "ก่อน" ย้าย (สำรองพัง = ไม่ย้าย) แทนของเดิมที่สำรองหลังย้ายแบบ best-effort
//     B2 ห้ามย้ายคาบไปเวลาที่ผ่านไปแล้ว (เทียบถึงระดับชั่วโมง ตามเวลาไทย)
//     B3 ตรวจชนปฏิทินก่อนย้าย · ชน = ไม่ย้าย · ตรวจไม่ได้ = ไม่ย้าย (fail-closed)
//     B4 เทียบว่า calendar_event_id ที่จำไว้ยังชี้ไปคาบ "วันเดิม" (original_date) จริงไหม
//     B5 ย้ายสำเร็จแล้วอัปเดต classroom_schedule + รีเซ็ตธงเตือนทันที ไม่ต้องรอ cron
//     B6 ปุ่มเลือกเวลาต้องพกเวลาที่สัญญาไว้มาเทียบ (ดูข้อ 10)
//     B7 ไม่มี LINE_CHANNEL_SECRET = ตีกลับ 401 ไม่ประมวลผลอะไรเลย (เดิมข้ามการตรวจลายเซ็น)
//   ทุกด่าน B2/B3/B4 อยู่ "ก่อน" แย่งล็อก → ปฏิเสธแล้วไม่มีอะไรค้างต้องปลดคืน
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
      return { ok: false, reason: 'LINE 回應 ' + res.status + (detail ? '：' + detail.slice(0, 150) : '') };
    }
    return { ok: true, reason: '' };
  } catch (e) {
    return { ok: false, reason: (e && e.message) ? e.message : String(e) };
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
async function deleteCalendarEventById(eventId, expectedDateStr, beforeDeleteHook) {
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
      if (preEventData.status === 'cancelled') {
        // ถูกลบไปแล้วจากที่อื่นก่อนหน้านี้ — เราไม่ได้ลบอะไรเลย
        // ยังเรียก hook ให้เขียนแถวสำรองเหมือนพฤติกรรมเดิมก่อน 2026-08-01 แต่ **พังได้ไม่เป็นไร**
        // เพราะไม่มีอะไรถูกลบในรอบนี้ จึงไม่มีอะไรต้องกู้คืน
        if (beforeDeleteHook) { try { await beforeDeleteHook(preEventData); } catch (_e) { /* ตั้งใจปล่อยผ่าน */ } }
        return { ok: true, eventData: preEventData };
      }

      // 🟠 2026-07-31 เพิ่ม (งาน C4) — เทียบวันก่อนลบเสมอ ถ้าผู้เรียกส่งวันที่คาดหวังมาด้วย
      //
      // พังยังไงถ้าไม่มีด่านนี้ (เจอจริงตอนตรวจระบบ 2026-07-31):
      //   นักเรียนขอยกเลิกคาบวันที่ 5 → ระหว่างรอ คาบนั้นถูกเลื่อนไปวันที่ 7
      //   → เลขอ้างอิงคาบยังเป็นตัวเดิม (ใช้ได้อยู่) แต่ตอนนี้มันชี้ไป "วันที่ 7" แล้ว
      //   → ครูกดปุ่มเก่าใน LINE = ลบคาบวันที่ 7 ทิ้งเงียบๆ แล้วส่งบอกนักเรียนว่า "วันที่ 5 ยกเลิกแล้ว"
      //
      // ฝั่งเว็บมีด่านนี้อยู่แล้วตั้งแต่ 2026-07-26 (classroom/index.html:7663-7674)
      // แต่ฝั่งเว็บ "ถามครูก่อนได้" ว่าจะใช้วันใหม่ต่อไหม — ใน LINE ถามแบบนั้นไม่ได้ (กดไปแล้วถอยไม่ได้)
      // → ที่นี่เลือก "ปฏิเสธไปเลย" แล้วให้ครูไปทำที่เว็บ ปลอดภัยกว่าเดาเอง
      if (expectedDateStr) {
        const preStartIso = preEventData.start && (preEventData.start.dateTime || preEventData.start.date);
        const preDateStr = extractBangkokDateStr(preStartIso);
        if (preDateStr && preDateStr !== expectedDateStr) {
          return {
            ok: false,
            reason: 'date_mismatch',
            expectedDate: expectedDateStr,
            actualDate: preDateStr,
            detail: 'คำขอเขียนว่า ' + expectedDateStr + ' แต่คาบใน Calendar ตอนนี้อยู่วันที่ ' + preDateStr + ' — ยังไม่ได้แตะ Calendar เลย',
          };
        }
      }
    } else {
      const detail = await preRes.text().catch(() => '');
      return { ok: false, reason: 'pre_check_http_' + preRes.status, detail: detail.slice(0, 300) };
    }

    // ── 🔴 2026-08-01 เพิ่ม (ตรวจระบบยกเลิก/เพิ่มคาบ ข้อ 2) — สำรองข้อมูล "ก่อน" ลบ ──────────────
    // พังยังไงถ้าไม่มีด่านนี้ (ของเดิมเป็นแบบนั้นจริง):
    //   เดิมลบ Calendar ไปก่อน แล้วค่อยเขียนแถวสำรองทีหลังแบบ "พังก็ช่างมัน" (ไม่รับค่ากลับมาด้วยซ้ำ)
    //   → ถ้าเขียนแถวสำรองไม่สำเร็จ (RLS / เน็ต / ด่าน CHECK ของตาราง) = **คาบหายจาก Calendar แล้ว
    //     แต่ไม่มีแถวใน ↩️ 復原 = กู้คืนไม่ได้ตลอดกาล** และครูเห็นแต่คำว่า "✅ 已刪除" ไม่รู้เลยว่ามีปัญหา
    //   ผิดกฎ RELIABILITY FIRST ตรงๆ (ห้ามขึ้นว่าสำเร็จถ้ายังไม่ตรวจ + ของสำคัญต้องมีสำรอง)
    // ฝั่งเว็บทำถูกมาตลอด (classroom/index.html → assertBackupOk(backupCalendarEvent(...)) ก่อน
    //   deleteClassEventOnce) และเส้นทาง "ย้ายคาบ" ในไฟล์นี้ก็แก้ไปแล้ว (insertMoveBackupBeforeMove)
    //   → เส้นทาง "ลบคาบ" คือจุดสุดท้ายที่ยังเป็นของเก่า ตอนนี้ลอกหลักการเดียวกันมาครบ
    // ทำไมวางตรงนี้: ผ่านด่าน "มองเห็น event จริง" + ด่าน "วันตรงกัน" มาแล้ว จึงสำรองของที่ถูกตัวจริง
    //   และยัง **ไม่ได้แตะ Calendar เลยสักนิด** ถ้าสำรองพัง = ถอยออกได้สะอาด ไม่มีอะไรค้าง
    if (beforeDeleteHook) {
      let hookRes = null;
      try {
        hookRes = await beforeDeleteHook(preEventData);
      } catch (hookErr) {
        hookRes = { ok: false, why: (hookErr && hookErr.message) ? hookErr.message : String(hookErr) };
      }
      if (!hookRes || !hookRes.ok) {
        return {
          ok: false,
          reason: 'backup_failed',
          detail: 'สำรองข้อมูลคาบก่อนลบไม่สำเร็จ (' + ((hookRes && hookRes.why) || 'ไม่ทราบสาเหตุ') + ') — ยังไม่ได้แตะ Calendar เลย คาบยังอยู่ครบ',
        };
      }
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
// ℹ️ 2026-08-01：เส้นทาง "ย้ายคาบ" (action='move') **ไม่ใช้ตัวนี้แล้ว** — ย้ายไปสำรอง "ก่อน" แตะ Calendar
//    ด้วย insertMoveBackupBeforeMove แทน (ย้ายไปแล้วค่อยสำรองพัง = คืนค่าไม่ได้ตลอดกาล)
//    ตัวนี้เหลือใช้ที่เส้นทาง "ลบคาบ" (confirm_cancel_delete) ที่เดียว — ห้ามลบทิ้ง
//
// 🔴 2026-08-01 แก้ (ตรวจระบบยกเลิก/เพิ่มคาบ ข้อ 2) — เลิกเป็น best-effort แล้ว:
//    เดิมคืนค่า undefined เฉยๆ + เจอ error ก็แค่ console.error → **ผู้เรียกไม่มีทางรู้ว่าสำเร็จไหม**
//    ตอนนี้คืน { ok, why } เสมอ และถูกเรียก "ก่อน" ลบ (ดู beforeDeleteHook ใน deleteCalendarEventById)
//    สำรองไม่สำเร็จ = ไม่ลบ Calendar เลย · เขียนแล้วต้องอ่านกลับมาตรวจว่าได้แถวจริง (.select())
//    ไม่ใช่เชื่อแค่ว่า "ไม่มี error" — ท่าเดียวกับที่ก้อนเพิ่มคาบใช้อยู่แล้ว
async function backupCalendarEventServer(supabase, requestId, token, action, eventObj, newStartIso) {
  if (!eventObj) return { ok: false, why: 'ไม่มีข้อมูลคาบให้สำรอง' };
  try {
    const oldStartIso = eventObj.start && (eventObj.start.dateTime || eventObj.start.date);
    // 2026-07-22 加：action='move' 時跟網站端 backupCalendarEvent 一樣多存 new_event_id（搬移沒換 ID，
    // 就是同一個事件）+ new_start，「↩️ 最近處理（還能復原）」卡片才看得到「舊時間 → 新時間」。
    const { data, error } = await supabase.from('classroom_calendar_backups').insert({
      request_id: requestId || null,
      token: token || null,
      action: action,
      old_event_id: eventObj.id,
      new_event_id: action === 'move' ? eventObj.id : null,
      old_event_json: eventObj,
      old_start: oldStartIso,
      new_start: newStartIso || null,
    }).select().maybeSingle();
    if (error || !data) {
      const why = error ? error.message : 'เขียนแล้วแต่ไม่ได้ข้อมูลกลับมา';
      console.error('[line-webhook] ⚠️ 備份 Calendar 事件失敗（會擋住刪除，Calendar 不會被動到）：', why);
      return { ok: false, why: why };
    }
    // คืน id ของแถวสำรองด้วย — ผู้เรียกต้องเอาไปลบทิ้งถ้าสุดท้ายลบ Calendar ไม่สำเร็จ
    // (ไม่งั้นจะเหลือแถว "เคยลบคาบนี้" ทั้งที่คาบยังอยู่ → กด ↩️ 復原 = ได้คาบซ้ำ 2 คาบ)
    return { ok: true, backupId: data.id };
  } catch (e) {
    const why = (e && e.message) ? e.message : String(e);
    console.error('[line-webhook] ⚠️ 備份 Calendar 事件時發生例外：', why);
    return { ok: false, why: why };
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

function extractBangkokTimeStr(iso) {
  const d = new Date(iso);
  const totalMin = (d.getUTCHours() * 60 + d.getUTCMinutes() + 7 * 60) % (24 * 60);
  const hh = Math.floor(totalMin / 60), mm = totalMin % 60;
  return String(hh).padStart(2, '0') + ':' + String(mm).padStart(2, '0');
}

// ── 2026-08-01 เพิ่ม (งาน B1/B3) — สูตรคำนวณ "เวลาใหม่ของคาบที่จะย้าย" ตัวกลางตัวเดียว ──────
// ทำไมต้องแยกออกมา: ตั้งแต่วันนี้ ก้อนที่กดปุ่มใน LINE ต้องรู้เวลาใหม่ "ล่วงหน้า" ก่อนย้ายจริง 2 เรื่อง
//   (1) เอาไปตรวจว่าชนกับคาบอื่นไหม   (2) เอาไปเขียนแถวสำรอง (new_start) ก่อนแตะ Calendar
// ถ้าปล่อยให้แต่ละที่คำนวณเอง = มีสูตรเวลา 2 ชุดในเส้นทางเดียวกัน วันไหนแก้ชุดเดียวจะกลายเป็น
// "ตรวจชนเวลาหนึ่ง แต่ย้ายจริงอีกเวลาหนึ่ง" = ด่านตรวจชนไร้ความหมายทันที
// (บทเรียนเดียวกับที่เขียนไว้ในก้อน confirm_add_class เมื่อ 2026-07-31)
// ⚠️ bangkokToIso ปิดท้ายด้วย .toISOString() ซึ่ง **โยน error** เมื่อวันที่/เวลาแปลงไม่ได้
//    → ผู้เรียกต้องครอบ try/catch เสมอ (moveCalendarEventById มี try ครอบอยู่แล้วเหมือนเดิม)
function computeMovedTimes(preEventData, newDateStr, newTimeStrOrNull) {
  const oldStartIso = preEventData && preEventData.start && (preEventData.start.dateTime || preEventData.start.date);
  const oldEndIso = preEventData && preEventData.end && (preEventData.end.dateTime || preEventData.end.date);
  const durationMs = (oldStartIso && oldEndIso && (new Date(oldEndIso).getTime() - new Date(oldStartIso).getTime())) || 3600000;
  const effectiveTimeStr = newTimeStrOrNull || (oldStartIso ? extractBangkokTimeStr(oldStartIso) : '00:00');
  const newStartIso = bangkokToIso(newDateStr, effectiveTimeStr);
  const newEndIso = new Date(new Date(newStartIso).getTime() + durationMs).toISOString();
  return { oldStartIso, oldEndIso, durationMs, effectiveTimeStr, newStartIso, newEndIso };
}

// ── 2026-08-01 เพิ่ม (งาน B1/B4) — อ่านคาบจาก Calendar เฉยๆ "ไม่แตะอะไรทั้งสิ้น" ──────────────
// ทำไมต้องมี: ก่อนย้ายคาบ ต้องรู้ข้อมูลคาบเดิมก่อนลงมือ 2 เรื่อง
//   (1) เขียนแถวสำรองให้สำเร็จ "ก่อน" ย้าย — ย้ายไปแล้วค่อยสำรองพัง = กดคืนค่าไม่ได้ตลอดกาล
//   (2) เทียบว่า calendar_event_id ที่จำไว้ ยังชี้ไปคาบวันเดิมจริงไหม (คาบอาจถูกเลื่อนไปแล้วระหว่างรอ)
// 🛑 ตั้งใจ "ไม่" ไปแก้ moveCalendarEventById ให้รับ event ที่อ่านมาแล้ว — ปล่อยให้มันอ่านซ้ำเองอีกรอบ
//    ก่อน PATCH เหมือนเดิมทุกประการ: ยิง Google เพิ่ม 1 ครั้ง (ราคาถูก) แลกกับการ "ไม่แตะ" ด่านที่
//    ทำงานถูกต้องอยู่แล้ว และยังได้ตรวจซ้ำว่าคาบไม่ได้ถูกลบทิ้งไประหว่างที่เรากำลังตรวจอย่างอื่นอยู่
// เหตุผลที่ 404/410 ต้องแยกเป็นคนละ reason กับ error อื่น: เหมือน deleteCalendarEventById —
//   "มองไม่เห็นตั้งแต่ต้น" (ไม่ได้แชร์ปฏิทิน/ID ผิด) ต่างจาก "เชื่อมต่อไม่ได้ชั่วคราว" คนละวิธีแก้
async function fetchCalendarEventById(eventId) {
  const token = await getGoogleCalendarToken();
  if (!token) return { ok: false, reason: 'no_token' };
  const calendarId = Deno.env.get('GOOGLE_CALENDAR_ID');
  if (!calendarId) return { ok: false, reason: 'no_calendar_id', detail: 'ยังไม่ได้ตั้ง secret GOOGLE_CALENDAR_ID' };
  const eventUrl = 'https://www.googleapis.com/calendar/v3/calendars/' + encodeURIComponent(calendarId) + '/events/' + encodeURIComponent(eventId);
  try {
    const res = await fetch(eventUrl, { headers: { Authorization: 'Bearer ' + token } });
    if (res.status === 404 || res.status === 410) {
      return { ok: false, reason: 'not_visible', detail: '服務帳號目前看不到這個 event（' + res.status + '）——請確認 Calendar 有分享給服務帳號、GOOGLE_CALENDAR_ID 有沒有寫對' };
    }
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      return { ok: false, reason: 'http_' + res.status, detail: detail.slice(0, 300) };
    }
    const ev = await res.json().catch(() => ({}));
    if (ev.status === 'cancelled') {
      return { ok: false, reason: 'already_cancelled', detail: '這堂課的 Calendar 事件已經被刪除了，沒辦法搬' };
    }
    return { ok: true, event: ev };
  } catch (e) {
    return { ok: false, reason: 'fetch_error', detail: e.message };
  }
}

// action=confirm_reschedule_move 用（2026-07-22 加，Lin 要求：改期也要能直接在 LINE 按一顆按鈕完成）：
// 把已存在的事件 PATCH 成新的開始/結束時間（搬課堂），課堂長度沿用原本事件的長度，跟網站端
// confirmAcceptedOfferInner 的邏輯一樣，只是這裡用服務帳號直接動 Calendar，不用等老師開電腦。
// 一樣先 GET 證明服務帳號看得到這個 event、PATCH 完再 GET 驗證時間真的改了（RELIABILITY FIRST，
// 跟 deleteCalendarEventById／createCalendarEventById 同一套「不能只信任 API 回應」原則）。
async function moveCalendarEventById(eventId, newDateStr, newTimeStrOrNull) {
  const token = await getGoogleCalendarToken();
  if (!token) return { ok: false, reason: 'no_token' };
  const calendarId = Deno.env.get('GOOGLE_CALENDAR_ID');
  if (!calendarId) return { ok: false, reason: 'no_calendar_id', detail: 'ยังไม่ได้ตั้ง secret GOOGLE_CALENDAR_ID' };
  const eventUrl = 'https://www.googleapis.com/calendar/v3/calendars/' + encodeURIComponent(calendarId) + '/events/' + encodeURIComponent(eventId);
  try {
    const preRes = await fetch(eventUrl, { headers: { Authorization: 'Bearer ' + token } });
    if (preRes.status === 404 || preRes.status === 410) {
      return { ok: false, reason: 'not_visible', detail: '服務帳號目前看不到這個 event（' + preRes.status + '）——請確認 Calendar 有分享給服務帳號、GOOGLE_CALENDAR_ID 有沒有寫對' };
    }
    if (!preRes.ok) {
      const detail = await preRes.text().catch(() => '');
      return { ok: false, reason: 'pre_check_http_' + preRes.status, detail: detail.slice(0, 300) };
    }
    const preEventData = await preRes.json().catch(() => ({}));
    if (preEventData.status === 'cancelled') {
      return { ok: false, reason: 'already_cancelled', detail: '這堂課的 Calendar 事件已經被刪除了，沒辦法搬' };
    }

    // 2026-08-01 แก้: ย้ายสูตรคำนวณเวลา 6 บรรทัดเดิมออกไปเป็น computeMovedTimes ด้านบน (ผลลัพธ์เหมือนเดิมเป๊ะ
    // ไม่ได้เปลี่ยนพฤติกรรมอะไร) เพื่อให้ "ด่านตรวจก่อนย้าย" กับ "การย้ายจริง" ใช้สูตรชุดเดียวกันเสมอ
    const { newStartIso, newEndIso } = computeMovedTimes(preEventData, newDateStr, newTimeStrOrNull);

    const patchRes = await fetch(eventUrl, {
      method: 'PATCH',
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ start: { dateTime: newStartIso, timeZone: 'Asia/Bangkok' }, end: { dateTime: newEndIso, timeZone: 'Asia/Bangkok' } }),
    });
    if (!patchRes.ok) {
      const detail = await patchRes.text().catch(() => '');
      return { ok: false, reason: 'http_' + patchRes.status, detail: detail.slice(0, 300) };
    }

    // PATCH 完一定要回頭 GET 確認時間真的改了，不能只信任 PATCH 當下的回應（RELIABILITY FIRST）
    const verifyRes = await fetch(eventUrl, { headers: { Authorization: 'Bearer ' + token } });
    if (!verifyRes.ok) return { ok: false, reason: 'verify_failed_http_' + verifyRes.status, eventMovedButUnverified: true };
    const verifyEv = await verifyRes.json();
    const actualStart = verifyEv.start && (verifyEv.start.dateTime || verifyEv.start.date);
    if (!actualStart || Math.abs(new Date(actualStart).getTime() - new Date(newStartIso).getTime()) > 60000) {
      return { ok: false, reason: 'verify_mismatch', detail: 'Calendar 顯示的時間跟預期不一樣（顯示：' + (actualStart || '無') + '）', eventMovedButUnverified: true };
    }
    return { ok: true, oldEventData: preEventData, newStartIso: newStartIso };
  } catch (e) {
    return { ok: false, reason: 'fetch_error', detail: e.message };
  }
}

// ════════════════════════════════════════════════════════════════════════════
// 2026-08-01 เพิ่ม (งาน B2 + B3 + B4) — ด่านตรวจก่อน "ย้ายคาบ" จากปุ่มใน LINE
//
// เดิมปุ่ม ✅ 確認並搬 Calendar / 確認搬到這個時間 ใน LINE **ไม่มีด่านอะไรเลย** ก่อนย้ายจริง —
// ทั้งที่ฝั่งเว็บ (classroom/index.html → processClassRequestInner) มีครบ 3 ด่านมาตลอด:
//   B4 เทียบว่า calendar_event_id ที่จำไว้ยังชี้ไป "คาบวันเดิม" จริงไหม (เว็บ: บรรทัด ~7884)
//   B2 ห้ามย้ายคาบไปเวลาที่ผ่านไปแล้ว        (เว็บ: assertNotPastDate บรรทัด ~7974)
//   B3 ตรวจว่าเวลาใหม่ชนกับคาบอื่นไหม        (เว็บ: findConflictingEvents บรรทัด ~7980)
//
// ⚠️ ต่างจากเว็บตรงนี้ (จงใจเข้มกว่า): เว็บ "ถามครูก่อนได้" (confirm) แล้วครูเลือกจะไปต่อก็ได้
//    แต่ใน LINE กดปุ่มแล้วถอยไม่ได้ ถามอะไรไม่ได้เลย → เจอปัญหา = **ปฏิเสธไปเลย** แล้วให้ไปทำที่เว็บ
//    (ท่าเดียวกับที่ก้อน confirm_cancel_delete/confirm_add_class ใช้อยู่แล้ว)
// ⚠️ ตรวจไม่ได้ = ไม่อนุญาต (fail-closed) เสมอ ห้ามตีความว่า "ไม่มีอะไรชน"
//    ถ้าปล่อยผ่านตอน Google ล่ม = ด่านจะหายไปเงียบๆ ตอนที่ต้องการมันที่สุด (RELIABILITY FIRST)
//
// ทุกด่านที่นี่อยู่ "ก่อน" การแย่งล็อกและก่อนแตะ Calendar ทั้งหมด → ปฏิเสธแล้วไม่มีอะไรต้องคืนค่า
// คืนค่า: { ok:true, preEvent, times } หรือ { ok:false, logReason, replyText }
// ════════════════════════════════════════════════════════════════════════════
async function precheckRescheduleMoveTarget(eventId, targetDate, targetTimeOrNull, originalDate, requestId) {
  const siteLink = 'https://mrtaihualin.com/classroom/#req-row-' + requestId;

  // ── อ่านคาบเดิมจาก Calendar (แค่อ่าน) ──
  const pre = await fetchCalendarEventById(eventId);
  if (!pre.ok) {
    return {
      ok: false,
      logReason: 'read_event_' + (pre.reason || 'unknown'),
      replyText: '🛑 讀不到這堂課的行事曆資料（' + (pre.reason || '未知') + '），完全沒有動任何東西。\n' +
        (pre.detail ? pre.detail + '\n' : '') +
        '請稍後再按一次，或到網站處理：' + siteLink,
    };
  }
  const preEvent = pre.event;

  // ── B4：ID 對得上「哪一天」嗎 ──────────────────────────────────────────────
  // พังยังไงถ้าไม่มีด่านนี้ (เคสเดียวกับที่ฝั่งยกเลิกเจอจริงเมื่อ 2026-07-31):
  //   นักเรียนขอเลื่อนคาบวันที่ 5 → ระหว่างรอ คาบนั้นถูกย้ายไปวันที่ 7 ด้วยเหตุอื่น
  //   → เลขอ้างอิงคาบยังใช้ได้ แต่ตอนนี้ชี้ไป "วันที่ 7" → กดปุ่มเก่า = ย้ายคาบผิดตัวเงียบๆ
  // original_date ว่าง = ข้ามเฉพาะการเทียบนี้ (ด่านอื่นยังทำงานครบ) ไม่ใช่เหตุผลที่จะบล็อกทั้งงาน
  const evDateStr = extractBangkokDateStr(preEvent.start && (preEvent.start.dateTime || preEvent.start.date));
  if (originalDate && evDateStr && evDateStr !== String(originalDate)) {
    return {
      ok: false,
      logReason: 'date_mismatch',
      replyText: '⚠️ 對不上，所以沒有搬任何課堂。\n' +
        '這筆申請寫的原本課堂是 ' + originalDate + '，\n' +
        '但 Calendar 上這堂課現在的日期是 ' + evDateStr + '（中間可能已經被改期過了）。\n' +
        '網站上可以看清楚再決定要不要繼續，LINE 這裡沒辦法問，所以一律不動：\n' + siteLink,
    };
  }

  // ── คำนวณเวลาใหม่ด้วยสูตรตัวเดียวกับตอนย้ายจริง (computeMovedTimes) ──
  let times = null;
  try {
    times = computeMovedTimes(preEvent, targetDate, targetTimeOrNull);
  } catch (eTime) {
    const whyTime = (eTime && eTime.message) ? eTime.message : String(eTime);
    return {
      ok: false,
      logReason: 'bad_time',
      replyText: '🛑 這筆申請的新時間讀不出來（' + targetDate + ' ' + (targetTimeOrNull || '') + '），沒有搬任何課堂。\n' +
        '原因：' + whyTime + '\n請到網站處理：' + siteLink,
    };
  }
  const newStartMs = new Date(times.newStartIso).getTime();
  const newEndMs = new Date(times.newEndIso).getTime();
  if (!isFinite(newStartMs) || !isFinite(newEndMs) || newEndMs <= newStartMs) {
    return {
      ok: false,
      logReason: 'bad_time_range',
      replyText: '🛑 這筆申請的新時間怪怪的（' + targetDate + ' ' + (times.effectiveTimeStr || '') + '），沒有搬任何課堂。\n' +
        '結束時間沒有比開始時間晚。請到網站處理：' + siteLink,
    };
  }

  // ── B2：ห้ามย้ายคาบไปเวลาที่ผ่านไปแล้ว ─────────────────────────────────────
  // กฎที่ Lin สั่งไว้เอง และเขียนไว้ในโค้ดฝั่งเว็บแล้ว (classroom/index.html:1403):
  //   "ห้ามจัด/ย้าย/ตั้งคาบไปวันย้อนหลัง ทุกจุดในแอปนี้ ไม่มีปุ่มยกเว้น ไม่มี 'ยืนยันแล้วผ่านได้'"
  // 🔎 ที่นี่เทียบละเอียดถึง "ชั่วโมง" ไม่ใช่แค่วัน — คำขอที่ค้างคิวมาทั้งวัน เวลา 09:00 ของวันนี้
  //    ก็เป็นอดีตไปแล้วเหมือนกัน (ฝั่งเว็บเทียบแค่ระดับวัน ที่นี่จึงเข้มกว่าโดยตั้งใจ:
  //    ครูที่กดจากมือถือไม่มีทางเห็นตารางเทียบเอง เลยต้องกันให้แน่นกว่า)
  if (newStartMs <= Date.now()) {
    const nowLabel = formatIsoInTz(new Date().toISOString(), 'Asia/Bangkok') || new Date().toISOString();
    const targetLabel = formatIsoInTz(times.newStartIso, 'Asia/Bangkok') || times.newStartIso;
    return {
      ok: false,
      logReason: 'past_target',
      replyText: '🛑 這個新時間（' + targetLabel + '，泰國時間）已經過去了，沒有搬任何課堂。\n' +
        '現在是 ' + nowLabel + '（泰國時間）。系統一律不把課排到已經過去的時間。\n' +
        '請跟學生約一個新的時間，或到網站處理：' + siteLink,
    };
  }

  // ── B3：เวลาใหม่ชนกับคาบ/ธุระอื่นไหม ───────────────────────────────────────
  // ใช้ตัวเดียวกับปุ่ม 🔍 檢查是否衝突 (checkFreebusyConflictService) ซึ่ง fail-closed อยู่แล้ว
  // ⚠️ ข้อจำกัดของ freeBusy: มันบอกได้แค่ "ช่วงไหนไม่ว่าง" บอกไม่ได้ว่าเป็นคาบไหน และ
  //    **กันคาบของตัวเองออกไม่ได้** (ฝั่งเว็บใช้ findConflictingEvents ที่ตัด ev.id ออกได้)
  //    → เคสจริงที่จะเจอ: ย้ายคาบไปเวลาที่คาบเดิมของตัวเองยังคาบเกี่ยวอยู่ (เช่น 10:00 → 10:30)
  //      จะเห็น "ตัวเอง" เป็นสิ่งกีดขวางแล้วปฏิเสธทั้งที่ไม่ควร
  //    → แก้โดยตัดช่วงที่ "ตรงกับเวลาเดิมของคาบนี้เป๊ะ" ออก (คลาดเคลื่อนได้ไม่เกิน 1 นาที)
  //      กันเฉพาะตัวมันเอง ไม่ได้ผ่อนให้คาบอื่น
  const fb = await checkFreebusyConflictService(times.newStartIso, times.newEndIso);
  if (!fb.ok) {
    return {
      ok: false,
      logReason: 'freebusy_failed_' + (fb.reason || 'unknown'),
      replyText: '🛑 沒辦法檢查行事曆有沒有衝突（' + (fb.reason || '未知') + '），所以這次沒有搬任何課堂。\n' +
        (fb.detail ? fb.detail + '\n' : '') +
        '「檢查不了」一律當成「不可以搬」，避免不小心搬到已經有課的時段。\n' +
        '請稍後再按一次，或到網站處理：' + siteLink,
    };
  }
  const selfStartMs = times.oldStartIso ? new Date(times.oldStartIso).getTime() : NaN;
  const selfEndMs = times.oldEndIso ? new Date(times.oldEndIso).getTime() : NaN;
  const hits = [];
  for (const b of (fb.busy || [])) {
    const bStart = new Date(b.start).getTime();
    const bEnd = new Date(b.end).getTime();
    if (!isFinite(bStart) || !isFinite(bEnd)) continue;
    // ทับกันจริงเมื่อ "เริ่มก่อนที่เราจบ" และ "จบหลังที่เราเริ่ม" (ชนขอบพอดีไม่นับว่าทับ)
    if (!(bStart < newEndMs && bEnd > newStartMs)) continue;
    // 🔴 2026-08-01 (แก้รอบตรวจซ้ำ) — เดิมเทียบว่า "ขอบตรงกันเป๊ะ ±1 นาที" ซึ่งผิด
    //   Google ตัดช่วงเวลาที่ตอบกลับมาให้อยู่ในกรอบที่เราถามเสมอ (timeMin/timeMax = เวลาใหม่)
    //   → ย้ายคาบ 10:00-11:00 ไป 10:30-11:30 จะได้ช่วงของตัวเองกลับมาเป็น 10:30-11:00 (ถูกตัดหัว)
    //     ขอบทั้งสองข้างไม่ตรงกับของเดิมเลย → ระบบนึกว่าเป็นคาบคนอื่น → ปฏิเสธการเลื่อนแบบ
    //     "ขยับ 30 นาที" ซึ่งเป็นกรณีที่ใช้บ่อยที่สุด (ปุ่มใน LINE จะกดไม่ผ่านตลอด)
    //   ถูกต้องคือ: ช่วงที่ "อยู่ในกรอบเวลาเดิมของคาบนี้" = ตัวมันเอง (เผื่อคลาด 1 นาที)
    const isSelf = isFinite(selfStartMs) && isFinite(selfEndMs)
      && bStart >= selfStartMs - 60000 && bEnd <= selfEndMs + 60000;
    if (isSelf) continue;
    hits.push(b);
  }
  if (hits.length) {
    const listTxt = hits.slice(0, 5).map((b) =>
      '・' + (formatIsoInTz(b.start, 'Asia/Bangkok') || b.start) + ' – ' + (formatIsoInTz(b.end, 'Asia/Bangkok') || b.end)).join('\n');
    return {
      ok: false,
      logReason: 'conflict',
      replyText: '🛑 新時間跟行事曆上已經有的課／行程撞到了，沒有搬任何課堂（泰國時間）：\n' + listTxt +
        (hits.length > 5 ? '\n・…還有 ' + (hits.length - 5) + ' 筆也撞到' : '') +
        '\n\n真的要讓兩堂重疊的話，請到網站處理（網站會問過你才動）：\n' + siteLink,
    };
  }

  return { ok: true, preEvent, times };
}

// ── 2026-08-01 เพิ่ม (งาน B1) — เขียนแถวสำรอง "ก่อน" ย้ายคาบ ───────────────────────────
// เดิมเขียนสำรอง "หลัง" ย้าย และถือเป็น best-effort (backupCalendarEventServer)
//   → สำรองพลาดเมื่อไหร่ = คาบย้ายไปแล้วโดยไม่มีทางกด ↩️ 復原 คืนได้เลย และไม่มีใครรู้ตัว
// ฝั่งเว็บเข้มกว่ามาตลอด: assertBackupOk (classroom/index.html:2704) โยน error หยุดทั้งงาน
//   "ก่อน" แตะ Calendar — ที่นี่ทำให้ตรงกัน
// 🔑 ทำไมกฎนี้ต่างจากก้อน "เพิ่มคาบ" (ที่สำรองพังแล้วไปต่อได้): ที่นั่นคาบถูกสร้างไปแล้วจริงก่อนถึง
//    ขั้นสำรอง หยุดตรงนั้น = ครูกดซ้ำ = ได้คาบซ้อนกัน 2 คาบ · ส่วนที่นี่ยังไม่แตะ Calendar เลย
//    หยุดได้อย่างปลอดภัย ไม่มีอะไรค้างกลางทาง
// ค่า action ที่ตารางนี้ยอมรับมีแค่: move / delete / permanent_change / archive_student / create
async function insertMoveBackupBeforeMove(supabase, requestId, token, eventObj, newStartIso) {
  try {
    if (!eventObj || !eventObj.id) return { ok: false, why: 'ไม่มีข้อมูลคาบเดิมให้สำรอง' };
    const oldStartIso = eventObj.start && (eventObj.start.dateTime || eventObj.start.date);
    const { data, error } = await supabase
      .from('classroom_calendar_backups')
      .insert({
        request_id: requestId || null,
        token: token || null,
        action: 'move',
        // ย้ายคาบไม่ได้เปลี่ยน ID = เหตุการณ์เดียวกัน (ตรงกับ backupCalendarEvent ฝั่งเว็บ)
        // การ์ด「↩️ 最近處理（還能復原）」ต้องมี new_event_id + new_start ถึงจะโชว์ "เวลาเก่า → เวลาใหม่"
        old_event_id: eventObj.id,
        new_event_id: eventObj.id,
        old_event_json: eventObj,
        old_start: oldStartIso,
        new_start: newStartIso || null,
      })
      .select()
      .maybeSingle();
    if (error || !data) return { ok: false, why: error ? error.message : 'ฐานข้อมูลไม่ได้คืนแถวที่บันทึกกลับมา' };
    // คืนเลขแถวสำรองออกไปด้วย — ถ้าการย้ายพังทีหลัง ผู้เรียกต้องลบแถวนี้ทิ้ง (ดู removeMoveBackupRow)
    return { ok: true, why: '', backupId: data.id };
  } catch (e) {
    return { ok: false, why: (e && e.message) ? e.message : String(e) };
  }
}

// ── 2026-08-01 เพิ่ม (แก้จากรอบตรวจซ้ำ) — ลบแถวสำรองทิ้ง เมื่อ "ย้ายไม่สำเร็จจริงๆ" ────────────
// ทำไมต้องมี: ตอนนี้เราสำรอง "ก่อน" ย้าย (ถูกต้องแล้ว) แต่ถ้าย้ายพัง แถวสำรองจะค้างอยู่
//   → การ์ด「↩️ 最近處理（還能復原）」ของครูจะขึ้นรายการ "เวลาเก่า → เวลาใหม่" ของคาบที่ไม่เคยถูกย้าย
//     กดคืนค่าก็ไม่เกิดอะไร (ย้ายกลับไปที่เดิมที่มันอยู่แล้ว) · กดซ้ำหลายรอบก็ได้แถวขยะเพิ่มเรื่อยๆ
// ⚠️ ห้ามเรียกตัวนี้ตอน eventMovedButUnverified — กรณีนั้น "อาจย้ายไปแล้วจริง" แถวสำรองคือของจำเป็น
async function removeMoveBackupRow(supabase, backupId, whereLabel) {
  if (!backupId) return;
  try {
    const { error } = await supabase.from('classroom_calendar_backups').delete().eq('id', backupId);
    if (error) console.warn('[line-webhook] ⚠️ ' + whereLabel + ': ลบแถวสำรองที่ไม่ได้ใช้ทิ้งไม่สำเร็จ (ไม่กระทบอะไร แต่การ์ดคืนค่าจะมีรายการขยะ 1 แถว):', error.message);
  } catch (e) {
    console.warn('[line-webhook] ⚠️ ' + whereLabel + ': ลบแถวสำรองที่ไม่ได้ใช้ทิ้งพัง:', (e && e.message) || e);
  }
}

// ── 2026-08-01 เพิ่ม (งาน B5) — ย้ายคาบสำเร็จแล้ว อัปเดตตารางเรียนทันที ไม่ต้องรอ cron ────────
// เหตุผลเดียวกับที่ก้อน confirm_cancel_delete ทำตอนลบ (Lin จับ race condition ได้เอง 2026-07-30):
//   calendar-schedule-sync-cron รันทุก 15-30 นาที แต่ class-reminder-cron รันทุก 5 นาที
//   → ช่วงว่างระหว่างนั้น ตัวเตือนยังอ่าน lesson_date/start_time "เวลาเก่า" อยู่ = เตือนผิดเวลา
// ต้องรีเซ็ตธง "เตือนไปแล้ว" ด้วย ไม่งั้นคาบที่เคยถูกเตือนตอนเวลาเก่า จะไม่มีวันถูกเตือนในเวลาใหม่เลย
//   line_reminder24h_sent = ตัวที่ class-reminder-cron ใช้จริงตอนนี้
//   line_reminder_sent / line_followup_sent = ของเก่าที่ยังอยู่ในฐานข้อมูล (ดูคอมเมนต์หัวไฟล์
//     class-reminder-cron/index.ts) → เผื่อวันไหนถูกลบทิ้ง โค้ดนี้ถอยไปอัปเดตเฉพาะตัวที่ใช้จริงเอง
// ⚠️ ล้มเหลวที่นี่ **ห้ามย้อนการย้ายคาบ** — Google Calendar คือความจริงหลัก และ cron จะตามแก้ให้เอง
//    ภายใน 15-30 นาที · แต่ต้องเตือนดังๆ ใน log + บอกครูในข้อความตอบกลับ ห้ามเงียบ (RELIABILITY FIRST)
async function syncScheduleRowAfterMove(supabase, calendarEventId, newDateStr, newStartTimeStr, newEndTimeStr) {
  const baseFields = {
    lesson_date: newDateStr,
    start_time: newStartTimeStr,
    end_time: newEndTimeStr,
    line_reminder24h_sent: false,
  };
  const withLegacyFields = Object.assign({}, baseFields, { line_reminder_sent: false, line_followup_sent: false });
  try {
    let { error, count } = await supabase
      .from('classroom_schedule')
      .update(withLegacyFields, { count: 'exact' })
      .eq('calendar_event_id', calendarEventId);
    if (error && (error.code === 'PGRST204' || error.code === '42703'
      || /column .* does not exist|could not find the .* column/i.test(error.message || ''))) {
      console.warn('[line-webhook] ℹ️ อัปเดตธงเตือนตัวเก่าไม่ได้ (คอลัมน์อาจถูกลบไปแล้ว) → ลองใหม่เฉพาะ line_reminder24h_sent:', error.message);
      ({ error, count } = await supabase
        .from('classroom_schedule')
        .update(baseFields, { count: 'exact' })
        .eq('calendar_event_id', calendarEventId));
    }
    if (error) return { ok: false, why: error.message, count: 0 };
    return { ok: true, why: '', count: count || 0 };
  } catch (e) {
    return { ok: false, why: (e && e.message) ? e.message : String(e), count: 0 };
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
      // 🔴 2026-08-01 เพิ่ม log (เจอจริง: กดปุ่มแล้วเงียบสนิท ไล่หาสาเหตุไม่ได้)
      //   ปุ่มที่ระบบไม่รู้จักจะตกไปที่ท้ายสุด "ไม่ทำอะไรเลย" แบบเงียบๆ (ดูคอมเมนต์ท้าย loop)
      //   บรรทัดนี้ทำให้รู้ทันทีว่า "ปุ่มถูกกดจริง และชื่อปุ่มที่ส่งมาคืออะไร"
      console.log('[line-webhook] 📩 ได้รับการกดปุ่ม action=' + actionForLog + ' · data=' + String(data).slice(0, 200));

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

        // 🔴 2026-08-01 เพิ่ม 2 ด่าน (จากรอบตรวจซ้ำ — ด่านนี้เคยมีแค่ฝั่งเว็บ/ฝั่ง RPC)
        //   .eq('status','pending')            → ห้ามตอบรับ/ปฏิเสธคำขอที่ "ปิดไปแล้ว"
        //   .is('processing_started_at', null) → ห้ามตอบตอนที่ครูกำลังคุยกับ Google Calendar อยู่
        //     (ไม่งั้นครูย้ายคาบไปเวลาหนึ่ง แต่นักเรียนเพิ่งเขียนทับเป็นอีกเวลาหนึ่งพร้อมกัน)
        //   ⚠️ สำคัญ: ปุ่มใน LINE คือทางที่นักเรียน "ใช้จริงบ่อยที่สุด" — ถ้าอุดแต่ใน RPC
        //      (respond_to_offer_as_student ของฝั่งเว็บ) เท่ากับอุดประตูที่คนไม่ค่อยเดิน
        //      แล้วเปิดประตูใหญ่ทิ้งไว้ · ต้องอุดทั้ง 2 ทางเสมอ
        const { error, count } = await supabase
          .from('classroom_requests')
          .update(updateFields, { count: 'exact' })
          .eq('id', requestId)
          .eq('offer_status', 'proposed')
          .eq('status', 'pending')
          .is('processing_started_at', null);

        if (channelToken && event.replyToken) {
          let replyText;
          if (error) replyText = '⚠️ 回覆失敗：' + error.message;
          else if (!count) replyText = 'ℹ️ 這個提議可能已經被回覆過了，或老師正在處理中，請重新整理網頁看看目前狀態';
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
              // 2026-07-22 改（Lin 要求：改期也要能直接在 LINE 按一顆按鈕完成，不用開網站）：
              // 以前這裡只推純文字叫老師自己去網站按，現在附一顆按鈕，共用下面新增的
              // action=confirm_reschedule_move（跟 confirm_add_class／confirm_cancel_delete 同一套模式）。
              const timeLabel = chosenOpt ? (chosenOpt.date + (chosenOpt.time ? ' ' + chosenOpt.time : '')) : '（時間資料異常，請到網站確認）';
              await pushLineFlex(channelToken, teacherUserId, 'ℹ️ 學生已經選好新時間', '時間：' + timeLabel + '（泰國時間）\n\n可以直接按下方按鈕搬 Calendar，或到網站處理',
                [{ label: '✅ 確認並搬 Calendar', postbackData: 'action=confirm_reschedule_move&request=' + encodeURIComponent(requestId), style: 'primary' }]);
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

      if (action === 'confirm_reschedule_move') {
        // ── 2026-07-22 加（Lin 要求：學生接受新時間後，老師要能直接在 LINE 按一顆按鈕把課搬過去，
        // 不用開網站）── 前提：這筆 classroom_requests 一定要有 calendar_event_id（原本課堂事件的
        // ID，送出改期申請時就存進去了）跟 offer_status='accepted'（學生已經選好新時間，存在
        // requested_date/requested_time）。用 ID 直接動，不像網站舊版 confirmAcceptedOfferInner
        // 那樣用姓名+日期搜尋（更準、也不用等找不到/找到多筆的情況）。
        const requestIdMove = params.get('request');
        if (!requestIdMove) continue;

        const teacherUserIdMove = Deno.env.get('LINE_TEACHER_USER_ID');
        const senderIsTeacherMove = event.source && teacherUserIdMove && event.source.userId === teacherUserIdMove;
        if (!senderIsTeacherMove) {
          console.error('[line-webhook] ⚠️ confirm_reschedule_move: ผู้กดไม่ใช่ครู ถูกปฏิเสธ. request=', requestIdMove);
          // 🟡 2026-07-31 เพิ่ม (งาน C13 ที่เหลือ — ลอกจากก้อน confirm_cancel_delete):
          //   เดิมเงียบสนิท ไม่ตอบอะไรเลย → ปุ่มจะดูเหมือน "ตายสนิท" ถ้า LINE_TEACHER_USER_ID ตั้งผิด
          if (channelToken && event.replyToken) {
            await replyLine(channelToken, event.replyToken, '⚠️ 這個 LINE 帳號沒有老師權限，沒有執行任何動作。');
          }
          continue;
        }

        const { data: reqRowMove, error: fetchErrMove } = await supabase
          .from('classroom_requests')
          // 2026-08-01 เพิ่ม original_date — ด่าน B4 ต้องใช้เทียบว่า calendar_event_id ยังชี้ไปคาบวันเดิมจริงไหม
          .select('calendar_event_id,status,token,requested_date,requested_time,offer_status,student_name,original_date')
          .eq('id', requestIdMove)
          .maybeSingle();

        if (fetchErrMove || !reqRowMove) {
          if (channelToken && event.replyToken) await replyLine(channelToken, event.replyToken, '⚠️ 找不到這筆申請了，請到網站確認');
          continue;
        }
        if (reqRowMove.status === 'acknowledged') {
          if (channelToken && event.replyToken) await replyLine(channelToken, event.replyToken, 'ℹ️ 這筆已經處理過了');
          continue;
        }
        if (reqRowMove.offer_status !== 'accepted') {
          if (channelToken && event.replyToken) await replyLine(channelToken, event.replyToken, '⚠️ 學生還沒接受新時間（或狀態已經變了），請到網站確認目前狀態');
          continue;
        }
        if (!reqRowMove.calendar_event_id) {
          if (channelToken && event.replyToken) await replyLine(channelToken, event.replyToken, '⚠️ 這筆沒有記錄 Calendar 事件 ID，請到網站手動處理');
          continue;
        }
        if (!reqRowMove.requested_date) {
          if (channelToken && event.replyToken) await replyLine(channelToken, event.replyToken, '⚠️ 這筆沒有記錄學生選的新日期，請到網站手動處理');
          continue;
        }

        // ── 🔴 2026-08-01 เพิ่ม (งาน B2/B3/B4) — ด่านตรวจก่อนแตะ Calendar ────────────────
        // อยู่ "ก่อน" แย่งล็อกทั้งหมด (อ่านอย่างเดียว ไม่แตะอะไร) → ปฏิเสธแล้วไม่มีอะไรต้องปลดคืน
        // รายละเอียดว่าทำไมต้องมีแต่ละด่าน อ่านที่ precheckRescheduleMoveTarget ด้านบน
        const preMove = await precheckRescheduleMoveTarget(
          reqRowMove.calendar_event_id, reqRowMove.requested_date, reqRowMove.requested_time || null,
          reqRowMove.original_date, requestIdMove);
        if (!preMove.ok) {
          console.error('[line-webhook] ⚠️ confirm_reschedule_move: ไม่ผ่านด่านก่อนย้าย (' + preMove.logReason + ') ยังไม่ได้แตะ Calendar. request=', requestIdMove);
          if (channelToken && event.replyToken) await replyLine(channelToken, event.replyToken, preMove.replyText);
          continue;
        }

        // ── 原子鎖：跟 confirm_add_class／confirm_cancel_delete 同一個欄位、同一套語意 ──
        // 🟠 2026-07-31 เพิ่ม (งาน C6 ที่เหลือ) — ล็อกเก่ากว่า 10 นาที = ถือว่าค้าง แย่งใหม่ได้เลย
        //   เลขเดียวกับ confirm_cancel_delete (staleLockCutoffCancel) และฝั่งเว็บ claimRequestForProcessing
        //   ทำไมที่นี่ปลอดภัย (ต่างจาก confirm_add_class ที่ตั้งใจ "ไม่" ใส่): moveCalendarEventById
        //   คือการ "ย้าย" event เดิมไปวัน/เวลาเดิมที่ขอไว้ซ้ำ ไม่ใช่การสร้างใหม่ — กดซ้ำ/แย่งล็อกไป
        //   ทำงานซ้ำ อย่างมากคือ PATCH ไปที่เดิมอีกรอบ ไม่ทำให้เกิดคาบซ้อนกันในปฏิทินเหมือนที่
        //   confirm_add_class เสี่ยง จึงใช้กฎเดียวกับ confirm_cancel_delete ได้ปลอดภัย
        const staleLockCutoffMove = new Date(Date.now() - 10 * 60 * 1000).toISOString();
        const { error: claimErrMove, count: claimCountMove } = await supabase
          .from('classroom_requests')
          .update({ processing_started_at: new Date().toISOString() }, { count: 'exact' })
          .eq('id', requestIdMove)
          .eq('status', 'pending')
          .or('processing_started_at.is.null,processing_started_at.lt.' + staleLockCutoffMove)
          .select('id');

        if (claimErrMove) {
          console.error('[line-webhook] ⚠️ confirm_reschedule_move: ล็อกก่อนย้ายพัง:', claimErrMove.message, 'request=', requestIdMove);
          if (channelToken && event.replyToken) await replyLine(channelToken, event.replyToken, '⚠️ 準備搬課失敗：' + claimErrMove.message + '\n還沒動 Calendar');
          continue;
        }
        if (!claimCountMove) {
          if (channelToken && event.replyToken) await replyLine(channelToken, event.replyToken, 'ℹ️ 這筆已經在別的地方處理中或處理完了');
          continue;
        }

        // ── 🔴 2026-08-01 เพิ่ม (งาน B1) — สำรอง "ก่อน" ย้าย ไม่ใช่หลังย้าย ────────────────
        // เดิมสำรองหลังย้ายแบบ best-effort → สำรองพลาด = คาบย้ายไปแล้วกดคืนค่าไม่ได้ตลอดกาล
        // ตอนนี้: สำรองไม่สำเร็จ = ไม่ย้าย + ปลดล็อก + บอกครูตรงๆ (ยังไม่แตะ Calendar เลย ปลอดภัย)
        const bkMove = await insertMoveBackupBeforeMove(
          supabase, requestIdMove, reqRowMove.token, preMove.preEvent, preMove.times.newStartIso);
        if (!bkMove.ok) {
          console.error('[line-webhook] ⚠️ confirm_reschedule_move: บันทึกข้อมูลสำรองไม่สำเร็จ → ไม่ย้าย Calendar:', bkMove.why, 'request=', requestIdMove);
          const { error: unlockErrBkMove } = await supabase.from('classroom_requests').update({ processing_started_at: null }).eq('id', requestIdMove);
          if (unlockErrBkMove) console.error('[line-webhook] ⚠️ confirm_reschedule_move: 解鎖失敗:', unlockErrBkMove.message, 'request=', requestIdMove);
          if (channelToken && event.replyToken) {
            await replyLine(channelToken, event.replyToken,
              '🛑 存不了「可復原」的備份紀錄，所以完全沒有搬課堂。\n原因：' + bkMove.why + '\n' +
              '（沒有備份就搬課，之後想復原會找不到原本的時間，所以寧可先不動。）\n' +
              '可以重新點一次，或到網站處理：https://mrtaihualin.com/classroom/#req-row-' + requestIdMove);
          }
          continue;
        }

        const moveResult = await moveCalendarEventById(reqRowMove.calendar_event_id, reqRowMove.requested_date, reqRowMove.requested_time || null);
        if (!moveResult.ok) {
          console.error('[line-webhook] ⚠️ confirm_reschedule_move 搬 Calendar 失敗:', JSON.stringify(moveResult), 'request=', requestIdMove);
          if (moveResult.eventMovedButUnverified) {
            // 可能已經搬了但驗證失敗——不敢放鎖讓人重按（可能搬兩次、時間亂掉），請 Lin 手動檢查
            if (channelToken && event.replyToken) await replyLine(channelToken, event.replyToken, '⚠️ Calendar 可能已經搬了但無法確認狀態，請直接到 Google Calendar／Supabase 手動檢查這筆（id: ' + requestIdMove + '），先不要重複點這顆按鈕');
            continue;
          }
          // 2026-08-01 (แก้จากรอบตรวจซ้ำ): ย้ายไม่สำเร็จ = แถวสำรองที่เพิ่งเขียนไว้ไม่มีประโยชน์ ต้องลบทิ้ง
          //   ไม่งั้นการ์ดคืนค่าของครูจะมีรายการของคาบที่ไม่เคยถูกย้าย (กดซ้ำหลายรอบ = ขยะเพิ่มเรื่อยๆ)
          await removeMoveBackupRow(supabase, bkMove.backupId, 'confirm_reschedule_move');
          const { error: unlockErrMove } = await supabase.from('classroom_requests').update({ processing_started_at: null }).eq('id', requestIdMove);
          if (unlockErrMove) console.error('[line-webhook] ⚠️ confirm_reschedule_move: 解鎖失敗:', unlockErrMove.message, 'request=', requestIdMove);
          if (channelToken && event.replyToken) {
            await replyLine(channelToken, event.replyToken, '⚠️ 搬 Calendar 失敗（可以重新點一次，或到網站手動處理）\n原因：' + (moveResult.reason || '未知') + (moveResult.detail ? '\n' + moveResult.detail : ''));
          }
          continue;
        }

        // 🗑️ 2026-08-01: ลบการเรียก backupCalendarEventServer(...,'move',...) ตรงนี้ทิ้ง
        //    ย้ายไปทำ "ก่อน" ย้ายคาบแล้ว (ดูก้อน insertMoveBackupBeforeMove ด้านบน) — ห้ามเอากลับมา
        //    เพราะสำรองหลังย้าย = ถ้าพลาด คาบย้ายไปแล้วโดยไม่มีทางคืนค่า

        // ── 🟡 2026-08-01 เพิ่ม (งาน B5) — อัปเดตตารางเรียนทันที ไม่ต้องรอ cron 15-30 นาที ──
        // ล้มเหลวที่นี่ไม่ย้อนการย้ายคาบ (Calendar คือความจริงหลัก) แต่ต้องบอกครูด้วย ห้ามเงียบ
        let schedWarnMove = '';
        const schedMove = await syncScheduleRowAfterMove(
          supabase, reqRowMove.calendar_event_id, reqRowMove.requested_date,
          preMove.times.effectiveTimeStr, extractBangkokTimeStr(preMove.times.newEndIso));
        if (!schedMove.ok) {
          console.warn('[line-webhook] ⚠️ confirm_reschedule_move: อัปเดต classroom_schedule ไม่สำเร็จ (คาบย้ายสำเร็จแล้ว, cron จะตามแก้ให้ใน 15-30 นาที):', schedMove.why, 'request=', requestIdMove);
          schedWarnMove = '\n⚠️ 課表資料庫還沒更新成新時間（' + schedMove.why + '），\n最多 30 分鐘內排程會自動修好；這段期間網站上看到的時間可能還是舊的。';
        } else if (!schedMove.count) {
          console.warn('[line-webhook] ℹ️ confirm_reschedule_move: classroom_schedule ไม่พบแถว calendar_event_id=' + reqRowMove.calendar_event_id + ' (อาจยังไม่เคยซิงค์เข้ามา ไม่กระทบการย้าย)');
        }

        // Calendar 搬成功——關單+解鎖同一個 atomic update（跟 confirm_add_class／confirm_cancel_delete 一樣）
        const { error: updErrMove, count: updCountMove } = await supabase
          .from('classroom_requests')
          .update({ status: 'acknowledged', processing_started_at: null }, { count: 'exact' })
          .eq('id', requestIdMove)
          .eq('status', 'pending');

        if (updErrMove || !updCountMove) {
          console.error('[line-webhook] ⚠️ confirm_reschedule_move: Calendar 搬成功但更新申請狀態失敗（鎖故意維持鎖住）:', updErrMove ? updErrMove.message : '更新 0 筆', 'request=', requestIdMove);
          if (channelToken && event.replyToken) {
            await replyLine(channelToken, event.replyToken, '⚠️ Calendar 已經搬成功了，但更新申請狀態失敗，請直接到 Supabase 手動確認這筆（id: ' + requestIdMove + '）');
          }
          continue;
        }

        // 通知學生（best-effort，失敗不影響已經成功的搬課）——換算成學生自己的時區，跟網站端
        // confirmAcceptedOfferInner 用 studentFacingTimeLabel 同樣的邏輯，沒有時區資料就退回泰國時間。
        // 🔴 2026-08-01 ย้ายบล็อกนี้ขึ้นมา "ก่อน" ตอบกลับครู (RELIABILITY FIRST)
        //   เดิมตอบครูว่า「並通知學生了」ไปก่อน แล้วค่อยส่งหานักเรียนทีหลังแบบเงียบๆ
        //   → ส่งไม่สำเร็จ (นักเรียนบล็อก LINE OA / ยังไม่เชื่อม / LINE ล่ม) ครูก็ยังเห็นว่าแจ้งแล้ว
        //     = นักเรียนไม่รู้เรื่องว่าคาบถูกย้าย และไม่มีใครรู้ว่าไม่รู้ (ผิดกฎ "ห้ามขึ้นว่าสำเร็จถ้ายังไม่ได้ตรวจ")
        let studentWarnMove = '';
        if (channelToken && reqRowMove.token) {
          try {
            const { data: stuRowMove } = await supabase.from('classroom_students').select('line_user_id,pending_student_tz').eq('token', reqRowMove.token).maybeSingle();
            if (stuRowMove && stuRowMove.line_user_id) {
              const localLabel = moveResult.newStartIso ? formatIsoInTz(moveResult.newStartIso, stuRowMove.pending_student_tz) : null;
              const timeLabelForStudent = localLabel
                ? (localLabel + '（你的當地時間）')
                : (reqRowMove.requested_date + ' ' + (reqRowMove.requested_time || '') + '（泰國時間）');
              // ใช้ pushLineChecked (ไม่ใช่ pushLine) เพราะตัวนี้บอกได้ว่าส่งสำเร็จจริงไหม — pushLine กลืน error เงียบ
              const pushResMove = await pushLineChecked(channelToken, stuRowMove.line_user_id, '老師已確認，課堂已經改到 ' + timeLabelForStudent + '，如有疑問請直接聯絡老師');
              if (!pushResMove.ok) studentWarnMove = '\n⚠️ 但 LINE 通知學生沒送出去（' + pushResMove.reason + '），請自己再跟學生說一聲';
            } else {
              studentWarnMove = '\n⚠️ 這位學生還沒連結 LINE，沒有收到通知，記得自己說一聲';
            }
          } catch (e) {
            console.warn('[line-webhook] ⚠️ confirm_reschedule_move: แจ้งนักเรียนไม่สำเร็จ (คาบย้ายสำเร็จแล้ว):', (e && e.message) || e);
            studentWarnMove = '\n⚠️ 但 LINE 通知學生失敗（' + ((e && e.message) || e) + '），請自己再跟學生說一聲';
          }
        }

        if (channelToken && event.replyToken) {
          // 2026-08-01: ต่อท้ายด้วยคำเตือนเรื่องตารางเรียน/แจ้งนักเรียน (ถ้ามี)
          //   ห้ามขึ้น "สำเร็จ" เฉยๆ ทั้งที่มีบางส่วนพลาด
          await replyLine(channelToken, event.replyToken,
            '✅ 已把課搬到新時間' + (studentWarnMove ? '' : '，並通知學生了') + schedWarnMove + studentWarnMove);
        }
        continue;
      }

      if (action === 'confirm_reschedule_pick') {
        // ── 2026-07-22 加（Lin 回報：學生自己申請改期，老師只能到網站處理，系統不完整）──
        // 學生自己送出「申請改期」時會給 1-3 個候選時間（proposed_options），老師是「決定的人」，
        // 直接在 LINE 挑一個按下去就搬 Calendar，不用像 confirm_reschedule_move 那樣等
        // offer_status 變成 'accepted'（那個是「老師先提議，等學生選」的相反方向）。
        // 跟網站端 teacherPickRescheduleOption → processClassRequestInner 同一套邏輯：
        // 用 calendar_event_id 直接搬，不用姓名+日期猜。
        const requestIdPick = params.get('request');
        const optIdxRaw = params.get('opt');
        const optIdx = optIdxRaw === null ? 0 : parseInt(optIdxRaw, 10);
        // 🔴 2026-08-01 เพิ่ม (งาน B6) — ปุ่มต้อง "พกเวลาที่ตัวเองสัญญาไว้" มาด้วย
        //   d=YYYY-MM-DD (วันที่ที่เขียนอยู่บนปุ่ม) · t=HH:MM (เวลาที่เขียนอยู่บนปุ่ม, อาจว่าง)
        //   พังยังไงถ้าไม่มี: ปุ่มเดิมพกมาแค่ opt=<ลำดับที่> แล้วไปเปิดดู proposed_options "ตอนกด"
        //     → นักเรียนแก้คำขอ (เปลี่ยนชุดเวลา) หลังจากการ์ดถูกส่งไปแล้ว การ์ดเก่ายังค้างในแชทตลอดกาล
        //     → ครูเห็นปุ่มเขียนว่า "3/5 10:00" แต่กดแล้วคาบไปโผล่เวลาอื่นเงียบๆ (ลำดับที่ 1 ตัวใหม่)
        //   ค่าที่ปุ่มพกมา ไม่ได้ใช้ "แทน" ข้อมูลในฐานข้อมูล — ใช้เป็นตัว "เทียบ" เท่านั้น
        //   (ฐานข้อมูลยังเป็นความจริงหลักเสมอ ปุ่มเป็นแค่หลักฐานว่าตอนนั้นสัญญาอะไรไว้)
        const promisedDatePick = params.get('d');
        const promisedTimePick = params.get('t');
        if (!requestIdPick) continue;

        const teacherUserIdPick = Deno.env.get('LINE_TEACHER_USER_ID');
        const senderIsTeacherPick = event.source && teacherUserIdPick && event.source.userId === teacherUserIdPick;
        if (!senderIsTeacherPick) {
          console.error('[line-webhook] ⚠️ confirm_reschedule_pick: ผู้กดไม่ใช่ครู ถูกปฏิเสธ. request=', requestIdPick);
          // 🟡 2026-07-31 เพิ่ม (งาน C13 ที่เหลือ — ลอกจากก้อน confirm_cancel_delete):
          //   เดิมเงียบสนิท ไม่ตอบอะไรเลย → ปุ่มจะดูเหมือน "ตายสนิท" ถ้า LINE_TEACHER_USER_ID ตั้งผิด
          if (channelToken && event.replyToken) {
            await replyLine(channelToken, event.replyToken, '⚠️ 這個 LINE 帳號沒有老師權限，沒有執行任何動作。');
          }
          continue;
        }

        const { data: reqRowPick, error: fetchErrPick } = await supabase
          .from('classroom_requests')
          // 2026-08-01 เพิ่ม original_date — ด่าน B4 ต้องใช้เทียบว่า calendar_event_id ยังชี้ไปคาบวันเดิมจริงไหม
          .select('calendar_event_id,status,token,proposed_options,requested_date,requested_time,offer_status,initiated_by,original_date')
          .eq('id', requestIdPick)
          .maybeSingle();

        if (fetchErrPick || !reqRowPick) {
          if (channelToken && event.replyToken) await replyLine(channelToken, event.replyToken, '⚠️ 找不到這筆申請了，請到網站確認');
          continue;
        }
        if (reqRowPick.status === 'acknowledged') {
          if (channelToken && event.replyToken) await replyLine(channelToken, event.replyToken, 'ℹ️ 這筆已經處理過了');
          continue;
        }
        if (reqRowPick.offer_status !== 'proposed') {
          if (channelToken && event.replyToken) await replyLine(channelToken, event.replyToken, '⚠️ 這筆狀態已經變了（可能已經處理過），請到網站確認');
          continue;
        }
        if (reqRowPick.initiated_by !== 'student') {
          // 老師自己提議的時間要先等學生選，不能用這顆按鈕直接搬（那個走 accept_offer→confirm_reschedule_move）
          if (channelToken && event.replyToken) await replyLine(channelToken, event.replyToken, '⚠️ 這筆是老師自己提議的時間，要等學生先選好才能搬，請到網站確認');
          continue;
        }
        if (!reqRowPick.calendar_event_id) {
          if (channelToken && event.replyToken) await replyLine(channelToken, event.replyToken, '⚠️ 這筆沒有記錄 Calendar 事件 ID，請到網站手動處理');
          continue;
        }

        const optsPick = (Array.isArray(reqRowPick.proposed_options) && reqRowPick.proposed_options.length)
          ? reqRowPick.proposed_options
          : [{ date: reqRowPick.requested_date, time: reqRowPick.requested_time }];
        const chosenPick = (Number.isInteger(optIdx) && optIdx >= 0 && optIdx < optsPick.length) ? optsPick[optIdx] : null;
        if (!chosenPick || !chosenPick.date) {
          if (channelToken && event.replyToken) await replyLine(channelToken, event.replyToken, '⚠️ 這個選項好像已經失效了，請到網站確認最新狀態');
          continue;
        }

        // ── 🔴 2026-08-01 (งาน B6) — ปุ่มสัญญาเวลาไหนไว้ ต้องตรงกับที่ฐานข้อมูลบอกตอนนี้ ────────
        // ไม่ตรง = การ์ดใบนั้นล้าสมัยแล้ว (นักเรียนแก้คำขอหลังการ์ดถูกส่ง) → ไม่ย้าย ให้ไปดูที่เว็บ
        // ⚠️ ปุ่มที่ถูกสร้าง "ก่อน" อัปเดตนี้จะไม่มี d/t ติดมา — ห้ามทำให้การ์ดที่ยังค้างในแชทพัง
        //    → ไม่มี d เลย = ถือว่าเป็นการ์ดรุ่นเก่า ยังให้ผ่าน แต่ต้องบอกครูตรงๆ ว่าเทียบไม่ได้
        //      (ห้ามเงียบ — ครูต้องรู้ว่าปุ่มนี้ไม่มีใครยืนยันเวลาให้)
        let oldCardNotePick = '';
        if (promisedDatePick) {
          const sameDatePick = String(promisedDatePick) === String(chosenPick.date || '');
          // เวลาเทียบแค่ HH:MM (คอลัมน์เวลาอาจติดวินาทีมา "10:00:00") · ทั้งคู่ว่าง = ถือว่าตรงกัน
          const sameTimePick = String(promisedTimePick || '').slice(0, 5) === String(chosenPick.time || '').slice(0, 5);
          if (!sameDatePick || !sameTimePick) {
            console.error('[line-webhook] ⚠️ confirm_reschedule_pick: ปุ่มสัญญา', promisedDatePick, promisedTimePick,
              'แต่ฐานข้อมูลตอนนี้เป็น', chosenPick.date, chosenPick.time, '→ ปฏิเสธ. request=', requestIdPick);
            if (channelToken && event.replyToken) {
              await replyLine(channelToken, event.replyToken,
                '⚠️ 這張卡片已經過期了，沒有搬任何課堂。\n' +
                '按鈕上寫的是 ' + promisedDatePick + ' ' + (promisedTimePick || '') + '，\n' +
                '但學生現在申請的第 ' + (optIdx + 1) + ' 個時間是 ' + (chosenPick.date || '-') + ' ' + (chosenPick.time || '') + '（中間被改過了）。\n' +
                '請到網站看最新的申請內容再處理：https://mrtaihualin.com/classroom/#req-row-' + requestIdPick);
            }
            continue;
          }
        } else {
          console.warn('[line-webhook] ℹ️ confirm_reschedule_pick: การ์ดรุ่นเก่า (ไม่มี d/t ในปุ่ม) เทียบเวลาที่สัญญาไว้ไม่ได้. request=', requestIdPick);
          oldCardNotePick = '\nℹ️ 這是舊版卡片（按鈕沒帶時間），系統沒辦法核對「按鈕上寫的時間」跟「學生現在申請的時間」是不是同一個。\n' +
            '這次是照學生目前申請的第 ' + (optIdx + 1) + ' 個時間（' + (chosenPick.date || '-') + ' ' + (chosenPick.time || '') + '）搬的。';
        }

        // ── 🔴 2026-08-01 เพิ่ม (งาน B2/B3/B4) — ด่านตรวจก่อนแตะ Calendar ────────────────
        // อยู่ "ก่อน" แย่งล็อกทั้งหมด (อ่านอย่างเดียว) → ปฏิเสธแล้วไม่มีอะไรต้องปลดคืน
        // รายละเอียดว่าทำไมต้องมีแต่ละด่าน อ่านที่ precheckRescheduleMoveTarget ด้านบน
        const prePick = await precheckRescheduleMoveTarget(
          reqRowPick.calendar_event_id, chosenPick.date, chosenPick.time || null,
          reqRowPick.original_date, requestIdPick);
        if (!prePick.ok) {
          console.error('[line-webhook] ⚠️ confirm_reschedule_pick: ไม่ผ่านด่านก่อนย้าย (' + prePick.logReason + ') ยังไม่ได้แตะ Calendar. request=', requestIdPick);
          if (channelToken && event.replyToken) await replyLine(channelToken, event.replyToken, prePick.replyText);
          continue;
        }

        // ── 原子鎖：跟其他 confirm_* action 同一個欄位、同一套語意 ──
        const { error: claimErrPick, count: claimCountPick } = await supabase
          .from('classroom_requests')
          .update({ processing_started_at: new Date().toISOString() }, { count: 'exact' })
          .eq('id', requestIdPick)
          .eq('status', 'pending')
          .is('processing_started_at', null)
          .select('id');

        if (claimErrPick) {
          console.error('[line-webhook] ⚠️ confirm_reschedule_pick: ล็อกก่อนย้ายพัง:', claimErrPick.message, 'request=', requestIdPick);
          if (channelToken && event.replyToken) await replyLine(channelToken, event.replyToken, '⚠️ 準備搬課失敗：' + claimErrPick.message + '\n還沒動 Calendar');
          continue;
        }
        if (!claimCountPick) {
          if (channelToken && event.replyToken) await replyLine(channelToken, event.replyToken, 'ℹ️ 這筆已經在別的地方處理中或處理完了');
          continue;
        }

        // ── 🔴 2026-08-01 เพิ่ม (งาน B1) — สำรอง "ก่อน" ย้าย ไม่ใช่หลังย้าย ────────────────
        // เหตุผลเดียวกับก้อน confirm_reschedule_move ด้านบน (อ่านที่ insertMoveBackupBeforeMove)
        const bkPick = await insertMoveBackupBeforeMove(
          supabase, requestIdPick, reqRowPick.token, prePick.preEvent, prePick.times.newStartIso);
        if (!bkPick.ok) {
          console.error('[line-webhook] ⚠️ confirm_reschedule_pick: บันทึกข้อมูลสำรองไม่สำเร็จ → ไม่ย้าย Calendar:', bkPick.why, 'request=', requestIdPick);
          const { error: unlockErrBkPick } = await supabase.from('classroom_requests').update({ processing_started_at: null }).eq('id', requestIdPick);
          if (unlockErrBkPick) console.error('[line-webhook] ⚠️ confirm_reschedule_pick: 解鎖失敗:', unlockErrBkPick.message, 'request=', requestIdPick);
          if (channelToken && event.replyToken) {
            await replyLine(channelToken, event.replyToken,
              '🛑 存不了「可復原」的備份紀錄，所以完全沒有搬課堂。\n原因：' + bkPick.why + '\n' +
              '（沒有備份就搬課，之後想復原會找不到原本的時間，所以寧可先不動。）\n' +
              '可以重新點一次，或到網站處理：https://mrtaihualin.com/classroom/#req-row-' + requestIdPick);
          }
          continue;
        }

        const moveResultPick = await moveCalendarEventById(reqRowPick.calendar_event_id, chosenPick.date, chosenPick.time || null);
        if (!moveResultPick.ok) {
          console.error('[line-webhook] ⚠️ confirm_reschedule_pick 搬 Calendar 失敗:', JSON.stringify(moveResultPick), 'request=', requestIdPick);
          if (moveResultPick.eventMovedButUnverified) {
            if (channelToken && event.replyToken) await replyLine(channelToken, event.replyToken, '⚠️ Calendar 可能已經搬了但無法確認狀態，請直接到 Google Calendar／Supabase 手動檢查這筆（id: ' + requestIdPick + '），先不要重複點這顆按鈕');
            continue;
          }
          // 2026-08-01 (แก้จากรอบตรวจซ้ำ): ย้ายไม่สำเร็จ = ลบแถวสำรองที่เพิ่งเขียนทิ้ง (เหตุผลเดียวกับก้อน move)
          await removeMoveBackupRow(supabase, bkPick.backupId, 'confirm_reschedule_pick');
          const { error: unlockErrPick } = await supabase.from('classroom_requests').update({ processing_started_at: null }).eq('id', requestIdPick);
          if (unlockErrPick) console.error('[line-webhook] ⚠️ confirm_reschedule_pick: 解鎖失敗:', unlockErrPick.message, 'request=', requestIdPick);
          if (channelToken && event.replyToken) {
            await replyLine(channelToken, event.replyToken, '⚠️ 搬 Calendar 失敗（可以重新點一次，或到網站手動處理）\n原因：' + (moveResultPick.reason || '未知') + (moveResultPick.detail ? '\n' + moveResultPick.detail : ''));
          }
          continue;
        }

        // 🗑️ 2026-08-01: ลบการเรียก backupCalendarEventServer(...,'move',...) ตรงนี้ทิ้ง
        //    ย้ายไปทำ "ก่อน" ย้ายคาบแล้ว (insertMoveBackupBeforeMove ด้านบน) — ห้ามเอากลับมา

        // ── 🟡 2026-08-01 เพิ่ม (งาน B5) — อัปเดตตารางเรียนทันที ไม่ต้องรอ cron 15-30 นาที ──
        // ล้มเหลวที่นี่ไม่ย้อนการย้ายคาบ (Calendar คือความจริงหลัก) แต่ต้องบอกครูด้วย ห้ามเงียบ
        let schedWarnPick = '';
        const schedPick = await syncScheduleRowAfterMove(
          supabase, reqRowPick.calendar_event_id, chosenPick.date,
          prePick.times.effectiveTimeStr, extractBangkokTimeStr(prePick.times.newEndIso));
        if (!schedPick.ok) {
          console.warn('[line-webhook] ⚠️ confirm_reschedule_pick: อัปเดต classroom_schedule ไม่สำเร็จ (คาบย้ายสำเร็จแล้ว, cron จะตามแก้ให้ใน 15-30 นาที):', schedPick.why, 'request=', requestIdPick);
          schedWarnPick = '\n⚠️ 課表資料庫還沒更新成新時間（' + schedPick.why + '），\n最多 30 分鐘內排程會自動修好；這段期間網站上看到的時間可能還是舊的。';
        } else if (!schedPick.count) {
          console.warn('[line-webhook] ℹ️ confirm_reschedule_pick: classroom_schedule ไม่พบแถว calendar_event_id=' + reqRowPick.calendar_event_id + ' (อาจยังไม่เคยซิงค์เข้ามา ไม่กระทบการย้าย)');
        }

        const { error: updErrPick, count: updCountPick } = await supabase
          .from('classroom_requests')
          .update({ status: 'acknowledged', processing_started_at: null }, { count: 'exact' })
          .eq('id', requestIdPick)
          .eq('status', 'pending');

        if (updErrPick || !updCountPick) {
          console.error('[line-webhook] ⚠️ confirm_reschedule_pick: Calendar 搬成功但更新申請狀態失敗（鎖故意維持鎖住）:', updErrPick ? updErrPick.message : '更新 0 筆', 'request=', requestIdPick);
          if (channelToken && event.replyToken) {
            await replyLine(channelToken, event.replyToken, '⚠️ Calendar 已經搬成功了，但更新申請狀態失敗，請直接到 Supabase 手動確認這筆（id: ' + requestIdPick + '）');
          }
          continue;
        }

        // 🔴 2026-08-01 ย้ายบล็อกแจ้งนักเรียนขึ้นมา "ก่อน" ตอบกลับครู (เหตุผลเดียวกับก้อน confirm_reschedule_move)
        //   เดิมตอบครูว่า「並通知學生了」ก่อน แล้วค่อยส่งหานักเรียนแบบเงียบๆ — ส่งไม่สำเร็จก็ไม่มีใครรู้
        let studentWarnPick = '';
        if (channelToken && reqRowPick.token) {
          try {
            const { data: stuRowPick } = await supabase.from('classroom_students').select('line_user_id,pending_student_tz').eq('token', reqRowPick.token).maybeSingle();
            if (stuRowPick && stuRowPick.line_user_id) {
              const localLabelPick = moveResultPick.newStartIso ? formatIsoInTz(moveResultPick.newStartIso, stuRowPick.pending_student_tz) : null;
              const timeLabelForStudentPick = localLabelPick
                ? (localLabelPick + '（你的當地時間）')
                : (chosenPick.date + ' ' + (chosenPick.time || '') + '（泰國時間）');
              const pushResPick = await pushLineChecked(channelToken, stuRowPick.line_user_id, '老師已確認，課堂已經改到 ' + timeLabelForStudentPick + '，如有疑問請直接聯絡老師');
              if (!pushResPick.ok) studentWarnPick = '\n⚠️ 但 LINE 通知學生沒送出去（' + pushResPick.reason + '），請自己再跟學生說一聲';
            } else {
              studentWarnPick = '\n⚠️ 這位學生還沒連結 LINE，沒有收到通知，記得自己說一聲';
            }
          } catch (e) {
            console.warn('[line-webhook] ⚠️ confirm_reschedule_pick: แจ้งนักเรียนไม่สำเร็จ (คาบย้ายสำเร็จแล้ว):', (e && e.message) || e);
            studentWarnPick = '\n⚠️ 但 LINE 通知學生失敗（' + ((e && e.message) || e) + '），請自己再跟學生說一聲';
          }
        }

        if (channelToken && event.replyToken) {
          // 2026-08-01: ต่อท้ายด้วยคำเตือนตารางเรียน + หมายเหตุการ์ดรุ่นเก่า + ผลแจ้งนักเรียน (ถ้ามี)
          await replyLine(channelToken, event.replyToken,
            '✅ 已把課搬到新時間' + (studentWarnPick ? '' : '，並通知學生了') + schedWarnPick + oldCardNotePick + studentWarnPick);
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
          // 🟠 2026-08-01 เพิ่ม (ตรวจระบบยกเลิก/เพิ่มคาบ ข้อ 10) — คำขอต้องยัง "เปิดอยู่" เท่านั้น
          //   พังยังไงถ้าไม่มีด่านนี้: ปุ่มใน LINE ค้างในประวัติแชทของนักเรียนตลอดกาล ลบออกไม่ได้
          //   ครูส่งแจ้งยกเลิกไปแล้วเปลี่ยนใจ กด 收回這個取消 (ฝั่งเว็บตั้ง status='acknowledged'
          //   แต่ไม่ได้แตะช่อง teacher_cancel_ack_at) → นักเรียนเลื่อนแชทขึ้นไปกดปุ่ม「我知道了」เก่า
          //   → ด่านเดิมเช็คแค่ "ช่อง ack ยังว่าง" ซึ่งยังว่างอยู่จริง = ผ่าน!
          //   → ครูได้ LINE ว่า「學生已確認收到取消通知」พร้อมปุ่ม 確認刪除 Calendar ที่กดได้จริง
          //     ทั้งที่การยกเลิกนั้นถูกถอนไปแล้ว = ครูได้ข้อมูลผิด เสี่ยงกดลบคาบที่ไม่ควรลบ
          .eq('status', 'pending')
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

      // ══════════════════════════════════════════════════════════════════════
      // 🗑️ 2026-07-31 (รอบ 4) — ปุ่มระบบเก่า「我知道了 / 婉拒」ของนักเรียน (เพิ่มคาบ)
      //
      // เดิมเป็นระบบ "ครูเสนอเวลาเพิ่มคาบ → นักเรียนกดยอมรับ/ปฏิเสธ → ครูค่อยกดลงปฏิทิน"
      // Lin สั่งเลิกใช้ตั้งแต่ 2026-07-30 (ครูกดยืนยัน = ลงปฏิทินทันที ไม่ต้องรอนักเรียน)
      // 2026-07-31 Lin รันเช็คแล้วคิวคำขอเก่าว่างจริง (ได้ 0) → ตรรกะทั้งหมดถูกลบทิ้งแล้ว
      //
      // ⚠️ แต่ "ลบทิ้งเฉยๆ ไม่ได้" — ต่างจากฝั่งเว็บ:
      //    ปุ่มในแชท LINE ค้างอยู่ในประวัติแชทของนักเรียน "ตลอดกาล" ลบออกไม่ได้
      //    นักเรียนเลื่อนแชทขึ้นไปเจอแล้วกดเมื่อไหร่ก็ได้ ถ้าไม่มีตัวรับ = ระบบเงียบสนิท
      //    ไม่มีอะไรตอบเลย (ผิดกฎ RELIABILITY FIRST ข้อ 1: ห้ามเงียบ)
      //    → เหลือไว้แค่ตัวตอบข้อความสั้นๆ บอกว่าปุ่มเลิกใช้แล้ว ไม่แตะฐานข้อมูล ไม่แตะ Calendar
      //
      // 🚫 ห้ามเอาตรรกะเดิมกลับมา — ดูหัวข้อ 📅 ระบบเพิ่มคาบเรียน ใน CLAUDE.md
      // ══════════════════════════════════════════════════════════════════════
      if (action === 'ack_teacher_add' || action === 'decline_add_class') {
        console.warn('[line-webhook] ℹ️ มีคนกดปุ่มเก่าในประวัติแชท (' + action + ') — ตอบข้อความอย่างเดียว ไม่ทำอะไรกับข้อมูล. request=', params.get('request'));
        if (channelToken && event.replyToken) {
          await replyLine(channelToken, event.replyToken,
            'ℹ️ 這顆按鈕已經停用了（這是以前的舊訊息）。\n' +
            '現在老師排課會直接排進課表，不需要你先按確認。\n' +
            '如果時間不方便，請直接跟老師說一聲，或到網站按「申請取消課堂」。');
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
        if (!requestIdAddC) continue;

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
                     '\n這堂課已經加到課表了。如果那個時間不方便，請到網站按「申請取消課堂」，或直接跟老師說一聲。'));
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
          // 🟡 2026-07-31 เพิ่ม (งาน C13): เดิมเงียบสนิท ไม่ตอบอะไรเลย
          //   → ถ้าค่า LINE_TEACHER_USER_ID ตั้งผิด หรือ Lin กดจากอีกบัญชี ปุ่มจะดูเหมือน "ตายสนิท"
          //     ไม่มีข้อความ ไม่มีเบาะแส หาสาเหตุยากมาก
          //   ตั้งใจไม่บอกว่าบัญชีไหนถึงจะถูก — คนที่ไม่ใช่ครูก็กดปุ่มนี้ได้ ไม่ควรใบ้อะไรเพิ่ม
          if (channelToken && event.replyToken) {
            await replyLine(channelToken, event.replyToken, '⚠️ 這個 LINE 帳號沒有老師權限，沒有執行任何動作。');
          }
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

        // 🟡 2026-07-31 เพิ่ม (งาน C10) — เช็คก่อนว่าคาบนี้ "ถูกบันทึกว่าเรียนไปแล้ว" หรือยัง
        //
        // พังยังไงถ้าไม่มีด่านนี้: คาบที่บันทึกเข้าเรียนแล้ว = โควตาถูกหักไปแล้ว
        //   ถ้าลบออกจากปฏิทิน จะกลายเป็น "โควตาหาย แต่ปฏิทินว่างเปล่า" = ข้อมูล 2 ฝั่งไม่ตรงกัน
        //   (กับดักเดียวกับตอนเคส 育郁 ซึ่งฝั่ง "กู้คืน" มีคำเตือนไว้แล้วที่ classroom/index.html:8355-8375
        //    แต่ตอน "ยกเลิก" กลับไม่เคยเช็คเลยทั้งฝั่งเว็บและ LINE)
        //
        // ทำไมเลือก "ปฏิเสธ" ไม่ใช่ "เตือนแล้วทำต่อ": ใน LINE ถามครูกลางทางไม่ได้ (กดปุ่มไปแล้วถอยไม่ได้)
        //   → ส่งไปให้ตัดสินใจที่เว็บ ซึ่งมีกล่องยืนยันให้อ่านก่อนกด (เหมือนที่ทำกับเคส "วันไม่ตรง")
        // เช็คก่อนแย่งล็อก จะได้ไม่ต้องปลดล็อกคืน
        // 🟠 2026-07-31 เพิ่ม (งาน C10 ที่เหลือ) — original_date ว่าง → ลองคำนวณจาก Calendar event แทน
        //   เดิม: original_date ว่าง = ข้ามด่านทั้งก้อนไปเงียบๆ ปล่อยลบไม่มีคำเตือน
        //   พอร์ตแนวคิดเดียวกับฝั่งเว็บ (classroom/index.html:7962 — cancelDayForAtt) มาที่นี่:
        //   ยิง GET ไปดู Calendar event ตัวเดิม (ใช้ calendar_event_id ที่มีอยู่แล้ว) แล้วแปลงเวลาเริ่ม
        //   เป็นวันที่ไทยด้วย extractBangkokDateStr (ฟังก์ชันเดิมที่มีอยู่แล้วในไฟล์นี้)
        //   หาไม่ได้จริงๆ (network พัง/ไม่เห็น event) ก็ไม่บล็อกอะไร แค่ข้ามด่านเหมือนพฤติกรรมเดิม
        let attDateForCancel = reqRowCancel.original_date || null;
        if (!attDateForCancel && reqRowCancel.calendar_event_id) {
          try {
            const gTokenForAtt = await getGoogleCalendarToken();
            const calIdForAtt = Deno.env.get('GOOGLE_CALENDAR_ID');
            if (gTokenForAtt && calIdForAtt) {
              const evUrlForAtt = 'https://www.googleapis.com/calendar/v3/calendars/' + encodeURIComponent(calIdForAtt) + '/events/' + encodeURIComponent(reqRowCancel.calendar_event_id);
              const evResForAtt = await fetch(evUrlForAtt, { headers: { Authorization: 'Bearer ' + gTokenForAtt } });
              if (evResForAtt.ok) {
                const evDataForAtt = await evResForAtt.json().catch(() => ({}));
                const startIsoForAtt = evDataForAtt.start && (evDataForAtt.start.dateTime || evDataForAtt.start.date);
                attDateForCancel = extractBangkokDateStr(startIsoForAtt) || null;
              }
            }
          } catch (e) {
            console.warn('[line-webhook] ⚠️ confirm_cancel_delete: หาวันที่จาก Calendar event แทน original_date ที่ว่างไม่สำเร็จ (ไม่บล็อก):', e && e.message ? e.message : e, 'request=', requestIdCancel);
          }
        }
        if (reqRowCancel.token && attDateForCancel) {
          const { data: attRowsCancel, error: attErrCancel } = await supabase
            .from('classroom_attendance')
            .select('lesson_date')
            .eq('token', reqRowCancel.token)
            .eq('lesson_date', attDateForCancel)
            .limit(1);
          if (attErrCancel) {
            // อ่านไม่ได้ = ไม่รู้ → ห้ามเดาว่า "ไม่มี" แล้วลบเลย ต้องบอกครูตรงๆ (RELIABILITY FIRST)
            console.error('[line-webhook] ⚠️ confirm_cancel_delete: อ่านบันทึกเข้าเรียนไม่ได้:', attErrCancel.message, 'request=', requestIdCancel);
            if (channelToken && event.replyToken) {
              await replyLine(channelToken, event.replyToken,
                '⚠️ 查不到上課紀錄（' + attErrCancel.message + '），為了安全沒有刪除任何東西。\n請到網站處理：https://mrtaihualin.com/classroom/#req-row-' + requestIdCancel);
            }
            continue;
          }
          if (attRowsCancel && attRowsCancel.length) {
            if (channelToken && event.replyToken) {
              await replyLine(channelToken, event.replyToken,
                '🛑 這堂課（' + attDateForCancel + '）已經有「上過課」的紀錄了，沒有刪除任何東西。\n' +
                '刪掉的話，堂數已經扣掉但 Calendar 會變空的，兩邊對不起來。\n' +
                '請到網站確認後再決定：https://mrtaihualin.com/classroom/#req-row-' + requestIdCancel);
            }
            continue;
          }
        }

        // ── 2026-07-19 เพิ่ม（แก้ ORANGE：ครูกดลบจาก LINE กับเว็บพร้อมกัน ชนกันได้）──
        // เดิม: เช็คแค่ status ด้านบน (อ่านเฉยๆ ไม่ atomic) แล้วยิงลบ Calendar เลย → ถ้าเว็บกับ LINE
        // อ่านผ่านพร้อมกันภายในไม่กี่วินาที ทั้งคู่จะยิง deleteCalendarEventById ซ้อนกันจริง
        // ตอนนี้ต้อง "ล็อกแบบ atomic" ก่อนแตะ Calendar เสมอ — ใช้คอลัมน์ processing_started_at แยกจาก
        // status (status มี CHECK constraint classroom_requests_status_check รองรับแค่
        // pending/acknowledged เท่านั้น เอามาใช้เป็นล็อกที่ 3 ไม่ได้) ฝั่งเว็บ (classroom/index.html
        // claimRequestForProcessing) ใช้ล็อกคอลัมน์เดียวกัน ความหมายเดียวกัน
        // 🟠 2026-07-31 แก้ (งาน C6 — ล็อกค้างถาวร): เดิมบังคับว่าช่องล็อกต้อง "ว่างเปล่า" เท่านั้นถึงจะจับได้
        //   → ถ้าครูกดแล้วคอมพับ/ปิดแท็บ/เน็ตหลุดก่อนทำเสร็จ ล็อกจะค้างตลอดไป
        //     คำขอนั้นตายสนิท ทั้งเว็บและ LINE ตอบว่า "กำลังถูกจัดการที่อื่น" ตลอดกาล
        //     ทางออกเดียวคือให้ Lin เข้าไปแก้มือใน Supabase
        //   ตอนนี้: ล็อกที่เก่ากว่า 10 นาที = ถือว่าค้าง แย่งใหม่ได้เลย
        //   ทำไม 10 นาที: งานจริงที่ยาวที่สุดในเส้นทางนี้ (อ่าน Calendar + ลบ + ตรวจซ้ำ + ส่ง LINE)
        //     ปกติจบใน 5-10 วินาที · เผื่อไว้ 10 นาทีคือเผื่อเกินร้อยเท่า ปลอดภัยกว่าตั้งสั้น
        //   ⚠️ ต้องแก้ "ทั้ง 2 ฝั่ง" ให้ใช้เลขเดียวกัน (ฝั่งเว็บ classroom/index.html claimRequestForProcessing)
        //      ถ้าแก้ฝั่งเดียว เว็บกับ LINE จะเข้าใจคำว่า "ล็อกค้าง" ไม่ตรงกัน = อันตรายกว่าเดิม
        const staleLockCutoffCancel = new Date(Date.now() - 10 * 60 * 1000).toISOString();
        const { data: claimDataCancel, error: claimErrCancel, count: claimCountCancel } = await supabase
          .from('classroom_requests')
          .update({ processing_started_at: new Date().toISOString() }, { count: 'exact' })
          .eq('id', requestIdCancel)
          .eq('status', 'pending')
          .or('processing_started_at.is.null,processing_started_at.lt.' + staleLockCutoffCancel)
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

        // 🟠 2026-07-31 (งาน C4): ส่ง original_date ไปด้วย = "ลบได้ต่อเมื่อคาบยังอยู่วันเดิมจริงเท่านั้น"
        //    ค่านี้ถูกอ่านมาตั้งแต่บรรทัดต้นก้อนแล้ว แต่เดิมเอาไปใช้แค่ตอนพิมพ์ข้อความบอกนักเรียนเท่านั้น
        // 🔴 2026-08-01 (ข้อ 2): ส่งงาน "เขียนแถวสำรอง" เข้าไปให้ทำ **ก่อน** ลบ
        //    สำรองไม่สำเร็จ = ฟังก์ชันจะคืน ok:false reason='backup_failed' โดยไม่แตะ Calendar เลย
        //    → ตกไปเข้าก้อน if (!delResult.ok) ข้างล่าง ซึ่งปลดล็อกคืนและบอกสาเหตุกับครูอยู่แล้ว
        let backupIdCancel = null;
        const delResult = await deleteCalendarEventById(
          reqRowCancel.calendar_event_id,
          reqRowCancel.original_date || null,
          async function (preEventData) {
            const bk = await backupCalendarEventServer(supabase, requestIdCancel, reqRowCancel.token, 'delete', preEventData);
            if (bk && bk.ok) backupIdCancel = bk.backupId || null;
            return bk;
          },
        );
        if (!delResult.ok) {
          // 🔴 2026-08-01 (ตรวจซ้ำ): สำรองเขียนไปแล้ว แต่สุดท้ายลบ Calendar ไม่สำเร็จ (Google 5xx / ยืนยันไม่ได้)
          //   → ต้องเก็บแถวสำรองนั้นทิ้ง ไม่งั้นจะเหลือหลักฐานว่า "เคยลบคาบนี้" ทั้งที่คาบยังอยู่ครบ
          //   → การ์ด ↩️ 最近處理（還能復原）จะโชว์ให้กด แล้วสร้างคาบเดิมกลับมาอีกใบ = **คาบซ้อนกัน 2 คาบ**
          //   (นี่คือราคาที่ต้องจ่ายของการ "สำรองก่อนลบ" — ถ้าไม่เก็บกวาด จะกลายเป็นบั๊กใหม่แทนบั๊กเก่า)
          if (backupIdCancel) {
            const { error: bkDelErr } = await supabase.from('classroom_calendar_backups').delete().eq('id', backupIdCancel);
            if (bkDelErr) {
              console.error('[line-webhook] ⚠️ confirm_cancel_delete: ลบแถวสำรองที่ไม่ได้ใช้ทิ้งไม่สำเร็จ '
                + '(อาจมีปุ่ม ↩️ 復原 ขึ้นทั้งที่คาบยังอยู่ — กดแล้วจะได้คาบซ้ำ ห้ามกด):', bkDelErr.message, 'backup=', backupIdCancel);
            }
          }
          console.error('[line-webhook] ⚠️ confirm_cancel_delete 刪除 Calendar 失敗:', JSON.stringify(delResult), 'request=', requestIdCancel);
          // Calendar ยังไม่ถูกแตะจริง (API ล้มเหลว) → ปลดล็อกคืน ให้กดใหม่/ไปทำที่เว็บได้โดยไม่ติดล็อกค้าง
          const { error: unlockErrCancel } = await supabase.from('classroom_requests').update({ processing_started_at: null }).eq('id', requestIdCancel);
          if (unlockErrCancel) console.error('[line-webhook] ⚠️ confirm_cancel_delete: ปลดล็อกคืนไม่สำเร็จหลัง Calendar ลบพัง:', unlockErrCancel.message, 'request=', requestIdCancel);
          if (channelToken && event.replyToken) {
            // 2026-07-19 加：把失敗原因直接秀給老師看（不用再翻 log），先前遇過「回覆✅但其實沒刪到」
            // 的假成功，之後任何失敗都要讓老師當場看到原因，不能只說「失敗，去網站處理」含糊帶過
            // 🟠 2026-07-31 (งาน C4): เคส "วันไม่ตรง" ไม่ใช่ความล้มเหลว — เป็นการหยุดไว้ก่อนโดยตั้งใจ
            //    ใช้ข้อความคนละชุด ไม่ให้ครูเข้าใจผิดว่าระบบพัง และบอกให้ชัดว่า "ยังไม่ได้ลบอะไรเลย"
            // 🔴 2026-08-01 (ข้อ 2): สำรองไม่สำเร็จ = ไม่ใช่ระบบพัง แต่เป็นการ "หยุดไว้ก่อนโดยตั้งใจ"
            //    ต้องบอกให้ชัดว่ายังไม่ได้ลบอะไรเลย และกดใหม่ได้ (ต่างจากเคสอื่นที่ห้ามกดซ้ำ)
            if (delResult.reason === 'backup_failed') {
              await replyLine(channelToken, event.replyToken,
                '🛑 沒有刪除任何東西，這堂課還在。\n' +
                '原因：刪除前要先存一筆「可復原」的備份，但這次存不進去。\n' +
                (delResult.detail || '') + '\n' +
                '（如果沒有備份就刪掉，之後就再也救不回來了，所以系統故意先停手）\n' +
                '可以再按一次試試，還是不行請到網站處理：https://mrtaihualin.com/classroom/#req-row-' + requestIdCancel);
            } else if (delResult.reason === 'date_mismatch') {
              await replyLine(channelToken, event.replyToken,
                '⚠️ 對不上，所以沒有刪除任何東西\n' +
                '這筆申請寫的原本課堂是 ' + (delResult.expectedDate || '—') + '，\n' +
                '但 Calendar 上這堂課現在的日期是 ' + (delResult.actualDate || '—') + '（中間可能已經被改期過了）。\n' +
                '請到網站處理比較安全：https://mrtaihualin.com/classroom/#req-row-' + requestIdCancel);
            } else {
              await replyLine(channelToken, event.replyToken, '⚠️ 刪除 Calendar 失敗（不要重複點這顆按鈕，請到網站手動處理）\n原因：' + (delResult.reason || '未知') + (delResult.detail ? '\n' + delResult.detail : ''));
            }
          }
          continue;
        }

        // 🗑️ 2026-08-01 (ข้อ 2): ลบการเรียกสำรอง "หลังลบ" ตรงนี้ทิ้ง — ย้ายไปทำ "ก่อนลบ" แล้ว
        //    (ดู beforeDeleteHook ที่ส่งเข้า deleteCalendarEventById ข้างบน) — ห้ามเอากลับมา
        //    เหตุผลเหมือนเส้นทางย้ายคาบเป๊ะ: ลบไปแล้วค่อยสำรองพัง = กู้คืนไม่ได้ตลอดกาล

        // 2026-07-30 加（Lin 抓到 race condition）：以前 Calendar 刪掉之後，classroom_schedule 那筆
        // 資料庫記錄要等 calendar-schedule-sync-cron（每 20 分鐘跑一次）才會清掉——這段空窗期內
        // class-reminder-cron（每 5 分鐘跑一次）還是會讀到這筆「已取消」的課，照樣發「快上課了」提醒給學生。
        // 現在 Calendar 刪除確認成功後「立刻」順手刪掉這筆，不用等 20 分鐘週期同步。
        // Calendar 才是事實來源，這裡失敗不擋取消本身（RELIABILITY FIRST：不吞錯誤，失敗要留紀錄，
        // 但不能因為這裡失敗就讓整個取消流程卡住/報錯給老師——20 分鐘後排程還會再清一次當保底）。
        try {
          const { error: schedDelErrCancel, count: schedDelCountCancel } = await supabase
            .from('classroom_schedule')
            .delete({ count: 'exact' })
            .eq('calendar_event_id', reqRowCancel.calendar_event_id);
          if (schedDelErrCancel) {
            console.warn('[line-webhook] ⚠️ confirm_cancel_delete: 立即清 classroom_schedule 失敗（不影響取消本身，20 分鐘後排程還會再清一次）:', schedDelErrCancel.message, 'request=', requestIdCancel);
          } else if (!schedDelCountCancel) {
            console.warn('[line-webhook] ℹ️ confirm_cancel_delete: classroom_schedule 找不到 calendar_event_id=' + reqRowCancel.calendar_event_id + ' 的資料列（可能還沒同步進去，不影響取消）');
          }
        } catch (e) {
          console.warn('[line-webhook] ⚠️ confirm_cancel_delete: 立即清 classroom_schedule 發生例外（不影響取消本身）:', e && e.message ? e.message : e);
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

        // 🟠 2026-07-31 แก้ (งาน C3): เดิมเช็คแค่ updErrCancel
        //    ถ้าอัปเดตได้ "0 แถว" (สถานะถูกเปลี่ยนไประหว่างทาง) จะไม่มี error แต่ก็ไม่มีอะไรถูกบันทึกเลย
        //    → โค้ดเดิมไหลไปตอบ「✅ 已刪除」ทั้งที่ความจริงคือ: Calendar ถูกลบไปแล้วจริง
        //      แต่คำขอยัง pending และล็อก processing_started_at ยังค้างอยู่
        //      = คำขอนั้นตายถาวร ปลดไม่ได้ทั้งเว็บและ LINE (ทั้ง 2 ทางตอบว่า "กำลังถูกจัดการที่อื่น")
        //      + ตัวเตือน 48 ชม.จะจิกซ้ำทุกรอบไม่มีวันจบ
        //    ฝั่ง "เพิ่มคาบ" ทำถูกอยู่แล้ว (if (updErrAddC || !updCountAddC)) — ลอกมาให้ตรงกัน
        if (updErrCancel || !updCountCancel) {
          const whyCancel = updErrCancel ? updErrCancel.message : 'อัปเดตได้ 0 แถว (สถานะถูกเปลี่ยนไประหว่างทาง)';
          console.error('[line-webhook] ⚠️ confirm_cancel_delete: Calendar ลบแล้วแต่อัปเดตฐานข้อมูลไม่สำเร็จ (ล็อกจะค้างไว้ตั้งใจ ต้องเช็คมือ):', whyCancel, 'request=', requestIdCancel);
          if (channelToken && event.replyToken) {
            await replyLine(channelToken, event.replyToken,
              '⚠️ Calendar 課程已經刪除了，但這筆申請的狀態沒有存進資料庫\n原因：' + whyCancel +
              '\n請到 Supabase 把這筆的 status 改成 acknowledged、processing_started_at 清成空白（id: ' + requestIdCancel + '）');
          }
          continue;
        }

        // 🔴 2026-07-31 แก้ (งาน C2): ย้ายการแจ้งนักเรียนมาไว้ "ก่อน" ตอบครู แล้วตอบตามผลจริง
        //    เดิม: ตอบครูว่า「✅ 已刪除 Calendar 課程，並通知學生了」ทันที
        //          แล้วค่อยส่งหานักเรียนทีหลัง ในกล่อง try/catch เปล่าๆ ที่กลืน error ทุกอย่าง
        //          และไม่เคยเช็คว่านักเรียนผูก LINE ไว้หรือยัง
        //    → นักเรียนที่ยังไม่ผูก LINE หรือ LINE ล่มชั่วคราว = ไม่ได้รับอะไรเลย
        //      แต่ครูเชื่อสนิทใจว่าแจ้งไปแล้ว (ผิดกฎ RELIABILITY FIRST: ห้ามขึ้นว่าสำเร็จถ้ายังไม่ตรวจ)
        //    ฝั่งเว็บทำถูกอยู่แล้ว (classroom/index.html:7797-7801) — ลอกพฤติกรรมนั้นมาทั้งชุด
        //    ⚠️ replyToken ของ LINE ใช้ได้ครั้งเดียวต่อการกด 1 ครั้ง → ต้องรวมเป็นข้อความเดียว ห้ามยิง 2 รอบ
        let replyMsgCancel = '✅ 已刪除 Calendar 課程，並通知學生了';
        try {
          if (!reqRowCancel.token) {
            replyMsgCancel = '✅ 已刪除 Calendar 課程\n⚠️ 但這筆沒有記錄學生代碼，沒辦法通知學生，記得自己說一聲';
          } else if (!channelToken) {
            replyMsgCancel = '✅ 已刪除 Calendar 課程\n⚠️ 但系統缺少 LINE 金鑰，沒通知到學生，記得自己說一聲';
          } else {
            const { data: stuRowCancel, error: stuErrCancel } = await supabase
              .from('classroom_students').select('line_user_id').eq('token', reqRowCancel.token).maybeSingle();
            if (stuErrCancel) {
              replyMsgCancel = '✅ 已刪除 Calendar 課程\n⚠️ 但查不到學生資料（' + stuErrCancel.message + '），沒通知到學生，記得自己說一聲';
            } else if (!stuRowCancel || !stuRowCancel.line_user_id) {
              replyMsgCancel = '✅ 已刪除 Calendar 課程\n⚠️ 但學生還沒連結 LINE，沒收到通知，記得自己說一聲';
            } else {
              const odateMsg = (reqRowCancel.original_date || '') + (reqRowCancel.original_time ? ' ' + reqRowCancel.original_time : '');
              const pushResCancel = await pushLineChecked(channelToken, stuRowCancel.line_user_id,
                '✅ 老師已確認，' + odateMsg + ' 的課程已經取消囉');
              if (!pushResCancel.ok) {
                console.error('[line-webhook] ⚠️ confirm_cancel_delete: แจ้งนักเรียนไม่สำเร็จ:', pushResCancel.reason, 'request=', requestIdCancel);
                replyMsgCancel = '✅ 已刪除 Calendar 課程\n⚠️ 但 LINE 通知學生失敗（' + pushResCancel.reason + '），請自己再跟學生說一聲';
              }
            }
          }
        } catch (e) {
          const whyNotify = (e && e.message) ? e.message : String(e);
          console.error('[line-webhook] ⚠️ confirm_cancel_delete: แจ้งนักเรียนพังกลางคัน:', whyNotify, 'request=', requestIdCancel);
          replyMsgCancel = '✅ 已刪除 Calendar 課程\n⚠️ 但通知學生時出錯（' + whyNotify + '），請自己再跟學生說一聲';
        }

        if (channelToken && event.replyToken) {
          await replyLine(channelToken, event.replyToken, replyMsgCancel);
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
