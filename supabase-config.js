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
  requireLogin: true   // ✅ เปิดบังคับล็อกอินแล้ว (Supabase + Google ตั้งค่าเสร็จ 17 มิ.ย.)
};
