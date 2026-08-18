// ════════════════════════════════════════════════════════════════════════════
// Supabase Edge Function: send-transactional-email
// ────────────────────────────────────────────────────────────────────────────
// สถานะไฟล์นี้: ฟังก์ชันกลางมีอยู่แล้ว; รอบ Auth Security เพิ่มเฉพาะ source ของ Email OTP template
// ห้าม deploy source delta รอบนี้จน Lin อนุมัติ Production rollout แยกต่างหาก
//
// Provider ที่อนุมัติแล้วคือ Resend; account, DNS, dashboard metadata และ secrets ยังเป็น Human/Production
// gates แยกต่างหากและอยู่นอก source authorization รอบนี้
//
// หน้าที่: จุดกลางจุดเดียวสำหรับส่ง transactional email ของทั้งเว็บ (เพิ่มจากที่ไม่เคยมีระบบอีเมลแจ้งเตือน
//   เลยมาก่อน — ตรวจแล้วไม่พบ Resend/SendGrid/Mailgun/Postmark/SES/nodemailer อยู่ในโปรเจกต์นี้เลยสักที่
//   ก่อนเริ่มงานนี้ ความสามารถ "อีเมล" เดิมมีแค่ Supabase Auth OTP ซึ่งเป็นกลไกล็อกอิน ไม่ใช่ระบบแจ้งเนื้อหา
//   ที่กำหนดเองได้ — ดูรายละเอียดการตรวจใน `docs/ACCOUNT_DATA_SAFETY_GAPS.md`)
//
// Registry มี 3 Account Deletion templates และ 1 Email OTP login template
// — Lin สั่งไว้ชัดว่า "ห้ามขยาย scope ไปสร้างระบบ marketing email" ไฟล์นี้จึงตั้งใจไม่มีอะไรเกี่ยวกับ
// unsubscribe list / bulk send / marketing template เลย เป็น transactional เท่านั้น (แจ้งเหตุการณ์ที่เกิด
// กับบัญชีของผู้ใช้เอง 1 คนต่อ 1 อีเมล ไม่ใช่ broadcast)
//
// ── ใครเรียกฟังก์ชันนี้ได้ (กันคนแปลกหน้ามาใช้เป็นเครื่องส่งสแปม) ──────────────────────────────
//   Email OTP เรียกได้เฉพาะจาก email-otp-auth ผ่าน named Supabase secret API key
//   `email-otp-mailer` ใน header `apikey` เหตุผล: ถ้าเปิดให้ authenticated เรียกตรงได้ ใครก็ตามที่ล็อกอินอยู่
//   จะสั่งให้ระบบส่งอีเมลไปหาใครก็ได้ (ใส่ to เป็นอีเมลใครก็ได้) กลายเป็นเครื่องมือส่งสแปม/ฟิชชิ่งฟรีทันที
//   Gateway JWT verification ต้องปิดสำหรับฟังก์ชันนี้ตาม key model ปัจจุบัน แล้ว source จะตรวจ exact named key
//   เองก่อนอ่าน body; missing/wrong key, publishable key, user JWT และ Authorization header ล้วน fail closed
//   Existing account-delete/account-delete-cron callers keep their exact prior dual-header service-role path only
//   for the three account-deletion templates; that compatibility path can never invoke email_login_otp
//
// ── Request/Response contract ─────────────────────────────────────────────────────
//   Method: POST
//   Headers: apikey: <named Supabase secret API key `email-otp-mailer`>
//     ห้ามใส่ key นี้ใน Authorization และห้ามส่งไป browser
//   Body: { template: string, to: string, data: object }
//     - template: ต้องอยู่ใน TEMPLATES ด้านล่างเท่านั้น (ตอนนี้มี 4 ตัว — ดูหัวข้อ TEMPLATES)
//     - to: อีเมลปลายทาง (ฟังก์ชันนี้ไม่ตรวจว่าเป็นอีเมลของใคร — ผู้เรียก (Edge Function อื่น) ต้อง
//       ตรวจเองแล้วว่า to คืออีเมลที่ถูกต้องของเจ้าของเหตุการณ์จริง ก่อนเรียกมาที่นี่)
//     - data: ตัวแปรสำหรับแทรกในเนื้อหาอีเมล (เช่น scheduled_delete_at) — แต่ละ template ต้องการ data
//       ไม่เหมือนกัน ดูที่ TEMPLATES ว่าต้องการอะไรบ้าง
//   Response 200: { ok: true, provider, provider_message_id }
//   Response 400: { error: 'invalid_template' | 'missing_to' | 'missing_data_field' | 'invalid_template_data', message }
//   Response 401: { error: 'forbidden', message }  — ไม่ใช่ exact named server caller
//   Response 500: { error: 'provider_error' | 'unexpected_error', message, detail }
//     — ส่งไม่สำเร็จต้องตอบ 500 ชัดเจนเสมอ ห้ามตอบ 200 หลอกๆ (RELIABILITY FIRST) ผู้เรียก (account-delete/
//     account-delete-cron) ต้องดักผลนี้เอง แล้วตัดสินใจว่าจะ retry/log/แจ้ง Lin ยังไง — ฟังก์ชันนี้แค่
//     "พยายามส่ง 1 ครั้งแล้วรายงานผลจริง" ไม่มี retry queue ในตัวเอง (ยังไม่ทำ — ดูหมายเหตุท้ายไฟล์)
//
// วิธี deploy (ภายหลังและต้องมี exact approval แยกทุก mutation):
//   1. ยืนยัน Resend domain/from-address/API-key metadata ที่อนุมัติไว้แล้ว
//   2. ตั้ง provider secret และสร้าง named Supabase secret API key `email-otp-mailer`
//   3. deploy send-transactional-email ด้วย verify_jwt=false; source ตรวจ named `apikey` เอง
//   4. ทดสอบส่งจริง 1 ฉบับไปอีเมลของ Lin เองก่อน ตรวจว่าไม่ตกไปถังขยะ (SPF/DKIM ของโดเมนตั้งถูกไหม)
// ════════════════════════════════════════════════════════════════════════════

// deno-lint-ignore-file
// @ts-nocheck  (Supabase Edge Function รันบน Deno ไม่ใช่ Node — IDE อาจฟ้อง type error ปกติ ไม่กระทบตอน deploy จริง)

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import {
  isEmailMailerRequestAuthorized,
  isEmailMailerTemplateAuthorized,
  isLegacyAccountMailerRequestAuthorized,
} from '../_shared/email-mailer-auth.mjs';

// ─────────────────────────────────────────────────────────────────────────
// TEMPLATES — เพิ่ม template ใหม่ในอนาคตแค่เพิ่ม entry ตรงนี้ 1 อัน (ตามที่ Lin สั่งให้ออกแบบขยายได้)
//   subject(data) / html(data) เป็นฟังก์ชันรับ data แล้วคืน string — ทำให้ใส่ค่าตัวแปร (เช่นวันที่)
//   เข้าไปในเนื้อหาได้ตรงไปตรงมา ไม่ต้องพึ่ง template engine ภายนอก
//   required: รายชื่อ key ใน data ที่ template นี้ต้องการ — เช็คก่อนส่งเสมอ กันเนื้อหาอีเมลมีคำว่า
//   "undefined" หลุดออกไปหาผู้ใช้จริง (เจอบ่อยเวลาลืมส่ง data ให้ครบ)
// ─────────────────────────────────────────────────────────────────────────
const SITE_NAME = '泰華眼裡的泰語教學';
const SUPPORT_EMAIL = 'mr.taihualin@gmail.com';

function fmtDateZhTW(iso) {
  // โชว์วันที่แบบอ่านง่าย ผูกกับ locale จีนตัวเต็ม (ผู้ใช้เว็บนี้เป็นคนไต้หวัน/ฮ่องกงเรียนภาษาไทยเป็นหลัก
  // — แก้บั๊ก 2026-08-09: เดิมใช้ th-TH ทำให้วันที่โผล่เป็นภาษาไทยแทรกอยู่กลางอีเมลภาษาจีนทั้งฉบับ)
  // ถ้า parse ไม่ได้ (ค่าที่ส่งมาผิดรูปแบบ) คืนค่าดิบกลับไปแทนที่จะพังทั้งอีเมล (ทางปลอดภัยกว่า)
  try {
    return new Date(iso).toLocaleString('zh-TW', { dateStyle: 'long', timeStyle: 'short', timeZone: 'Asia/Taipei' });
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
  // ── Email OTP login — broker-generated code, never Supabase's native OTP template ─────────────
  email_login_otp: {
    required: ['otp_code', 'expires_minutes'],
    validate: function (data) {
      return /^\d{6}$/.test(String(data.otp_code || '')) && Number(data.expires_minutes) === 10;
    },
    subject: function () { return '【' + SITE_NAME + '】您的登入驗證碼'; },
    html: function (data) {
      return wrapHtml(
        '<p style="font-size:14px;line-height:1.7;">請使用以下 6 位數驗證碼登入：</p>' +
        '<div style="margin:18px 0;padding:16px;border:1px solid #E5D9B8;border-radius:12px;background:#FFF9E8;text-align:center;font-size:30px;font-weight:800;letter-spacing:8px;color:#5C4410;">' + String(data.otp_code) + '</div>' +
        '<p style="font-size:14px;line-height:1.7;">驗證碼將於 <b>10 分鐘</b>後失效，且成功使用後不能再次使用。</p>' +
        '<p style="font-size:13px;line-height:1.7;color:#6b6b6b;">如果您沒有要求登入，請忽略此信，請勿將驗證碼告訴任何人。</p>'
      );
    },
  },
  // ── (1) เพิ่งยื่นคำขอลบบัญชี — เข้าสู่ cooldown 7 วัน ──────────────────────────────
  account_deletion_requested: {
    // 🆕 2026-08-08 (รอบ 3 — ตามที่ Lin สั่ง): cron ลบจริงรันวันละครั้งเท่านั้น (pg_cron 20:00 UTC)
    // ห้ามเขียนว่าจะลบ "ตรงเวลานั้นเป๊ะ" — ต้องสื่อว่าเป็น "รอบดำเนินการถัดไปหลังจากวันนั้น" เสมอ
    required: ['scheduled_delete_at'],
    subject: function () { return '【' + SITE_NAME + '】已收到您的刪除帳號請求'; },
    html: function (data) {
      return wrapHtml(
        '<p style="font-size:14px;line-height:1.7;">我們已收到您刪除帳號的請求。</p>' +
        '<p style="font-size:14px;line-height:1.7;">帳號將於 <b>' + fmtDateZhTW(data.scheduled_delete_at) + '</b> 之後的系統例行處理中永久刪除（系統每日執行一次，實際刪除時間可能略晚於此時間點，但不會提前），屆時所有資料將無法復原。</p>' +
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
    // Must be deployed with verify_jwt=false. This exact named-key check is the
    // Email OTP caller contract. The legacy branch is restricted after parsing
    // to account-recovery templates and exists only to preserve current callers.
    const caller = isEmailMailerRequestAuthorized(req.headers, Deno.env.get('SUPABASE_SECRET_KEYS'))
      ? 'email-otp'
      : (isLegacyAccountMailerRequestAuthorized(req.headers, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'))
        ? 'account-recovery'
        : '');
    if (!caller) {
      return json({ error: 'forbidden', message: 'ฟังก์ชันนี้เรียกได้เฉพาะจาก server อื่นในระบบเท่านั้น' }, 401);
    }

    let body;
    try { body = await req.json(); } catch (e) { return json({ error: 'invalid_json_body', message: 'รูปแบบข้อมูลไม่ถูกต้อง' }, 400); }

    const templateName = body && body.template;
    const to = body && body.to;
    const data = (body && body.data) || {};

    if (!isEmailMailerTemplateAuthorized(caller, templateName)) {
      return json({ error: 'forbidden', message: 'caller นี้ไม่มีสิทธิ์ใช้ template นี้' }, 401);
    }

    const tpl = TEMPLATES[templateName];
    if (!tpl) return json({ error: 'invalid_template', message: 'ไม่รู้จัก template: ' + templateName, known_templates: Object.keys(TEMPLATES) }, 400);
    if (!to || typeof to !== 'string' || to.indexOf('@') === -1) {
      return json({ error: 'missing_to', message: 'ต้องระบุอีเมลปลายทางที่ถูกต้อง' }, 400);
    }
    const missingFields = tpl.required.filter(function (k) { return data[k] === undefined || data[k] === null; });
    if (missingFields.length) {
      return json({ error: 'missing_data_field', message: 'ขาดข้อมูลที่ template ต้องการ: ' + missingFields.join(', ') }, 400);
    }
    if (tpl.validate && !tpl.validate(data)) {
      return json({ error: 'invalid_template_data', message: 'ข้อมูลสำหรับ template ไม่ถูกต้อง' }, 400);
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
        ? 'ระบบอีเมลยังไม่มี provider runtime configuration ที่พร้อมใช้งาน'
        : 'ส่งอีเมลไม่สำเร็จ',
      detail: String((e && e.message) || e),
    }, 500);
  }
});

// Resend is the approved provider. Dashboard metadata, DNS/provider changes,
// secrets, live delivery and every deploy remain separate Human/Production gates.
