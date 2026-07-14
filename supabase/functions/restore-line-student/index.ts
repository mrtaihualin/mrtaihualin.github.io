// ════════════════════════════════════════════════════════════
// Supabase Edge Function: restore-line-student
// เพิ่ม 2026-07-14 — คู่กับ unlink-line-student ใช้ตอนครูกดปุ่ม "♻️ 恢復" ในหน้าครู
//   (ส่วน 📦 舊生列表 ใน classroom/index.html restoreStudent())
//
// หน้าที่ (รับ token นักเรียนที่封存ไว้ แล้วทำ 2 อย่างนี้ก่อนตอบกลับ):
//   1. UPDATE classroom_students SET archived_at = null (เอากลับมาเป็นนักเรียนที่ใช้งานอยู่)
//      — critical ต้องเช็ค error เสมอ (RELIABILITY FIRST)
//   2. ถ้าเคยผูก LINE ไว้ (line_user_id มีค่า) → สลับ Rich Menu กลับเป็นเมนูนักเรียน
//      (ปุ่ม 我的教室) ผ่าน POST /v2/bot/user/{userId}/richmenu/{id} — best-effort เท่านั้น
//      สลับไม่สำเร็จก็ไม่ทำให้การกู้คืนล้มเหลว
//   ⚠️ ไม่ได้ทำอะไรกับ Google Calendar / Google Drive — ฝั่ง client (classroom/index.html
//      moveStudentFolderFromArchive) จะย้ายโฟลเดอร์ Drive กลับให้แยกต่างหาก (ต้อง token
//      ส่วนตัวของ Lin) · Calendar ไม่ auto ฟื้นคืน ต้องให้ Lin ตั้งวัน/เวลาเรียนใหม่เอง
//      ถ้านักเรียนคนนี้จะกลับมาเรียนจริง (เหมือนตอนเพิ่มนักเรียนใหม่ปกติ)
//
// วิธี deploy: supabase functions deploy restore-line-student
//   (ใช้ secret ชุดเดียวกับ link-line/unlink-line-student ที่ตั้งไว้แล้ว:
//    LINE_CHANNEL_ACCESS_TOKEN, STUDENT_RICH_MENU_ID — ไม่ต้องตั้งอะไรเพิ่ม)
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

    // 1) เอา archived_at ออก (critical — ต้องเช็ค error เสมอ)
    const { error: updError, count } = await supabase
      .from('classroom_students')
      .update({ archived_at: null }, { count: 'exact' })
      .eq('token', token);

    if (updError) {
      return new Response(JSON.stringify({ error: 'restore failed', detail: updError.message }), {
        status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders() },
      });
    }

    // 2) หา line_user_id ไปสลับเมนูกลับเป็นเมนูนักเรียน (best-effort ไม่ critical)
    const { data: student } = await supabase
      .from('classroom_students')
      .select('line_user_id')
      .eq('token', token)
      .maybeSingle();

    const lineUserId = student && student.line_user_id;
    const studentRichMenuId = Deno.env.get('STUDENT_RICH_MENU_ID');
    const channelAccessToken = Deno.env.get('LINE_CHANNEL_ACCESS_TOKEN');
    if (lineUserId && studentRichMenuId && channelAccessToken) {
      try {
        await fetch(
          'https://api.line.me/v2/bot/user/' + encodeURIComponent(lineUserId) + '/richmenu/' + encodeURIComponent(studentRichMenuId),
          { method: 'POST', headers: { Authorization: 'Bearer ' + channelAccessToken } }
        );
      } catch (e) {
        // เงียบไว้ ไม่ทำให้ทั้ง request ล้มเหลว
      }
    }

    return new Response(JSON.stringify({ ok: true, restored: count || 0 }), {
      status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders() },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e && e.message || e) }), {
      status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders() },
    });
  }
});
