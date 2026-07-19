// ════════════════════════════════════════════════════════════
// Supabase Edge Function: request-sla-cron
// หน้าที่: เช็คว่ามีคำขอ/ข้อเสนอเปลี่ยน-ยกเลิกคาบ (classroom_requests) ที่ค้างเกิน 48 ชม.
//   ยังไม่ถูกจัดการไหม ถ้ามี → ส่ง LINE เตือนทั้งครูและนักเรียน (ส่งครั้งเดียวต่อรายการ กันสแปมซ้ำ
//   ด้วยคอลัมน์ sla_reminder_sent — รันทุกรอบแต่ยิงแค่ครั้งเดียวจนกว่าจะมีการเปลี่ยนแปลงสถานะใหม่)
//
// 4 เงื่อนไขที่ถือว่า "ค้าง":
//   1) offer_status = 'proposed' และเวลาผ่านจาก offer_created_at เกิน 48 ชม. — ครอบคลุมการเสนอเวลาใหม่
//      ทั้ง 2 ทิศทาง (ครูเสนอให้นักเรียน / นักเรียนเสนอให้ครูเลือกจากสูงสุด 3 ตัวเลือก)
//      2026-07-16 改（Lin 要求）：ไม่ว่าฝ่ายไหนเป็นคนรอ ก็ push **เฉพาะครู** ให้ไปติดต่อนักเรียนเอง
//      ไม่เตือนนักเรียนซ้ำแล้ว (เดิมเตือนทั้งสองฝ่าย)
//   2) offer_status เป็น null (ยังไม่มีข้อเสนอ／ยังไม่มีใครเลือกเวลา) และเวลาผ่านจาก created_at เกิน 48 ชม.
//      (คือ cancel/add_class ที่เพิ่งส่งมา ครูยังไม่เริ่มจัดการ) → ยังคงเตือนทั้งสองฝ่ายเหมือนเดิม
//   3) (2026-07-16 เพิ่ม) request_type='cancel' + initiated_by='teacher' + teacher_cancel_ack_at
//      ยังเป็น null (นักเรียนยังไม่กด "我知道了" ทั้งฝั่ง LINE/เว็บ) เกิน 48 ชม. จาก created_at
//      → เตือน**เฉพาะครู**ให้ไปติดต่อนักเรียนเอง (ไม่เตือนนักเรียนซ้ำ เพราะนักเรียนเป็นฝ่ายที่ยังไม่ตอบอยู่แล้ว)
//   4) (2026-07-16 稽核後เพิ่ม) offer_status = 'accepted' และเวลาผ่านจาก offer_accepted_at เกิน 48 ชม.
//      (นักเรียนตอบรับเวลาใหม่แล้ว แต่ครูยังไม่กด "確認並搬 Calendar") → เตือน**เฉพาะครู**
//      (ต้องมีคอลัมน์ offer_accepted_at ในตาราง classroom_requests ก่อน — ดู SQL migration แนบแยก)
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
      .select('id, token, student_name, request_type, offer_status, offer_created_at, offer_accepted_at, created_at, initiated_by, teacher_cancel_ack_at, teacher_add_ack_at')
      .eq('status', 'pending')
      .eq('sla_reminder_sent', false);

    if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    if (!rows || !rows.length) return new Response(JSON.stringify({ ok: true, checked: 0 }), { status: 200 });

    const nowMs = Date.now();
    let sent = 0, errCount = 0;

    for (const r of rows) {
      // 2026-07-16 加：老師發起的取消，卡在「等學生確認」——這種只提醒老師自己去聯絡學生，
      // 邏輯跟下面「一般情況」不一樣（不用管 offer_status，也不推播給學生），單獨處理完就 continue，
      // 不會掉進下面那段一般邏輯。
      if (r.request_type === 'cancel' && r.initiated_by === 'teacher') {
        if (!r.teacher_cancel_ack_at) {
          // 學生還沒按「我知道了」確認取消通知
          const hrs = (nowMs - new Date(r.created_at).getTime()) / 3600000;
          if (hrs < SLA_HOURS) continue;
          try {
            if (teacherUserId) {
              await pushLine(channelToken, teacherUserId,
                '⏰ 提醒：' + (r.student_name || '學生') + ' 已經超過 48 小時還沒按「我知道了」確認取消通知，建議直接用 LINE 聯絡學生確認');
            }
            const { error: markErr } = await supabase.from('classroom_requests').update({ sla_reminder_sent: true }).eq('id', r.id);
            if (markErr) { console.error('[request-sla-cron] 標記 sla_reminder_sent 失敗，可能會重複提醒：', markErr.message, 'id=', r.id); errCount++; }
            sent++;
          } catch (e) { errCount++; console.error('[request-sla-cron] 提醒老師（等學生確認取消）失敗，id=' + r.id + '：', e && e.message ? e.message : e); }
          continue;
        }
        // 2026-07-19 加（稽核發現，ORANGE#6）：學生已經按「我知道了」了，但老師還沒回網站按
        // 「確認刪除 Calendar」——這種以前完全不會再被提醒（line-webhook 那邊按 ack 時已經把
        // sla_reminder_sent 重設回 false，這裡才會再被抓到），跟 offer_status='accepted' 同一套模式，
        // 用 teacher_cancel_ack_at 當計時起點，每 48 小時提醒一次。
        const hrsAck = (nowMs - new Date(r.teacher_cancel_ack_at).getTime()) / 3600000;
        if (hrsAck < SLA_HOURS) continue;
        try {
          if (teacherUserId) {
            await pushLine(channelToken, teacherUserId,
              '⏰ 提醒：' + (r.student_name || '學生') + ' 已經確認收到取消通知超過 48 小時了，還沒到網站按「確認刪除 Calendar」，記得去處理');
          }
          const { error: markErr } = await supabase.from('classroom_requests').update({ sla_reminder_sent: true }).eq('id', r.id);
          if (markErr) { console.error('[request-sla-cron] 標記 sla_reminder_sent 失敗，可能會重複提醒：', markErr.message, 'id=', r.id); errCount++; }
          sent++;
        } catch (e) { errCount++; console.error('[request-sla-cron] 提醒老師（等確認刪除 Calendar）失敗，id=' + r.id + '：', e && e.message ? e.message : e); }
        continue;
      }

      // 2026-07-19 加（稽核發現，ORANGE#6，加課版本）：以前完全沒有這個分支——老師自己發起加課
      // （initiated_by='teacher'）本來會掉進最下面「一般情況」分支，一起提醒老師+學生，但那個分支的
      // 文字/邏輯是給學生自己送出的申請設計的，跟取消的模式不一致。這裡跟 cancel 分支用同一套：
      // 先看學生是否已按「我知道了」，沒有就提醒老師去催學生；已經按了就改成提醒老師去網站按「確認新增」。
      if (r.request_type === 'add_class' && r.initiated_by === 'teacher') {
        if (!r.teacher_add_ack_at) {
          const hrs = (nowMs - new Date(r.created_at).getTime()) / 3600000;
          if (hrs < SLA_HOURS) continue;
          try {
            if (teacherUserId) {
              await pushLine(channelToken, teacherUserId,
                '⏰ 提醒：' + (r.student_name || '學生') + ' 已經超過 48 小時還沒按「我知道了」確認加課通知，建議直接用 LINE 聯絡學生確認');
            }
            const { error: markErr } = await supabase.from('classroom_requests').update({ sla_reminder_sent: true }).eq('id', r.id);
            if (markErr) { console.error('[request-sla-cron] 標記 sla_reminder_sent 失敗，可能會重複提醒：', markErr.message, 'id=', r.id); errCount++; }
            sent++;
          } catch (e) { errCount++; console.error('[request-sla-cron] 提醒老師（等學生確認加課）失敗，id=' + r.id + '：', e && e.message ? e.message : e); }
          continue;
        }
        const hrsAckAdd = (nowMs - new Date(r.teacher_add_ack_at).getTime()) / 3600000;
        if (hrsAckAdd < SLA_HOURS) continue;
        try {
          if (teacherUserId) {
            await pushLine(channelToken, teacherUserId,
              '⏰ 提醒：' + (r.student_name || '學生') + ' 已經確認收到加課通知超過 48 小時了，還沒到網站按「確認新增 Calendar」，記得去處理');
          }
          const { error: markErr } = await supabase.from('classroom_requests').update({ sla_reminder_sent: true }).eq('id', r.id);
          if (markErr) { console.error('[request-sla-cron] 標記 sla_reminder_sent 失敗，可能會重複提醒：', markErr.message, 'id=', r.id); errCount++; }
          sent++;
        } catch (e) { errCount++; console.error('[request-sla-cron] 提醒老師（等確認新增 Calendar）失敗，id=' + r.id + '：', e && e.message ? e.message : e); }
        continue;
      }

      // 2026-07-16 改（Lin 要求：「等對方回覆」的情況一律只提醒老師去聯絡學生，不用再提醒學生了——
      // 不管本來是誰在等誰回覆，最後都是老師要主動處理）：offer_status='proposed' 現在涵蓋改期的
      // 兩種發起方向（老師提議給學生 / 學生自己申請給老師挑），統一只 push 給老師。
      if (r.offer_status === 'proposed' && r.offer_created_at) {
        const hrs = (nowMs - new Date(r.offer_created_at).getTime()) / 3600000;
        if (hrs < SLA_HOURS) continue;
        try {
          if (teacherUserId) {
            await pushLine(channelToken, teacherUserId,
              '⏰ 提醒：' + (r.student_name || '學生') + ' 的改期提議已經超過 48 小時沒有回覆，建議直接聯絡學生確認');
          }
          const { error: markErr } = await supabase.from('classroom_requests').update({ sla_reminder_sent: true }).eq('id', r.id);
          if (markErr) { console.error('[request-sla-cron] 標記 sla_reminder_sent 失敗，可能會重複提醒：', markErr.message, 'id=', r.id); errCount++; }
          sent++;
        } catch (e) { errCount++; console.error('[request-sla-cron] 提醒老師（等改期提議回覆）失敗，id=' + r.id + '：', e && e.message ? e.message : e); }
        continue;
      }

      // 2026-07-16 加（稽核發現，ORANGE#4）：學生已經接受提議、正在等老師開電腦按「確認並搬 Calendar」
      // ——之前完全沒有這個分支，如果老師忘記打開網站，這筆會永遠沒有任何提醒。
      if (r.offer_status === 'accepted' && r.offer_accepted_at) {
        const hrs = (nowMs - new Date(r.offer_accepted_at).getTime()) / 3600000;
        if (hrs < SLA_HOURS) continue;
        try {
          if (teacherUserId) {
            await pushLine(channelToken, teacherUserId,
              '⏰ 提醒：' + (r.student_name || '學生') + ' 已經接受新時間超過 48 小時了，還沒到網站按「確認並搬 Calendar」，記得去處理');
          }
          const { error: markErr } = await supabase.from('classroom_requests').update({ sla_reminder_sent: true }).eq('id', r.id);
          if (markErr) { console.error('[request-sla-cron] 標記 sla_reminder_sent 失敗，可能會重複提醒：', markErr.message, 'id=', r.id); errCount++; }
          sent++;
        } catch (e) { errCount++; console.error('[request-sla-cron] 提醒老師（等確認並搬 Calendar）失敗，id=' + r.id + '：', e && e.message ? e.message : e); }
        continue;
      }

      // 2026-07-19 加（稽核發現，ORANGE#7）：學生回覆「這些時間都不方便」（decline_offer）之後，
      // 以前每個檢查條件都要求 offer_status IN ('proposed','accepted') 或 IS NULL，declined 完全沒有
      // 對應的分支——decline 那一刻雖然會 push 一次通知老師（見 line-webhook），但如果老師錯過那則
      // 訊息，這筆申請就會永遠卡住、沒有人再提醒。用 offer_accepted_at 不適用（declined 不會設這個
      // 欄位），改用 created_at 當計時起點，每 48 小時提醒一次。
      if (r.offer_status === 'declined') {
        const hrsDeclined = (nowMs - new Date(r.created_at).getTime()) / 3600000;
        if (hrsDeclined < SLA_HOURS) continue;
        try {
          if (teacherUserId) {
            await pushLine(channelToken, teacherUserId,
              '⏰ 提醒：' + (r.student_name || '學生') + ' 說提議的時間都不方便，已經超過 48 小時了，記得直接聯絡學生討論新時間');
          }
          const { error: markErr } = await supabase.from('classroom_requests').update({ sla_reminder_sent: true }).eq('id', r.id);
          if (markErr) { console.error('[request-sla-cron] 標記 sla_reminder_sent 失敗，可能會重複提醒：', markErr.message, 'id=', r.id); errCount++; }
          sent++;
        } catch (e) { errCount++; console.error('[request-sla-cron] 提醒老師（學生已拒絕提議）失敗，id=' + r.id + '：', e && e.message ? e.message : e); }
        continue;
      }

      // 一般情況（cancel/add_class 剛送出、老師還沒開始處理，offer_status 還是空的）——維持原本
      // 「提醒雙方」的做法不變，這個分支跟改期的提議機制無關。
      if (!r.offer_status) {
        const hrs = (nowMs - new Date(r.created_at).getTime()) / 3600000;
        if (hrs < SLA_HOURS) continue;
        const sinceLabel = (r.request_type === 'cancel' ? '取消' : '改期') + '申請';
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
          // 2026-07-14 加：เดิมไม่เช็ค error — update ล้มเหลวจะทำให้เตือนซ้ำทุกรอบ cron ไม่มีที่สิ้นสุด
          const { error: markErr } = await supabase.from('classroom_requests').update({ sla_reminder_sent: true }).eq('id', r.id);
          if (markErr) { console.error('[request-sla-cron] 標記 sla_reminder_sent 失敗，可能會重複提醒：', markErr.message, 'id=', r.id); errCount++; }
          sent++;
        } catch (e) { errCount++; console.error('[request-sla-cron] 提醒雙方（一般情況）失敗，id=' + r.id + '：', e && e.message ? e.message : e); }
      }
    }

    return new Response(JSON.stringify({ ok: true, checked: rows.length, sent, errors: errCount }), { status: 200 });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e && e.message || e) }), { status: 500 });
  }
});
