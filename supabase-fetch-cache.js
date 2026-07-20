// ════════════════════════════════════════════════════════════
// supabase-fetch-cache.js — cache กลางกันยิง Supabase ซ้ำในโหลดหน้าเดียว
// dedupe fetch 2026-07-20 (Lin สั่ง แก้ audit: profiles/game_reward_points/tone_srs_state/tone_progress
//   โดนยิงซ้ำ 2-7 ครั้งต่อโหลดหน้าเดียว เพราะ SITE_AUTH.fireChange() ยิงหลายจุด
//   (getSession resolve + onAuthStateChange initial fire + revalidate ตอนสลับ/กลับมาที่แท็บ)
//   — ดูหมายเหตุจริงที่ reading-auth.js บรรทัด ~189 ที่เคยเจอปัญหาเดียวกันมาก่อนแล้ว)
//
// วิธีใช้: getCachedFetch(key, fetchFn) → เรียกซ้ำด้วย key เดิม (ตาราง+เงื่อนไข+user id)
//   ได้ promise เดิมกลับมาเลย ไม่ยิง network ซ้ำ · key เปลี่ยน (เช่น เปลี่ยน user) = fetch ใหม่ตามจริง
//   cache เก็บใน window ธรรมดา → รีเฟรช/เปิดหน้าใหม่ = ล้างเอง ไม่ต้องเคลียร์เอง
//
// ต้องโหลดไฟล์นี้ "ก่อน" auth-widget.js / shared.js / progress-sync.js / เกมไฟล์ทั้ง 4 (*-game-app.js ฯลฯ)
// ════════════════════════════════════════════════════════════
(function () {
  window.SB_FETCH_CACHE = window.SB_FETCH_CACHE || {};

  window.getCachedFetch = function (key, fetchFn) {
    var cache = window.SB_FETCH_CACHE;
    if (!cache[key]) {
      cache[key] = fetchFn(); // เก็บ promise ทันที (ไม่รอ resolve) กันคนเรียกซ้อนกันตอนกำลังโหลดอยู่แชร์ promise เดียวกัน
    }
    return cache[key];
  };

  // เผื่ออนาคตอยากบังคับ refetch (เช่น หลังแก้โปรไฟล์) — ยังไม่มีจุดไหนเรียกใช้ตอนนี้ ใส่ไว้กันต้องแก้ไฟล์นี้ซ้ำทีหลัง
  window.clearCachedFetch = function (keyPrefix) {
    var cache = window.SB_FETCH_CACHE;
    Object.keys(cache).forEach(function (k) {
      if (!keyPrefix || k.indexOf(keyPrefix) === 0) delete cache[k];
    });
  };
})();
