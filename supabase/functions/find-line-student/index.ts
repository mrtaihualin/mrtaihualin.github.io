// ════════════════════════════════════════════════════════════
// Supabase Edge Function: find-line-student
// เพิ่ม 2026-07-13 — ใช้กับ "ปุ่มเดียวใน LINE Rich Menu" (ไม่มี token ต่อท้ายลิงก์)
//
// หน้าที่: รับ accessToken จาก LIFF (ไม่มี student token มาด้วย เพราะเป็นปุ่มกลางใน Rich Menu)
//   1. ยืนยัน accessToken กับ LINE เอง (วิธีเดียวกับ link-line ที่ deploy อยู่แล้ว)
//      → กัน "ใครก็ปลอม userId มาถามหา token คนอื่น" (ไม่เชื่อค่าจาก browser ตรงๆ)
//   2. เอา userId ที่ยืนยันแล้ว ไปหาว่า classroom_students แถวไหนเคยผูก line_user_id นี้ไว้
//      (ผูกไว้แล้วจากตอนกดลิงก์ส่วนตัวครั้งแรก ผ่าน line-link.html + link-line function เดิม)
//   3. เจอ → คืน token ของนักเรียนคนนั้น (ให้หน้าเว็บ redirect ไปห้องเรียนของตัวเอง)
//      ไม่เจอ (ยังไม่เคยผูกบัญชี) → คืน ok:false ไม่ใช่ error 500 (เป็น flow ปกติ ไม่ใช่ของพัง)
//
// ⚠️ ความปลอดภัย: ไม่มีทางเดา token คนอื่นได้จากตรงนี้ เพราะต้องมี accessToken ของ LINE
//    บัญชีนั้นจริงๆ เท่านั้น (ยืนยันกับ LINE ก่อนเสมอ เหมือน link-line)
//
// วิธี deploy: ใช้ secret ชุดเดียวกับ link-line (LIFF_CHANNEL_ID ตั้งไว้แล้ว ไม่ต้องตั้งซ้ำ)
//   supabase functions deploy find-line-student
// ════════════════════════════════════════════════════════════

// deno-lint-ignore-file
// @ts-nocheck

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders() });
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'method not allowed' }), {
      status: 405, headers: { 'Content-Type': 'application/json', ...corsHeaders() },
    });
  }

  try {
    const { accessToken } = await req.json();
    if (!accessToken) {
      return new Response(JSON.stringify({ error: 'missing accessToken' }), {
        status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders() },
      });
    }

    const liffChannelId = Deno.env.get('LIFF_CHANNEL_ID');
    if (!liffChannelId) {
      return new Response(JSON.stringify({ error: 'server not configured: missing LIFF_CHANNEL_ID' }), {
        status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders() },
      });
    }

    // 1) ยืนยัน access token กับ LINE ก่อนเสมอ (เหมือน link-line เป๊ะ)
    const verifyRes = await fetch(
      'https://api.line.me/oauth2/v2.1/verify?access_token=' + encodeURIComponent(accessToken)
    );
    if (!verifyRes.ok) {
      const errText = await verifyRes.text();
      return new Response(JSON.stringify({ error: 'LINE access token verify failed', detail: errText }), {
        status: 401, headers: { 'Content-Type': 'application/json', ...corsHeaders() },
      });
    }
    const verified = await verifyRes.json();
    if (String(verified.client_id) !== String(liffChannelId)) {
      return new Response(JSON.stringify({ error: 'channel mismatch', detail: 'token client_id=' + verified.client_id }), {
        status: 401, headers: { 'Content-Type': 'application/json', ...corsHeaders() },
      });
    }

    // 2) เอา access token ที่ยืนยันแล้วไปถาม userId จริงจาก LINE (browser ปลอมไม่ได้)
    const profRes = await fetch('https://api.line.me/v2/profile', {
      headers: { Authorization: 'Bearer ' + accessToken },
    });
    if (!profRes.ok) {
      const errText = await profRes.text();
      return new Response(JSON.stringify({ error: 'LINE profile fetch failed', detail: errText }), {
        status: 401, headers: { 'Content-Type': 'application/json', ...corsHeaders() },
      });
    }
    const prof = await profRes.json();
    const lineUserId = prof.userId;
    if (!lineUserId) {
      return new Response(JSON.stringify({ error: 'no userId from LINE profile' }), {
        status: 401, headers: { 'Content-Type': 'application/json', ...corsHeaders() },
      });
    }

    // 3) หา student token ที่เคยผูก line_user_id นี้ไว้ (ด้วย service role, bypass RLS ฝั่ง server เท่านั้น)
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL'),
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    );
    const { data, error } = await supabase
      .from('classroom_students')
      .select('token')
      .eq('line_user_id', lineUserId)
      .limit(1)
      .maybeSingle();

    if (error) {
      return new Response(JSON.stringify({ error: 'db lookup failed', detail: error.message }), {
        status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders() },
      });
    }
    if (!data || !data.token) {
      // ยังไม่เคยผูกบัญชี — ไม่ใช่ error ของระบบ เป็นสถานะปกติที่หน้าเว็บต้องรู้ไปนำทางต่อ
      return new Response(JSON.stringify({ ok: false, reason: 'not_linked' }), {
        status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders() },
      });
    }

    return new Response(JSON.stringify({ ok: true, token: data.token }), {
      status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders() },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e && e.message || e) }), {
      status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders() },
    });
  }
});
