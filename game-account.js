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

  // ── สเปก 2026-07-03: ดาวเงิน (hard currency) เปลี่ยนแหล่งที่มา ──
  // เดิม: ดาว 1–3 ดวง/รอบ ตามความแม่น (starsForRound) → ปั๊มได้ ไม่ตรงสเปกใหม่
  // ใหม่: ดาวเงินแจกเฉพาะตอน "จำได้จริง" (คำ/ประโยคถูกตัดออกจาก SRS เพราะจำได้แล้ว)
  //   ให้ tone-finder.html (TF_SRS) เป็นคนคำนวณจำนวนดาว/คำแล้วเรียก addHardStars(n, level) เข้ามา
  //   ฟังก์ชันนี้ (starsForRound) ยังเก็บไว้เผื่อโค้ดเก่าเรียกใช้ แต่ "ไม่ใช่แหล่งดาวเงินอีกต่อไป" — คืนค่า 0 เสมอ
  //   (กันพังเงียบ: ถ้ามีจุดอื่นเรียกอยู่ จะไม่ทำให้ดาวเพิ่มมั่วๆ)
  function starsForRound(cleanCount, total) {
    return 0; // DEPRECATED สเปก 2026-07-03 — ห้ามใช้แจกดาวเงินอีก ดูหมายเหตุด้านบน
  }

  // ── สเปก 2026-07-03 ข้อ 4: เพดานดาวเงินตลอดชีพต่อระดับ (ล็อกกันปั๊ม) ──
  // Hard cap ต่อระดับ = min(10% ของจำนวนคำในระดับ, hard cap ในตาราง) — ตัวเลข hard cap คงที่ตามสเปก
  var HARD_CAPS = { 1: 200, 2: 300, 3: 200 };        // 初級/中級/高級 → จำนวน "คำ" สูงสุดที่นับดาวได้ตลอดชีพ
  var LEVEL_MULT = { 1: 1, 2: 1.5, 3: 2 };            // ตัวคูณระดับ
  var BASE_CLEAN = 3, BASE_RECOVERED = 1;             // ฐาน/คำ: จำเอง=3 · กู้กลับมาได้=1

  // นับ "คำที่เคยได้ดาวแล้ว" ต่อระดับ (เพื่อคุมเพดาน 200/300/200) — เก็บถาวรในบัญชีเดียวกัน ไม่รีเซ็ตเอง
  function wordsCounted(a, level) {
    var wc = a.hardWordsByLevel || {};
    return wc[level] || 0;
  }
  function bumpWordsCounted(a, level) {
    a.hardWordsByLevel = a.hardWordsByLevel || {};
    a.hardWordsByLevel[level] = (a.hardWordsByLevel[level] || 0) + 1;
    return a.hardWordsByLevel[level];
  }

  // ── สเปก 2026-07-03 ข้อ 4: แจกดาวเงินตอนคำ/ประโยคถูก "ตัด" ออกจาก SRS (mastered) ──
  // clean = จำได้เองไม่เคยแอบดู/ผิดเลยตลอดเส้นทาง SRS ของคำนี้ · recovered = เคยผิด/แอบดูระหว่างทาง แต่สุดท้ายจำได้
  // level: 1=初級×1 · 2=中級×1.5 · 3=高級×2
  // คืนค่า {stars, capped} — capped=true ถ้าคำนี้ชนเพดานระดับแล้ว (ตัดออกจาก SRS ปกติ แต่ไม่ได้ดาว)
  function addHardStars(clean, level) {
    var a = load();
    var cap = HARD_CAPS[level] || 0;
    var used = wordsCounted(a, level);
    if (used >= cap) { save(a); return { stars: 0, capped: true }; }
    bumpWordsCounted(a, level);
    var base = clean ? BASE_CLEAN : BASE_RECOVERED;
    var mult = LEVEL_MULT[level] || 1;
    var n = Math.round(base * mult);
    a.stars = (a.stars || 0) + n;
    save(a);
    return { stars: n, capped: false };
  }
  // เช็กว่าระดับนี้ชนเพดานดาวเงินหรือยัง (ไม่นับดาว แต่คำยัง mastered/ตัดออกจาก SRS ได้ตามปกติ)
  function hardCapReached(level) {
    var a = load();
    return wordsCounted(a, level) >= (HARD_CAPS[level] || 0);
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

    // ── สเปก 2026-07-03: ดาวเงิน (hard currency) จาก SRS mastery เท่านั้น ──
    addHardStars: addHardStars,        // (clean:boolean, level:1|2|3) → {stars, capped}
    hardCapReached: hardCapReached,    // (level) → true ถ้าระดับนี้ชนเพดานตลอดชีพแล้ว
    getHardWordsCounted: function (level) { return wordsCounted(load(), level); },
    hardCaps: HARD_CAPS,

    // ── เฟส 2: sync ขึ้น Supabase (ถาวร + ข้ามเครื่อง) เมื่อล็อกอิน — Lin 2026-06-27 ──
    // merge แบบ "เอาค่ามากสุด" กันข้อมูลหายตอนสลับเครื่อง · ปลอดภัยถ้ายังไม่มีตาราง (no-op)
    // ── Lin 2026-07-04: เพิ่ม sync "hardWordsByLevel" (ตัวนับเพดานดาวเงินตลอดชีพต่อระดับ) ด้วย ──
    // เดิม sync แค่ stars/streak/last_play → ตัวนับเพดานเป็น local-only ทำให้เล่นคนละเครื่อง/เบราว์เซอร์
    // แล้วได้ดาวเงินเกินเพดานจริงได้ (เครื่องใหม่นับ 0 ใหม่ ไม่รู้ว่าเครื่องอื่นนับไปถึงไหนแล้ว) — ตอนนี้ merge แบบเอาค่ามากสุดเหมือนกัน
    // ⚠️ ต้องมีคอลัมน์ "hard_words_by_level" (jsonb) ในตาราง game_accounts ที่ Supabase ก่อน ไม่งั้น query จะพังเงียบ (ห่อ try/catch ไว้แล้ว = ไม่ทำให้เกมพัง แต่จะไม่ sync จนกว่าจะเพิ่มคอลัมน์)
    sync: function (client, userId) {
      if (!client || !userId || !client.from) return;
      try {
        client.from('game_accounts').select('stars,streak,last_play,hard_words_by_level').eq('user_id', userId).maybeSingle().then(function (r) {
          var rem = (r && r.data) || {};
          var la = load();
          la.stars = Math.max(la.stars || 0, rem.stars || 0);
          la.streak = Math.max(la.streak || 0, rem.streak || 0);
          var lp = la.lastPlay || null;
          if (rem.last_play && (!lp || rem.last_play > lp)) lp = rem.last_play;
          if (lp) la.lastPlay = lp;
          // เพดานดาวเงินตลอดชีพต่อระดับ: เอาค่ามากสุดต่อระดับ (ล็อกอิน = ลิงค์ข้ามทุกเครื่อง มีประวัติตามไป)
          var remHw = rem.hard_words_by_level || {};
          var locHw = la.hardWordsByLevel || {};
          var mergedHw = {};
          [1, 2, 3].forEach(function (lvl) {
            mergedHw[lvl] = Math.max(locHw[lvl] || 0, remHw[lvl] || 0);
          });
          la.hardWordsByLevel = mergedHw;
          save(la);
          client.from('game_accounts').upsert(
            { user_id: userId, stars: la.stars, streak: la.streak, last_play: la.lastPlay || null, hard_words_by_level: la.hardWordsByLevel, updated_at: new Date().toISOString() },
            { onConflict: 'user_id' }
          ).then(function () {}, function () {});
        }, function () {});
      } catch (e) {}
    }
  };
})();
