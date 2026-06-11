// ===================================================
// 🎵 泰語聲調搜尋 · Thai Tone Analyzer
// tone-finder.js — Self-contained module
// Injects its own modal, exposes window.TF
// ===================================================

(function () {
  'use strict';

  // ─────────────────────────────────────────────────
  // 1. DEFINITIONS  (for tooltip popups)
  // ─────────────────────────────────────────────────
  var DEFS = {
    toneMark: {
      zh: '聲調符號',
      desc: '標示在子音上方，決定音節聲調的符號。\n四種聲調符號：\n一聲符（ ่ ）  二聲符（ ้ ）  三聲符（ ๊ ）  四聲符（ ๋ ）'
    },
    low: {
      zh: '低子音',
      chars: 'ค คร คล คว ฅ ฆ ง ช ซ ซร ฌ ญ ฑ ฒ ณ ท ทร ธ น พ พร พล ฟ ภ ม ย ร ล ว ฬ ฮ'
    },
    high: {
      zh: '高子音',
      chars: 'ข ขร ขล ขว ฃ ฉ ฐ ถ ผ ฝ ศ ศร ษ ส สร ห'
    },
    mid: {
      zh: '中子音',
      chars: 'ก จ จร ด ต ตร บ ป ปร ปล อ ฎ ฏ กร กล กว'
    },
    lead: {
      zh: '前引字',
      chars: 'หน หม หล หว หย หร หญ หง อย',
      desc: '由 ห 或 อ 帶頭，與後方低子音結合使聲調改變的組合。'
    },
    other: {
      zh: '其他子音',
      desc: '指「中子音」「高子音」或「前引字」三類的統稱。'
    },
    live: {
      zh: '活音',
      desc: '① 有長尾音（น ณ ญ ร ล ฬ ม ย ว ง）收尾\n② 無尾音但使用長母音'
    },
    dead: {
      zh: '死音',
      desc: '① 有短尾音（ก ข ค ฆ บ ป พ ฟ ภ จ ช ซ ฎ ฏ ฐ ฑ ฒ ด ต ถ ท ธ ศ ษ ส）收尾\n② 無尾音但使用短母音'
    },
    longVowel: {
      zh: '長母音',
      chars: '-า  -ี  -ื  -ู  เ-  แ-  โ-  -อ  เ-อ  เ-ิ-  เ-ีย  -ัว  -ว-  ฤๅ  ฦๅ'
    },
    shortVowel: {
      zh: '短母音',
      chars: '-ะ  -ั-  -ิ  -ึ  -ุ  เ-ะ  เ-็-  แ-ะ  แ-็-  โ-ะ  -็  เ-าะ  -็อ-  เ-อะ  เ-ียะ  เ-ือะ  -ัวะ  -ว-ะ'
    },
    longEnd: {
      zh: '長尾音',
      chars: 'น  ณ  ญ  ร  ล  ฬ  ม  ย  ว  ง'
    },
    shortEnd: {
      zh: '短尾音',
      chars: 'ก  ข  ค  ฆ  บ  ป  พ  ฟ  ภ  จ  ช  ซ  ฎ  ฏ  ฐ  ฑ  ฒ  ด  ต  ถ  ท  ธ  ศ  ษ  ส'
    }
  };

  // ─────────────────────────────────────────────────
  // 2. TONE RESULT MAPPING
  // ─────────────────────────────────────────────────
  var TONES = {
    1: { name: '聲調一（平調）',   zh: '第一聲',       desc: '對應中文 第一聲（平聲）',         color: '#6cb8ff' },
    2: { name: '聲調二（低降調）', zh: '第三聲',       desc: '對應中文 第三聲（上聲）',         color: '#7ec87e' },
    3: { name: '聲調三（高降調）', zh: '第四聲',       desc: '對應中文 第四聲（去聲）',         color: '#ff7c7c' },
    4: { name: '聲調四（高平調）', zh: '第一聲高 tone', desc: '對應中文 第一聲拉高（高平聲）',  color: '#ffb347' },
    5: { name: '聲調五（升調）',  zh: '第二聲',       desc: '對應中文 第二聲（揚聲）',         color: '#c39bff' }
  };

  // ─────────────────────────────────────────────────
  // 3. STATE
  // ─────────────────────────────────────────────────
  var S = { word: '', step: 'input', path: [], tone: null };
  var _acts = {};
  var _actId = 0;

  function act(fn) {
    var id = 'tf' + (_actId++);
    _acts[id] = fn;
    return "TF._run('" + id + "')";
  }

  function go(nextStep, label) {
    _acts = {}; _actId = 0;
    S = { word: S.word, step: nextStep, path: label ? S.path.concat([label]) : S.path, tone: S.tone };
    render();
  }

  function setTone(num, label) {
    _acts = {}; _actId = 0;
    S = { word: S.word, step: 'result', path: label ? S.path.concat([label]) : S.path, tone: num };
    render();
  }

  // ─────────────────────────────────────────────────
  // 3b. THAI INPUT VALIDATION
  // ─────────────────────────────────────────────────
  // Thai Unicode block: U+0E00–U+0E7F
  // Valid leading characters: Thai consonants (U+0E01–U+0E2E) and
  //   leading vowels เ(0E40) แ(0E41) โ(0E42) ใ(0E43) ไ(0E44)
  // Invalid as first char: sara/diacritics, tone marks, short vowels

  var THAI_RE = /[฀-๿]/;
  var THAI_VALID_LEAD = /[ก-ฮะาเ-ไ]/;
  // ะ(30) า(32) ิ(34) ี(35) ึ(36) ื(37) ุ(38) ู(39) ็(47) ั(31) ่(48) ้(49) ๊(4A) ๋(4B) are bad leads
  var THAI_BAD_LEAD = /[ัำ-ู็-๎]/;

  window._tfFilterInput = function(inp) {
    var raw = inp.value;
    var pos = inp.selectionStart;

    // Keep only Thai characters
    var thai = '';
    for (var i = 0; i < raw.length; i++) {
      var c = raw[i];
      if (THAI_RE.test(c)) thai += c;
    }

    // If starts with an invalid-leading character (like ะ, ิ, ่, etc.), remove it
    while (thai.length > 0 && THAI_BAD_LEAD.test(thai[0])) {
      thai = thai.slice(1);
    }

    if (thai !== raw) {
      inp.value = thai;
      // Try to restore caret position
      try { inp.setSelectionRange(Math.min(pos, thai.length), Math.min(pos, thai.length)); } catch(e) {}
    }

    // Visual feedback: red border if empty after filter, gold if valid
    if (thai.length === 0 && raw.length > 0) {
      inp.style.borderColor = '#ff6b6b';
    } else if (thai.length > 0) {
      inp.style.borderColor = 'rgba(212,160,23,0.7)';
    }
  };

  // ─────────────────────────────────────────────────
  // 4. STYLES
  // ─────────────────────────────────────────────────
  var C = {
    hint:    "font-family:'Noto Sans TC',sans-serif;font-size:13px;color:rgba(255,255,255,0.45);line-height:2;margin-bottom:22px;text-align:center;",
    input:   "width:100%;max-width:300px;padding:14px 18px;background:rgba(255,255,255,0.07);border:1.5px solid rgba(212,160,23,0.3);border-radius:8px;color:#fff;font-family:'Sarabun',sans-serif;font-size:22px;text-align:center;outline:none;box-sizing:border-box;transition:border-color 0.2s;",
    btnGold: "padding:13px 32px;background:#D4A017;color:#111;border:none;border-radius:7px;font-family:'Noto Sans TC',sans-serif;font-size:14px;font-weight:700;cursor:pointer;letter-spacing:1px;",
    btnSec:  "padding:11px 22px;background:rgba(255,255,255,0.07);color:rgba(255,255,255,0.65);border:1px solid rgba(255,255,255,0.15);border-radius:7px;font-family:'Noto Sans TC',sans-serif;font-size:13px;cursor:pointer;",
    btnHlp:  "padding:8px 18px;background:rgba(212,160,23,0.08);color:#D4A017;border:1px solid rgba(212,160,23,0.28);border-radius:20px;font-family:'Noto Sans TC',sans-serif;font-size:12px;font-weight:700;cursor:pointer;letter-spacing:0.5px;",
    btnBack: "font-family:'Noto Sans TC',sans-serif;font-size:12px;color:rgba(255,255,255,0.35);background:none;border:none;cursor:pointer;",
    btnRst:  "font-family:'Noto Sans TC',sans-serif;font-size:12px;color:rgba(255,255,255,0.25);background:none;border:none;cursor:pointer;",
    opt:     "flex:1;padding:14px 18px;background:rgba(255,255,255,0.05);border:1.5px solid rgba(255,255,255,0.12);border-radius:8px;text-align:left;cursor:pointer;transition:border-color 0.18s,background 0.18s;",
    mark:    "flex:1;padding:14px 18px;background:rgba(255,255,255,0.05);border:1.5px solid rgba(255,255,255,0.12);border-radius:8px;cursor:pointer;transition:border-color 0.18s,background 0.18s;display:flex;align-items:center;gap:16px;",
    tip:     "width:26px;height:26px;flex-shrink:0;align-self:center;background:rgba(212,160,23,0.1);border:1px solid rgba(212,160,23,0.28);border-radius:50%;color:#D4A017;font-size:12px;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;",
    qbox:    "padding:16px 18px;background:rgba(255,255,255,0.04);border-left:3px solid #D4A017;margin-bottom:18px;",
    hlpBox:  "background:rgba(212,160,23,0.07);border:1px solid rgba(212,160,23,0.2);border-radius:8px;padding:11px 16px;margin-bottom:18px;"
  };

  var HO     = " onmouseover=\"this.style.borderColor='rgba(212,160,23,0.55)';this.style.background='rgba(212,160,23,0.08)'\"";
  var HO_OUT = " onmouseout=\"this.style.borderColor='rgba(255,255,255,0.12)';this.style.background='rgba(255,255,255,0.05)'\"";

  // ─────────────────────────────────────────────────
  // 5. UI COMPONENT BUILDERS
  // ─────────────────────────────────────────────────

  function question(stepNum, qHtml, btnsHtml, extraTop) {
    var badge = stepNum
      ? '<div style="font-family:\'Noto Sans TC\',sans-serif;font-size:11px;color:#D4A017;letter-spacing:3px;margin-bottom:7px;text-transform:uppercase;">步驟 ' + stepNum + '</div>'
      : '';
    return (
      '<div style="' + C.qbox + '">' + badge +
        '<div style="font-family:\'Noto Sans TC\',sans-serif;font-size:15px;line-height:1.85;color:rgba(255,255,255,0.9);">' + qHtml + '</div>' +
      '</div>' +
      (extraTop || '') +
      '<div style="display:flex;flex-direction:column;gap:10px;margin-bottom:18px;">' + btnsHtml + '</div>' +
      '<div style="text-align:center;">' +
        '<button onclick="TF.reset()" style="' + C.btnRst + '">↺ 重新開始</button>' +
      '</div>'
    );
  }

  function optBtn(label, onclickStr, defKeys) {
    var tipBtn = defKeys && defKeys.length
      ? '<button onclick="event.stopPropagation();TF.tip(' + JSON.stringify(defKeys) + ')" style="' + C.tip + '">?</button>'
      : '';
    return (
      '<div style="display:flex;align-items:stretch;gap:7px;">' +
        '<button onclick="' + onclickStr + '" style="' + C.opt + '"' + HO + HO_OUT + '>' +
          '<div style="font-family:\'Noto Sans TC\',sans-serif;font-size:15px;font-weight:700;color:#fff;">' + label + '</div>' +
        '</button>' +
        tipBtn +
      '</div>'
    );
  }

  function markBtn(name, displayMark, onclickStr) {
    return (
      '<button onclick="' + onclickStr + '" style="' + C.mark + '"' + HO + HO_OUT + '>' +
        '<span style="font-family:\'Sarabun\',sans-serif;font-size:36px;font-weight:700;color:#D4A017;min-width:52px;text-align:center;">ก' + displayMark + '</span>' +
        '<div>' +
          '<div style="font-family:\'Noto Sans TC\',sans-serif;font-size:15px;color:#fff;">' + name + '</div>' +
          '<div style="font-family:\'Noto Sans TC\',sans-serif;font-size:11px;color:rgba(255,255,255,0.4);margin-top:2px;">（' + displayMark + '）</div>' +
        '</div>' +
      '</button>'
    );
  }

  function helperBanner() {
    return '<div style="' + C.hlpBox + '"><span style="font-family:\'Noto Sans TC\',sans-serif;font-size:12px;color:#D4A017;font-weight:700;letter-spacing:2px;">🔎 活音／死音 判斷工具</span></div>';
  }

  // ─────────────────────────────────────────────────
  // 6. STEP RENDERERS
  // ─────────────────────────────────────────────────

  function stepInput() {
    return (
      '<div style="text-align:center;padding:8px 0 12px;">' +
        '<p style="' + C.hint + '">輸入泰文單字，逐步分析聲調</p>' +
        '<input id="tf-inp" type="text" autocomplete="off" spellcheck="false" inputmode="text" ' +
          'placeholder="例：กา, ข้าว, ไทย…" style="' + C.input + '" ' +
          'oninput="window._tfFilterInput(this)" ' +
          'onkeydown="if(event.key===\'Enter\')TF.search()" ' +
          'onfocus="this.style.borderColor=\'rgba(212,160,23,0.7)\'" ' +
          'onblur="if(!this.value)this.style.borderColor=\'rgba(212,160,23,0.3)\'"' +
        '>' +
        '<div style="margin-top:20px;">' +
          '<button onclick="TF.search()" style="' + C.btnGold + '">🔍 開始分析</button>' +
        '</div>' +
      '</div>'
    );
  }

  function step1() {
    return question('1',
      '這個字有<strong style="color:#D4A017;">聲調符號</strong>嗎？',
      optBtn('有聲調符號', act(function(){ go('s2a','有聲調符號'); }), ['toneMark']) +
      optBtn('無聲調符號', act(function(){ go('s2b','無聲調符號'); }), ['toneMark'])
    );
  }

  // --- HAS TONE MARK branch ---

  function step2a() {
    return question('2',
      '起首子音屬於哪一組？',
      optBtn('低子音', act(function(){ go('s2a_low','低子音'); }), ['low']) +
      optBtn('其他子音（中子音 ／ 高子音 ／ 前引字）', act(function(){ go('s2a_other','其他子音'); }), ['other'])
    );
  }

  function step2aLow() {
    return question('3',
      '聲調符號是哪一個？',
      markBtn('一聲符', '่', act(function(){ setTone(3,'一聲符 ่'); })) +
      markBtn('二聲符', '้', act(function(){ setTone(4,'二聲符 ้'); }))
    );
  }

  function step2aOther() {
    return question('3',
      '請選擇確切的子音種類',
      optBtn('中子音', act(function(){ go('s2a_mid','中子音'); }), ['mid']) +
      optBtn('高子音', act(function(){ go('s2a_hi', '高子音'); }), ['high']) +
      optBtn('前引字', act(function(){ go('s2a_hi', '前引字'); }), ['lead'])
    );
  }

  function step2aMid() {
    return question('4',
      '聲調符號是哪一個？',
      markBtn('一聲符', '่', act(function(){ setTone(2,'一聲符 ่'); })) +
      markBtn('二聲符', '้', act(function(){ setTone(3,'二聲符 ้'); })) +
      markBtn('三聲符', '๊', act(function(){ setTone(4,'三聲符 ๊'); })) +
      markBtn('四聲符', '๋', act(function(){ setTone(5,'四聲符 ๋'); }))
    );
  }

  function step2aHi() {
    return question('4',
      '聲調符號是哪一個？',
      markBtn('一聲符', '่', act(function(){ setTone(2,'一聲符 ่'); })) +
      markBtn('二聲符', '้', act(function(){ setTone(3,'二聲符 ้'); }))
    );
  }

  // --- NO TONE MARK branch ---

  function step2b() {
    return question('2',
      '這個字是<strong style="color:#7ec87e;">活音</strong>還是<strong style="color:#ff7c7c;">死音</strong>？',
      optBtn('活音', act(function(){ go('s2b_live','活音'); }), ['live']) +
      optBtn('死音', act(function(){ go('s2b_dead','死音'); }), ['dead']),
      '<div style="text-align:center;margin:-2px 0 18px;">' +
        '<button onclick="TF.openHelper()" style="' + C.btnHlp + '">🔎 還不確定？ 檢查活音／死音</button>' +
      '</div>'
    );
  }

  // --- Helper sub-flow ---

  function helperStep1() {
    return (
      helperBanner() +
      question('',
        '這個字有「尾音」嗎？',
        optBtn('有尾音', act(function(){ go('h_with','有尾音'); }), ['longEnd','shortEnd']) +
        optBtn('無尾音', act(function(){ go('h_no',  '無尾音'); }), ['longVowel','shortVowel'])
      ) +
      '<div style="text-align:center;margin-top:6px;">' +
        '<button onclick="TF.back(\'s2b\')" style="' + C.btnBack + '">← 返回</button>' +
      '</div>'
    );
  }

  function helperWith() {
    return (
      helperBanner() +
      question('',
        '尾音是哪種類型？',
        optBtn('短尾音 → 死音', act(function(){ go('h_done','短尾音'); }), ['shortEnd']) +
        optBtn('長尾音 → 活音', act(function(){ go('h_done','長尾音'); }), ['longEnd'])
      ) +
      '<div style="text-align:center;margin-top:6px;">' +
        '<button onclick="TF.back(\'helper\')" style="' + C.btnBack + '">← 返回</button>' +
      '</div>'
    );
  }

  function helperNo() {
    return (
      helperBanner() +
      question('',
        '使用的母音是哪種類型？',
        optBtn('短母音 → 死音', act(function(){ go('h_done','短母音'); }), ['shortVowel']) +
        optBtn('長母音 → 活音', act(function(){ go('h_done','長母音'); }), ['longVowel'])
      ) +
      '<div style="text-align:center;margin-top:6px;">' +
        '<button onclick="TF.back(\'helper\')" style="' + C.btnBack + '">← 返回</button>' +
      '</div>'
    );
  }

  function helperDone() {
    var last = S.path[S.path.length - 1];
    var isDead = (last === '短尾音' || last === '短母音');
    var col      = isDead ? '#ff7c7c' : '#7ec87e';
    var label    = isDead ? '死音' : '活音';
    var desc     = isDead ? '這個字是「死音」' : '這個字是「活音」';
    var nextStep = isDead ? 's2b_dead' : 's2b_live';
    var continueAct = act(function(){ go(nextStep, label); });
    return (
      helperBanner() +
      '<div style="background:rgba(255,255,255,0.04);border:2px solid ' + col + ';border-radius:10px;padding:22px;text-align:center;margin-bottom:22px;">' +
        '<div style="font-family:\'Noto Sans TC\',sans-serif;font-size:12px;color:rgba(255,255,255,0.4);letter-spacing:3px;margin-bottom:10px;">判斷結果</div>' +
        '<div style="font-family:\'Noto Serif TC\',serif;font-size:26px;font-weight:900;color:' + col + ';margin-bottom:6px;">' + label + '</div>' +
        '<div style="font-family:\'Noto Sans TC\',sans-serif;font-size:14px;color:rgba(255,255,255,0.65);">' + desc + '</div>' +
      '</div>' +
      '<div style="text-align:center;">' +
        '<button onclick="' + continueAct + '" style="' + C.btnGold + '">繼續分析 →</button>' +
      '</div>'
    );
  }

  // --- 活音 / 死音 consonant branches ---

  function s2bLive() {
    return question('3',
      '起首子音屬於哪一組？',
      optBtn('中子音 ／ 低子音', act(function(){ setTone(1,'中子音/低子音'); }), ['mid','low']) +
      optBtn('高子音 ／ 前引字', act(function(){ setTone(5,'高子音/前引字'); }), ['high','lead'])
    );
  }

  function s2bDead() {
    return question('3',
      '起首子音屬於哪一組？',
      optBtn('高子音 ／ 前引字 ／ 中子音', act(function(){ setTone(2,'高子音/前引字/中子音'); }), ['high','lead','mid']) +
      optBtn('低子音', act(function(){ go('s2b_dl','低子音'); }), ['low'])
    );
  }

  function s2bDeadLow() {
    return question('4',
      '母音是哪種類型？',
      optBtn('長母音', act(function(){ setTone(3,'長母音'); }), ['longVowel']) +
      optBtn('短母音', act(function(){ setTone(4,'短母音'); }), ['shortVowel'])
    );
  }

  // --- Result ---

  function stepResult() {
    var t = TONES[S.tone];
    if (!t) return '';
    var pathHtml = S.path.map(function(p, i) {
      return (i > 0 ? '<span style="color:rgba(212,160,23,0.35);margin:0 2px;">›</span>' : '') +
        '<span style="font-family:\'Noto Sans TC\',sans-serif;font-size:11px;background:rgba(212,160,23,0.1);color:rgba(212,160,23,0.7);padding:2px 9px;border-radius:3px;">' + p + '</span>';
    }).join('');
    var againAct = act(function(){
      var w = S.word; _acts = {}; _actId = 0;
      S = { word: w, step: 's1', path: [w], tone: null };
      render();
    });
    return (
      '<div style="text-align:center;">' +
        '<div style="font-family:\'Sarabun\',sans-serif;font-size:54px;font-weight:700;color:#fff;margin-bottom:22px;letter-spacing:2px;">' + S.word + '</div>' +

        '<div style="background:rgba(255,255,255,0.04);border:2.5px solid ' + t.color + ';border-radius:14px;padding:28px 20px;margin-bottom:22px;">' +
          '<div style="font-family:\'Noto Sans TC\',sans-serif;font-size:11px;color:rgba(255,255,255,0.35);letter-spacing:3px;margin-bottom:14px;text-transform:uppercase;">聲調分析結果</div>' +
          '<div style="font-family:\'Noto Sans TC\',sans-serif;font-size:15px;color:' + t.color + ';margin-bottom:10px;">' + t.name + '</div>' +
          '<div style="font-family:\'Noto Serif TC\',serif;font-size:32px;font-weight:900;color:#fff;margin-bottom:10px;">' + t.zh + '</div>' +
          '<div style="font-family:\'Noto Sans TC\',sans-serif;font-size:14px;color:rgba(255,255,255,0.65);">' + t.desc + '</div>' +
        '</div>' +

        '<div style="background:rgba(255,255,255,0.03);border-radius:8px;padding:14px 18px;margin-bottom:24px;text-align:left;">' +
          '<div style="font-family:\'Noto Sans TC\',sans-serif;font-size:10px;color:rgba(255,255,255,0.25);letter-spacing:3px;margin-bottom:9px;text-transform:uppercase;">分析路徑</div>' +
          '<div style="display:flex;flex-wrap:wrap;gap:5px;align-items:center;">' + pathHtml + '</div>' +
        '</div>' +

        '<div style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap;">' +
          '<button onclick="TF.reset()" style="' + C.btnGold + '">🔍 分析新單字</button>' +
          '<button onclick="' + againAct + '" style="' + C.btnSec + '">↺ 重新分析「' + S.word + '」</button>' +
        '</div>' +
      '</div>'
    );
  }

  // ─────────────────────────────────────────────────
  // 7. MAIN RENDER
  // ─────────────────────────────────────────────────
  function buildStep() {
    switch (S.step) {
      case 'input':     return stepInput();
      case 's1':        return step1();
      case 's2a':       return step2a();
      case 's2a_low':   return step2aLow();
      case 's2a_other': return step2aOther();
      case 's2a_mid':   return step2aMid();
      case 's2a_hi':    return step2aHi();
      case 's2b':       return step2b();
      case 'helper':    return helperStep1();
      case 'h_with':    return helperWith();
      case 'h_no':      return helperNo();
      case 'h_done':    return helperDone();
      case 's2b_live':  return s2bLive();
      case 's2b_dead':  return s2bDead();
      case 's2b_dl':    return s2bDeadLow();
      case 'result':    return stepResult();
      default: return '';
    }
  }

  function render() {
    var body = document.getElementById('tf-body');
    if (!body) return;
    body.innerHTML = buildStep();

    var banner = document.getElementById('tf-banner');
    if (banner) {
      if (S.word && S.step !== 'input') {
        banner.style.display = 'block';
        banner.textContent = S.word;
      } else {
        banner.style.display = 'none';
      }
    }

    var bc = document.getElementById('tf-bc');
    if (bc) {
      if (S.path.length > 1 && S.step !== 'input' && S.step !== 'result') {
        bc.style.display = 'flex';
        bc.innerHTML = S.path.map(function(p, i) {
          return (i > 0 ? '<span style="color:rgba(212,160,23,0.35);font-size:11px;">›</span>' : '') +
            '<span style="font-family:\'Noto Sans TC\',sans-serif;font-size:11px;background:rgba(212,160,23,0.1);color:rgba(212,160,23,0.7);padding:2px 8px;border-radius:3px;">' + p + '</span>';
        }).join('');
      } else {
        bc.style.display = 'none';
      }
    }
  }

  // ─────────────────────────────────────────────────
  // 8. TOOLTIP POPUP
  // ─────────────────────────────────────────────────
  function showTip(keys) {
    var old = document.getElementById('tf-tip');
    if (old) old.remove();
    var rows = keys.map(function(k) {
      var d = DEFS[k];
      if (!d) return '';
      return (
        '<div style="margin-bottom:16px;padding-bottom:14px;border-bottom:1px solid rgba(255,255,255,0.07);">' +
          '<div style="font-family:\'Noto Sans TC\',sans-serif;font-size:14px;font-weight:700;color:#D4A017;margin-bottom:8px;">' + d.zh + '</div>' +
          (d.chars
            ? '<div style="font-family:\'Sarabun\',sans-serif;font-size:13px;color:rgba(255,255,255,0.85);background:rgba(255,255,255,0.04);padding:10px 14px;border-radius:6px;line-height:2.1;">' + d.chars + '</div>'
            : '') +
          (d.desc
            ? '<div style="font-family:\'Noto Sans TC\',sans-serif;font-size:13px;color:rgba(255,255,255,0.65);line-height:1.8;white-space:pre-line;margin-top:8px;">' + d.desc + '</div>'
            : '') +
        '</div>'
      );
    }).join('');
    document.body.insertAdjacentHTML('beforeend',
      '<div id="tf-tip" style="position:fixed;inset:0;background:rgba(0,0,0,0.68);z-index:5000;display:flex;align-items:center;justify-content:center;padding:20px;" ' +
           'onclick="document.getElementById(\'tf-tip\').remove()">' +
        '<div style="background:#1c1a16;border:1.5px solid rgba(212,160,23,0.3);border-radius:12px;padding:24px;max-width:400px;width:100%;max-height:66vh;overflow-y:auto;" ' +
             'onclick="event.stopPropagation()">' +
          '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">' +
            '<span style="font-family:\'Noto Sans TC\',sans-serif;font-size:11px;color:#D4A017;letter-spacing:3px;font-weight:700;">說明</span>' +
            '<button onclick="document.getElementById(\'tf-tip\').remove()" style="background:none;border:none;color:rgba(255,255,255,0.4);font-size:20px;cursor:pointer;line-height:1;">✕</button>' +
          '</div>' +
          rows +
        '</div>' +
      '</div>'
    );
  }

  // ─────────────────────────────────────────────────
  // 9. MODAL INJECTION
  // ─────────────────────────────────────────────────
  function inject() {
    if (document.getElementById('modal-tonefinder')) return;
    document.body.insertAdjacentHTML('afterbegin',
      '<div class="modal-overlay" id="modal-tonefinder" onclick="if(event.target===this)TF.close()">' +
        '<div class="modal-box dark" style="max-width:620px;width:96vw;padding:0;overflow:hidden;max-height:92vh;display:flex;flex-direction:column;">' +

          '<div class="modal-header" style="flex-shrink:0;padding:16px 24px;border-bottom:1px solid rgba(212,160,23,0.18);">' +
            '<div>' +
              '<div class="modal-title" style="color:#D4A017;font-size:18px;">🎵 泰語聲調搜尋</div>' +
              '<div style="font-family:\'Noto Sans TC\',sans-serif;font-size:12px;color:rgba(255,255,255,0.38);margin-top:2px;letter-spacing:1px;">泰語聲調分析工具</div>' +
            '</div>' +
            '<button class="modal-close" onclick="TF.close()">✕</button>' +
          '</div>' +

          '<div id="tf-banner" style="display:none;padding:9px 24px;background:rgba(212,160,23,0.07);border-bottom:1px solid rgba(212,160,23,0.1);font-family:\'Sarabun\',sans-serif;font-size:22px;font-weight:700;color:#D4A017;letter-spacing:2px;"></div>' +

          '<div id="tf-bc" style="display:none;padding:7px 24px;background:rgba(0,0,0,0.25);border-bottom:1px solid rgba(255,255,255,0.05);flex-wrap:wrap;gap:5px;align-items:center;"></div>' +

          '<div id="tf-body" style="overflow-y:auto;flex:1;padding:24px 26px 28px;"></div>' +

        '</div>' +
      '</div>'
    );
    render();
  }

  // ─────────────────────────────────────────────────
  // 10. PUBLIC API
  // ─────────────────────────────────────────────────
  window.TF = {
    open: function() {
      inject();
      var m = document.getElementById('modal-tonefinder');
      if (m) { m.classList.add('open'); document.body.style.overflow = 'hidden'; }
    },
    close: function() {
      var m = document.getElementById('modal-tonefinder');
      if (m) { m.classList.remove('open'); document.body.style.overflow = ''; }
    },
    search: function() {
      var inp = document.getElementById('tf-inp');
      if (inp) window._tfFilterInput(inp);
      var w = inp ? inp.value.trim() : '';
      if (!w) { if (inp) inp.style.borderColor = '#ff6b6b'; return; }
      _acts = {}; _actId = 0;
      S = { word: w, step: 's1', path: [w], tone: null };
      render();
    },
    openHelper: function() { go('helper', '開啟判斷工具'); },
    back: function(step) {
      _acts = {}; _actId = 0;
      S = Object.assign({}, S, { step: step });
      render();
    },
    reset: function() {
      _acts = {}; _actId = 0;
      S = { word: '', step: 'input', path: [], tone: null };
      render();
    },
    tip: function(keys) { showTip(keys); },
    _run: function(id) { if (_acts[id]) _acts[id](); }
  };

  // ─────────────────────────────────────────────────
  // 11. INIT
  // ─────────────────────────────────────────────────
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', inject);
  } else {
    inject();
  }

})();
