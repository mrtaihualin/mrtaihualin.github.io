// ════════════════════════════════════════════════════════════
// Supabase Edge Function: link-line
// หน้าที่: รับ idToken จากหน้า classroom/line-link.html (LIFF)
//   1. เอา idToken ไปยืนยันกับ LINE เอง (https://api.line.me/oauth2/v2.1/verify)
//      → กัน "ใครก็ส่ง userId มั่วๆ มาผูกกับ token คนอื่น" (ไม่เชื่อค่าจาก browser ตรงๆ)
//   2. ถ้ายืนยันผ่าน → เอา userId (claim "sub") ที่ยืนยันแล้วมาเขียนลง
//      classroom_students.line_user_id (ด้วย service role key ฝั่ง server เท่านั้น)
//
// วิธี deploy (ทำต่อจาก notify-line ได้เลย ใช้ secret ชุดเดียวกันบางส่วน):
//   1. supabase secrets set LIFF_CHANNEL_ID=xxxxxxxx
//      ⚠️ 2026-07-06 แก้ไข: LINE เปลี่ยนกฎ ใส่ LIFF ใน Messaging API channel ตรงๆ ไม่ได้แล้ว
//      ต้องสร้าง channel แยกแบบ "LINE Login" ต่างหาก (อยู่ Provider เดียวกัน) แล้วสร้าง LIFF ในนั้น
//      → LIFF_CHANNEL_ID ที่ต้องใส่ตรงนี้ คือ Channel ID ของ channel "LINE Login" ตัวนั้น
//      (สังเกตง่ายๆ: ตัวเลขก่อนขีด "-" ใน LIFF ID เช่น "2010620934-5MFOEYBX" ก็คือค่านี้เลย ไม่ต้องไปหาที่อื่น)
//   2. supabase functions deploy link-line
//   (ไม่ต้องตั้ง SUPABASE_SERVICE_ROLE_KEY เอง — Supabase ใส่ให้อัตโนมัติทุก Edge Function อยู่แล้ว)
//   3. (เพิ่ม 2026-07-13, ไม่บังคับ) หลังสร้าง "เมนูนักเรียน" ใน LINE Official Account Manager เสร็จ:
//      supabase secrets set STUDENT_RICH_MENU_ID=richmenu-xxxxxxxx
//      → ผูกบัญชีสำเร็จจะสลับ Rich Menu ของคนนั้นเป็นเมนูนักเรียนให้อัตโนมัติ (ใช้ LINE_CHANNEL_ACCESS_TOKEN ตัวเดิม)
// ════════════════════════════════════════════════════════════

// deno-lint-ignore-file
// @ts-nocheck

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
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
    const { token, accessToken } = await req.json();
    if (!token || !accessToken) {
      return new Response(JSON.stringify({ error: 'missing token/accessToken' }), {
        status: 400, headers: { 'Content-Type': 'application/json', ...corsHeaders() },
      });
    }

    const liffChannelId = Deno.env.get('LIFF_CHANNEL_ID');
    if (!liffChannelId) {
      return new Response(JSON.stringify({ error: 'server not configured: missing LIFF_CHANNEL_ID' }), {
        status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders() },
      });
    }

    // 2026-07-11 改用 access token（不用 idToken）：idToken 1 小時就過期常壞（"IdToken expired"），
    //   access token 由 LIFF SDK 自動維護。安全性一樣：browser 無法偽造有效的 LINE token。
    // 1) 先跟 LINE 驗證這個 access token「是不是發給我們這個 channel 的、還沒過期」
    const verifyRes = await fetch(
      'https://api.line.me/oauth2/v2.1/verify?access_token=' + encodeURIComponent(accessToken)
    );
    if (!verifyRes.ok) {
      const errText = await verifyRes.text();
      return new Response(JSON.stringify({ error: 'LINE access token verify failed', detail: errText }), {
        status: 401, headers: { 'Content-Type': 'application/json', ...corsHeaders() },
      });
    }
    const verified = await verifyRes.json();
    // client_id 一定要等於我們自己的 channel ID，否則是別的 channel 的 token 偷拿來用
    if (String(verified.client_id) !== String(liffChannelId)) {
      return new Response(JSON.stringify({ error: 'channel mismatch', detail: 'token client_id=' + verified.client_id }), {
        status: 401, headers: { 'Content-Type': 'application/json', ...corsHeaders() },
      });
    }

    // 2) 用已驗證的 access token 跟 LINE 拿「真正的 userId」（browser 無法偽造）
    const profRes = await fetch('https://api.line.me/v2/profile', {
      headers: { Authorization: 'Bearer ' + accessToken },
    });
    if (!profRes.ok) {
      const errText = await profRes.text();
      return new Response(JSON.stringify({ error: 'LINE profile fetch failed', detail: errText }), {
        status: 401, headers: { 'Content-Type': 'application/json', ...corsHeaders() },
      });
    }
    const prof = await profRes.json();
    const lineUserId = prof.userId; // LINE 驗證過的真正 userId
    if (!lineUserId) {
      return new Response(JSON.stringify({ error: 'no userId from LINE profile' }), {
        status: 401, headers: { 'Content-Type': 'application/json', ...corsHeaders() },
      });
    }

    // 2.5) 2026-07-16 ด่านบังคับ "ต้องแอด OA เป็นเพื่อนก่อนถึงจะผูกได้" (SECURITY/RELIABILITY FIRST)
    //   บทเรียนจริง 2026-07-16: นักเรียน 3 คนผูกบัญชีสำเร็จแต่ไม่เคยแอด OA →
    //   LINE push ตอบ 200 "สำเร็จ" แต่ทิ้งข้อความเงียบๆ ทุกครั้ง (พฤติกรรมทางการของ LINE:
    //   https://developers.line.biz/en/docs/messaging-api/sending-messages/) → เตือนก่อนเรียน/ทักทาย ไม่เคยถึงใครเลย
    //   วิธีเช็ค: GET /v2/bot/profile/{userId} ด้วย channel token ของ OA
    //   → 200 = เป็นเพื่อนกัน (ส่งข้อความถึงแน่) · 404 = ยังไม่แอด/บล็อกอยู่ → ไม่ให้ผูก บอกให้แอดก่อน
    const botToken = Deno.env.get('LINE_CHANNEL_ACCESS_TOKEN');
    if (botToken) {
      const friendRes = await fetch(
        'https://api.line.me/v2/bot/profile/' + encodeURIComponent(lineUserId),
        { headers: { Authorization: 'Bearer ' + botToken } }
      );
      if (!friendRes.ok) {
        // 404 = ยังไม่ได้แอด OA เป็นเพื่อน (หรือบล็อกอยู่) → ผูกไม่ผ่าน ให้หน้าเว็บโชว์ปุ่มแอดเพื่อน
        return new Response(JSON.stringify({ error: 'not_friend', detail: 'user has not added the OA as friend (or blocked it)' }), {
          status: 403, headers: { 'Content-Type': 'application/json', ...corsHeaders() },
        });
      }
    }
    // ถ้าไม่มี botToken (secret ยังไม่ตั้ง) → ข้ามด่านนี้ไปก่อน ไม่ทำให้การผูกพังทั้งระบบ

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL'),
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    );

    // 2026-07-16 เพิ่ม: เช็คของเดิมก่อน update — ต้องรู้ว่าเป็นการ "ผูกครั้งแรก/เปลี่ยนบัญชี LINE ใหม่จริงๆ"
    //   หรือแค่ "ผูกซ้ำอันเดิม" (เช่น เน็ตหลุดกลางทาง หน้าเว็บขึ้น error ทั้งที่ server เขียนสำเร็จแล้ว
    //   นักเรียนเลยกดลิงก์ซ้ำ) — กันไม่ให้ส่งข้อความต้อนรับซ้ำเวลาผูกซ้ำอันเดิม
    const { data: existingRow, error: selError } = await supabase
      .from('classroom_students')
      .select('line_user_id, name')
      .eq('token', token)
      .maybeSingle();

    if (selError) {
      return new Response(JSON.stringify({ error: 'db lookup failed', detail: selError.message }), {
        status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders() },
      });
    }
    if (!existingRow) {
      return new Response(JSON.stringify({ error: 'token not found' }), {
        status: 404, headers: { 'Content-Type': 'application/json', ...corsHeaders() },
      });
    }
    const isFirstOrChangedLink = existingRow.line_user_id !== lineUserId;
    const studentLabel = existingRow.name || token;

    // 3) เขียนลง Supabase ด้วย service role (bypass RLS, รันฝั่ง server เท่านั้น ไม่มีทางเรียกจาก browser ได้)
    const { error, count } = await supabase
      .from('classroom_students')
      .update({ line_user_id: lineUserId }, { count: 'exact' })
      .eq('token', token);

    if (error) {
      return new Response(JSON.stringify({ error: 'db update failed', detail: error.message }), {
        status: 500, headers: { 'Content-Type': 'application/json', ...corsHeaders() },
      });
    }
    if (!count) {
      return new Response(JSON.stringify({ error: 'token not found' }), {
        status: 404, headers: { 'Content-Type': 'application/json', ...corsHeaders() },
      });
    }

    // 2026-07-13 เพิ่ม: ผูกบัญชีสำเร็จ → สลับ Rich Menu ของคนนี้เป็น "เมนูนักเรียน" (มีปุ่ม 我的教室 เพิ่ม)
    //   ไม่บังคับต้องตั้งค่า — ถ้า Lin ยังไม่สร้างเมนูนักเรียน/ยังไม่ตั้ง secret ก็ข้ามไปเฉยๆ ไม่ทำให้การผูกบัญชีล้มเหลว
    //   ตั้งค่า: supabase secrets set STUDENT_RICH_MENU_ID=richmenu-xxxxxxxx (เอาจาก LINE Official Account Manager
    //   หลังสร้างเมนูนักเรียนเสร็จ) — ใช้ LINE_CHANNEL_ACCESS_TOKEN ตัวเดียวกับที่ notify-line ใช้อยู่แล้ว
    const studentRichMenuId = Deno.env.get('STUDENT_RICH_MENU_ID');
    const channelAccessToken = Deno.env.get('LINE_CHANNEL_ACCESS_TOKEN');
    if (studentRichMenuId && channelAccessToken) {
      try {
        await fetch(
          'https://api.line.me/v2/bot/user/' + encodeURIComponent(lineUserId) + '/richmenu/' + encodeURIComponent(studentRichMenuId),
          { method: 'POST', headers: { Authorization: 'Bearer ' + channelAccessToken } }
        );
        // ไม่เช็ค response ผลลัพธ์ต่อ (ไม่ critical) — ผูกบัญชีถือว่าสำเร็จแล้วไม่ว่าสลับเมนูจะติดปัญหาหรือไม่
      } catch (e) {
        // เงียบไว้ ไม่ทำให้ทั้ง request ล้มเหลว — เมนูสลับไม่ได้ก็ยังใช้ปุ่มเดิมได้ ไม่กระทบการเรียน
      }
    }

    // 2026-07-16 เพิ่ม: ผูกบัญชีสำเร็จ (ครั้งแรก/เปลี่ยนบัญชีใหม่เท่านั้น — ไม่ใช่ผูกซ้ำอันเดิม) →
    //   ส่งสำเนาให้ครู (Lin) ก่อนเสมอ แล้วค่อยส่งข้อความต้อนรับหานักเรียน (ตามที่ Lin สั่ง 2026-07-16)
    //   กติกา: ครูติด (ส่งหาครูไม่สำเร็จ) → นักเรียนก็ติด (ข้ามไม่ส่งรอบนี้) / ครูไม่ติด → นักเรียนก็ไม่ติด
    //   ใช้แพทเทิร์นเดียวกับ low-quota-cron (secret LINE_TEACHER_USER_ID ตัวเดิม ไม่ต้องตั้งใหม่)
    //   ⚠️ ต่างจาก low-quota-cron ตรงที่นี่เป็นเหตุการณ์ครั้งเดียว ไม่มี cron รันซ้ำวันถัดไป — ถ้าส่งหาครู
    //   พังรอบนี้ นักเรียนจะไม่ได้ข้อความต้อนรับเลย (ไม่ auto retry) แจ้ง Lin ไว้แล้วตอนเสนองาน
    //   ห่อ try/catch ทั้งคู่ + log error ไว้เสมอ (เช็คได้จาก Supabase Dashboard → Edge Functions → Logs)
    //   — ส่งข้อความไม่ได้ ก็ห้ามทำให้การผูกบัญชีล้มเหลว (ผูกบัญชีสำคัญกว่า)
    if (isFirstOrChangedLink && channelAccessToken) {
      const welcomeText = '帳號連結成功 🎉\n你好！我是泰華 🙏\n之後的上課提醒、改期通知，都會從這裡自動傳給你\n有任何課程問題，直接在這裡留言就可以囉 😊';
      const teacherUserId = Deno.env.get('LINE_TEACHER_USER_ID');
      let teacherOk = true;
      if (teacherUserId) {
        try {
          await fetch('https://api.line.me/v2/bot/message/push', {
            method: 'POST',
            headers: { Authorization: 'Bearer ' + channelAccessToken, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              to: teacherUserId,
              messages: [{ type: 'text', text: '📋 ' + studentLabel + ' 剛連結 LINE 帳號成功，已發送以下歡迎訊息給他：\n\n' + welcomeText }],
            }),
          });
        } catch (e) {
          teacherOk = false;
          console.error('[link-line] ส่งสำเนาให้ครูไม่สำเร็จ — ข้ามไม่ส่งข้อความต้อนรับหานักเรียนรอบนี้:', e);
        }
      }
      if (teacherOk) {
        try {
          await fetch('https://api.line.me/v2/bot/message/push', {
            method: 'POST',
            headers: { Authorization: 'Bearer ' + channelAccessToken, 'Content-Type': 'application/json' },
            body: JSON.stringify({ to: lineUserId, messages: [{ type: 'text', text: welcomeText }] }),
          });
        } catch (e) {
          console.error('[link-line] ส่งข้อความต้อนรับให้นักเรียนไม่สำเร็จ:', e);
        }
      }
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
