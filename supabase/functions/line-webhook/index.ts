// ════════════════════════════════════════════════════════════
// Supabase Edge Function: line-webhook
// หน้าที่: รับ Webhook event จาก LINE
//   รองรับ 2 ชนิด postback:
//   1) action=approve|deny (แบบเดิม 2026-07-10) — ปุ่มเก่าในข้อความที่เคยส่งให้ครูก่อนหน้านี้
//      2026-07-13 แก้: status เปลี่ยนจาก approved/denied → acknowledged (ตาม constraint จริงในฐานข้อมูล
//      classroom_requests_status_check ที่รองรับแค่ pending/acknowledged เท่านั้น) — เก็บไว้เผื่อมีข้อความ
//      เก่าที่ยังไม่ถูกกดค้างอยู่ใน LINE ของครู กดแล้วจะไม่ error แต่ **ไม่ได้แตะ Google Calendar ใดๆ ทั้งสิ้น**
//      (ตอนนี้ปุ่มนี้เป็นเวอร์ชันเก่าที่เลิกส่งใหม่แล้ว — ดูข้อ 2026-07-13 ด้านล่าง)
//   2) action=accept_offer|decline_offer (2026-07-13 เพิ่ม, 2026-07-16 แก้：รองรับสูงสุด 3 ตัวเลือก) —
//      ปุ่มที่นักเรียนกดตอบรับ/ปฏิเสธเวลาครูเสนอ (ดู submitProposeTime ในเว็บ) → accept_offer ตอนนี้
//      แนบ opt=<index> บอกว่าเลือกตัวเลือกไหนใน proposed_options (สูงสุด 3 อัน) แล้วอัปเดต
//      requested_date/requested_time + offer_status='accepted' · decline_offer = ทั้งหมดไม่สะดวก
//      **ไม่แตะ Google Calendar** (Edge Function ไม่มี Google OAuth token ของครู ทำไม่ได้จากฝั่งนี้)
//      ครูต้องกลับไปเปิดหน้าเว็บเพื่อกด "✅ ยืนยันและย้าย Calendar" เอง ระบบจะโชว์ให้เห็นในหน้าแรกอัตโนมัติ
//      ทั้งสองแบบตอนนี้ push แจ้งครูทันที (Lin ขอ) ไม่ต้องรอครูเปิดเว็บเองถึงจะรู้
//   3) action=ack_teacher_cancel (2026-07-16 เพิ่ม) — ครูสั่งยกเลิกคาบ (teacherCancelClassNowInner)
//      ไม่ลบ Calendar ทันทีแล้ว ต้องรอนักเรียนกด "我知道了" ก่อน (กดฝั่ง LINE นี้ หรือฝั่งเว็บก็ได้ อันไหน
//      กดก่อนนับอันนั้น) → set teacher_cancel_ack_at แล้ว push แจ้งครูว่ากดยืนยันลบได้แล้ว
//      **ไม่แตะ Google Calendar เอง** (ครูต้องกลับไปกด "確認刪除 Calendar" ที่เว็บเอง)
//
// 2026-07-13 สำคัญมาก：ตั้งแต่เปลี่ยนมาให้ "處理" ปุ่มบนเว็บค้นหา+ย้าย/ลบ Calendar เองแล้ว
//   ปุ่ม "✅ 已處理"/"❌ 婉拒" แบบเดิมที่เคยส่งไปให้ครูกดตรงจาก LINE **เอาออกจากข้อความแจ้งเตือนใหม่แล้ว**
//   (ดู notifyTeacherClassRequest ในเว็บ) เพราะกดจาก LINE แล้วจะ "ดูเหมือนจัดการเสร็จ" ทั้งที่ Google Calendar
//   ไม่ได้ถูกแตะเลย (Edge Function ไม่มีสิทธิ์ Calendar ของครู) — เสี่ยงข้อมูลไม่ตรงกันแบบอันตราย
//   (RELIABILITY FIRST) ตอนนี้ข้อความแจ้งเตือนครูจะมีแค่ลิงก์ "🔗 開 Calendar" + "📋 到網站處理" แทน
//
// ⚠️ นี่คือ Webhook — ต่างจาก notify-line/link-line ตรงที่ "LINE เป็นฝ่ายเรียกเรา" ไม่ใช่เว็บเรียก
//   ดังนั้นต้องไปตั้งค่า Webhook URL ในหน้า LINE Developers Console ด้วย (ดูขั้นตอนด้านล่าง)
//
// วิธี deploy (ทำต่อจาก notify-line ได้เลย ใช้ secret ชุดเดียวกันบางส่วน):
//   1. supabase secrets set LINE_CHANNEL_SECRET=xxxxxxxx
//      (หาได้จาก LINE Developers Console → channel ตัวเดียวกับที่ตั้ง LINE_CHANNEL_ACCESS_TOKEN
//       → Basic settings → Channel secret)
//   2. supabase functions deploy line-webhook --no-verify-jwt
//      ⚠️ ต้องมี --no-verify-jwt เพราะ LINE เรียกเราตรงๆ ไม่มี Supabase auth token แนบมา
//   3. เอา URL ของฟังก์ชันที่ deploy เสร็จ (รูปแบบ https://qzkxlhpcputsvbqmtqfi.supabase.co/functions/v1/line-webhook)
//      ไปวางใน LINE Developers Console → channel → Messaging API → Webhook URL → กด Verify
//   4. เปิดสวิตช์ "Use webhook" ให้เป็นเปิด (สำคัญมาก ไม่เปิดจะไม่ทำงาน)
//   5. ปิด "Auto-reply messages" กับ "Greeting messages" ในหน้า LINE Official Account Manager
//      (ไม่บังคับ แต่แนะนำ กันข้อความอัตโนมัติของ LINE เองไปกวนตอนครูกดปุ่ม)
// ════════════════════════════════════════════════════════════

// deno-lint-ignore-file
// @ts-nocheck

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const LINE_REPLY_URL = 'https://api.line.me/v2/bot/message/reply';
const LINE_PUSH_URL = 'https://api.line.me/v2/bot/message/push';

async function verifySignature(rawBody, signatureHeader, channelSecret) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(channelSecret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sigBuf = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(rawBody));
  const bytes = new Uint8Array(sigBuf);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  const computed = btoa(binary);
  return computed === signatureHeader;
}

async function replyLine(channelToken, replyToken, text) {
  try {
    await fetch(LINE_REPLY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + channelToken },
      body: JSON.stringify({ replyToken, messages: [{ type: 'text', text: String(text).slice(0, 4900) }] }),
    });
  } catch (e) { /* ตอบกลับไม่สำเร็จก็ไม่เป็นไร ฐานข้อมูลอัปเดตไปแล้วเป็นหลัก */ }
}

// 2026-07-16 加：ต่างจาก replyLine ตรงที่ push ส่งหาใครก็ได้ (ไม่ต้องมี replyToken สดๆ)
// ใช้ตอนต้องเด้งไปแจ้ง "อีกฝ่าย" (เช่น นักเรียนกดรับทราบใน LINE → ต้องเด้งไปเตือนครู)
async function pushLine(channelToken, targetUserId, text) {
  try {
    await fetch(LINE_PUSH_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + channelToken },
      body: JSON.stringify({ to: targetUserId, messages: [{ type: 'text', text: String(text).slice(0, 4900) }] }),
    });
  } catch (e) { /* push ไม่สำเร็จก็ไม่เป็นไร ฐานข้อมูลอัปเดตไปแล้วเป็นหลัก */ }
}

serve(async (req) => {
  // LINE จะยิง GET มาตอนกด "Verify" ในหน้า console ครั้งแรก ให้ตอบ 200 เฉยๆ ก็พอ
  if (req.method !== 'POST') {
    return new Response('ok', { status: 200 });
  }

  const rawBody = await req.text();
  const channelToken = Deno.env.get('LINE_CHANNEL_ACCESS_TOKEN');
  const channelSecret = Deno.env.get('LINE_CHANNEL_SECRET');

  // ยืนยันว่า request นี้มาจาก LINE จริง ๆ (มี channel secret ตั้งไว้ถึงจะเช็ค — ถ้ายังไม่ตั้งจะข้ามการเช็ค
  // ไปก่อน เพื่อให้ deploy ครั้งแรกแล้วทดสอบง่ายๆ ได้ แต่ **แนะนำให้ตั้ง secret นี้เสมอ** ก่อนใช้งานจริง)
  if (channelSecret) {
    const sig = req.headers.get('x-line-signature') || '';
    const ok = await verifySignature(rawBody, sig, channelSecret);
    if (!ok) return new Response('invalid signature', { status: 401 });
  } else {
    // 2026-07-14 加：เดิมข้ามการเช็คแบบเงียบๆ ถ้ายังไม่ตั้ง secret — เผื่อไว้สำหรับตอน deploy ครั้งแรก
    // แต่ถ้าลืมตั้ง secret แล้วปล่อยไว้แบบนี้จริงจัง ใครก็ยิง request ปลอมมาสั่งงานฟังก์ชันนี้ได้
    // (SECURITY/RELIABILITY FIRST) ต้อง log ดังๆ ทุกครั้งที่เกิดแบบนี้ ไม่ให้เงียบหายไป
    // เช็ค log ได้จาก Supabase Dashboard → Edge Functions → line-webhook → Logs
    console.error('[line-webhook] ⚠️ ยังไม่ได้ตั้งค่า LINE_CHANNEL_SECRET — ข้ามการตรวจลายเซ็นไปเฉยๆ (เสี่ยงมีคนปลอม request มาสั่งงาน) ควรตั้ง secret นี้โดยเร็ว');
  }

  let payload;
  try { payload = JSON.parse(rawBody); } catch (e) {
    return new Response('bad json', { status: 400 });
  }

  const supabase = createClient(Deno.env.get('SUPABASE_URL'), Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'));

  for (const event of (payload.events || [])) {
    if (event.type !== 'postback') continue; // ตอนนี้สนใจแค่ postback (ปุ่มในข้อความ) เท่านั้น
    try {
      const data = event.postback && event.postback.data ? event.postback.data : '';
      const params = new URLSearchParams(data);
      const action = params.get('action');

      if (action === 'approve' || action === 'deny') {
        // ── 2026-07-10 แบบเก่า：เก็บไว้เผื่อมีข้อความค้างที่ยังไม่ถูกกด ไม่ได้แตะ Calendar ──
        const token = params.get('token');
        const type = params.get('type');
        const odate = params.get('odate');
        if (!token || !type || !odate) continue;

        const { error, count } = await supabase
          .from('classroom_requests')
          .update({ status: 'acknowledged' }, { count: 'exact' })
          .eq('token', token)
          .eq('request_type', type)
          .eq('original_date', odate)
          .eq('status', 'pending');

        if (channelToken && event.replyToken) {
          let replyText;
          if (error) replyText = '⚠️ 更新失敗：' + error.message;
          else if (!count) replyText = 'ℹ️ 這筆申請可能已經被處理過了';
          else replyText = 'ℹ️ 已標記完成，但這個舊版按鈕不會動 Google Calendar，記得自己到 Calendar 確認調整好了';
          await replyLine(channelToken, event.replyToken, replyText);
        }
        continue;
      }

      if (action === 'accept_offer' || action === 'decline_offer') {
        // ── 2026-07-13 加：นักเรียนตอบรับ/ปฏิเสธเวลาใหม่ที่ครูเสนอ ──
        // แค่บันทึก offer_status ลงฐานข้อมูล **ไม่แตะ Calendar** — ครูต้องเปิดหน้าเว็บกดยืนยันเองอีกที
        // ถึงจะย้าย Calendar จริง (Edge Function ไม่มี Google OAuth token ของครู ทำเองไม่ได้)
        // 2026-07-16 加（Lin 要求：最多 3 個時間選項）：accept_offer 現在會帶 opt=<index>，
        // 指出學生選了 proposed_options 裡第幾個——先查一次這筆申請，把選到的那個存進
        // requested_date/requested_time（老師「確認並搬 Calendar」讀的就是這兩欄，
        // 完全不用改那段既有的搬 Calendar 邏輯）。
        const requestId = params.get('request');
        if (!requestId) continue;
        const newOfferStatus = action === 'accept_offer' ? 'accepted' : 'declined';

        // 2026-07-16 加（稽核發現，ORANGE#5）：先查這筆申請屬於哪個學生（token），連同
        // accept_offer 要用的候選時間一起查一次。
        const { data: reqRow } = await supabase
          .from('classroom_requests')
          .select('token,proposed_options,requested_date,requested_time')
          .eq('id', requestId)
          .maybeSingle();
        if (!reqRow) continue; // 這筆申請不存在，安全忽略，不用回覆什麼

        // 2026-07-16 加（稽核發現，ORANGE#5）：以前這裡只認 request id，沒有確認按按鈕的
        // LINE 使用者是不是這筆申請真正的學生本人——多加這層防護（防禦性加強，不是因為
        // 已知有真的被利用，是稽核時發現「理論上少了這一層」）。對不上就安全忽略，不回覆任何內容
        // （避免透露「這筆申請存在/不存在」這種資訊給不是本人的人）。
        const senderUserId = event.source && event.source.userId;
        if (senderUserId) {
          const { data: stuRow } = await supabase.from('classroom_students').select('line_user_id').eq('token', reqRow.token).maybeSingle();
          if (!stuRow || stuRow.line_user_id !== senderUserId) {
            console.error('[line-webhook] ⚠️ accept/decline_offer：LINE 使用者跟這筆申請的學生對不起來，已忽略。request=', requestId);
            continue;
          }
        }

        const updateFields = { offer_status: newOfferStatus };
        let chosenOpt = null;
        if (action === 'accept_offer') {
          const optIdxRaw = params.get('opt');
          const optIdx = optIdxRaw === null ? 0 : parseInt(optIdxRaw, 10);
          const opts = (Array.isArray(reqRow.proposed_options) && reqRow.proposed_options.length)
            ? reqRow.proposed_options
            : [{ date: reqRow.requested_date, time: reqRow.requested_time }];
          // 2026-07-16 加（稽核發現，RED#2）：以前這裡選項對不到（例如老師剛好把提議改成剩 2 個選項，
          // 學生卻點了舊訊息裡的第 3 個按鈕）會偷偷退回選第一個，等於老師之後搬 Calendar 搬到
          // 學生根本沒選過的時間，而且完全沒有警告。現在改成：對不到就直接當失敗處理，
          // 不寫入 accepted，回覆學生請重新整理網頁看最新選項再選一次。
          if (!Number.isInteger(optIdx) || optIdx < 0 || optIdx >= opts.length || !opts[optIdx]) {
            if (channelToken && event.replyToken) {
              await replyLine(channelToken, event.replyToken, '⚠️ 這個選項好像已經失效了（老師可能剛修改過提議），請重新整理網頁看最新的選項再選一次。');
            }
            continue;
          }
          chosenOpt = opts[optIdx];
          updateFields.requested_date = chosenOpt.date;
          updateFields.requested_time = chosenOpt.time;
          // 2026-07-16 加（稽核發現，ORANGE#4）：學生接受之後，48 小時提醒的計時器要重新開始算
          // 「等老師去確認搬 Calendar」，不然這筆申請的 sla_reminder_sent 可能早在「等學生回覆」
          // 階段就已經是 true 了，導致老師永遠收不到「學生已經回覆很久了，記得去確認」的提醒。
          updateFields.offer_accepted_at = new Date().toISOString();
          updateFields.sla_reminder_sent = false;
        }

        const { error, count } = await supabase
          .from('classroom_requests')
          .update(updateFields, { count: 'exact' })
          .eq('id', requestId)
          .eq('offer_status', 'proposed');

        if (channelToken && event.replyToken) {
          let replyText;
          if (error) replyText = '⚠️ 回覆失敗：' + error.message;
          else if (!count) replyText = 'ℹ️ 這個提議可能已經被回覆過了，重新整理網頁看看目前狀態';
          else replyText = newOfferStatus === 'accepted'
            ? '✅ 已回覆，等老師開電腦確認後才會真的調整行事曆喔'
            : '✅ 已回覆都不方便，老師會直接聯絡你討論時間';
          await replyLine(channelToken, event.replyToken, replyText);
        }

        // 2026-07-16 加（Lin 要求）：不管選了時間還是都不方便，都要推播通知老師——老師可能不在電腦前，
        // 不然要自己開網站才會知道學生回覆了。只有這次真的成功翻到 accepted/declined（count>0）才通知，
        // 避免重複按/兩邊搶著按時推兩次給老師。
        if (!error && count && channelToken) {
          const teacherUserId = Deno.env.get('LINE_TEACHER_USER_ID');
          if (teacherUserId) {
            const msg = newOfferStatus === 'accepted'
              ? ('ℹ️ 學生已經選好新時間' + (chosenOpt ? '（' + chosenOpt.date + (chosenOpt.time ? ' ' + chosenOpt.time : '') + '）' : '') + '，到網站按「確認並搬 Calendar」')
              : '⚠️ 學生說這些時間都不方便，請直接聯絡學生討論';
            await pushLine(channelToken, teacherUserId, msg);
          }
        }
        continue;
      }

      if (action === 'ack_teacher_cancel') {
        // ── 2026-07-16 加：老師發起的取消，學生在 LINE 這邊按「我知道了」確認收到 ──
        // 網站那邊也有一顆一樣功能的按鈕（見 ackTeacherCancel in classroom/index.html）
        // 哪邊先按都算數，兩邊共用同一個欄位 teacher_cancel_ack_at，用 .is(null) 當保險閘
        // 防止兩邊同時按/重複按 push 兩次通知給老師。
        const requestId = params.get('request');
        if (!requestId) continue;

        // 2026-07-16 加（稽核發現，ORANGE#5）：跟 accept/decline_offer 一樣，多加一層確認
        // 按按鈕的人是不是這筆通知真正要給的那個學生。
        const senderUserIdAck = event.source && event.source.userId;
        if (senderUserIdAck) {
          const { data: reqRowAck } = await supabase.from('classroom_requests').select('token').eq('id', requestId).maybeSingle();
          if (!reqRowAck) continue;
          const { data: stuRowAck } = await supabase.from('classroom_students').select('line_user_id').eq('token', reqRowAck.token).maybeSingle();
          if (!stuRowAck || stuRowAck.line_user_id !== senderUserIdAck) {
            console.error('[line-webhook] ⚠️ ack_teacher_cancel：LINE 使用者跟這筆申請的學生對不起來，已忽略。request=', requestId);
            continue;
          }
        }

        const { data: updated, error, count } = await supabase
          .from('classroom_requests')
          .update({ teacher_cancel_ack_at: new Date().toISOString() }, { count: 'exact' })
          .eq('id', requestId)
          .is('teacher_cancel_ack_at', null)
          .select('original_date');

        if (channelToken && event.replyToken) {
          let replyText;
          if (error) replyText = '⚠️ 確認失敗：' + error.message;
          else if (!count) replyText = 'ℹ️ 這筆通知可能已經確認過了';
          else replyText = '✅ 已確認收到，老師會盡快處理';
          await replyLine(channelToken, event.replyToken, replyText);
        }

        // 只有「這次真的是我讓它從 null 變成有值」（count>0）才通知老師，避免重複按/兩邊搶著按時推兩次
        if (!error && count && channelToken) {
          const teacherUserId = Deno.env.get('LINE_TEACHER_USER_ID');
          if (teacherUserId) {
            const odate = (updated && updated[0] && updated[0].original_date) || '-';
            await pushLine(channelToken, teacherUserId, 'ℹ️ 學生已確認收到取消通知（' + odate + '），可以到網站按「確認刪除」了');
          }
        }
        continue;
      }
      // action 未知的類型 → 忽略，不讓整個 webhook 掛掉
    } catch (e) {
      // 一個 event 出錯不影響其他 event（LINE 有時候一次會送多個 event 進來）
    }
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200, headers: { 'Content-Type': 'application/json' },
  });
});
