// ════════════════════════════════════════════════════════════
// Supabase Edge Function: link-line
// หน้าที่: รับ idToken จากหน้า classroom/line-link.html (LIFF)
//   1. เอา idToken ไปยืนยันกับ LINE เอง (https://api.line.me/oauth2/v2.1/verify)
//      → กัน "ใครก็ส่ง userId มั่วๆ มาผูกกับ token คนอื่น" (ไม่เชื่อค่าจาก browser ตรงๆ)
//   2. ถ้ายืนยันผ่าน → เอา userId (claim "sub") ที่ยืนยันแล้วมาเขียนลง
//      classroom_students.line_user_id (ด้วย service role key ฝั่ง server เท่านั้น)
//
// วิธี deploy (ทำต่อจาก notify-line ได้เลย ใช้ secret ชุดเดียวกันบางส่วน):
//   1. supabase secrets set LIFF_CHANNEL_ID=xxxxxxxx   (ตัวเลข channel ID ของ Messaging API channel ที่สร้าง LIFF ไว้)
//   2. supabase functions deploy link-line
//   (ไม่ต้องตั้ง SUPABASE_SERVICE_ROLE_KEY เอง — Supabase ใส่ให้อัตโนมัติทุก Edge Function อยู่แล้ว)
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
    const { token, idToken } = await req.json();
    if (!token || !idToken) {
      return new Response(JSON.stringify({ error: 'missing token/idToken' }), {
        status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders() },
      });
    }

    const liffChannelId = Deno.env.get('LIFF_CHANNEL_ID');
    if (!liffChannelId) {
      return new Response(JSON.stringify({ error: 'server not configured: missing LIFF_CHANNEL_ID' }), {
        status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders() },
      });
    }

    // 1) ยืนยัน idToken กับ LINE เอง — ห้ามเชื่อ userId ที่ browser ส่งมาตรงๆ เด็ดขาด
    const verifyRes = await fetch('https://api.line.me/oauth2/v2.1/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ id_token: idToken, client_id: liffChannelId }),
    });
    if (!verifyRes.ok) {
      const errText = await verifyRes.text();
      return new Response(JSON.stringify({ error: 'LINE idToken verify failed', detail: errText }), {
        status: 401, headers: { 'Content-Type': 'application/json', ...corsHeaders() },
      });
    }
    const verified = await verifyRes.json();
    const lineUserId = verified.sub; // "sub" claim = LINE userId ที่ยืนยันแล้วจริง
    if (!lineUserId) {
      return new Response(JSON.stringify({ error: 'no sub claim in verified token' }), {
        status: 401, headers: { 'Content-Type': 'application/json', ...corsHeaders() },
      });
    }

    // 2) เขียนลง Supabase ด้วย service role (bypass RLS, รันฝั่ง server เท่านั้น ไม่มีทางเรียกจาก browser ได้)
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL'),
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    );
    const { error, count } = await supabase
      .from('classroom_students')
      .update({ line_user_id: lineUserId }, { count: 'exact' })
      .eq('token', token);

    if (error) {
      return new Response(JSON.stringify({ error: 'db update failed', detail: error.message }), {
        status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders() },
      });
    }
    if (!count) {
      return new Response(JSON.stringify({ error: 'token not found' }), {
        status: 404, headers: { 'Content-Type': 'application/json', ...corsHeaders() },
      });
    }

    return new Response(JSON.stringify({ ok: true }), {
      status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders() },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e && e.message || e) }), {
      status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders() },
    });
  }
});
