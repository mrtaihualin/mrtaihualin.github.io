// ════════════════════════════════════════════════════════════
// Supabase Edge Function: low-quota-cron
// หน้าที่: เช็คทุกวันว่านักเรียนคนไหน "โควต้าคาบเรียนรอบนี้" ใกล้หมด (เหลือ ≤ 1 คาบ)
//   ถ้าใกล้หมด + เชื่อม LINE ไว้แล้ว → ส่ง LINE เตือนให้ต่อคอร์ส (ส่งครั้งเดียวต่อรอบการซื้อ ไม่ส่งซ้ำทุกวัน)
//
// เพิ่ม 2026-07-15 — Lin ขอให้ระบบส่ง LINE อัตโนมัติ แทนที่จะเห็นแค่ป้ายเตือนในหน้าเว็บครู (banner เดิม
//   ในหน้าครู classroom/index.html ยังอยู่เหมือนเดิม อันนี้คือเพิ่มการแจ้ง "ตัวนักเรียนเอง" ผ่าน LINE)
//
// วิธีคิด "โควต้ารอบนี้" (คัดลอกสูตรมาจาก computeCurrentCourse() ใน classroom/index.html
//   ตรงๆ ห้ามคิดสูตรใหม่เอง — เคยพลาดมาแล้วรอบนึงที่คิดแบบ "รวมทุกอย่างตลอดชีพ" แล้วได้ตัวเลขผิด):
//   1. เอาเฉพาะรายการจ่ายเงินที่ status = 'pending' หรือ 'done'
//   2. ในนั้นเอาที่มี start_date มา เรียงหาอันที่ start_date ใหม่ล่าสุด = "รอบปัจจุบัน"
//   3. ซื้อไว้ = lessons + bonus_lessons ของรอบนั้น
//   4. เรียนไปแล้ว(รอบนี้) = รวม lessons ของ classroom_attendance ที่ lesson_date >= start_date ของรอบนั้น
//   5. เหลือ = ซื้อไว้ - เรียนไปแล้ว
//
// กันส่งซ้ำ: ใช้คอลัมน์ใหม่ classroom_payments.low_quota_notified (ต้องรัน SQL เพิ่มคอลัมน์นี้ก่อน
//   ดู SQL แนบแยกที่ Lin ต้องรันเอง) — ส่งแล้วมาร์ค true ที่แถว payment ของรอบนั้น พอ Lin ยืนยันรับเงินรอบใหม่
//   (แถว payment ใหม่) low_quota_notified จะเป็น false โดยอัตโนมัติ (ค่าเริ่มต้น) เตือนรอบใหม่ได้ต่อ
//
// เพิ่ม 2026-07-15 (รอบ 2) — Lin ขอให้ทุกครั้งที่ส่ง LINE เตือนนักเรียน ให้ส่งสำเนาแบบเดียวกันไปหาครูด้วย
//   (จะได้รู้ว่าใครถูกเตือนไปแล้วบ้าง) — ใช้ secret LINE_TEACHER_USER_ID ตัวเดียวกับที่ request-sla-cron
//   ใช้อยู่แล้ว ไม่ต้องตั้งใหม่ — ถ้ายังไม่เคยตั้ง secret นี้มาก่อน ข้ามส่วนนี้ไปเฉยๆ ไม่ทำให้การเตือนนักเรียนพัง
//   (รอบ 3) — ต้องส่งสำเร็จทั้งนักเรียน+ครูถึงจะมาร์คว่าเตือนแล้ว ถ้าฝั่งครูพัง พรุ่งนี้ลองใหม่ทั้งคู่
//   (นักเรียนอาจได้ข้อความซ้ำ ยอมแลกเพื่อไม่ให้ครูพลาด)
//
// เพิ่ม 2026-07-15 (รอบ 4) — Lin ขอให้ส่งทันทีหลังคาบสุดท้ายจบ ไม่ต้องรอ cron วันละครั้ง:
//   เรียกฟังก์ชันนี้ได้ 2 แบบแล้ว — ไม่ส่ง body (cron วันละครั้ง) = เช็คทุกคน / ส่ง {token:'...'} มา
//   (จาก recordAttendance() ใน classroom/index.html ทันทีหลังบันทึกเข้าเรียน) = เช็คแค่คนนั้นคนเดียว
//
// วิธี deploy (Lin ทำเอง):
//   1. รัน SQL เพิ่มคอลัมน์ก่อน (ดูไฟล์/ข้อความ SQL ที่แนบแยก ไม่ได้เก็บในไฟล์นี้)
//   2. supabase functions deploy low-quota-cron
//   3. ตั้ง pg_cron ให้เรียกวันละครั้ง (ดู SQL แนบแยก) — ใช้ secret ชุดเดียวกับ cron อื่นๆ ที่ตั้งไว้แล้ว
//      (LINE_CHANNEL_ACCESS_TOKEN) ไม่ต้องตั้งใหม่
// ════════════════════════════════════════════════════════════

// deno-lint-ignore-file
// @ts-nocheck

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const LINE_PUSH_URL = 'https://api.line.me/v2/bot/message/push';
const LOW_QUOTA_THRESHOLD = 1; // เหลือ ≤ เท่านี้ถือว่า "ใกล้หมด" (เท่ากับเกณฑ์ป้ายเตือนหน้าเว็บครูเดิม)

async function pushLine(channelToken, targetUserId, text) {
  const res = await fetch(LINE_PUSH_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + channelToken },
    body: JSON.stringify({ to: targetUserId, messages: [{ type: 'text', text: String(text).slice(0, 4900) }] }),
  });
  if (!res.ok) throw new Error('LINE API ' + res.status + ': ' + (await res.text()));
}

// เหมือน computeCurrentCourse() ใน classroom/index.html เป๊ะๆ — ห้ามแก้สูตรที่นี่โดยไม่แก้ที่นั่นด้วย
// 2026-07-15 แก้ (เจอจากการเช็คข้อมูลจริง — Mark กับ Oreo ไม่มี start_date เลยสักแถว)：
//   ต้นฉบับใน classroom/index.html มี fallback สำหรับกรณี "ไม่มีแถวไหนมี start_date เลย" ด้วย
//   (รวมทุกแถวตลอดชีพแทน) — ตอนพอร์ตมาที่นี่รอบแรกลืมใส่ fallback นี้ ทำให้คนที่ไม่มี start_date
//   (เช่น Mark, Oreo) จะไม่เข้าเงื่อนไข hasCourse เลย ต่อให้โควต้าใกล้หมดจริงก็จะไม่ได้รับ LINE เตือน
//   แบบเงียบๆ — ตรงกับบั๊กคลาสเดียวกับที่ตรวจทั้งระบบมา ต้องใส่ fallback ให้ตรงกับต้นฉบับ 100%
function computeCurrentCourse(pays, atts) {
  const active = (pays || []).filter((p) => p.status === 'pending' || p.status === 'done');
  const withDate = active.filter((p) => p.start_date);
  if (withDate.length) {
    withDate.sort((a, b) => (a.start_date < b.start_date ? 1 : -1)); // ใหม่→เก่า
    const cur = withDate[0];
    const bought = (cur.lessons || 0) + (cur.bonus_lessons || 0);
    const used = (atts || [])
      .filter((a) => a.lesson_date >= cur.start_date)
      .reduce((s, a) => s + (a.lessons || 1), 0);
    return { hasCourse: true, bought, used, remain: bought - used, paymentId: cur.id };
  }
  if (!active.length) return { hasCourse: false, bought: 0, used: 0, remain: 0, paymentId: null };
  // fallback: ไม่มีแถวไหนมี start_date เลย → รวมทุกแถวตลอดชีพ (เหมือนต้นฉบับเป๊ะ)
  const bought = active.reduce((s, p) => s + (p.lessons || 0) + (p.bonus_lessons || 0), 0);
  const used = (atts || []).reduce((s, a) => s + (a.lessons || 1), 0);
  const latest = active.slice().sort((a, b) => (a.created_at < b.created_at ? 1 : -1))[0];
  return { hasCourse: bought > 0, bought, used, remain: bought - used, paymentId: latest.id };
}

serve(async (req) => {
  try {
    const channelToken = Deno.env.get('LINE_CHANNEL_ACCESS_TOKEN');
    const teacherUserId = Deno.env.get('LINE_TEACHER_USER_ID'); // ไม่บังคับต้องตั้ง — ถ้าไม่มีก็แค่ไม่ส่งสำเนาให้ครู
    if (!channelToken) {
      return new Response(JSON.stringify({ error: 'missing LINE_CHANNEL_ACCESS_TOKEN' }), { status: 500 });
    }
    const supabase = createClient(Deno.env.get('SUPABASE_URL'), Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'));

    // 2026-07-18 加（Lin 要求）：只提醒「今天真的有排課、而且今天就是最後一堂」的學生
    // 不再是「隨便哪天堂數變低就發」— 這樣訊息才會準確對到「今天」，跟網站上的「今天是最後一堂」banner 邏輯一致
    const tz = Deno.env.get('CLASS_TIMEZONE') || 'Asia/Bangkok';
    const todayIso = new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date());
    const { data: todaySched } = await supabase.from('classroom_schedule').select('token').eq('lesson_date', todayIso);
    const todayTokens = new Set((todaySched || []).map((r) => r.token));

    // 2026-07-15 加（Lin 要求）：เรียกได้ 2 แบบ —
    //   (1) cron วันละครั้ง ไม่ส่ง body มา → เช็คนักเรียนทุกคนที่ผูก LINE ไว้ (เหมือนเดิม)
    //   (2) เรียกจาก classroom/index.html ทันทีหลังบันทึกเข้าเรียน (ส่ง {token} มา) → เช็คแค่คนนั้นคนเดียว
    //       ให้ได้รับ LINE ทันทีถ้าคาบที่เพิ่งบันทึกเป็นคาบสุดท้ายของรอบพอดี ไม่ต้องรอ cron ตอน 9 โมงเช้า
    let bodyToken = null;
    try {
      const body = await req.json();
      bodyToken = body && body.token ? String(body.token) : null;
    } catch (e) { /* ไม่มี body ส่งมา (เรียกจาก cron) ถือว่าปกติ ไม่ใช่ error */ }

    let studentsQuery = supabase
      .from('classroom_students')
      .select('token, name, line_user_id')
      .is('archived_at', null)
      .not('line_user_id', 'is', null);
    if (bodyToken) studentsQuery = studentsQuery.eq('token', bodyToken);

    const { data: studentsRaw, error: stuErr } = await studentsQuery;
    if (stuErr) return new Response(JSON.stringify({ error: stuErr.message }), { status: 500 });
    // 2026-07-18 加：เดิมเช็คทุกคน ตอนนี้กรองเหลือเฉพาะคนที่มีคาบเรียนวันนี้จริงๆ
    const students = (studentsRaw || []).filter((s) => todayTokens.has(s.token));
    if (!students.length) return new Response(JSON.stringify({ ok: true, checked: 0, note: 'no students have class today' }), { status: 200 });

    let sent = 0, errCount = 0, checked = 0;

    for (const s of students) {
      checked++;
      const { data: pays } = await supabase
        .from('classroom_payments')
        .select('id, lessons, bonus_lessons, status, start_date, low_quota_notified, created_at')
        .eq('token', s.token);
      const { data: atts } = await supabase
        .from('classroom_attendance')
        .select('lesson_date, lessons')
        .eq('token', s.token);

      const q = computeCurrentCourse(pays || [], atts || []);
      if (!q.hasCourse || q.remain > LOW_QUOTA_THRESHOLD) continue;

      const curPayment = (pays || []).find((p) => p.id === q.paymentId);
      if (!curPayment || curPayment.low_quota_notified) continue; // ส่งไปแล้วรอบนี้ ไม่ส่งซ้ำ

      const remain = q.remain < 0 ? 0 : q.remain;
      // 2026-07-18 改（Lin 要求）：改成「今天是最後一堂」的措辭，因為現在只在今天真的有排課時才會發
      const messageText = '☀️ 早安！提醒你：今天的泰語課是這一期最後一堂課囉！記得跟老師約續課時間，才不會中斷學習喔 😊';

      // 2026-07-15（รอบ 4, Lin ถาม）："ทำให้ส่งได้เหมือนกัน/ไม่ได้เหมือนกัน" (ส่งพร้อมกันจริงๆ ทั้ง 2 ฝั่ง)
      // ทำแบบ "ทั้งคู่พังพร้อมกันเป๊ะๆ" ไม่มีทางเป็นไปได้ 100% เพราะเป็นการยิง LINE 2 ครั้งแยกกัน
      // (ฝั่งไหนฝั่งหนึ่งอาจสำเร็จก่อนแล้วอีกฝั่งเน็ตสะดุดทีหลังก็ได้ ควบคุมให้พังพร้อมกันเป๊ะไม่ได้จริง)
      // แต่ทำให้ "ผลข้างเคียงตกไปอยู่ฝั่งที่ปลอดภัยกว่า" ได้ — เปลี่ยนลำดับใหม่: ยิงหาครูก่อน
      //   ถ้าฝั่งครูพัง → ไม่ส่งหานักเรียนเลยรอบนี้ (นักเรียนไม่ได้อะไรทั้งคู่ ไม่มีใครได้ข้อความซ้ำ)
      //   ถ้าฝั่งครูสำเร็จ ค่อยส่งหานักเรียนต่อ → ถ้าฝั่งนักเรียนพังทีหลัง พรุ่งนี้จะลองใหม่ทั้งคู่
      //     (ครูอาจได้ข้อความซ้ำ 1 รอบ แต่นักเรียนจะได้รับแค่ครั้งเดียวเสมอ) — ยอมให้ของซ้ำตกที่ครูเอง
      //     ไม่ใช่ที่นักเรียน เพราะข้อความซ้ำถึงนักเรียนดูไม่เป็นมืออาชีพกว่าซ้ำถึงครูเอง
      try {
        let teacherOk = true;
        if (teacherUserId) {
          try {
            await pushLine(channelToken, teacherUserId, '📋 今天要發「最後一堂課」提醒給 ' + (s.name || s.token) + '：\n' + messageText);
          } catch (e) {
            teacherOk = false;
            console.warn('[low-quota-cron] ส่งให้ครูไม่สำเร็จ — ยังไม่ส่งหานักเรียน รอลองใหม่พรุ่งนี้:', e);
          }
        }
        if (!teacherOk) { errCount++; continue; }

        await pushLine(channelToken, s.line_user_id, messageText);
        sent++;

        // RELIABILITY FIRST：一定要檢查有沒有真的標記成功，不然會每天重複發送
        const { error: markErr } = await supabase
          .from('classroom_payments')
          .update({ low_quota_notified: true })
          .eq('id', curPayment.id);
        if (markErr) {
          console.error('[low-quota-cron] 標記 low_quota_notified 失敗，可能會重複提醒：', markErr.message, 'payment_id=', curPayment.id);
          errCount++;
        }
      } catch (e) {
        errCount++; // ส่งหานักเรียนไม่สำเร็จ (ครูอาจได้ข้อความไปแล้ว 1 ครั้งเป็นของแถม ไม่กระทบอะไร)
      }
    }

    return new Response(JSON.stringify({ ok: true, checked, sent, errors: errCount }), { status: 200 });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e && e.message || e) }), { status: 500 });
  }
});
