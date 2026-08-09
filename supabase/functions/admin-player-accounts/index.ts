// ════════════════════════════════════════════════════════════════════════════
// Supabase Edge Function: admin-player-accounts
// ────────────────────────────────────────────────────────────────────────────
// สถานะไฟล์นี้: "ร่างเท่านั้น" (DRAFT — ยังไม่ deploy) — ห้าม deploy เองก่อน Lin ตรวจ + อนุมัติ
// (ตามกฎเว็บ CLAUDE.md ข้อ "เว็บต้องผ่าน Lin ก่อนเสมอ")
//
// รหัสงาน: P6-09~12 ก้อน 4 — Admin tool ขั้นต่ำสำหรับดู/แก้บัญชีผู้เล่น
// อ้างอิง: Bussiness Idea/ระบบเว็บไซต์/64_ผลลัพธ์_P6-09to12_ก้อน3_ตรวจจับบัญชีซ้ำ.md (query A/B/C ต้นแบบ
// ที่ย้ายมา implement เป็น action ในฟังก์ชันนี้) และ 49_P6-09to12_ตรวจของจริง_เทียบสเปกบัญชีผู้เล่น.md
//
// หน้าที่: จุดเดียวที่หน้า admin-player-accounts.html (คนละไฟล์ในโฟลเดอร์ root ของเว็บ) เรียกใช้
//   เพื่อค้นหา/ดู/บันทึกหมายเหตุของบัญชีผู้เล่น — ทุกอย่างอ่าน/เขียนผ่าน service_role เท่านั้น (เหมือน
//   game-reward/index.ts) เพราะตาราง auth.identities ไม่เปิดผ่าน PostgREST เลย และ line_identities /
//   account_audit_log เปิด RLS แบบ fail-closed ไม่มี policy ให้ client อ่านตรงได้เลย (ดู
//   supabase/sql/2026-07-26_line_identities.sql, supabase/sql/2026-08-08_account_audit_log.sql)
//
// ── ด่านสิทธิ์เข้าถึง (เฉพาะ Lin เท่านั้น) ──────────────────────────────────────────
//   ใช้แพทเทิร์นเดียวกับ admin-game-reports.html (ตรวจโค้ดจริงแล้ว) ไม่ใช่ auth+เทียบ user_id ของ Lin
//   ตามที่คำสั่งงานคาดไว้ตอนแรก — admin-game-reports.html จริงๆ ใช้ "shared secret header" (x-admin-key
//   เทียบกับ secret GAME_REWARD_ADMIN_KEY) ไม่ใช่ JWT+email เลย เพื่อให้ตรงกับ "ทำแบบเดียวกัน" (ก็อป
//   พฤติกรรมจริงของหน้าเดิม ไม่ใช่พฤติกรรมที่คาดผิดไว้ในคำสั่งงาน) ทุก action ในไฟล์นี้เช็ค
//   header x-admin-key เทียบกับ secret ใหม่แยกต่างหาก ADMIN_PLAYER_ACCOUNTS_KEY (ไม่ใช้ร่วมกับ
//   GAME_REWARD_ADMIN_KEY — แยก secret ต่อฟังก์ชันเพื่อ least privilege: ถ้า key ของหน้ารีวิวเกมหลุด
//   จะไม่กระทบสิทธิ์เข้าถึงข้อมูลบัญชีผู้เล่นที่ละเอียดอ่อนกว่ามาก)
//
// action รองรับ 4 แบบ (ส่งมาใน body.action) — ทุก action ต้องมี x-admin-key ถูกต้องก่อนเสมอ:
//   1) "search_accounts"          — ค้นหาบัญชีด้วย email / nickname / line_user_id / user_id
//   2) "get_account_detail"       — ดู login methods + profile + game_accounts + audit log ล่าสุดของบัญชีเดียว
//   3) "list_duplicate_candidates"— รัน query A (อีเมลจริงซ้ำ) + query C (fingerprint ซ้ำ ครอบคลุม LINE)
//                                    สดๆ ตอนเรียก (ไม่มีตาราง cache — ดูเหตุผลในรายงาน 64 ตัวเลือก 1)
//   4) "add_admin_note"           — บันทึกหมายเหตุ/ธงติดตามบัญชี เข้า account_audit_log ผ่าน
//                                    log_account_audit() ที่มีอยู่แล้ว (event_type='admin_correction')
//
// ⚠️ งานนี้เป็น "ขั้นต่ำ" ตามที่สั่ง — ยังไม่มีปุ่ม "merge บัญชี" จริง (P2 เดิม ยังไม่ได้ implement ตาม
//   สเปกข้อ 13 ที่อนุญาตให้เวอร์ชันแรกทำแค่ตรวจจับ+แจ้งเตือน) และยังไม่มีตาราง
//   possible_duplicate_accounts (ตัวเลือก 2 ในรายงาน 64) — list_duplicate_candidates คำนวณสดทุกครั้ง
//   ที่กด ไม่มี "dismiss" เก็บสถานะข้ามครั้ง เพราะยังไม่มีตารางเก็บผล (ต้องให้ Lin เลือกตัวเลือกก่อน
//   ตามที่ 64_...md เสนอไว้ ถ้าจะทำตัวเลือก 2/3 ต่อ)
//
// วิธี deploy (สำหรับ Lin ทำเองภายหลัง — AI ไม่มีสิทธิ์และไม่รันเอง):
//   1. ไม่ต้องรัน SQL ใหม่เลย — ใช้ตาราง/ฟังก์ชันที่มีอยู่แล้วทั้งหมด (line_identities, account_audit_log,
//      log_account_audit, profiles, game_accounts, login_events) ไม่มีไฟล์ SQL แนบมาด้วยรอบนี้
//   2. ตั้ง secret กุญแจแอดมินใหม่ (ห้ามใช้ค่าเดียวกับ GAME_REWARD_ADMIN_KEY):
//      supabase secrets set ADMIN_PLAYER_ACCOUNTS_KEY=xxxxxxxx   (ตั้งเองเป็นค่าอะไรก็ได้ที่จำง่ายแต่คนอื่นเดาไม่ได้)
//   3. supabase functions deploy admin-player-accounts --no-verify-jwt
//      🆕 แก้ 2026-08-09 (พิสูจน์จริงจาก Invocations log): ต้องใส่ --no-verify-jwt เสมอ — เข้าใจผิดตอนแรกว่า
//      "ไม่ต้องใส่เพราะเรียกจาก fetch() ธรรมดา ไม่ใช่ LINE" แต่ Supabase เช็ค Verify JWT จากทุก request
//      ไม่ว่าที่มาจะเป็นอะไร ถ้าไม่มี Authorization header ที่ Supabase ยอมรับ (JWT/anon key) จะโดน 401
//      ตั้งแต่ประตูแรกก่อนถึงโค้ดเราเลย — หน้านี้ยิง fetch() ธรรมดาไม่แนบ header นั้น ต้องปิด Verify JWT
//      แล้วให้ x-admin-key เป็นด่านสิทธิ์เดียวแทน (เหมือน line-webhook ที่เจอปัญหาเดียวกันมาก่อน)
//   4. เปิด admin-player-accounts.html ในเบราว์เซอร์ กรอก Edge Function URL + admin key เหมือนหน้า
//      admin-game-reports.html เดิม
// ════════════════════════════════════════════════════════════════════════════

// deno-lint-ignore-file
// @ts-nocheck  (Supabase Edge Function รันบน Deno ไม่ใช่ Node — IDE อาจฟ้อง type error ปกติ ไม่กระทบตอน deploy จริง)

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// รูปแบบอีเมลปลอมที่ line-login/index.ts สร้างให้ผู้ใช้ LINE คนใหม่เสมอ — ก็อปมาจาก account-unlink/index.ts
// ตรงๆ (ไม่คิดใหม่ กันพลาดไม่ตรงกัน) ดูคำอธิบายเต็มในไฟล์นั้น
const SYNTHETIC_LINE_EMAIL_RE = /^line-.+@users\.line\.invalid$/i;
function isSyntheticLineEmail(email) {
  return !!email && SYNTHETIC_LINE_EMAIL_RE.test(String(email).trim());
}

// อีเมลของ Lin เอง — ต้องกันไม่ให้ถูกนับเป็น "บัญชีผู้เล่นซ้ำ" หรือโผล่ในผลค้นหาบัญชีผู้เล่นทั่วไป
// (ตามกฎกลาง Projects/CLAUDE.md: "mr.taihualin@gmail.com คือ Lin ห้ามนับเป็นลูกค้า ลีด หรือนักเรียน")
const OWNER_EMAIL = 'mr.taihualin@gmail.com';

const MAX_USERS_SCAN = 2000; // เพดานกันดึงผู้ใช้ทั้งหมดมากเกินไปตอนหา duplicate (ระบบนี้ยังเป็นสเกลเล็ก ปรับเพิ่มได้ทีหลังถ้าจำนวนผู้เล่นเกินนี้)
const USERS_PER_PAGE = 200;

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': 'https://mrtaihualin.com',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-admin-key',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
}
function json(body, status) {
  return new Response(JSON.stringify(body), { status: status || 200, headers: { 'Content-Type': 'application/json', ...corsHeaders() } });
}

function checkAdminKey(req) {
  const adminKey = req.headers.get('x-admin-key');
  const expected = Deno.env.get('ADMIN_PLAYER_ACCOUNTS_KEY');
  return !!expected && adminKey === expected;
}

// ── รวม native identities + line_identities ให้เป็นรายการ "ช่องทางล็อกอินจริง" ของ 1 บัญชี ──────
// ตรรกะเดียวกับ account-unlink/index.ts บรรทัด ~294-309 (ก็อปมาใช้ซ้ำ ไม่คิดใหม่)
async function buildLoginMethods(admin, authUser, lineRows) {
  const nativeIdentities = (authUser && authUser.identities) || [];
  const lineLinked = (lineRows || []).length > 0;
  const annotatedNative = nativeIdentities.map((idn) => {
    const idnEmail = (idn.identity_data && idn.identity_data.email) || (idn.provider === 'email' ? authUser.email : null);
    const synthetic = idn.provider === 'email' && isSyntheticLineEmail(idnEmail);
    return { provider: idn.provider, email: idnEmail, synthetic_line_email: synthetic, created_at: idn.created_at || null };
  });
  const realNative = annotatedNative.filter((idn) => !idn.synthetic_line_email);
  const methods = realNative.map((idn) => ({ provider: idn.provider, detail: idn.email || null }));
  if (lineLinked) {
    methods.push({ provider: 'line', detail: 'line_user_id: ' + (lineRows.map((r) => r.line_user_id).join(', ')) });
  }
  return { methods, real_method_count: methods.length, has_synthetic_line_email: annotatedNative.some((i) => i.synthetic_line_email) };
}

// ── ดึงข้อมูลสรุปของ 1 user_id (login methods + profile + game_accounts) ──────────────────────
async function loadAccountSummary(admin, userId) {
  const { data: authData, error: authErr } = await admin.auth.admin.getUserById(userId);
  if (authErr) {
    // 🆕 2026-08-09: เดิมเงียบไม่ log เลย ทำให้หาสาเหตุ "ค้นหาไม่เจอ" ไม่ได้ (ขัดกฎ RELIABILITY FIRST
    // ห้ามความล้มเหลวเงียบ) — เพิ่ม log ถาวรไว้ ไม่ใช่แค่ debug ชั่วคราว
    console.error('[admin-player-accounts] getUserById failed', { userId, error: authErr.message || String(authErr) });
    return null;
  }
  if (!authData || !authData.user) {
    console.error('[admin-player-accounts] getUserById returned no user', { userId });
    return null;
  }
  const authUser = authData.user;

  const { data: lineRows } = await admin.from('line_identities').select('line_user_id').eq('user_id', userId);
  const { data: profile } = await admin.from('profiles').select('user_id, nickname, avatar, badge_id').eq('user_id', userId).maybeSingle();
  const { data: gameAccount } = await admin.from('game_accounts').select('user_id, stars, streak, last_play').eq('user_id', userId).maybeSingle();
  const loginMethods = await buildLoginMethods(admin, authUser, lineRows || []);

  return {
    user_id: userId,
    email: authUser.email || null,
    email_is_synthetic_line: isSyntheticLineEmail(authUser.email),
    created_at: authUser.created_at,
    last_sign_in_at: authUser.last_sign_in_at || null,
    nickname: profile ? profile.nickname : null,
    avatar: profile ? profile.avatar : null,
    badge_id: profile ? profile.badge_id : null,
    stars: gameAccount ? gameAccount.stars : 0,
    streak: gameAccount ? gameAccount.streak : 0,
    last_play: gameAccount ? gameAccount.last_play : null,
    login_methods: loginMethods.methods,
    real_method_count: loginMethods.real_method_count,
    has_synthetic_line_email: loginMethods.has_synthetic_line_email,
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders() });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed', message: 'ใช้ POST เท่านั้น' }, 405);

  let body;
  try {
    body = await req.json();
  } catch (e) {
    return json({ error: 'invalid_json_body', message: 'รูปแบบข้อมูลที่ส่งมาไม่ถูกต้อง' }, 400);
  }

  // ── ด่านสิทธิ์เข้าถึง เฉพาะ Lin เท่านั้น — ทุก action ต้องผ่านก่อนเสมอ ─────────────────────
  if (!checkAdminKey(req)) return json({ error: 'unauthorized' }, 401);

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
  const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const admin = createClient(SUPABASE_URL, SERVICE_KEY); // service_role — bypass RLS ทุกจุด (ตั้งใจ เพราะทุกตารางที่ใช้เป็น fail-closed ไม่มี policy ให้ client อ่านเอง)

  const action = body && body.action;

  try {
    // ══════════════════════════════════════════════════════════════════════
    // action: search_accounts
    // ══════════════════════════════════════════════════════════════════════
    if (action === 'search_accounts') {
      const qType = body.query_type; // 'email' | 'nickname' | 'line_user_id' | 'user_id'
      const q = String(body.query || '').trim();
      if (!q) return json({ error: 'missing_query', message: 'กรอกคำค้นก่อน' }, 400);

      let userIds = [];

      if (qType === 'user_id') {
        userIds = [q];
      } else if (qType === 'line_user_id') {
        const { data, error } = await admin.from('line_identities').select('user_id').ilike('line_user_id', `%${q}%`).limit(50);
        if (error) throw error;
        userIds = (data || []).map((r) => r.user_id);
      } else if (qType === 'nickname') {
        const { data, error } = await admin.from('profiles').select('user_id').ilike('nickname', `%${q}%`).limit(50);
        if (error) throw error;
        userIds = (data || []).map((r) => r.user_id);
      } else if (qType === 'email') {
        // auth.users ไม่เปิดผ่าน PostgREST — ต้องไล่หน้า listUsers() แล้วกรองในโค้ด (สเกลระบบนี้เล็ก รับได้)
        let page = 1;
        const lowerQ = q.toLowerCase();
        while (userIds.length < 50 && (page - 1) * USERS_PER_PAGE < MAX_USERS_SCAN) {
          const { data, error } = await admin.auth.admin.listUsers({ page, perPage: USERS_PER_PAGE });
          if (error) throw error;
          const rows = (data && data.users) || [];
          if (!rows.length) break;
          rows.forEach((u) => {
            if (u.email && u.email.toLowerCase().includes(lowerQ)) userIds.push(u.id);
          });
          if (rows.length < USERS_PER_PAGE) break;
          page += 1;
        }
      } else {
        return json({ error: 'invalid_query_type', message: 'query_type ต้องเป็น email/nickname/line_user_id/user_id' }, 400);
      }

      userIds = Array.from(new Set(userIds)).slice(0, 30);
      console.log('[admin-player-accounts] search_accounts', { qType, q, matched_user_ids_before_summary: userIds.length });
      const results = [];
      for (const uid of userIds) {
        const summary = await loadAccountSummary(admin, uid);
        if (summary && summary.email !== OWNER_EMAIL) results.push(summary);
      }
      return json({ ok: true, results, truncated: userIds.length >= 30 });
    }

    // ══════════════════════════════════════════════════════════════════════
    // action: get_account_detail — เพิ่ม audit log ล่าสุด 20 รายการ
    // ══════════════════════════════════════════════════════════════════════
    if (action === 'get_account_detail') {
      const userId = body.user_id;
      if (!userId) return json({ error: 'missing_user_id' }, 400);
      const summary = await loadAccountSummary(admin, userId);
      if (!summary) return json({ error: 'not_found', message: 'ไม่พบบัญชีนี้' }, 404);

      const { data: auditRows, error: auditErr } = await admin
        .from('account_audit_log')
        .select('id, event_type, provider, before_state, after_state, actor_type, actor_id, created_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(20);
      if (auditErr) console.error('[admin-player-accounts] audit log fetch failed', auditErr);

      return json({ ok: true, account: summary, audit_log: auditRows || [] });
    }

    // ══════════════════════════════════════════════════════════════════════
    // action: list_duplicate_candidates — Query A (อีเมลจริงซ้ำ) + Query C (fingerprint ซ้ำ)
    // คำนวณสดทุกครั้ง (ไม่มีตาราง cache ในเวอร์ชันขั้นต่ำนี้) — ดูรายละเอียด query ต้นแบบ SQL ใน
    // Bussiness Idea/ระบบเว็บไซต์/64_ผลลัพธ์_P6-09to12_ก้อน3_ตรวจจับบัญชีซ้ำ.md
    // ══════════════════════════════════════════════════════════════════════
    if (action === 'list_duplicate_candidates') {
      // ── ดึงผู้ใช้ทั้งหมด (จำกัดเพดาน MAX_USERS_SCAN) พร้อม native identities ──────────────
      const allUsers = [];
      let page = 1;
      while (allUsers.length < MAX_USERS_SCAN) {
        const { data, error } = await admin.auth.admin.listUsers({ page, perPage: USERS_PER_PAGE });
        if (error) throw error;
        const rows = (data && data.users) || [];
        if (!rows.length) break;
        allUsers.push(...rows);
        if (rows.length < USERS_PER_PAGE) break;
        page += 1;
      }

      const { data: allLineRows, error: lineErr } = await admin.from('line_identities').select('user_id, line_user_id');
      if (lineErr) throw lineErr;
      const lineUserIdSet = new Set((allLineRows || []).map((r) => r.user_id));

      // ── Query A: อีเมลจริง (ไม่ใช่ .invalid ของ LINE, ไม่ใช่ของ Lin) ผูกกับ user_id มากกว่า 1 ตัว ──
      const emailGroups = new Map();
      allUsers.forEach((u) => {
        const email = (u.email || '').toLowerCase().trim();
        if (!email) return;
        if (isSyntheticLineEmail(email)) return;
        if (email === OWNER_EMAIL) return;
        if (!emailGroups.has(email)) emailGroups.set(email, []);
        emailGroups.get(email).push(u.id);
      });
      const emailDuplicates = [];
      emailGroups.forEach((userIds, email) => {
        const unique = Array.from(new Set(userIds));
        if (unique.length > 1) emailDuplicates.push({ match_reason: 'same_real_email', email, user_ids: unique });
      });

      // ── Query C: fingerprint จาก login_events ที่ผูกกับ user_id มากกว่า 1 ตัว (ครอบคลุม LINE) ──
      const { data: loginRows, error: loginErr } = await admin
        .from('login_events')
        .select('fingerprint, user_id, email, created_at')
        .not('fingerprint', 'is', null)
        .neq('fingerprint', '');
      if (loginErr) console.error('[admin-player-accounts] login_events fetch failed', loginErr);

      const fpGroups = new Map();
      (loginRows || []).forEach((r) => {
        if (r.email === OWNER_EMAIL) return;
        if (!fpGroups.has(r.fingerprint)) fpGroups.set(r.fingerprint, new Set());
        fpGroups.get(r.fingerprint).add(r.user_id);
      });
      const fingerprintDuplicates = [];
      fpGroups.forEach((userIdSet, fingerprint) => {
        if (userIdSet.size > 1) {
          const userIds = Array.from(userIdSet);
          fingerprintDuplicates.push({
            match_reason: 'same_device_fingerprint',
            fingerprint,
            user_ids: userIds,
            includes_line_account: userIds.some((uid) => lineUserIdSet.has(uid)),
          });
        }
      });

      return json({
        ok: true,
        email_duplicates: emailDuplicates,
        fingerprint_duplicates: fingerprintDuplicates,
        scanned_users: allUsers.length,
        note: 'จำกัดสแกนไม่เกิน ' + MAX_USERS_SCAN + ' บัญชี — คำนวณสดทุกครั้งที่กด ไม่ได้เก็บผลไว้ (ยังไม่มีตาราง cache)',
      });
    }

    // ══════════════════════════════════════════════════════════════════════
    // action: add_admin_note — บันทึกหมายเหตุ/ธงติดตามบัญชี เข้า account_audit_log
    // ══════════════════════════════════════════════════════════════════════
    if (action === 'add_admin_note') {
      const userId = body.user_id;
      const note = String(body.note || '').trim();
      if (!userId) return json({ error: 'missing_user_id' }, 400);
      if (!note) return json({ error: 'missing_note', message: 'กรอกหมายเหตุก่อน' }, 400);
      if (note.length > 2000) return json({ error: 'note_too_long', message: 'หมายเหตุยาวเกินไป (จำกัด 2000 ตัวอักษร)' }, 400);

      // ยืนยันว่าบัญชีนี้มีอยู่จริงก่อนเขียน log (กันพิมพ์ user_id ผิด)
      const { data: authData, error: authErr } = await admin.auth.admin.getUserById(userId);
      if (authErr || !authData || !authData.user) return json({ error: 'not_found', message: 'ไม่พบบัญชีนี้ ตรวจ user_id อีกครั้ง' }, 404);

      const { error: auditErr } = await admin.rpc('log_account_audit', {
        p_user_id: userId,
        p_event_type: 'admin_correction',
        p_before_state: null,
        p_after_state: { note, note_type: body.note_type || 'general' }, // note_type ตัวอย่าง: 'duplicate_flag' เมื่อมาจากหน้ารายการบัญชีซ้ำ
        p_actor_type: 'admin',
        p_actor_id: null, // Admin tool ยังไม่มีระบบ auth ผูก user_id ของ Lin เอง (ใช้ shared key แทน) — actor_id เว้นว่างตามที่ log_account_audit() อนุญาต
        p_provider: body.provider || null,
      });
      if (auditErr) {
        return json({ error: 'audit_log_failed', message: 'บันทึกหมายเหตุไม่สำเร็จ กรุณาลองใหม่', detail: auditErr.message }, 500);
      }

      return json({ ok: true, message: 'บันทึกหมายเหตุแล้ว' });
    }

    return json({ error: 'unknown_action' }, 400);
  } catch (e) {
    return json({ error: 'unexpected_error', message: 'เกิดข้อผิดพลาดที่ไม่คาดคิด', detail: String((e && e.message) || e) }, 500);
  }
});

// ════════════════════════════════════════════════════════════════════════════
// สิ่งที่ยังต้องให้ Lin ตัดสินใจ/ยืนยันก่อน deploy จริง (ยังไม่ได้ทำในไฟล์นี้ — ตั้งใจเว้นไว้)
// ════════════════════════════════════════════════════════════════════════════
// 1. ยังไม่เคยรันจริงกับฐานข้อมูล/โปรเจกต์ของ Lin เลย (ไม่มี connector เข้าถึง Supabase ในเซสชันนี้)
//    ควรทดสอบทุก action กับข้อมูลทดสอบก่อนใช้งานจริง (โดยเฉพาะ list_duplicate_candidates ที่ดึง
//    ผู้ใช้ทั้งหมดผ่าน listUsers() แบบ paginate — ควรจับเวลาจริงว่าเร็วพอไหมถ้าจำนวนผู้เล่นเพิ่มมาก)
// 2. p_actor_id ของ add_admin_note เว้นว่างเสมอ (null) เพราะ Admin tool นี้ยืนยันตัวตนด้วย shared
//    secret key ไม่ใช่ auth.uid() ของ Lin เอง — ถ้า Lin อยากให้ audit log ระบุ "ใครกด" ชัดเจนกว่านี้
//    (เผื่ออนาคตมีแอดมินมากกว่า 1 คน) ต้องเปลี่ยนด่านสิทธิ์เป็นแบบ JWT+เทียบ user_id แทน shared key
// 3. list_duplicate_candidates คำนวณสดทุกครั้ง ไม่มีปุ่ม "ไม่ใช่บัญชีซ้ำ" (dismiss) เพราะยังไม่มีตาราง
//    possible_duplicate_accounts (ตัวเลือก 2 ใน 64_...md) — ถ้า Lin อยากได้ปุ่มนี้ต้องรัน SQL ใหม่
//    เพิ่มตาราง + cron แยกอีกก้อนงาน
// 4. เพดาน MAX_USERS_SCAN = 2000 คนเป็นค่าประเมินเอง ปรับได้ที่ค่าคงที่ด้านบน
// ════════════════════════════════════════════════════════════════════════════
