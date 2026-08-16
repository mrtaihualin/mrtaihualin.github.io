// ════════════════════════════════════════════════════════════
// Supabase Edge Function: lego-daily-limit
//
// ทำไมต้องมีฟังก์ชันนี้ (LIN 2026-07-26):
//   เกมเลโก้ (造句遊戲) จำกัดวันละ 2 ประโยค (ไม่ล็อกอิน) / 5 ประโยค (ล็อกอิน) — เดิมนับที่
//   localStorage ฝั่งเบราว์เซอร์เท่านั้น (เพดานนุ่ม ล้างเบราว์เซอร์/เปิด incognito ก็ข้ามได้)
//   Lin สั่งเปลี่ยนเป็น "แข็ง" ครอบคลุมทุกคนรวมคนไม่ล็อกอินด้วย → ต้องนับที่เซิร์ฟเวอร์
//
// วิธีระบุตัวตน:
//   ล็อกอินอยู่ (มี Authorization header ที่ยืนยันผ่าน Supabase ได้จริง) → key = 'user:<uuid>', เพดาน 5
//   ไม่ล็อกอิน → key = 'ip:<hash ของ IP>' (จาก header x-forwarded-for), เพดาน 2
//   ⚠️ ข้อจำกัดที่ Lin ควรรู้: กันคนไม่ล็อกอินด้วย IP ไม่ใช่ "แข็ง 100%" — สลับ WiFi/4G หรือเปิด VPN
//   จะได้ IP ใหม่ = โควตาใหม่ นี่คือขีดจำกัดมาตรฐานของการจำกัดคนไม่มีบัญชี ไม่มีทางแข็งกว่านี้ถ้าไม่บังคับล็อกอิน
//
// ทำไมต้องมี Edge Function แยก ไม่ให้เว็บเรียก Supabase table ตรง ๆ:
//   ตาราง lego_daily_limits ปิด RLS ไม่มี policy เลย (service_role only) — กันผู้เล่นเปิด console
//   เบราว์เซอร์แล้วยิง insert/update เอง (ถ้าเปิดให้ยิงตรงจากฝั่งเว็บ จะปลอมค่า count เองได้ทันที)
//   ให้ Edge Function เป็นทางเดียวที่แก้ค่าได้ ใช้ service_role (bypass RLS) + ฟังก์ชัน SQL แบบอะตอมมิก
//   (lego_consume_daily) กันปัญหา "กดรัว/เปิดหลายแท็บพร้อมกันแล้วเกินโควต้า" (check-then-act race)
//
// วิธี deploy:
//   1. รัน SQL migration ก่อน: supabase/sql/2026-07-26_lego_daily_limits.sql
//      (Supabase Dashboard → SQL Editor → วางทั้งไฟล์ → Run)
//   2. Supabase Dashboard → Edge Functions → New Function → ชื่อ "lego-daily-limit" → วางโค้ดไฟล์นี้ → Deploy
//      (ไม่ต้องตั้ง secret เพิ่ม — ใช้ SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY ที่ Supabase ใส่ให้อัตโนมัติทุก
//      Edge Function อยู่แล้ว เหมือน line-login)
//   3. ถ้าแก้โค้ดไฟล์นี้ทีหลัง ต้องกลับมา copy วางทับ + Deploy ใหม่อีกรอบเสมอ (ไม่มี auto-sync จาก repo)
// ════════════════════════════════════════════════════════════

// deno-lint-ignore-file
// @ts-nocheck

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// 2026-08-08 (P7-03 defense-in-depth): จำกัด CORS จาก '*' เป็นโดเมนจริงของเว็บเท่านั้น —
// ตรวจแล้วฟังก์ชันนี้เรียกจาก js/games/lego-game-app.js (lego.html) ล้วน ๆ ไม่มี LIFF SDK เกี่ยวข้อง
// (ฟังก์ชันนี้มีด่านตรวจตัวตนจริง — JWT/IP hash — CORS ผ่อนปรนเดิมไม่ได้ช่วยข้ามด่านนั้นได้ แค่ล็อกให้แคบลงเป็นชั้นป้องกันที่สอง)
// ดู /Users/taihualin/Documents/Claude/Backup/PROJECTS_ARCHIVE/HISTORY/2026-08-12_inbox-review-cleared/website/44_ผลลัพธ์_P7-03_จำกัดCORS.md
const ALLOWED_ORIGINS = [
  'https://mrtaihualin.com',
  'https://www.mrtaihualin.com',
  'https://mrtaihualin.github.io',
  // 2026-08-10 (P7-02 staging): หน้าทดสอบ staging บน Netlify
  'https://gentle-moxie-bf64ad.netlify.app',
];
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// วันนี้ตามเวลาไต้หวัน (Asia/Taipei) — ให้วันขึ้นวันใหม่ตรงกับที่เว็บใช้อยู่แล้วทั้งเว็บ (streak/ดาว)
// ไม่ใช้เวลาเครื่อง server เอง (อาจเป็น UTC) กันวันเพี้ยน
function todayTaipei() {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date());
  const get = (t) => parts.find((p) => p.type === t).value;
  return `${get('year')}-${get('month')}-${get('day')}`; // YYYY-MM-DD
}

// hash IP ด้วย SHA-256 (Web Crypto API มีอยู่แล้วใน Deno) — ไม่เก็บ IP ดิบลงฐานข้อมูล
async function hashIp(ip) {
  const data = new TextEncoder().encode('lego-ip-salt-2026-07-26:' + ip); // ใส่ salt คงที่ กัน rainbow table ง่าย ๆ
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function clientIp(req) {
  // x-forwarded-for อาจมีหลาย IP คั่นด้วยจุลภาค (ผ่านหลาย proxy) — ตัวแรกสุด = IP ผู้เล่นจริง
  // อ้างอิง: https://github.com/orgs/supabase/discussions/7884
  const xff = req.headers.get('x-forwarded-for') || '';
  const first = xff.split(',')[0].trim();
  return first || req.headers.get('x-real-ip') || 'unknown';
}

serve(async (req) => {
  const origin = req.headers.get('Origin') || '';
  const allowOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  function corsHeaders() {
    return {
      'Access-Control-Allow-Origin': allowOrigin,
      'Vary': 'Origin',
      'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
    };
  }
  function json(body, status) {
    return new Response(JSON.stringify(body), {
      status: status || 200,
      headers: { 'Content-Type': 'application/json', ...corsHeaders() },
    });
  }
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders() });
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);
  if (origin && !ALLOWED_ORIGINS.includes(origin)) return json({ error: 'origin_not_allowed' }, 403);

  try {
    const rawText = await req.text();
    if (!rawText || rawText.length > 2_000) return json({ error: 'invalid_payload_size' }, 400);
    let body;
    try { body = JSON.parse(rawText); } catch { return json({ error: 'malformed_json' }, 400); }
    const requestId = String(body && body.request_id || '').toLowerCase();
    if (!UUID_V4.test(requestId)) return json({ error: 'idempotency_required' }, 400);

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const supabase = createClient(supabaseUrl, serviceKey);

    // ── ระบุตัวตน: ล็อกอินอยู่ไหม (เช็คกับ Supabase auth server จริง ไม่เชื่อ client ส่งมาลอย ๆ) ──
    let identityKey = null, cap = 2, loggedIn = false;
    const authHeader = req.headers.get('Authorization') || '';
    const accessToken = authHeader.replace(/^Bearer\s+/i, '');
    if (accessToken) {
      const { data: authedUser, error: authErr } = await supabase.auth.getUser(accessToken);
      if (!authErr && authedUser && authedUser.user) {
        identityKey = 'user:' + authedUser.user.id;
        cap = 5;
        loggedIn = true;
      }
    }
    if (!identityKey) {
      const ip = clientIp(req);
      identityKey = 'ip:' + (await hashIp(ip));
      cap = 2;
    }

    const day = todayTaipei();
    const { data: quota, error: rpcErr } = await supabase.rpc('lego_consume_daily_idempotent', {
      p_key: identityKey, p_day: day, p_cap: cap, p_request_id: requestId,
    });
    if (rpcErr) return json({ error: 'db_error', detail: rpcErr.message }, 500);
    if (!quota || quota.ok !== true) {
      if (quota && quota.reason === 'replay_conflict') return json({ error: 'replay_conflict' }, 409);
      return json({ error: 'db_result_invalid' }, 500);
    }

    const ok = quota.allowed === true;
    return json({
      ok,
      reason: ok ? undefined : 'limit',
      used: Number(quota.used),
      cap,
      loggedIn,
      remaining: Number(quota.remaining),
      requestId,
      idempotent: quota.idempotent === true,
    });
  } catch (e) {
    return json({ error: String((e && e.message) || e) }, 500);
  }
});
