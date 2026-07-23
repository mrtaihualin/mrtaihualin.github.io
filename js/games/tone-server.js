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
          game: args.game,                    // 'tone'(default)/'reading'/'typing'/'wordorder' — แยก SRS ต่อเกม
          clean: args.clean,                  // เกมสะกด/เรียงประโยค: รอบนี้เลื่อนขั้น(clean)ไหม
          starClean: args.starClean,          // เกมเรียงประโยค: จำเอง(3⭐) vs ใช้คำใบ้/กู้(1⭐)
          initialGuess: args.initialGuess,   // คำพยางค์เดียว (เกมเสียง)
          syllables: args.syllables,          // คำหลายพยางค์ (ถ้ามี)
          guesses: args.guesses,              // คำเดารายพยางค์ (ถ้ามี)
          knownCheck: !!args.knownCheck
        }
      });
      if (r.error) {
        // Phase 5: โดน rate limit (429 = ยิงเกิน 60 รอบ/นาที) → บอกคนเล่นตรงๆ ว่ารอแป๊บ
        var st = 0;
        try { st = (r.error.context && r.error.context.status) || 0; } catch (e2) {}
        if (st === 429) { showRateLimitToast(); return { ok: false, reason: 'rate_limited' }; }
        return { ok: false, reason: 'net_error', detail: String(r.error) };
      }
      return r.data || { ok: false, reason: 'empty' };
    } catch (e) {
      return { ok: false, reason: 'exception', detail: String(e) };
    }
  }
  // toast แจ้งโดน rate limit — ใช้สีธีมเว็บ (ทอง/ครีม) · โชว์ครั้งเดียวต่อ 10 วิ กันเด้งรัว
  var _rlToastAt = 0;
  function showRateLimitToast() {
    try {
      if (Date.now() - _rlToastAt < 10000) return;
      _rlToastAt = Date.now();
      var d = document.createElement('div');
      d.textContent = '🌾 玩得太快啦！休息一下，幾秒後再繼續～';
      d.style.cssText = 'position:fixed;left:50%;bottom:80px;transform:translateX(-50%);z-index:100001;' +
        'background:#FAF4E8;border:1.5px solid #C8973A;color:#5a3e0a;border-radius:14px;' +
        'padding:10px 18px;font-size:14px;font-weight:700;font-family:"Noto Sans TC",sans-serif;' +
        'box-shadow:0 6px 24px rgba(90,62,10,0.25);opacity:0;transition:opacity .3s;';
      document.body.appendChild(d);
      requestAnimationFrame(function () { d.style.opacity = '1'; });
      setTimeout(function () { d.style.opacity = '0'; setTimeout(function () { try { d.remove(); } catch (e) {} }, 400); }, 3500);
    } catch (e) {}
  }

  // ล็อกอินไหม — รองรับหลายเกม: เกมเสียงใช้ TF_AUTH · เกมอ่าน/พิมพ์ใช้ READING_AUTH
  function loggedIn() {
    try {
      if (window.TF_AUTH && window.TF_AUTH.loggedIn && window.TF_AUTH.loggedIn()) return true;
      if (window.READING_AUTH && window.READING_AUTH.user) return true;
    } catch (e) {}
    return false;
  }
  // มีเซิร์ฟเวอร์ + ล็อกอินไหม (ไม่ล็อกอิน = ไม่มีดาวจริงอยู่แล้ว → เกมใช้ local เดิม)
  function available() {
    var sb = client();
    return !!(sb && sb.functions && loggedIn());
  }
  window.TONE_SERVER = { finishRound: finishRound, available: available };
})();
