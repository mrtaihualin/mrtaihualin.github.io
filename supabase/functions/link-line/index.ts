// ════════════════════════════════════════════════════════════
// Supabase Edge Function: link-line
// หน้าที่: รับ idToken จากหน้า classroom/line-link.html (LIFF)
//   1. เอา idToken ไปยืนยันกับ LINE เอง (https://api.line.me/oauth2/v2.1/verify)
//      → กัน "ใครก็ส่ง userId มั่วๆ มาผูกกับ token คนอื่น" (ไม่เชื่อค่าจาก browser ตรงๆ)
//   2. ถ้ายืนยันผ่าน → เอา userId (claim "sub") ที่ยืนยันแล้วมาเขียนลง
//      classroom_students.line_user_id (ด้วย service role key ฝั่ง server เท่านั้น)
//
// วิธี deploy (ทำต่อจาก notify-line ได้เลย ใช้ secret ชุดเดียวกันบางส่วน):
//   1. supabase secrets set LIFF_CHANNEL_ID=xxxxxxxx
//      ⚠️ 2026-07-06 แก้ไข: LINE เปลี่ยนกฎ ใส่ LIFF ใน Messaging API channel ตรงๆ ไม่ได้แล้ว
//      ต้องสร้าง channel แยกแบบ "LINE Login" ต่างหาก (อยู่ Provider เดียวกัน) แล้วสร้าง LIFF ในนั้น
//      → LIFF_CHANNEL_ID ที่ต้องใส่ตรงนี้ คือ Channel ID ของ channel "LINE Login" ตัวนั้น
//      (สังเกตง่ายๆ: ตัวเลขก่อนขีด "-" ใน LIFF ID เช่น "2010620934-5MFOEYBX" ก็คือค่านี้เลย ไม่ต้องไปหาที่อื่น)
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
    const { token, accessToken } = await req.json();
    if (!token || !accessToken) {
      return new Response(JSON.stringify({ error: 'missing token/accessToken' }), {
        status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders() },
      });
    }

    const liffChannelId = Deno.env.get('LIFF_CHANNEL_ID');
    if (!liffChannelId) {
      return new Response(JSON.stringify({ error: 'server not configured: missing LIFF_CHANNEL_ID' }), {
        status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders() },
      });
    }

    // 2026-07-11 改用 access token（不用 idToken）：idToken 1 小時就過期常壞（"IdToken expired"），
    //   access token 由 LIFF SDK 自動維護。安全性一樣：browser 無法偽造有效的 LINE token。
    // 1) 先跟 LINE 驗證這個 access token「是不是發給我們這個 channel 的、還沒過期」
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
    // client_id 一定要等於我們自己的 channel ID，否則是別的 channel 的 token 偷拿來用
    if (String(verified.client_id) !== String(liffChannelId)) {
      return new Response(JSON.stringify({ error: 'channel mismatch', detail: 'token client_id=' + verified.client_id }), {
        status: 401, headers: { 'Content-Type': 'application/json', ...corsHeaders() },
      });
    }

    // 2) 用已驗證的 access token 跟 LINE 拿「真正的 userId」（browser 無法偽造）
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
    const lineUserId = prof.userId; // LINE 驗證過的真正 userId
    if (!lineUserId) {
      return new Response(JSON.stringify({ error: 'no userId from LINE profile' }), {
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
