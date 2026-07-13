// ════════════════════════════════════════════════════════════
// Supabase Edge Function: class-reminder-cron
// หน้าที่: รันอัตโนมัติทุก ~5 นาที (ผ่าน pg_cron ดูไฟล์ SQL_pg_cron_class-reminder_2026-07-06.sql)
//   1. เช็คตาราง classroom_schedule ว่ามีคาบไหน "ใกล้ถึงเวลาเรียน" (ยังไม่เคยส่งเตือน) → ส่ง LINE เตือนก่อนเรียน
//   2. เช็คว่ามีคาบไหน "เพิ่งจบไป" (ยังไม่เคยส่งขอบคุณ) → ส่ง LINE ขอบคุณหลังเรียน
//   3. ส่งเฉพาะนักเรียนที่ "เชื่อม LINE แล้ว" (มี line_user_id) — คนที่ยังไม่เชื่อมจะไม่ได้รับ (ไม่ error ไม่ค้าง)
//   4. ส่งสำเร็จแล้วทำเครื่องหมาย line_reminder_sent / line_followup_sent = true กันส่งซ้ำ
//
// ⚠️ เรื่องเขตเวลา (สำคัญมาก ต้องยืนยันกับ Lin ก่อนใช้จริง):
//   lesson_date/start_time ใน classroom_schedule เป็นเวลาที่อ่านจาก Google Calendar ผ่านเบราว์เซอร์ของ Lin
//   ตอนนี้ระบบยังไม่ได้บันทึก timezone ไว้ชัดเจน (แค่เก็บเป็น "14:00" เฉยๆ) — ฟังก์ชันนี้จะตีความ
//   เวลาตาม secret CLASS_TIMEZONE (ตั้งค่าไว้ล่วงหน้าเป็น Asia/Bangkok) ถ้า Lin อยู่ไต้หวันเวลาจริง
//   จะต่างจากไทย 1 ชม. → ต้องเช็คแล้วตั้ง secret ให้ตรงก่อนใช้งานจริง ไม่งั้นแจ้งเตือนจะเพี้ยนเวลาไป 1 ชม.
//
// วิธี deploy:
//   1. supabase secrets set CLASS_TIMEZONE=Asia/Bangkok   (หรือ Asia/Taipei ถ้าเวลาที่จริงคือเวลาไต้หวัน — เลือกให้ตรง!)
//   2. supabase functions deploy class-reminder-cron
//   3. ตั้ง pg_cron ให้เรียกทุก 5 นาที (ดู SQL_pg_cron_class-reminder_2026-07-06.sql)
//
// 2026-07-11 แก้: ข้อความเตือนก่อนเข้าเรียนเปลี่ยนเป็น Flex Message มีปุ่มเดียว "進入 Google Meet"
//   (สีทองตามธีมเว็บ) — เอาลิงก์ "查看課表/申請改期" ออกจากข้อความ LINE แล้ว (ย้ายไปเป็นปุ่ม
//   "在 LINE 中開啟" ที่หน้าคาบเรียนต่อไปในเว็บแทน ดู classroom/index.html) → ไม่ต้องตั้ง secret LIFF_ID
//   ให้ฟังก์ชันนี้อีกต่อไป (เอาออกจาก deploy steps แล้ว)
// ════════════════════════════════════════════════════════════

// deno-lint-ignore-file
// @ts-nocheck

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const LINE_PUSH_URL = 'https://api.line.me/v2/bot/message/push';
const REMINDER_BEFORE_MIN = 30; // เตือนล่วงหน้ากี่นาทีก่อนเริ่มเรียน
const FOLLOWUP_AFTER_MIN = 60;  // ถ้าไม่มี end_time ให้สมมติคาบยาวกี่นาที (ไว้คำนวณเวลา "จบแล้ว")
const CATCH_WINDOW_MIN = 20;    // หน้าต่างจับเวลาหลังจุดที่ควรส่ง (กันพลาดถ้า cron รันไม่ตรงเป๊ะ)

async function pushLineMessages(channelToken, targetUserId, messages) {
  const res = await fetch(LINE_PUSH_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + channelToken },
    body: JSON.stringify({ to: targetUserId, messages }),
  });
  if (!res.ok) throw new Error('LINE API ' + res.status + ': ' + (await res.text()));
}

async function pushLine(channelToken, targetUserId, message) {
  return pushLineMessages(channelToken, targetUserId, [{ type: 'text', text: String(message).slice(0, 4900) }]);
}

// 2026-07-11 加：上課前提醒改用 Flex Message，只留一顆按鈕「進入 Google Meet」（金色，跟網站同一套主題色）
// 查看課表／申請改期的入口移到網站「下一堂課」卡片裡的「在 LINE 中開啟」按鈕，這裡不重複放
function buildReminderFlex(timeLabel, meetUrl) {
  return {
    type: 'flex',
    altText: '📢 再過 30 分鐘就要上課囉！',
    contents: {
      type: 'bubble',
      body: {
        type: 'box', layout: 'vertical', spacing: 'md',
        contents: [
          { type: 'text', text: '📢 再過 30 分鐘就要上課囉！', weight: 'bold', size: 'md', wrap: true, color: '#1C1C1C' },
          { type: 'text', text: timeLabel + ' 泰語課\n點下方按鈕直接進入 Google Meet', size: 'sm', color: '#6b6b6b', wrap: true },
        ],
      },
      footer: {
        type: 'box', layout: 'vertical', spacing: 'sm',
        contents: [
          { type: 'button', style: 'primary', height: 'sm', color: '#8B6310',
            action: { type: 'uri', label: '進入 Google Meet', uri: meetUrl } },
        ],
      },
    },
  };
}

// 2026-07-11 加：มีบั๊กที่อื่นในระบบ (ฝั่ง sync ปฏิทิน) ทำให้บางแถวใน classroom_schedule.start_time
// หลุดมาเป็นรูปแบบ "上午10:00" / "下午02:00" (12 ชม. + คำนำหน้าเช้า/บ่าย) แทนที่จะเป็น "10:00" ตรงๆ —
// ยังหาสาเหตุต้นตอไม่เจอ 100% แต่เพื่อความชัวร์ที่สุด (RELIABILITY FIRST) ฟังก์ชันนี้ต้องอ่านได้ทั้ง 2 แบบ
// ไม่งั้นถ้าเจอรูปแบบเก่าอีกจากสาเหตุไหนก็ตาม จะข้ามคาบนั้นไปเงียบๆ ไม่ส่งแจ้งเตือนเลย
function normalizeTimeStr(timeStr) {
  if (!timeStr) return null;
  const m = String(timeStr).trim().match(/^(上午|下午)?\s*(\d{1,2}):(\d{2})/);
  if (!m) return null;
  const period = m[1];
  let hour = parseInt(m[2], 10);
  const min = m[3];
  if (period === '上午' && hour === 12) hour = 0;       // 上午12:00 = เที่ยงคืน
  else if (period === '下午' && hour !== 12) hour += 12; // 下午1:00–11:00 = 13:00–23:00 (下午12:00 = เที่ยง ไม่บวก)
  return String(hour).padStart(2, '0') + ':' + min;
}

// แปลง lesson_date + "HH:MM" ให้เป็นเวลาจริง (UTC) โดยตีความว่า HH:MM คือเวลาท้องถิ่นตาม tz ที่กำหนด
function localToUtcMs(dateStr, rawTimeStr, tz) {
  const timeStr = normalizeTimeStr(rawTimeStr);
  if (!timeStr || !/^\d{1,2}:\d{2}/.test(timeStr)) return null;
  // หา offset ของ timezone นั้น ณ วันที่นี้ (กัน DST เพี้ยน แม้ Asia/Bangkok, Asia/Taipei จะไม่มี DST ก็ตาม เผื่ออนาคตเปลี่ยน tz)
  const probe = new Date(dateStr + 'T' + timeStr + ':00Z');
  const fmt = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'shortOffset' });
  const parts = fmt.formatToParts(probe);
  const offsetPart = parts.find(p => p.type === 'timeZoneName');
  let offsetMin = 0;
  if (offsetPart) {
    const m = offsetPart.value.match(/GMT([+-]\d{1,2})(?::?(\d{2}))?/);
    if (m) offsetMin = (parseInt(m[1], 10) * 60) + (m[1].startsWith('-') ? -1 : 1) * (parseInt(m[2] || '0', 10));
  }
  return new Date(dateStr + 'T' + timeStr + ':00Z').getTime() - offsetMin * 60000;
}

serve(async (req) => {
  try {
    const channelToken = Deno.env.get('LINE_CHANNEL_ACCESS_TOKEN');
    const tz = Deno.env.get('CLASS_TIMEZONE') || 'Asia/Bangkok';
    if (!channelToken) {
      return new Response(JSON.stringify({ error: 'missing LINE_CHANNEL_ACCESS_TOKEN' }), { status: 500 });
    }

    const supabase = createClient(Deno.env.get('SUPABASE_URL'), Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'));
    const nowMs = Date.now();
    const todayIso = new Date(nowMs).toISOString().slice(0, 10);
    const yestIso = new Date(nowMs - 86400000).toISOString().slice(0, 10); // เผื่อคาบดึกข้ามเที่ยงคืน

    const { data: rows, error } = await supabase
      .from('classroom_schedule')
      .select('id, token, lesson_date, start_time, end_time, line_reminder_sent, line_followup_sent')
      .in('lesson_date', [yestIso, todayIso])
      .or('line_reminder_sent.eq.false,line_followup_sent.eq.false');

    if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    if (!rows || !rows.length) return new Response(JSON.stringify({ ok: true, processed: 0 }), { status: 200 });

    // ดึงข้อมูลนักเรียนทั้งหมดมาแมปครั้งเดียว (เร็วกว่าถามทีละคน)
    const tokens = [...new Set(rows.map(r => r.token))];
    const { data: students } = await supabase
      .from('classroom_students')
      .select('token, name, meet, line_user_id')
      .in('token', tokens);
    const studentMap = {};
    (students || []).forEach(s => { studentMap[s.token] = s; });

    // 2026-07-11 加：มีบั๊กอีกจุดในระบบ sync ปฏิทิน (ฝั่งเว็บครู) ทำให้บางทีมีแถวซ้ำหลายอันใน
    // classroom_schedule สำหรับคาบเดียวกันจริง (token+วันที่เดียวกัน) — กำลังตามแก้ต้นตอแยกอยู่
    // แต่ตรงนี้ป้องกันไว้ก่อนไม่ให้นักเรียนโดนส่งแจ้งเตือนคาบเดียวกันซ้ำๆ หลายรอบจากแถวซ้ำพวกนั้น
    // วิธี: จัดกลุ่มตาม token+lesson_date ก่อน ส่งแค่ 1 ครั้งต่อกลุ่ม แล้วมาร์ค "ส่งแล้ว" ทุกแถวในกลุ่มพร้อมกัน
    const groups = {};
    for (const row of rows) {
      const key = row.token + '|' + row.lesson_date;
      (groups[key] = groups[key] || []).push(row);
    }

    let sentCount = 0, skipCount = 0, errCount = 0;

    for (const key in groups) {
      const groupRows = groups[key];
      const s = studentMap[groupRows[0].token];
      if (!s || !s.line_user_id) { skipCount += groupRows.length; continue; } // ยังไม่เชื่อม LINE → ข้าม ไม่ error

      // หาแถวตัวแทนกลุ่ม：แถวแรกที่อ่านเวลาออก (เผื่อในกลุ่มมีทั้งแถวรูปแบบเก่า/ใหม่ปนกัน)
      let repRow = null, startMs = null;
      for (const r of groupRows) {
        const ms = localToUtcMs(r.lesson_date, r.start_time, tz);
        if (ms != null) { repRow = r; startMs = ms; break; }
      }
      if (!repRow) { skipCount += groupRows.length; continue; } // ไม่รู้เวลาแน่ชัดสักแถวเลย → ข้าม กันเตือนผิดเวลา

      const normalizedEndTime = normalizeTimeStr(repRow.end_time);
      const endMs = normalizedEndTime
        ? localToUtcMs(repRow.lesson_date, repRow.end_time, tz)
        : startMs + FOLLOWUP_AFTER_MIN * 60000;

      const idsNeedReminder = groupRows.filter(r => !r.line_reminder_sent).map(r => r.id);
      const idsNeedFollowup = groupRows.filter(r => !r.line_followup_sent).map(r => r.id);

      // 1) เตือนก่อนเรียน：อยู่ในหน้าต่าง [start - 30min, start] และยังไม่เคยส่ง (สักแถวในกลุ่ม)
      if (idsNeedReminder.length) {
        const minutesToStart = (startMs - nowMs) / 60000;
        if (minutesToStart <= REMINDER_BEFORE_MIN && minutesToStart >= -CATCH_WINDOW_MIN) {
          try {
            // ใช้เวลาที่ normalize แล้ว (24 ชม.ล้วน) ตอนโชว์ให้นักเรียนเห็นในข้อความ LINE เสมอ กันโชว์ปนกัน
            const timeLabel = (normalizeTimeStr(repRow.start_time) || repRow.start_time) + (normalizedEndTime ? '–' + normalizedEndTime : '');
            if (s.meet) {
              // 2026-07-11 改：Flex Message + 一顆「進入 Google Meet」按鈕（金色主題）
              await pushLineMessages(channelToken, s.line_user_id, [buildReminderFlex(timeLabel, s.meet)]);
            } else {
              // 還沒有 Meet 連結（老師還沒補上）→ 照舊發純文字，不放按鈕，避免按鈕連到空連結
              await pushLine(channelToken, s.line_user_id,
                '📢 提醒：等一下 ' + timeLabel + ' 有泰語課囉！\n老師還在準備課堂連結，請直接聯絡老師 ✨');
            }
            // มาร์คว่าส่งแล้ว "ทุกแถวในกลุ่ม" กันแถวซ้ำที่เหลือมาส่งซ้ำอีกในรอบถัดไป
            await supabase.from('classroom_schedule').update({ line_reminder_sent: true }).in('id', idsNeedReminder);
            sentCount++;
          } catch (e) { errCount++; }
        }
      }

      // 2) 下課後訊息：過了下課時間，且還沒發過（分組裡任一筆）
      if (idsNeedFollowup.length) {
        const minutesSinceEnd = (nowMs - endMs) / 60000;
        if (minutesSinceEnd >= 0 && minutesSinceEnd <= CATCH_WINDOW_MIN) {
          try {
            await pushLine(channelToken, s.line_user_id,
              '🎉 今天的泰語課辛苦了！\n記得複習與分享學習心得喔😊\n有問題歡迎隨時問老師喔 💬');
            await supabase.from('classroom_schedule').update({ line_followup_sent: true }).in('id', idsNeedFollowup);
            sentCount++;
          } catch (e) { errCount++; }
        }
      }
    }

    return new Response(JSON.stringify({ ok: true, checked: rows.length, sent: sentCount, skipped: skipCount, errors: errCount }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e && e.message || e) }), { status: 500 });
  }
});
