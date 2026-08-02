/**
 * game-content-client.js — Lin 2026-08-02
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
  var bannerEl = null;
  function showLoadingBanner() {
    bannerEl = document.createElement('div');
    bannerEl.id = 'gc-loading-banner';
    bannerEl.setAttribute('style', 'position:fixed;top:0;left:0;right:0;z-index:99999;background:#2563eb;color:#fff;text-align:center;padding:8px 12px;font-size:14px;font-family:sans-serif;');
    bannerEl.textContent = 'กำลังโหลดข้อมูลเกม...';
    document.body.appendChild(bannerEl);
  }
  function hideLoadingBanner() {
    if (bannerEl && bannerEl.parentNode) bannerEl.parentNode.removeChild(bannerEl);
    bannerEl = null;
  }
  function showErrorBanner(message) {
    hideLoadingBanner();
    var el = document.createElement('div');
    el.id = 'gc-error-banner';
    el.setAttribute('style', 'position:fixed;top:0;left:0;right:0;z-index:99999;background:#dc2626;color:#fff;text-align:center;padding:14px 12px;font-size:15px;font-family:sans-serif;');
    el.innerHTML = '⚠️ โหลดข้อมูลเกมไม่สำเร็จ กรุณาลองใหม่ (' + String(message).replace(/</g, '&lt;') + ')' +
      ' &nbsp; <button type="button" style="margin-left:8px;padding:4px 12px;border:none;border-radius:4px;background:#fff;color:#dc2626;font-weight:bold;cursor:pointer;">ลองใหม่</button>';
    el.querySelector('button').addEventListener('click', function () { location.reload(); });
    document.body.appendChild(el);
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

  // เรียกจากหน้าเกม: GameContentLoader.boot(['js/games/reading-game-app.min.js?v=22'])
  global.GameContentLoader = {
    boot: function (appScriptSrcs) {
      if (document.body) showLoadingBanner();
      else document.addEventListener('DOMContentLoaded', showLoadingBanner);

      fetchGameContent().then(function (data) {
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
        showErrorBanner((err && err.message) || err);
      });
    },
  };
})(window);
