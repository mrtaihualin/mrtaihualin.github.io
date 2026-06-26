/* =====================================================================
   controls-ui.js — 控制列（字體 / 拼音 / 分音節 / 代詞）
   共用元件：從第三頁起每頁引入，修改這裡全部頁面同步更新

   使用方式：
     在 <head> 加 <link rel="stylesheet" href="controls-ui.css">
     在頁面適當位置放 <div id="ctrl-anchor"></div>（控制列插入點）
     在 </body> 前加 <script src="controls-ui.js"></script>
   ===================================================================== */
(function () {
  'use strict';

  /* ── 注入控制列 HTML ── */
  var bar = document.createElement('div');
  bar.className = 'controls-bar';
  bar.innerHTML =
    '<div class="ctrl-group">' +
      '<span class="ctrl-label">字體</span>' +
      '<button class="ctrl-btn active" id="cuiNormal">正常</button>' +
      '<button class="ctrl-btn" id="cuiModern">藝術（Kanit）</button>' +
    '</div>' +
    '<div class="ctrl-sep"></div>' +
    '<div class="ctrl-group">' +
      '<span class="ctrl-label">拼音</span>' +
      '<button class="ctrl-btn" id="cuiRoman">開啟拼音</button>' +
    '</div>' +
    '<div class="ctrl-sep"></div>' +
    '<div class="ctrl-group">' +
      '<span class="ctrl-label">分音節</span>' +
      '<button class="ctrl-btn" id="cuiSyl">分音節</button>' +
    '</div>' +
    '<div class="ctrl-sep"></div>' +
    '<div class="ctrl-group">' +
      '<span class="ctrl-label">顯示</span>' +
      '<button class="ctrl-btn" id="cuiTrans">關閉翻譯</button>' +
      '<button class="ctrl-btn" id="cuiExpl">關閉說明</button>' +
      '<button class="ctrl-btn" id="cuiBig">放大字級</button>' +
    '</div>' +
    '<div class="ctrl-sep"></div>' +
    '<div class="ctrl-group">' +
      '<span class="ctrl-label">代詞</span>' +
      '<button class="ctrl-btn active" id="cuiDefault">เรา（預設）</button>' +
      '<button class="ctrl-btn" id="cuiMale">男生 ผม ครับ</button>' +
      '<span class="ctrl-label" style="text-transform:none;letter-spacing:0">女生：</span>' +
      '<input class="cui-name-input" id="cuiFemaleInput" type="text" placeholder="輸入名字" maxlength="10">' +
      '<button class="ctrl-btn" id="cuiFemale">套用</button>' +
      '<button class="ctrl-btn" id="cuiPolite" style="display:none">禮貌 ค่ะ</button>' +
    '</div>';

  /* 插入到 #ctrl-anchor（頁面指定位置），否則插在 .hero / header 之後 */
  var anchor = document.getElementById('ctrl-anchor');
  if (anchor) {
    anchor.replaceWith(bar);
  } else {
    var hero = document.querySelector('.hero, header');
    if (hero) hero.insertAdjacentElement('afterend', bar);
    else document.body.insertBefore(bar, document.body.firstChild);
  }

  /* ── 狀態 ── */
  var sylMode     = false;
  var romanMode   = false;
  var pronounMode = 'default'; /* 'default' | 'male' | 'female' */
  var politeMode  = false;
  var femaleName  = '';

  /* ── 收集頁面元素並快取 data-roman ── */
  var allTsent = Array.from(document.querySelectorAll('.tsent'));
  var allRoman = Array.from(document.querySelectorAll('.roman-line'));

  allRoman.forEach(function (el) {
    if (!el.getAttribute('data-roman')) {
      el.setAttribute('data-roman', el.textContent.trim());
    }
  });

  /* ── 判斷句子是否為問句（女生選 ค่ะ / คะ 用） ── */
  var Q_END  = /(ไหม|มั้ย|เหรอ|หรอ|ป่ะ|ปะ|รึเปล่า|หรือเปล่า|รึยัง|หรือยัง|ใช่ไหม|ใช่มั้ย|รึ|หรือ)$/;
  var Q_WORD = /(อะไร|ที่ไหน|ไหน|ใคร|เมื่อไหร่|เมื่อไร|ทำไม|ยังไง|อย่างไร|เท่าไหร่|เท่าไร|กี่)/;
  function isQuestion(t) {
    if (!t) return false;
    t = t.replace(/<[^>]*>/g, '').replace(/[\s·]+/g, '');
    return Q_END.test(t) || Q_WORD.test(t);
  }

  /* ── 渲染拼音行 ──
     男生：每句結尾都加 khráp，rao → phǒm
     女生（已套用名字＋禮貌）：每句結尾加 khâ（問句 ká），rao → 名字 */
  function renderRoman() {
    allRoman.forEach(function (el) {
      var base = el.getAttribute('data-roman') || '';
      var text = base;
      var prev = el.previousElementSibling;
      var thai = (prev && prev.classList && prev.classList.contains('tsent'))
        ? (prev.getAttribute('data-base') || '') : '';
      if (pronounMode === 'male') {
        text = text.replace(/\brao\b/g, 'phǒm') + ' khráp';
      } else if (pronounMode === 'female') {
        text = text.replace(/\brao\b/g, femaleName || 'rao');
        if (politeMode) text += ' ' + (isQuestion(thai) ? 'ká' : 'khâ');
      }
      el.textContent = text;
    });
  }

  /* ── 渲染所有泰文例句 ──
     男生：每句都加 ครับ，เรา → ผม（其餘代詞不變）
     女生：เรา → 名字；按下禮貌後每句都加 ค่ะ（問句 คะ） */
  function renderAll() {
    allTsent.forEach(function (el) {
      var base = el.getAttribute('data-base') || '';
      var html = sylMode ? (el.getAttribute('data-syl') || base) : base;

      if (pronounMode === 'male') {
        html = html.split('เรา').join('ผม');
        html += (sylMode ? ' ' : '') + 'ครับ';
      } else if (pronounMode === 'female') {
        html = html.split('เรา').join(femaleName || 'เรา');
        if (politeMode) {
          html += (sylMode ? ' ' : '') + (isQuestion(base) ? 'คะ' : 'ค่ะ');
        }
      }
      el.innerHTML = html;
    });
    renderRoman();
  }

  /* ── 字體 ── */
  document.getElementById('cuiNormal').addEventListener('click', function () {
    document.body.classList.remove('modern-font');
    document.getElementById('cuiNormal').classList.add('active');
    document.getElementById('cuiModern').classList.remove('active');
  });
  document.getElementById('cuiModern').addEventListener('click', function () {
    document.body.classList.add('modern-font');
    document.getElementById('cuiModern').classList.add('active');
    document.getElementById('cuiNormal').classList.remove('active');
  });

  /* ── 拼音 ── */
  document.getElementById('cuiRoman').addEventListener('click', function () {
    romanMode = !romanMode;
    document.body.classList.toggle('show-roman', romanMode);
    this.classList.toggle('active', romanMode);
    this.textContent = romanMode ? '關閉拼音' : '開啟拼音';
  });

  /* ── 分音節 ── */
  document.getElementById('cuiSyl').addEventListener('click', function () {
    sylMode = !sylMode;
    this.classList.toggle('active', sylMode);
    this.textContent = sylMode ? '關閉分音節' : '分音節';
    renderAll();
  });

  /* ── 代詞 ── */
  var politeBtn = document.getElementById('cuiPolite');

  function setPronounActive(mode) {
    document.getElementById('cuiDefault').classList.remove('active', 'active-aux', 'active-ext');
    document.getElementById('cuiMale').classList.remove('active', 'active-aux', 'active-ext');
    document.getElementById('cuiFemale').classList.remove('active', 'active-aux', 'active-ext');
    if (mode === 'default') document.getElementById('cuiDefault').classList.add('active');
    if (mode === 'male')    document.getElementById('cuiMale').classList.add('active-aux');
    if (mode === 'female')  document.getElementById('cuiFemale').classList.add('active-ext');
  }

  document.getElementById('cuiDefault').addEventListener('click', function () {
    pronounMode = 'default'; politeMode = false;
    setPronounActive('default');
    politeBtn.style.display = 'none';
    politeBtn.classList.remove('active');
    renderAll();
  });

  document.getElementById('cuiMale').addEventListener('click', function () {
    pronounMode = 'male'; politeMode = false; femaleName = '';
    setPronounActive('male');
    politeBtn.style.display = 'none';
    renderAll();
  });

  document.getElementById('cuiFemale').addEventListener('click', function () {
    var n = document.getElementById('cuiFemaleInput').value.trim();
    if (!n) { document.getElementById('cuiFemaleInput').focus(); return; }
    femaleName  = n;
    pronounMode = 'female';
    setPronounActive('female');
    politeBtn.style.display = 'inline-block';
    renderAll();
  });

  document.getElementById('cuiFemaleInput').addEventListener('keydown', function (e) {
    if (e.key === 'Enter') document.getElementById('cuiFemale').click();
  });

  politeBtn.addEventListener('click', function () {
    politeMode = !politeMode;
    this.classList.toggle('active', politeMode);
    this.textContent = '禮貌 ค่ะ';
    renderAll();
  });

  /* ─────────────────────────────────────────────────────────────
     顯示控制：關閉翻譯 / 關閉說明 / 放大字級
     偏好以 localStorage 保存，換頁後仍維持一致（含版面重排）
     ───────────────────────────────────────────────────────────── */
  var LS = window.localStorage;
  function lsGet(k) { try { return LS.getItem(k); } catch (e) { return null; } }
  function lsSet(k, v) { try { LS.setItem(k, v); } catch (e) {} }

  var transBtn = document.getElementById('cuiTrans');
  var explBtn  = document.getElementById('cuiExpl');
  var bigBtn   = document.getElementById('cuiBig');

  /* 換字級／換頁後重排版面：觸發 reflow、重繪泰文、發出 resize 事件 */
  function relayout() {
    /* 強制瀏覽器重新計算版面（讀取 offsetHeight 觸發 reflow） */
    void document.body.offsetHeight;
    /* 重繪泰文例句（分音節寬度可能改變） */
    if (typeof window.CUIRender === 'function') {
      try { window.CUIRender(); } catch (e) {}
    }
    /* 通知頁面專屬腳本（例如以 JS 排版的區塊）重新計算 */
    window.dispatchEvent(new Event('resize'));
  }

  /* 套用一個顯示偏好的視覺狀態（class + 按鈕文字 + active） */
  function applyTrans(on) {
    document.body.classList.toggle('hide-tr', on);
    transBtn.classList.toggle('active', on);
    transBtn.textContent = on ? '顯示翻譯' : '關閉翻譯';
  }
  /* 隱藏／還原每個表格的「說明」整欄（含表頭，避免欄位錯位） */
  function setTableNotes(hide) {
    var tables = document.querySelectorAll('table');
    Array.prototype.forEach.call(tables, function (tb) {
      var heads = tb.querySelectorAll('thead th');
      var cols = [];
      Array.prototype.forEach.call(heads, function (th, i) {
        var t = (th.textContent || '').replace(/\s/g, '');
        if (/說明|補充/.test(t)) cols.push(i);   /* 標題含「說明／補充」的欄 */
      });
      if (!cols.length) return;
      var rows = tb.querySelectorAll('tr');       /* 含 thead 與 tbody，欄位索引一致 */
      Array.prototype.forEach.call(rows, function (tr) {
        cols.forEach(function (i) {
          var cell = tr.children[i];
          if (cell) cell.style.display = hide ? 'none' : '';
        });
      });
    });
  }

  function applyExpl(on) {
    document.body.classList.toggle('hide-ex', on);
    explBtn.classList.toggle('active', on);
    explBtn.textContent = on ? '顯示說明' : '關閉說明';
    setTableNotes(on);
  }
  function applyBig(on) {
    document.body.classList.toggle('big-font', on);
    bigBtn.classList.toggle('active', on);
    bigBtn.textContent = on ? '正常字級' : '放大字級';
  }

  /* 還原已保存的偏好（換頁一致 + 載入後重排一次） */
  applyTrans(lsGet('cui-hide-tr') === '1');
  applyExpl(lsGet('cui-hide-ex') === '1');
  applyBig(lsGet('cui-big-font') === '1');

  transBtn.addEventListener('click', function () {
    var on = !document.body.classList.contains('hide-tr');
    applyTrans(on);
    lsSet('cui-hide-tr', on ? '1' : '0');
    relayout();
  });

  explBtn.addEventListener('click', function () {
    var on = !document.body.classList.contains('hide-ex');
    applyExpl(on);
    lsSet('cui-hide-ex', on ? '1' : '0');
    relayout();
  });

  bigBtn.addEventListener('click', function () {
    var on = !document.body.classList.contains('big-font');
    applyBig(on);
    lsSet('cui-big-font', on ? '1' : '0');
    relayout();
  });

  /* ── 對外重繪掛鉤（供頁面專屬控制使用，例如第三頁 อยาก／กำลัง…อยู่ 切換） ── */
  window.CUIRender = renderAll;
  window.addEventListener('cui:rerender', renderAll);

  /* 載入完成後重排一次（確保還原大字級時版面正確） */
  if (document.readyState === 'complete') {
    relayout();
  } else {
    window.addEventListener('load', relayout);
  }

})();
