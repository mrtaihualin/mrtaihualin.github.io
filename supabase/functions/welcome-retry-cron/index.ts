// ════════════════════════════════════════════════════════════
// Supabase Edge Function: welcome-retry-cron
// เพิ่ม 2026-07-16 — fallback (แบบ 2) ของ "ข้อความต้อนรับ" ใน link-line:
//   link-line ส่งข้อความต้อนรับตอนผูกบัญชีสดๆ (ส่งหาครู Lin ก่อนเสมอ → ครูสำเร็จค่อยส่งหานักเรียน)
//   ถ้ารอบนั้นพัง (ครูหรือนักเรียนฝั่งใดฝั่งหนึ่ง) → link-line จะ "ไม่มาร์คว่าสำเร็จ" ปล่อยว่างไว้
//   ฟังก์ชันนี้รันเป็นรอบๆ (ผ่าน pg_cron) มาเช็คหา "นักเรียนที่ผูกบัญชีแล้วแต่ยังไม่เคยได้รับข้อความต้อนรับสำเร็จ"
//   แล้วลองส่งซ้ำให้อัตโนมัติ จนกว่าจะสำเร็จ — กันไม่ให้ข้อความต้อนรับหายไปถาวรแบบไม่มีใครรู้ (RELIABILITY FIRST)
//
// เงื่อนไขที่นับว่า "ยังไม่เคยได้รับสำเร็จ" — ต้องครบทั้ง 3:
//   1. line_user_id ไม่ว่าง (ผูกบัญชีแล้ว)
//   2. welcome_msg_sent_at ยังว่างอยู่ (ยังไม่เคยส่งสำเร็จทั้งครู+นักเรียนมาก่อน)
//   3. archived_at ว่างอยู่ (ไม่ใช่นักเรียนเก่าที่封存ไปแล้ว — คนที่封存แล้วไม่ต้องส่งต้อนรับซ้ำ)
//
// กติกาการส่งเหมือน link-line ทุกประการ: ส่งหาครู (LINE_TEACHER_USER_ID) ก่อนเสมอ →
//   ครูสำเร็จค่อยส่งหานักเรียน → สำเร็จทั้งคู่ถึงจะมาร์ค welcome_msg_sent_at = now() (กันส่งซ้ำ)
//   ถ้ารอบนี้ยังพังอีก ก็แค่ปล่อยว่างไว้เหมือนเดิม รอบหน้า (cron ครั้งถัดไป) จะลองใหม่เองอัตโนมัติ ไม่ต้องทำอะไรเพิ่ม
//
// ⚠️ ต้องรัน SQL เพิ่มคอลัมน์ + backfill ก่อน (ดู SQL แนบแยกที่ Lin ต้องรันเองใน Supabase SQL Editor):
//   1. alter table classroom_students add column if not exists welcome_msg_sent_at timestamptz;
//   2. update classroom_students set welcome_msg_sent_at = now()
//      where line_user_id is not null and welcome_msg_sent_at is null;
//      (backfill นักเรียนที่ผูกไว้ก่อนหน้านี้แล้ว กันไม่ให้จู่ๆ ได้รับ "ข้อความต้อนรับ" ย้อนหลังทั้งที่เรียนมานานแล้ว)
//
// วิธี deploy: supabase functions deploy welcome-retry-cron
//   (ใช้ secret ชุดเดียวกับ link-line ที่ตั้งไว้แล้วทั้งหมด: LINE_CHANNEL_ACCESS_TOKEN, LINE_TEACHER_USER_ID
//    ไม่ต้องตั้งอะไรเพิ่ม) แล้วตั้ง pg_cron ให้เรียกทุก 1 ชม. (ดู SQL แนบแยก)
// ════════════════════════════════════════════════════════════

// deno-lint-ignore-file
// @ts-nocheck

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const LINE_PUSH_URL = 'https://api.line.me/v2/bot/message/push';

async function pushLine(channelToken, to, text) {
  const res = await fetch(LINE_PUSH_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + channelToken },
    body: JSON.stringify({ to, messages: [{ type: 'text', text }] }),
  });
  if (!res.ok) throw new Error('LINE API ' + res.status + ': ' + (await res.text()));
}

serve(async (req) => {
  try {
    const channelToken = Deno.env.get('LINE_CHANNEL_ACCESS_TOKEN');
    const teacherUserId = Deno.env.get('LINE_TEACHER_USER_ID');
    if (!channelToken) {
      return new Response(JSON.stringify({ error: 'server not configured: missing LINE_CHANNEL_ACCESS_TOKEN' }), {
        status: 500, headers: { 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(Deno.env.get('SUPABASE_URL'), Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'));

    const { data: pending, error: selError } = await supabase
      .from('classroom_students')
      .select('token, name, line_user_id')
      .not('line_user_id', 'is', null)
      .is('welcome_msg_sent_at', null)
      .is('archived_at', null);

    if (selError) {
      return new Response(JSON.stringify({ error: 'db lookup failed', detail: selError.message }), {
        status: 500, headers: { 'Content-Type': 'application/json' },
      });
    }

    const welcomeText = '帳號連結成功 🎉\n你好！我是泰華 🙏\n之後的上課提醒、改期通知，都會從這裡自動傳給你\n有任何課程問題，直接在這裡留言就可以囉 😊';
    let sent = 0, skipped = 0;

    for (const s of (pending || [])) {
      const studentLabel = s.name || s.token;

      let teacherOk = true;
      if (teacherUserId) {
        try {
          await pushLine(channelToken, teacherUserId, '📋（補送）' + studentLabel + ' 剛連結 LINE 帳號成功，已發送以下歡迎訊息給他：\n\n' + welcomeText);
        } catch (e) {
          teacherOk = false;
          console.error('[welcome-retry-cron] ส่งสำเนาให้ครูไม่สำเร็จ (' + studentLabel + ') — ข้ามรอบนี้ ลองใหม่รอบหน้า:', e);
        }
      }
      if (!teacherOk) { skipped++; continue; }

      let studentOk = true;
      try {
        await pushLine(channelToken, s.line_user_id, welcomeText);
      } catch (e) {
        studentOk = false;
        console.error('[welcome-retry-cron] ส่งข้อความต้อนรับให้นักเรียนไม่สำเร็จ (' + studentLabel + ') — ลองใหม่รอบหน้า:', e);
      }
      if (!studentOk) { skipped++; continue; }

      // สำเร็จทั้งคู่ → มาร์คกันส่งซ้ำ
      const { error: updError } = await supabase
        .from('classroom_students')
        .update({ welcome_msg_sent_at: new Date().toISOString() })
        .eq('token', s.token);
      if (updError) {
        console.error('[welcome-retry-cron] มาร์ค welcome_msg_sent_at ไม่สำเร็จ (' + studentLabel + ') — รอบหน้าอาจส่งซ้ำอีกครั้ง:', updError);
      }
      sent++;
    }

    return new Response(JSON.stringify({ ok: true, sent, skipped, checked: (pending || []).length }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e && e.message || e) }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }
});
