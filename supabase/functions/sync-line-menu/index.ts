// ════════════════════════════════════════════════════════════
// Supabase Edge Function: sync-line-menu
// เพิ่ม 2026-07-17 — แก้ปัญหาจริง: Jenny / Ling / 育郁 ผูกบัญชี (line_user_id มีค่าแล้ว)
//   ตั้งแต่ก่อนมีด่าน "ต้องแอด OA เป็นเพื่อนก่อน" (เพิ่มใน link-line เมื่อ 2026-07-16)
//   ตอนนั้นเลยยังไม่เป็นเพื่อนกัน → LINE ไม่ยอมสลับ Rich Menu ให้ → เมนูค้างเป็นเมนูทั่วไป
//   (ปุ่ม 體驗課) ทั้งที่ผูกบัญชีสำเร็จแล้ว ตอนนี้แอดเพื่อนแล้วแต่หน้าเว็บนักเรียนมองว่า
//   "ผูกแล้ว" (buildLineActionBtn เช็คแค่ line_user_id) เลยไม่มีทางกดผูกซ้ำเพื่อสั่งสลับเมนูใหม่
//   → ฟังก์ชันนี้ให้ "ครู" กดสั่งสลับเมนูให้นักเรียนคนไหนก็ได้เองจากหน้า admin โดยตรง
//   ไม่ต้องรบกวน/รอให้นักเรียนกดอะไรเลย (เงื่อนไขเดียวที่บังคับไม่ได้ด้วยโค้ด คือ
//   นักเรียนคนนั้นต้องเคยแอด OA เป็นเพื่อนไปแล้วจริง — ถ้ายังไม่แอด ฟังก์ชันจะบอกตรงๆ ไม่เงียบ)
//
// หน้าที่:
//   1. ตรวจว่าเป็นครูจริง (session email ตรง mr.taihualin@gmail.com — แพทเทิร์นเดียวกับ
//      restore-line-student / unlink-line-student)
//   2. หา line_user_id ของนักเรียนจาก token
//   3. เช็คว่าเป็นเพื่อนกับ OA จริงหรือยัง (GET /v2/bot/profile/{userId}) — 404 = ยังไม่แอด
//   4. ถ้าเป็นเพื่อนแล้ว → POST /v2/bot/user/{userId}/richmenu/{STUDENT_RICH_MENU_ID}
//      🆕 ต่างจาก link-line/restore-line-student ตรงนี้ "เช็ค response จริง" แล้วรายงานผลตรงๆ
//      ให้ครูเห็น (ไม่ใช่ best-effort เงียบๆ) เพราะฟังก์ชันนี้มีหน้าที่เดียวคือสลับเมนูให้สำเร็จ
//
// วิธี deploy: supabase functions deploy sync-line-menu
//   (ใช้ secret ชุดเดิมที่ตั้งไว้แล้วทั้งหมด — ไม่ต้องตั้งอะไรเพิ่ม:
//    LINE_CHANNEL_ACCESS_TOKEN, STUDENT_RICH_MENU_ID)
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
    // ต้องเป็นครูล็อกอินจริงเท่านั้น (แพทเทิร์นเดียวกับ restore-line-student / unlink-line-student)
    const authHeader = req.headers.get('Authorization') || '';
    const jwt = authHeader.replace(/^Bearer\s+/i, '');
    if (!jwt) {
      return new Response(JSON.stringify({ error: 'missing auth token — 請先登入教師帳號' }), {
        status: 401, headers: { 'Content-Type': 'application/json', ...corsHeaders() },
      });
    }
    const asUser = createClient(Deno.env.get('SUPABASE_URL'), Deno.env.get('SUPABASE_ANON_KEY'), { global: { headers: { Authorization: authHeader } } });
    const { data: userData, error: userErr } = await asUser.auth.getUser(jwt);
    const callerEmail = (userData?.user?.email || '').toLowerCase();
    if (userErr || callerEmail !== 'mr.taihualin@gmail.com') {
      return new Response(JSON.stringify({ error: 'unauthorized — 只有老師本人登入後才能操作' }), {
        status: 401, headers: { 'Content-Type': 'application/json', ...corsHeaders() },
      });
    }

    const { token } = await req.json();
    if (!token) {
      return new Response(JSON.stringify({ error: 'missing token' }), {
        status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders() },
      });
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL'),
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    );

    const { data: student, error: selError } = await supabase
      .from('classroom_students')
      .select('line_user_id, name')
      .eq('token', token)
      .maybeSingle();

    if (selError) {
      return new Response(JSON.stringify({ error: 'db lookup failed', detail: selError.message }), {
        status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders() },
      });
    }
    if (!student) {
      return new Response(JSON.stringify({ error: 'token not found' }), {
        status: 404, headers: { 'Content-Type': 'application/json', ...corsHeaders() },
      });
    }
    const lineUserId = student.line_user_id;
    if (!lineUserId) {
      return new Response(JSON.stringify({ ok: false, reason: 'not_linked', detail: '這位學生還沒連結過 LINE 帳號' }), {
        status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders() },
      });
    }

    const channelAccessToken = Deno.env.get('LINE_CHANNEL_ACCESS_TOKEN');
    const studentRichMenuId = Deno.env.get('STUDENT_RICH_MENU_ID');
    if (!channelAccessToken || !studentRichMenuId) {
      return new Response(JSON.stringify({
        ok: false, reason: 'not_configured',
        detail: '伺服器還沒設定 LINE_CHANNEL_ACCESS_TOKEN / STUDENT_RICH_MENU_ID，請先設定好再試',
      }), { status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders() } });
    }

    // เช็คก่อนว่าเป็นเพื่อนกับ OA จริงหรือยัง — 200 = เพื่อนกัน, 404 = ยังไม่แอด/บล็อกอยู่
    const friendRes = await fetch(
      'https://api.line.me/v2/bot/profile/' + encodeURIComponent(lineUserId),
      { headers: { Authorization: 'Bearer ' + channelAccessToken } }
    );
    if (!friendRes.ok) {
      return new Response(JSON.stringify({ ok: false, reason: 'not_friend', detail: '這位學生還沒加 LINE 官方帳號好友（或已封鎖），要先請他加好友才能切選單' }), {
        status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders() },
      });
    }

    // เป็นเพื่อนแล้ว → สลับเมนูจริง (เช็ค response จริง ไม่ใช่ best-effort เงียบๆ)
    const switchRes = await fetch(
      'https://api.line.me/v2/bot/user/' + encodeURIComponent(lineUserId) + '/richmenu/' + encodeURIComponent(studentRichMenuId),
      { method: 'POST', headers: { Authorization: 'Bearer ' + channelAccessToken } }
    );
    if (!switchRes.ok) {
      const errText = await switchRes.text().catch(() => '');
      return new Response(JSON.stringify({ ok: false, reason: 'switch_failed', detail: 'LINE API 回應：' + switchRes.status + ' ' + errText }), {
        status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders() },
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
