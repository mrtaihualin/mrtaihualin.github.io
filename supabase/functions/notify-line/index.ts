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

// 2026-08-08 (P7-03 defense-in-depth): จำกัด CORS จาก '*' เป็นโดเมนจริงของเว็บเท่านั้น —
// ตรวจแล้วฟังก์ชันนี้เรียกจาก classroom/index.html (ทั้งฝั่งครูล็อกอินตรง และฝั่งนักเรียน ?s=token)
// classroom/index.html ไม่มี LIFF SDK ฝังอยู่เลย (แม้บางครั้งนักเรียนจะเปิดหน้านี้ผ่านลิงก์ liff.line.me
// ที่ redirect เข้ามาก่อน — พอ redirect เสร็จ หน้านี้ก็เป็นหน้าเว็บปกติบนโดเมนเราเองแล้ว ไม่มี liff.init())
// + มีด่านตรวจตัวตนจริงอยู่แล้ว (ครู JWT หรือ fromStudentToken ที่มีจริง + notify_line_gate)
// CORS ผ่อนปรนเดิมไม่ได้ช่วยข้ามด่านนั้นได้ ดูรายงาน P7-03:
// /Users/taihualin/Documents/Claude/Backup/PROJECTS_ARCHIVE/HISTORY/2026-08-12_inbox-review-cleared/website/44_ผลลัพธ์_P7-03_จำกัดCORS.md
const ALLOWED_ORIGINS = [
  'https://mrtaihualin.com',
  'https://www.mrtaihualin.com',
  'https://mrtaihualin.github.io',
  // 2026-08-10 (P7-02 staging): หน้าทดสอบ staging บน Netlify
  'https://gentle-moxie-bf64ad.netlify.app',
];

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
// 2026-07-20 加（Lin 實測 mockup 後要求：老師一次提議好幾個時段時，畫面要改成「日期時間」
// 一行文字在左邊，「接受」「婉拒」兩顆小按鈕排在同一行的右邊——不要像原本那樣每個時段各自變成
// 一整條寫著「接受：7/21 05:30」的長按鈕）：新增選填的第 4 個參數 rows，每個元素是
// { label: '日期時間文字', buttons: [{label,postbackData 或 uri,style,color}, ...] }，
// 會排成 layout:'horizontal' 的一行（文字 flex:3 靠左、按鈕各 flex:2 排右邊）。
// 沒有帶 rows 的舊呼叫方式（例如取消/改期單顆按鈕的通知）完全不受影響，維持原本 footer 直式按鈕。
function buildFlexMessage(title, bodyText, buttons, rows) {
  const footerContents = (buttons || []).map((b) => ({
    type: 'button',
    style: b.style || 'secondary',
    height: 'sm',
    color: b.color || (b.style === 'primary' ? '#8B6310' : '#FAF4E8'),
    action: b.uri
      ? { type: 'uri', label: b.label.slice(0, 20), uri: b.uri }
      : { type: 'postback', label: b.label.slice(0, 20), data: b.postbackData, displayText: b.label },
  }));
  // 2026-07-22 改（Lin 回報：手機上按鈕文字被截斷「確認搬...」「查...」，看不清楚）：
  // 以前是「文字（flex:3）＋按鈕（各 flex:2）」全部塞在同一條橫線裡，按鈕分到的寬度太窄
  // （2 顆按鈕的情況每顆只有整行的 2/7≈28%，塞不下「確認新增」這種 4 個字，被迫截斷）。
  // 改成「文字自己一行（wrap，佔滿寬度）→ 按鈕另外一行橫排（平分寬度，flex:1）」，
  // 按鈕能拿到的寬度多很多（1 顆按鈕時整行都給它，2 顆按鈕時各拿一半），不會再被截斷。
  const rowContents = (rows || []).map(function (r, i) {
    return {
      type: 'box', layout: 'vertical', spacing: 'xs',
      margin: i > 0 ? 'md' : 'none',
      contents: [
        { type: 'text', text: String(r.label || ''), size: 'sm', color: '#1C1C1C', wrap: true },
        {
          type: 'box', layout: 'horizontal', spacing: 'sm',
          contents: (r.buttons || []).map((b) => ({
            type: 'button',
            style: b.style || 'secondary',
            height: 'sm',
            flex: 1,
            color: b.color || (b.style === 'primary' ? '#8B6310' : '#FAF4E8'),
            action: b.uri
              ? { type: 'uri', label: b.label.slice(0, 20), uri: b.uri }
              : { type: 'postback', label: b.label.slice(0, 20), data: b.postbackData, displayText: b.label },
          })),
        },
      ],
    };
  });
  const bodyContents = [
    { type: 'text', text: title, weight: 'bold', size: 'md', wrap: true, color: '#1C1C1C' },
    { type: 'text', text: bodyText, size: 'sm', color: '#6b6b6b', wrap: true },
  ];
  if (rowContents.length) {
    bodyContents.push({ type: 'separator', margin: 'md' });
    bodyContents.push.apply(bodyContents, rowContents);
  }
  return {
    type: 'flex',
    altText: title.slice(0, 400),
    contents: {
      type: 'bubble',
      body: { type: 'box', layout: 'vertical', spacing: 'md', contents: bodyContents },
      footer: footerContents.length
        ? { type: 'box', layout: 'vertical', spacing: 'sm', contents: footerContents }
        : undefined,
    },
  };
}

serve(async (req) => {
  const origin = req.headers.get('Origin') || '';
  const allowOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  function corsHeaders() {
    return {
      'Access-Control-Allow-Origin': allowOrigin,
      'Vary': 'Origin',
      'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
    };
  }
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

    // ── ตัวช่วย: ตรวจว่า Authorization ที่แนบมาเป็น session จริงของครูหรือเปล่า ──
    // (แยกออกมาเป็นฟังก์ชัน เพราะตอนนี้ใช้ทั้งสาขา to:'teacher' และ to:{studentToken})
    const authHeaderRaw = req.headers.get('Authorization') || '';
    async function callerIsTeacher() {
      const jwt = authHeaderRaw.replace(/^Bearer\s+/i, '');
      if (!jwt) return false;
      try {
        const asUser = createClient(Deno.env.get('SUPABASE_URL'), Deno.env.get('SUPABASE_ANON_KEY'), { global: { headers: { Authorization: authHeaderRaw } } });
        const { data: userData } = await asUser.auth.getUser(jwt);
        return (userData?.user?.email || '').toLowerCase() === 'mr.taihualin@gmail.com';
      } catch (_e) { return false; }
    }
    function clientIp() {
      const xff = req.headers.get('x-forwarded-for') || '';
      return (xff.split(',')[0] || '').trim() || req.headers.get('cf-connecting-ip') || 'unknown';
    }

    let targetUserId = null;

    if (to === 'teacher') {
      targetUserId = Deno.env.get('LINE_TEACHER_USER_ID');
      if (!targetUserId) {
        return new Response(JSON.stringify({ error: 'server not configured: missing LINE_TEACHER_USER_ID' }), {
          status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders() },
        });
      }
      // ══════════════════════════════════════════════════════════════════════
      // 2026-07-26 เพิ่ม (SECURITY FIRST — Lin สั่งแก้ หลังตรวจเจอ)
      // ปัญหาเดิม: สาขานี้ "เปิดโล่ง" ใครก็ได้ที่รู้ URL นี้ (ซึ่งอยู่ในโค้ดหน้าเว็บ ดูได้ทุกคน)
      //   ยิง POST พร้อมข้อความอะไรก็ได้ → เด้งเข้า LINE ส่วนตัวของ Lin ทันที ไม่จำกัดจำนวน
      //   = สแปม/ข้อความก่อกวนหา Lin ได้ไม่จำกัด
      // ทำไมถึงบังคับ "ต้องล็อกอินเป็นครู" เฉยๆ ไม่ได้:
      //   เพราะสาขานี้นักเรียน (ที่ไม่ได้ล็อกอิน) ต้องเรียกได้จริง ตอนส่งคำขอเลื่อน/ยกเลิกคาบ
      //   ถ้าปิดตายไปเลย Lin จะไม่ได้รับแจ้งเตือนจากนักเรียนอีกเลย = พังหนักกว่าเดิม
      // วิธีที่ใช้: ต้องพิสูจน์ตัวได้อย่างใดอย่างหนึ่ง
      //   (ก) เป็นครูจริง (มี session ของ Lin)  → ผ่าน ส่งอะไรก็ได้
      //   (ข) เป็นนักเรียนจริง (แนบ fromStudentToken ที่มีอยู่จริงในตาราง classroom_students)
      //       → ผ่าน แต่จำกัดความยาวข้อความ + จำกัดจำนวนครั้งต่อ IP (ผ่าน RPC notify_line_gate)
      //   (ค) พิสูจน์ไม่ได้ → 401 ไม่ส่ง
      // ⚠️ token ของนักเรียนคือลิงก์ส่วนตัวของเขา คนนอกไม่มีทางรู้ → ยกระดับความยากขึ้นมาก
      //    และถึงรู้ ก็ยังโดนจำกัดจำนวนครั้ง + ตามรอยได้ว่ามาจาก token ไหน
      // ══════════════════════════════════════════════════════════════════════
      if (!(await callerIsTeacher())) {
        const fromStudentToken = body?.fromStudentToken;
        if (!fromStudentToken || typeof fromStudentToken !== 'string') {
          return new Response(JSON.stringify({ error: 'unauthorized — 必須是老師本人，或附上有效的學生 token（fromStudentToken）' }), {
            status: 401, headers: { 'Content-Type': 'application/json', ...corsHeaders() },
          });
        }
        const admin = createClient(Deno.env.get('SUPABASE_URL'), Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'));
        // ด่านรวม: token มีจริงไหม + ยิงถี่เกินไปไหม (นับต่อ IP) — ตัดสินฝั่งฐานข้อมูล
        // ถ้ายังไม่ได้รัน SQL ตัวนี้ (RPC ไม่มี) → ถอยไปเช็คแค่ว่า token มีจริง จะได้ไม่พังทั้งระบบ
        let gateOk = null;
        try {
          const { data: gate, error: gateErr } = await admin.rpc('notify_line_gate', { p_token: fromStudentToken, p_ip: clientIp() });
          if (gateErr) {
            // RELIABILITY FIRST: ถ้าด่านนี้พัง ต้องมีร่องรอยใน log เสมอ ห้ามเสื่อมสภาพเงียบๆ
            console.warn('[notify-line] notify_line_gate ใช้ไม่ได้ → ถอยไปเช็คแค่ว่า token มีจริง:', gateErr.message);
          } else {
            gateOk = gate === true;
          }
        } catch (e) {
          console.warn('[notify-line] เรียก notify_line_gate ไม่สำเร็จ:', String(e && e.message || e));
          gateOk = null;
        }
        if (gateOk === null) {
          const { data: stu } = await admin.from('classroom_students').select('token').eq('token', fromStudentToken).maybeSingle();
          gateOk = !!stu;
        }
        if (!gateOk) {
          return new Response(JSON.stringify({ error: 'unauthorized or rate limited' }), {
            status: 401, headers: { 'Content-Type': 'application/json', ...corsHeaders() },
          });
        }

        // ── จำกัดเนื้อหาที่คนที่ "ไม่ใช่ครู" ส่งเข้า LINE ของ Lin ได้ ──────────────
        // 2026-07-26：เดิมจำกัดแค่ความยาวของ message — แต่ถ้าส่ง body.flex มาด้วย
        // ตัว message จะถูกข้ามไปเลย (ดูข้างล่าง) → จำกัดความยาวไม่มีผลอะไรเลย
        // ต้องจำกัด title/bodyText ของ flex ด้วย
        const flexIn = body?.flex;
        const flexTextLen = String(flexIn?.title || '').length + String(flexIn?.bodyText || '').length;
        if (message.length > 1200 || flexTextLen > 1200) {
          return new Response(JSON.stringify({ error: 'message too long' }), {
            status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders() },
          });
        }
        // ⚠️ ปุ่มในข้อความ flex อันตรายกว่าตัวข้อความมาก:
        //    ปุ่ม postback = พอ Lin กด ระบบจะไป "ทำงานจริง" (เช่นสร้างคาบใน Calendar)
        //    ปุ่ม uri      = พา Lin ไปเว็บไหนก็ได้ (ลิงก์หลอก/ฟิชชิ่ง)
        //    line-webhook ตรวจแค่ว่า "คนกดคือครู" ไม่ได้ตรวจว่าปุ่มนั้นถูกสร้างมาจากไหน
        //    → คนที่ไม่ใช่ครู ส่งปุ่มได้เฉพาะชุดที่ระบบเราใช้จริงเท่านั้น และลิงก์ต้องเป็นเว็บเราเท่านั้น
        // รายการนี้ = ปุ่มทุกแบบที่หน้าเว็บฝั่งนักเรียนส่งจริง (ไล่เก็บจาก classroom/index.html ครบแล้ว)
        // เพิ่มปุ่มใหม่ฝั่งนักเรียนเมื่อไหร่ ต้องมาเติมชื่อ action ที่นี่ด้วย ไม่งั้นปุ่มจะถูกปฏิเสธ 400
        const ALLOWED_ACTIONS = new Set([
          'check_conflict', 'confirm_add_class', 'decline_add_class',
          'ack_teacher_add', 'ack_teacher_cancel', 'confirm_cancel_delete',
          'confirm_reschedule_pick', 'confirm_reschedule_move',
          'accept_offer', 'decline_offer', 'start_contact_student',
        ]);
        const buttonAllowed = (b) => {
          if (!b || typeof b !== 'object') return false;
          if (b.uri) return /^https:\/\/(mrtaihualin\.com|calendar\.google\.com)\//.test(String(b.uri));
          const act = new URLSearchParams(String(b.postbackData || '')).get('action') || '';
          return ALLOWED_ACTIONS.has(act);
        };
        const allButtons = [
          ...(Array.isArray(flexIn?.buttons) ? flexIn.buttons : []),
          ...(Array.isArray(flexIn?.rows) ? flexIn.rows.flatMap((r) => (Array.isArray(r?.buttons) ? r.buttons : [])) : []),
        ];
        if (allButtons.some((b) => !buttonAllowed(b))) {
          console.warn('[notify-line] ปฏิเสธปุ่มที่ไม่อยู่ในรายการอนุญาต จาก token:', String(fromStudentToken).slice(0, 6));
          return new Response(JSON.stringify({ error: 'button not allowed' }), {
            status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders() },
          });
        }

        // ══════════════════════════════════════════════════════════════════════
        // 🟠 2026-07-31 เพิ่ม (งาน C8) — เกราะชั้นที่ 2: ตรวจว่าปุ่ม "ชี้ไปคำขอของใคร"
        //
        // ช่องโหว่เดิม: ด้านบนตรวจแค่ "ชื่อปุ่ม" ว่าอยู่ในรายการอนุญาตไหม
        //   แต่ไม่เคยตรวจว่า "เลขคำขอ" ที่ฝังในปุ่มเป็นของนักเรียนคนที่ส่งมาจริงหรือเปล่า
        //   ฝั่งรับ (line-webhook) ก็ตรวจแค่ "คนกดคือครูไหม"
        //   → นักเรียน ก. แต่งการ์ดที่ดูน่าเชื่อ ให้ปุ่มชี้ไปคำขอของนักเรียน ข.
        //     Lin กดเอง = คาบของ ข. ถูกลบ/สร้าง/ย้าย และทุกด่านปลายทางผ่านหมด เพราะครูเป็นคนกดจริง
        //   ข้อจำกัดที่ทำให้ยังไม่ใช่สีแดง: ต้องรู้เลขคำขอ (UUID) ของคนอื่นก่อน ซึ่งเดาไม่ได้
        //   แต่นี่คือปุ่มที่อันตรายที่สุดในระบบ ควรมีเกราะชั้นสอง
        //
        // กฎที่ใช้: ปุ่มไหน "ไม่มีเลขคำขอ" → ปล่อยผ่านเหมือนเดิม (การ์ดปกติของนักเรียนต้องส่งได้)
        //          ปุ่มไหน "มีเลขคำขอ" → แถวนั้นต้องเป็นของ token คนที่ส่งมาเท่านั้น
        // ⚠️ อ่านฐานข้อมูลไม่ได้ = ปฏิเสธ (ปลอดภัยไว้ก่อน) และเขียน log ทุกครั้ง ห้ามเงียบ
        // ══════════════════════════════════════════════════════════════════════
        const requestIdsInButtons = [];
        for (const btn of allButtons) {
          if (!btn || btn.uri) continue;
          const rid = new URLSearchParams(String(btn.postbackData || '')).get('request');
          if (rid) requestIdsInButtons.push(rid);
        }
        if (requestIdsInButtons.length) {
          const uniqueIds = [...new Set(requestIdsInButtons)];
          const { data: ownRows, error: ownErr } = await admin
            .from('classroom_requests')
            .select('id, token')
            .in('id', uniqueIds);
          if (ownErr) {
            console.error('[notify-line] ⚠️ ตรวจเจ้าของคำขอไม่ได้ → ปฏิเสธไว้ก่อน:', ownErr.message);
            return new Response(JSON.stringify({ error: 'cannot verify request ownership' }), {
              status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders() },
            });
          }
          const foundIds = new Set((ownRows || []).map((r) => String(r.id)));
          const notMine = (ownRows || []).filter((r) => r.token !== fromStudentToken);
          const missing = uniqueIds.filter((id) => !foundIds.has(String(id)));
          if (notMine.length || missing.length) {
            console.error('[notify-line] 🛑 ปฏิเสธ: ปุ่มชี้ไปคำขอที่ไม่ใช่ของผู้ส่ง. token=',
              String(fromStudentToken).slice(0, 6), 'ไม่ใช่ของตัวเอง=', notMine.length, 'หาไม่เจอ=', missing.length);
            return new Response(JSON.stringify({ error: 'button targets a request that does not belong to you' }), {
              status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders() },
            });
          }
        }

        // ══════════════════════════════════════════════════════════════════════
        // 🟠 2026-07-31 เพิ่ม (แก้จุดที่เกราะด้านบนจับไม่ถึง) — ปุ่ม 💬 聯繫學生
        // (action=start_contact_student) ไม่ได้ใช้ request= เหมือนปุ่มอื่น แต่ใช้ token=
        // (บอกว่าครูจะพิมพ์ข้อความหาใคร) → ด่าน requestIdsInButtons ด้านบนจับไม่ถึงปุ่มนี้
        // ถ้าไม่เช็ก นักเรียน ก. อาจแต่งการ์ดให้ token= ชี้ไปนักเรียน ข. แทน
        // Lin กดปุ่มแล้วพิมพ์ข้อความ → ข้อความหลุดไปหา ข. แทน (ไม่กระทบปฏิทิน แค่ข้อความผิดคน)
        // กฎ: ปุ่ม start_contact_student ทุกปุ่ม token= ต้องตรงกับ fromStudentToken (คนที่ยิง request นี้) เท่านั้น
        // ══════════════════════════════════════════════════════════════════════
        for (const btn of allButtons) {
          if (!btn || btn.uri) continue;
          const params = new URLSearchParams(String(btn.postbackData || ''));
          if (params.get('action') !== 'start_contact_student') continue;
          const btnToken = params.get('token') || '';
          if (btnToken !== fromStudentToken) {
            console.error('[notify-line] 🛑 ปฏิเสธ: ปุ่ม 聯繫學生 token ไม่ตรงกับผู้ส่ง. fromToken=',
              String(fromStudentToken).slice(0, 6));
            return new Response(JSON.stringify({ error: 'contact button targets a token that does not belong to you' }), {
              status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders() },
            });
          }
        }
      }
    } else if (to && typeof to === 'object' && to.studentToken) {
      // 2026-07-19 加（SECURITY FIRST，稽核發現）：เดิมสาขานี้ไม่มีการตรวจสิทธิ์เลย — ใครก็ยิง
      // request ตรงมาที่ url นี้พร้อม studentToken + message อะไรก็ได้ (ใช้แค่ anon key สาธารณะ)
      // ก็ปลอมข้อความส่งราวกับเป็นครูไปหานักเรียนคนไหนก็ได้ทันที (ยิ่งเสี่ยงขึ้นหลังเพิ่ม feature
      // 💬 聯絡學生 ที่ครูพิมพ์ข้อความอิสระได้ — sendContactStudentMessage ใน classroom/index.html)
      // ต่างจากสาขา to==='teacher' ด้านบนที่ต้องเปิดไว้แบบเดิม เพราะนักเรียนต้องเรียกได้เองตอนส่ง
      // คำขอเปลี่ยน/ยกเลิกคาบ โดยไม่ได้ล็อกอินเป็นครู — ตอนนี้เฉพาะสาขานี้บังคับต้องมี session จริง
      // ของครูแนบมาด้วยเสมอ วิธีเดียวกับ unlink-line-student/restore-line-student (ฝั่งเว็บต้องเปลี่ยน
      // Authorization ของการเรียก to:{studentToken} จาก anonKey เป็น teacherAuthHeader() ด้วย)
      // 2026-07-26：ย้ายตรรกะตรวจครูไปเป็นฟังก์ชัน callerIsTeacher() ข้างบน (ใช้ร่วมกับสาขา to:'teacher')
      if (!(await callerIsTeacher())) {
        return new Response(JSON.stringify({ error: 'unauthorized — 只有老師本人登入後才能傳訊息給指定學生' }), {
          status: 401, headers: { 'Content-Type': 'application/json', ...corsHeaders() },
        });
      }

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
      const flexMsg = buildFlexMessage(flex.title, flex.bodyText, flex.buttons || [], flex.rows || []);
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
