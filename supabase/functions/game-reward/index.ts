// ════════════════════════════════════════════════════════════
// Supabase Edge Function: game-reward
// หน้าที่: ให้แต้ม "รีวิวเกม" (auto ทันที) และ "อนุมัติแจ้งบั๊ก" (Lin กดอนุมัติเอง)
//   แยกจากคะแนนอันดับ/ดาว 100% — client เขียนแต้มเองไม่ได้เด็ดขาด (RLS ปิดไว้)
//   ต้องผ่านฟังก์ชันนี้เท่านั้น (service_role) เหมือน pattern เดียวกับระบบดาวเดิม
//
// action รองรับ 3 แบบ (ส่งมาใน body.action):
//   1) "submit_review"      — นักเรียนส่งรีวิว → ได้ 2 แต้มทันที (จำกัด 1 ครั้ง/เกม/วัน)
//   2) "submit_bug_report"  — นักเรียนแจ้งบั๊ก → บันทึกไว้ก่อน (pending) ยังไม่ได้แต้ม รอ Lin อนุมัติ
//   3) "approve_report"     — Lin อนุมัติแจ้งบั๊ก → ให้ 20 แต้ม (ต้องมี x-admin-key ถูกต้องเท่านั้น)
//
// วิธี deploy (Lin ต้องทำเอง เพราะ AI ไม่มีสิทธิ์ล็อกอิน Supabase ของ Lin):
//   1. supabase functions deploy game-reward
//   2. ตั้ง secret กุญแจแอดมิน (ตั้งเองเป็นค่าอะไรก็ได้ที่จำง่ายแต่คนอื่นเดาไม่ได้):
//      supabase secrets set GAME_REWARD_ADMIN_KEY=xxxxxxxx
//   3. รัน reward-schema.sql ใน Supabase SQL Editor ก่อน (สร้างตาราง 2 ตัว) ถ้ายังไม่ได้รัน
//
// ค่าคงที่แต้ม (ปรับได้ตรงนี้ที่เดียว ไม่ต้องแก้โค้ดฝั่งเว็บ):
//   REVIEW_POINTS = 2, BUG_REPORT_POINTS = 20, POINTS_CAP = 300
// ════════════════════════════════════════════════════════════

// deno-lint-ignore-file
// @ts-nocheck  (Supabase Edge Function รันบน Deno ไม่ใช่ Node — เวลาแก้ไฟล์นี้ในเครื่องอาจมี type error ของ IDE ปกติ ไม่กระทบตอน deploy จริง)

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const REVIEW_POINTS = 2;
const BUG_REPORT_POINTS = 20;
const POINTS_CAP = 300;
const VALID_GAMES = ['typing', 'reading', 'lego', 'word_order', 'tone_finder'];

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-admin-key',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
}
function json(body, status) {
  return new Response(JSON.stringify(body), { status: status || 200, headers: { 'Content-Type': 'application/json', ...corsHeaders() } });
}

// เช็คว่าข้อความดูเหมือนพิมพ์มั่ว/สแปมไหม (กันเคสพิมพ์อะไรก็ได้ 20 ตัวอักษรเพื่อเอาแต้ม) — Lin 2026-07-13
// รันอัตโนมัติทุกครั้งที่ submit_review ฝั่งเซิร์ฟเวอร์ (client แก้ไม่ได้) ไม่ต้องรอ Lin นั่งตรวจเอง
// เช็ค 3 ชั้น: (1) ตัวเดียวซ้ำติดกันยาวเกินไป (2) สัดส่วนตัวอักษรไม่ซ้ำกันต่ำเกินไป (วนซ้ำแบบ asdasdasd)
// (3) ต้องมีตัวอักษรจีน/ไทยจริงอย่างน้อยระดับหนึ่ง (เนื้อหาควรเป็นข้อความสะท้อนการเรียน ไม่ใช่กดคีย์บอร์ดมั่วเป็นอังกฤษ)
function looksLikeSpam(text) {
  const s = String(text || '').trim();
  if (!s) return true;
  if (/(.)\1{5,}/.test(s)) return true; // เช่น aaaaaaaaaaaaaaaaaaaa
  const uniqueRatio = new Set(s).size / s.length;
  if (uniqueRatio < 0.28) return true; // เช่น asdasdasdasdasdasdasd
  const cjkThaiCount = (s.match(/[一-鿿฀-๿]/g) || []).length;
  if (cjkThaiCount < 6) return true; // ไม่มีจีน/ไทยพอ (เช่น qwertyuiopasdfghjkl)
  return false;
}

// เพิ่มแต้ม + lifetime_points ให้ user (ชนเพดาน POINTS_CAP) — ใช้ upsert ผ่าน service role เท่านั้น
async function addPoints(admin, userId, amount) {
  const { data: existing } = await admin.from('game_reward_points').select('points, lifetime_points').eq('user_id', userId).maybeSingle();
  const curPoints = existing ? existing.points : 0;
  const curLifetime = existing ? existing.lifetime_points : 0;
  const newPoints = Math.min(POINTS_CAP, curPoints + amount);
  const newLifetime = curLifetime + amount;
  const { error } = await admin.from('game_reward_points').upsert({
    user_id: userId, points: newPoints, lifetime_points: newLifetime, updated_at: new Date().toISOString(),
  });
  if (error) throw error;
  return { points: newPoints, lifetime_points: newLifetime };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders() });
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);

  try {
    const body = await req.json();
    const action = body?.action;

    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const admin = createClient(SUPABASE_URL, SERVICE_KEY); // bypass RLS — ใช้ตอบคำถาม/เขียนแต้มเท่านั้น ห้ามเชื่อ user_id จาก client ตรงๆ

    // ── action: approve_report (Lin เท่านั้น) ──────────────────────
    if (action === 'approve_report') {
      const adminKey = req.headers.get('x-admin-key');
      const expected = Deno.env.get('GAME_REWARD_ADMIN_KEY');
      if (!expected || adminKey !== expected) return json({ error: 'unauthorized' }, 401);

      const eventId = body?.event_id;
      if (!eventId) return json({ error: 'missing event_id' }, 400);

      const { data: ev, error: evErr } = await admin.from('game_reward_events').select('*').eq('id', eventId).maybeSingle();
      if (evErr || !ev) return json({ error: 'event not found' }, 404);
      if (ev.status !== 'pending') return json({ error: 'event already ' + ev.status }, 400);

      const points = Number.isFinite(body?.points) ? Math.max(0, Math.min(100, body.points)) : BUG_REPORT_POINTS;
      const { error: updErr } = await admin.from('game_reward_events').update({
        status: 'approved', points_awarded: points, admin_note: body?.admin_note || null, reviewed_at: new Date().toISOString(),
      }).eq('id', eventId);
      if (updErr) throw updErr;

      const balance = await addPoints(admin, ev.user_id, points);
      return json({ ok: true, points_awarded: points, balance });
    }

    // ── action: reject_report (Lin เท่านั้น) — ปฏิเสธ ไม่ให้แต้ม แต่ปิดสถานะไว้ ──
    if (action === 'reject_report') {
      const adminKey = req.headers.get('x-admin-key');
      const expected = Deno.env.get('GAME_REWARD_ADMIN_KEY');
      if (!expected || adminKey !== expected) return json({ error: 'unauthorized' }, 401);
      const eventId = body?.event_id;
      if (!eventId) return json({ error: 'missing event_id' }, 400);
      const { error: updErr } = await admin.from('game_reward_events').update({
        status: 'rejected', admin_note: body?.admin_note || null, reviewed_at: new Date().toISOString(),
      }).eq('id', eventId).eq('status', 'pending');
      if (updErr) throw updErr;
      return json({ ok: true });
    }

    // ── action: list_pending (Lin เท่านั้น) — ใช้ในหน้าแอดมินเบา ๆ ─────
    if (action === 'list_pending') {
      const adminKey = req.headers.get('x-admin-key');
      const expected = Deno.env.get('GAME_REWARD_ADMIN_KEY');
      if (!expected || adminKey !== expected) return json({ error: 'unauthorized' }, 401);
      const { data, error } = await admin.from('game_reward_events').select('*').eq('type', 'bug_report').eq('status', 'pending').order('created_at', { ascending: true }).limit(100);
      if (error) throw error;
      return json({ ok: true, items: data });
    }

    // ── นักเรียน: submit_review / submit_bug_report ต้องยืนยันตัวตนจาก JWT ────
    // ไม่เชื่อ user_id ที่ client ส่งมาตรง ๆ เด็ดขาด — ต้องแกะจาก token ที่ล็อกอินจริงเท่านั้น
    const authHeader = req.headers.get('Authorization') || '';
    const jwt = authHeader.replace(/^Bearer\s+/i, '');
    if (!jwt) return json({ error: 'missing auth token — 請先登入才能回報問題/寫心得' }, 401);

    const asUser = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY'), { global: { headers: { Authorization: authHeader } } });
    const { data: userData, error: userErr } = await asUser.auth.getUser(jwt);
    if (userErr || !userData?.user) return json({ error: 'invalid session — 請重新登入' }, 401);
    const userId = userData.user.id;

    const game = body?.game;
    const content = String(body?.content || '').trim();
    if (!VALID_GAMES.includes(game)) return json({ error: 'invalid game' }, 400);

    if (action === 'submit_bug_report') {
      if (content.length < 5) return json({ error: '請再詳細描述問題一點（至少 5 個字）' }, 400);
      if (/(.)\1{5,}/.test(content)) return json({ error: '這看起來不像真的問題描述，請認真寫一下你遇到的狀況喔 🙂' }, 400); // เบากว่า submit_review เพราะยังไงก็ต้องรอ Lin อนุมัติก่อนได้แต้มอยู่แล้ว แค่กันสแปมกวนใจ
      const { data, error } = await admin.from('game_reward_events').insert({
        user_id: userId, game, type: 'bug_report', content: content.slice(0, 2000), status: 'pending', points_awarded: 0,
      }).select().single();
      if (error) throw error;
      return json({ ok: true, event: data, message: '已送出，等老師確認 — 如果確實是問題且修好了，會獲得 ' + BUG_REPORT_POINTS + ' 點' });
    }

    if (action === 'submit_review') {
      if (content.length < 20) return json({ error: '心得請再寫長一點喔（至少 20 個字），才不會被當亂打' }, 400);
      if (looksLikeSpam(content)) return json({ error: '內容看起來像亂打的，請認真寫一下今天學到了什麼喔 🙂' }, 400); // กันพิมพ์มั่ว 20 ตัวอักษรเพื่อเอาแต้มฟรี — เช็คอัตโนมัติ ไม่ต้องรอ Lin ตรวจ

      // เช็คโควต้า 1 ครั้ง/เกม/วัน (เผื่อ unique index ที่ DB ไว้อีกชั้นกันแข่งกันยิงพร้อมกัน)
      const { data: ins, error: insErr } = await admin.from('game_reward_events').insert({
        user_id: userId, game, type: 'review', content: content.slice(0, 2000), status: 'approved', points_awarded: REVIEW_POINTS, reviewed_at: new Date().toISOString(),
      }).select().single();
      if (insErr) {
        if (String(insErr.message || '').includes('uniq_daily_review')) {
          return json({ error: '今天已經寫過這個遊戲的心得了，明天再來喔 🙂' }, 429);
        }
        throw insErr;
      }
      const balance = await addPoints(admin, userId, REVIEW_POINTS);
      return json({ ok: true, event: ins, points_awarded: REVIEW_POINTS, balance, message: '謝謝你的心得！獲得 ' + REVIEW_POINTS + ' 點 🎉' });
    }

    return json({ error: 'unknown action' }, 400);
  } catch (e) {
    return json({ error: String((e && e.message) || e) }, 500);
  }
});
