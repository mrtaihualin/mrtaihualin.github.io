// ════════════════════════════════════════════════════════════
// Supabase Edge Function: log-session — กันหลายบัญชี Phase 5
//   เก็บ IP (จาก header ฝั่งเซิร์ฟเวอร์) + fingerprint (client ส่งมา) + user-agent
//   ลงตาราง login_events (RLS ล็อก — client อ่าน/เขียนไม่ได้ เขียนผ่าน service_role เท่านั้น)
//   ใช้เป็น "ธงเตือนไว้ให้ Lin ตรวจ" ก่อนจ่ายเงิน — ไม่แบนอัตโนมัติ
// ════════════════════════════════════════════════════════════
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SB_ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
const SB_SVC = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ALLOW_ORIGIN = "https://mrtaihualin.com";

const CORS = {
  "Access-Control-Allow-Origin": ALLOW_ORIGIN,
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (o: unknown, s = 200) =>
  new Response(JSON.stringify(o), { status: s, headers: { ...CORS, "Content-Type": "application/json" } });

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });
  if (req.method !== "POST") return json({ error: "POST only" }, 405);

  // ── ตัวตนจาก JWT เท่านั้น (ห้ามเชื่อ user_id จาก client) ──
  const authHeader = req.headers.get("Authorization") || "";
  const userClient = createClient(SB_URL, SB_ANON, { global: { headers: { Authorization: authHeader } } });
  const { data: ud } = await userClient.auth.getUser();
  const user = ud?.user;
  if (!user) return json({ error: "unauthorized" }, 401);

  let body: any = {};
  try { body = await req.json(); } catch {}
  const fingerprint = String(body.fingerprint || "").slice(0, 128) || null;
  const event = String(body.event || "login").slice(0, 32);

  // ── IP จริงจาก header (Supabase edge ใส่ x-forwarded-for มาให้) เอาตัวแรก ──
  const xff = req.headers.get("x-forwarded-for") || "";
  const ip = (xff.split(",")[0] || "").trim() ||
             req.headers.get("cf-connecting-ip") ||
             req.headers.get("x-real-ip") || null;
  const ua = (req.headers.get("user-agent") || "").slice(0, 256) || null;

  // ── เขียนด้วย service_role (client เขียนตารางนี้ไม่ได้ตาม RLS) ──
  const admin = createClient(SB_URL, SB_SVC, { auth: { persistSession: false } });
  const { error } = await admin.from("login_events").insert({
    user_id: user.id,
    email: user.email || null,
    ip,
    fingerprint,
    user_agent: ua,
    event,
  });
  if (error) return json({ ok: false, error: error.message }, 500);
  return json({ ok: true });
});
