/**
 * game-content-client.js — Lin 2026-08-02
 * FILE MAP: [01] data adapters → [02] auth token lookup → [03] content fetch → [04] loading/error UI → [05] script injection + public loader
 * ────────────────────────────────────────────────────────────
 * แทนที่ <script src="data/words-data.js"> / <script src="data/adv-sentences.js"> เดิม
 * ในหน้าเกมทั้ง 6 หน้า (games-challenge / reading-game / tone-finder / typing-game /
 * word-order / listening-game) — ของเดิมโหลดไฟล์ที่มีคำ/ประโยค "ครบทุกอัน" ตรงๆ ผ่าน URL
 * public เห็นได้หมดไม่ว่าจะล็อกอินหรือไม่ (ช่องโหว่ความปลอดภัย) ตอนนี้เปลี่ยนเป็นขอข้อมูล
 * (ตัดโควตาแล้วตามสิทธิ์จริง) จาก Edge Function `game-content` แทน
 *
 * ไฟล์นี้ทำ 2 อย่าง:
 *   1) เก็บฟังก์ชันแปลงข้อมูล (adapter) เดิมที่เคยอยู่ท้าย data/words-data.js และ
 *      data/adv-sentences.js ไว้เหมือนเดิมทุกตัว (ล้วนเป็นฟังก์ชันบริสุทธิ์ ไม่ผูกกับ
 *      ข้อมูลจริง — ย้ายมาไว้ที่นี่เพราะ 2 ไฟล์ข้อมูลเดิมเลิกถูกโหลดในเบราว์เซอร์แล้ว)
 *   2) GameContentLoader.boot(appScriptSrcs) — ดึงข้อมูลจาก Edge Function, ตั้ง
 *      window.WORDS_MASTER / window.ADV_SENTENCES ให้เหมือนของเดิมทุกอย่าง แล้วค่อยแปะ
 *      <script> ของแอปเกม (เช่น js/games/reading-game-app.min.js) เข้าไปทีหลัง — กันเกม
 *      เริ่มทำงานก่อนข้อมูลมาถึง (เดิมเป็น <script> ธรรมดาโหลดพร้อมข้อมูลในไฟล์เดียวกัน
 *      ตอนนี้ข้อมูลมาจากเน็ตแบบ async เลยต้องรอให้เสร็จก่อนค่อยรันแอปเกม)
 *
 * ⚠️ ห้ามลบ/ย้ายไฟล์นี้แยกไปคนละที่กับหน้าเกม — ทุกหน้าที่เคยโหลด words-data.js/adv-sentences.js
 * ต้องโหลดไฟล์นี้แทน (ดูรายชื่อ 6 หน้าด้านบน)
 * ────────────────────────────────────────────────────────────
 */
(function (global) {
  'use strict';

  // ════════════════════════════════════════════════════════════
  // ADAPTER — ย้ายมาจาก data/words-data.js / data/adv-sentences.js เดิมทุกตัว ไม่ได้แก้ logic
  // ════════════════════════════════════════════════════════════
  var LEVEL_TXT_TO_NUM = { '初': 1, '中': 2 };

  // เกมเสียง (tone-finder.html) ใช้: word, readingTH, readingEN, zh, level(เลข 1/2), category, syls
  global.buildWordListForToneFinder = function (master) {
    return master.map(function (w) {
      return {
        word: w.word,
        readingTH: w.readingTH !== undefined ? w.readingTH : w.word,
        readingEN: w.en,
        zh: w.zh,
        level: LEVEL_TXT_TO_NUM[w.level],
        category: w.category,
        syls: w.syls,
        readSyls: w.readSyls,
      };
    });
  };

  // เกมอ่าน (reading-game.html) / เกมพิมพ์ (typing-game.html) / เกมฟัง (listening-game.html)
  // ใช้: th, zh, en, level(初/中), cons/lead/cluster/vowel/tone/final/tone_name, syls
  global.buildWordsForPhonicsGames = function (master) {
    return master.map(function (w) {
      var out = { th: w.word, zh: w.zh, en: w.en, level: w.level };
      ['cons', 'lead', 'cluster', 'vowel', 'tone', 'final', 'tone_name', 'syls', 'readingTH', 'readSyls'].forEach(function (f) {
        if (w[f] !== undefined) out[f] = w[f];
      });
      return out;
    });
  };

  // เกมอ่าน/เกมพิมพ์ ต้องการ WORDS_HIGH แบบแบน (syls รวมทั้งประโยค ไม่แยกกลุ่มตามคำ)
  global.buildSentencesForPhonicsGames = function (sentences) {
    return sentences.map(function (s) {
      var flatSyls = [];
      s.words.forEach(function (w) { flatSyls = flatSyls.concat(w.syls); });
      var en = flatSyls.map(function (sy) { return sy.en; }).join('-');
      var wordMeanings = s.words.map(function (w) { return { th: w.th, zh: w.zh }; });
      return { th: s.th, zh: s.zh, en: en, readingTH: s.readingTH, level: '高', syls: flatSyls, words: wordMeanings, politeF: s.politeF };
    });
  };

  // ════════════════════════════════════════════════════════════
  // LOADER — ดึงข้อมูลจาก Edge Function game-content แล้วค่อยรันแอปเกม
  // ════════════════════════════════════════════════════════════

  // ตั้งค่า Supabase ตรงนี้ซ้ำอีกชุด (คัดลอกมาจาก js/core/supabase-config.js ตั้งใจ ไม่ใช่พลาด)
  // เหตุผล: ไฟล์นี้ต้องรันได้ "ก่อน" supabase-config.js/auth-widget.js เสมอ เพราะ 2 ไฟล์นั้นโหลด
  // แบบ defer (รันหลัง HTML parse เสร็จ) แต่ไฟล์นี้ต้องรันแบบปกติ (บล็อก) ที่ตำแหน่งเดิมของ
  // data/words-data.js เพื่อให้ลำดับการโหลดสคริปต์ในหน้าเว็บเหมือนเดิมมากที่สุด — anonKey ไม่ใช่
  // ความลับ (public โดยตั้งใจ ตามคอมเมนต์ใน supabase-config.js) จึงคัดลอกซ้ำได้อย่างปลอดภัย
  // ⚠️ ถ้า Lin เคยหมุน (rotate) anon key ใน Supabase ต้องแก้ค่าตรงนี้ให้ตรงกับ supabase-config.js ด้วย
  var SB_URL = (global.SUPABASE_CONFIG && global.SUPABASE_CONFIG.url) || 'https://qzkxlhpcputsvbqmtqfi.supabase.co';
  var SB_ANON_KEY = (global.SUPABASE_CONFIG && global.SUPABASE_CONFIG.anonKey) ||
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF6a3hsaHBjcHV0c3ZicW10cWZpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE2NjI1NDksImV4cCI6MjA5NzIzODU0OX0.1g80zxHfduq9RLdpus10hBDSEYWIXu2Jnqb6LsvqXpw';

  function sbStorageKey() {
    var ref = (String(SB_URL).match(/https?:\/\/([^.]+)\./) || [])[1] || 'qzkxlhpcputsvbqmtqfi';
    return 'sb-' + ref + '-auth-token';
  }

  // อ่าน access_token จาก session ที่ล็อกอินไว้แล้ว (ถ้ามีและยังไม่หมดอายุ) — ไม่ต้องรอ
  // supabase-js/auth-widget.js โหลดเสร็จก่อน (แค่ "เดา" ก่อนเพื่อความเร็ว) ถ้าไม่เจอ/หมดอายุ
  // ก็ยังส่งคำขอได้ปกติ (ส่ง anon key แทน) — ฝั่งเซิร์ฟเวอร์เป็นคนตัดสิน tier จริงอยู่ดี
  function readAccessTokenGuess() {
    if (typeof localStorage === 'undefined') return null;
    try {
      var raw = localStorage.getItem(sbStorageKey());
      if (!raw) return null;
      var t = JSON.parse(raw);
      var exp = t && (t.expires_at || (t.currentSession && t.currentSession.expires_at));
      var token = t && (t.access_token || (t.currentSession && t.currentSession.access_token));
      if (!exp || !token) return null;
      return (Number(exp) * 1000) > Date.now() ? token : null;
    } catch (e) { return null; }
  }

  function fetchGameContent() {
    var token = readAccessTokenGuess() || SB_ANON_KEY;
    var ctrl = (typeof AbortController !== 'undefined') ? new AbortController() : null;
    var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, 15000) : null; // 15 วิ กันค้างเงียบๆ
    return fetch(SB_URL + '/functions/v1/game-content', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: SB_ANON_KEY, Authorization: 'Bearer ' + token },
      body: '{}',
      signal: ctrl ? ctrl.signal : undefined,
    }).then(function (res) {
      if (timer) clearTimeout(timer);
      if (!res.ok) throw new Error('game-content HTTP ' + res.status);
      return res.json();
    }).then(function (data) {
      if (!data || data.error) throw new Error((data && data.error) || 'game-content: ข้อมูลว่างเปล่า');
      if (!Array.isArray(data.words) || !Array.isArray(data.sentences)) throw new Error('game-content: รูปแบบข้อมูลผิดปกติ');
      return data;
    });
  }

  // ── UI ระหว่างโหลด/error (ไม่พึ่ง css/shared.css — ทำ style ในตัวเอง กันชนกับสไตล์เกม) ──
  // 🆕 2026-08-08 (P6-17): เปลี่ยนสีจากฟ้า/แดงทั่วไปเป็นสีธีมทองของเว็บ (CLAUDE.md หัวข้อ
  // "🎨 กฎถาวรของเกม — สีธีม/ดีไซน์เว็บ") — ยัง hardcode ค่า hex ตรงๆ เหมือนเดิม (ไม่ใช้
  // var(--...)) เพราะแถบนี้ต้องโชว์ได้ก่อน css/shared.css โหลดเสร็จ ฟอนต์ Noto Sans TC
  // ใช้ได้เลยเพราะทั้ง 6 หน้าเกมโหลด Google Fonts นี้ไว้ใน <head> อยู่แล้ว
  var THEME = {
    goldBright: '#C8973A',
    goldDeep: '#5a3e0a',
    cream: '#FAF4E8',
    amberDark: '#78350f', // พื้นแถบ error — โทนอำพันเข้มของธีม แทนสีแดงทั่วไป
  };
  var FONT_STACK = "'Noto Sans TC',sans-serif";
  var GAMES_HOME_HREF = 'games.html'; // ลิงก์กลับหน้ารวมเกม
  var LINE_CONTACT_HREF = 'https://lin.ee/yVBgvywy'; // ลิงก์ LINE มาตรฐานของเว็บ (เหมือน js/core/shared.js:975,1018,1067) ห้ามพิมพ์ค่าใหม่ซ้ำที่อื่น

  var bannerEl = null;
  function showLoadingBanner() {
    bannerEl = document.createElement('div');
    bannerEl.id = 'gc-loading-banner';
    bannerEl.setAttribute('style', 'position:fixed;top:0;left:0;right:0;z-index:99999;background:linear-gradient(90deg,' + THEME.goldBright + ',' + THEME.goldDeep + ');color:' + THEME.cream + ';text-align:center;padding:8px 12px;font-size:14px;font-family:' + FONT_STACK + ';');
    bannerEl.textContent = 'กำลังโหลดข้อมูลเกม...';
    document.body.appendChild(bannerEl);
  }
  function hideLoadingBanner() {
    if (bannerEl && bannerEl.parentNode) bannerEl.parentNode.removeChild(bannerEl);
    bannerEl = null;
  }

  // 🆕 2026-08-08 (P6-17): แปล error ดิบ (เช่น "game-content HTTP 500", "Failed to fetch")
  // เป็นข้อความภาษาคนที่ผู้เล่นอ่านเข้าใจ — แนวทางเดียวกับ friendlyRequestError() ใน
  // js/classroom/student-requests.js:208 (คนละระบบ ใช้แค่เป็นตัวอย่างโครงสร้าง)
  // ข้อความดิบจริงยังเก็บไว้ใน console.error เสมอ ไม่ทิ้งไปเฉยๆ (เผื่อต้อง debug)
  function friendlyGameContentError(err) {
    var raw = String((err && err.message) || err || '');
    if (/Failed to fetch|NetworkError|Load failed|abort/i.test(raw)) {
      return 'เชื่อมต่อเน็ตไม่ได้ ลองเช็คสัญญาณอินเทอร์เน็ตแล้วกดลองใหม่';
    }
    if (/HTTP \d|game-content:|โหลดสคริปต์เกมไม่สำเร็จ/i.test(raw)) {
      return 'ระบบเกมมีปัญหาชั่วคราว ลองใหม่อีกครั้ง หรือถ้ายังไม่ได้ให้ทัก LINE บอกครู';
    }
    return 'โหลดข้อมูลเกมไม่สำเร็จ ลองใหม่อีกครั้ง';
  }

  // แถบ error กลาง — ใช้ร่วมกันทั้งตอนโหลดข้อมูลพัง (showErrorBanner) และตอน JS พังกลางเกม
  // (showCrashBanner) เพื่อให้ผู้เล่นเห็นรูปแบบเดียวกันทุกจุดที่พัง — รับเฉพาะข้อความที่แปล
  // เป็นภาษาคนแล้วเท่านั้น (ไม่รับ raw error) จึงไม่ต้อง escape เนื้อหาความเสี่ยง XSS
  function renderErrorBanner(friendlyMessage) {
    hideLoadingBanner();
    if (document.getElementById('gc-error-banner')) return; // กันซ้อนกัน (เช่น crash handler ยิงซ้ำหลายครั้ง)
    var el = document.createElement('div');
    el.id = 'gc-error-banner';
    el.setAttribute('style', 'position:fixed;top:0;left:0;right:0;z-index:99999;background:' + THEME.amberDark + ';color:' + THEME.cream + ';text-align:center;padding:14px 12px;font-size:15px;font-family:' + FONT_STACK + ';');
    el.innerHTML = '⚠️ ' + friendlyMessage +
      '<div style="margin-top:8px;">' +
      '<button type="button" id="gc-error-retry" style="margin:2px 6px;padding:5px 14px;border:none;border-radius:5px;background:linear-gradient(90deg,' + THEME.goldBright + ',' + THEME.goldDeep + ');color:' + THEME.cream + ';font-weight:bold;font-family:' + FONT_STACK + ';cursor:pointer;">🔄 ลองใหม่</button>' +
      '<a href="' + GAMES_HOME_HREF + '" style="display:inline-block;margin:2px 6px;padding:5px 14px;border-radius:5px;background:rgba(255,255,255,.16);color:' + THEME.cream + ';text-decoration:none;font-family:' + FONT_STACK + ';">🔙 กลับหน้าเกมทั้งหมด</a>' +
      '<a href="' + LINE_CONTACT_HREF + '" target="_blank" rel="noopener" style="display:inline-block;margin:2px 6px;padding:5px 14px;border-radius:5px;background:rgba(255,255,255,.16);color:' + THEME.cream + ';text-decoration:none;font-family:' + FONT_STACK + ';">💬 ทัก LINE ครู</a>' +
      '</div>';
    document.body.appendChild(el);
    el.querySelector('#gc-error-retry').addEventListener('click', function () { location.reload(); });
  }

  // เรียกตอนโหลดข้อมูลเกม/สคริปต์เกมพัง (สถานการณ์ที่ 1)
  function showErrorBanner(err) {
    console.error('[game-content-client] โหลดข้อมูลเกมไม่สำเร็จ:', err);
    renderErrorBanner(friendlyGameContentError(err));
  }

  // เรียกตอน JS พังกลางเกม (สถานการณ์ที่ 3) — ดู installCrashHandler ท้ายไฟล์
  function showCrashBanner(err) {
    console.error('[game-content-client] เกิดข้อผิดพลาดกลางเกม:', err);
    renderErrorBanner('เกิดข้อผิดพลาดในเกม ขออภัยในความไม่สะดวก ลองโหลดหน้าใหม่อีกครั้ง');
  }

  function injectScript(src) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = src;
      s.onload = function () { resolve(); };
      s.onerror = function () { reject(new Error('โหลดสคริปต์เกมไม่สำเร็จ: ' + src)); };
      document.body.appendChild(s);
    });
  }

  // ════════════════════════════════════════════════════════════
  // GA4: game_content_cap_hit — เพิ่ม 2026-08-08 (P6-08 ข้อ 1 ในหัวข้อ 5 ของ
  // 39_P6-08_ตัววัดผลเกมแยกจากคลาส.md) — ยิงเมื่อ Edge Function บอกว่าระดับนั้น "ชนเพดาน
  // เนื้อหาฟรีแล้ว" (data.capped['初'/'中']/.sentences === true) เป็นสัญญาณ conversion
  // (กี่คน/สัปดาห์เล่นจนคลังฟรีหมด = กลุ่มเป้าหมายที่พร้อมจ่ายมากที่สุด)
  //
  // ยิงสูงสุด "1 ครั้งต่อระดับ ต่อ session ของแท็บนี้" ผ่าน sessionStorage (ไม่ใช่
  // localStorage — เป็นสัญญาณระดับ session ไม่ใช่ถาวร) กันไม่ให้ผู้เล่นที่ชนเพดานแล้วเปิด/
  // รีโหลดหน้าเกมซ้ำๆ ยิง event ท่วม analytics — รูปแบบ dedup เดียวกับ book_trial_click ใน
  // js/core/shared.js:484-492 (เช็ค sessionStorage.getItem ก่อนยิง แล้วค่อย setItem หลังยิง)
  //
  // กลไกยิง GA4 ใช้แบบเดียวกับทั้งเว็บ (เช่น reading-game-app.js:633-634,
  // game-switcher.js:32): เช็ค typeof gtag==='function' ก่อนเรียกเสมอ + ครอบ try/catch —
  // กันเกมพังถ้า gtag ยังไม่โหลด/ถูกบล็อกด้วย ad blocker (ตาม CONSTRAINTS: ต้อง defensive)
  // ────────────────────────────────────────────────────────────
  function fireCapHitEvents(data) {
    try {
      if (!data || !data.capped || typeof gtag !== 'function') return;
      var tier = data.tier;
      ['初', '中', 'sentences'].forEach(function (level) {
        try {
          if (!data.capped[level]) return;
          var key = 'gc_cap_fired_' + level;
          if (sessionStorage.getItem(key) === '1') return;
          gtag('event', 'game_content_cap_hit', { category: 'game', level: level, tier: tier });
          sessionStorage.setItem(key, '1');
        } catch (e2) { /* ห้ามให้ระดับหนึ่งพังจนกระทบระดับอื่น */ }
      });
    } catch (e) {
      // ห้ามให้ analytics พังจนกระทบการโหลดเกม
    }
  }

  // เรียกจากหน้าเกม: GameContentLoader.boot(['js/games/reading-game-app.min.js?v=22'])
  // 🆕 2026-08-08 (P6-28): boot() ตอนนี้ "return" Promise ออกไปด้วย (เดิมไม่ return อะไรเลย)
  // เหตุผล: ปุ่มเล่นเกมทั้งหมดใช้ onclick="ฟังก์ชัน()" inline ซึ่งกดได้ทันทีตั้งแต่หน้าโหลดเสร็จ
  // แต่ฟังก์ชันจริงมาจากสคริปต์เกมที่เพิ่งถูกแปะเข้าไปตรงนี้ (async รอ fetch ได้ถึง 15 วิ) —
  // กดปุ่มก่อนหน้านี้จะเจอ error "ฟังก์ชันไม่มีอยู่จริง" หน้าเกมแต่ละหน้าจึงต้อง .then()/.catch()
  // ต่อจาก boot() เพื่อรู้ว่าจะ "เปิดปุ่ม" เมื่อไหร่ (ดู gcGateButtons() ในแต่ละไฟล์ HTML)
  // ยังคงยิง showErrorBanner() ที่นี่เหมือนเดิมเมื่อพัง (ห้ามเงียบ) แล้ว "throw ต่อ" ให้ผู้เรียก
  // รู้ด้วยว่าพัง (ผู้เรียกไม่ต้องแสดง error ซ้ำ แค่ปล่อยปุ่มเป็น disabled ต่อไปตามที่ CSS ทำอยู่แล้ว)
  global.GameContentLoader = {
    boot: function (appScriptSrcs) {
      if (document.body) showLoadingBanner();
      else document.addEventListener('DOMContentLoaded', showLoadingBanner);

      return fetchGameContent().then(function (data) {
        fireCapHitEvents(data);
        global.WORDS_MASTER = data.words;
        global.ADV_SENTENCES = data.sentences;
        var chain = Promise.resolve();
        (appScriptSrcs || []).forEach(function (src) {
          chain = chain.then(function () { return injectScript(src); });
        });
        return chain;
      }).then(function () {
        hideLoadingBanner();
      }).catch(function (err) {
        showErrorBanner(err);
        throw err;
      });
    },
  };

  // ════════════════════════════════════════════════════════════
  // GLOBAL CRASH HANDLER (สถานการณ์ที่ 3 — JS พังกลางเกม) — เพิ่ม 2026-08-08 (P6-17)
  // ทั้ง 6 หน้าเกมโหลดไฟล์นี้อยู่แล้ว จึงใส่ handler ตรงนี้ที่เดียวครอบคลุมทุกหน้า ไม่ต้อง
  // แก้ไฟล์เกมแต่ละเกม (reading-game-app.js ฯลฯ) เลยสักไฟล์ — ก่อนหน้านี้ทั้ง 6 หน้าไม่มี
  // window.onerror/unhandledrejection เลย (ตรวจแล้วทั้ง repo เจอแค่ js/classroom/
  // attendance-auth.js:718 ซึ่งเป็นเครื่องมือฝั่งครูคนละหน้า ไม่ได้โหลดในหน้าเกม)
  //
  // ตั้งใจใช้ addEventListener('error'/'unhandledrejection', ...) แทนการเขียนทับ
  // window.onerror ตรงๆ — กันไม่ให้ไปเบียด/ทับ handler อื่นถ้ามีในอนาคต และไม่ preventDefault
  // ไม่ throw ต่อ ไม่ยุ่งกับ try/catch ภายในโค้ดเกมเอง (แค่ "ฟังเฉยๆ" แล้วโชว์แถบแจ้งเตือน)
  // ทุกจุดครอบด้วย try/catch กันตัว handler เองพังซ้อนจนทำให้สถานการณ์แย่ลงไปอีก
  // ────────────────────────────────────────────────────────────
  function installCrashHandler() {
    try {
      global.addEventListener('error', function (evt) {
        try { showCrashBanner((evt && (evt.error || evt.message)) || evt); } catch (e2) { /* ห้ามให้ handler เองพังซ้อน */ }
      });
      global.addEventListener('unhandledrejection', function (evt) {
        try { showCrashBanner(evt && evt.reason); } catch (e2) { /* ห้ามให้ handler เองพังซ้อน */ }
      });
    } catch (e) {
      // ไม่ใช่จุดสำคัญพอจะหยุดทั้งหน้าเกม แค่ไม่มี safety net เพิ่มเท่านั้น
    }
  }
  installCrashHandler();
})(window);
