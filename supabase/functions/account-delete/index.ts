// ════════════════════════════════════════════════════════════════════════════
// Supabase Edge Function: account-delete
// ────────────────────────────────────────────────────────────────────────────
// สถานะไฟล์นี้: "ร่างเท่านั้น" (DRAFT — ยังไม่ deploy, ยังไม่ผูกกับ UI ใดๆ)
// ห้าม deploy เองก่อน Lin ตรวจ + อนุมัติ (ตามกฎเว็บ CLAUDE.md ข้อ "เว็บต้องผ่าน Lin ก่อนเสมอ")
//
// 🆕 2026-08-08 (รอบ 2) — เปลี่ยนสถาปัตยกรรมทั้งหมด: จาก "confirm แล้วลบทันที" เป็น "cooldown 7 วัน"
//   ตามที่ Lin ตัดสินใจ (ผ่านแชท decision queue): ผู้ใช้ยื่นคำขอ → เข้าสถานะรอ 7 วัน → ยกเลิกได้เองระหว่างนี้
//   → ครบกำหนดยังไม่ยกเลิก → ลบถาวรจริง (ทำโดย `account-delete-cron/index.ts` แยกไฟล์ต่างหาก ไม่ใช่ไฟล์นี้)
//   ⚠️ ไฟล์นี้ "ไม่ลบข้อมูลอะไรเลยอีกต่อไป" — งานลบจริงย้ายไปอยู่ที่ account-delete-cron ทั้งหมด
//   ไฟล์นี้เหลือหน้าที่แค่: (1) preview (2) request — สร้างคำขอเข้า cooldown (3) cancel — ยกเลิกคำขอ
//
// หน้าที่ 3 action:
//   1) action: "preview" — บอกล่วงหน้าว่าจะลบ/ทำให้ไม่ระบุตัวตนอะไรบ้าง กี่แถว + บอกด้วยว่ามีคำขอลบค้าง
//      (pending) อยู่หรือเปล่า กำหนดลบวันไหน (ให้ฝั่งเว็บโชว์ banner ได้)
//   2) action: "request" (ต้องมี body.confirm === true ด้วย — ชื่อ field คงเดิม 'confirm' กันงงกับ
//      ฝั่งเว็บที่เขียนไว้แล้ว แม้ action เปลี่ยนชื่อจาก 'confirm' เป็น 'request') — สร้างแถวใน
//      account_deletion_requests (status='pending', scheduled_delete_at = now()+7 วัน) "ไม่ลบอะไรจริง
//      ในขั้นนี้เลย" ส่งอีเมลแจ้งว่ารับคำขอแล้ว
//   3) action: "cancel" — ยกเลิกคำขอที่ยังค้างอยู่ (status='pending' → 'cancelled') บัญชีกลับสถานะปกติ
//      ทันที ส่งอีเมลยืนยันว่ายกเลิกแล้ว
//
// ทำไมต้องมีฟังก์ชันนี้แยกจาก client เขียนตรง: (เหตุผลเดิม ไม่เปลี่ยน)
//   - เว็บนี้ไม่มีระบบรหัสผ่านเลย (ล็อกอินผ่าน Google/Facebook OAuth, LINE custom flow, หรือ Email OTP
//     เท่านั้น — ดู js/games/reading-auth.js) จึงไม่มี "ใส่รหัสผ่านซ้ำก่อนลบบัญชี" แบบเว็บทั่วไป
//     กติกาการ "ยืนยันตัวตนซ้ำ" (re-auth) ของฟังก์ชันนี้คือ: ต้องพก JWT ที่ "เพิ่งออกใหม่จริงๆ" — ใช้กับ
//     action="request" เท่านั้น (ดูเหตุผลที่ "cancel" ไม่บังคับ fresh JWT ในหัวข้อด้านล่าง)
//
// ── ทำไม "request" ต้องบังคับ fresh JWT แต่ "cancel" ไม่บังคับ (ตัดสินใจออกแบบ — บันทึกไว้ชัดๆ) ──
//   request = การกระทำที่ "เริ่มต้นความเสี่ยง" (เข้าสู่นับถอยหลังลบบัญชี) ต้องยืนยันตัวตนซ้ำเพื่อกันเคส
//   "เผลอทิ้งเบราว์เซอร์ล็อกอินค้างไว้แล้วมีคนมากดขอลบแทน" (เหตุผลเดิมจากตอนที่ request=ลบทันที)
//   cancel = การกระทำที่ "ถอยออกจากความเสี่ยง" (ยกเลิกการนับถอยหลัง) — ทิศทางนี้ปลอดภัยกว่าเสมอไม่ว่า
//   ใครจะเป็นคนกด (แม้แต่คนที่ขโมย session มา กดยกเลิกก็แค่ทำให้บัญชียังอยู่ต่อ ไม่มีความเสียหายเกิดขึ้น)
//   บังคับ fresh JWT ตรงนี้จะเป็นแค่การเพิ่มด่านให้เจ้าของบัญชีตัวจริงทำสิ่งที่ปลอดภัยได้ยากขึ้นเฉยๆ — แพทเทิร์น
//   การให้เหตุผลเดียวกับที่ account-unlink/index.ts ใช้ตัดสินใจเรื่อง "ทิศทางไหนปลอดภัยกว่าเมื่อข้อมูลขัดกัน"
//
// ── payout_ledger (ข้อมูลการเงิน) — ยังคงเช็คก่อนอนุญาตให้ "request" เหมือนเดิม ไม่เปลี่ยน ──────
//   บล็อกทั้งบัญชีถ้ามีรายการ pending/approved ค้างอยู่ (เหตุผลเต็มอยู่ในฟังก์ชัน checkOpenPayout() ด้านล่าง
//   — คัดลอกมาจากไฟล์เวอร์ชันก่อนหน้าตรงๆ ไม่เปลี่ยนแปลง) 🚫 ยังรอ Lin ตัดสินใจเรื่องแถวที่ "จบแล้ว"
//   (status='paid'/'rejected') เหมือนเดิม — ตอนนี้ปล่อยเป็น orphan ไม่แตะ (ยืนยันแล้วว่า Lin ต้องการแบบนี้
//   ผ่านแชท decision queue 2026-08-08 ข้อ 5 — "ใช้พฤติกรรมเดิมที่ตรวจแล้ว ไม่ต้องแก้")
//
// วิธี deploy (สำหรับ Lin ทำเองภายหลัง — AI ไม่มีสิทธิ์และไม่รันเอง):
//   1. ต้องรัน `supabase/sql/2026-08-08_account_deletion_cooldown.sql` หัวข้อ [A][B] ก่อนเสมอ (สร้างตาราง
//      account_deletion_requests + ขยาย CHECK ของ account_audit_log) — ไม่งั้นฟังก์ชันนี้จะพังทันทีที่
//      action="request" (insert ไม่ผ่านเพราะตารางไม่มีอยู่)
//   2. deploy ตัวนี้ก่อน หรือพร้อมกับ account-delete-cron ก็ได้ (ไม่ขึ้นต่อกันโดยตรง — ไฟล์นี้แค่ "สร้างคำขอ"
//      ไม่ได้เรียก cron ตรงๆ) : supabase functions deploy account-delete
//   3. ไม่ต้องตั้ง secret เพิ่ม — ใช้ SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / SUPABASE_ANON_KEY ที่
//      Supabase ใส่ให้ทุก Edge Function อยู่แล้วอัตโนมัติ (การส่งอีเมลเรียกผ่าน send-transactional-email
//      ซึ่งเป็นฟังก์ชันแยก ต้องตั้ง secret ของมันเองต่างหาก ดูไฟล์นั้น)
// ════════════════════════════════════════════════════════════════════════════

// deno-lint-ignore-file
// @ts-nocheck  (Supabase Edge Function รันบน Deno ไม่ใช่ Node — IDE อาจฟ้อง type error ปกติ ไม่กระทบตอน deploy จริง)

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// JWT ต้องออกมาไม่เกินกี่วินาทีที่แล้วถึงจะถือว่า "เพิ่งล็อกอิน/refresh ซ้ำจริง" (re-auth) — ใช้กับ
// action="request" เท่านั้น (ดูเหตุผลที่ "cancel" ไม่บังคับ ในหัวไฟล์)
const FRESH_JWT_MAX_AGE_SECONDS = 300;

// จำนวนวันของ cooldown ก่อนลบถาวรจริง — Lin ตัดสินใจแล้วว่าใช้ 7 วัน (ถ้าจะปรับ แก้เลขนี้ที่เดียว
// แต่ต้องแก้ข้อความอีเมลใน send-transactional-email/index.ts ให้ตรงด้วย เพราะตอนนี้เขียนวันที่จาก
// scheduled_delete_at ที่คำนวณจริง ไม่ได้ฮาร์ดโค้ดคำว่า "7 วัน" ในอีเมล จึงไม่ต้องแก้ข้อความอีเมลจริงๆ
// ถ้าปรับแค่ตัวเลขนี้ — แค่บันทึกไว้ให้ชัดเผื่อมีคนไปเขียนคำว่า "7 วัน" ตายตัวเพิ่มที่อื่นในอนาคต)
const COOLDOWN_DAYS = 7;

// 🆕 2026-08-08 (รอบ 3 — ตามที่ Lin สั่ง): account-delete-cron รันแค่วันละครั้ง (pg_cron 20:00 UTC)
// "ครบกำหนด" (scheduled_delete_at ถึงแล้ว) ไม่ได้แปลว่าลบทันทีวินาทีนั้น — ต้องรอถึงรอบ cron ถัดไปที่
// วิ่งมาเจอแถวนี้ก่อน (ช้าสุดไม่เกิน ~24 ชม.หลัง scheduled_delete_at) ทุกข้อความที่ผู้ใช้เห็น (response
// นี้ + banner ฝั่งเว็บ + อีเมล) ต้องสื่อว่า "จะลบในรอบดำเนินการถัดไปหลังจากวันที่นี้" ไม่ใช่ "ลบตรงวินาที
// นั้นเป๊ะ" ห้ามเขียนคำที่สื่อความแม่นยำระดับวินาที/นาทีเด็ดขาด

const ALLOWED_ORIGINS = [
  'https://mrtaihualin.com',
  'https://www.mrtaihualin.com',
  'https://mrtaihualin.github.io',
  // 2026-08-10 (P7-02 staging): หน้าทดสอบ staging บน Netlify
  'https://gentle-moxie-bf64ad.netlify.app',
];

// ตารางที่มี FK ไป auth.users แบบ "RESTRICT" (ไม่ cascade เอง) — ใช้แค่ตอน preview เพื่อโชว์ตัวเลขให้
// ผู้ใช้เห็นล่วงหน้า (การลบจริงย้ายไปอยู่ที่ account-delete-cron แล้ว ไฟล์นี้ไม่ลบอะไรเอง)
const HARD_DELETE_TABLES = ['game_reward_points', 'game_reward_events', 'anon_game_events'];
const ANONYMIZE_TABLES = ['login_events', 'star_ledger'];
const CASCADE_TABLES = [
  'game_accounts', 'profiles', 'reading_sessions', 'tone_progress',
  'tone_sessions', 'tone_srs_state', 'line_identities', 'classroom_game_links',
];

function corsHeadersFor(origin) {
  const allowOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Vary': 'Origin',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
}

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

async function countRows(admin, table, userId) {
  const { count, error } = await admin.from(table).select('*', { count: 'exact', head: true }).eq('user_id', userId);
  if (error) return { count: null, error: error.message };
  return { count: count || 0, error: null };
}

// ── เช็ครายการเงินค้างใน payout_ledger — เหตุผลเต็มเหมือนเวอร์ชันก่อนหน้าทุกประการ (คัดลอกไม่เปลี่ยน) ──
async function checkOpenPayout(admin, userId) {
  const { data, error } = await admin
    .from('payout_ledger')
    .select('id, status, amount, currency, stars_redeemed, created_at')
    .eq('user_id', userId)
    .in('status', ['pending', 'approved']);
  if (error) return { blocked: true, reason: 'payout_check_failed', detail: error.message, rows: [] };
  const rows = data || [];
  return { blocked: rows.length > 0, reason: rows.length > 0 ? 'open_payout_exists' : null, rows };
}

// ── ส่งอีเมล transactional ผ่านฟังก์ชันกลาง send-transactional-email (server-to-server เรียกด้วย
//    service_role) — ไม่ critical: ส่งไม่สำเร็จไม่บล็อกการ request/cancel (สถานะจริงใน DB คือความจริงหลัก
//    อีเมลเป็นแค่การแจ้งเสริม) แต่ต้อง "โวยดังๆ" เสมอถ้าพลาด (console.error) ห้ามกลืน error เงียบๆ
//    ตามกฎ RELIABILITY FIRST — ผลลัพธ์ (ส่งสำเร็จไหม) จะถูกคืนกลับไปกับ response ให้ client เห็นด้วย
//    (field email_sent) เผื่อ Lin อยากโชว์ผู้ใช้ว่า "การเปลี่ยนสถานะสำเร็จ แต่อีเมลอาจส่งไม่ถึง" ──
async function sendDeletionEmail(SUPABASE_URL, SERVICE_KEY, template, to, data) {
  if (!to) {
    console.error('[account-delete] ไม่มีอีเมลปลายทาง ข้ามการส่ง template=' + template);
    return { sent: false, reason: 'no_email_on_account' };
  }
  try {
    const res = await fetch(SUPABASE_URL + '/functions/v1/send-transactional-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + SERVICE_KEY, apikey: SERVICE_KEY },
      body: JSON.stringify({ template, to, data: data || {} }),
    });
    const json = await res.json().catch(function () { return {}; });
    if (!res.ok) {
      console.error('[account-delete] ส่งอีเมล template=' + template + ' ไม่สำเร็จ:', json);
      return { sent: false, reason: (json && json.error) || ('http_' + res.status) };
    }
    return { sent: true };
  } catch (e) {
    console.error('[account-delete] เรียก send-transactional-email พังกลางทาง template=' + template, e);
    return { sent: false, reason: 'network_error' };
  }
}

serve(async (req) => {
  const origin = req.headers.get('Origin') || '';
  const cors = corsHeadersFor(origin);
  function json(body, status) {
    return new Response(JSON.stringify(body), { status: status || 200, headers: { 'Content-Type': 'application/json', ...cors } });
  }

  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed', message: 'ใช้ POST เท่านั้น' }, 405);

  let body;
  try {
    body = await req.json();
  } catch (e) {
    return json({ error: 'invalid_json_body', message: 'รูปแบบข้อมูลที่ส่งมาไม่ถูกต้อง กรุณาลองใหม่' }, 400);
  }
  const action = body?.action;
  if (action !== 'preview' && action !== 'request' && action !== 'cancel') {
    return json({ error: 'invalid_action', message: 'ต้องเป็น "preview", "request" หรือ "cancel" เท่านั้น' }, 400);
  }

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
  const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY');
  const admin = createClient(SUPABASE_URL, SERVICE_KEY); // bypass RLS — ใช้ทำงานจริงหลังยืนยันตัวตนแล้วเท่านั้น

  try {
    // ── ยืนยันตัวตนจาก JWT จริง (ไม่เชื่อ user_id ใดๆ ที่ client ส่งมาใน body) ──────────────
    const authHeader = req.headers.get('Authorization') || '';
    const jwt = authHeader.replace(/^Bearer\s+/i, '');
    if (!jwt) return json({ error: 'missing_auth_token', message: '請先登入' }, 401);

    const asUser = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } } });
    const { data: userData, error: userErr } = await asUser.auth.getUser(jwt);
    if (userErr || !userData?.user) return json({ error: 'invalid_session', message: '請重新登入' }, 401);
    const userId = userData.user.id;
    const userEmail = userData.user.email || null;

    // ── fresh-JWT gate — บังคับเฉพาะ preview/request เหมือนเดิม (cancel ไม่บังคับ ดูเหตุผลหัวไฟล์) ──
    if (action !== 'cancel') {
      const claims = decodeJwtPayloadUnsafe(jwt);
      const iat = claims?.iat;
      if (!iat || typeof iat !== 'number') {
        return json({ error: 'cannot_verify_session_freshness', message: 'token ไม่มี iat อ่านไม่ได้ กรุณาล็อกอินใหม่' }, 401);
      }
      const ageSeconds = Math.floor(Date.now() / 1000) - iat;
      if (ageSeconds > FRESH_JWT_MAX_AGE_SECONDS || ageSeconds < -30) {
        return json({
          error: 'stale_session',
          message: 'session เก่าเกินไป กรุณาออกจากระบบแล้วล็อกอินใหม่ก่อนลองอีกครั้ง',
          jwt_age_seconds: ageSeconds,
          max_allowed_seconds: FRESH_JWT_MAX_AGE_SECONDS,
        }, 401);
      }
    }

    // ── rate limit เกราะเสริม (fail-open) ──
    const { data: rlOk, error: rlErr } = await admin.rpc('rl_check', {
      p_user: userId, p_fn: 'account-delete', p_limit: 20, p_window: 600,
    });
    if (!rlErr && rlOk === false) return json({ error: 'rate_limited', message: '請稍後再試' }, 429);

    // ── ดึงคำขอ pending ปัจจุบัน (ถ้ามี) — ใช้ร่วมกันทั้ง 3 action ──
    const { data: pendingRows, error: pendingErr } = await admin
      .from('account_deletion_requests')
      .select('id, requested_at, scheduled_delete_at, status')
      .eq('user_id', userId)
      .eq('status', 'pending')
      .limit(1);
    if (pendingErr) {
      return json({ error: 'db_lookup_failed', message: 'ตรวจสอบสถานะคำขอลบบัญชีไม่สำเร็จ กรุณาลองใหม่', detail: pendingErr.message }, 500);
    }
    const pending = (pendingRows && pendingRows[0]) || null;

    // ══════════════════════════════════════════════════════════════════════
    // action: preview — แค่ "นับ" ไม่แตะข้อมูลเลย + บอกสถานะคำขอ pending ปัจจุบัน
    // ══════════════════════════════════════════════════════════════════════
    if (action === 'preview') {
      const payoutCheck = await checkOpenPayout(admin, userId);
      const willDelete = {};
      for (const t of HARD_DELETE_TABLES) {
        const r = await countRows(admin, t, userId);
        willDelete[t] = r.count === null ? { error: r.error } : r.count;
      }
      const willAnonymize = {};
      for (const t of ANONYMIZE_TABLES) {
        const r = await countRows(admin, t, userId);
        willAnonymize[t] = r.count === null ? { error: r.error } : r.count;
      }
      const willCascadeDelete = {};
      for (const t of CASCADE_TABLES) {
        const r = await countRows(admin, t, userId);
        willCascadeDelete[t] = r.count === null ? { error: r.error } : r.count;
      }

      return json({
        ok: true,
        user_id: userId,
        email: userEmail,
        can_delete: !payoutCheck.blocked,
        payout_check: payoutCheck.blocked
          ? {
              blocked: true,
              reason: payoutCheck.reason,
              open_rows: payoutCheck.rows,
              message: payoutCheck.reason === 'payout_check_failed'
                ? 'ตรวจสอบรายการเงินค้างไม่สำเร็จ — ไม่อนุญาตให้ยื่นคำขอลบบัญชีจนกว่าจะตรวจสอบได้ (ทางปลอดภัยไว้ก่อน)'
                : 'บัญชีนี้มีรายการแลกดาวเป็นเงินที่ยังไม่จบ (pending/approved) — ต้องให้ครูดำเนินการจนจบ (จ่ายแล้ว/ปฏิเสธ) ก่อนถึงจะยื่นคำขอลบบัญชีได้',
            }
          : { blocked: false },
        will_delete: willDelete,
        will_anonymize: willAnonymize,
        will_cascade_delete: willCascadeDelete,
        anonymize_note: {
          login_events: 'ล้าง email/ip/fingerprint/user_agent ทิ้ง — เก็บ event/created_at ไว้เป็นสถิติ',
          star_ledger: 'ไม่มีคอลัมน์ระบุตัวตนในตารางนี้ (word/level/stars/reason/clean/game เป็นเนื้อหาเกม) — จะไม่ถูกแก้ไข แต่จะไม่ผูกกับบัญชีใดได้อีกหลังลบ auth user',
        },
        not_touched: {
          payout_ledger: 'ไม่แก้ไขข้อมูลการเงินเลย (นอกขอบเขต payment/billing) — แค่ตรวจสอบเพื่อบล็อกการยื่นคำขอถ้ามีรายการค้าง แถวที่จบแล้ว (paid/rejected) จะเหลือเป็น orphan หลังลบบัญชี (ยืนยันแล้วว่า Lin ต้องการแบบนี้)',
        },
        pending_deletion: pending
          ? {
              requested_at: pending.requested_at,
              scheduled_delete_at: pending.scheduled_delete_at,
              cooldown_days: COOLDOWN_DAYS,
            }
          : null, // 🆕 ให้ฝั่งเว็บโชว์ banner "กำลังรอลบ" ได้ ไม่ต้องเดา
        jwt_age_seconds: Math.floor(Date.now() / 1000) - (decodeJwtPayloadUnsafe(jwt)?.iat || 0),
      });
    }

    // ══════════════════════════════════════════════════════════════════════
    // action: cancel — ยกเลิกคำขอที่ยังค้างอยู่ บัญชีกลับสถานะปกติทันที
    // ══════════════════════════════════════════════════════════════════════
    if (action === 'cancel') {
      if (!pending) {
        return json({ error: 'no_pending_request', message: 'ไม่มีคำขอลบบัญชีที่กำลังรออยู่ ไม่มีอะไรต้องยกเลิก' }, 400);
      }
      // claim ก่อนแก้ — กันกดยกเลิกซ้ำซ้อนพร้อมกัน 2 แท็บ (เขียนซ้ำไม่มีอันตราย แต่กันข้อความ/อีเมลซ้ำ)
      const { data: updRows, error: updErr } = await admin
        .from('account_deletion_requests')
        .update({ status: 'cancelled', cancelled_at: new Date().toISOString() })
        .eq('id', pending.id)
        .eq('status', 'pending') // ← เงื่อนไข optimistic กันแก้ทับกัน
        .select();
      if (updErr) {
        return json({ error: 'cancel_failed', message: 'ยกเลิกคำขอลบบัญชีไม่สำเร็จ กรุณาลองใหม่อีกครั้ง', detail: updErr.message }, 500);
      }
      if (!updRows || updRows.length === 0) {
        // มีคนอื่น (หรือ cron ที่กำลัง claim ไปประมวลผล) เปลี่ยนสถานะไปแล้วพอดีระหว่างที่เรากำลังจะยกเลิก
        return json({
          error: 'cancel_race_lost', status: 500,
          message: 'คำขอนี้ถูกเปลี่ยนสถานะไปแล้วพอดี (อาจกำลังถูกดำเนินการลบอยู่) กรุณารีเฟรชหน้าเพื่อดูสถานะล่าสุด',
        }, 409);
      }

      // เขียน audit log — ไม่ critical ถ้าพลาด (การยกเลิกสำเร็จแล้วจริงตามแถวข้างบน) แต่ log ไว้เสมอ
      try {
        const { error: auditErr } = await admin.rpc('log_account_audit', {
          p_user_id: userId, p_event_type: 'account_deletion_cancelled',
          p_before_state: { status: 'pending', scheduled_delete_at: pending.scheduled_delete_at },
          p_after_state: { status: 'cancelled' },
          p_actor_type: 'user', p_actor_id: userId,
        });
        if (auditErr) console.error('[account-delete] log_account_audit (cancel) failed', auditErr);
      } catch (e) { console.error('[account-delete] log_account_audit (cancel) threw', e); }

      const emailResult = await sendDeletionEmail(SUPABASE_URL, SERVICE_KEY, 'account_deletion_cancelled', userEmail, {});
      if (emailResult.sent) {
        await admin.from('account_deletion_requests').update({ cancel_email_sent_at: new Date().toISOString() }).eq('id', pending.id);
      }

      return json({
        ok: true, cancelled: true, email_sent: emailResult.sent,
        message: '已成功取消刪除帳號請求，帳號已恢復正常狀態。',
      });
    }

    // ══════════════════════════════════════════════════════════════════════
    // action: request — สร้างคำขอเข้า cooldown 7 วัน "ไม่ลบอะไรจริงในขั้นนี้เลย"
    // ══════════════════════════════════════════════════════════════════════
    if (body?.confirm !== true) {
      return json({ error: 'missing_confirm', message: 'ต้องส่ง { action:"request", confirm:true } เท่านั้นถึงจะยื่นคำขอ' }, 400);
    }

    if (pending) {
      // มีคำขอ pending อยู่แล้ว — ไม่ใช่ error ร้ายแรง แค่คืนสถานะเดิมกลับไป (idempotent — กดซ้ำไม่สร้างซ้อน
      // อยู่แล้วเพราะมี unique index กันไว้ในชั้น DB ด้วย แต่เช็คตรงนี้ก่อนกันแค่ error message สวยกว่า)
      return json({
        ok: true, already_pending: true,
        scheduled_delete_at: pending.scheduled_delete_at,
        requested_at: pending.requested_at,
        message: 'มีคำขอลบบัญชีที่กำลังรออยู่แล้ว จะลบถาวรในรอบดำเนินการถัดไปหลังจากวันที่ ' + pending.scheduled_delete_at + ' (ระบบประมวลผลวันละครั้ง ไม่ใช่ลบทันทีตรงเวลานั้นเป๊ะ)',
      });
    }

    const payoutCheck = await checkOpenPayout(admin, userId);
    if (payoutCheck.blocked) {
      return json({
        ok: false,
        error: payoutCheck.reason,
        detail: payoutCheck.detail,
        open_rows: payoutCheck.rows,
        message: payoutCheck.reason === 'payout_check_failed'
          ? 'ตรวจสอบรายการเงินค้างไม่สำเร็จ — ไม่ได้สร้างคำขอลบใดๆ เลย ปฏิเสธไว้ก่อนเพื่อความปลอดภัย ลองใหม่อีกครั้ง'
          : 'บัญชีนี้มีรายการแลกดาวเป็นเงินที่ยังไม่จบ (pending/approved) — ไม่ได้สร้างคำขอลบใดๆ เลย ต้องให้ครูดำเนินการรายการนั้นจนจบ (จ่ายแล้ว/ปฏิเสธ) ก่อนถึงจะยื่นคำขอลบบัญชีนี้ได้',
      }, 409);
    }

    const scheduledDeleteAt = new Date(Date.now() + COOLDOWN_DAYS * 24 * 60 * 60 * 1000).toISOString();
    const { data: insertedRows, error: insertErr } = await admin
      .from('account_deletion_requests')
      .insert({ user_id: userId, status: 'pending', scheduled_delete_at: scheduledDeleteAt })
      .select();
    if (insertErr) {
      // unique index (uq_account_deletion_pending_per_user) กันแถวซ้อนไว้อีกชั้น — ถ้าชนตรงนี้ (race
      // ที่ preview เช็คไม่เจอ pending แต่ insert มาชนพอดี) ให้ตอบแบบเดียวกับ "มีคำขออยู่แล้ว" ไม่ใช่ error
      if (insertErr.code === '23505' /* unique_violation */) {
        const { data: raceRows } = await admin.from('account_deletion_requests').select('requested_at, scheduled_delete_at').eq('user_id', userId).eq('status', 'pending').limit(1);
        const raceRow = raceRows && raceRows[0];
        return json({
          ok: true, already_pending: true,
          scheduled_delete_at: raceRow?.scheduled_delete_at || null,
          message: 'มีคำขอลบบัญชีที่กำลังรออยู่แล้ว (สร้างพร้อมกันจากอีกแท็บ/อุปกรณ์)',
        });
      }
      return json({ error: 'request_failed', message: 'สร้างคำขอลบบัญชีไม่สำเร็จ กรุณาลองใหม่อีกครั้ง', detail: insertErr.message }, 500);
    }
    const newRow = insertedRows[0];

    // เขียน audit log — ไม่ critical ถ้าพลาด (คำขอสร้างสำเร็จแล้วจริงตามแถวข้างบน)
    try {
      const { error: auditErr } = await admin.rpc('log_account_audit', {
        p_user_id: userId, p_event_type: 'account_deletion_requested',
        p_before_state: { status: 'none' },
        p_after_state: { status: 'pending', scheduled_delete_at: scheduledDeleteAt },
        p_actor_type: 'user', p_actor_id: userId,
      });
      if (auditErr) console.error('[account-delete] log_account_audit (request) failed', auditErr);
    } catch (e) { console.error('[account-delete] log_account_audit (request) threw', e); }

    const emailResult = await sendDeletionEmail(SUPABASE_URL, SERVICE_KEY, 'account_deletion_requested', userEmail, { scheduled_delete_at: scheduledDeleteAt });
    if (emailResult.sent) {
      await admin.from('account_deletion_requests').update({ request_email_sent_at: new Date().toISOString() }).eq('id', newRow.id);
    }

    return json({
      ok: true,
      requested: true,
      scheduled_delete_at: scheduledDeleteAt,
      cooldown_days: COOLDOWN_DAYS,
      email_sent: emailResult.sent,
      message: '已收到刪除帳號請求。' + COOLDOWN_DAYS + ' 天後（' + new Date(scheduledDeleteAt).toLocaleDateString('zh-TW') + ' 之後）系統將於例行處理時永久刪除帳號。期限前登入並取消，可保留帳號。',
    });
  } catch (e) {
    return json({
      error: 'unexpected_error',
      message: 'เกิดข้อผิดพลาดที่ไม่คาดคิด กรุณาลองใหม่อีกครั้ง ถ้ายังไม่หายกรุณาแจ้งครู',
      detail: String((e && e.message) || e),
    }, 500);
  }
});

// ════════════════════════════════════════════════════════════════════════════
// สิ่งที่ยังต้องให้ Lin ตัดสินใจก่อน deploy จริง
// ════════════════════════════════════════════════════════════════════════════
// 1. ✅ ตัดสินใจแล้ว 2026-08-08 — cooldown 7 วัน, login ไม่ยกเลิกอัตโนมัติ, ต้องกดยกเลิกเอง, ต้องมี
//    banner + ปุ่มยกเลิก, ต้องมีอีเมลยืนยัน — ดู supabase/sql/2026-08-08_account_deletion_cooldown.sql
//    และ supabase/functions/account-delete-cron/index.ts ที่เตรียมไว้คู่กัน
// 2. ✅ payout_ledger — ยืนยันแล้วว่าใช้พฤติกรรมเดิม (บล็อกถ้ามี pending/approved ไม่แตะแถวจบแล้ว) ไม่ต้องแก้
// 3. ✅ star_ledger — ตรวจแล้วไม่มี PII จริง (reason เป็นค่าคงที่ 'capped'/'mastered' เท่านั้น จุดเดียวที่
//    insert คือ tone-round/index.ts) ไม่ต้องแก้
// 4. 🚫 ยังไม่ได้เลือก email provider — ดูหัวไฟล์ send-transactional-email/index.ts (ตารางเทียบ 3 ตัวเลือก
//    ท้ายไฟล์นั้น) ถ้าไม่เลือก/ไม่ตั้ง secret อีเมลจะส่งไม่สำเร็จเสมอ (แต่ไม่บล็อกการยื่นคำขอ/ยกเลิก — แค่ไม่มี
//    อีเมลไปถึงผู้ใช้ ระบบยังทำงานถูกต้องด้าน DB)
// 5. FRESH_JWT_MAX_AGE_SECONDS = 300 วินาที และ rate limit 20 ครั้ง/10 นาที เป็นค่าที่ AI ประมาณเองเดิม
//    (ไม่เปลี่ยนจากรอบก่อน) — ปรับได้ที่ค่าคงที่ต้นไฟล์
// 6. ฝั่ง client ต้องแก้ให้ตรงกับ action ใหม่ (request/cancel แทน confirm เดิม) — ดู
//    js/core/auth-widget.js ที่แก้คู่กันแล้วในรอบนี้
// 7. account-delete-cron ต้อง deploy คู่กัน + ตั้ง pg_cron ตาม SQL หัวข้อ [C] ไม่งั้นคำขอจะ "ค้างที่
//    pending ตลอดไป ไม่มีวันถูกลบจริงแม้ครบ 7 วันแล้ว" (ไม่ใช่บั๊ก แค่ยังไม่ได้ต่อสายให้ครบวงจร)
// ════════════════════════════════════════════════════════════════════════════
