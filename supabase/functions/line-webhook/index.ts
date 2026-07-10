// ════════════════════════════════════════════════════════════
// Supabase Edge Function: line-webhook
// หน้าที่: รับ Webhook event จาก LINE (ตอนครูกดปุ่มในข้อความ Flex Message ที่ notify-line ส่งไป)
//   ตอนนี้รองรับ postback action เดียว: "อนุมัติ/ยกเลิก คำขอเปลี่ยน-ยกเลิกคาบ" ของนักเรียน
//   → อัปเดต classroom_requests.status ให้ตรง แล้วตอบกลับ (reply) ยืนยันสั้นๆ ใน LINE เลย
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
      const action = params.get('action'); // "approve" | "deny"
      const token = params.get('token');
      const type = params.get('type');
      const odate = params.get('odate');

      if (!action || !token || !type || !odate) continue; // ข้อมูลไม่ครบ ข้ามไป ไม่ให้ทั้ง webhook พัง

      const newStatus = action === 'approve' ? 'approved' : 'denied';
      const { error, count } = await supabase
        .from('classroom_requests')
        .update({ status: newStatus }, { count: 'exact' })
        .eq('token', token)
        .eq('request_type', type)
        .eq('original_date', odate)
        .eq('status', 'pending');

      if (channelToken && event.replyToken) {
        let replyText;
        if (error) replyText = '⚠️ 更新失敗：' + error.message;
        else if (!count) replyText = 'ℹ️ 這筆申請可能已經被處理過了（找不到還在 pending 的紀錄）';
        else replyText = newStatus === 'approved' ? '✅ 已標記「已處理」' : '❌ 已標記「婉拒」';
        await replyLine(channelToken, event.replyToken, replyText);
      }
    } catch (e) {
      // 一個 event 出錯不影響其他 event（LINE 有時候一次會送多個 event 進來）
    }
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200, headers: { 'Content-Type': 'application/json' },
  });
});
