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
  // Lin 2026-07-04: ผูกเวลาไต้หวัน (Asia/Taipei, UTC+8) เสมอ — ไม่อิงนาฬิกาเครื่องผู้เล่น (กันขึ้นวันใหม่/streak เพี้ยนตาม timezone เครื่อง)
  function dstr(ts) {
    var d = (ts == null) ? new Date() : new Date(ts);
    try { return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei' }).format(d); } // 'YYYY-MM-DD' ตามเวลาไต้หวัน
    catch (e) { return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); } // fallback: เครื่อง (เบราว์เซอร์เก่ามาก)
  }

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
  // เพดานจริง = min( floor(10% ของจำนวนคำทั้งหมดในระดับ), HARD_CAPS[level] )
  //   HARD_CAPS = เพดานสูงสุดคงที่ตามสเปก · ครึ่ง "10% ของคำในระดับ" ส่งเข้ามาเป็น argument จาก tone-finder.html
  //   (ถ้าไม่รู้จำนวนคำ = ไม่ส่ง/ส่ง 0 → fallback เป็น HARD_CAPS เดิม กันเพดานกลายเป็น 0 แล้วไม่มีใครได้ดาว) — Lin 2026-07-04
  var HARD_CAPS = { 1: 200, 2: 300, 3: 200 };        // 初級/中級/高級 → เพดานสูงสุดคงที่ (จำนวน "คำ" ที่นับดาวได้ตลอดชีพ)

  // ── สเปก 2026-07-04 (Lin เคาะ): จำนวนคำต่อระดับ = "ผลรวมทุกเกม" (เกมเสียง + เกมอ่าน) ──
  //   ฐานเดียวกันทั้ง 2 เกม → เพดานดาวเงิน = 10% ของเลขรวมชุดนี้ (ทุกเกมนับรวมกัน ไม่แยกเกม)
  //   นับจากโค้ดจริง (Lin 2026-07-04):
  //     初級(1): เกมเสียง WORD_LIST level1 = 168 + เกมอ่าน WORDS 初 = 162 → 330
  //     中級(2): เกมเสียง WORD_LIST level2 = 120 + เกมอ่าน WORDS 中 = 126 → 246
  //     高級(3): เกมเสียงกับเกมอ่านใช้ "10 ประโยคชุดเดียวกัน" (ADV_SENTENCES / WORDS_HIGH เนื้อหาตรงกัน)
  //             → หน่วยที่ไม่ซ้ำจริง = 10 (ไม่บวกซ้ำเป็น 20) ⚠️ Lin ช่วยยืนยันจุดนี้
  var LEVEL_TOTAL_WORDS = { 1: 330, 2: 246, 3: 10 };

  // คำนวณเพดานจริงต่อระดับ = min( floor(0.10 × LEVEL_TOTAL_WORDS[level]), HARD_CAPS[level] )
  //   ใช้ LEVEL_TOTAL_WORDS เป็นฐานเสมอ (เลขรวมทุกเกม) — ไม่รับ per-game count จากภายนอกแล้ว
  //   levelWordCount ที่ส่งเข้ามาถูกเมิน (คงพารามิเตอร์ไว้กันโค้ดเดิมพัง) — Lin 2026-07-04
  function effectiveCap(level, levelWordCount) {
    var hardCap = HARD_CAPS[level] || 0;
    var wc = LEVEL_TOTAL_WORDS[level] || 0;
    if (!(wc > 0)) return hardCap;                    // ไม่รู้จำนวนคำจริง → ใช้ cap เดิม (กันเพดาน 0)
    var tenPct = Math.floor(0.10 * wc);
    return Math.min(tenPct, hardCap);
  }
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
  function addHardStars(clean, level, levelWordCount) {
    var a = load();
    var cap = effectiveCap(level, levelWordCount);   // เพดานจริง = min(10% ของคำในระดับ, HARD_CAPS)
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
  function hardCapReached(level, levelWordCount) {
    var a = load();
    return wordsCounted(a, level) >= effectiveCap(level, levelWordCount);
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

    // ── Lin 2026-07-04: แจ้งเตือน "มีคำศัพท์ใหม่" ข้ามเกม (ใช้ร่วมทุกเกม) ──
    //  หลักคิด: จำ "จำนวนคำที่ผู้เล่นเคยเห็นครบแล้ว" ต่อ (เกม+ระดับ) — ตั้งค่าตอนจำได้ครบทั้งระดับ (全部精通)
    //  ถ้าภายหลังเพิ่มคำใหม่ (count ปัจจุบัน > seen) = มีคำใหม่ยังไม่ได้เล่น → เกมเอาไปเด้งแจ้งเตือน
    //  ผู้เล่นใหม่/ยังเล่นไม่ครบระดับ = ไม่มี seen = คืน 0 = ไม่เด้ง (กันสแปม)
    //  หมายเหตุ: เก็บใน localStorage ต่อเครื่อง (ข้ามเครื่องต้องเพิ่มคอลัมน์ Supabase ทีหลัง)
    markLevelSeen: function (game, level, totalCount) {
      if (!game) return 0;
      var a = load(); a.seen = a.seen || {}; a.seen[game] = a.seen[game] || {};
      a.seen[game][level] = totalCount || 0; save(a); return a.seen[game][level];
    },
    // คืนจำนวน "คำใหม่ที่ยังไม่ได้เล่น" ของเกม+ระดับนี้ (0 = ไม่มี / ยังไม่เคยจำครบ)
    newWordsCount: function (game, level, currentCount) {
      var a = load(); var g = a.seen && a.seen[game];
      var seen = g && (g[level] != null ? g[level] : undefined);
      if (seen == null) return 0;                       // ยังไม่เคยจำครบระดับนี้ → ไม่ถือว่ามีคำใหม่
      return Math.max(0, (currentCount || 0) - seen);
    },

    // ── สเปก 2026-07-03: ดาวเงิน (hard currency) จาก SRS mastery เท่านั้น ──
    addHardStars: addHardStars,        // (clean:boolean, level:1|2|3) → {stars, capped}
    hardCapReached: hardCapReached,    // (level) → true ถ้าระดับนี้ชนเพดานตลอดชีพแล้ว
    getHardWordsCounted: function (level) { return wordsCounted(load(), level); },
    hardCaps: HARD_CAPS,
    levelTotalWords: LEVEL_TOTAL_WORDS,   // Lin 2026-07-04: จำนวนคำรวมทุกเกมต่อระดับ (ฐานคิดเพดาน 10%)
    effectiveCap: function (level) { return effectiveCap(level); },  // เพดานจริงต่อระดับ (min(10%, HARD_CAPS))

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
          // ── Phase 4 (ล็อก 2026-07-11): เซิร์ฟเวอร์เป็นเจ้าของ "ดาว + ตัวนับเพดาน" (remote-authoritative) ──
          //   เดิม: Math.max(local, remote) → localStorage ที่ถูกแก้มั่ว (เปิด DevTools ตั้งดาว 9999) ชนะ = โชว์ดาวปลอม
          //   ใหม่: เอาค่าจากเซิร์ฟเวอร์มาโชว์ตรงๆ → ดาวปลอมใน localStorage ถูกทับด้วยค่าจริงทุกครั้งที่ sync
          //   ดาวเพิ่มได้ทางเดียว = Edge Function tone-round (service_role) · client เขียน game_accounts ไม่ได้แล้ว (RLS ล็อก step2)
          if (rem.stars != null) la.stars = rem.stars;
          if (rem.hard_words_by_level != null) la.hardWordsByLevel = rem.hard_words_by_level;
          // streak/last_play = ไม่ใช่เงิน · หลังล็อก RLS เขียนขึ้นเซิร์ฟเวอร์ไม่ได้ → คงแบบต่อเครื่อง (ดึงค่าที่มากกว่ามาโชว์)
          la.streak = Math.max(la.streak || 0, rem.streak || 0);
          var lp = la.lastPlay || null;
          if (rem.last_play && (!lp || rem.last_play > lp)) lp = rem.last_play;
          if (lp) la.lastPlay = lp;
          save(la);
          // ❌ เลิก upsert game_accounts จาก client — เดิมบรรทัดนี้คือ "รู" ให้เขียนดาวตรง · เซิร์ฟเวอร์เขียนเองแล้ว
        }, function () {});
      } catch (e) {}
    }
  };
})();
