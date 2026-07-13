// ════════════════════════════════════════════════════════════
// Supabase Edge Function: request-sla-cron
// หน้าที่: เช็คว่ามีคำขอ/ข้อเสนอเปลี่ยน-ยกเลิกคาบ (classroom_requests) ที่ค้างเกิน 48 ชม.
//   ยังไม่ถูกจัดการไหม ถ้ามี → ส่ง LINE เตือนทั้งครูและนักเรียน (ส่งครั้งเดียวต่อรายการ กันสแปมซ้ำ
//   ด้วยคอลัมน์ sla_reminder_sent — รันทุกรอบแต่ยิงแค่ครั้งเดียวจนกว่าจะมีการเปลี่ยนแปลงสถานะใหม่)
//
// 2 เงื่อนไขที่ถือว่า "ค้าง":
//   1) offer_status = 'proposed' และเวลาผ่านจาก offer_created_at เกิน 48 ชม. (รอนักเรียนตอบ)
//   2) offer_status เป็น null (ยังไม่มีข้อเสนอ) และเวลาผ่านจาก created_at เกิน 48 ชม. (รอครูจัดการ)
//
// วิธี deploy:
//   1. supabase functions deploy request-sla-cron
//   2. รัน SQL ตั้ง pg_cron (ดูไฟล์ 2026-07-13_schema_step3_sla_cron.sql ที่แนบแยกให้)
//   3. ต้องมี secret LINE_CHANNEL_ACCESS_TOKEN + LINE_TEACHER_USER_ID ตั้งไว้แล้ว (ใช้ร่วมกับ
//      notify-line / class-reminder-cron เดิม ถ้าตั้งไปแล้วไม่ต้องตั้งซ้ำ)
// ════════════════════════════════════════════════════════════

// deno-lint-ignore-file
// @ts-nocheck

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const LINE_PUSH_URL = 'https://api.line.me/v2/bot/message/push';
const SLA_HOURS = 48;

async function pushLine(channelToken, targetUserId, text) {
  const res = await fetch(LINE_PUSH_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + channelToken },
    body: JSON.stringify({ to: targetUserId, messages: [{ type: 'text', text: String(text).slice(0, 4900) }] }),
  });
  if (!res.ok) throw new Error('LINE API ' + res.status + ': ' + (await res.text()));
}

serve(async (req) => {
  try {
    const channelToken = Deno.env.get('LINE_CHANNEL_ACCESS_TOKEN');
    const teacherUserId = Deno.env.get('LINE_TEACHER_USER_ID');
    if (!channelToken) {
      return new Response(JSON.stringify({ error: 'missing LINE_CHANNEL_ACCESS_TOKEN' }), { status: 500 });
    }

    const supabase = createClient(Deno.env.get('SUPABASE_URL'), Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'));
    const { data: rows, error } = await supabase
      .from('classroom_requests')
      .select('id, token, student_name, request_type, offer_status, offer_created_at, created_at')
      .eq('status', 'pending')
      .eq('sla_reminder_sent', false);

    if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    if (!rows || !rows.length) return new Response(JSON.stringify({ ok: true, checked: 0 }), { status: 200 });

    const nowMs = Date.now();
    let sent = 0, errCount = 0;

    for (const r of rows) {
      let isStale = false, sinceLabel = '';
      if (r.offer_status === 'proposed' && r.offer_created_at) {
        const hrs = (nowMs - new Date(r.offer_created_at).getTime()) / 3600000;
        if (hrs >= SLA_HOURS) { isStale = true; sinceLabel = '提議新時間'; }
      } else if (!r.offer_status) {
        const hrs = (nowMs - new Date(r.created_at).getTime()) / 3600000;
        if (hrs >= SLA_HOURS) { isStale = true; sinceLabel = (r.request_type === 'cancel' ? '取消' : '改期') + '申請'; }
      }
      if (!isStale) continue;

      try {
        if (teacherUserId) {
          await pushLine(channelToken, teacherUserId,
            '⏰ 提醒：' + (r.student_name || '學生') + ' 的「' + sinceLabel + '」已經超過 48 小時還沒處理，記得到網站看一下');
        }
        // ค้นหา line_user_id เองฝั่ง server ด้วย service role (ไม่เชื่อค่าจากที่อื่น)
        const { data: stu } = await supabase.from('classroom_students').select('line_user_id').eq('token', r.token).maybeSingle();
        if (stu && stu.line_user_id) {
          await pushLine(channelToken, stu.line_user_id,
            '⏰ 提醒：你的「' + sinceLabel + '」老師還在處理中，已經超過 48 小時了，若急需請直接用 LINE 聯絡老師');
        }
        await supabase.from('classroom_requests').update({ sla_reminder_sent: true }).eq('id', r.id);
        sent++;
      } catch (e) { errCount++; }
    }

    return new Response(JSON.stringify({ ok: true, checked: rows.length, sent, errors: errCount }), { status: 200 });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e && e.message || e) }), { status: 500 });
  }
});
