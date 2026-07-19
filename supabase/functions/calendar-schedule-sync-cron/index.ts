// ════════════════════════════════════════════════════════════
// Supabase Edge Function: calendar-schedule-sync-cron
// หน้าที่: รันอัตโนมัติทุก 15-30 นาที (ผ่าน pg_cron — ดู supabase/sql/2026-07-17_pg_cron_calendar_schedule_sync.sql)
//   ไปอ่าน Google Calendar ของครูตรงๆ (ไม่ต้องรอครูเปิดเว็บ) แล้วซิงค์ลง classroom_schedule
//   ทำเหมือน connectCalendar() + syncScheduleToSupabase() ใน classroom/index.html ทุกประการ
//   (คัดลอกสูตร matching/dedupe มาตรงๆ ห้ามคิดใหม่ — กันพลาดแบบที่เคยเกิดกับ low-quota-cron)
//
// ทำไมต้องมีอันนี้ (เพิ่ม 2026-07-17 ตามที่ Lin สั่ง)：
//   เดิมทีระบบซิงค์ตารางได้เฉพาะตอนครูเปิดเว็บ (มี token ใน browser) — ถ้าครูไปลบ/แก้ Calendar
//   ตรงๆ ในแอป Google Calendar (ไม่ผ่านเว็บ) แล้วไม่เปิดเว็บอีก ตารางฝั่งนักเรียน/LINE เตือน
//   จะไม่มีวันอัปเดตเลย ต้องมีตัวที่รันเองอัตโนมัติแยกจาก browser ของครู
//
// ⚠️ ต้องมี Google refresh token เก็บไว้ฝั่ง server ก่อนถึงจะใช้งานได้ (วิธีได้มา + เหตุผลที่ต้อง
//   "Publish" OAuth consent screen ก่อน ไม่งั้น refresh token จะหมดอายุทุก 7 วัน — ดูขั้นตอนที่ AI
//   ส่งแยกให้ Lin ทำเองใน Google Cloud Console + OAuth Playground)
//
// วิธี deploy (Lin ทำเอง):
//   1. ตั้ง secret 3 ตัว (ดูค่าจากขั้นตอนที่ AI ให้แยก):
//        supabase secrets set GOOGLE_CLIENT_ID=...
//        supabase secrets set GOOGLE_CLIENT_SECRET=...
//        supabase secrets set GOOGLE_CALENDAR_REFRESH_TOKEN=...
//   2. supabase functions deploy calendar-schedule-sync-cron
//   3. ตั้ง pg_cron ให้เรียกทุก 15-30 นาที (รัน SQL ใน supabase/sql/2026-07-17_pg_cron_calendar_schedule_sync.sql
//      ใน Supabase SQL Editor)
//   4. ทดสอบ: เปิด Supabase → Edge Functions → calendar-schedule-sync-cron → Logs ดูว่ารันสำเร็จไหม
//      (เรียกด้วยมือครั้งแรกได้ผ่าน "Invoke" ปุ่มในหน้า Supabase ไม่ต้องรอ cron รอบแรก)
//
// ⚠️ SCHEDULE_SYNC_DAYS ด้านล่างต้อง "ตรงกับ" ค่าเดียวกันใน classroom/index.html เสมอ —
//   ถ้าแก้ฝั่งเว็บ ต้องกลับมาแก้ที่นี่ด้วย ไม่งั้นสองฝั่งจะซิงค์ช่วงวันไม่เท่ากัน
//
// 🔴 2026-07-19 แก้บั๊กสำคัญ (Lin เจอตอนทดสอบปุ่มลบ Calendar จาก LINE)：เดิมตอน sync ใหม่ทุกรอบ
//   ไม่ได้เก็บ calendar_event_id ของ Google ไว้เลย (อ่านแค่ชื่อ/วันที่/เวลา) — เพราะรอบนี้ "ลบตาราง
//   อนาคตทั้งหมดทิ้งก่อนเขียนใหม่" (บรรทัด delError ด้านล่าง) ทุก 15-30 นาที ID ที่เคยบันทึกถูกต้องตอน
//   จองครั้งแรกจะโดนลบทิ้งไปเรื่อยๆ ทำให้ "ยกเลิกคาบแล้วลบ Calendar ด้วย ID ตรงๆ" ใช้งานจริงไม่ได้เลย
//   (เงียบมาตลอดตั้งแต่เพิ่มฟีเจอร์นี้ 2026-07-16/17) แก้แล้ว: เก็บ ev.id ตอน match + ใส่ลง
//   calendar_event_id ทุกครั้งที่ upsert
// ════════════════════════════════════════════════════════════

// deno-lint-ignore-file
// @ts-nocheck

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// 2026-07-19 ขยับ 90→180 วัน (Lin ยืนยัน)：คอร์สใหญ่สุดที่ขาย 20 คาบ/สัปดาห์ละครั้ง ≈ 140 วัน
// 90 วันไม่พอ (พบจริง: MARK ซื้อ 20 เห็นแค่ 15) ต้องแก้พร้อมกับ classroom/index.html เสมอ
const SCHEDULE_SYNC_DAYS = 180; // ต้องตรงกับ SCHEDULE_SYNC_DAYS ใน classroom/index.html
const TZ_OFFSET_MS = 7 * 3600 * 1000; // Asia/Bangkok คงที่ ไม่มี DST (เหมือนที่ teacherTimeToDate ฝั่งเว็บใช้ '+07:00' ตายตัว)

// "วันนี้" ตามเวลาไทย — เหมือน teacherToday() ฝั่งเว็บ
function teacherTodayIso() {
  const bkk = new Date(Date.now() + TZ_OFFSET_MS);
  return bkk.toISOString().slice(0, 10);
}

// แปลง absolute time (Date) → {dateStr, timeStr} ตามเวลาไทย — เหมือน formatInTz() ฝั่งเว็บ (เฉพาะส่วนที่ใช้จริงตรงนี้)
function bangkokParts(dateObj) {
  const bkk = new Date(dateObj.getTime() + TZ_OFFSET_MS);
  return { dateStr: bkk.toISOString().slice(0, 10), timeStr: bkk.toISOString().slice(11, 16) };
}

// ใช้ refresh token แลก access token ใหม่ (อายุสั้น ~1 ชม.) — ไม่เก็บ access token ไว้ใช้ซ้ำข้ามรอบ
// เพราะรันเป็น cron แยกทุกรอบ ขอใหม่ทุกครั้งง่ายกว่าและชัวร์กว่า (ไม่ต้องกังวลเรื่องหมดอายุกลางคัน)
async function getAccessToken() {
  const clientId = Deno.env.get('GOOGLE_CLIENT_ID');
  const clientSecret = Deno.env.get('GOOGLE_CLIENT_SECRET');
  const refreshToken = Deno.env.get('GOOGLE_CALENDAR_REFRESH_TOKEN');
  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error('ขาด secret：GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET/GOOGLE_CALENDAR_REFRESH_TOKEN (ดูขั้นตอนตั้งค่าที่ AI ให้แยก)');
  }
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId, client_secret: clientSecret,
      refresh_token: refreshToken, grant_type: 'refresh_token',
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    // 2026-07-17：ถ้า refresh token หมดอายุ/ถูกถอน Google จะตอบ invalid_grant — ต้องโชว์ error
    // ชัดเจน ห้ามเงียบ (RELIABILITY FIRST) เพราะแปลว่าทั้งระบบ auto-sync นี้หยุดทำงานแล้ว
    throw new Error('แลก access token ไม่สำเร็จ (' + res.status + ')：' + body.slice(0, 300) + ' — refresh token อาจหมดอายุ ต้องทำขั้นตอน OAuth Playground ใหม่');
  }
  const data = await res.json();
  if (!data.access_token) throw new Error('Google ไม่คืน access_token มาให้');
  return data.access_token;
}

serve(async (req) => {
  try {
    const accessToken = await getAccessToken();
    const supabase = createClient(Deno.env.get('SUPABASE_URL'), Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'));

    const todayIso = teacherTodayIso();
    // ช่วงเวลาเดียวกับ calFetchUpcomingEvents(SCHEDULE_SYNC_DAYS) ฝั่งเว็บ
    const startDate = new Date(todayIso + 'T00:00:00+07:00');
    const timeMin = startDate.toISOString();
    const timeMax = new Date(startDate.getTime() + SCHEDULE_SYNC_DAYS * 86400000 - 1000).toISOString();

    const calUrl = 'https://www.googleapis.com/calendar/v3/calendars/primary/events'
      + '?timeMin=' + encodeURIComponent(timeMin)
      + '&timeMax=' + encodeURIComponent(timeMax)
      + '&singleEvents=true&orderBy=startTime&maxResults=250';
    const evRes = await fetch(calUrl, { headers: { Authorization: 'Bearer ' + accessToken } });
    if (!evRes.ok) throw new Error('Calendar API ' + evRes.status + '：' + (await evRes.text()).slice(0, 300));
    let evData = await evRes.json();
    let events = evData.items || [];
    // 2026-07-19 加（跟 classroom/index.html 的 calFetchUpcomingEvents 同一套修法）：maxResults=250
    // 只是一頁的上限，超過的話 Google 回 nextPageToken，之前沒接著撈，資料量大時會悄悄漏掉部分事件。
    let pageGuard = 0;
    while (evData.nextPageToken && pageGuard < 20) {
      pageGuard++;
      const pageRes = await fetch(calUrl + '&pageToken=' + encodeURIComponent(evData.nextPageToken), { headers: { Authorization: 'Bearer ' + accessToken } });
      if (!pageRes.ok) break;
      evData = await pageRes.json();
      events = events.concat(evData.items || []);
    }

    const { data: students, error: studErr } = await supabase.from('classroom_students').select('token,name');
    if (studErr) throw new Error('讀取學生名單失敗：' + studErr.message);

    // เหมือนฝั่งเว็บ：วันนี้ที่บันทึกเข้าเรียนไปแล้ว ไม่เอามาซิงซ้ำ (กันคาบเด้งกลับมาหลังกดบันทึกเข้าเรียน)
    const { data: attendedRows, error: attErr } = await supabase.from('classroom_attendance')
      .select('token').eq('lesson_date', todayIso);
    if (attErr) throw new Error('讀取今日出席紀錄失敗：' + attErr.message);
    const attendedTodayTokens = new Set((attendedRows || []).map((r) => r.token));

    // ── matching：ชื่อนักเรียนอยู่ในหัวข้อ event ไหม (เหมือน connectCalendar() ฝั่งเว็บทุกประการ) ──
    const matched = [];
    events.forEach((ev) => {
      const title = (ev.summary || '').toLowerCase();
      // 2026-07-19 加（Lin 要求，跟網頁版 connectCalendar() 同步修）：以前直接 substring 比對——
      // 如果兩個學生名字一個是另一個的一部分（例如 "Ann" 包含在 "Anna" 裡面），標題是 "Anna" 的
      // event 會誤配到兩個人身上。現在先收集所有「名字出現在標題裡」的候選人，再把「名字比較短、
      // 而且是另一個候選人名字的一部分」的人剔除（只留比較長/精確的那個）。有剔除就 console.warn
      // 留紀錄（RELIABILITY FIRST，不能悄悄發生看不到）。
      const candidates = (students || []).filter((s) => s.name && title.includes(String(s.name).toLowerCase()));
      const finalists = candidates.filter((s) => !candidates.some((s2) =>
        s2.name !== s.name && String(s2.name).toLowerCase().includes(String(s.name).toLowerCase()) && s2.name.length > s.name.length
      ));
      if (finalists.length < candidates.length) {
        console.warn('[calendar-schedule-sync-cron] ชื่อนักเรียนซ้อนกันใน event "' + (ev.summary || '') + '" — ตัดชื่อสั้นกว่าออก:',
          candidates.map((c) => c.name), '→ เหลือ', finalists.map((c) => c.name));
      }
      finalists.forEach((s) => {
        const hasDateTime = !!(ev.start && ev.start.dateTime);
        const startAbs = hasDateTime
          ? new Date(ev.start.dateTime)
          : (ev.start && ev.start.date ? new Date(ev.start.date + 'T00:00:00+07:00') : new Date());
        const startParts = bangkokParts(startAbs);
        const startTime = hasDateTime ? startParts.timeStr : (ev.start && ev.start.date ? '全天' : '');
        const endTime = ev.end && ev.end.dateTime ? bangkokParts(new Date(ev.end.dateTime)).timeStr : '';
        const isoDate = startParts.dateStr;
        if (isoDate === todayIso && attendedTodayTokens.has(s.token)) return;
        // 2026-07-19 加（RELIABILITY FIX，Lin 發現）：以前這裡沒存 ev.id，導致每次 cron 跑完
        // （每 15-30 分鐘一次）都會把 calendar_event_id 洗掉，讓「取消申請直接用 ID 刪 Calendar」
        // 這個安全機制形同虛設。singleEvents=true 展開後 ev.id 已經是「這一次」的正確事件 ID
        // （不是整個系列的 master id），直接存起來就對了。
        matched.push({ token: s.token, isoDate, startTime, endTime, name: s.name, eventId: ev.id || null });
      });
    });

    // ── dedupe (เหมือน syncScheduleToSupabase ฝั่งเว็บ — กัน "ON CONFLICT DO UPDATE" ชนกันเอง) ──
    const rowMap = new Map();
    matched.forEach((m) => {
      const key = m.token + '|' + m.isoDate + '|' + (m.startTime || '');
      // 2026-07-19 加：เก็บ calendar_event_id ไปด้วยทุกครั้ง (ดูคอมเมนต์ตอน push เข้า matched ด้านบน)
      rowMap.set(key, { token: m.token, lesson_date: m.isoDate, start_time: m.startTime || '', end_time: m.endTime || '', title: m.name, calendar_event_id: m.eventId || null });
    });
    const rows = Array.from(rowMap.values());

    // 2026-07-19 加（Lin สั่ง）：ก่อนลบของเก่า เก็บ "จำนวนเดิม" ไว้เทียบก่อน — ฟังก์ชันนี้ลบตารางอนาคต
    // ทั้งหมดแล้วเขียนใหม่ทุกรอบ (ทุก 15-20 นาที) ถ้ารอบไหนจับคู่ชื่อพลาดผิดปกติ (เช่น Calendar API
    // ตอบไม่ครบ, ชื่อพิมพ์เพี้ยน ฯลฯ) คาบเรียนจะหายจากตาราง/เว็บ/การเตือน LINE แบบเงียบๆ ไม่มีใครรู้
    // (Google Calendar ตัวจริงไม่ถูกแตะ ไม่หาย — อันนี้หายแค่จาก "สำเนา" ในตาราง classroom_schedule)
    // ตอนนี้เทียบจำนวนก่อน/หลัง ถ้าหายเยอะผิดปกติจะ push LINE เตือนครูทันที ไม่ต้องรอมาเจอเอง
    // 2026-07-19 แก้ตามที่ Lin สั่ง：เทียบแค่ 30 วันข้างหน้าพอ (ไม่ใช่เต็ม SCHEDULE_SYNC_DAYS 180 วัน)
    // เพราะคาบไกลๆ ยังไงก็ถูก sync ซ้ำเรื่อยๆ ทุก 15-20 นาทีอยู่แล้ว เทียบแค่ช่วงใกล้ (ที่สำคัญ/เร่งด่วนจริง)
    // ก็พอ ลดโอกาสแจ้งเตือนหลอกจากความเปลี่ยนแปลงปกติของคาบไกลๆ (เช่น ครูแก้ recurring series ไกลๆ ทีเดียว)
    const ALERT_WINDOW_DAYS = 30;
    const alertCutoffIso = new Date(startDate.getTime() + ALERT_WINDOW_DAYS * 86400000).toISOString().slice(0, 10);
    const { count: beforeCount } = await supabase
      .from('classroom_schedule')
      .select('id', { count: 'exact', head: true })
      .gte('lesson_date', todayIso)
      .lt('lesson_date', alertCutoffIso);

    // 2026-07-19 改（稽核發現，RED#5）：以前是先刪光未來的資料，再拿刪除前後的數量比對是否異常——
    // 但那時候已經刪了，就算發現異常，表已經空了，只能等下一輪 cron（15-30 分鐘後）填回去，
    // 這段空窗期網站/LINE 提醒看到的都是空的課表。現在改成：先算好這次抓到的 rows/rowsInWindow，
    // 「刪除之前」就先比對，異常的話直接跳過這整輪的刪除+寫入，保留上一輪成功的資料，只發警報。
    const rowsInWindow = rows.filter((r) => r.lesson_date < alertCutoffIso).length;
    let isAnomalousDrop = false;
    let dropped = 0;
    if (typeof beforeCount === 'number' && beforeCount >= 3) {
      dropped = beforeCount - rowsInWindow;
      if (dropped >= 3 && dropped / beforeCount >= 0.3) isAnomalousDrop = true;
    }

    let dropAlertSent = false;
    if (isAnomalousDrop) {
      console.error('[calendar-schedule-sync-cron] ⚠️ จำนวนคาบหายผิดปกติ (30 วันข้างหน้า): ก่อน=' + beforeCount + ' หลัง=' + rowsInWindow + ' (หาย ' + dropped + ' แถว, ' + Math.round((dropped / beforeCount) * 100) + '%) — ข้ามรอบนี้ ไม่ลบ/ไม่เขียนทับ เก็บข้อมูลรอบก่อนหน้าไว้ก่อน');
      const channelToken = Deno.env.get('LINE_CHANNEL_ACCESS_TOKEN');
      const teacherUserId = Deno.env.get('LINE_TEACHER_USER_ID');
      if (channelToken && teacherUserId) {
        try {
          await fetch('https://api.line.me/v2/bot/message/push', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + channelToken },
            body: JSON.stringify({
              to: teacherUserId,
              messages: [{ type: 'text', text: '⚠️ ตารางเรียนหายผิดปกติ (auto-sync, ภายใน 30 วัน)\nก่อน: ' + beforeCount + ' คาบ → รอบนี้เจอ: ' + rowsInWindow + ' คาบ (หาย ' + dropped + ' คาบ)\n\nGoogle Calendar ตัวจริงไม่ได้ถูกแตะ ข้อมูลยังอยู่ครบ — รอบนี้ระบบข้ามการอัปเดตตารางสำเนาไปก่อน (ของเดิมยังอยู่) เพราะจับคู่ชื่อ/ดึงข้อมูลรอบนี้อาจพลาด แนะนำเปิดเว็บเช็คตารางเรียนอีกที' }],
            }),
          });
          dropAlertSent = true;
        } catch (e) { console.error('[calendar-schedule-sync-cron] แจ้งเตือนครูไม่สำเร็จ:', e); }
      }

      return new Response(JSON.stringify({
        ok: true,
        skipped: true,
        reason: 'anomalous_drop',
        events_checked: events.length,
        students_checked: (students || []).length,
        matched_rows: rows.length,
        before_count_30d: beforeCount,
        after_count_30d: rowsInWindow,
        drop_alert_sent: dropAlertSent,
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }

    // ── ล้างคาบอนาคตเดิมทิ้งก่อนเขียนชุดใหม่ (เหมือนฝั่งเว็บ) — เช็ค error เสมอ ห้ามล้มเหลวเงียบๆ ──
    const { error: delError } = await supabase.from('classroom_schedule').delete({ count: 'exact' }).gte('lesson_date', todayIso);
    if (delError) {
      console.error('[calendar-schedule-sync-cron] ล้างตารางเก่าไม่สำเร็จ，รอบนี้ไม่เขียนข้อมูลใหม่กันซ้ำซ้อน：', delError.message);
      return new Response(JSON.stringify({ ok: false, stage: 'delete', error: delError.message }), {
        status: 500, headers: { 'Content-Type': 'application/json' },
      });
    }

    let upsertError = null;
    if (rows.length) {
      const { error } = await supabase.from('classroom_schedule').upsert(rows, { onConflict: 'token,lesson_date,start_time' });
      upsertError = error;
      if (error) console.error('[calendar-schedule-sync-cron] เขียนตารางใหม่ไม่สำเร็จ：', error.message);
    }

    return new Response(JSON.stringify({
      ok: !upsertError,
      events_checked: events.length,
      students_checked: (students || []).length,
      matched_rows: rows.length,
      before_count_30d: beforeCount,
      after_count_30d: rowsInWindow,
      drop_alert_sent: dropAlertSent,
      error: upsertError ? upsertError.message : null,
    }), { status: upsertError ? 500 : 200, headers: { 'Content-Type': 'application/json' } });
  } catch (e) {
    console.error('[calendar-schedule-sync-cron] error:', e);
    return new Response(JSON.stringify({ ok: false, error: String((e && e.message) || e) }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }
});
