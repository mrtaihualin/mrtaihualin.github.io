// ════════════════════════════════════════════════════════════
// Supabase Edge Function: unlink-line-student
// เพิ่ม 2026-07-14 — ใช้ตอนครูกด "封存" นักเรียนออกจากรายชื่อที่ใช้งานอยู่ (classroom/index.html deleteStudent())
//
// 🆕 2026-07-14 (รอบ 2): Lin สั่งเปลี่ยนจาก "ลบทิ้งถาวร" เป็น "封存" (archive) แทน —
//   ข้อมูลนักเรียนต้องยังอยู่ในฐานข้อมูลเหมือน "นักเรียนเก่า" กู้คืนได้ ไม่ใช่ลบหายจริง
//   (ก่อนหน้านี้ Lin เคยลบนักเรียนทดสอบไปแล้วถามหาคืน ถึงรู้ว่าลบถาวรไม่เหมาะ)
//   → ฟังก์ชันนี้เปลี่ยนจาก DELETE เป็น UPDATE archived_at = now() แทน (ต้องมีคอลัมน์นี้ในตาราง
//   classroom_students ก่อน — ดู SQL ที่ Lin ต้องรันเองแนบมาพร้อมกัน)
//
// ปัญหาเดิมที่แก้ (LINE เมนูค้าง): ถ้านักเรียนคนนั้นเคยผูก LINE ไว้ (line_user_id มีค่า)
//   LINE ของเขาจะค้างอยู่ที่ "เมนูนักเรียน" (มีปุ่ม 我的教室) ไปตลอด กดแล้วจะเจอ "ยังไม่ผูกบัญชี"
//   ดูแปลก — เพราะ browser ไม่มี LINE_CHANNEL_ACCESS_TOKEN (server secret) ไปสลับเมนูให้ตรงๆ ได้
//
// หน้าที่ (รับ token นักเรียน แล้วทำ 2 อย่างนี้ก่อนตอบกลับ):
//   1. ถ้าเคยผูก LINE (line_user_id มีค่า) → สลับ Rich Menu ของเขาเป็นเมนู "win-back"
//      (ปุ่ม 官方網站/練習遊戲/繼續上課) ผ่าน POST /v2/bot/user/{userId}/richmenu/{id}
//      — เป็น best-effort เท่านั้น สลับไม่สำเร็จก็ไม่ทำให้การ封存นักเรียนล้มเหลว (ไม่ critical)
//   2. UPDATE classroom_students SET archived_at = now() (ใช้ service role ฝั่ง server) —
//      ทำใน Edge Function นี้เลยรอบเดียว (ไม่ใช่ให้ client อัปเดตซ้ำ) กันปัญหา
//      "สลับเมนูสำเร็จแต่บันทึกไม่สำเร็จ" หรือกลับกัน race กัน
//   ⚠️ ไม่ได้ทำอะไรกับ Google Calendar / Google Drive — สองอย่างนั้นต้องใช้ token ส่วนตัวของ
//      Lin (ครู) ทำจากฝั่ง client เท่านั้น (classroom/index.html cancelFutureClassesForArchive
//      / moveStudentFolderToArchive) เพราะ Edge Function ไม่มีสิทธิ์เข้า Google Calendar/Drive
//      ของ Lin (ไม่มี token ส่วนตัวของ Lin ฝั่ง server)
//
// วิธี deploy: supabase functions deploy unlink-line-student
//   (ใช้ secret ชุดเดียวกับ link-line ที่ตั้งไว้แล้ว: LINE_CHANNEL_ACCESS_TOKEN, WINBACK_RICH_MENU_ID
//    ⚠️ ถ้ายังไม่ตั้ง secret เหล่านี้ ฟังก์ชันนี้จะข้ามขั้นตอนสลับเมนู แต่ยังบันทึก archived_at ได้ปกติ)
//
// ความปลอดภัย: ระดับเดียวกับที่ deleteStudent() มีอยู่แล้วตอนนี้ (หน้าครูเรียกด้วย anon key,
//   RLS ของตาราง classroom_students เป็นตัวคุมสิทธิ์แก้ไขอยู่แล้ว — Edge Function นี้ใช้ service
//   role เพื่อ "บันทึก + สลับเมนู" ในจังหวะเดียวกันเท่านั้น ไม่ได้เปิดสิทธิ์เพิ่มจากที่มีอยู่)
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

    // 1) หาแถวนักเรียนก่อน เอา line_user_id (ถ้ามี) ไปสลับเมนู
    const { data: student, error: selError } = await supabase
      .from('classroom_students')
      .select('line_user_id')
      .eq('token', token)
      .maybeSingle();

    if (selError) {
      return new Response(JSON.stringify({ error: 'db lookup failed', detail: selError.message }), {
        status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders() },
      });
    }

    // 2) เคยผูก LINE ไว้ → พยายามสลับเมนูเป็น win-back (best-effort ไม่ critical)
    const lineUserId = student && student.line_user_id;
    const winbackRichMenuId = Deno.env.get('WINBACK_RICH_MENU_ID');
    const channelAccessToken = Deno.env.get('LINE_CHANNEL_ACCESS_TOKEN');
    if (lineUserId && winbackRichMenuId && channelAccessToken) {
      try {
        await fetch(
          'https://api.line.me/v2/bot/user/' + encodeURIComponent(lineUserId) + '/richmenu/' + encodeURIComponent(winbackRichMenuId),
          { method: 'POST', headers: { Authorization: 'Bearer ' + channelAccessToken } }
        );
        // ไม่เช็ค response ต่อ — สลับเมนูไม่สำเร็จก็ยังต้องลบนักเรียนต่อไปตามปกติ
      } catch (e) {
        // เงียบไว้ ไม่ทำให้ทั้ง request ล้มเหลว
      }
    }

    // 3) 封存 (archive) จริง — ไม่ลบแถว แค่ประทับเวลา archived_at (critical — ต้องเช็ค error
    //    เสมอ ตามกฎ RELIABILITY FIRST ห้ามขึ้นสำเร็จลมๆ)
    const { error: updError, count } = await supabase
      .from('classroom_students')
      .update({ archived_at: new Date().toISOString() }, { count: 'exact' })
      .eq('token', token);

    if (updError) {
      return new Response(JSON.stringify({ error: 'archive failed', detail: updError.message }), {
        status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders() },
      });
    }

    return new Response(JSON.stringify({ ok: true, archived: count || 0 }), {
      status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders() },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e && e.message || e) }), {
      status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders() },
    });
  }
});
