// ════════════════════════════════════════════════════════════
// Supabase Edge Function: line-login
//
// ทำไมต้องมีฟังก์ชันนี้ (LIN 2026-07-26):
//   Custom OIDC Provider ของ Supabase (ที่ตั้งไว้ก่อนหน้านี้) ใช้กับ LINE ไม่ได้จริง
//   LINE เซ็น id_token แบบ HS256 ตอน "web login" แต่ Supabase custom provider คาดว่า
//   ต้องเป็น ES256 → พังทุกครั้ง ยืนยันจาก Supabase Auth log จริง:
//     "failed to verify ID token: oidc: id token signed with unsupported algorithm,
//      expected [\"ES256\"] got \"HS256\""
//   (อ้างอิง LINE เอง: https://developers.line.biz/en/docs/line-login/verify-id-token/
//    "for web login, HS256 (HMAC using SHA-256) is returned" — ไม่มีทางสั่งให้เปลี่ยนได้)
//   → เลยต้องเชื่อมเอง ไม่พึ่ง Supabase custom provider อีกต่อไป
//
// หน้าที่: รับ authorization code จาก LINE Login (ส่งมาจากหน้า line-callback.html)
//   1. เอา code ไปแลก id_token กับ LINE เอง (https://api.line.me/oauth2/v2.1/token)
//   2. เอา id_token ไปให้ LINE ตรวจลายเซ็นให้เอง (https://api.line.me/oauth2/v2.1/verify)
//      → ไม่เขียน crypto ตรวจลายเซ็นเอง (กันพลาด/กันช่องโหว่) ใช้ endpoint ทางการของ LINE แทน
//   3. เช็ค nonce ตรงกับที่ฝั่งเว็บส่งมาไหม (กัน replay), เช็ค aud ตรงกับ channel เราไหม
//   4. หา/สร้างผู้ใช้ Supabase ที่ผูกกับ LINE user id นี้ (ตาราง line_identities)
//   5. สร้าง "magic link" ให้ผู้ใช้คนนั้น (ไม่ส่งอีเมลจริง — synthetic) แล้วส่ง hashed_token
//      กลับไปให้เว็บ → เว็บเอาไปยืนยันเองด้วย verifyOtp() ได้ session จริง
//
// v2 (LIN 2026-07-26): เพิ่มโหมด "link" — ผูก LINE เข้ากับบัญชีที่ล็อกอินอยู่แล้ว แทนที่จะสร้าง
//   บัญชีใหม่ (เจอจริง: Lin ล็อกอินด้วย LINE แล้วได้บัญชีแยกจากบัญชีเดิม ไม่เชื่อมโปรไฟล์/คะแนนเก่า)
//   ใช้จากปุ่ม "連接 LINE 帳號" ในหน้าแก้โปรไฟล์ (auth-widget.js) — ต้องมี Authorization header
//   เป็น access token ของบัญชีที่ล็อกอินอยู่ตอนนั้น ฟังก์ชันจะยืนยัน token กับ Supabase auth server
//   เองก่อนเสมอ (ไม่เชื่อ user id ที่ client ส่งมาตรงๆ) ถ้า deploy ครั้งแรกไปแล้ว ให้กลับมา
//   copy โค้ดไฟล์นี้ไปวางทับ + Deploy ใหม่อีกรอบ (ไม่ต้องตั้งอะไรเพิ่มใน Dashboard)
//
// วิธี deploy:
//   1. ต้องรัน SQL migration ก่อน: supabase/sql/2026-07-26_line_identities.sql
//      (Supabase Dashboard → SQL Editor → วางทั้งไฟล์ → Run)
//   2. Supabase Dashboard → Edge Functions → Secrets → เพิ่ม:
//        LINE_CHANNEL_ID = (ตัวเลข Channel ID จาก LINE Developers Console channel "LINE Login")
//        LINE_CHANNEL_SECRET = (Channel secret ของ channel เดียวกัน)
//      (ค่าเดิมที่เคยใส่ใน Supabase custom provider "line" ตอนก่อนหน้านี้ เอามาใช้ซ้ำได้เลย)
//   3. Supabase Dashboard → Edge Functions → New Function → ชื่อ "line-login" → วางโค้ดไฟล์นี้ → Deploy
//      (ไม่ต้องตั้ง SUPABASE_SERVICE_ROLE_KEY เอง — Supabase ใส่ให้อัตโนมัติทุก Edge Function อยู่แล้ว)
//   4. LINE Developers Console → channel "LINE Login" → แท็บ "LINE Login" → Callback URL →
//      เพิ่มบรรทัดใหม่ (ของเดิมของ Supabase ไม่ต้องลบ ไม่กระทบกัน):
//        https://mrtaihualin.com/line-callback.html
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
function json(body, status) {
  return new Response(JSON.stringify(body), {
    status: status || 200,
    headers: { 'Content-Type': 'application/json', ...corsHeaders() },
  });
}
// อีเมล synthetic คำนวณจาก line_user_id เสมอ (deterministic ไม่ต้องเก็บซ้ำที่ไหน)
// ใช้โดเมน .invalid ตั้งใจ (สงวนไว้ตาม RFC 2606 ข้อ 2) รับประกันว่าไม่มีทางส่งอีเมลไปโดนใครจริงๆ
// ไม่ใช่อีเมลจริง — ใช้แค่เป็น key ให้ Supabase auth.users เท่านั้น (ไม่เคยส่งเมลออกจริง)
function syntheticEmail(lineUserId) {
  return 'line-' + lineUserId + '@users.line.invalid';
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders() });
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405);

  try {
    const { code, redirect_uri, nonce, link } = await req.json();
    if (!code || !redirect_uri || !nonce) return json({ error: 'missing code/redirect_uri/nonce' }, 400);

    const channelId = Deno.env.get('LINE_CHANNEL_ID');
    const channelSecret = Deno.env.get('LINE_CHANNEL_SECRET');
    if (!channelId || !channelSecret) {
      return json({ error: 'server not configured: missing LINE_CHANNEL_ID/LINE_CHANNEL_SECRET' }, 500);
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const supabase = createClient(supabaseUrl, serviceKey);

    // v2 (LIN 2026-07-26): โหมด "link" — ผูก LINE เข้ากับบัญชีที่ล็อกอินอยู่แล้ว (ไม่สร้างบัญชีใหม่)
    // ต้องรู้ตัวจริงว่า "ใครกำลังกดผูก" จาก JWT ใน header เท่านั้น (ห้ามเชื่อ user id ที่ client ส่งมาตรงๆ
    // เพราะปลอมได้ง่าย — ต้องให้ Supabase auth server ยืนยัน token ให้ก่อนเสมอ)
    let linkUserId = null;
    if (link) {
      const authHeader = req.headers.get('Authorization') || '';
      const accessToken = authHeader.replace(/^Bearer\s+/i, '');
      if (!accessToken) return json({ error: 'missing auth token for link mode' }, 401);
      const { data: authedUser, error: authErr } = await supabase.auth.getUser(accessToken);
      if (authErr || !authedUser || !authedUser.user) {
        return json({ error: 'invalid session — please log in again then retry linking' }, 401);
      }
      linkUserId = authedUser.user.id;
    }

    // กัน redirect_uri มั่วจากฝั่ง client — ต้องเป็นหน้า line-callback.html ของเราเองเท่านั้น
    // (LINE เองก็เช็คตรงนี้อยู่แล้วตอนแลก token แต่เช็คซ้ำฝั่งเราด้วย กันเผื่อ/ชัดเจนกว่า)
    let allowedHost = '';
    try { allowedHost = new URL(redirect_uri).hostname; } catch (e) { /* ปล่อยว่าง → ไม่ผ่านเช็คด้านล่าง */ }
    const allowedHosts = ['mrtaihualin.com', 'www.mrtaihualin.com', 'mrtaihualin.github.io'];
    if (!allowedHosts.includes(allowedHost) || !redirect_uri.endsWith('/line-callback.html')) {
      return json({ error: 'invalid redirect_uri' }, 400);
    }

    // 1) เอา code ไปแลก id_token กับ LINE (server-to-server เท่านั้น ไม่มี browser เกี่ยวข้อง)
    // https://developers.line.biz/en/docs/line-login/integrate-line-login/#get-access-token
    const tokenRes = await fetch('https://api.line.me/oauth2/v2.1/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri,
        client_id: channelId,
        client_secret: channelSecret,
      }),
    });
    if (!tokenRes.ok) {
      const t = await tokenRes.text();
      return json({ error: 'line_token_exchange_failed', detail: t.slice(0, 300) }, 401);
    }
    const tokenData = await tokenRes.json();
    const idToken = tokenData.id_token;
    if (!idToken) return json({ error: 'no id_token from LINE (scope ไม่มี openid?)' }, 401);

    // 2) ให้ LINE ตรวจลายเซ็น id_token ให้เอง (ไม่เขียน crypto ตรวจเอง กันพลาด/กันช่องโหว่)
    // https://developers.line.biz/en/docs/line-login/verify-id-token/#get-profile-info-from-id-token
    const verifyRes = await fetch('https://api.line.me/oauth2/v2.1/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ id_token: idToken, client_id: channelId }),
    });
    if (!verifyRes.ok) {
      const t = await verifyRes.text();
      return json({ error: 'line_id_token_verify_failed', detail: t.slice(0, 300) }, 401);
    }
    const claims = await verifyRes.json();

    // 3) เช็คให้ครบตามมาตรฐาน OIDC: aud ต้องเป็น channel เรา, nonce ต้องตรงกับที่ส่งไป (กัน replay)
    if (String(claims.aud) !== String(channelId)) return json({ error: 'aud_mismatch' }, 401);
    if (String(claims.nonce || '') !== String(nonce)) return json({ error: 'nonce_mismatch' }, 401);
    if (claims.exp && Date.now() / 1000 > claims.exp) return json({ error: 'id_token_expired' }, 401);
    const lineUserId = claims.sub;
    if (!lineUserId) return json({ error: 'no sub in id_token' }, 401);

    const displayName = claims.name || '';
    const avatarUrl = claims.picture || '';
    const userEmail = syntheticEmail(lineUserId);

    // v2 (LIN 2026-07-26): โหมด "link" จบตรงนี้เลย — ผูก line_user_id เข้ากับบัญชีที่ล็อกอินอยู่แล้ว
    // (linkUserId มาจาก JWT ที่ยืนยันแล้วด้านบน ไม่ใช่ค่าที่ client ส่งมาลอยๆ) ไม่สร้าง/ไม่ล็อกอินบัญชีใหม่
    if (linkUserId) {
      const { data: existingLink, error: findLinkErr } = await supabase
        .from('line_identities')
        .select('user_id')
        .eq('line_user_id', lineUserId)
        .maybeSingle();
      if (findLinkErr) return json({ error: 'db_lookup_failed', detail: findLinkErr.message }, 500);
      if (existingLink && existingLink.user_id && existingLink.user_id !== linkUserId) {
        // LINE นี้ผูกกับบัญชีอื่นไปแล้ว — กันคนละบัญชีมาแย่งผูก LINE เดียวกันซ้ำ
        return json({ error: 'already_linked_to_other_account' }, 409);
      }
      if (!existingLink) {
        const { error: mapErr } = await supabase
          .from('line_identities')
          .insert({ line_user_id: lineUserId, user_id: linkUserId });
        if (mapErr) return json({ error: 'map_insert_failed', detail: mapErr.message }, 500);
      }
      // ไม่ critical ถ้าพลาด — การผูกถือว่าสำเร็จแล้วตั้งแต่ insert บรรทัดบน
      try {
        await supabase.auth.admin.updateUserById(linkUserId, {
          app_metadata: { line_linked: true, line_user_id: lineUserId },
        });
      } catch (e) {}
      return json({ ok: true, linked: true });
    }

    // 4) หา user เดิมที่เคยผูกกับ LINE user id นี้ก่อน (ตาราง line_identities — คีย์คือ line_user_id)
    const { data: existing, error: findErr } = await supabase
      .from('line_identities')
      .select('user_id')
      .eq('line_user_id', lineUserId)
      .maybeSingle();
    if (findErr) return json({ error: 'db_lookup_failed', detail: findErr.message }, 500);

    let userId;
    if (existing && existing.user_id) {
      userId = existing.user_id;
      // อัปเดตชื่อ/รูปให้สดใหม่ทุกครั้งที่ล็อกอิน (เผื่อผู้ใช้เปลี่ยนชื่อ/รูปใน LINE) — ไม่ critical ถ้าพลาด
      try {
        await supabase.auth.admin.updateUserById(userId, {
          user_metadata: { name: displayName, avatar_url: avatarUrl, provider: 'line', line_user_id: lineUserId },
        });
      } catch (e) { /* ไม่ critical — ล็อกอินยังสำเร็จได้แม้ sync โปรไฟล์พลาด */ }
    } else {
      // ผู้ใช้ LINE คนใหม่ — สร้าง user ใน Supabase ด้วยอีเมล synthetic (ไม่ใช่อีเมลจริง)
      const { data: created, error: createErr } = await supabase.auth.admin.createUser({
        email: userEmail,
        email_confirm: true,
        user_metadata: { name: displayName, avatar_url: avatarUrl, provider: 'line', line_user_id: lineUserId },
        app_metadata: { provider: 'line', line_user_id: lineUserId },
      });
      if (createErr || !created || !created.user) {
        return json({ error: 'create_user_failed', detail: (createErr && createErr.message) || 'unknown' }, 500);
      }
      userId = created.user.id;
      const { error: mapErr } = await supabase
        .from('line_identities')
        .insert({ line_user_id: lineUserId, user_id: userId });
      if (mapErr) {
        // ผูก mapping ไม่สำเร็จ — อันตราย (ครั้งหน้าจะสร้าง user ซ้ำซ้อน) ต้องแจ้ง error ชัดเจน ห้ามทำเงียบ
        return json({ error: 'map_insert_failed', detail: mapErr.message }, 500);
      }
    }

    // 5) สร้าง magic link แล้วส่งแค่ hashed_token กลับไปให้เว็บ (ไม่ส่งอีเมลจริง — เว็บเอาไปยืนยัน
    //    เองด้วย verifyOtp() ได้ session จริงเลย ไม่ต้องพึ่งระบบส่งเมล)
    const { data: linkData, error: linkErr } = await supabase.auth.admin.generateLink({
      type: 'magiclink',
      email: userEmail,
    });
    if (linkErr || !linkData || !linkData.properties || !linkData.properties.hashed_token) {
      return json({ error: 'generate_link_failed', detail: (linkErr && linkErr.message) || 'unknown' }, 500);
    }

    return json({ ok: true, hashed_token: linkData.properties.hashed_token });
  } catch (e) {
    return json({ error: String((e && e.message) || e) }, 500);
  }
});
