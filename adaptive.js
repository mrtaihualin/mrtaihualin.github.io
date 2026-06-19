// ════════════════════════════════════════════════════════════
// adaptive.js — โหมดฝึกแบบปรับระดับ 75/25 (สเตจ 4)
// 75% คำที่ผู้เล่นถูกบ่อย/ยังไม่เคยเจอ (ทวนให้แม่น) + 25% คำที่พลาดบ่อย (ซ้อมจุดอ่อน)
// ดึงประวัติจาก tone_sessions.wrong_words ของผู้ใช้ที่ล็อกอิน · ไม่ล็อกอิน/ไม่มีข้อมูล → สุ่มปกติ
// ต้องโหลดหลัง: supabase-js CDN, supabase-config.js
// ════════════════════════════════════════════════════════════
(function () {
  'use strict';

  // ── ค่าปรับได้ (อย่า hardcode ที่อื่น) ──
  var ADAPTIVE_RATIO = 0.75;   // สัดส่วนคำ "ถูกบ่อย/ใหม่"; ที่เหลือ = คำพลาดบ่อย
  var ROUND_SIZE = 5;          // จำนวนคำต่อรอบ
  var HISTORY_LIMIT = 50;      // ดึงกี่ session ล่าสุดมาวิเคราะห์

  var cfg = window.SUPABASE_CONFIG || {};
  var ok = cfg.url && cfg.anonKey &&
           String(cfg.url).indexOf('YOUR_') === -1 &&
           String(cfg.anonKey).indexOf('YOUR_') === -1 &&
           window.supabase && window.supabase.createClient;
  var sb = ok ? window.supabase.createClient(cfg.url, cfg.anonKey) : null;

  var currentUser = null;
  var wrongCounts = {};   // { word: จำนวนครั้งที่พลาด }
  var loaded = false;

  function loadHistory() {
    if (!sb || !currentUser) { loaded = false; wrongCounts = {}; return; }
    sb.from('tone_sessions')
      .select('wrong_words')
      .eq('user_id', currentUser.id)
      .order('created_at', { ascending: false })
      .limit(HISTORY_LIMIT)
      .then(function (res) {
        wrongCounts = {};
        if (res && res.data) {
          res.data.forEach(function (row) {
            var ww = row.wrong_words || [];
            ww.forEach(function (w) {
              var word = (w && w.word) ? w.word : w;
              if (word) wrongCounts[word] = (wrongCounts[word] || 0) + 1;
            });
          });
        }
        loaded = true;
      }, function () { loaded = false; });
  }

  function shuffle(a) {
    a = a.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }
  function sample(arr, n) { return shuffle(arr).slice(0, n); }

  window.TF_ADAPTIVE = {
    ratio: ADAPTIVE_RATIO,
    roundSize: ROUND_SIZE,
    // พร้อมใช้ (ล็อกอิน + มีประวัติคำพลาด) ไหม
    ready: function () { return loaded && Object.keys(wrongCounts).length > 0; },
    // เลือกคำจาก pool (array ของ string) → คืน array ของ string
    pickWords: function (pool, n) {
      n = n || ROUND_SIZE;
      pool = (pool || []).slice();
      if (pool.length <= n || !this.ready()) return sample(pool, n);  // ไม่พร้อม → สุ่มปกติ
      var weak = pool.filter(function (w) { return wrongCounts[w]; })
                     .sort(function (a, b) { return (wrongCounts[b] || 0) - (wrongCounts[a] || 0); });
      var strong = pool.filter(function (w) { return !wrongCounts[w]; });
      var nWeak = Math.min(weak.length, Math.round(n * (1 - ADAPTIVE_RATIO)));   // ~25%
      var nStrong = n - nWeak;
      var res = sample(weak, nWeak).concat(sample(strong, nStrong));
      if (res.length < n) {  // กลุ่มใดไม่พอ → เติมจากที่เหลือ
        var rest = pool.filter(function (w) { return res.indexOf(w) < 0; });
        res = res.concat(sample(rest, n - res.length));
      }
      return shuffle(res).slice(0, n);
    },
    // เผื่อ debug/เทสต์ — ฉีดข้อมูลพลาดเอง
    _setWrongCounts: function (obj) { wrongCounts = obj || {}; loaded = true; }
  };

  if (sb) {
    sb.auth.getSession().then(function (res) {
      currentUser = (res.data && res.data.session && res.data.session.user) || null;
      loadHistory();
    });
    sb.auth.onAuthStateChange(function (_e, session) {
      currentUser = (session && session.user) || null;
      loadHistory();
    });
  }
})();
