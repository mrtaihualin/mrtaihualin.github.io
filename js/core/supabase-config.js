// ════════════════════════════════════════════════════════════
// Supabase config — ใส่ค่าของโปรเจกต์คุณตรงนี้
// หาได้จาก: Supabase → Project Settings → Data API / API Keys
//   url     = "Project URL"  (เช่น https://abcd1234.supabase.co)
//   anonKey = "anon public"  key (ยาวๆ ขึ้นต้น eyJ...)
// anon key เปิดเผยในหน้าเว็บได้ ปลอดภัยเพราะมี Row Level Security คุม
// ════════════════════════════════════════════════════════════
window.SUPABASE_CONFIG = {
  url:     'https://qzkxlhpcputsvbqmtqfi.supabase.co',
  anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF6a3hsaHBjcHV0c3ZicW10cWZpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE2NjI1NDksImV4cCI6MjA5NzIzODU0OX0.1g80zxHfduq9RLdpus10hBDSEYWIXu2Jnqb6LsvqXpw',

  // บังคับล็อกอินก่อนเล่นเกม tone-finder หรือไม่
  //   false = เล่นได้เลย ล็อกอินเป็นออปชั่น (ค่าปัจจุบัน — ปลอดภัยตอน Google ยังตั้งไม่เสร็จ)
  //   true  = ต้องล็อกอินก่อนถึงเล่นได้
  // ⚠️ เปลี่ยนเป็น true ก็ต่อเมื่อ Google login ใน Supabase พร้อมใช้งานแล้วเท่านั้น
  requireLogin: false  // เปิดเล่นได้เลย ไม่บังคับล็อกอิน · ล็อกอินเป็นออปชั่น (สะสมคะแนน/ขึ้นกระดาน) — Lin 2026-06-26
};

// ════════════════════════════════════════════════════════════
// Shared Supabase client (singleton) — กัน warning "Multiple GoTrueClient instances"
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
