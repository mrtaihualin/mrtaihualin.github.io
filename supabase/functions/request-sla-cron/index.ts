// Classroom add-class SLA reminder source. Pending add_class requests older
// than 48 hours are reminded through the existing student and teacher LINE path.
// Retired cancel/reschedule rows are excluded at the database query.
// Deployment and live cron changes require separate exact Production approval.

// deno-lint-ignore-file
// @ts-nocheck

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const LINE_PUSH_URL = 'https://api.line.me/v2/bot/message/push';
const SLA_HOURS = 48;
const LINE_TIMEOUT_MS = 10000;

async function pushLine(channelToken, targetUserId, text) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), LINE_TIMEOUT_MS);
  try {
    const res = await fetch(LINE_PUSH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + channelToken },
      body: JSON.stringify({ to: targetUserId, messages: [{ type: 'text', text: String(text).slice(0, 4900) }] }),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error('LINE API ' + res.status + ': ' + (await res.text()));
  } finally {
    clearTimeout(timeout);
  }
}

serve(async (req) => {
  try {
    // This endpoint creates a service-role client, so the platform JWT check is
    // not sufficient authorization: any valid user JWT can pass that layer.
    // Reuse the established fail-closed cron secret contract before any read,
    // write or external notification can occur.
    const cronSecret = Deno.env.get('CRON_INTERNAL_SECRET');
    if (!cronSecret || req.headers.get('x-cron-secret') !== cronSecret) {
      return new Response(JSON.stringify({ ok: false, error: 'forbidden' }), {
        status: 403, headers: { 'Content-Type': 'application/json' },
      });
    }

    const channelToken = Deno.env.get('LINE_CHANNEL_ACCESS_TOKEN');
    const teacherUserId = Deno.env.get('LINE_TEACHER_USER_ID');
    if (!channelToken) {
      return new Response(JSON.stringify({ error: 'missing LINE_CHANNEL_ACCESS_TOKEN' }), { status: 500 });
    }
    // 🟠 2026-08-01 เพิ่ม (ตรวจระบบยกเลิก/เพิ่มคาบ ข้อ 6) — ไม่มีรหัส LINE ของครู = หยุดทั้งรอบ
    //   พังยังไงถ้าไม่มีด่านนี้ (ของเดิมเป็นแบบนั้นจริง): ทุกก้อนเขียนว่า `if (teacherUserId) { ส่ง }`
    //   แล้ว **ปั๊ม sla_reminder_sent = true ต่อทันทีไม่ว่าจะส่งหรือไม่ส่ง** + นับว่า sent++
    //   → secret หาย/พิมพ์ผิด = ระบบตอบ {ok:true, sent:5} ทั้งที่ไม่มีข้อความออกไปสักฉบับ
    //     และเพราะปั๊มธงไปแล้ว **คำขอพวกนั้นไม่มีวันถูกเตือนอีกเลย** (ผิดกฎ RELIABILITY FIRST เต็มๆ)
    //   ตอนนี้: ไม่มีรหัสครู = ตอบ 500 ให้เห็นชัดๆ ใน log ไม่แตะฐานข้อมูลเลยสักแถว
    if (!teacherUserId) {
      console.error('[request-sla-cron] 🛑 ไม่มี secret LINE_TEACHER_USER_ID — หยุดทั้งรอบ ไม่ปั๊มธงอะไรทั้งสิ้น (ถ้าปล่อยไป คำขอจะถูกปั๊มว่าเตือนแล้วทั้งที่ไม่ได้ส่ง)');
      return new Response(JSON.stringify({ error: 'missing LINE_TEACHER_USER_ID' }), { status: 500 });
    }

    const supabase = createClient(Deno.env.get('SUPABASE_URL'), Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'));

    // 🟠 2026-08-01 (ตรวจระบบยกเลิก/เพิ่มคาบ ข้อ 6 ต่อ) — เตือนซ้ำได้ทุก 48 ชม.จริงๆ เสียที
    //   คอมเมนต์ในไฟล์นี้เขียนมาตลอดว่า "เตือนทุก 48 ชม." แต่ความจริงคือ **เตือนได้ครั้งเดียวตลอดกาล**
    //   สำหรับคำขอ 取消/加課 ธรรมดา เพราะธง sla_reminder_sent ถูกปั๊มเป็น true แล้วไม่มีใครรีเซ็ตกลับ
    //   (จุดที่รีเซ็ตมีแค่ 2 จุด และเป็นของระบบเลื่อนคาบ/ตอนนักเรียนกดรับทราบการยกเลิกเท่านั้น)
    //   → คำขอที่ Lin พลาดตาไป จะเงียบหายไปเลยหลังเตือนครั้งแรก
    //   ตอนนี้ใช้คอลัมน์เวลา sla_reminder_last_sent_at แทน: ครบ 48 ชม.เมื่อไหร่ เตือนใหม่ได้
    //   ⚠️ ยังไม่ได้รัน supabase/sql/2026-08-01_cancel_add_guards.sql = ไม่มีคอลัมน์นี้
    //      → ถอยกลับไปทำงานแบบเดิมทุกอย่างโดยอัตโนมัติ (ไม่พัง แค่เตือนได้ครั้งเดียวเหมือนก่อน)
    const slaCutoffIso = new Date(Date.now() - SLA_HOURS * 3600000).toISOString();
    // 🗑️ 2026-07-31 (รอบ 4) เอา teacher_add_ack_at ออก — ก้อนที่ใช้มันถูกลบไปแล้ว ไม่มีใครอ่านอีก
    //    (teacher_cancel_ack_at ยังอยู่ ใช้จริงในก้อนยกเลิกคาบด้านล่าง อย่าเผลอลบตาม)
    // 🟡 2026-08-02 เพิ่ม sla_reminder_sent เข้ามาด้วย — ใช้ตัดสิน "เคยเตือนไปแล้วหรือยัง" (ดูตัวแปร isRepeat)
    const BASE_COLS = 'id, token, student_name, request_type, offer_status, created_at, sla_reminder_sent';
    let rows = null, error = null, hasRepeatCol = true;
    {
      const rTry = await supabase.from('classroom_requests')
        .select(BASE_COLS + ', sla_reminder_last_sent_at')
        .eq('status', 'pending').eq('request_type', 'add_class')
        // 🔴 2026-08-02 เพิ่มเงื่อนไขที่ 3 (รอบตรวจ 3 ระบบ ข้อ 4.10)
        //   เดิมมี 2 ข้าง: sent=false  หรือ  last_sent_at < cutoff
        //   → แถวที่ sent=true แต่ last_sent_at ว่าง จะ **ไม่เข้าเงื่อนไขทั้ง 2 ข้าง** (NULL < x = NULL)
        //     = หายจากระบบเตือนตลอดกาล · เกิดได้จริงจาก fallback ของ markReminderSent (ดูข้างล่าง)
        //   เพิ่ม `sla_reminder_last_sent_at.is.null` มาเป็นตาข่ายรับ
        .or('sla_reminder_sent.eq.false,sla_reminder_last_sent_at.is.null,sla_reminder_last_sent_at.lt.' + slaCutoffIso);
      if (rTry.error && (rTry.error.code === '42703' || rTry.error.code === 'PGRST204' || /sla_reminder_last_sent_at/.test(rTry.error.message || ''))) {
        console.warn('[request-sla-cron] ⚠️ ยังไม่มีคอลัมน์ sla_reminder_last_sent_at → ถอยไปใช้ธงเดิม (เตือนได้ครั้งเดียวเหมือนก่อน). '
          + 'รัน supabase/sql/2026-08-01_cancel_add_guards.sql เพื่อเปิดการเตือนซ้ำทุก 48 ชม.');
        hasRepeatCol = false;
        const rOld = await supabase.from('classroom_requests').select(BASE_COLS).eq('status', 'pending').eq('request_type', 'add_class').eq('sla_reminder_sent', false);
        rows = rOld.data; error = rOld.error;
      } else {
        rows = rTry.data; error = rTry.error;
      }
    }

    // ปั๊ม "เตือนแล้วเมื่อไหร่" — มีคอลัมน์เวลาก็ใช้ ไม่มีก็ถอยไปธงเดิม (ไม่พังทั้ง 2 กรณี)
    async function markReminderSent(id) {
      if (hasRepeatCol) {
        const { error: e1 } = await supabase.from('classroom_requests')
          .update({ sla_reminder_sent: true, sla_reminder_last_sent_at: new Date().toISOString() }).eq('id', id);
        if (!e1) return null;
        console.warn('[request-sla-cron] เขียนเวลาเตือนล่าสุดไม่สำเร็จ ถอยไปปั๊มธงเดิม:', e1.message, 'id=', id);
      }
      const { error: e2 } = await supabase.from('classroom_requests').update({ sla_reminder_sent: true }).eq('id', id);
      return e2 || null;
    }

    if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    if (!rows || !rows.length) return new Response(JSON.stringify({ ok: true, checked: 0 }), { status: 200 });

    const nowMs = Date.now();
    let sent = 0, errCount = 0;

    // 🟡 2026-08-01 (ตรวจซ้ำ) — เตือนซ้ำได้ แต่ต้องมีวันจบ
    //   ถ้าปล่อยให้เตือนทุก 48 ชม.ไปเรื่อยๆ ไม่มีที่สิ้นสุด คำขอที่ค้างนานๆ ใบเดียวจะกินโควตา LINE ฟรี
    //   (200 ข้อความ/เดือน) ไปเรื่อยๆ และนักเรียนก็จะโดนทวงซ้ำซากทั้งที่ตัวเองทำอะไรไม่ได้
    //   → เตือนซ้ำได้ภายใน 14 วันแรกนับจากวันที่ส่งคำขอ (สูงสุดราว 7 ครั้ง) หลังจากนั้นเงียบ
    //     ใบที่ค้างเกิน 14 วันคือเรื่องที่ต้องคุยกันตรงๆ แล้ว ไม่ใช่เรื่องที่ตัวเตือนอัตโนมัติช่วยได้
    const REPEAT_MAX_DAYS = 14;
    for (const r of rows) {
      // 🟡 2026-08-02 แก้ (รอบตรวจ 3 ระบบ ข้อ 4.10 ต่อ): เดิมดูแค่ `sla_reminder_last_sent_at`
      //   แถวที่ปั๊มธงสำเร็จแต่เขียนเวลาไม่สำเร็จ (fallback) จะถูกมองว่า "ยังไม่เคยเตือน" ตลอดกาล
      //   → ทวงไม่มีวันจบ เกินกฎ 14 วันไปเรื่อยๆ · ตอนนี้นับ "เคยเตือนแล้ว" จากธงด้วย
      const isRepeat = !!r.sla_reminder_last_sent_at || r.sla_reminder_sent === true;
      if (isRepeat && (nowMs - new Date(r.created_at).getTime()) > REPEAT_MAX_DAYS * 86400000) {
        continue; // เคยเตือนไปแล้ว และเก่าเกิน 14 วัน → หยุดทวง
      }
      // 2026-07-16 加：老師發起的取消，卡在「等學生確認」——這種只提醒老師自己去聯絡學生，
      // 邏輯跟下面「一般情況」不一樣（不用管 offer_status，也不推播給學生），單獨處理完就 continue，
      // 不會掉進下面那段一般邏輯。
      if (!r.offer_status) {
        const hrs = (nowMs - new Date(r.created_at).getTime()) / 3600000;
        if (hrs < SLA_HOURS) continue;
        const sinceLabel = '加課申請';
        try {
          // 🟡 2026-08-01 สลับลำดับ (ตรวจระบบยกเลิก/เพิ่มคาบ ข้อ 6): ส่งหา "นักเรียนก่อน" แล้วค่อยส่งหาครู
          //   เดิมส่งครูก่อน แล้วส่งนักเรียนทีหลัง → ถ้าส่งหานักเรียนพัง จะโดดไป catch
          //   แปลว่าธง "เตือนแล้ว" ไม่เคยถูกปั๊ม → รอบหน้า **ส่งหาครูซ้ำอีก** ทั้งที่ครูได้รับไปแล้ว
          //   สลับลำดับแล้วได้ 2 อย่าง: (1) ไม่ส่งซ้ำหาครู (2) ข้อความของครูบอกได้เลยว่าฝั่งนักเรียนพลาด
          //   ห้ามเงียบ: นักเรียนไม่ได้รับ = ต้องขึ้นในข้อความของครู ไม่ใช่ซ่อนไว้ใน log อย่างเดียว
          let studentWarnSla = '';
          // ค้นหา line_user_id เองฝั่ง server ด้วย service role (ไม่เชื่อค่าจากที่อื่น)
          const { data: stu } = await supabase.from('classroom_students').select('line_user_id').eq('token', r.token).maybeSingle();
          if (stu && stu.line_user_id) {
            try {
              await pushLine(channelToken, stu.line_user_id,
                '⏰ 提醒：你的「' + sinceLabel + '」老師還在處理中，已經超過 48 小時了，若急需請直接用 LINE 聯絡老師');
            } catch (eStu) {
              studentWarnSla = '\n⚠️ 學生那邊沒收到提醒（' + ((eStu && eStu.message) || eStu) + '），記得自己說一聲';
              console.error('[request-sla-cron] เตือนนักเรียนไม่สำเร็จ (ยังเตือนครูต่อ), id=' + r.id + '：', (eStu && eStu.message) || eStu);
            }
          } else {
            studentWarnSla = '\n⚠️ 這位學生還沒連結 LINE，沒收到提醒';
          }
          await pushLine(channelToken, teacherUserId,
            '⏰ 提醒：' + (r.student_name || '學生') + ' 的「' + sinceLabel + '」已經超過 48 小時還沒處理，記得到網站看一下' + studentWarnSla);
          // 2026-07-14 加：เดิมไม่เช็ค error — update ล้มเหลวจะทำให้เตือนซ้ำทุกรอบ cron ไม่มีที่สิ้นสุด
          const markErr = await markReminderSent(r.id);
          if (markErr) { console.error('[request-sla-cron] 標記 sla_reminder_sent 失敗，可能會重複提醒：', markErr.message, 'id=', r.id); errCount++; }
          sent++;
        } catch (e) { errCount++; console.error('[request-sla-cron] 提醒雙方（一般情況）失敗，id=' + r.id + '：', e && e.message ? e.message : e); }
        continue;
      }

      // ══════════════════════════════════════════════════════════════════════
      // 🟡 2026-08-02 เพิ่ม (รอบตรวจ 3 ระบบ ข้อ 4.18) — ทางออกสุดท้ายที่เดิม "เงียบสนิท"
      //
      // แถวที่ตกมาถึงตรงนี้คือแถวที่ไม่มีกิ่งไหนรับเลย เกิดได้จริง 2 แบบ:
      //   (1) offer_status='proposed' แต่ offer_created_at ว่าง   ← เกิดเมื่อการเขียนรอบ 2 ตอนส่งคำขอพังครึ่งทาง
      //   (2) offer_status='accepted' แต่ offer_accepted_at ว่าง
      // ของเดิม loop จบไปเฉยๆ = คำขอนั้นไม่มีใครเตือนอีกเลยตลอดกาล และไม่มีร่องรอยที่ไหน
      // ตอนนี้: เตือนครูโดยใช้ created_at เป็นตัวจับเวลาแทน (ทำได้เสมอ) + เขียน log ให้ตามหาได้
      // ══════════════════════════════════════════════════════════════════════
      const hrsFallback = (nowMs - new Date(r.created_at).getTime()) / 3600000;
      if (hrsFallback < SLA_HOURS) continue;
      console.warn('[request-sla-cron] ⚠️ แถวนี้ไม่เข้ากิ่งไหนเลย (ข้อมูลเวลาไม่ครบ) → เตือนครูด้วย created_at แทน. id=' + r.id
        + ' offer_status=' + (r.offer_status || '(ว่าง)')
        + ' offer_created_at=' + (r.offer_created_at || '(ว่าง)')
        + ' offer_accepted_at=' + (r.offer_accepted_at || '(ว่าง)'));
      try {
        await pushLine(channelToken, teacherUserId,
          '⏰ 提醒：' + (r.student_name || '學生') + ' 的申請已經超過 48 小時還沒處理，記得到網站看一下\n'
          + '（這筆的時間資料不完整，系統沒辦法判斷卡在哪一步，請直接開網站確認）');
        const markErrFb = await markReminderSent(r.id);
        if (markErrFb) { console.error('[request-sla-cron] 標記 sla_reminder_sent 失敗（กิ่งสำรอง）：', markErrFb.message, 'id=', r.id); errCount++; }
        sent++;
      } catch (e) { errCount++; console.error('[request-sla-cron] เตือนครู (กิ่งสำรอง) ไม่สำเร็จ, id=' + r.id + '：', e && e.message ? e.message : e); }
    }

    return new Response(JSON.stringify({ ok: errCount === 0, checked: rows.length, sent, errors: errCount }), {
      status: errCount > 0 ? 500 : 200,
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e && e.message || e) }), { status: 500 });
  }
});
