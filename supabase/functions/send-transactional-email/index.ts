// ════════════════════════════════════════════════════════════════════════════
// Supabase Edge Function: send-transactional-email
// ────────────────────────────────────────────────────────────────────────────
// สถานะไฟล์นี้: "ร่างเท่านั้น" (DRAFT — ยังไม่ deploy, ยังไม่ผูกกับ UI ใดๆ)
// ห้าม deploy เองก่อน Lin ตรวจ + อนุมัติ (ตามกฎเว็บ CLAUDE.md ข้อ "เว็บต้องผ่าน Lin ก่อนเสมอ")
//
// 🔴🔴🔴 สำคัญที่สุด — ยังไม่ได้เลือก email provider 🔴🔴🔴
//   ไฟล์นี้เขียนโครง "Resend" (https://resend.com) ไว้เป็น "ตัวอย่างอ้างอิง" เท่านั้น เพื่อให้เห็นภาพว่า
//   สถาปัตยกรรมทำงานยังไง — ไม่ใช่การตัดสินใจเลือก provider ขั้นสุดท้าย ตามกฎที่ Lin สั่งไว้ชัดเจนว่า
//   "ห้ามเลือก provider/สร้าง account/ตั้ง secret เอง" AI จึงไม่ได้สมัครบัญชี ไม่ได้ตั้ง secret ใดๆ จริง
//   ก่อน deploy จริง Lin ต้อง: (1) เลือก provider เอง (ตัวเลือกที่เทียบไว้ในหัวข้อท้ายไฟล์) (2) สมัคร
//   บัญชีเอง (3) verify โดเมนส่งเมลเอง (4) ตั้ง secret เอง (5) ถ้าเลือก provider อื่นที่ไม่ใช่ Resend
//   ต้องแก้แค่ฟังก์ชัน sendViaProvider() ด้านล่างจุดเดียว — ส่วนอื่นทั้งไฟล์ (template, การเรียกใช้จาก
//   ฟังก์ชันอื่น, การตรวจสิทธิ์) ไม่ต้องแก้เลย ออกแบบให้สลับ provider ทำได้ง่ายตามที่ Lin ขอ
//
// หน้าที่: จุดกลางจุดเดียวสำหรับส่ง transactional email ของทั้งเว็บ (เพิ่มจากที่ไม่เคยมีระบบอีเมลแจ้งเตือน
//   เลยมาก่อน — ตรวจแล้วไม่พบ Resend/SendGrid/Mailgun/Postmark/SES/nodemailer อยู่ในโปรเจกต์นี้เลยสักที่
//   ก่อนเริ่มงานนี้ ความสามารถ "อีเมล" เดิมมีแค่ Supabase Auth OTP ซึ่งเป็นกลไกล็อกอิน ไม่ใช่ระบบแจ้งเนื้อหา
//   ที่กำหนดเองได้ — ดูรายละเอียดการตรวจใน `docs/ACCOUNT_DATA_SAFETY_GAPS.md`)
//
// รอบนี้ทำแค่ 3 template ที่เกี่ยวกับ Account Deletion ตามที่ Lin สั่งมา แต่ตัวระบบ (template registry
// ด้านล่าง) ออกแบบให้เพิ่ม template ใหม่ในอนาคตได้ง่ายๆ (เพิ่ม 1 entry ใน TEMPLATES ไม่ต้องแก้ที่อื่น)
// — Lin สั่งไว้ชัดว่า "ห้ามขยาย scope ไปสร้างระบบ marketing email" ไฟล์นี้จึงตั้งใจไม่มีอะไรเกี่ยวกับ
// unsubscribe list / bulk send / marketing template เลย เป็น transactional เท่านั้น (แจ้งเหตุการณ์ที่เกิด
// กับบัญชีของผู้ใช้เอง 1 คนต่อ 1 อีเมล ไม่ใช่ broadcast)
//
// ── ใครเรียกฟังก์ชันนี้ได้ (กันคนแปลกหน้ามาใช้เป็นเครื่องส่งสแปม) ──────────────────────────────
//   ฟังก์ชันนี้ "ไม่รับ JWT ของผู้ใช้ทั่วไปเด็ดขาด" — เรียกได้เฉพาะจาก Edge Function อื่นในโปรเจกต์นี้
//   เท่านั้น (ผ่าน service_role key) เหตุผล: ถ้าเปิดให้ authenticated เรียกตรงได้ ใครก็ตามที่ล็อกอินอยู่
//   จะสั่งให้ระบบส่งอีเมลไปหาใครก็ได้ (ใส่ to เป็นอีเมลใครก็ได้) กลายเป็นเครื่องมือส่งสแปม/ฟิชชิ่งฟรีทันที
//   วิธีตรวจ: decode JWT (หลังผ่านเกตเวย์ verify_jwt ของ Supabase มาแล้ว แปลว่าเป็น JWT ของโปรเจกต์นี้จริง)
//   แล้วเช็ค claim `role` ต้องเป็น 'service_role' เท่านั้น — แพทเทิร์นเดียวกับการเช็ค role จาก JWT ที่ใช้
//   อยู่แล้วทั่วทั้ง repo (ดู CLAUDE.md หัวข้อ Secrets Audit: "JWT ที่เจอในโค้ดฝั่งเว็บถอดแล้วเป็น anon
//   role ทั้งหมด" — โค้ดนี้ใช้หลักการเดียวกันแต่กลับด้าน คือ "ต้องเป็น service_role เท่านั้นถึงจะผ่าน")
//
// ── Request/Response contract ─────────────────────────────────────────────────────
//   Method: POST
//   Headers: Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>, apikey: <SUPABASE_SERVICE_ROLE_KEY>
//     (เรียกจาก Edge Function อื่นด้วย createClient(url, SERVICE_KEY) หรือ fetch() ตรงๆ ก็ได้ทั้งคู่
//      ขอแค่แนบ header ให้ครบ 2 ตัวนี้เหมือนกัน)
//   Body: { template: string, to: string, data: object }
//     - template: ต้องอยู่ใน TEMPLATES ด้านล่างเท่านั้น (ตอนนี้มี 3 ตัว — ดูหัวข้อ TEMPLATES)
//     - to: อีเมลปลายทาง (ฟังก์ชันนี้ไม่ตรวจว่าเป็นอีเมลของใคร — ผู้เรียก (Edge Function อื่น) ต้อง
//       ตรวจเองแล้วว่า to คืออีเมลที่ถูกต้องของเจ้าของเหตุการณ์จริง ก่อนเรียกมาที่นี่)
//     - data: ตัวแปรสำหรับแทรกในเนื้อหาอีเมล (เช่น scheduled_delete_at) — แต่ละ template ต้องการ data
//       ไม่เหมือนกัน ดูที่ TEMPLATES ว่าต้องการอะไรบ้าง
//   Response 200: { ok: true, provider, provider_message_id }
//   Response 400: { error: 'invalid_template' | 'missing_to' | 'missing_data_field', message }
//   Response 401: { error: 'forbidden', message }  — ไม่ใช่ service_role
//   Response 500: { error: 'provider_error' | 'unexpected_error', message, detail }
//     — ส่งไม่สำเร็จต้องตอบ 500 ชัดเจนเสมอ ห้ามตอบ 200 หลอกๆ (RELIABILITY FIRST) ผู้เรียก (account-delete/
//     account-delete-cron) ต้องดักผลนี้เอง แล้วตัดสินใจว่าจะ retry/log/แจ้ง Lin ยังไง — ฟังก์ชันนี้แค่
//     "พยายามส่ง 1 ครั้งแล้วรายงานผลจริง" ไม่มี retry queue ในตัวเอง (ยังไม่ทำ — ดูหมายเหตุท้ายไฟล์)
//
// วิธี deploy (สำหรับ Lin ทำเองภายหลัง หลังเลือก provider + ตั้ง secret แล้วเท่านั้น):
//   1. เลือก provider (ดูตารางเทียบท้ายไฟล์) → สมัครบัญชี → verify โดเมนส่งเมล (เช่น noreply@mrtaihualin.com)
//   2. ตั้ง secret: supabase secrets set EMAIL_PROVIDER_API_KEY=xxxxxxxx
//      ถ้าไม่ใช่ Resend ต้องแก้ฟังก์ชัน sendViaProvider() ให้ตรงกับ API ของ provider ที่เลือกด้วย
//   3. supabase functions deploy send-transactional-email
//      ⚠️ ไม่ต้องใส่ --no-verify-jwt — ต้องการให้เกตเวย์เช็คว่าเป็น JWT ของโปรเจกต์นี้จริงก่อนเข้าโค้ดเรา
//      (ชั้นที่ 2 คือเช็ค role='service_role' ในโค้ดเอง — 2 ชั้นซ้อนกัน)
//   4. ทดสอบส่งจริง 1 ฉบับไปอีเมลของ Lin เองก่อน ตรวจว่าไม่ตกไปถังขยะ (SPF/DKIM ของโดเมนตั้งถูกไหม)
// ════════════════════════════════════════════════════════════════════════════

// deno-lint-ignore-file
// @ts-nocheck  (Supabase Edge Function รันบน Deno ไม่ใช่ Node — IDE อาจฟ้อง type error ปกติ ไม่กระทบตอน deploy จริง)

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';

// ─────────────────────────────────────────────────────────────────────────
// TEMPLATES — เพิ่ม template ใหม่ในอนาคตแค่เพิ่ม entry ตรงนี้ 1 อัน (ตามที่ Lin สั่งให้ออกแบบขยายได้)
//   subject(data) / html(data) เป็นฟังก์ชันรับ data แล้วคืน string — ทำให้ใส่ค่าตัวแปร (เช่นวันที่)
//   เข้าไปในเนื้อหาได้ตรงไปตรงมา ไม่ต้องพึ่ง template engine ภายนอก
//   required: รายชื่อ key ใน data ที่ template นี้ต้องการ — เช็คก่อนส่งเสมอ กันเนื้อหาอีเมลมีคำว่า
//   "undefined" หลุดออกไปหาผู้ใช้จริง (เจอบ่อยเวลาลืมส่ง data ให้ครบ)
// ─────────────────────────────────────────────────────────────────────────
const SITE_NAME = '泰華眼裡的泰語教學';
const SUPPORT_EMAIL = 'mr.taihualin@gmail.com';

function fmtDateTH(iso) {
  // โชว์วันที่แบบอ่านง่าย ผูกกับ locale ไทย (ผู้ใช้เว็บนี้เป็นคนไทยเรียนภาษาจีนเป็นหลัก) — ถ้า parse
  // ไม่ได้ (ค่าที่ส่งมาผิดรูปแบบ) คืนค่าดิบกลับไปแทนที่จะพังทั้งอีเมล (ทางปลอดภัยกว่า)
  try {
    return new Date(iso).toLocaleString('th-TH', { dateStyle: 'long', timeStyle: 'short', timeZone: 'Asia/Bangkok' });
  } catch (e) {
    return String(iso);
  }
}

function wrapHtml(bodyHtml) {
  // โครงเดียวกันทุกฉบับ — โลโก้ตัวอักษรธรรมดา (ไม่ผูกกับไฟล์รูปภายนอกที่อาจโหลดไม่ขึ้นในบางอีเมลไคลเอนต์)
  return '<div style="font-family:\'Noto Sans TC\',Arial,sans-serif;max-width:480px;margin:0 auto;padding:24px;color:#1C1C1C;">' +
    '<div style="font-size:18px;font-weight:700;color:#8B6310;margin-bottom:16px;">' + SITE_NAME + '</div>' +
    bodyHtml +
    '<div style="margin-top:24px;padding-top:16px;border-top:1px solid #E5D9B8;font-size:12px;color:#6b6b6b;">' +
    '這是系統自動發送的通知信，請勿直接回覆。如有疑問請聯絡 ' + SUPPORT_EMAIL + '</div>' +
    '</div>';
}

const TEMPLATES = {
  // ── (1) เพิ่งยื่นคำขอลบบัญชี — เข้าสู่ cooldown 7 วัน ──────────────────────────────
  account_deletion_requested: {
    // 🆕 2026-08-08 (รอบ 3 — ตามที่ Lin สั่ง): cron ลบจริงรันวันละครั้งเท่านั้น (pg_cron 20:00 UTC)
    // ห้ามเขียนว่าจะลบ "ตรงเวลานั้นเป๊ะ" — ต้องสื่อว่าเป็น "รอบดำเนินการถัดไปหลังจากวันนั้น" เสมอ
    required: ['scheduled_delete_at'],
    subject: function () { return '【' + SITE_NAME + '】已收到您的刪除帳號請求'; },
    html: function (data) {
      return wrapHtml(
        '<p style="font-size:14px;line-height:1.7;">我們已收到您刪除帳號的請求。</p>' +
        '<p style="font-size:14px;line-height:1.7;">帳號將於 <b>' + fmtDateTH(data.scheduled_delete_at) + '</b> 之後的系統例行處理中永久刪除（系統每日執行一次，實際刪除時間可能略晚於此時間點，但不會提前），屆時所有資料將無法復原。</p>' +
        '<p style="font-size:14px;line-height:1.7;">如果這不是您本人的操作，或您改變主意了，請在期限前登入帳號，於「帳號管理」頁面點擊「取消刪除」即可保留帳號，資料完全不受影響。</p>'
      );
    },
  },
  // ── (2) ผู้ใช้กดยกเลิกคำขอลบเอง ────────────────────────────────────────────────
  account_deletion_cancelled: {
    required: [],
    subject: function () { return '【' + SITE_NAME + '】刪除帳號請求已取消'; },
    html: function () {
      return wrapHtml(
        '<p style="font-size:14px;line-height:1.7;">您的刪除帳號請求已成功取消。</p>' +
        '<p style="font-size:14px;line-height:1.7;">帳號已恢復正常狀態，所有資料維持不變，您可以繼續正常使用。</p>'
      );
    },
  },
  // ── (3) ลบบัญชีถาวรสำเร็จแล้วจริง (cron ส่งหลังลบเสร็จ ใช้อีเมลที่ "แคชไว้ก่อนลบ" — ดูเหตุผลใน
  //     account-delete-cron/index.ts ว่าทำไมต้องแคชอีเมลไว้ก่อนเริ่มลบ) ────────────────────
  account_deletion_completed: {
    required: [],
    subject: function () { return '【' + SITE_NAME + '】帳號已永久刪除'; },
    html: function () {
      return wrapHtml(
        '<p style="font-size:14px;line-height:1.7;">您的帳號與相關資料已依照您的請求永久刪除。</p>' +
        '<p style="font-size:14px;line-height:1.7;">此為最後一封與此帳號相關的通知信。若您想再次使用本服務，歡迎隨時重新註冊新帳號。</p>'
      );
    },
  },
};

function corsHeaders() {
  // ฟังก์ชันนี้เรียกจาก server-to-server เท่านั้น (Edge Function อื่นในโปรเจกต์เดียวกัน) ไม่มี browser
  // ไหนเรียกตรงเลย จึงไม่ต้องเปิด CORS ให้ origin ของเว็บเลย — ตั้งใจไม่ใส่ Access-Control-Allow-Origin
  // ที่ตรงกับโดเมนเว็บ (กันสับสนว่าฟังก์ชันนี้เรียกจาก browser ได้ ซึ่งไม่ควรเป็นแบบนั้น)
  return { 'Content-Type': 'application/json' };
}

// ── ตรวจว่าผู้เรียกเป็น service_role จริง (decode JWT อ่าน claim `role` — ผ่านเกตเวย์ verify_jwt ของ
//    Supabase มาก่อนหน้านี้แล้ว แปลว่าลายเซ็นถูกต้องแน่นอน จึงอ่าน claim ตรงๆ ได้อย่างปลอดภัย) ──────
function decodeJwtPayloadUnsafe(jwt) {
  try {
    const parts = String(jwt || '').split('.');
    if (parts.length !== 3) return null;
    const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
    return JSON.parse(atob(padded));
  } catch (e) {
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 🔴 sendViaProvider() — จุดเดียวที่ต้องแก้ถ้า Lin เลือก provider อื่นที่ไม่ใช่ Resend
//   โครงด้านล่างคือตัวอย่างอ้างอิงของ Resend API (https://resend.com/docs/api-reference/emails/send-email)
//   POST https://api.resend.com/emails พร้อม header Authorization: Bearer <API key>
// ═══════════════════════════════════════════════════════════════════════════
async function sendViaProvider(to, subject, html) {
  const apiKey = Deno.env.get('EMAIL_PROVIDER_API_KEY');
  const fromAddress = Deno.env.get('EMAIL_FROM_ADDRESS') || ('noreply@mrtaihualin.com');
  if (!apiKey) {
    throw Object.assign(new Error('ไม่พบ secret EMAIL_PROVIDER_API_KEY — ยังไม่ได้ตั้งค่า provider จริง (ดูหัวไฟล์)'), { code: 'provider_not_configured' });
  }
  // 🔶 ตัวอย่างอ้างอิง Resend — ถ้า Lin เลือก provider อื่น (Postmark/SendGrid/SES ฯลฯ) ให้แทนที่ทั้งบล็อก
  // fetch นี้ด้วยรูปแบบ API ของ provider นั้น ส่วนที่เหลือทั้งไฟล์ (TEMPLATES, การตรวจสิทธิ์, contract)
  // ไม่ต้องแก้เลย
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + apiKey },
    body: JSON.stringify({ from: fromAddress, to: [to], subject: subject, html: html }),
  });
  const json = await res.json().catch(function () { return {}; });
  if (!res.ok) {
    throw Object.assign(new Error('ผู้ให้บริการอีเมลตอบกลับ error: ' + (json && json.message || res.status)), { code: 'provider_error', detail: json });
  }
  return { provider: 'resend', provider_message_id: json && json.id || null };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders() });
  function json(body, status) {
    return new Response(JSON.stringify(body), { status: status || 200, headers: corsHeaders() });
  }
  if (req.method !== 'POST') return json({ error: 'method_not_allowed', message: 'ใช้ POST เท่านั้น' }, 405);

  try {
    // ── ต้องเป็น service_role เท่านั้น (ดูเหตุผลเต็มในหัวไฟล์) ──
    const authHeader = req.headers.get('Authorization') || '';
    const jwt = authHeader.replace(/^Bearer\s+/i, '');
    const claims = decodeJwtPayloadUnsafe(jwt);
    if (!claims || claims.role !== 'service_role') {
      return json({ error: 'forbidden', message: 'ฟังก์ชันนี้เรียกได้เฉพาะจาก server อื่นในระบบเท่านั้น' }, 401);
    }

    let body;
    try { body = await req.json(); } catch (e) { return json({ error: 'invalid_json_body', message: 'รูปแบบข้อมูลไม่ถูกต้อง' }, 400); }

    const templateName = body && body.template;
    const to = body && body.to;
    const data = (body && body.data) || {};

    const tpl = TEMPLATES[templateName];
    if (!tpl) return json({ error: 'invalid_template', message: 'ไม่รู้จัก template: ' + templateName, known_templates: Object.keys(TEMPLATES) }, 400);
    if (!to || typeof to !== 'string' || to.indexOf('@') === -1) {
      return json({ error: 'missing_to', message: 'ต้องระบุอีเมลปลายทางที่ถูกต้อง' }, 400);
    }
    const missingFields = tpl.required.filter(function (k) { return data[k] === undefined || data[k] === null; });
    if (missingFields.length) {
      return json({ error: 'missing_data_field', message: 'ขาดข้อมูลที่ template ต้องการ: ' + missingFields.join(', ') }, 400);
    }

    const subject = tpl.subject(data);
    const html = tpl.html(data);

    const sendResult = await sendViaProvider(to, subject, html);

    return json({ ok: true, template: templateName, provider: sendResult.provider, provider_message_id: sendResult.provider_message_id });
  } catch (e) {
    // ส่งไม่สำเร็จ — ตอบ 500 ชัดเจนเสมอ ไม่ปั๊ม ok:true หลอกๆ (RELIABILITY FIRST) ผู้เรียกต้องดักผลนี้เอง
    const code = (e && e.code) || 'unexpected_error';
    return json({
      error: code,
      message: code === 'provider_not_configured'
        ? 'ระบบอีเมลยังไม่ได้ตั้งค่า provider จริง (Lin ยังไม่ได้เลือก/ตั้ง secret) — ไม่ใช่บั๊ก เป็นสถานะที่คาดไว้ก่อน deploy จริง'
        : 'ส่งอีเมลไม่สำเร็จ',
      detail: String((e && e.message) || e),
    }, 500);
  }
});

// ════════════════════════════════════════════════════════════════════════════
// ตัวเลือก email provider ที่เทียบไว้ให้ Lin ตัดสินใจ (ยังไม่ได้เลือก — AI ห้ามเลือกเอง)
// ════════════════════════════════════════════════════════════════════════════
// | Provider  | ข้อดี | ข้อสังเกต |
// |-----------|-------|-----------|
// | Resend    | API เรียบง่ายที่สุด (1 endpoint, JSON ธรรมดา) เหมาะกับ transactional email โดยเฉพาะ
// |           | มี free tier (ราว 3,000 ฉบับ/เดือน ณ ที่ตรวจล่าสุด — ควรเช็คราคาปัจจุบันเองก่อนตัดสินใจ
// |           | เพราะราคาผู้ให้บริการเปลี่ยนได้ตลอด) เอกสารทันสมัย รองรับ React Email template (ไม่จำเป็น
// |           | ต้องใช้ก็ได้) — โค้ดตัวอย่างในไฟล์นี้เขียนไว้ให้แล้ว
// | Postmark  | ชื่อเสียงเรื่อง deliverability (อีเมลไม่ตกถังขยะ) ดีมากในกลุ่ม transactional-only โดยเฉพาะ
// |           | แยกโควตา transactional/marketing ชัดเจน (marketing ต้องขอ approve เพิ่ม) เหมาะกับ "ห้ามมี
// |           | marketing email" ตามที่ Lin สั่ง เพราะระบบเขาบังคับแยกอยู่แล้วในตัว
// | SendGrid  | ผู้เล่นใหญ่ที่สุด/เก่าแก่สุด มี free tier แต่ API ซับซ้อนกว่า 2 ตัวบน ประวัติเรื่อง
// |           | deliverability มีทั้งดีและมีเคสร้องเรียนบ้างในอดีต ควรอ่านรีวิวล่าสุดเองก่อนตัดสินใจ
// |
// ทุกตัวต้องมีขั้นตอนเดียวกัน: สมัครบัญชี → verify โดเมนส่งเมล (เพิ่ม DNS record บนโดเมน mrtaihualin.com
// — ต้องเข้าถึงที่จัดการ DNS ของโดเมนได้) → ได้ API key → ตั้ง secret → (ถ้าไม่ใช่ Resend) แก้
// sendViaProvider() ด้านบนให้ตรงกับ API ของ provider นั้น
// ════════════════════════════════════════════════════════════════════════════
