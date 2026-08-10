// ════════════════════════════════════════════════════════════════════════════
// Supabase Edge Function: account-delete-cron
// ────────────────────────────────────────────────────────────────────────────
// สถานะไฟล์นี้: "ร่างเท่านั้น" (DRAFT — ยังไม่ deploy, ยังไม่ตั้ง pg_cron)
// ห้าม deploy เองก่อน Lin ตรวจ + อนุมัติ (ตามกฎเว็บ CLAUDE.md ข้อ "เว็บต้องผ่าน Lin ก่อนเสมอ")
//
// 🆕 สร้างใหม่ 2026-08-08 คู่กับการเปลี่ยน account-delete/index.ts เป็น flow cooldown 7 วัน
//
// หน้าที่: รันทุกวันผ่าน pg_cron (ดู supabase/sql/2026-08-08_account_deletion_cooldown.sql หัวข้อ [C])
//   หาแถวใน account_deletion_requests ที่ status='pending' และ scheduled_delete_at ผ่านไปแล้ว (ครบ
//   cooldown แล้ว ยังไม่ถูกยกเลิก) แล้ว "ลบถาวรจริง" ให้แต่ละแถว — ขั้นตอนการลบจริง (a)-(d) ย้ายมาจาก
//   account-delete/index.ts เวอร์ชันก่อนหน้า (ตอนที่ยังเป็น confirm=ลบทันที) คัดลอกตรรกะมาเกือบทั้งหมด
//   ไม่เปลี่ยนลำดับ/เหตุผล — เปลี่ยนแค่ "ตัวกระตุ้น" จากคำขอ HTTP ของผู้ใช้ เป็นแถวที่ครบกำหนดใน DB
//
// ⚠️ ทำไมโค้ดขั้นตอน (a)-(d) ถูกคัดลอกซ้ำจาก account-delete/index.ts แทนที่จะ import ใช้ร่วมกัน:
//   ทั้ง repo นี้ไม่มีธรรมเนียม share module ข้าม Edge Function เลยสักที่ (ทุกฟังก์ชัน self-contained
//   ในไฟล์เดียว — เช่น CORS header/decodeJwtPayloadUnsafe ถูกก็อปซ้ำในทุกไฟล์ account-* อยู่แล้ว) เหตุผล
//   จริงคือ Supabase Edge Function แต่ละตัว deploy แยกกันเป็น bundle อิสระ ใส่ shared import ข้าม
//   function ได้แต่ต้องจัดการ import path เป็นพิเศษ (_shared/ folder) ซึ่ง repo นี้ไม่เคยตั้งไว้ ไฟล์นี้
//   จึงตามธรรมเนียมเดิมของ repo คือคัดลอกโค้ดที่จำเป็นมาไว้ในตัวเอง — 🔴 ถ้าแก้ตรรกะขั้นตอน (a)-(d) ใน
//   อนาคต (เช่น เพิ่มตารางที่ต้องล้าง) **ต้องแก้ที่นี่ด้วยเสมอ ไม่มีที่ไหนแก้แล้วอีกไฟล์อัตโนมัติตาม** —
//   จุดนี้เหลือแค่ไฟล์เดียวที่ต้องแก้อยู่แล้ว (account-delete/index.ts เวอร์ชันใหม่ไม่มีขั้นตอนลบพวกนี้
//   เหลืออยู่เลย ย้ายมาที่นี่ทั้งหมด) จึงไม่ใช่ "ซ้ำ 2 จุดที่ต้องคอยแก้พร้อมกัน" เหมือนเคสอื่นในเว็บนี้
//   (เช่น confirm_reschedule_move/pick ที่เคยเป็นปัญหา) — แค่ "ย้ายที่" ไม่ใช่ "ก็อปแล้วเก็บทั้งคู่"
//
// ── claim-then-process กันรันซ้อน (เพิ่มใหม่ ของเดิมไม่มีเพราะเดิมทำงานทันทีตาม HTTP request เดียว) ──
//   cron ตัวนี้ประมวลผลได้หลายแถวต่อ 1 รอบ (ทุก user ที่ครบกำหนดพร้อมกัน) และมีโอกาสที่ 2 รอบ cron
//   ทับซ้อนกันได้ถ้ารอบก่อนหน้ายังไม่จบ (เช่น รอบนี้มีคนครบกำหนดเยอะ ประมวลผลนาน) — ใช้
//   `processing_started_at` claim ทีละแถวก่อนเริ่มลบ (แพทเทิร์นเดียวกับ classroom_requests ที่มีอยู่แล้ว
//   ในระบบห้องเรียน) ล็อกค้างเกิน 15 นาที = ถือว่าตายกลางทาง (เช่น cron timeout) แย่งคืนได้ — 15 นาที
//   เลือกเพราะขั้นตอน (a)-(d) ของ 1 user ไม่ควรใช้เวลาเกินไม่กี่วินาที ถ้าค้างนานขนาดนั้นแปลว่าตายจริง
//
// ── ทำไมต้อง "แคชอีเมลไว้ก่อนเริ่มลบ" (สำคัญ — ตอบคำสั่งข้อ 4 ของ Lin โดยตรง) ──────────────────
//   Lin สั่งไว้ว่า "แจ้งเมื่อบัญชีถูกลบถาวร ถ้าส่งก่อนข้อมูลติดต่อถูกลบได้อย่างปลอดภัย" — วิธีที่เลือก:
//   ดึง user.email จาก auth.admin.getUserById() "ก่อน" เริ่มขั้นตอนลบใดๆ เลย เก็บไว้ในตัวแปรในหน่วยความจำ
//   แล้วค่อยลงมือลบทั้งหมด (a)-(d) จบแล้วค่อยส่งอีเมลด้วยค่าที่แคชไว้ (ไม่ใช่ query DB ใหม่หลังลบ เพราะ
//   หลัง deleteUser() สำเร็จ auth.users ของ user นี้จะหายไปแล้ว query ใหม่จะไม่เจออะไรเลย) — เลือก "ส่ง
//   หลังลบสำเร็จ" ไม่ใช่ "ส่งก่อนลบ" เพราะเนื้อหาอีเมลบอกว่า "บัญชีถูกลบแล้ว" ต้องเป็นความจริงจริงๆ ตอนที่
//   ส่ง ไม่ใช่ส่งไปก่อนแล้วเผื่อว่าการลบจะพังทีหลัง (จะกลายเป็นโกหกผู้ใช้)
//
// วิธี deploy (สำหรับ Lin ทำเองภายหลัง — AI ไม่มีสิทธิ์และไม่รันเอง):
//   1. ต้องรัน `supabase/sql/2026-08-08_account_deletion_cooldown.sql` หัวข้อ [A][B] ก่อนเสมอ
//   2. supabase functions deploy account-delete-cron
//      ⚠️ ไม่ต้องใส่ --no-verify-jwt — เรียกจาก pg_cron ด้วย service_role key ผ่าน Vault (ผ่านเกตเวย์
//      verify_jwt ได้ปกติเพราะเป็น JWT ของโปรเจกต์นี้จริง) ต่างจาก line-webhook ที่ LINE ยิงมาโดยไม่มี
//      JWT เลย
//   3. รัน SQL หัวข้อ [C] ในไฟล์เดียวกัน (สร้าง Vault secret + wrapper function + ตั้ง cron.schedule) —
//      🔴 ต้อง deploy ฟังก์ชันนี้ให้เสร็จก่อนรัน [C] เสมอ (ไม่งั้น cron จะยิงไปเจอ 404 ทุกวัน)
//   4. ไม่ต้องตั้ง secret เพิ่มสำหรับฟังก์ชันนี้เอง (ใช้ SUPABASE_URL/SERVICE_ROLE_KEY/ANON_KEY อัตโนมัติ)
//      แต่การส่งอีเมล (เรียก send-transactional-email) ต้องให้ฟังก์ชันนั้นตั้ง secret ของมันเองด้วย
//      (EMAIL_PROVIDER_API_KEY) ไม่งั้นขั้นตอนลบจะสำเร็จปกติแต่ไม่มีอีเมลแจ้งไปถึงผู้ใช้
//   5. 🔴🔴 บังคับ (Mandatory Pre-Deploy Test — Lin สั่งไว้ชัดเจน 2026-08-08 ห้ามข้าม): ทำตามเช็กลิสต์
//      เต็มที่ `docs/ACCOUNT_DELETION_PRE_DEPLOY_CHECKLIST.md` ให้ครบทุกข้อก่อน — ใช้บัญชีทดสอบเท่านั้น
//      ห้ามใช้บัญชีผู้เล่นจริงเด็ดขาด (ขั้นตอนย่อ: request → ตรวจ pending UI → cancel → request ใหม่ →
//      แก้ scheduled_delete_at ของแถวทดสอบด้วยมือ → invoke cron ด้วยมือ → ตรวจ DB/Auth/audit log →
//      ตรวจว่าลบจริง → ตรวจอีเมลครบ 3 ฉบับ รวม failure/retry path)
// ════════════════════════════════════════════════════════════════════════════

// deno-lint-ignore-file
// @ts-nocheck  (Supabase Edge Function รันบน Deno ไม่ใช่ Node — IDE อาจฟ้อง type error ปกติ ไม่กระทบตอน deploy จริง)

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const STALE_LOCK_MINUTES = 15;
const MAX_ROWS_PER_RUN = 50; // กันรอบเดียวประมวลผลเยอะเกินจน timeout — ที่เหลือรอรอบถัดไป (รันทุกวันอยู่แล้ว)

// 🆕 2026-08-08 (รอบ 3 — ตามที่ Lin สั่ง): จำนวนครั้งสูงสุดที่ retry ส่งอีเมล "ลบสำเร็จ" ก่อนหยุด retry
// อัตโนมัติ (กันยิง provider ไม่หยุดถ้ามันพังถาวร เช่น secret หมดอายุ) — 5 ครั้ง = 5 วัน (cron รันวันละครั้ง)
// เกินนี้แล้วยัง fail อยู่ ต้องให้ Lin ตรวจมือ (ดู query [E6] ใน SQL ไฟล์คู่กัน) — "ไม่ลบข้อมูลอะไรเพิ่ม"
// แค่หยุดพยายามส่งอีเมลเฉยๆ บัญชีลบไปแล้วจริงตั้งแต่ครั้งแรกไม่เกี่ยวกัน
const MAX_EMAIL_RETRY_ATTEMPTS = 5;
const EMAIL_RETRY_BATCH_SIZE = 50;

const HARD_DELETE_TABLES = ['game_reward_points', 'game_reward_events', 'anon_game_events'];
const ANONYMIZE_TABLES = ['login_events', 'star_ledger'];

function json(body, status) {
  return new Response(JSON.stringify(body), { status: status || 200, headers: { 'Content-Type': 'application/json' } });
}

async function countRows(admin, table, userId) {
  const { count, error } = await admin.from(table).select('*', { count: 'exact', head: true }).eq('user_id', userId);
  if (error) return { count: null, error: error.message };
  return { count: count || 0, error: null };
}

async function sendDeletionEmail(SUPABASE_URL, SERVICE_KEY, template, to, data) {
  if (!to) {
    console.error('[account-delete-cron] ไม่มีอีเมลปลายทาง (แคชไว้ตอนเริ่ม แต่เป็น null) ข้ามการส่ง template=' + template);
    return { sent: false, reason: 'no_email_on_account' };
  }
  try {
    const res = await fetch(SUPABASE_URL + '/functions/v1/send-transactional-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + SERVICE_KEY, apikey: SERVICE_KEY },
      body: JSON.stringify({ template, to, data: data || {} }),
    });
    const j = await res.json().catch(function () { return {}; });
    if (!res.ok) { console.error('[account-delete-cron] ส่งอีเมล template=' + template + ' ไม่สำเร็จ:', j); return { sent: false, reason: (j && j.error) || ('http_' + res.status) }; }
    return { sent: true };
  } catch (e) {
    console.error('[account-delete-cron] เรียก send-transactional-email พังกลางทาง template=' + template, e);
    return { sent: false, reason: 'network_error' };
  }
}

// ── ลบบัญชี 1 ราย ให้ครบขั้นตอน (a)-(d) เหมือน account-delete/index.ts เวอร์ชันก่อนหน้าทุกประการ
//    (ย้ายมาไว้ที่นี่ ดูเหตุผลในหัวไฟล์) — คืนค่า {ok, completed_steps, error?} ไม่ throw ออกไปนอกฟังก์ชัน
//    เพื่อให้ loop หลักประมวลผล user คนถัดไปต่อได้แม้คนนี้พัง (1 คนพัง ไม่ควรทำให้ทั้งรอบ cron หยุด) ──

// 🔴🔴 2026-08-10 (P7-02 F.6c รอบ 2 — ปิดช่องโหว่ทางทฤษฎีที่เหลือ หลังตรวจ concurrency ละเอียดตามที่ Lin สั่ง):
//   การ claim ตอนต้น loop (processing_started_at) การันตี exclusivity "ตราบใดที่ยัง stale ไม่ถึง 15 นาที"
//   แต่ deleteOneAccount() เดิมไม่เคยเช็คซ้ำเลยระหว่างขั้นตอน (a)-(d) — ถ้า 1 คำขอใช้เวลานานผิดปกติจริง
//   (เช่น RPC ค้าง/network ช้าเกิน 15 นาทีแต่ process ยังไม่ตาย) ระหว่างนั้นผู้ใช้กด cancel สำเร็จได้ (เพราะ
//   processing_started_at กลายเป็น stale ในสายตาของ cancel แล้ว) แต่ cron ตัวเดิมยังทำงานต่อด้วย state เก่า
//   ในหน่วยความจำ ไม่รู้ตัวว่าถูกยกเลิกไปแล้ว แล้วจะเดินหน้าลบข้อมูล/auth user ต่อ — เพิ่มด่านอ่านฐานข้อมูล
//   กลับมาเช็คซ้ำว่า "การ claim ของเรายังเป็นเจ้าของแถวนี้อยู่จริง" (status ยังเป็น pending + processing_
//   started_at ยังตรงกับเวลาที่เรา claim ไว้เป๊ะ — ใช้ exact-match ไม่ใช่แค่ "not null" กันเคสที่คนละ cron
//   invocation แย่ง claim ซ้อนกันไปแล้วด้วย) ก่อนขั้นตอนทำลายข้อมูลทุกขั้น (ไม่ใช่แค่ก่อนลบ auth user
//   ขั้นตอนเดียว เพราะ (a)-(c) ก็ทำลายข้อมูลถาวรเช่นกัน ต่อให้ (d) ไม่ทำงานสุดท้าย)
//   ในทางปฏิบัติ Edge Function มี timeout ที่สั้นกว่า 15 นาทีมากอยู่แล้ว (ช่องโหว่นี้แทบเป็นไปไม่ได้ให้เกิดจริง)
//   แต่ด่านนี้ทำให้ invariant เป็นจริงเสมอไม่ว่า runtime constraint จะเปลี่ยนไปในอนาคตแค่ไหนก็ตาม
async function verifyStillOwnedByUs(admin, requestId, claimedAtIso) {
  const { data, error } = await admin
    .from('account_deletion_requests')
    .select('id')
    .eq('id', requestId)
    .eq('status', 'pending')
    .eq('processing_started_at', claimedAtIso)
    .limit(1);
  if (error) return { ok: false, ownershipError: true, detail: error.message };
  return { ok: !!(data && data.length > 0) };
}

async function deleteOneAccount(admin, userId, cachedEmail, requestId, claimedAtIso) {
  const completedSteps = [];
  const resultCounts = { deleted: {}, anonymized: {} };

  // 🔴 ด่านที่ 1 — เช็คก่อนเริ่มขั้นตอนทำลายข้อมูลใดๆ เลย (ก่อน (a))
  {
    const gate = await verifyStillOwnedByUs(admin, requestId, claimedAtIso);
    if (gate.ownershipError) return { ok: false, error: 'final_ownership_gate_check_failed', detail: gate.detail, completed_steps: completedSteps };
    if (!gate.ok) {
      console.error('[account-delete-cron] 🔴🔴 หยุดก่อนเริ่มลบข้อมูลใดๆ เพราะ claim ของเราไม่ใช่เจ้าของแถวนี้แล้ว (id=' + requestId + ', user_id=' + userId + ') — มีคนเปลี่ยนสถานะ/แย่ง claim ไปแล้วระหว่างทาง (เช่น ผู้ใช้กด cancel ตอน claim เดิม stale)');
      return { ok: false, error: 'cancelled_before_point_of_no_return', completed_steps: completedSteps };
    }
  }

  // (a) ลบตารางที่มี FK แบบ RESTRICT ก่อนเสมอ
  for (const table of HARD_DELETE_TABLES) {
    const before = await countRows(admin, table, userId);
    if (before.error) return { ok: false, error: 'precheck_failed', table, detail: before.error, completed_steps: completedSteps };
    const { error: delErr } = await admin.from(table).delete().eq('user_id', userId);
    if (delErr) return { ok: false, error: 'delete_failed', table, detail: delErr.message, completed_steps: completedSteps };
    const after = await countRows(admin, table, userId);
    if (after.error || after.count !== 0) return { ok: false, error: 'delete_unverified', table, remaining: after.count, completed_steps: completedSteps };
    resultCounts.deleted[table] = before.count;
    completedSteps.push('delete:' + table);
  }

  // (b) anonymize login_events (star_ledger ไม่มีอะไรต้องแก้ — ไม่มี PII จริง ยืนยันแล้ว)
  {
    const before = await countRows(admin, 'login_events', userId);
    if (before.error) return { ok: false, error: 'precheck_failed', table: 'login_events', detail: before.error, completed_steps: completedSteps };
    if (before.count > 0) {
      const { error: updErr } = await admin.from('login_events').update({ email: null, ip: null, fingerprint: null, user_agent: null }).eq('user_id', userId);
      if (updErr) return { ok: false, error: 'anonymize_failed', table: 'login_events', detail: updErr.message, completed_steps: completedSteps };
      const { count: leftoverCount, error: verifyErr } = await admin.from('login_events').select('*', { count: 'exact', head: true }).eq('user_id', userId)
        .or('email.not.is.null,ip.not.is.null,fingerprint.not.is.null,user_agent.not.is.null');
      if (verifyErr || (leftoverCount || 0) > 0) return { ok: false, error: 'anonymize_unverified', table: 'login_events', remaining_identifying_rows: leftoverCount, completed_steps: completedSteps };
    }
    resultCounts.anonymized.login_events = before.count;
    completedSteps.push('anonymize:login_events');
  }
  {
    const r = await countRows(admin, 'star_ledger', userId);
    resultCounts.anonymized.star_ledger = r.count === null ? 0 : r.count;
    completedSteps.push('anonymize:star_ledger (no-op — ไม่มีคอลัมน์ระบุตัวตน)');
  }

  // (c) เขียน audit log สุดท้าย "ก่อน" ลบ auth user เสมอ — idempotent เหมือนเดิม (กัน retry เขียนซ้ำ)
  let auditAlreadyWritten = false;
  {
    const { data: existingAudit, error: existingAuditErr } = await admin.from('account_audit_log').select('id').eq('user_id', userId).eq('event_type', 'account_deletion').limit(1);
    if (existingAuditErr) return { ok: false, error: 'audit_log_precheck_failed', detail: existingAuditErr.message, completed_steps: completedSteps };
    auditAlreadyWritten = (existingAudit || []).length > 0;
  }
  if (!auditAlreadyWritten) {
    const { error: auditErr } = await admin.rpc('log_account_audit', {
      p_user_id: userId, p_event_type: 'account_deletion', p_provider: null,
      p_before_state: { account_existed: true, email: cachedEmail },
      p_after_state: { account_deleted: true, deleted_at: new Date().toISOString(), deleted_counts: resultCounts.deleted, anonymized_counts: resultCounts.anonymized },
      p_actor_type: 'system', p_actor_id: null, // 🆕 actor_type='system' — cron ลบ ไม่ใช่ user กดปุ่มเองตรงนี้อีกต่อไป (ต่างจากเวอร์ชันก่อนหน้าที่ actor_type='user' เพราะตอนนั้น user คือคนกด confirm เอง)
    });
    if (auditErr) return { ok: false, error: 'audit_log_failed', detail: auditErr.message, completed_steps: completedSteps };
    completedSteps.push('audit_log_written');
  } else {
    completedSteps.push('audit_log_already_written (retry)');
  }

  // 🔴 ด่านที่ 2 — เช็คซ้ำอีกครั้งก่อนขั้นตอนที่ย้อนกลับไม่ได้ที่สุด (ลบ auth user) แม้ด่านที่ 1 ผ่านไปแล้ว
  // เพราะ (a)-(c) ข้างบนกินเวลาเพิ่ม ต่อให้น้อยมากก็ตาม — เช็คสดอีกทีก่อนจุดที่ไม่มีทางย้อนกลับจริงๆ
  {
    const gate = await verifyStillOwnedByUs(admin, requestId, claimedAtIso);
    if (gate.ownershipError) return { ok: false, error: 'final_ownership_gate_check_failed', detail: gate.detail, completed_steps: completedSteps };
    if (!gate.ok) {
      console.error('[account-delete-cron] 🔴🔴 หยุดก่อนลบ auth user จริง เพราะ claim ของเราไม่ใช่เจ้าของแถวนี้แล้ว (id=' + requestId + ', user_id=' + userId + ') — ข้อมูลบางส่วนใน (a)-(c) อาจถูกลบ/anonymize ไปแล้วก่อนหน้านี้ แต่ auth user (ตัวบัญชี) ยังไม่ถูกแตะ');
      return { ok: false, error: 'cancelled_before_point_of_no_return', completed_steps: completedSteps };
    }
  }

  // (d) ลบ auth user จริง — ทำเป็นลำดับสุดท้ายเสมอ
  const { error: delUserErr } = await admin.auth.admin.deleteUser(userId);
  if (delUserErr) return { ok: false, error: 'delete_auth_user_failed', detail: delUserErr.message, completed_steps: completedSteps };

  const { data: checkUser, error: checkErr } = await admin.auth.admin.getUserById(userId);
  const stillExists = !checkErr && checkUser?.user;
  if (stillExists) return { ok: false, error: 'delete_auth_user_unverified', completed_steps: completedSteps };
  completedSteps.push('auth_user_deleted');

  return { ok: true, completed_steps: completedSteps, deleted: resultCounts.deleted, anonymized: resultCounts.anonymized };
}

// ═══════════════════════════════════════════════════════════════════════════
// 🆕 2026-08-08 (รอบ 3) — retry pass สำหรับอีเมล "ลบสำเร็จ" ที่เคยส่งพลาด
// ═══════════════════════════════════════════════════════════════════════════
// รันแยกจาก loop หลักที่ลบบัญชีโดยสิ้นเชิง (เรียกหลัง loop หลักจบ ในทุกรอบ cron ทุกวัน) — เงื่อนไข query
// กรองด้วย status='completed' เท่านั้น (บัญชีลบไปแล้วจริงตั้งแต่ก่อนหน้านี้) จึง "ไม่มีทางไปแตะแถว
// status='pending' หรือไปสั่งลบบัญชีอะไรเพิ่มเลย" — ทำหน้าที่แค่ "พยายามส่งอีเมลใหม่" เท่านั้น
async function retryFailedCompletionEmails(admin, SUPABASE_URL, SERVICE_KEY) {
  const { data: retryRows, error: retryErr } = await admin
    .from('account_deletion_requests')
    .select('id, contact_email_snapshot, completed_email_attempts')
    .eq('status', 'completed')
    .is('completed_email_sent_at', null)
    .not('contact_email_snapshot', 'is', null)
    .lt('completed_email_attempts', MAX_EMAIL_RETRY_ATTEMPTS)
    .limit(EMAIL_RETRY_BATCH_SIZE);

  if (retryErr) {
    console.error('[account-delete-cron] retry pass: หาแถวที่ต้อง retry อีเมลไม่สำเร็จ', retryErr);
    return { attempted: 0, sent: 0, still_failing: 0, query_failed: true };
  }
  if (!retryRows || retryRows.length === 0) {
    return { attempted: 0, sent: 0, still_failing: 0 };
  }

  let sentCount = 0;
  for (const row of retryRows) {
    const emailResult = await sendDeletionEmail(SUPABASE_URL, SERVICE_KEY, 'account_deletion_completed', row.contact_email_snapshot, {});
    const patch = {
      completed_email_attempts: (row.completed_email_attempts || 0) + 1,
      completed_email_last_attempt_at: new Date().toISOString(),
    };
    if (emailResult.sent) { patch.completed_email_sent_at = new Date().toISOString(); sentCount++; }
    const { error: patchErr } = await admin.from('account_deletion_requests').update(patch).eq('id', row.id);
    if (patchErr) console.error('[account-delete-cron] retry pass: บันทึกผลไม่สำเร็จ id=' + row.id, patchErr);
    if (!emailResult.sent) {
      const attemptsNow = patch.completed_email_attempts;
      if (attemptsNow >= MAX_EMAIL_RETRY_ATTEMPTS) {
        // 🔴 ครบจำนวนครั้งที่ยอมให้ retry อัตโนมัติแล้ว — โวยดังๆ ให้ Lin ตรวจมือ (ดู query [E6] ใน
        // SQL ไฟล์คู่กัน) ไม่ retry ต่ออัตโนมัติอีก แต่ "ไม่แตะสถานะ completed ของการลบเลย" — บัญชีลบ
        // ไปแล้วจริง แค่ไม่มีใครส่งอีเมลแจ้งได้สำเร็จเท่านั้น
        console.error('[account-delete-cron] 🔴 ส่งอีเมล "ลบสำเร็จ" พลาดครบ ' + MAX_EMAIL_RETRY_ATTEMPTS + ' ครั้งแล้ว id=' + row.id + ' — หยุด retry อัตโนมัติ ต้องตรวจมือ (เช่น EMAIL_PROVIDER_API_KEY ยังไม่ได้ตั้ง)');
      }
    }
  }
  return { attempted: retryRows.length, sent: sentCount, still_failing: retryRows.length - sentCount };
}

serve(async (req) => {
  const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
  const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const admin = createClient(SUPABASE_URL, SERVICE_KEY);

  try {
    const staleCutoff = new Date(Date.now() - STALE_LOCK_MINUTES * 60 * 1000).toISOString();
    const nowIso = new Date().toISOString();

    // หาแถวที่ครบกำหนดจริง (scheduled_delete_at <= now) และยัง pending อยู่ ยังไม่มีใคร claim ค้าง
    const { data: dueRows, error: dueErr } = await admin
      .from('account_deletion_requests')
      .select('id, user_id, scheduled_delete_at')
      .eq('status', 'pending')
      .lte('scheduled_delete_at', nowIso)
      .or('processing_started_at.is.null,processing_started_at.lt.' + staleCutoff)
      .limit(MAX_ROWS_PER_RUN);

    if (dueErr) {
      console.error('[account-delete-cron] หาแถวที่ครบกำหนดไม่สำเร็จ', dueErr);
      return json({ ok: false, error: 'query_due_rows_failed', detail: dueErr.message }, 500);
    }
    // 🆕 2026-08-09 (แก้บั๊กที่เจอตอนทดสอบ failure-path): เดิมโค้ดตรงนี้ return ทันทีถ้าไม่มีบัญชีใหม่ที่
    //   ครบกำหนดลบ — ทำให้ retry pass ของอีเมลที่เคยพลาด (ด้านล่าง) "ไม่ได้ทำงานเลย" ในรอบที่ไม่มีบัญชีใหม่
    //   ขัดกับที่ตั้งใจไว้ว่า retry pass เป็นงานอิสระ ไม่ต้องรอมีบัญชีใหม่ — แก้โดยเอา early return ออก
    //   ปล่อยให้โค้ดไหลผ่านไปถึง retry pass เสมอ (ถ้าไม่มีแถวใหม่ ลูปข้างล่างแค่ไม่ทำอะไร results จะว่าง)
    const results = [];
    for (const row of dueRows || []) {
      // claim แถวนี้ก่อนลงมือ — optimistic: อัปเดตแล้วเช็คว่าเราเป็นคนได้จริง (กัน 2 รอบ cron ชนกัน)
      const { data: claimRows, error: claimErr } = await admin
        .from('account_deletion_requests')
        .update({ processing_started_at: nowIso })
        .eq('id', row.id).eq('status', 'pending')
        .or('processing_started_at.is.null,processing_started_at.lt.' + staleCutoff)
        .select();
      if (claimErr || !claimRows || claimRows.length === 0) {
        results.push({ id: row.id, user_id: row.user_id, skipped: true, reason: 'claim_lost' });
        continue; // อีกรอบ/อีก process แย่ง claim ไปแล้ว ข้ามไปแถวถัดไป ไม่ใช่ error
      }

      // แคชอีเมลไว้ก่อนเริ่มลบ (ดูเหตุผลเต็มในหัวไฟล์) — ดึงไม่ได้ก็ไม่หยุดกระบวนการลบ (แค่จะไม่มีอีเมล
      // แจ้งตอนจบ) เพราะการลบบัญชีตามคำขอผู้ใช้สำคัญกว่าการแจ้งอีเมล — บันทึก log ไว้ให้เห็นชัดว่าทำไม
      //
      // 🆕 2026-08-08 (รอบ 3): เขียนอีเมลที่แคชได้ลง contact_email_snapshot "ทันที" ก่อนเริ่มลบจริง —
      // ไม่ใช่แค่เก็บในตัวแปร JS เฉยๆ (ของเดิมรอบก่อน) เหตุผล: ถ้า process ตายกลางทางระหว่างขั้นตอน
      // ลบ (a)-(d) แล้ว retry รอบถัดไป จะยังมีอีเมลให้ใช้ส่งตอนจบอยู่ (ตัวแปร JS ในโปรเซสเดิมหายไปแล้ว
      // แน่นอนถ้า process ตาย แต่ค่าที่เขียนลง DB แล้วไม่หาย)
      let cachedEmail = null;
      try {
        const { data: userLookup } = await admin.auth.admin.getUserById(row.user_id);
        cachedEmail = userLookup?.user?.email || null;
      } catch (e) {
        console.error('[account-delete-cron] ดึงอีเมลก่อนลบไม่สำเร็จ user_id=' + row.user_id, e);
      }
      if (cachedEmail) {
        const { error: snapshotErr } = await admin.from('account_deletion_requests').update({ contact_email_snapshot: cachedEmail }).eq('id', row.id);
        if (snapshotErr) console.error('[account-delete-cron] เขียน contact_email_snapshot ไม่สำเร็จ (ไม่หยุดกระบวนการลบ แต่ retry อีเมลทีหลังจะทำไม่ได้) id=' + row.id, snapshotErr);
      }

      const delResult = await deleteOneAccount(admin, row.user_id, cachedEmail, row.id, nowIso);

      if (!delResult.ok) {
        // ลบไม่สำเร็จ — ปล่อย processing_started_at ค้างไว้ (จะถูก stale-lock cutoff แย่งคืนได้เองใน
        // รอบถัดไปหลัง 15 นาที) "ห้าม" set status='completed' เด็ดขาด และต้องโวยดังๆ ห้ามเงียบ
        console.error('[account-delete-cron] ลบบัญชีไม่สำเร็จ user_id=' + row.user_id, delResult);
        results.push({ id: row.id, user_id: row.user_id, ok: false, error: delResult.error, completed_steps: delResult.completed_steps });
        continue;
      }

      // ลบสำเร็จจริง — ปิดคำขอ + ส่งอีเมลแจ้งด้วยอีเมลที่แคชไว้ (ไม่ query DB ใหม่ เพราะ auth user หายแล้ว)
      // 🔴 2026-08-10 (P7-02 F.6c — ป้องกันชั้นที่ 2 คู่กับ account-delete/index.ts การแก้ cancel):
      // เดิมบรรทัดนี้ update ไม่มีเงื่อนไข status เลย ทำให้ถ้า user กด cancel ระหว่างที่ cron กำลังลบอยู่
      // (แถวถูกเปลี่ยนเป็น 'cancelled' ไปแล้วจากอีก request) โค้ดตรงนี้จะเขียนทับกลับเป็น 'completed' เงียบๆ
      // โดยไม่มีใครรู้ — เพิ่ม .eq('status','pending') เป็นเงื่อนไข ถ้าไม่ตรง (แปลว่ามีอะไรมาเปลี่ยนสถานะ
      // แถวนี้ระหว่างทางแล้ว) ให้โวยดังๆ แทนการเขียนทับเงียบๆ (บัญชีลบไปแล้วจริงไม่ว่ากรณีไหน แก้ได้แค่ที่ฝั่ง
      // cancel เท่านั้นที่กันไม่ให้เกิดเคสนี้ตั้งแต่ต้น — จุดนี้เป็นแค่เกราะสำรอง ป้องกันไม่ให้ status ในฐานข้อมูล
      // โกหกสถานะจริงถ้ามีทางอื่นในอนาคตที่ไปแก้ status ของแถวนี้โดยไม่ผ่าน account-delete/index.ts)
      const { error: closeErr, data: closeRows } = await admin
        .from('account_deletion_requests')
        .update({ status: 'completed', completed_at: new Date().toISOString() })
        .eq('id', row.id)
        .eq('status', 'pending')
        .select();
      if (!closeErr && (!closeRows || closeRows.length === 0)) {
        console.error('[account-delete-cron] 🔴 บัญชีลบสำเร็จจริงแล้ว (auth user หายแล้ว) แต่แถว status ไม่ใช่ pending ตอนจะปิดคำขอ (id=' + row.id + ', user_id=' + row.user_id + ') — น่าจะมีคน cancel ระหว่างทาง ต้องตรวจมือ: บัญชีถูกลบถาวรไปแล้วจริง แต่ status ในตารางอาจไม่ตรงกับความจริง (เช่นค้างเป็น cancelled)');
        results.push({ id: row.id, user_id: row.user_id, ok: true, deleted: true, status_close_race_detected: true });
        continue;
      }
      if (closeErr) {
        // 🔴 เคสอันตราย: ลบบัญชีสำเร็จแล้วจริง แต่ปิดคำขอไม่สำเร็จ — ต้องโวยดังๆ (ไม่งั้นแถวนี้จะค้าง
        // status='pending' ตลอดกาลทั้งที่บัญชีหายไปแล้วจริง รอบหน้า cron จะพยายามลบซ้ำแล้วพังที่ deleteUser
        // เพราะหาบัญชีไม่เจอแล้ว — ไม่ทำให้ข้อมูลพังเพิ่ม แต่ log จะสับสน) ต้องตรวจมือ
        console.error('[account-delete-cron] 🔴 ลบบัญชีสำเร็จแล้วจริงแต่ปิดคำขอไม่สำเร็จ id=' + row.id + ' user_id=' + row.user_id, closeErr);
        results.push({ id: row.id, user_id: row.user_id, ok: true, deleted: true, close_request_failed: true, detail: closeErr.message });
        continue;
      }

      // ── ส่งอีเมลยืนยัน "ลบสำเร็จ" — 🆕 2026-08-08 (รอบ 3) แยก failure handling ออกจากผลการลบโดยเด็ดขาด ──
      // ตามที่ Lin สั่ง: บัญชีลบสำเร็จแล้วจริงตั้งแต่บรรทัดข้างบน (status='completed' เขียนไปแล้ว) ไม่ว่า
      // อีเมลนี้จะส่งสำเร็จหรือไม่ก็ตาม "ไม่มีทางย้อนกลับไปทำให้ deletion ถูกมองว่าล้มเหลว" และ "ไม่มีทาง
      // ทำให้ cron พยายามลบบัญชีนี้ซ้ำ" (query หาแถวที่ต้องลบกรองด้วย status='pending' เท่านั้น แถวนี้
      // เปลี่ยนเป็น 'completed' ไปแล้วถาวร ไม่มีทางถูกดึงกลับมาลบซ้ำได้จากโค้ดจุดไหนเลย) — ผลของอีเมล
      // (สำเร็จ/พลาด) บันทึกแยกลง completed_email_* ล้วนๆ ไม่แตะคอลัมน์ status/completed_at เลย
      const emailResult = await sendDeletionEmail(SUPABASE_URL, SERVICE_KEY, 'account_deletion_completed', cachedEmail, {});
      const emailUpdatePatch = {
        completed_email_attempts: 1, // แถวนี้เพิ่งลบเสร็จหมาดๆ เป็นความพยายามส่งครั้งแรก
        completed_email_last_attempt_at: new Date().toISOString(),
      };
      if (emailResult.sent) emailUpdatePatch.completed_email_sent_at = new Date().toISOString();
      const { error: emailPatchErr } = await admin.from('account_deletion_requests').update(emailUpdatePatch).eq('id', row.id);
      if (emailPatchErr) {
        // พลาดแค่การบันทึกผลอีเมล (ไม่ใช่พลาดการลบ) — โวยไว้ log เฉยๆ รอบ retry ถัดไปจะลองส่งใหม่ให้เอง
        // เพราะ completed_email_sent_at ยังเป็น null อยู่ (ไม่ได้ถูกเขียนสำเร็จ) ก็จะยังเข้าเงื่อนไข retry
        console.error('[account-delete-cron] บันทึกผลอีเมล "ลบสำเร็จ" ไม่สำเร็จ (ไม่กระทบผลการลบ) id=' + row.id, emailPatchErr);
      }
      if (!emailResult.sent) {
        console.error('[account-delete-cron] ส่งอีเมล "ลบสำเร็จ" ไม่สำเร็จในความพยายามแรก id=' + row.id + ' — จะ retry อัตโนมัติในรอบถัดไป (สูงสุด ' + MAX_EMAIL_RETRY_ATTEMPTS + ' ครั้ง)');
      }

      results.push({ id: row.id, user_id: row.user_id, ok: true, deleted: true, email_sent: emailResult.sent, completed_steps: delResult.completed_steps });
    }

    const succeeded = results.filter(function (r) { return r.ok; }).length;
    const failed = results.filter(function (r) { return r.ok === false; }).length;

    // ── retry pass ของอีเมลที่เคยพลาด — แยก try/catch ของตัวเอง กันไม่ให้ error ตรงนี้ทำให้ response
    //    ของงานหลัก (การลบบัญชี ที่เสร็จไปแล้วจริงข้างบน) พังไปด้วย (2 งานนี้ต้องเป็นอิสระจากกันเสมอ) ──
    let emailRetryResult = null;
    try {
      emailRetryResult = await retryFailedCompletionEmails(admin, SUPABASE_URL, SERVICE_KEY);
    } catch (e) {
      console.error('[account-delete-cron] retry pass พังกลางทาง (ไม่กระทบผลการลบบัญชีข้างบนเลย)', e);
      emailRetryResult = { error: String((e && e.message) || e) };
    }

    return json({ ok: true, processed: results.length, succeeded, failed, results, email_retry_pass: emailRetryResult });
  } catch (e) {
    console.error('[account-delete-cron] เกิด error ที่ไม่คาดคิด', e);
    return json({ ok: false, error: 'unexpected_error', detail: String((e && e.message) || e) }, 500);
  }
});
