// ════════════════════════════════════════════════════════════
// Supabase Edge Function: class-reminder-cron
// หน้าที่: รันอัตโนมัติทุก ~5 นาที (ผ่าน pg_cron ดูไฟล์ SQL_pg_cron_class-reminder_2026-07-06.sql)
//   0. เช็คตาราง classroom_schedule ว่ามีคาบไหน "อีก 24 ชม.จะถึงเวลาเรียน" (ยังไม่เคยส่งเตือน) → ส่ง LINE เตือนล่วงหน้า
//      (เพิ่ม 2026-07-18 — เตือนแยกอันที่ 2 ไม่ทับของเดิม)
//   1. เช็คตาราง classroom_schedule ว่ามีคาบไหน "ใกล้ถึงเวลาเรียน" (ยังไม่เคยส่งเตือน) → ส่ง LINE เตือนก่อนเรียน (30 นาที)
//   2. เช็คว่ามีคาบไหน "เพิ่งจบไป" (ยังไม่เคยส่งขอบคุณ) → ส่ง LINE ขอบคุณหลังเรียน
//   3. ส่งเฉพาะนักเรียนที่ "เชื่อม LINE แล้ว" (มี line_user_id) — คนที่ยังไม่เชื่อมจะไม่ได้รับ (ไม่ error ไม่ค้าง)
//   4. ส่งสำเร็จแล้วทำเครื่องหมาย line_reminder24h_sent / line_reminder_sent / line_followup_sent = true กันส่งซ้ำ
//      ⚠️ ก่อน deploy ต้องรัน supabase/sql/2026-07-18_reminder24h_column.sql ใน Supabase SQL Editor ก่อน
//      (เพิ่มคอลัมน์ line_reminder24h_sent ให้ตาราง classroom_schedule) ไม่งั้นฟังก์ชันจะ error
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
//
// 🔴 2026-07-26 แก้ความเสี่ยงส่งซ้ำ (Lin เจอ：LINE เตือนก่อน/หลังเข้าเรียน "ส่งซ้ำ 2 ข้อความ")：
//   เช็คแล้ว บั๊กเดิมที่แก้ไป 2026-07-20 (calendar-sync ลบ/เขียนตารางใหม่แล้วรีเซ็ต flag เตือนกลับเป็น
//   false) ยังแก้ถูกอยู่ทั้ง 2 จุด (calendar-schedule-sync-cron + classroom/index.html) ไม่ใช่ต้นตอรอบนี้
//   จุดเสี่ยงที่เจอจริงในโค้ดนี้: เดิมทำเป็น 2 ขั้นแยกกัน "ส่ง LINE ก่อน → มาร์ค flag=true ทีหลัง" —
//   ถ้า cron รอบถัดไปเริ่มทำงานก่อนรอบก่อนหน้ามาร์คเสร็จ (เช่น รอบก่อนช้าเพราะเน็ต/LINE API ตอบช้า)
//   ทั้ง 2 รอบจะเห็น flag=false เหมือนกัน แล้วส่ง LINE ซ้ำกันทั้งคู่ ก่อนฝ่ายไหนจะมาร์คเสร็จด้วยซ้ำ
//   (race condition) — แก้แล้ว: สลับลำดับเป็น "จอง (claim) ก่อนส่ง" ด้วย atomic update (WHERE flag=false)
//   ถ้ารอบไหนจองไม่ติด (อีกรอบจองไปแล้ว) จะข้ามการส่งทันที กันซ้ำได้ชัวร์ไม่ว่า cron จะทับกันกี่รอบ
//   ถ้ายิง LINE แล้วพัง (network/LINE API error) จะคืนค่า flag กลับเป็น false ให้รอบถัดไปลองส่งใหม่ได้
//   (ไม่เสียพฤติกรรม retry-เมื่อพัง ของเดิม) ดูฟังก์ชัน claimReminderIds()/releaseReminderIds() ด้านล่าง
//   ⚠️ อีกจุดที่ Lin ควรเช็คเอง (AI มองไม่เห็นจาก repo): เปิด Supabase → SQL Editor รัน
//   `select jobname, schedule from cron.job where jobname ilike '%reminder%';`
//   ถ้าเจอ class-reminder-cron ซ้ำกันมากกว่า 1 แถว = มีสาเหตุซ้ำอีกจุดที่ต้อง unschedule อันซ้ำทิ้ง
// ════════════════════════════════════════════════════════════

// deno-lint-ignore-file
// @ts-nocheck

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const LINE_PUSH_URL = 'https://api.line.me/v2/bot/message/push';
const REMINDER_BEFORE_MIN = 30; // เตือนล่วงหน้ากี่นาทีก่อนเริ่มเรียน
// 2026-07-18 加：เตือนล่วงหน้า 24 ชม. — เพิ่มเป็น "อันที่ 2" ตามที่ Lin ยืนยัน (ไม่ทับของเดิม 30 นาที)
const REMINDER24H_BEFORE_MIN = 24 * 60;
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

// 2026-07-26 เพิ่ม："จอง" ก่อนส่ง — atomic update (WHERE field=false) ให้ Postgres เป็นคนตัดสินว่า
// ใครจองได้ก่อน ถ้ามี cron 2 รอบทับเวลากันพอดี รอบที่จองไม่ติดจะได้ id คืนมาว่างเปล่า (claimedIds.length===0)
// แล้วรู้ตัวว่าต้องข้ามการส่งไปเลย ไม่ใช่ต่างคนต่างเห็น flag=false แล้วส่งซ้ำกันทั้งคู่
async function claimReminderIds(supabase, fieldName, ids) {
  if (!ids.length) return { claimedIds: [], error: null };
  const { data, error } = await supabase.from('classroom_schedule')
    .update({ [fieldName]: true })
    .in('id', ids)
    .eq(fieldName, false)
    .select('id');
  return { claimedIds: (data || []).map((r) => r.id), error };
}

// 2026-07-26 เพิ่ม：ถ้าจองไปแล้วแต่ยิง LINE ไม่สำเร็จ (network/LINE API พัง) ต้องคืน flag กลับเป็น false
// ไม่งั้นจะเสียพฤติกรรม "รอบหน้าลองส่งใหม่อัตโนมัติ" ของเดิมไป (กลายเป็นไม่ส่งเลยตลอดกาลแทน)
async function releaseReminderIds(supabase, fieldName, ids) {
  if (!ids.length) return;
  const { error } = await supabase.from('classroom_schedule').update({ [fieldName]: false }).in('id', ids);
  if (error) {
    console.error('[class-reminder-cron] คืนค่า ' + fieldName + ' กลับเป็น false ไม่สำเร็จ（รอบหน้าจะไม่ลองส่งซ้ำให้อัตโนมัติ ต้องแก้มือ）：', error.message, 'ids=', ids);
  }
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

// 2026-07-18 加：เตือนล่วงหน้า 24 ชม. — ข้อความคนละแบบกับ 30 นาที (บอกวันที่ด้วย เพราะเตือนข้ามวัน)
// ไม่มีปุ่ม Google Meet (ยังไกลเกินไป ใส่ไปก็ไม่มีประโยชน์ กันกดผิดเวลา) เป็นข้อความล้วนพอ
function buildReminder24hFlex(dateLabel, timeLabel) {
  // 2026-07-18 加（Lin 要求）：แถบแจ้งเตือน (altText) ต้องเห็นเวลาเลยโดยไม่ต้องกดเปิด LINE ก่อน
  const titleText = '📅 明天' + timeLabel + '有泰語課，別忘記囉！';
  return {
    type: 'flex',
    altText: titleText,
    contents: {
      type: 'bubble',
      body: {
        type: 'box', layout: 'vertical', spacing: 'md',
        contents: [
          { type: 'text', text: titleText, weight: 'bold', size: 'md', wrap: true, color: '#1C1C1C' },
          { type: 'text', text: dateLabel + ' ' + timeLabel + '\n記得提前安排時間，準時上線喔 ✨', size: 'sm', color: '#6b6b6b', wrap: true },
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

// 2026-07-14 加：เอาเวลาจริง (UTC ms) มาแปลงเป็น "HH:MM" ตาม timezone ไหนก็ได้ — ใช้ตอนจะโชว์
// เวลาให้นักเรียนเห็นเป็นเวลาของเขาเอง (ไม่ใช่เวลาไทยที่ครูตั้งไว้)
function formatHHMMInTz(utcMs, tz) {
  const fmt = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false });
  return fmt.format(new Date(utcMs));
}

// 2026-07-18 加：ให้ข้อความเตือน 24 ชม. บอก "วัน/เดือน" ด้วย (ไม่ใช่แค่เวลา) เพราะเตือนข้ามวัน
// ต้องแปลงตาม timezone ของนักเรียนเหมือนกัน (วันที่อาจเลื่อน ±1 วันได้ถ้าใกล้เที่ยงคืน)
function formatDateInTz(utcMs, tz) {
  const fmt = new Intl.DateTimeFormat('zh-TW', { timeZone: tz, month: 'numeric', day: 'numeric', weekday: 'short' });
  return fmt.format(new Date(utcMs));
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
    // 2026-07-18 加：ต้องดึง "พรุ่งนี้" ด้วย เพราะเตือน 24 ชม.ก่อน = จุดที่ต้องส่งอยู่ "วันนี้"
    // สำหรับคาบที่เรียน "พรุ่งนี้" (ไม่งั้นแถวของพรุ่งนี้จะไม่ถูกดึงมาเช็คเลย)
    const tomorrowIso = new Date(nowMs + 86400000).toISOString().slice(0, 10);

    const { data: rows, error } = await supabase
      .from('classroom_schedule')
      .select('id, token, lesson_date, start_time, end_time, line_reminder_sent, line_followup_sent, line_reminder24h_sent')
      .in('lesson_date', [yestIso, todayIso, tomorrowIso])
      .or('line_reminder_sent.eq.false,line_followup_sent.eq.false,line_reminder24h_sent.eq.false');

    if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    if (!rows || !rows.length) return new Response(JSON.stringify({ ok: true, processed: 0 }), { status: 200 });

    // ดึงข้อมูลนักเรียนทั้งหมดมาแมปครั้งเดียว (เร็วกว่าถามทีละคน)
    // 2026-07-14 加：เพิ่ม pending_student_tz — ต้องใช้ตอนแจ้งเตือนนักเรียน ให้โชว์เป็นเวลา
    // ของนักเรียนเอง ไม่ใช่เวลาไทยดิบๆ (Lin สั่งว่าแจ้งนักเรียนต้องเป็นเวลานักเรียนเสมอ)
    const tokens = [...new Set(rows.map(r => r.token))];
    const { data: students } = await supabase
      .from('classroom_students')
      .select('token, name, meet, line_user_id, pending_student_tz')
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
      const idsNeedReminder24h = groupRows.filter(r => !r.line_reminder24h_sent).map(r => r.id);

      // 0) เตือนล่วงหน้า 24 ชม.：อยู่ในหน้าต่าง [start - 24hr - CATCH_WINDOW, start - 24hr] และยังไม่เคยส่ง
      // (เพิ่ม 2026-07-18 — เป็น "อันที่ 2" แยกจากเตือน 30 นาทีก่อน ไม่ทับกัน)
      if (idsNeedReminder24h.length) {
        const minutesToStart = (startMs - nowMs) / 60000;
        if (minutesToStart <= REMINDER24H_BEFORE_MIN && minutesToStart >= REMINDER24H_BEFORE_MIN - CATCH_WINDOW_MIN) {
          // 2026-07-26 แก้：จอง (claim) ก่อนส่งเสมอ — กันส่งซ้ำถ้า cron 2 รอบทับเวลากันพอดี (ดูคอมเมนต์บนสุดไฟล์)
          const { claimedIds: claimed24h, error: claimErr0 } = await claimReminderIds(supabase, 'line_reminder24h_sent', idsNeedReminder24h);
          if (claimErr0) {
            console.error('[class-reminder-cron] จองสิทธิ์ส่งเตือน 24 ชม. ไม่สำเร็จ（ข้ามรอบนี้ กันส่งซ้ำ）：', claimErr0.message, 'ids=', idsNeedReminder24h);
            errCount++;
          } else if (claimed24h.length) {
            try {
              const studentTz = s.pending_student_tz;
              const dateLabel = studentTz ? formatDateInTz(startMs, studentTz) : repRow.lesson_date;
              const timeLabel = studentTz
                ? formatHHMMInTz(startMs, studentTz) + (normalizedEndTime ? '–' + formatHHMMInTz(endMs, studentTz) : '')
                : (normalizeTimeStr(repRow.start_time) || repRow.start_time) + (normalizedEndTime ? '–' + normalizedEndTime : '');
              await pushLineMessages(channelToken, s.line_user_id, [buildReminder24hFlex(dateLabel, timeLabel)]);
              sentCount++;
            } catch (e) {
              errCount++;
              console.error('[class-reminder-cron] 發送 24 小時前提醒失敗，ids=' + claimed24h.join(',') + '：', e && e.message ? e.message : e);
              await releaseReminderIds(supabase, 'line_reminder24h_sent', claimed24h); // คืนสิทธิ์ ให้รอบหน้าลองส่งใหม่
            }
          }
          // claimed24h.length === 0 = อีกรอบ (cron ที่ทับเวลากัน) จองไปแล้ว → ข้ามเงียบๆ ไม่ใช่ error
        }
      }

      // 1) เตือนก่อนเรียน：อยู่ในหน้าต่าง [start - 30min, start] และยังไม่เคยส่ง (สักแถวในกลุ่ม)
      if (idsNeedReminder.length) {
        const minutesToStart = (startMs - nowMs) / 60000;
        if (minutesToStart <= REMINDER_BEFORE_MIN && minutesToStart >= -CATCH_WINDOW_MIN) {
          // 2026-07-26 แก้：จอง (claim) ก่อนส่งเสมอ — กันส่งซ้ำถ้า cron 2 รอบทับเวลากันพอดี (ดูคอมเมนต์บนสุดไฟล์)
          const { claimedIds: claimedReminder, error: claimErr } = await claimReminderIds(supabase, 'line_reminder_sent', idsNeedReminder);
          if (claimErr) {
            console.error('[class-reminder-cron] จองสิทธิ์ส่งเตือนก่อนเรียน ไม่สำเร็จ（ข้ามรอบนี้ กันส่งซ้ำ）：', claimErr.message, 'ids=', idsNeedReminder);
            errCount++;
          } else if (claimedReminder.length) {
            try {
              // 2026-07-14 改（Lin 回報學生對時區搞混，要求「一定要用學生自己的時間」）：
              // 原本這裡直接拿老師輸入的泰國時間字串給學生看，完全沒管學生自己的時區。
              // 現在改成：學生填過自己的時區 (pending_student_tz) 就用 startMs/endMs（已經是
              // 絕對時間點了）換算成他自己時區的 HH:MM；沒填過時區的舊資料才退回泰國時間
              // （沒有其他資訊可用，只能這樣，但至少不會是錯的换算）。
              const studentTz = s.pending_student_tz;
              const timeLabel = studentTz
                ? formatHHMMInTz(startMs, studentTz) + (normalizedEndTime ? '–' + formatHHMMInTz(endMs, studentTz) : '')
                : (normalizeTimeStr(repRow.start_time) || repRow.start_time) + (normalizedEndTime ? '–' + normalizedEndTime : '');
              if (s.meet) {
                // 2026-07-11 改：Flex Message + 一顆「進入 Google Meet」按鈕（金色主題）
                await pushLineMessages(channelToken, s.line_user_id, [buildReminderFlex(timeLabel, s.meet)]);
              } else {
                // 還沒有 Meet 連結（老師還沒補上）→ 照舊發純文字，不放按鈕，避免按鈕連到空連結
                await pushLine(channelToken, s.line_user_id,
                  '📢 提醒：等一下 ' + timeLabel + ' 有泰語課囉！\n老師還在準備課堂連結，請直接聯絡老師 ✨');
              }
              sentCount++;
            } catch (e) {
              errCount++;
              console.error('[class-reminder-cron] 發送上課前提醒失敗，ids=' + claimedReminder.join(',') + '：', e && e.message ? e.message : e);
              await releaseReminderIds(supabase, 'line_reminder_sent', claimedReminder); // คืนสิทธิ์ ให้รอบหน้าลองส่งใหม่
            }
          }
          // claimedReminder.length === 0 = อีกรอบ (cron ที่ทับเวลากัน) จองไปแล้ว → ข้ามเงียบๆ ไม่ใช่ error
        }
      }

      // 2) 下課後訊息：過了下課時間，且還沒發過（分組裡任一筆）
      if (idsNeedFollowup.length) {
        const minutesSinceEnd = (nowMs - endMs) / 60000;
        if (minutesSinceEnd >= 0 && minutesSinceEnd <= CATCH_WINDOW_MIN) {
          // 2026-07-26 แก้：จอง (claim) ก่อนส่งเสมอ — กันส่งซ้ำถ้า cron 2 รอบทับเวลากันพอดี (ดูคอมเมนต์บนสุดไฟล์)
          const { claimedIds: claimedFollowup, error: claimErr2 } = await claimReminderIds(supabase, 'line_followup_sent', idsNeedFollowup);
          if (claimErr2) {
            console.error('[class-reminder-cron] จองสิทธิ์ส่งข้อความหลังเรียน ไม่สำเร็จ（ข้ามรอบนี้ กันส่งซ้ำ）：', claimErr2.message, 'ids=', idsNeedFollowup);
            errCount++;
          } else if (claimedFollowup.length) {
            try {
              await pushLine(channelToken, s.line_user_id,
                '🎉 今天的泰語課辛苦了！\n記得複習與分享學習心得喔😊\n有問題歡迎隨時問老師喔 💬');
              sentCount++;
            } catch (e) {
              errCount++;
              console.error('[class-reminder-cron] 發送下課後訊息失敗，ids=' + claimedFollowup.join(',') + '：', e && e.message ? e.message : e);
              await releaseReminderIds(supabase, 'line_followup_sent', claimedFollowup); // คืนสิทธิ์ ให้รอบหน้าลองส่งใหม่
            }
          }
          // claimedFollowup.length === 0 = อีกรอบ (cron ที่ทับเวลากัน) จองไปแล้ว → ข้ามเงียบๆ ไม่ใช่ error
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
