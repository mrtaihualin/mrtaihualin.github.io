/**
 * game-content-client.js — Lin 2026-08-02
 * FILE MAP: [01] data adapters → [02] auth token lookup → [03] content fetch → [04] loading/error UI → [05] script injection + public loader
 * ────────────────────────────────────────────────────────────
 * แทนที่ <script src="data/words-data.js"> / <script src="data/adv-sentences.js"> เดิม
 * ในเกมคำศัพท์ 5 หน้า (reading-game / tone-finder / typing-game / word-order /
 * listening-game) — ของเดิมโหลดไฟล์ที่มีคำ/ประโยค "ครบทุกอัน" ตรงๆ ผ่าน URL
 * public เห็นได้หมดไม่ว่าจะล็อกอินหรือไม่ (ช่องโหว่ความปลอดภัย) ตอนนี้เปลี่ยนเป็นขอข้อมูล
 * (ตัดโควตาแล้วตามสิทธิ์จริง) จาก Edge Function `game-content` แทน
 *
 * ไฟล์นี้ทำ 2 อย่าง:
 *   1) ตรวจว่าระเบียนที่ Lin ตรวจแล้วครบ และฉายชื่อช่องให้ UI เดิมโดยคัดลอกค่าเท่านั้น
 *      ห้ามใช้กฎภาษา อนุมาน แก้ หรือสร้างคำตอบขึ้นใหม่
 *   2) GameContentLoader.boot(appScriptSrcs) — ดึงข้อมูลจาก Edge Function, ตั้ง
 *      window.WORDS_MASTER / window.ADV_SENTENCES ให้เหมือนของเดิมทุกอย่าง แล้วค่อยแปะ
 *      <script> ของแอปเกม (เช่น js/games/reading-game-app.min.js) เข้าไปทีหลัง — กันเกม
 *      เริ่มทำงานก่อนข้อมูลมาถึง (เดิมเป็น <script> ธรรมดาโหลดพร้อมข้อมูลในไฟล์เดียวกัน
 *      ตอนนี้ข้อมูลมาจากเน็ตแบบ async เลยต้องรอให้เสร็จก่อนค่อยรันแอปเกม)
 *
 * ⚠️ ห้ามลบ/ย้ายไฟล์นี้แยกไปคนละที่กับหน้าเกม — เกมคำศัพท์ทั้ง 5 หน้าต้องโหลด
 * ข้อมูลที่ผ่าน game-content เท่านั้น
 * ────────────────────────────────────────────────────────────
 */
(function (global) {
  'use strict';

  // ════════════════════════════════════════════════════════════
  // VIEW PROJECTION — names used by the existing UI, copied only from the exact
  // canonical record. No Thai-language rule, inference, fallback or correction lives here.
  // ════════════════════════════════════════════════════════════
  var LEVEL_TXT_TO_NUM = { '初': 1, '中': 2 };
  var REQUIRED_CATALOG_STRING_FIELDS = [
    'contentKey', 'reviewSet', 'word', 'spellingTH', 'readingTH', 'roman', 'zhTW',
    'level', 'type', 'category', 'audioStatus'
  ];
  var REQUIRED_SYLLABLE_STRING_FIELDS = [
    'roman', 'lead', 'consonant', 'cluster', 'vowel', 'writtenFinal', 'toneMark',
    'toneName', 'liveDead', 'consonantReadDifference', 'finalReadDifference', 'silent'
  ];

  function isExactNonblank(value) {
    return typeof value === 'string' && value.length > 0 && value.trim() === value;
  }

  function hasExactStringBoundaries(value) {
    if (typeof value === 'string') return value.trim() === value;
    if (Array.isArray(value)) return value.every(hasExactStringBoundaries);
    if (value && typeof value === 'object') return Object.keys(value).every(function (key) {
      return hasExactStringBoundaries(value[key]);
    });
    return true;
  }

  function hasRequiredStrings(value, fields) {
    return fields.every(function (field) {
      return isExactNonblank(value[field]);
    });
  }

  function exactWrittenSegments(record) {
    if (!record || !Array.isArray(record.syllables) || !record.syllables.length) return null;
    if (Array.isArray(record.spellingSyllables)) {
      if (record.spellingSyllables.length !== record.syllables.length ||
          !record.spellingSyllables.every(function (syllable) { return syllable && isExactNonblank(syllable.th); }) ||
          record.spellingSyllables.map(function (syllable) { return syllable.th; }).join('') !== record.word) return null;
      return record.spellingSyllables;
    }
    // The Paid 189 queue predates spellingSyllables, but spellingTH already contains
    // Lin's exact reviewed written-syllable boundaries. Copy those explicit segments;
    // never infer a boundary from Thai spelling or pronunciation.
    if (Object.prototype.hasOwnProperty.call(record, 'spellingSyllables') || !isExactNonblank(record.spellingTH)) return null;
    var parts = record.spellingTH.split('-');
    if (parts.length !== record.syllables.length ||
        parts.some(function (part) { return !isExactNonblank(part); }) || parts.join('') !== record.word) return null;
    return parts.map(function (th) { return { th: th }; });
  }

  function requireCatalogBundle(bundle) {
    var record = bundle && bundle.catalog;
    if (!record || typeof record !== 'object' || Array.isArray(record)) {
      throw new Error('game-content: catalog authority missing');
    }
    if (!hasExactStringBoundaries(record) ||
        !hasRequiredStrings(record, REQUIRED_CATALOG_STRING_FIELDS) ||
        !Array.isArray(record.approvalRefs) || !record.approvalRefs.length ||
        !record.approvalRefs.every(isExactNonblank) ||
        !Array.isArray(record.syllables) || !record.syllables.length) {
      throw new Error('game-content: catalog authority incomplete (' + (record.contentKey || record.word || 'unknown') + ')');
    }
    var writtenSegments = exactWrittenSegments(record);
    if (!writtenSegments) {
      throw new Error('game-content: reviewed display segmentation missing (' + record.contentKey + ')');
    }
    return { record: record, writtenSegments: writtenSegments };
  }

  function projectSyllable(record, display, contentKey, index) {
    if (!record || !display || !isExactNonblank(display.th) || !hasRequiredStrings(record, REQUIRED_SYLLABLE_STRING_FIELDS)) {
      throw new Error('game-content: syllable authority incomplete (' + contentKey + ':' + index + ')');
    }
    if (!Number.isInteger(record.toneNumber) || record.toneNumber < 1 || record.toneNumber > 5) {
      throw new Error('game-content: reviewed answer missing (' + contentKey + ':' + index + ')');
    }
    return {
      th: display.th,
      en: record.roman,
      lead: record.lead,
      cons: record.consonant,
      cluster: record.cluster,
      vowel: record.vowel,
      final: record.writtenFinal,
      tone: record.toneMark,
      toneNumber: record.toneNumber,
      tone_name: record.toneName,
      liveDead: record.liveDead,
      consRead: record.consonantReadDifference,
      finalRead: record.finalReadDifference,
      silent: record.silent,
      catalog: record
    };
  }

  function projectWord(bundle) {
    var checked = requireCatalogBundle(bundle);
    var record = checked.record;
    var syllables = record.syllables.map(function (syllable, index) {
      return projectSyllable(syllable, checked.writtenSegments[index], record.contentKey, index);
    });
    return {
      contentKey: record.contentKey,
      word: record.word,
      spellingTH: record.spellingTH,
      readingTH: record.readingTH,
      en: record.roman,
      zh: record.zhTW,
      level: record.level,
      type: record.type,
      category: record.category,
      audioStatus: record.audioStatus,
      approvalRefs: record.approvalRefs,
      syls: syllables,
      catalog: record
    };
  }

  function projectWords(master) {
    return master.map(projectWord);
  }

  function validateCatalogPayload(master) {
    projectWords(master); // validation only; exact payload remains untouched
    return master;
  }

  // เกมเสียง (tone-finder.html) ใช้: word, readingTH, readingEN, zh, level(เลข 1/2), category, syls
  global.buildWordListForToneFinder = function (master) {
    return projectWords(master).map(function (w) {
      return {
        word: w.word,
        contentKey: w.contentKey,
        spellingTH: w.spellingTH,
        readingTH: w.readingTH,
        readingEN: w.en,
        zh: w.zh,
        level: LEVEL_TXT_TO_NUM[w.level],
        category: w.category,
        syls: w.syls,
        catalog: w.catalog,
      };
    });
  };

  // เกมอ่าน (reading-game.html) / เกมพิมพ์ (typing-game.html) / เกมฟัง (listening-game.html)
  // ใช้: th, zh, en, level(初/中), cons/lead/cluster/vowel/tone/final/tone_name, syls
  global.buildWordsForPhonicsGames = function (master) {
    return projectWords(master).map(function (w) {
      var out = { th: w.word, zh: w.zh, en: w.en, level: w.level, contentKey: w.contentKey };
      ['cons', 'lead', 'cluster', 'vowel', 'tone', 'final', 'tone_name', 'syls', 'spellingTH', 'readingTH'].forEach(function (f) {
        if (w[f] !== undefined) out[f] = w[f];
      });
      return out;
    });
  };

  // เกมอ่าน/เกมพิมพ์ ต้องการ WORDS_HIGH แบบแบน (syls รวมทั้งประโยค ไม่แยกกลุ่มตามคำ)
  // Encoding of the existing reviewed tone name, not a Thai-language calculation.
  var SENTENCE_TONE_NUMBERS = { 'สามัญ': 1, 'เอก': 2, 'โท': 3, 'ตรี': 4, 'จัตวา': 5 };
  function projectSentenceSyllable(syllable) {
    var toneNumber = SENTENCE_TONE_NUMBERS[syllable.tone_name];
    if (!Number.isInteger(toneNumber) ||
        (syllable.toneNumber != null && syllable.toneNumber !== toneNumber)) {
      throw new Error('game-content: sentence tone authority incomplete');
    }
    var projected = {};
    Object.keys(syllable).forEach(function (field) { projected[field] = syllable[field]; });
    projected.toneNumber = toneNumber;
    // Sentence rows predate the canonical word catalog. Keep their reviewed values exact,
    // while exposing the same presentation-only shape used by reviewed-vocabulary-display.
    // Text stays exact; only the already-reviewed tone name is encoded as its 1–5 ID.
    projected.catalog = {
      roman: syllable.en,
      lead: syllable.lead,
      consonant: syllable.cons,
      cluster: syllable.cluster,
      vowel: syllable.vowel,
      writtenFinal: syllable.final,
      toneMark: syllable.tone,
      toneName: syllable.tone_name,
      toneNumber: toneNumber,
      liveDead: syllable.liveDead,
      consonantReadDifference: syllable.consRead,
      finalReadDifference: syllable.finalRead,
      silent: syllable.silent
    };
    return projected;
  }

  global.buildSentencesForPhonicsGames = function (sentences) {
    return sentences.map(function (s) {
      if (!s || !hasExactStringBoundaries(s) ||
          !isExactNonblank(s.th) || !isExactNonblank(s.zh) || !isExactNonblank(s.readingTH) ||
          !Number.isInteger(s.wc) || !Array.isArray(s.words) || !s.words.length) {
        throw new Error('game-content: sentence authority incomplete');
      }
      var flatSyls = [];
      s.words.forEach(function (w) {
        if (!w || !isExactNonblank(w.th) || !isExactNonblank(w.zh) || !Array.isArray(w.syls) || !w.syls.length) throw new Error('game-content: sentence authority incomplete (' + s.th + ')');
        w.syls.forEach(function (sy) {
          if (!sy || !isExactNonblank(sy.th) || !isExactNonblank(sy.en) || !isExactNonblank(sy.cons) ||
              !isExactNonblank(sy.vowel) || !isExactNonblank(sy.tone_name)) throw new Error('game-content: sentence syllable authority incomplete (' + s.th + ')');
          flatSyls.push(projectSentenceSyllable(sy));
        });
      });
      var readingParts = s.readingTH.split('-');
      if (s.words.map(function (w) { return w.th; }).join('') !== s.th || s.wc !== flatSyls.length ||
          readingParts.length !== flatSyls.length || readingParts.some(function (part) { return !isExactNonblank(part); })) throw new Error('game-content: sentence reading authority mismatch (' + s.th + ')');
      var en = flatSyls.map(function (sy) { return sy.en; }).join('-');
      var wordMeanings = s.words.map(function (w) { return { th: w.th, zh: w.zh }; });
      return { th: s.th, zh: s.zh, en: en, readingTH: s.readingTH, level: '高', syls: flatSyls, words: wordMeanings, politeF: s.politeF };
    });
  };

  // Tone consumes grouped words, but must use the same projected syllables as Reading
  // and Typing. Keep the server sentence and its word meanings untouched.
  global.buildSentenceWordsForToneFinder = function (sentence) {
    var flat = global.buildSentencesForPhonicsGames([sentence])[0];
    var readings = sentence.readingTH.split('-');
    var offset = 0;
    return sentence.words.map(function (word) {
      var end = offset + word.syls.length;
      var syls = flat.syls.slice(offset, end);
      var reading = readings.slice(offset, end).join('-');
      offset = end;
      return {
        word: word.th, readingTH: reading,
        readingEN: syls.map(function (sy) { return sy.en; }).join('-'),
        zh: word.zh, level: 3, category: '高級句子', syls: syls
      };
    });
  };

  function validateSentencePayload(sentences) {
    global.buildSentencesForPhonicsGames(sentences); // validation only; exact payload remains untouched
    return sentences;
  }

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

  var GAME_SURFACES = { tone: true, reading: true, typing: true, word_order: true, listening: true };
  var LOGIN_FREE_LEARNING_GAMES = { tone: true, reading: true, typing: true, word_order: true };
  function paidBetaRequested(game) {
    if (game !== 'tone' || !global.location) return false;
    return /(?:^|[?&])paid-beta=1(?:&|$)/.test(String(global.location.search || ''));
  }
  function contentAccessToken(cfg, game) {
    var minimumGuest = typeof global.isMinimumGuestOnly === 'function' && global.isMinimumGuestOnly();
    if (minimumGuest) return Promise.resolve(cfg.anonKey);
    var stored = readAccessTokenGuess(cfg.url);
    if (stored) return Promise.resolve(stored);

    // On an OAuth callback the shared Supabase client may still be importing the
    // session fragment when this loader starts. Wait for that initialization on
    // the four Login Free learning games so their first round receives the Login
    // tier and can register Retry/Review/SRS. Guest remains the anon fallback,
    // while Listening stays outside this learning-loop change.
    var loginFreeRuntime = global.SUPABASE_CONFIG && global.SUPABASE_CONFIG.runtimeMode === 'login-free';
    var client = loginFreeRuntime && LOGIN_FREE_LEARNING_GAMES[game] &&
      typeof global.getSupabaseClient === 'function' ? global.getSupabaseClient() : null;
    if (!client || !client.auth || typeof client.auth.getSession !== 'function') {
      return Promise.resolve(cfg.anonKey);
    }
    return Promise.resolve(client.auth.getSession()).then(function (result) {
      var session = result && result.data && result.data.session;
      var token = session && session.access_token;
      return typeof token === 'string' && token ? token : cfg.anonKey;
    }).catch(function () { return cfg.anonKey; });
  }

  function fetchGameContent(game) {
    var cfg = currentConfig();
    if (game != null && !GAME_SURFACES[game]) return Promise.reject(new Error('game-content: invalid game surface'));
    // Browser connectivity is only a hint; it can report offline while requests work.
    // Let the actual request decide, retaining the timeout and fail-closed validation.
    if (!global.NetworkGuard || typeof global.NetworkGuard.request !== 'function') {
      return Promise.reject(new Error('NETWORK_GUARD_UNAVAILABLE'));
    }
    var requestBody = game ? { game: game, contract: 'canonical-v1' } : { contract: 'canonical-v1' };
    if (paidBetaRequested(game)) requestBody.paid_beta = true;
    return contentAccessToken(cfg, game).then(function (token) {
      return global.NetworkGuard.request(fetch, cfg.url + '/functions/v1/game-content', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: cfg.anonKey, Authorization: 'Bearer ' + token },
        body: JSON.stringify(requestBody)
      }, 15000);
    }).then(function (res) {
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

  // A Login Free round may contain a server-bound Retry whose round_id lives in the
  // canonical account Resume snapshot. Do not execute any of the four learning games
  // until that snapshot has finished restoring; otherwise a fresh round can overwrite
  // the only client copy and strand the Retry. Guest, Paid and Listening stay outside.
  function whenLoginFreeCanonicalReady(data, game) {
    var loginFreeRuntime = global.SUPABASE_CONFIG && global.SUPABASE_CONFIG.runtimeMode === 'login-free';
    if (!loginFreeRuntime || !data || data.tier !== 'login' || !LOGIN_FREE_LEARNING_GAMES[game]) {
      return Promise.resolve(data);
    }
    if (!global.PHASE1_CANONICAL || typeof global.PHASE1_CANONICAL.whenReady !== 'function') {
      return Promise.reject(new Error('LOGIN_FREE_CANONICAL_UNAVAILABLE'));
    }
    return global.PHASE1_CANONICAL.whenReady(12000).then(function () { return data; });
  }

  // Direct Vault Reading must inherit the protected word's real level before the Reading
  // bundle evaluates remembered level / Auto Plan. The override exists only during bundle
  // boot, then both local preference and StudyPlan behavior are restored.
  var restoreDirectReadingWordLevel = null;
  function applyDirectReadingWordLevel(data) {
    try {
      if (!global.location || !/(?:^|\/)reading-game\.html$/.test(String(global.location.pathname || ''))) return null;
      var match = String(global.location.search || '').match(/[?&]word=([^&]+)/);
      if (!match) return null;
      var wanted = decodeURIComponent(match[1]);
      var rows = (data && Array.isArray(data.words) ? data.words : []).filter(function (row) {
        var record = row && row.catalog;
        return record && record.contentKey === wanted && (record.level === '初' || record.level === '中');
      });
      if (rows.length !== 1) return null;
      var level = rows[0].catalog.level;
      var hadStoredLevel = false;
      var storedLevel = null;
      if (typeof localStorage !== 'undefined') {
        storedLevel = localStorage.getItem('rg_reading_level');
        hadStoredLevel = storedLevel !== null;
        localStorage.setItem('rg_reading_level', level);
      }
      var studyPlan = global.StudyPlan;
      var originalPreferredLevel = studyPlan && typeof studyPlan.preferredLevel === 'function'
        ? studyPlan.preferredLevel
        : null;
      if (originalPreferredLevel) {
        studyPlan.preferredLevel = function (game) {
          if (game === 'reading') return level;
          return originalPreferredLevel.apply(this, arguments);
        };
      }
      restoreDirectReadingWordLevel = function () {
        try {
          if (typeof localStorage !== 'undefined') {
            if (hadStoredLevel) localStorage.setItem('rg_reading_level', storedLevel);
            else localStorage.removeItem('rg_reading_level');
          }
          if (studyPlan && originalPreferredLevel) studyPlan.preferredLevel = originalPreferredLevel;
        } catch (e) {}
        restoreDirectReadingWordLevel = null;
      };
      return level;
    } catch (e) {
      return null;
    }
  }
  function restoreDirectReadingWordLevelOverride() {
    if (!restoreDirectReadingWordLevel) return;
    restoreDirectReadingWordLevel();
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

  // Fetch public app bytes while the protected content request is pending.
  // Preload never executes code: injection below still waits for valid content.
  function preloadAppScripts(sources) {
    (sources || []).forEach(function (src) {
      try {
        var link = document.createElement('link');
        link.rel = 'preload';
        link.as = 'script';
        link.href = src;
        (document.head || document.body).appendChild(link);
      } catch (_) { /* Optional hint: normal script loading remains the fallback. */ }
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
    boot: function (appScriptSrcs, options) {
      preloadAppScripts(appScriptSrcs);
      if (document.body) showLoadingBanner();
      else document.addEventListener('DOMContentLoaded', showLoadingBanner);

      var game = options && options.game;
      return whenDeferredConfigReady().then(function () { return fetchGameContent(game); })
        .then(function (data) { return whenLoginFreeCanonicalReady(data, game); }).then(function (data) {
        global.GAME_CONTENT_TIER = data.tier || 'anon';
        global.PAID_SRS_PRIVATE_BETA = data.tier === 'paid';
        if (global.PAID_SRS_PRIVATE_BETA) {
          if (!Array.isArray(data.paidSrsState)) throw new Error('game-content: paid SRS state contract unavailable');
          var paidState = {};
          data.paidSrsState.forEach(function (row) {
            if (!row || row.game !== 'tone' || (row.level !== 1 && row.level !== 2) ||
                typeof row.content_key !== 'string' || !row.content_key) return;
            var stage = ({ '0': 0, '1': 1, '8': 2, '16': 3, '30': 4, '60': 5, '90': 6 })[String(row.next_checkpoint)];
            if (row.phase === 'complete') stage = 7;
            paidState[row.level + '|' + row.content_key] = {
              stage: stage == null ? 0 : stage,
              dueDate: row.due_on || '', dueAt: 0,
              everFailed: !!row.ever_failed,
              mastered: row.phase === 'complete' || !!row.reschedule_pending,
              phase: row.phase,
              activeChallenge: !!row.active_challenge,
              nextCheckpoint: row.next_checkpoint,
              reschedulePending: !!row.reschedule_pending
            };
          });
          try { global.localStorage.setItem('tf_paid_srs_v1', JSON.stringify(paidState)); } catch (_) {}
        }
        fireCapHitEvents(data);
        if (global.WordAudio && typeof global.WordAudio.setAvailability === 'function') {
          global.WordAudio.setAvailability(data.audioAvailable);
        }
        applyDirectReadingWordLevel(data);
        // Preserve the exact server payload. Individual game views may rename fields for
        // presentation, but they never change or recompute the reviewed catalog record.
        var exactWords = validateCatalogPayload(data.words);
        var exactSentences = validateSentencePayload(data.sentences);
        global.WORDS_MASTER = exactWords;
        global.ADV_SENTENCES = exactSentences;
        var chain = Promise.resolve();
        (appScriptSrcs || []).forEach(function (src) {
          chain = chain.then(function () { return injectScript(src); });
        });
        return chain;
      }).then(function () {
        restoreDirectReadingWordLevelOverride();
        hideLoadingBanner();
      }).catch(function (err) {
        restoreDirectReadingWordLevelOverride();
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
