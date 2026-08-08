// ════════════════════════════════════════════════════════════
// Supabase Edge Function: account-export  (ร่าง — ยังไม่ deploy รอ Lin อนุมัติ)
// หน้าที่: ให้ผู้เล่นที่ล็อกอินอยู่ ขอไฟล์ JSON รวมข้อมูล "ของตัวเองเท่านั้น" กลับไปดาวน์โหลด
//   (สิทธิ์ผู้ใช้ตามหลัก data portability — ผู้เล่นควรดึงข้อมูลตัวเองออกไปได้)
//
// ⚠️ กฎเหล็กข้อเดียวที่ Lin ย้ำ: ส่งออกได้เฉพาะข้อมูลของ "คนที่ยิง request มาเอง" เท่านั้น
//   ห้ามเชื่อ user_id ที่ client ส่งมาทางไหนก็ตาม (body/query) เด็ดขาด — ต้องได้ user id จาก
//   auth.getUser() ที่ยืนยัน JWT จริงฝั่งเซิร์ฟเวอร์เท่านั้น (ดูฟังก์ชัน getCallerUid() ด้านล่าง)
//
// กลไกล็อกสิทธิ์ "ข้อมูลของตัวเองเท่านั้น" — มี 2 ชั้น (ตามที่ออกแบบไว้ใน
// docs/ACCOUNT_DATA_SAFETY_GAPS.md หัวข้อ 4 ที่ Lin อนุมัติ scope ไปแล้ว):
//
//   ชั้นที่ 1 (ใช้เป็นหลักกับตารางส่วนใหญ่): สร้าง Supabase client ด้วย ANON_KEY + แนบ
//     Authorization header ของผู้เรียกเข้าไปตรงๆ (createClient(...,{global:{headers:{Authorization}}}))
//     → ทุก query ที่ยิงผ่าน client ตัวนี้ถูก Postgres RLS กรองให้เหลือแค่แถวที่ auth.uid() = user_id
//     โดยอัตโนมัติ "ที่ตัวฐานข้อมูลเอง" — ต่อให้โค้ดฝั่งนี้มีบั๊ก ก็ดึงข้อมูลคนอื่นออกมาไม่ได้เพราะ
//     Postgres ปฏิเสธตั้งแต่ชั้น RLS แล้ว (ยืนยันจริงจาก supabase/schema/2026-08-07_02_policies.sql
//     ว่าตารางต่อไปนี้มี SELECT policy แบบ `auth.uid() = user_id` ให้ authenticated/public แล้ว:
//     profiles, game_accounts, game_reward_points, game_reward_events, star_ledger, tone_progress,
//     tone_sessions, tone_srs_state, reading_sessions)
//
//   ชั้นที่ 2 (เฉพาะตารางที่ "ไม่มี policy อ่านให้ authenticated เลย" — ตรวจแล้วมี 2 ตาราง):
//     - line_identities: เปิด RLS ไว้แต่ "ไม่มี policy ใดๆ เลย" (fail-closed สนิท — ดู schema บรรทัด
//       528 + ไม่ปรากฏใน 02_policies.sql) → ผู้ใช้ทั่วไปอ่านแม้แต่แถวตัวเองก็ไม่ได้ผ่าน RLS-scoped client
//     - account_audit_log: ตั้งใจเปิด RLS แบบไม่มี policy เช่นกัน (ดู
//       supabase/sql/2026-08-08_account_audit_log.sql บรรทัด 58-62 — คอมเมนต์บอกชัดว่า "อ่านได้ทาง
//       Supabase SQL Editor เท่านั้น ตอนนี้" ยังไม่มีฟังก์ชัน SECURITY DEFINER สำหรับอ่านของตัวเอง)
//     สองตารางนี้จึง "ต้อง" ใช้ client แบบ service_role (ข้าม RLS ได้) แต่ทุกครั้งที่ใช้ service_role
//     ต้องแปะ `.eq('user_id', callerUid)` เองด้วยมือเสมอ — และ callerUid ตัวนี้มาจาก auth.getUser()
//     ในชั้นที่ 1 เท่านั้น (ตัวแปรเดียวกัน ไม่มีทางอื่นที่จะได้ค่านี้มา) ไม่ใช่จาก body ที่ client ส่งมา
//
// ครอบคลุมตาราง (Lin อนุมัติ scope นี้แล้วในเอกสารออกแบบ docs/ACCOUNT_DATA_SAFETY_GAPS.md หัวข้อ 4):
//   profiles, game_accounts, game_reward_points, star_ledger, tone_progress, tone_sessions,
//   tone_srs_state, reading_sessions, game_reward_events, line_identities (แค่ provider+วันที่ผูก
//   ไม่รวม token), auth.users (แค่ email + created_at — ได้มาจาก auth.getUser() ของผู้เรียกเองอยู่แล้ว
//   ไม่ต้องเรียก admin API เพิ่ม), account_audit_log (สรุปภาษาคน ไม่ใช่แถวดิบ — ดูคอมเมนต์จุดที่ดึง)
//
// ห้ามรวมเด็ดขาด (นอก scope ที่ Lin อนุมัติ — ตรงตามคำสั่งต้นทาง):
//   - payout_ledger (การเงิน — คนละระบบ ไม่แตะ)
//   - login_events (ข้อมูลความปลอดภัย เช่น IP/user-agent — ไม่ใช่ของที่ควรให้ผู้ใช้โหลดออกไป)
//   - account_audit_log แบบแถวดิบ (before_state/after_state/actor_id เป็นรายละเอียดฝั่งระบบ)
//     — ใส่ให้แค่สรุปภาษาคน (event_type แปลไทย + วันที่ + provider) เท่านั้น
//   - auth.users เกินกว่า email/created_at (ไม่มี password hash ในระบบนี้อยู่แล้ว, ไม่ดึง token ใดๆ)
//   - ไม่เขียนอะไรลงตารางไหนเลย — ฟังก์ชันนี้อ่านอย่างเดียว (read-only)
//
// account_audit_log ยังไม่มี event type สำหรับ "ผู้ใช้ export ข้อมูลตัวเอง" ใน CHECK constraint
//   (มีแค่ 8 ค่า: link/unlink/email_change/password_reset/account_merge/premium_transfer/
//   admin_correction/account_deletion — ดู supabase/sql/2026-08-08_account_audit_log.sql บรรทัด 49)
//   → ตั้งใจ "ไม่บันทึก" การ export ครั้งนี้ลง audit log เลย (ไม่ใช่ลืม) เพราะการเพิ่มค่าใหม่เข้า
//   CHECK constraint เป็นการแก้ schema ที่ต้องให้ Lin อนุมัติก่อนตามกฎ "SQL ทุกคำสั่งที่เปลี่ยนระบบ
//   ต้องมีไฟล์ต้นฉบับ + ต้องผ่าน Lin" — ถ้า Lin อยากให้มี log การ export ด้วย ต้องเพิ่ม 'data_export'
//   (หรือชื่ออื่นที่ Lin เลือก) เข้า CHECK constraint ก่อน แล้วค่อยเติมโค้ดเรียก log_account_audit()
//
// Request/Response contract (ไว้ให้ทีมต่อ UI):
//   Method: POST (ท่าเดียวกับฟังก์ชันอื่นทั้งหมดในโปรเจกต์ — game-content/game-reward)
//   Headers: Authorization: Bearer <access_token ของผู้เล่นที่ล็อกอินอยู่>  (บังคับ — ไม่มี = 401)
//   Body: ไม่ต้องส่งอะไรเลย ({} ก็พอ) — ถ้า client แนบ "user_id" มาใน body จะถูกเพิกเฉยเสมอ +
//     ฟังก์ชันจะ console.warn เตือนไว้ (เผื่อมีคนพยายามยิง user_id คนอื่นมาทดสอบ) ไม่ใช้ค่านั้นแม้แต่นิดเดียว
//   Response 200: JSON เดียวกับที่จะเซฟเป็นไฟล์ (โครงสร้างดูที่ collectExportData() ด้านล่าง) พร้อม
//     header Content-Disposition: attachment; filename="mrtaihualin-export-YYYY-MM-DD.json" —
//     ⚠️ ถ้าฝั่งเว็บเรียกผ่าน supabase.functions.invoke() SDK จะ parse JSON ให้อัตโนมัติแล้ว (ไม่เห็น
//     header attachment ตรงๆ) วิธีให้ผู้ใช้ "ดาวน์โหลดเป็นไฟล์จริง" ฝั่ง client ต้อง:
//       const blob = new Blob([JSON.stringify(data, null, 2)], {type:'application/json'});
//       const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
//       a.download = `mrtaihualin-export-${new Date().toISOString().slice(0,10)}.json`; a.click();
//     (หรือจะ fetch() ตรงๆ ไม่ผ่าน SDK เพื่อใช้ header attachment ของฝั่งเซิร์ฟเวอร์ตรงๆ ก็ได้เช่นกัน)
//   Response 401: { error: 'missing_auth_token'|'invalid_session', message: '...' } — ไม่มี/หมดอายุ token
//   Response 429: { error: 'rate_limited', message: '請稍後再試' } — ขอถี่เกินไป (5 ครั้ง/5 นาที/คน)
//   Response 500: { error: 'data_fetch_failed'|'unexpected_error', message: '...', detail: '...' } —
//     ดึงข้อมูลพลาด (ไม่มีวันส่ง JSON ที่ดึงมาไม่ครบออกไปเงียบๆ ตามกฎ RELIABILITY FIRST — พลาดจุดไหนจุดหนึ่ง
//     = ทั้งคำขอพัง ให้ผู้ใช้กดใหม่ ดีกว่าได้ไฟล์ที่ขาดๆ)
//   🆕 2026-08-08: ทุก response error แยก error (code คงที่ ไว้ log/debug) ออกจาก message (ข้อความที่
//     ผู้ใช้อ่านเข้าใจได้) เสมอแล้ว — ให้ตรงรูปแบบเดียวกับ account-delete/account-unlink (แก้ตามที่ Lin สั่ง
//     หลัง review เจอว่าไฟล์นี้เดิมส่ง raw error string เดียวไม่แยก code/message เหมือน 2 ไฟล์นั้น)
//
// วิธี deploy (Lin ต้องทำเอง เพราะ AI ไม่มีสิทธิ์ล็อกอิน Supabase ของ Lin — และงานนี้ "ห้าม deploy"
//   จนกว่า Lin จะตรวจโค้ดนี้ผ่านก่อนตามกฎเว็บต้องผ่าน Lin เสมอ):
//   1. supabase functions deploy account-export
//      ⚠️ ไม่ใส่ --no-verify-jwt (ต่างจาก line-webhook) — ฟังก์ชันนี้ถูกเรียกจาก Supabase client
//      ในเบราว์เซอร์เสมอ (แนบ apikey/anon JWT อัตโนมัติ) ใช้ค่า default (verify_jwt เปิด) ได้เหมือน
//      game-content/game-reward — เกตเวย์เช็คแค่ "เป็น JWT ของโปรเจกต์นี้จริง" ส่วน "ใครคือคนที่
//      ล็อกอินอยู่จริง" ฟังก์ชันนี้เช็คซ้ำเองอีกชั้นด้วย auth.getUser() ข้างล่าง (ไม่เชื่อเกตเวย์อย่างเดียว)
//   2. ไม่ต้องตั้ง secret เพิ่มเติม (ใช้ SUPABASE_URL/SUPABASE_ANON_KEY/SUPABASE_SERVICE_ROLE_KEY ที่
//      Supabase ใส่ให้อัตโนมัติทุก Edge Function อยู่แล้ว)
// ════════════════════════════════════════════════════════════

// deno-lint-ignore-file
// @ts-nocheck  (Supabase Edge Function รันบน Deno ไม่ใช่ Node — เวลาแก้ไฟล์นี้ในเครื่องอาจมี type error ของ IDE ปกติ ไม่กระทบตอน deploy จริง)

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// เพดานจำนวนแถวต่อกลุ่มข้อมูลที่มีประวัติยาวได้ไม่จำกัด (star_ledger/tone_sessions/reading_sessions/
// game_reward_events/account_audit_log) — กันคำขอเดียวลากข้อมูลเป็นแสนแถวจนฟังก์ชัน timeout หรือ
// response ใหญ่เกินไป ถ้าแตะเพดานจริง จะบอกผู้ใช้ตรงๆ ผ่าน field `capped:true` (ไม่ปล่อยเงียบ —
// ตามกฎ RELIABILITY FIRST ข้อ "ห้ามขึ้นว่าสำเร็จ/ครบถ้าไม่ได้ตรวจว่าครบจริง")
const HISTORY_ROW_CAP = 20000;

// โดเมนจริงของเว็บ (ตรงกับ ALLOWED_ORIGINS ใน game-content/index.ts)
const ALLOWED_ORIGINS = [
  'https://mrtaihualin.com',
  'https://www.mrtaihualin.com',
  'https://mrtaihualin.github.io',
];

function corsHeaders(origin) {
  const allowOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Vary': 'Origin',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
}
function json(body, status, origin, extraHeaders) {
  return new Response(JSON.stringify(body, null, 2), {
    status: status || 200,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(origin), ...(extraHeaders || {}) },
  });
}

// แปล event_type ของ account_audit_log เป็นข้อความอ่านง่าย (ไม่ส่งคีย์ดิบ event_type ออกไปตรงๆ
// เผื่ออนาคตมีค่าที่ยังไม่รู้จัก — fallback เป็นข้อความทั่วไปที่ยังปลอดภัย ไม่ใช่ throw error กลางทาง)
const AUDIT_EVENT_TH = {
  link: 'เชื่อมช่องทางล็อกอินใหม่เข้าบัญชี',
  unlink: 'ถอดช่องทางล็อกอินออกจากบัญชี',
  email_change: 'เปลี่ยนอีเมลบัญชี',
  password_reset: 'รีเซ็ตรหัสผ่าน',
  account_merge: 'รวมบัญชีเข้าด้วยกัน',
  premium_transfer: 'โอนสิทธิ์สมาชิกพรีเมียม',
  admin_correction: 'ครูแก้ไขข้อมูลบัญชีให้',
  account_deletion: 'ลบบัญชี',
};

serve(async (req) => {
  const origin = req.headers.get('Origin') || '';
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(origin) });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed', message: 'ใช้ POST เท่านั้น' }, 405, origin);

  try {
    // ── อ่าน body แบบไม่ให้พังถ้า client ไม่ส่ง body มาเลย (ไม่บังคับต้องมี) ──
    let body = {};
    try { body = await req.json(); } catch (_e) { body = {}; }

    // 🔒 กฎเหล็ก: ห้ามเชื่อ user_id ที่ client ส่งมาทางไหนก็ตาม — เพิกเฉยเสมอ แค่เตือนไว้ในล็อก
    if (body && body.user_id) {
      console.warn('[account-export] client ส่ง user_id มาใน body (' + String(body.user_id) + ') — เพิกเฉยเสมอ ใช้แค่ user id จาก JWT ที่ยืนยันแล้วเท่านั้น');
    }

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY');
    const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    // ── ยืนยันตัวตนจาก JWT จริงฝั่งเซิร์ฟเวอร์เท่านั้น — client แบบนี้แนบ Authorization ของผู้เรียก
    // เข้าไปตรงๆ ทุก query ที่ยิงผ่าน client ตัวนี้จะถูก RLS กรองเป็น auth.uid()=user_id อัตโนมัติ ──
    const authHeader = req.headers.get('Authorization') || '';
    const jwt = authHeader.replace(/^Bearer\s+/i, '');
    if (!jwt) return json({ error: 'missing_auth_token', message: '請先登入才能匯出資料' }, 401, origin);

    const userClient = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } } });
    const { data: userData, error: userErr } = await userClient.auth.getUser(jwt);
    if (userErr || !userData?.user) return json({ error: 'invalid_session', message: '請重新登入' }, 401, origin);
    const user = userData.user;
    const callerUid = user.id; // ← ตัวแปรเดียวที่ใช้กำหนดว่า "ข้อมูลของใคร" ทั้งไฟล์นี้ ไม่รับค่าจากที่อื่น

    // ── rate limit เกราะเสริม กันสคริปต์ยิงรัว/ดูดข้อมูลซ้ำๆ (fail-open เหมือน game-reward/tone-round) ──
    //   export หนักกว่า action ปกติมาก (ดึงหลายตารางพร้อมกัน) จำกัดถี่กว่า: 5 ครั้ง/5 นาที/คน ก็เกินพอ
    //   ต่อการใช้งานจริง (ผู้เล่นคนหนึ่งไม่มีเหตุผลต้อง export รัวๆ)
    const admin = createClient(SUPABASE_URL, SERVICE_KEY); // service_role — ใช้เฉพาะจุดที่ RLS ไม่มี policy ให้อ่านเอง (ดูคอมเมนต์หัวไฟล์) + ใช้เช็ค rate limit
    const { data: rlOk, error: rlErr } = await admin.rpc('rl_check', {
      p_user: callerUid, p_fn: 'account-export', p_limit: 5, p_window: 300,
    });
    if (!rlErr && rlOk === false) return json({ error: 'rate_limited', message: '請稍後再試' }, 429, origin);

    // ════════════════════════════════════════════════════════
    // ดึงข้อมูลทุกตาราง — ยิงพร้อมกันด้วย Promise.all เพื่อความเร็ว แต่เช็ค error ทีละตัวแยกกัน
    // (ไม่ยอมให้ตัวไหนพังแล้วเนียนส่งข้อมูลที่เหลือออกไปเหมือนไม่มีอะไรเกิดขึ้น — ต้อง throw ทันที)
    // ════════════════════════════════════════════════════════

    const [
      profileRes, gameAccountRes, rewardPointsRes, starLedgerRes,
      toneProgressRes, toneSessionsRes, toneSrsRes, readingSessionsRes, rewardEventsRes,
      lineIdentityRes, auditLogRes,
    ] = await Promise.all([
      // ── ชั้นที่ 1: RLS-scoped client (ผูก Authorization ของผู้เรียก) — Postgres กรอง auth.uid()=user_id ให้เอง ──
      userClient.from('profiles').select('nickname,avatar,badge_id,updated_at').eq('user_id', callerUid).maybeSingle(),
      userClient.from('game_accounts').select('stars,streak,last_play,hard_words_by_level,updated_at').eq('user_id', callerUid).maybeSingle(),
      userClient.from('game_reward_points').select('points,lifetime_points,updated_at').eq('user_id', callerUid).maybeSingle(),
      userClient.from('star_ledger').select('word,level,stars,reason,game,created_at').eq('user_id', callerUid).order('created_at', { ascending: false }).limit(HISTORY_ROW_CAP),
      userClient.from('tone_progress').select('data,updated_at').eq('user_id', callerUid).maybeSingle(),
      userClient.from('tone_sessions').select('created_at,mode,score,total,wrong_words').eq('user_id', callerUid).order('created_at', { ascending: false }).limit(HISTORY_ROW_CAP),
      userClient.from('tone_srs_state').select('level,word,stage,due_date,ever_failed,mastered,game,updated_at').eq('user_id', callerUid).order('updated_at', { ascending: false }).limit(HISTORY_ROW_CAP),
      userClient.from('reading_sessions').select('score,games,game,wrong_items,created_at').eq('user_id', callerUid).order('created_at', { ascending: false }).limit(HISTORY_ROW_CAP),
      userClient.from('game_reward_events').select('game,type,content,status,points_awarded,admin_note,created_at,reviewed_at').eq('user_id', callerUid).order('created_at', { ascending: false }).limit(HISTORY_ROW_CAP),

      // ── ชั้นที่ 2: service_role (ตารางไม่มี SELECT policy เลย) — ต้องแปะ .eq('user_id', callerUid)
      // เองด้วยมือทุกครั้ง callerUid มาจาก auth.getUser() ด้านบนเท่านั้น ไม่ใช่จาก body/query string ──
      admin.from('line_identities').select('line_user_id,created_at').eq('user_id', callerUid),
      admin.from('account_audit_log').select('event_type,provider,created_at').eq('user_id', callerUid).order('created_at', { ascending: false }).limit(HISTORY_ROW_CAP),
    ]);

    // ── เช็ค error ทุกตัวแยกกัน พังจุดไหนก็ throw ทันที ห้ามส่งข้อมูลบางส่วนออกไปเงียบๆ ──
    for (const [label, res] of [
      ['profiles', profileRes], ['game_accounts', gameAccountRes], ['game_reward_points', rewardPointsRes],
      ['star_ledger', starLedgerRes], ['tone_progress', toneProgressRes], ['tone_sessions', toneSessionsRes],
      ['tone_srs_state', toneSrsRes], ['reading_sessions', readingSessionsRes], ['game_reward_events', rewardEventsRes],
      ['line_identities', lineIdentityRes], ['account_audit_log', auditLogRes],
    ]) {
      if (res.error) {
        // 🆕 2026-08-08: แปะ .code/.label ไว้บน Error object เพื่อให้ catch ด้านล่างแยก "ดึงข้อมูลพลาด"
        // ออกจาก error ที่ไม่คาดคิดอื่นๆ ได้ แล้วตอบ error(code)+message(ข้อความคนอ่านได้) แยกกันชัดเจน
        // แทนที่จะโยน raw message (มีชื่อ table/column ดิบจาก Postgres ปนอยู่) ให้ผู้ใช้เห็นตรงๆ
        const fetchErr = new Error('ดึงข้อมูล ' + label + ' พลาด: ' + res.error.message);
        fetchErr.code = 'data_fetch_failed';
        fetchErr.label = label;
        throw fetchErr;
      }
    }

    // ── ข้อมูลบัญชีล็อกอิน (email/created_at/รายชื่อ provider) มาจาก auth.getUser() ของผู้เรียกเองล้วนๆ
    // ด้านบน (ไม่ได้เรียก admin API เพิ่ม) — ไม่มีทางหลุดไปเป็นของคนอื่นเพราะเป็น user object ของ token
    // ที่ตรวจแล้วว่าเป็นของผู้เรียกจริง ตัด field ที่ไม่ควรให้ (ไม่มี password ในระบบนี้อยู่แล้ว, ไม่มี token) ──
    const providers = (user.identities || []).map((i) => ({ provider: i.provider, linked_at: i.created_at }));

    // ── แปล audit log ดิบ → สรุปภาษาคน (ไม่ส่ง before_state/after_state/actor_id ดิบออกไป ตามที่ Lin
    // สั่งว่า "ประวัติดิบไม่ให้ แต่สรุปภาษาคนได้") ── event_type ที่ไม่รู้จัก (ในอนาคต) ใช้ fallback ข้อความทั่วไป
    const accountHistory = (auditLogRes.data || []).map((r) => ({
      when: r.created_at,
      what: AUDIT_EVENT_TH[r.event_type] || ('เหตุการณ์บัญชี: ' + r.event_type),
      provider: r.provider || null,
    }));

    // ── สรุปตัวเลขคร่าวๆ ให้อ่านง่ายบนหน้าแรกของไฟล์ ──
    const summary = {
      total_stars_now: gameAccountRes.data ? gameAccountRes.data.stars : 0,
      total_reward_points: rewardPointsRes.data ? rewardPointsRes.data.lifetime_points : 0,
      total_tone_sessions: toneSessionsRes.data.length,
      total_reading_sessions: readingSessionsRes.data.length,
      total_star_ledger_entries: starLedgerRes.data.length,
      total_words_in_srs: toneSrsRes.data.length,
      linked_login_methods: providers.length + lineIdentityRes.data.length,
    };

    // ── ธงเตือน "อาจโดนตัดที่เพดาน" — ไม่ปล่อยให้ผู้ใช้เข้าใจผิดว่าได้ประวัติครบ 100% เงียบๆ ──
    const capped = {
      star_ledger: starLedgerRes.data.length >= HISTORY_ROW_CAP,
      tone_sessions: toneSessionsRes.data.length >= HISTORY_ROW_CAP,
      tone_srs_state: toneSrsRes.data.length >= HISTORY_ROW_CAP,
      reading_sessions: readingSessionsRes.data.length >= HISTORY_ROW_CAP,
      game_reward_events: rewardEventsRes.data.length >= HISTORY_ROW_CAP,
      account_history: accountHistory.length >= HISTORY_ROW_CAP,
    };
    const anyCapped = Object.values(capped).some(Boolean);
    if (anyCapped) {
      console.warn('[account-export] user ' + callerUid + ' มีประวัติเกิน ' + HISTORY_ROW_CAP + ' แถวในบางตาราง — ตัดที่เพดาน ต้องบอกผู้ใช้ตรงๆ (ดู field capped ในผลลัพธ์)');
    }

    const exportPayload = {
      generated_at: new Date().toISOString(),
      account: {
        email: user.email || null,
        created_at: user.created_at || null,
        linked_providers: providers, // ล็อกอินผ่าน Google/Facebook ฯลฯ (native Supabase identities)
        linked_line: lineIdentityRes.data, // เชื่อม LINE (ไม่มี token ใดๆ ปนมา — คอลัมน์เดียวคือ line_user_id)
      },
      profile: profileRes.data || null,
      game_progress: {
        game_accounts: gameAccountRes.data || null,
        game_reward_points: rewardPointsRes.data || null,
        tone_progress: toneProgressRes.data || null,
      },
      history: {
        star_ledger: starLedgerRes.data,
        tone_sessions: toneSessionsRes.data,
        tone_srs_state: toneSrsRes.data,
        reading_sessions: readingSessionsRes.data,
        game_reward_events: rewardEventsRes.data,
        account_changes: accountHistory, // สรุปภาษาคนจาก account_audit_log — ไม่ใช่แถวดิบ
      },
      summary,
      capped, // true ที่ไหน = ประวัติกลุ่มนั้นถูกตัดที่เพดาน HISTORY_ROW_CAP ไม่ใช่ทั้งหมด
    };

    const filename = 'mrtaihualin-export-' + new Date().toISOString().slice(0, 10) + '.json';
    return json(exportPayload, 200, origin, {
      'Content-Disposition': 'attachment; filename="' + filename + '"',
    });
  } catch (e) {
    // เกิด error ระหว่างดึงข้อมูล/ประมวลผล — ตอบ 500 ชัดเจน ไม่ส่งข้อมูลบางส่วนออกไปเงียบๆ (RELIABILITY FIRST)
    // 🆕 2026-08-08: แยก error (code คงที่ ไว้ log/debug) ออกจาก message (ข้อความคนอ่านได้) — เดิมไฟล์นี้
    // ส่ง raw exception message (มีชื่อ table/column ดิบจาก Postgres ปนมาได้) ตรงๆ ใน field "error" เดียว
    if (e && e.code === 'data_fetch_failed') {
      return json({
        error: 'data_fetch_failed',
        message: 'ดึงข้อมูลส่วน "' + e.label + '" ไม่สำเร็จ — ยังไม่ได้สร้างไฟล์ข้อมูลให้ กรุณาลองใหม่อีกครั้ง',
        detail: String(e.message || e),
      }, 500, origin);
    }
    return json({
      error: 'unexpected_error',
      message: 'เกิดข้อผิดพลาดที่ไม่คาดคิดระหว่างสร้างไฟล์ข้อมูล กรุณาลองใหม่อีกครั้ง ถ้ายังไม่หายกรุณาแจ้งครู',
      detail: String((e && e.message) || e),
    }, 500, origin);
  }
});
