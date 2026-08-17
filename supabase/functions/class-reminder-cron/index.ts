// ════════════════════════════════════════════════════════════
// Supabase Edge Function: class-reminder-cron
// หน้าที่: รันอัตโนมัติทุก ~5 นาที (ผ่าน pg_cron ดูไฟล์ SQL_pg_cron_class-reminder_2026-07-06.sql)
//   0. เช็คตาราง classroom_schedule ว่ามีคาบไหน "อีก 24 ชม.จะถึงเวลาเรียน" (ยังไม่เคยส่งเตือน) → ส่ง LINE เตือนล่วงหน้า
//   1. ส่งเฉพาะนักเรียนที่ "เชื่อม LINE แล้ว" (มี line_user_id) — คนที่ยังไม่เชื่อมจะไม่ได้รับ (ไม่ error ไม่ค้าง)
//   2. ส่งสำเร็จแล้วทำเครื่องหมาย line_reminder24h_sent = true กันส่งซ้ำ
//      ⚠️ ก่อน deploy ต้องรัน supabase/sql/2026-07-18_reminder24h_column.sql ใน Supabase SQL Editor ก่อน
//      (เพิ่มคอลัมน์ line_reminder24h_sent ให้ตาราง classroom_schedule) ไม่งั้นฟังก์ชันจะ error
//
// 🔴 2026-07-31 แก้ตามที่ Lin สั่ง: เอาเตือนก่อนเรียน 30 นาที + ข้อความขอบคุณหลังเรียนออกทั้งคู่
//   (กินโควตา LINE push ฟรี 200 ครั้ง/เดือนเกินไป — เหลือแค่เตือนล่วงหน้า 24 ชม. อันเดียว)
//   คอลัมน์ line_reminder_sent / line_followup_sent ในตาราง classroom_schedule ยังอยู่ในฐานข้อมูล
//   (ไม่ได้ลบคอลัมน์ทิ้ง) แค่โค้ดนี้เลิกอ่าน/เขียนแล้ว ไม่กระทบอะไร
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
const REMINDER24H_BEFORE_MIN = 24 * 60;
const LINE_TIMEOUT_MS = 10000;
const FOLLOWUP_AFTER_MIN = 60;  // ถ้าไม่มี end_time ให้สมมติคาบยาวกี่นาที (ใช้คำนวณเวลาจบ สำหรับโชว์ในข้อความเตือน 24 ชม.)
// 🟠 2026-08-01 แก้ (ตรวจระบบยกเลิก/เพิ่มคาบ ข้อ 11): เดิมตั้งไว้ 20 นาที = "เท่ากับรอบ cron ซิงค์ปฏิทิน
//   (ทุก 20 นาที) พอดีเป๊ะ ไม่เหลือที่เผื่อเลยสักนาที" → คาบทุกสัปดาห์ที่เพิ่งเพิ่ม จะมีแถวใน
//   classroom_schedule ก็ต่อเมื่อ cron ซิงค์รันแล้ว ถ้ารอบนั้นพลาดไปรอบเดียว (token Google หมดอายุ /
//   Google ตอบช้า / ด่านกันคาบหายผิดปกติทำงาน) จุดที่ควรส่งจะผ่านไปแล้ว = เตือนหายเงียบๆ ตลอดกาล
//   ขยายเป็น 90 นาที: หน้าต่างคือ [เริ่ม-24ชม.-90นาที, เริ่ม-24ชม.] → **ยิงเร็วขึ้นไม่ได้เลย**
//   (ยังยิงที่จุด 24 ชม.พอดีเหมือนเดิม เพราะ cron รันทุก 5 นาที) แค่ "ยอมยิงช้าได้นานขึ้น" เท่านั้น
const CATCH_WINDOW_MIN = 90;    // หน้าต่างจับเวลาหลังจุดที่ควรส่ง (กันพลาดถ้า cron รันไม่ตรงเป๊ะ)

async function pushLineMessages(channelToken, targetUserId, messages) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), LINE_TIMEOUT_MS);
  try {
    const res = await fetch(LINE_PUSH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + channelToken },
      body: JSON.stringify({ to: targetUserId, messages }),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error('LINE API ' + res.status + ': ' + (await res.text()));
  } finally {
    clearTimeout(timeout);
  }
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

// 2026-07-18 加：เตือนล่วงหน้า 24 ชม. (บอกวันที่ด้วย เพราะเตือนข้ามวัน)
// ไม่มีปุ่ม Google Meet (ยังไกลเกินไป ใส่ไปก็ไม่มีประโยชน์ กันกดผิดเวลา) เป็นข้อความล้วนพอ
//
// 🔴 2026-08-01 แก้ (ตรวจระบบยกเลิก/เพิ่มคาบ ข้อ 1 · Lin เลือกแบบ "1 ข้อความ รวมทุกคาบ"):
//   เดิมรับค่าเป็นเวลาคาบเดียว (dateLabel, timeLabel) — พอนักเรียนมี 2 คาบในวันเดียว (ซึ่งเกิดจาก
//   ระบบเพิ่มคาบโดยตรง) ข้อความจะมีแต่คาบแรก แต่ระบบปั๊มว่า "ส่งแล้ว" ให้ทุกคาบของวันนั้น
//   → คาบที่ 2 ไม่มีวันได้รับเตือนอีกเลย = นักเรียนขาดเรียนโดยไม่มีใครรู้
//   ตอนนี้รับเป็น "รายการคาบ" [{dateLabel, timeLabel}, ...] แล้วเขียนครบทุกคาบในข้อความเดียว
//   ⚠️ กรณีมีคาบเดียว (เกือบทุกครั้ง) ข้อความออกมา "เหมือนเดิมทุกตัวอักษร" — ตั้งใจไม่แตะของที่ใช้ได้ดีอยู่แล้ว
// 🔴 2026-08-02 เพิ่มช่องรับค่าที่ 2 `isLate` (รอบตรวจ 3 ระบบ ข้อ 4.11)
//   ไม่ใส่ = พฤติกรรมเดิมทุกตัวอักษร (ข้อความ「明天…」เหมือนเดิมเป๊ะ ไม่แตะของที่ใช้ได้ดีอยู่แล้ว)
//   ใส่ true = คาบนี้เพิ่งถูกย้าย/เพิ่งถูกเพิ่ม เหลือเวลาน้อยกว่า 22.5 ชม.แล้ว → ห้ามเขียนว่า「明天」
//   เพราะคาบอาจเป็น "วันนี้" ก็ได้ นักเรียนอ่านแล้วจะเข้าใจผิดวันทันที
function buildReminder24hFlex(entries, isLate) {
  const list = Array.isArray(entries) ? entries : [entries];
  if (isLate) {
    const lines = list.map(function (e) { return '・' + e.dateLabel + ' ' + e.timeLabel; }).join('\n');
    const alt = list.length === 1
      ? '📅 快上課囉！' + list[0].dateLabel + ' ' + list[0].timeLabel + ' 有泰語課'
      : '📅 快上課囉！接下來有 ' + list.length + ' 堂泰語課';
    return {
      type: 'flex',
      altText: alt.slice(0, 380),
      contents: {
        type: 'bubble',
        body: {
          type: 'box', layout: 'vertical', spacing: 'md',
          contents: [
            { type: 'text', text: '📅 快上課囉，別忘記！', weight: 'bold', size: 'md', wrap: true, color: '#1C1C1C' },
            { type: 'text', text: lines + '\n（這堂課是最近才排定／調整的，所以現在才通知你）', size: 'sm', color: '#6b6b6b', wrap: true },
          ],
        },
      },
    };
  }
  // วันของนักเรียนอาจไม่ตรงกันได้ ถ้าคาบดึกข้ามเที่ยงคืนในเขตเวลาของนักเรียน (เช่น ไทย 23:30 = ไต้หวัน 00:30 วันถัดไป)
  // → เหมือนกันหมด = เขียนวันครั้งเดียว · ไม่เหมือน = เขียนวันกำกับทุกบรรทัด
  const oneDate = list.every(function (e) { return e.dateLabel === list[0].dateLabel; });

  let altTitle, bodyTitle, detailText;
  if (list.length === 1) {
    altTitle = bodyTitle = '📅 明天' + list[0].timeLabel + '有泰語課，別忘記囉！';
    detailText = list[0].dateLabel + ' ' + list[0].timeLabel + '\n記得提前安排時間，準時上線喔 ✨';
  } else {
    altTitle = '📅 明天有 ' + list.length + ' 堂泰語課：' + list.map(function (e) { return e.timeLabel; }).join('、') + '，別忘記囉！';
    bodyTitle = '📅 明天有 ' + list.length + ' 堂泰語課，別忘記囉！';
    const lines = list.map(function (e) { return '・' + (oneDate ? '' : e.dateLabel + ' ') + e.timeLabel; }).join('\n');
    detailText = (oneDate ? list[0].dateLabel + '\n' : '') + lines + '\n記得提前安排時間，準時上線喔 ✨';
  }
  return {
    type: 'flex',
    // LINE จำกัด altText ไว้ 400 ตัวอักษร — คาบเยอะผิดปกติต้องไม่ทำให้ทั้งข้อความยิงไม่ออก
    altText: altTitle.slice(0, 380),
    contents: {
      type: 'bubble',
      body: {
        type: 'box', layout: 'vertical', spacing: 'md',
        contents: [
          { type: 'text', text: bodyTitle, weight: 'bold', size: 'md', wrap: true, color: '#1C1C1C' },
          { type: 'text', text: detailText, size: 'sm', color: '#6b6b6b', wrap: true },
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
    // 🟠 2026-08-01 เพิ่ม (ตรวจระบบยกเลิก/เพิ่มคาบ ข้อ 12 — คาบเช้ามากไม่เคยได้รับเตือนเลย):
    //   3 วันข้างบนคำนวณจาก **เวลา UTC** แต่ lesson_date ในตารางเป็น **วันตามเวลาไทย** (เร็วกว่า UTC 7 ชม.)
    //   → ตอนที่ควรส่ง (24 ชม.ก่อนคาบ) ถ้าตกช่วงตี 0 ถึง 07:00 เวลาไทย ฝั่ง UTC ยังเป็นเมื่อวานอยู่
    //     ทำให้ tomorrowIso คลาดไป 1 วัน = **แถวของคาบนั้นไม่เคยถูกดึงมาเช็คเลยสักรอบ** เตือนไม่เคยออก
    //   วิธีแก้ที่ปลอดภัยที่สุด: ไม่ไปยุ่งกับสูตรคำนวณเวลาเดิม (เสี่ยงพังของที่ใช้ได้อยู่) แค่ **ดึงเพิ่มอีก 1 วัน**
    //     ดึงกว้างขึ้นเฉยๆ ไม่ทำให้ส่งเร็วขึ้น/ส่งเกิน เพราะด่านตัดสินใจส่งจริงคือหน้าต่างเวลาข้างล่าง
    const dayAfterTomorrowIso = new Date(nowMs + 2 * 86400000).toISOString().slice(0, 10);

    const { data: rows, error } = await supabase
      .from('classroom_schedule')
      .select('id, token, lesson_date, start_time, end_time, line_reminder24h_sent')
      .in('lesson_date', [yestIso, todayIso, tomorrowIso, dayAfterTomorrowIso])
      .eq('line_reminder24h_sent', false);

    if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500 });
    if (!rows || !rows.length) return new Response(JSON.stringify({ ok: true, processed: 0 }), { status: 200 });

    // ดึงข้อมูลนักเรียนทั้งหมดมาแมปครั้งเดียว (เร็วกว่าถามทีละคน)
    // 2026-07-14 加：เพิ่ม pending_student_tz — ต้องใช้ตอนแจ้งเตือนนักเรียน ให้โชว์เป็นเวลา
    // ของนักเรียนเอง ไม่ใช่เวลาไทยดิบๆ (Lin สั่งว่าแจ้งนักเรียนต้องเป็นเวลานักเรียนเสมอ)
    const tokens = [...new Set(rows.map(r => r.token))];
    const { data: students, error: studentsError } = await supabase
      .from('classroom_students')
      .select('token, name, meet, line_user_id, pending_student_tz')
      .in('token', tokens);
    if (studentsError) {
      return new Response(JSON.stringify({ ok: false, error: 'student query failed' }), {
        status: 500, headers: { 'Content-Type': 'application/json' },
      });
    }
    const studentMap = {};
    (students || []).forEach(s => { studentMap[s.token] = s; });

    // 2026-07-11 加：มีบั๊กอีกจุดในระบบ sync ปฏิทิน (ฝั่งเว็บครู) ทำให้บางทีมีแถวซ้ำหลายอันใน
    // classroom_schedule สำหรับคาบเดียวกันจริง (token+วันที่เดียวกัน) — กำลังตามแก้ต้นตอแยกอยู่
    // แต่ตรงนี้ป้องกันไว้ก่อนไม่ให้นักเรียนโดนส่งแจ้งเตือนคาบเดียวกันซ้ำๆ หลายรอบจากแถวซ้ำพวกนั้น
    // วิธี: จัดกลุ่มตาม token+lesson_date ก่อน ส่งแค่ 1 ครั้งต่อกลุ่ม แล้วมาร์ค "ส่งแล้ว" ทุกแถวในกลุ่มพร้อมกัน
    //
    // 🔴 2026-08-01 แก้ (ตรวจระบบยกเลิก/เพิ่มคาบ ข้อ 1) — จุดพังจริงของวิธีเดิม:
    //   วิธีเดิมเหมารวมว่า "token+วันที่เดียวกัน = คาบเดียวกัน" ซึ่งจริงเฉพาะตอนเป็นแถวซ้ำ
    //   แต่ **นักเรียนมี 2 คาบคนละเวลาในวันเดียวกันได้จริง** (ระบบเพิ่มคาบสร้างเคสนี้โดยตรง)
    //   → เดิมหยิบแถวแรกมาเป็นตัวแทน ส่งข้อความที่มีแต่เวลาแถวนั้น แล้วปั๊ม "ส่งแล้ว" ให้ทุกแถว
    //     = คาบที่ 2 ไม่มีวันได้รับเตือนอีกเลยตลอดกาล นักเรียนขาดเรียนโดยไม่มีใครรู้
    //   ตอนนี้: ยังจัดกลุ่มตาม token+วันที่เหมือนเดิม (ยังส่งวันละ 1 ข้อความตามที่ Lin เลือก) แต่ข้างในกลุ่ม
    //     แยกเป็น "คาบ" ตามเวลาเริ่ม — เวลาเริ่มซ้ำกัน = แถวซ้ำ ยุบเป็นคาบเดียว (กันซ้ำได้เหมือนเดิมทุกอย่าง)
    //     เวลาเริ่มต่างกัน = คนละคาบ ต้องขึ้นในข้อความให้ครบทุกคาบ
    const groups = {};
    for (const row of rows) {
      const key = row.token + '|' + row.lesson_date;
      (groups[key] = groups[key] || []).push(row);
    }

    let sentCount = 0, skipCount = 0, errCount = 0;

    for (const key in groups) {
      const groupRows = groups[key];
      const s = studentMap[groupRows[0].token];
      // 🟡 2026-08-02 เพิ่ม log (รอบตรวจ 3 ระบบ Q2) — เดิมข้ามเงียบสนิท ไม่มีร่องรอยที่ไหนเลย
      //   ครูไม่มีทางรู้ว่านักเรียนคนนี้ไม่เคยได้รับข้อความเตือนสักครั้ง
      //   (ตัวเตือน 48 ชม. request-sla-cron บอกครูในเคสเดียวกัน — ที่นี่ไม่เคยบอก)
      //   ไม่ push LINE หาครูตรงนี้ เพราะ cron ตัวนี้รันทุก 5 นาที = จะกลายเป็นสแปมทันที
      if (!s || !s.line_user_id) {
        console.warn('[class-reminder-cron] ℹ️ ข้ามกลุ่ม ' + key + ' — นักเรียนยังไม่ได้ผูก LINE จึงไม่ได้รับข้อความเตือน '
          + '(token=' + (groupRows[0] && groupRows[0].token) + ', ' + groupRows.length + ' แถว)');
        skipCount += groupRows.length;
        continue;
      }

      // แยกแถวในกลุ่มออกเป็น "คาบ" ตามเวลาเริ่ม：เวลาเริ่มเท่ากัน = แถวซ้ำ ยุบเป็นคาบเดียว (id เก็บไว้ทุกอัน
      // เพื่อปั๊ม "ส่งแล้ว" ให้ครบ) · เวลาเริ่มต่างกัน = คนละคาบจริง ต้องขึ้นในข้อความแยกบรรทัด
      const classMap = {};
      let unreadableCount = 0;
      for (const r of groupRows) {
        const startMsOne = localToUtcMs(r.lesson_date, r.start_time, tz);
        const startKey = normalizeTimeStr(r.start_time);
        // อ่านเวลาไม่ออก = ไม่แตะแถวนี้เลย (ไม่ส่ง ไม่ปั๊มว่าส่งแล้ว) กันเตือนผิดเวลา
        // 🟠 เดิมพฤติกรรมคือ "ทั้งกลุ่มมีแถวอ่านออกสักแถวก็พอ แล้วปั๊มทุกแถวรวมแถวที่อ่านไม่ออกด้วย"
        //    ซึ่งทำให้แถวเสียถูกกลบหายไปเงียบๆ — ตอนนี้ข้ามเฉพาะแถวเสีย แถวดีทำงานต่อได้ปกติ
        if (startMsOne == null || !startKey) { unreadableCount++; continue; }
        if (!classMap[startKey]) {
          const endTimeOne = normalizeTimeStr(r.end_time);
          classMap[startKey] = {
            ids: [],
            startMs: startMsOne,
            endMs: endTimeOne ? localToUtcMs(r.lesson_date, r.end_time, tz) : startMsOne + FOLLOWUP_AFTER_MIN * 60000,
            startLabelRaw: startKey,
            endLabelRaw: endTimeOne,
          };
        }
        classMap[startKey].ids.push(r.id);
      }
      if (unreadableCount) {
        console.warn('[class-reminder-cron] กลุ่ม ' + key + ' มีแถวที่อ่านเวลาไม่ออก ' + unreadableCount + ' แถว → ข้ามเฉพาะแถวนั้น ไม่ปั๊มว่าส่งแล้ว (รอบหน้าจะเจออีก จนกว่าจะแก้ข้อมูล)');
        skipCount += unreadableCount;
      }
      const classes = Object.keys(classMap).map(function (k) { return classMap[k]; }).sort(function (a, b) { return a.startMs - b.startMs; });
      if (!classes.length) continue; // ไม่รู้เวลาแน่ชัดสักคาบเลย → ข้าม (นับ skip ไปแล้วข้างบน)

      // เตือนล่วงหน้า 24 ชม.：ยิงเมื่อ "คาบไหนก็ได้ในกลุ่มนี้" เข้าหน้าต่าง [start-24ชม.-CATCH_WINDOW, start-24ชม.]
      // (เพิ่ม 2026-07-18 · 2026-07-31 เหลือเตือนอันนี้อันเดียว — 30 นาที + หลังเรียนถูกเอาออกแล้ว)
      // 🔴 2026-08-01：ต้องเช็ค "ทุกคาบ" ไม่ใช่แค่คาบแรก — ถ้าเช็คแค่คาบแรก คาบบ่ายที่เพิ่มเข้ามาทีหลัง
      //    (ตอนที่หน้าต่างของคาบเช้าผ่านไปแล้ว) จะไม่มีวันถูกยิงเลย
      const anyInWindow = classes.some(function (c) {
        const minutesToStart = (c.startMs - nowMs) / 60000;
        return minutesToStart <= REMINDER24H_BEFORE_MIN && minutesToStart >= REMINDER24H_BEFORE_MIN - CATCH_WINDOW_MIN;
      });
      // ════════════════════════════════════════════════════════════════════
      // 🔴 2026-08-02 เพิ่ม (รอบตรวจ 3 ระบบ ข้อ 4.11) — คาบที่ "เกิดขึ้นกระชั้นกว่า 22.5 ชม."
      //
      // 🕳️ รูเดิม: หน้าต่างส่งคือ "เหลือ 1350–1440 นาที" เท่านั้น
      //    คาบที่ถูก **ย้าย** หรือ **เพิ่มใหม่** ให้เหลือน้อยกว่า 22.5 ชม. จะไม่มีวันเข้าหน้าต่างนี้เลย
      //    → ธงถูกรีเซ็ตเป็น false แล้วก็จริง แต่แถวนั้นถูกดึงมาเช็คทุก 5 นาทีแล้วไม่ทำอะไรตลอดไป
      //    = **นักเรียนไม่ได้รับข้อความเตือนเลย และไม่มีใครถูกบอกว่าไม่ได้รับ**
      //    เกิดได้ทุกครั้งที่ครูย้ายคาบมาใกล้ๆ หรือเพิ่มคาบให้วันนี้/พรุ่งนี้ตอนเย็น
      //
      // ✅ ทางแก้: ถ้าคาบยัง "ไม่เริ่ม" แต่เลยหน้าต่าง 24 ชม.ไปแล้ว → ส่งทันทีครั้งเดียว
      //    ใช้ธงตัวเดียวกัน (line_reminder24h_sent) และท่าจอง (claim) ชุดเดียวกัน = ไม่มีทางส่งซ้ำ
      //    ⚠️ ไม่ส่งถ้าคาบเริ่มไปแล้ว (minutesToStart <= 0) — เตือนคาบที่ผ่านไปแล้วไม่มีประโยชน์ กวนเปล่าๆ
      // ════════════════════════════════════════════════════════════════════
      const anyLate = !anyInWindow && classes.some(function (c) {
        const minutesToStart = (c.startMs - nowMs) / 60000;
        return minutesToStart > 0 && minutesToStart < REMINDER24H_BEFORE_MIN - CATCH_WINDOW_MIN;
      });
      if (anyLate) {
        console.log('[class-reminder-cron] ℹ️ กลุ่ม ' + key + ' เลยหน้าต่าง 24 ชม.ไปแล้ว แต่คาบยังไม่เริ่ม '
          + '→ ส่งเตือนแบบ "คาบใกล้ถึงแล้ว" ทันที (คาบนี้น่าจะเพิ่งถูกย้าย/เพิ่งถูกเพิ่ม)');
      }
      if (anyInWindow || anyLate) {
        // ยิงทีเดียวจบทั้งวัน: ปั๊ม "ส่งแล้ว" ทุกคาบในกลุ่ม เพราะข้อความที่ส่งออกไปเขียนครบทุกคาบแล้วจริง
        const idsNeedReminder24h = classes.reduce(function (acc, c) { return acc.concat(c.ids); }, []);
        // 2026-07-26 แก้：จอง (claim) ก่อนส่งเสมอ — กันส่งซ้ำถ้า cron 2 รอบทับเวลากันพอดี (ดูคอมเมนต์บนสุดไฟล์)
        const { claimedIds: claimed24h, error: claimErr0 } = await claimReminderIds(supabase, 'line_reminder24h_sent', idsNeedReminder24h);
        if (claimErr0) {
          console.error('[class-reminder-cron] จองสิทธิ์ส่งเตือน 24 ชม. ไม่สำเร็จ（ข้ามรอบนี้ กันส่งซ้ำ）：', claimErr0.message, 'ids=', idsNeedReminder24h);
          errCount++;
        } else if (claimed24h.length) {
          try {
            const studentTz = s.pending_student_tz;
            // ⚠️ เขียนเฉพาะคาบที่ "จองได้จริง" ลงในข้อความ — ถ้าอีกรอบ cron แย่งจองบางคาบไปแล้ว
            //    คาบนั้นถูกเตือนไปแล้ว ไม่ต้องเขียนซ้ำในข้อความนี้
            const claimedSet = {};
            claimed24h.forEach(function (id) { claimedSet[id] = true; });
            const entries = classes
              .filter(function (c) { return c.ids.some(function (id) { return claimedSet[id]; }); })
              .map(function (c) {
                return {
                  dateLabel: studentTz ? formatDateInTz(c.startMs, studentTz) : groupRows[0].lesson_date,
                  timeLabel: studentTz
                    ? formatHHMMInTz(c.startMs, studentTz) + (c.endLabelRaw ? '–' + formatHHMMInTz(c.endMs, studentTz) : '')
                    : c.startLabelRaw + (c.endLabelRaw ? '–' + c.endLabelRaw : ''),
                };
              });
            if (!entries.length) throw new Error('จองสิทธิ์ได้แต่ประกอบรายการคาบไม่ได้สักคาบ (ไม่ควรเกิด)');
            await pushLineMessages(channelToken, s.line_user_id, [buildReminder24hFlex(entries, anyLate)]);
            sentCount++;
          } catch (e) {
            errCount++;
            console.error('[class-reminder-cron] 發送 24 小時前提醒失敗，ids=' + claimed24h.join(',') + '：', e && e.message ? e.message : e);
            await releaseReminderIds(supabase, 'line_reminder24h_sent', claimed24h); // คืนสิทธิ์ ให้รอบหน้าลองส่งใหม่
          }
        }
        // claimed24h.length === 0 = อีกรอบ (cron ที่ทับเวลากัน) จองไปแล้ว → ข้ามเงียบๆ ไม่ใช่ error
      }
      // 🔴 2026-07-31 เอาเตือนก่อนเรียน 30 นาที + ข้อความหลังเรียนออกแล้วตามที่ Lin สั่ง (ดูคอมเมนต์บนสุดไฟล์)
    }

    return new Response(JSON.stringify({ ok: errCount === 0, checked: rows.length, sent: sentCount, skipped: skipCount, errors: errCount }), {
      status: errCount > 0 ? 500 : 200, headers: { 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e && e.message || e) }), { status: 500 });
  }
});
