// ════════════════════════════════════════════════════════════
// [01] SUPABASE PUBLIC CONFIG — ใส่ค่าของโปรเจกต์คุณตรงนี้
// หาได้จาก: Supabase → Project Settings → Data API / API Keys
//   url     = "Project URL"  (เช่น https://abcd1234.supabase.co)
//   anonKey = "anon public"  key (ยาวๆ ขึ้นต้น eyJ...)
// anon key เปิดเผยในหน้าเว็บได้ ปลอดภัยเพราะมี Row Level Security คุม
// ════════════════════════════════════════════════════════════
window.SUPABASE_CONFIG = {
  url:     'https://qzkxlhpcputsvbqmtqfi.supabase.co',
  anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF6a3hsaHBjcHV0c3ZicW10cWZpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE2NjI1NDksImV4cCI6MjA5NzIzODU0OX0.1g80zxHfduq9RLdpus10hBDSEYWIXu2Jnqb6LsvqXpw',

  // v15 (LIN 2026-07-26): LINE Login Channel ID (ตัวเลขล้วน) — หาได้จาก LINE Developers Console
  // → channel "LINE Login" → แท็บ Basic settings → บนสุดของหน้า ช่อง "Channel ID"
  // เป็นค่า public ปลอดภัยเหมือน anonKey ข้างบน (client_id ของ OAuth เปิดเผยในหน้าเว็บได้ปกติ)
  // ⚠️ Lin ต้องกรอกเลขตรงนี้เอง (ค่าเดิมที่เคยใส่ใน Supabase custom provider "line" เอามาใช้ซ้ำได้เลย)
  lineChannelId: '2010620934',

  // บังคับล็อกอินก่อนเล่นเกม tone-finder หรือไม่
  //   false = เล่นได้เลย ล็อกอินเป็นออปชั่น (ค่าปัจจุบัน — ปลอดภัยตอน Google ยังตั้งไม่เสร็จ)
  //   true  = ต้องล็อกอินก่อนถึงเล่นได้
  // ⚠️ เปลี่ยนเป็น true ก็ต่อเมื่อ Google login ใน Supabase พร้อมใช้งานแล้วเท่านั้น
  requireLogin: false,
  // Reversible Minimum Guest Launch gate. Unlike requireLogin:false, this
  // deliberately ignores any authenticated browser session underneath.
  runtimeMode: 'minimum-guest'
};

window.isMinimumGuestOnly = function () {
  return !!(window.SUPABASE_CONFIG && window.SUPABASE_CONFIG.runtimeMode === 'minimum-guest');
};

// ════════════════════════════════════════════════════════════
// EMAIL OTP ACTIVATION — public client artifact owned only by this config file
// Phase 1 broker mode is enabled only after the Production SQL, Edge Functions,
// secrets, Turnstile widget and all-surface client routing passed their gates.
// The site key is public. Never place the Turnstile secret, named mailer key,
// service role key or any other server secret in this client artifact.
// ════════════════════════════════════════════════════════════
window.EMAIL_OTP_SECURITY_CONFIG = Object.freeze({
  mode: 'broker',
  turnstileSiteKey: '0x4AAAAAAEZt-tXuix-ztGXd'
});

// ════════════════════════════════════════════════════════════
// [02] SHARED SUPABASE CLIENT (singleton) — กัน warning "Multiple GoTrueClient instances"
// ทุกไฟล์ควรเรียก window.getSupabaseClient() แทนการ createClient เอง
// คืน client ตัวเดิมเสมอ (สร้างครั้งเดียวต่อหน้า) · คืน null ถ้ายังตั้งค่าไม่พร้อม
// ════════════════════════════════════════════════════════════
window.getSupabaseClient = function () {
  if (window.__SB_CLIENT) return window.__SB_CLIENT;
  var c = window.SUPABASE_CONFIG || {};
  var ok = c.url && c.anonKey &&
           String(c.url).indexOf('YOUR_') === -1 &&
           String(c.anonKey).indexOf('YOUR_') === -1 &&
           window.supabase && window.supabase.createClient;
  if (!ok) return null;
  window.__SB_CLIENT = window.supabase.createClient(c.url, c.anonKey);
  return window.__SB_CLIENT;
};

// Isolated client for Guest-only content/audio/quota calls. It neither reads
// nor refreshes the existing browser auth session.
window.getAnonymousSupabaseClient = function () {
  if (window.__SB_ANON_CLIENT) return window.__SB_ANON_CLIENT;
  var c = window.SUPABASE_CONFIG || {};
  var ok = c.url && c.anonKey &&
           String(c.url).indexOf('YOUR_') === -1 &&
           String(c.anonKey).indexOf('YOUR_') === -1 &&
           window.supabase && window.supabase.createClient;
  if (!ok) return null;
  window.__SB_ANON_CLIENT = window.supabase.createClient(c.url, c.anonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
  });
  return window.__SB_ANON_CLIENT;
};
