// ============================================================
// บัญชีเกมรวม (ดาว + streak) ใช้ร่วม "เกมเสียง + เกมอ่าน"
// เก็บใน localStorage (same-origin → 2 เกมแชร์กันได้ ไม่ต้องล็อกอิน)
// ดาว = หน่วยกลางรวม 2 เกม · แต้ม (分) แยกเกม ไม่เกี่ยวกับไฟล์นี้
// Lin 2026-06-27
// ============================================================
(function () {
  var KEY = 'thai_game_acct_v1';
  function load() { try { var r = localStorage.getItem(KEY); return r ? JSON.parse(r) : {}; } catch (e) { return {}; } }
  function save(a) { try { localStorage.setItem(KEY, JSON.stringify(a)); } catch (e) {} }
  function dstr(ts) { var d = new Date(ts); return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }

  // ดาว 1–3 ดวง/รอบ ตามความแม่น: เล่นจบ=1 · สะอาด≥80%=2 · สะอาด100%=3
  function starsForRound(cleanCount, total) {
    if (!total || total <= 0) return 0;
    var r = cleanCount / total;
    if (r >= 1) return 3;
    if (r >= 0.8) return 2;
    return 1;
  }

  // แบดจ์พันธุ์ข้าว ตามดาวรวมสะสม (รูป SVG จริงใน assets/badges/)
  var STAR_BADGES = [
    { at: 10,  id: 'hommali',   img: 'assets/badges/hommali.svg',   zh: '茉莉香米', th: 'ข้าวหอมมะลิ',  emoji: '🍚' },
    { at: 20,  id: 'khaoniaw',  img: 'assets/badges/khaoniaw.svg',  zh: '糯米',     th: 'ข้าวเหนียว',   emoji: '🍙' },
    { at: 40,  id: 'riceberry', img: 'assets/badges/riceberry.svg', zh: '紫米',     th: 'ไรซ์เบอร์รี่', emoji: '🟣' },
    { at: 60,  id: 'homnin',    img: 'assets/badges/homnin.svg',    zh: '香黑米',   th: 'ข้าวหอมนิล',   emoji: '⚫' },
    { at: 100, id: 'sangyod',   img: 'assets/badges/sangyod.svg',   zh: '紅米',     th: 'ข้าวสังข์หยด', emoji: '🔴' }
  ];

  window.GAME_ACCOUNT = {
    getStars: function () { return load().stars || 0; },
    addStars: function (n) { var a = load(); a.stars = (a.stars || 0) + (n || 0); save(a); return a.stars; },
    starsForRound: starsForRound,
    getStreak: function () { return load().streak || 0; },
    // เล่นเกมไหนก็ได้ในวันนั้น = นับ streak ต่อเนื่อง (บัญชีเดียว)
    bumpStreakToday: function () {
      var a = load(), t = dstr(Date.now());
      if (a.lastPlay === t) return a.streak || 0;          // เล่นแล้ววันนี้ ไม่บวกซ้ำ
      var y = dstr(Date.now() - 86400000);
      a.streak = (a.lastPlay === y) ? ((a.streak || 0) + 1) : 1;
      a.lastPlay = t; save(a); return a.streak;
    },
    starBadges: STAR_BADGES,
    earnedBadges: function () { var s = load().stars || 0; return STAR_BADGES.filter(function (b) { return s >= b.at; }); },
    // เผื่อย้ายข้อมูลเก่า: ถ้าบัญชียังว่าง แต่เกมมีดาวเดิมในเครื่อง → เก็บเข้าบัญชีครั้งเดียว
    seedIfEmpty: function (oldStars) { var a = load(); if (!a.stars && oldStars > 0) { a.stars = oldStars; save(a); } return a.stars || 0; },

    // ── เฟส 2: sync ขึ้น Supabase (ถาวร + ข้ามเครื่อง) เมื่อล็อกอิน — Lin 2026-06-27 ──
    // merge แบบ "เอาค่ามากสุด" กันข้อมูลหายตอนสลับเครื่อง · ปลอดภัยถ้ายังไม่มีตาราง (no-op)
    sync: function (client, userId) {
      if (!client || !userId || !client.from) return;
      try {
        client.from('game_accounts').select('stars,streak,last_play').eq('user_id', userId).maybeSingle().then(function (r) {
          var rem = (r && r.data) || {};
          var la = load();
          la.stars = Math.max(la.stars || 0, rem.stars || 0);
          la.streak = Math.max(la.streak || 0, rem.streak || 0);
          var lp = la.lastPlay || null;
          if (rem.last_play && (!lp || rem.last_play > lp)) lp = rem.last_play;
          if (lp) la.lastPlay = lp;
          save(la);
          client.from('game_accounts').upsert(
            { user_id: userId, stars: la.stars, streak: la.streak, last_play: la.lastPlay || null, updated_at: new Date().toISOString() },
            { onConflict: 'user_id' }
          ).then(function () {}, function () {});
        }, function () {});
      } catch (e) {}
    }
  };
})();
