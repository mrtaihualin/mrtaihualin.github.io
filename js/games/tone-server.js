// ════════════════════════════════════════════════════════════
// tone-server.js — ตัวเชื่อมฝั่ง client → Edge Function กันโกงดาว (Phase 4)
// ════════════════════════════════════════════════════════════
// ใช้ร่วมทุกเกมที่แจกดาว · หน้าที่เดียว: ตอนจบคำ (ล็อกอิน) → ให้เซิร์ฟเวอร์เป็นคนตัดสิน+แจกดาว
// กติกา reliability (กฎ Lin ข้อ 12):
//   • เน็ตล่ม/ไม่ล็อกอิน → คืน {ok:false} · เกมไม่พัง · ดาว/SRS ฝั่งเซิร์ฟเวอร์ไม่ขยับ
//     → คำนั้น "ยังไม่เลื่อนขั้น" ฝั่งเซิร์ฟเวอร์ → คราวหน้าเล่นซ้ำได้ (กู้คืนได้ ไม่มีดาวหาย/ปลอม)
//   • ห้ามโชว์ "ได้ดาว" ถ้าเซิร์ฟเวอร์ยังไม่ยืนยัน
// FILE MAP: [01] client lookup → [02] finish round → [03] feedback/status → [04] public API
(function () {
  function client() {
    try { return window.getSupabaseClient ? window.getSupabaseClient() : null; } catch (e) { return null; }
  }
  function roundId() {
    try { if (window.crypto && crypto.randomUUID) return crypto.randomUUID(); } catch (e) {}
    var bytes = new Uint8Array(16);
    try { crypto.getRandomValues(bytes); } catch (e2) { for (var i=0;i<16;i++) bytes[i]=(Math.random()*256)|0; }
    bytes[6] = (bytes[6] & 15) | 64;
    bytes[8] = (bytes[8] & 63) | 128;
    var h = Array.prototype.map.call(bytes, function (b) { return ('0' + b.toString(16)).slice(-2); }).join('');
    return h.slice(0,8)+'-'+h.slice(8,12)+'-'+h.slice(12,16)+'-'+h.slice(16,20)+'-'+h.slice(20);
  }
  function wait(ms) { return new Promise(function (resolve) { setTimeout(resolve, ms); }); }
  // ส่ง 1 รอบให้เซิร์ฟเวอร์ตัดสิน · คืน Promise { ok, correct, justMastered, stars, totalStars, reason }
  async function finishRound(args) {
    var sb = client();
    if (!sb || !sb.functions) return { ok: false, reason: 'no_client' };
    var payload = {
      round_id: roundId(),
      word: args.word,
      level: args.level,
      game: args.game,                    // 'tone'(default)/'reading'/'typing'/'wordorder' — แยก SRS ต่อเกม
      clean: args.clean,                  // เกมสะกด/เรียงประโยค: รอบนี้เลื่อนขั้น(clean)ไหม
      starClean: args.starClean,          // เกมเรียงประโยค: จำเอง(3⭐) vs ใช้คำใบ้/กู้(1⭐)
      initialGuess: args.initialGuess,   // คำพยางค์เดียว (เกมเสียง)
      syllables: args.syllables,          // คำหลายพยางค์ (ถ้ามี)
      guesses: args.guesses,              // คำเดารายพยางค์ (ถ้ามี)
      knownCheck: !!args.knownCheck
    };
    try {
      if (!window.NetworkGuard || typeof window.NetworkGuard.request !== 'function') return { ok: false, reason: 'network_guard_unavailable' };
      for (var attempt=0; attempt<2; attempt++) {
        var r;
        try {
          r = await window.NetworkGuard.request(function () {
            return sb.functions.invoke('tone-round', { body: payload });
          }, 'tone-round', {}, 12000, null);
        } catch (requestError) {
          if (attempt === 0) { await wait(800); continue; }
          return { ok: false, reason: 'exception', detail: String(requestError) };
        }
        if (!r.error && r.data && r.data.ok) return r.data;
        if (!r.error && r.data && r.data.reason === 'race_retry' && attempt === 0) {
          await wait(800); continue;
        }
        if (r.error) {
        // Phase 5: โดน rate limit (429 = ยิงเกิน 60 รอบ/นาที) → บอกคนเล่นตรงๆ ว่ารอแป๊บ
          var st = 0;
          try { st = (r.error.context && r.error.context.status) || 0; } catch (e3) {}
          if (st === 429) { showRateLimitToast(); return { ok: false, reason: 'rate_limited' }; }
          if (attempt === 0) { await wait(800); continue; }
          return { ok: false, reason: 'net_error', detail: String(r.error) };
        }
        return r.data || { ok: false, reason: 'empty' };
      }
      return { ok: false, reason: 'net_error' };
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
