// ════════════════════════════════════════════════════════════
// Supabase Edge Function: search-gemini  (🔴 ยังไม่ deploy — โครงร่างเท่านั้น)
//
// หน้าที่ตามที่ตกลงไว้ (73_CLAUDE_UPDATE หัวข้อ C): เมื่อ rule-based search
// (js/core/search-engine.js) หาไม่เจอ/ไม่มั่นใจ → ค่อยถามฟังก์ชันนี้ให้ Gemini
// ช่วยตีความคำค้นของคนใช้ แล้ว "เลือก" destination จาก whitelist ที่ระบบกำหนด
// เท่านั้น — ห้าม Gemini สร้าง URL/คำตอบเอง (กันหลอกไปหน้าอื่น/กันแต่งคำตอบมั่ว)
//
// 🔴 ทำไมยัง deploy ไม่ได้ตอนนี้ (บล็อกจริง ไม่ใช่แค่ยังไม่ว่าง):
//   1) ต้อง supabase login + link project ของ Lin เอง — Claude ไม่มีสิทธิ์ทำแทนในเซสชันนี้
//      (เหมือนที่บล็อก P7-02/N5 — ต้องมีคนที่มี Supabase CLI login จริงเป็นคน deploy)
//   2) ต้องตั้ง secret GEMINI_API_KEY จริงด้วย `supabase secrets set GEMINI_API_KEY=...`
//      (ห้ามอยู่ฝั่ง client เด็ดขาด — ต้องเป็นความลับฝั่งเซิร์ฟเวอร์เท่านั้น)
//   3) รายการ keyword/synonym ใน data/search-index.js ตอนนี้ Claude ร่างจาก
//      <title>/<meta description> ของหน้าจริง — ยังไม่ผ่าน Lin ตรวจทีละรายการ
//      ก่อน publish ให้คนทั่วไปค้นหาใช้งานจริง
//
// วิธี deploy ตอนพร้อม (Lin ทำเอง):
//   1. supabase secrets set GEMINI_API_KEY=<key จริงจาก Google AI Studio>
//   2. supabase functions deploy search-gemini
//      (ไม่ใส่ --no-verify-jwt — เรียกจาก client ในเบราว์เซอร์ผ่าน supabase-js เสมอ
//      เหมือน game-content ข้อ 3 ในไฟล์นั้น)
//   3. เพิ่ม rate limit ต่อ IP/session ก่อนเปิดใช้จริง (กัน cost บาน — ยังไม่ได้ทำในโครงนี้)
// ════════════════════════════════════════════════════════════

// deno-lint-ignore-file
// @ts-nocheck  (Supabase Edge Function รันบน Deno ไม่ใช่ Node — type error ของ IDE ปกติ)

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ⚠️ TODO ก่อน deploy จริง: sync รายชื่อนี้ให้ตรงกับ id ทั้งหมดใน data/search-index.js
// (SEARCH_INDEX.ALL.map(e => e.id)) — แนะนำเขียนสคริปต์ generate whitelist นี้อัตโนมัติ
// แทนพิมพ์มือ กัน id ใหม่ที่เพิ่มทีหลังหลุดไม่ถูกเติมเข้ามา
const ALLOWED_DESTINATION_IDS = [
  'game-tone', 'game-reading', 'game-listening', 'game-typing', 'game-word-order', 'game-lego', 'game-challenge',
  'course-trial', 'course-pricing',
  // ... (ที่เหลือดึงจาก data/search-index.js ตอน deploy จริง — ไม่ hardcode ครบในโครงร่างนี้)
];

const ALLOWED_ORIGINS = [
  'https://mrtaihualin.com',
  'https://www.mrtaihualin.com',
  'https://mrtaihualin.github.io',
  // 2026-08-10 (P7-02 staging): หน้าทดสอบ staging บน Netlify
  'https://gentle-moxie-bf64ad.netlify.app',
];

function corsHeaders(origin) {
  const allowOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Vary': 'Origin',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
  };
}

serve(async (req) => {
  const origin = req.headers.get('origin') || '';
  const headers = corsHeaders(origin);
  if (req.method === 'OPTIONS') return new Response('ok', { headers });
  if (req.method !== 'POST') return new Response(JSON.stringify({ ok: false, error: 'method not allowed' }), { status: 405, headers });

  let body;
  try { body = await req.json(); } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: 'bad json' }), { status: 400, headers });
  }

  const query = String(body?.query || '').slice(0, 200); // กันคำค้นยาวเกินจำเป็น
  if (!query.trim()) return new Response(JSON.stringify({ ok: false, error: 'empty query' }), { status: 400, headers });

  const GEMINI_API_KEY = Deno.env.get('GEMINI_API_KEY');
  if (!GEMINI_API_KEY) {
    // ยังไม่ตั้ง secret จริง — ตอบแบบไม่เดา ไม่ล่ม (ตรงตามกฎ "ไม่มั่นใจ = ไม่เดา")
    return new Response(JSON.stringify({ ok: true, matched: false, reason: 'gemini not configured yet' }), { status: 200, headers });
  }

  // TODO (ตอน deploy จริง): เรียก Gemini API ด้วย prompt ที่บังคับให้ตอบเป็น JSON
  // เดียว { id: "<หนึ่งใน ALLOWED_DESTINATION_IDS หรือ null>" } เท่านั้น แล้ว validate
  // ผลลัพธ์ต่อว่า id ที่ได้อยู่ใน ALLOWED_DESTINATION_IDS จริงก่อนส่งกลับให้ client
  // — ถ้า Gemini ตอบ id ที่ไม่อยู่ใน whitelist ให้ถือว่า "ไม่มั่นใจ" (matched: false)
  // ไม่ใช่เชื่อ Gemini เดาส่ง URL เอง

  return new Response(JSON.stringify({ ok: true, matched: false, reason: 'not implemented yet' }), { status: 200, headers });
});
