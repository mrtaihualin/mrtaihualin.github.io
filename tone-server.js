// ════════════════════════════════════════════════════════════
// tone-server.js — ตัวเชื่อมฝั่ง client → Edge Function กันโกงดาว (Phase 4)
// ════════════════════════════════════════════════════════════
// ใช้ร่วมทุกเกมที่แจกดาว · หน้าที่เดียว: ตอนจบคำ (ล็อกอิน) → ให้เซิร์ฟเวอร์เป็นคนตัดสิน+แจกดาว
// กติกา reliability (กฎ Lin ข้อ 12):
//   • เน็ตล่ม/ไม่ล็อกอิน → คืน {ok:false} · เกมไม่พัง · ดาว/SRS ฝั่งเซิร์ฟเวอร์ไม่ขยับ
//     → คำนั้น "ยังไม่เลื่อนขั้น" ฝั่งเซิร์ฟเวอร์ → คราวหน้าเล่นซ้ำได้ (กู้คืนได้ ไม่มีดาวหาย/ปลอม)
//   • ห้ามโชว์ "ได้ดาว" ถ้าเซิร์ฟเวอร์ยังไม่ยืนยัน
(function () {
  function client() {
    try { return window.getSupabaseClient ? window.getSupabaseClient() : null; } catch (e) { return null; }
  }
  // ส่ง 1 รอบให้เซิร์ฟเวอร์ตัดสิน · คืน Promise { ok, correct, justMastered, stars, totalStars, reason }
  async function finishRound(args) {
    var sb = client();
    if (!sb || !sb.functions) return { ok: false, reason: 'no_client' };
    try {
      var r = await sb.functions.invoke('tone-round', {
        body: {
          word: args.word,
          level: args.level,
          initialGuess: args.initialGuess,   // คำพยางค์เดียว
          syllables: args.syllables,          // คำหลายพยางค์ (ถ้ามี)
          guesses: args.guesses,              // คำเดารายพยางค์ (ถ้ามี)
          knownCheck: !!args.knownCheck
        }
      });
      if (r.error) return { ok: false, reason: 'net_error', detail: String(r.error) };
      return r.data || { ok: false, reason: 'empty' };
    } catch (e) {
      return { ok: false, reason: 'exception', detail: String(e) };
    }
  }
  // มีเซิร์ฟเวอร์ + ล็อกอินไหม (ไม่ล็อกอิน = ไม่มีดาวจริงอยู่แล้ว → เกมใช้ local เดิม)
  function available() {
    var sb = client();
    return !!(sb && sb.functions && window.TF_AUTH && window.TF_AUTH.loggedIn && window.TF_AUTH.loggedIn());
  }
  window.TONE_SERVER = { finishRound: finishRound, available: available };
})();
