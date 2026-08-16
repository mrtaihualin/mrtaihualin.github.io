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
  // Resolve browser config only when boot runs (after deferred supabase-config.js executed).
  // No embedded production fallback: a missing/mismatched config must fail closed.
  function currentConfig() {
    var cfg = global.SUPABASE_CONFIG || {};
    if (!cfg.url || !cfg.anonKey || /YOUR_/.test(cfg.url) || /YOUR_/.test(cfg.anonKey)) {
      throw new Error('game-content: Supabase config unavailable');
    }
    return { url: cfg.url, anonKey: cfg.anonKey };
  }

  // หน้าเกมบางหน้าเรียก boot() จาก inline script ก่อน HTML parse จบ ขณะที่
  // supabase-config.js โหลดแบบ defer และจะรันหลัง parse เสร็จ การรอ DOMContentLoaded
  // ตรง loader กลางทำให้ทุกเกมเห็น config ชุดเดียวกันก่อนยิง Edge Function โดยยังคง
  // fail closed หากไฟล์ config หายหรือค่าผิดจริง
  function whenDeferredConfigReady() {
    if (document.readyState !== 'loading') return Promise.resolve();
    return new Promise(function (resolve) {
      document.addEventListener('DOMContentLoaded', resolve, { once: true });
    });
  }

  function sbStorageKey(url) {
    var ref = (String(url).match(/https?:\/\/([^.]+)\./) || [])[1] || '';
    return 'sb-' + ref + '-auth-token';
  }

  // อ่าน access_token จาก session ที่ล็อกอินไว้แล้ว (ถ้ามีและยังไม่หมดอายุ) — ไม่ต้องรอ
  // supabase-js/auth-widget.js โหลดเสร็จก่อน (แค่ "เดา" ก่อนเพื่อความเร็ว) ถ้าไม่เจอ/หมดอายุ
  // ก็ยังส่งคำขอได้ปกติ (ส่ง anon key แทน) — ฝั่งเซิร์ฟเวอร์เป็นคนตัดสิน tier จริงอยู่ดี
  function readAccessTokenGuess(url) {
    if (typeof localStorage === 'undefined') return null;
    try {
      var raw = localStorage.getItem(sbStorageKey(url));
      if (!raw) return null;
      var t = JSON.parse(raw);
      var exp = t && (t.expires_at || (t.currentSession && t.currentSession.expires_at));
      var token = t && (t.access_token || (t.currentSession && t.currentSession.access_token));
      if (!exp || !token) return null;
      return (Number(exp) * 1000) > Date.now() ? token : null;
    } catch (e) { return null; }
  }

  function fetchGameContent() {
    var cfg = currentConfig();
    var token = readAccessTokenGuess(cfg.url) || cfg.anonKey;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      return Promise.reject(new Error('NETWORK_OFFLINE'));
    }
    if (!global.NetworkGuard || typeof global.NetworkGuard.request !== 'function') {
      return Promise.reject(new Error('NETWORK_GUARD_UNAVAILABLE'));
    }
    return global.NetworkGuard.request(fetch, cfg.url + '/functions/v1/game-content', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: cfg.anonKey, Authorization: 'Bearer ' + token },
      body: '{}'
    }, 15000).then(function (res) {
      if (!res.ok) throw new Error('game-content HTTP ' + res.status);
      return res.json();
    }).then(function (data) {
      if (!data || data.error) throw new Error((data && data.error) || 'game-content: ข้อมูลว่างเปล่า');
      if (!Array.isArray(data.words) || !Array.isArray(data.sentences)) throw new Error('game-content: รูปแบบข้อมูลผิดปกติ');
      if (!data.words.length || !data.sentences.length) throw new Error('game-content: ชุดข้อมูลที่จำเป็นว่างเปล่า');
      if (!Array.isArray(data.audioAvailable)) throw new Error('game-content: audio entitlement contract unavailable');
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
    bannerEl.textContent = '遊戲資料載入中...';
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
    if (/NETWORK_TIMEOUT|NETWORK_OFFLINE|Failed to fetch|NetworkError|Load failed|abort/i.test(raw)) {
      return '無法連線，請檢查網路訊號後再試一次';
    }
    if (/HTTP \d|game-content:|โหลดสคริปต์เกมไม่สำเร็จ/i.test(raw)) {
      return '遊戲系統暫時出問題，請再試一次，如果還是不行請用LINE跟老師說';
    }
    return '遊戲資料載入失敗，請再試一次';
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
      '<button type="button" id="gc-error-retry" style="margin:2px 6px;padding:5px 14px;border:none;border-radius:5px;background:linear-gradient(90deg,' + THEME.goldBright + ',' + THEME.goldDeep + ');color:' + THEME.cream + ';font-weight:bold;font-family:' + FONT_STACK + ';cursor:pointer;">🔄 重新載入</button>' +
      '<a href="' + GAMES_HOME_HREF + '" style="display:inline-block;margin:2px 6px;padding:5px 14px;border-radius:5px;background:rgba(255,255,255,.16);color:' + THEME.cream + ';text-decoration:none;font-family:' + FONT_STACK + ';">🔙 返回遊戲總覽</a>' +
      '<a href="' + LINE_CONTACT_HREF + '" target="_blank" rel="noopener" style="display:inline-block;margin:2px 6px;padding:5px 14px;border-radius:5px;background:rgba(255,255,255,.16);color:' + THEME.cream + ';text-decoration:none;font-family:' + FONT_STACK + ';">💬 用LINE問老師</a>' +
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
    renderErrorBanner('遊戲發生錯誤，造成不便敬請見諒，請重新整理頁面');
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

  // ════════════════════════════════════════════════════════════
  // C.5 (P7-02, เพิ่ม 2026-08-10): แถบแจ้ง "เนื้อหาฟรีหมดแล้ว" + ทางไปต่อ
  // เดิม data.capped ใช้แค่ยิง GA4 เฉยๆ (fireCapHitEvents ด้านบน) ไม่มี UI บอกผู้เล่นเลย —
  // ผู้เล่นที่เล่นจนครบคลังคำ/ประโยคของสิทธิ์ตัวเองจะไม่รู้ตัวว่า "หมดแล้ว" (คิดว่าเกมมีปัญหา
  // แทน) นี่คือ gap ที่บล็อกการเปิดขาย (ดู 72_เช็คลิสต์...md หัวข้อ "ค้างไว้")
  //
  // ข้อความแยกตาม tier ตรงตามความจริง (ห้ามโกหก/ห้ามเสนอของที่ยังไม่มี — ยังไม่มีระบบสมาชิก
  // จ่ายเงิน ตาม CLAUDE.md หัวข้อ 🔒 ระบบล็อกเนื้อหาเกมจริง):
  //   - tier=anon → ชวนล็อกอิน (ฟรี 100% ไม่ใช่ขายของ) ปลดล็อกเพดานที่สูงกว่า
  //   - tier=login → บอกตรงๆ ว่าเปิดครบเท่าที่มีตอนนี้แล้ว กำลังเพิ่มคลังเรื่อยๆ (ไม่มีปุ่ม
  //     "อัปเกรด" หลอกๆ เพราะระบบจ่ายเงินยังไม่เปิด)
  //
  // โชว์ครั้งเดียวต่อ session ต่อแท็บ (sessionStorage เหมือน dedup ของ GA4 event ด้านบน)
  // ปุ่ม 🔑 登入 พยายามเรียก window.READING_AUTH.openLoginGate() ก่อน (มีในเกม 6 ใน 7 หน้าที่
  // โหลดไฟล์นี้) ถ้าหน้านั้นไม่มีระบบล็อกอินเลย (เช่น listening-game.html ตอนนี้ยังไม่มี
  // reading-auth.js) ให้พาไปหน้า reading-game.html แทนกันปุ่มกดแล้วไม่มีอะไรเกิดขึ้น
  // ────────────────────────────────────────────────────────────
  var CAP_BANNER_SESSION_KEY = 'gc_cap_banner_shown_v1';
  var LOGIN_FALLBACK_HREF = 'reading-game.html';

  function anyCapped(capped) {
    return !!(capped && (capped['初'] || capped['中'] || capped.sentences));
  }

  function loginGateReady() {
    return !!(global.READING_AUTH && global.READING_AUTH.ready && typeof global.READING_AUTH.openLoginGate === 'function');
  }

  // reading-auth.js โหลดแบบ defer อาจยังไม่ set window.READING_AUTH ตอนที่ผู้เล่นกดปุ่ม (ไวมาก) —
  // ลองรอสูงสุด ~4.5 วิ (15 ครั้ง x 300ms) ก่อนถอยไปใช้ทางสำรอง (คลิกปุ่ม #rg-login-btn ถ้ามี
  // หรือพาไปหน้าที่มีระบบล็อกอินแทน) ไม่ปล่อยให้ปุ่มเงียบเฉยๆ (ตามกฎ RELIABILITY FIRST)
  function triggerLoginGate() {
    var tries = 0;
    var timer = setInterval(function () {
      tries++;
      if (loginGateReady()) {
        clearInterval(timer);
        global.READING_AUTH.openLoginGate();
        return;
      }
      if (tries >= 15) {
        clearInterval(timer);
        var btn = document.getElementById('rg-login-btn');
        if (btn) { btn.click(); return; }
        global.location.href = LOGIN_FALLBACK_HREF;
      }
    }, 300);
  }

  function showCapBanner(data) {
    try {
      if (!anyCapped(data && data.capped)) return;
      if (typeof sessionStorage !== 'undefined' && sessionStorage.getItem(CAP_BANNER_SESSION_KEY) === '1') return;

      var isAnon = data.tier === 'anon';
      var msg = isAnon
        ? '🎉 免費內容你都練過一輪囉！登入帳號（完全免費）可以解鎖更多單字和句子'
        : '📚 目前開放的內容你都練過了，我們持續在新增題庫，敬請期待';

      var el = document.createElement('div');
      el.id = 'gc-cap-banner';
      el.setAttribute('style', 'position:fixed;left:12px;right:12px;bottom:12px;z-index:99998;max-width:480px;margin:0 auto;' +
        'background:linear-gradient(135deg,' + THEME.goldBright + ',' + THEME.goldDeep + ');color:' + THEME.cream + ';' +
        'border-radius:14px;padding:12px 14px;font-family:' + FONT_STACK + ';font-size:13.5px;line-height:1.5;' +
        'box-shadow:0 4px 16px rgba(0,0,0,.25);display:flex;align-items:center;gap:10px;');
      el.innerHTML =
        '<div style="flex:1;">' + msg + '</div>' +
        (isAnon ? '<button type="button" id="gc-cap-login-btn" style="flex-shrink:0;padding:7px 14px;border:none;border-radius:20px;' +
          'background:' + THEME.cream + ';color:' + THEME.goldDeep + ';font-weight:700;font-family:' + FONT_STACK + ';cursor:pointer;white-space:nowrap;">🔑 登入</button>' : '') +
        '<button type="button" id="gc-cap-close-btn" aria-label="關閉" style="flex-shrink:0;background:none;border:none;color:' + THEME.cream + ';font-size:18px;line-height:1;cursor:pointer;padding:2px 4px;">✕</button>';
      document.body.appendChild(el);
      try { sessionStorage.setItem(CAP_BANNER_SESSION_KEY, '1'); } catch (e2) { /* ไม่ใช่จุดสำคัญพอจะหยุด */ }

      var closeBtn = document.getElementById('gc-cap-close-btn');
      if (closeBtn) closeBtn.addEventListener('click', function () { if (el.parentNode) el.parentNode.removeChild(el); });

      if (isAnon) {
        var loginBtn = document.getElementById('gc-cap-login-btn');
        if (loginBtn) loginBtn.addEventListener('click', triggerLoginGate);
      }
    } catch (e) {
      console.error('[game-content-client] showCapBanner error:', e);
      // ห้ามให้แถบนี้พังจนกระทบการโหลดเกม
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

      return whenDeferredConfigReady().then(fetchGameContent).then(function (data) {
        fireCapHitEvents(data);
        showCapBanner(data);
        if (global.WordAudio && typeof global.WordAudio.setAvailability === 'function') {
          global.WordAudio.setAvailability(data.audioAvailable);
        }
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
  //
  // 🆕 2026-08-10 (แก้บั๊กที่เจอตอนทดสอบ staging): เดิม handler ดักจับ "ทุก error/
  // unhandledrejection ที่เกิดบนหน้า" แบบไม่กรองต้นตอ — เจอจริงว่า error ที่ไม่เกี่ยวกับ
  // เกมเลย (เช่น พิมพ์คำสั่ง fetch() มือใน DevTools Console แล้วพังเพราะขาด header) ก็โดน
  // เหมารวมเป็น "遊戲發生錯誤" ไปด้วย ทั้งที่เกมยังทำงานปกติ — ผู้เล่นจริงที่เจอ error จาก
  // ส่วนขยายเบราว์เซอร์ (ad blocker ฯลฯ) ก็จะเจอแถบแดงหลอกแบบเดียวกัน
  // ตอนนี้กรองก่อนโชว์แถบ: ต้องสืบย้อนไปหาไฟล์ที่มาจาก origin เดียวกับเว็บเราเท่านั้น
  // (evt.filename ของ 'error' / evt.reason.stack ของ 'unhandledrejection') — error จาก
  // สคริปต์อื่น (extension, eval ใน console, cross-origin) จะถูกข้าม "ไม่โชว์แถบ" แต่ยังคง
  // console.error ไว้เสมอ (ห้ามเงียบสนิทตามกฎ RELIABILITY FIRST — เก็บร่องรอยให้ debug ได้)
  // ────────────────────────────────────────────────────────────
  function isSameOriginSource(url) {
    if (!url) return false;
    try {
      return new URL(String(url), global.location.href).origin === global.location.origin;
    } catch (e) {
      return false;
    }
  }
  // The crash banner means the playable game itself is no longer trustworthy. Do not show it
  // for every same-origin script: navigation, analytics and other optional page enhancements
  // can fail while gameplay remains fully usable (confirmed by Safari Phase 1 human E2E).
  // Loading failures still use showErrorBanner() above; this allow-list is only for uncaught
  // runtime errors after the game has loaded.
  var CORE_GAME_SCRIPT_PATTERN = /\/js\/games\/(?:game-content-client|tone-finder-game|reading-game-app|listening-game-app|typing-game-app|word-order-app)(?:\.min)?\.js(?:[?#:]|$)/;
  function isCoreGameplaySource(url) {
    if (!isSameOriginSource(url)) return false;
    try {
      return CORE_GAME_SCRIPT_PATTERN.test(new URL(String(url), global.location.href).pathname);
    } catch (e) {
      return false;
    }
  }
  // stack trace ของ error ที่มาจากไฟล์เว็บเราเอง จะมีบรรทัดที่ระบุ URL เต็ม (origin เดียวกับ
  // location.origin) — error จาก console เอง (eval/VM/debugger eval code) หรือ extension
  // (chrome-extension://) จะไม่มีบรรทัดแบบนี้เลย
  function stackHasCoreGameplayFrame(stack) {
    if (!stack || typeof stack !== 'string') return false;
    try {
      var origin = global.location.origin;
      return stack.indexOf(origin) !== -1 && CORE_GAME_SCRIPT_PATTERN.test(stack);
    } catch (e) {
      return false;
    }
  }
  function installCrashHandler() {
    try {
      global.addEventListener('error', function (evt) {
        try {
          var err = (evt && (evt.error || evt.message)) || evt;
          if (!isCoreGameplaySource(evt && evt.filename)) {
            console.error('[game-content-client] error ที่ไม่ได้มาจากไฟล์หลักของเกม (ข้ามไม่โชว์แถบแดง):', err, evt && evt.filename);
            return;
          }
          showCrashBanner(err);
        } catch (e2) { /* ห้ามให้ handler เองพังซ้อน */ }
      });
      global.addEventListener('unhandledrejection', function (evt) {
        try {
          var reason = evt && evt.reason;
          var stack = reason && reason.stack;
          if (!stackHasCoreGameplayFrame(stack)) {
            console.error('[game-content-client] unhandledrejection ที่ไม่ได้มาจากไฟล์หลักของเกม (ข้ามไม่โชว์แถบแดง):', reason);
            return;
          }
          showCrashBanner(reason);
        } catch (e2) { /* ห้ามให้ handler เองพังซ้อน */ }
      });
    } catch (e) {
      // ไม่ใช่จุดสำคัญพอจะหยุดทั้งหน้าเกม แค่ไม่มี safety net เพิ่มเท่านั้น
    }
  }
  installCrashHandler();
})(window);
