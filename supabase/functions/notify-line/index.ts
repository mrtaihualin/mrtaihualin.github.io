// ════════════════════════════════════════════════════════════
// Supabase Edge Function: notify-line
// หน้าที่: เป็นตัวกลางถือ LINE Channel Access Token ไว้อย่างปลอดภัย (ไม่ฝังในเว็บ)
//         แล้วส่งข้อความ LINE แทนเว็บ (เว็บเป็น static site เก็บ secret ไว้ไม่ได้)
//
// รองรับ 2 แบบใช้งาน:
//   1) แจ้งเตือน Lin เอง (เช่น นักเรียนขอเปลี่ยนวัน/ยกเลิก) → body: { to: "teacher", message }
//   2) ส่งหานักเรียนคนใดคนหนึ่ง (เช่น จะเพิ่มปุ่ม "ส่งข้อความหานักเรียน" ในหน้าครูทีหลัง)
//      → body: { to: { studentToken: "xxx" }, message }
//      ★ ปลอดภัย: ฟังก์ชันนี้ค้นหา line_user_id เองจาก token ฝั่ง server (ใช้ service role)
//        ไม่เชื่อ userId ที่ browser ส่งมาตรงๆ เด็ดขาด — กันมีคนยิง userId ปลอมส่งสแปมหาใครก็ได้
//   (ระบบแจ้งเตือนก่อน/หลังเรียนอัตโนมัติจริงๆ อยู่ใน class-reminder-cron แยกต่างหาก
//    เพราะรันเป็น cron ไม่ได้ถูกเรียกจากเว็บ แต่ใช้หลักการเดียวกัน)
//
// 2026-07-10 เพิ่ม: body.flex = { title, bodyText, buttons: [{label, uri}|{label, postbackData, style}] }
//   → ส่งเป็นข้อความมีปุ่มกดแทนข้อความธรรมดา ปุ่ม postback ต้องมี line-webhook (ดูไฟล์ supabase/functions/line-webhook)
//   คอยรับ event แล้วอัปเดตฐานข้อมูล — ถ้าไม่ deploy line-webhook ปุ่ม postback จะกดได้แต่ไม่มีอะไรเกิดขึ้น
//   (ปุ่ม uri เช่นลิงก์ Google Calendar ใช้ได้เลยไม่ต้องพึ่ง line-webhook)
//
// วิธี deploy (Lin ต้องทำเอง เพราะ AI ไม่มีสิทธิ์ล็อกอิน Supabase ของ Lin):
//   1. ติดตั้ง Supabase CLI (ครั้งเดียว): npm install -g supabase
//   2. supabase login
//   3. supabase link --project-ref qzkxlhpcputsvbqmtqfi
//   4. ตั้งค่า secret (ใส่ค่าจริงที่ได้จาก LINE Developers Console):
//      supabase secrets set LINE_CHANNEL_ACCESS_TOKEN=xxxxxxxx
//      supabase secrets set LINE_TEACHER_USER_ID=xxxxxxxx
//   5. Deploy: supabase functions deploy notify-line
//   6. ทดสอบ: ยิง POST ทดสอบด้วย curl หรือ Postman ก่อน แล้วค่อยเปลี่ยนโค้ดฝั่งเว็บให้เรียกจริง
//
// วิธีหา LINE_TEACHER_USER_ID (userId ของ Lin เอง):
//   - เปิด LINE Official Account Manager → ตั้งค่า → Messaging API → เปิดใช้งาน
//   - เพิ่ม OA เป็นเพื่อนจาก LINE ส่วนตัวของ Lin (ถ้ายังไม่ได้เพิ่ม)
//   - ส่งข้อความอะไรก็ได้หา OA 1 ครั้ง → ดู userId จาก Webhook log ใน LINE Developers Console
// ════════════════════════════════════════════════════════════

// deno-lint-ignore-file
// @ts-nocheck  (Supabase Edge Function รันบน Deno ไม่ใช่ Node — เวลาแก้ไฟล์นี้ในเครื่องอาจมี type error ของ IDE ปกติ ไม่กระทบตอน deploy จริง)

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const LINE_PUSH_URL = 'https://api.line.me/v2/bot/message/push';

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
}

async function pushLineMessages(channelToken, targetUserId, messages) {
  const res = await fetch(LINE_PUSH_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + channelToken },
    body: JSON.stringify({ to: targetUserId, messages }),
  });
  if (!res.ok) {
    const errText = await res.text();
    throw new Error('LINE API ' + res.status + ': ' + errText);
  }
}

async function pushLine(channelToken, targetUserId, message) {
  return pushLineMessages(channelToken, targetUserId, [{ type: 'text', text: String(message).slice(0, 4900) }]);
}

// 2026-07-10 เพิ่ม: ข้อความแบบมีปุ่มกด (Flex Message) ให้ครูกดตอบจากใน LINE ได้เลย
// ใช้กับ "แจ้งเตือนคำขอเปลี่ยน/ยกเลิกคาบ" — ปุ่ม uri = เปิดลิงก์ (เช่น Google Calendar)
// ปุ่ม postback = ส่งข้อมูลกลับมาที่ line-webhook (ไม่เปิดหน้าเว็บใดๆ) ให้ไปอัปเดตฐานข้อมูลแทน
// buttons: [{ label, uri }] หรือ [{ label, postbackData }]
// 2026-07-13 แก้ (Lin สั่ง): เดิมปุ่ม primary ไม่ใส่ color จะออกเป็นสีเขียวเริ่มต้นของ LINE ไม่ตรงธีมเว็บ
// (Lin ห้ามใช้สีเขียวเด็ดขาด นอกจากปุ่ม LINE ทางการ) → ใส่สีทอง/ครีมของเว็บเป็นค่าเริ่มต้นเสมอ
// ยกเว้น caller จะส่ง b.color มาเอง (--gold-bright สำหรับ primary, --gold-light/ครีม สำหรับ secondary)
// 2026-07-13 แก้เพิ่ม: ห้ามใส่ emoji ✅/❌ ในปุ่ม เพราะ emoji มีสีเขียว/แดงตายตัวในตัวเอง
// ต่อให้ตั้ง color ของปุ่มเป็นอะไรก็ยังโผล่เขียว/แดงแทรกอยู่ดี ไม่ตรงธีม
function buildFlexMessage(title, bodyText, buttons) {
  const footerContents = (buttons || []).map((b) => ({
    type: 'button',
    style: b.style || 'secondary',
    height: 'sm',
    color: b.color || (b.style === 'primary' ? '#8B6310' : '#FAF4E8'),
    action: b.uri
      ? { type: 'uri', label: b.label.slice(0, 20), uri: b.uri }
      : { type: 'postback', label: b.label.slice(0, 20), data: b.postbackData, displayText: b.label },
  }));
  return {
    type: 'flex',
    altText: title.slice(0, 400),
    contents: {
      type: 'bubble',
      body: {
        type: 'box', layout: 'vertical', spacing: 'md',
        contents: [
          { type: 'text', text: title, weight: 'bold', size: 'md', wrap: true, color: '#1C1C1C' },
          { type: 'text', text: bodyText, size: 'sm', color: '#6b6b6b', wrap: true },
        ],
      },
      footer: footerContents.length
        ? { type: 'box', layout: 'vertical', spacing: 'sm', contents: footerContents }
        : undefined,
    },
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders() });
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'method not allowed' }), {
      status: 405, headers: { 'Content-Type': 'application/json', ...corsHeaders() },
    });
  }

  try {
    const body = await req.json();
    const to = body?.to;
    const message = body?.message;

    if (!to || !message || typeof message !== 'string') {
      return new Response(JSON.stringify({ error: 'missing to/message' }), {
        status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders() },
      });
    }

    const channelToken = Deno.env.get('LINE_CHANNEL_ACCESS_TOKEN');
    if (!channelToken) {
      return new Response(JSON.stringify({ error: 'server not configured: missing LINE_CHANNEL_ACCESS_TOKEN' }), {
        status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders() },
      });
    }

    let targetUserId = null;

    if (to === 'teacher') {
      targetUserId = Deno.env.get('LINE_TEACHER_USER_ID');
      if (!targetUserId) {
        return new Response(JSON.stringify({ error: 'server not configured: missing LINE_TEACHER_USER_ID' }), {
          status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders() },
        });
      }
    } else if (to && typeof to === 'object' && to.studentToken) {
      // ค้นหา line_user_id เองฝั่ง server ด้วย service role — ไม่รับ userId ตรงจาก client เด็ดขาด
      const supabase = createClient(Deno.env.get('SUPABASE_URL'), Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'));
      const { data, error } = await supabase
        .from('classroom_students')
        .select('line_user_id')
        .eq('token', to.studentToken)
        .maybeSingle();
      if (error || !data || !data.line_user_id) {
        return new Response(JSON.stringify({ error: 'student not linked to LINE yet' }), {
          status: 404, headers: { 'Content-Type': 'application/json', ...corsHeaders() },
        });
      }
      targetUserId = data.line_user_id;
    } else {
      return new Response(JSON.stringify({ error: 'invalid "to" target' }), {
        status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders() },
      });
    }

    // 2026-07-10 เพิ่ม: ถ้า client ส่ง body.flex มาด้วย (title/bodyText/buttons) → ส่งเป็นข้อความมีปุ่มกด
    // แทนข้อความธรรมดา (ใช้กับ "แจ้งเตือนคำขอเปลี่ยน/ยกเลิกคาบ" ให้ครูกดตอบจากใน LINE ได้เลย)
    // ไม่ส่ง body.flex มา → พฤติกรรมเดิมทุกอย่าง (ข้อความธรรมดา) ไม่กระทบของเดิม
    const flex = body?.flex;
    if (flex && flex.title && flex.bodyText) {
      const flexMsg = buildFlexMessage(flex.title, flex.bodyText, flex.buttons || []);
      await pushLineMessages(channelToken, targetUserId, [flexMsg]);
    } else {
      await pushLine(channelToken, targetUserId, message);
    }
    return new Response(JSON.stringify({ ok: true }), {
      status: 200, headers: { 'Content-Type': 'application/json', ...corsHeaders() },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e && e.message || e) }), {
      status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders() },
    });
  }
});
