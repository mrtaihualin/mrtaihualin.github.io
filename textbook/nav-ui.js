/* =====================================================================
   nav-ui.js — 浮動目錄 & 補充說明按鈕
   共用 JS 元件：修改這裡，全部頁面同步更新
   ===================================================================== */
(function () {
  'use strict';

  /* ── 頁面清單（拼音規則=1，句子結構=2，情態助詞=3；新增頁面在這裡加） ── */
  var PAGES = [
    { file: '拼音規則總整理.html', label: '拼音規則', num: '1' },
    { file: '句子結構五步驟.html', label: '句子結構', num: '2' },
    { file: '情態助詞.html', label: '情態助詞', num: '3' },
    { file: '否定表達.html', label: '否定表達', num: '4' },
    { file: '過去式.html',   label: '過去式',   num: '5' },
    { file: '是非問句.html', label: '是非問句', num: '6' },
    { file: '疑問詞.html',   label: '疑問詞',   num: '7' },
    { file: '過去式進階.html', label: '過去式進階', num: '8' },
    { file: '能力.html',     label: '能力表達', num: '9' },
    { file: '完成.html',     label: '完成表達', num: '10' },
  ];

  var currentFile = location.pathname.split('/').pop() || '';
  var NOTES_KEY   = 'student-notes-' + currentFile;

  /* ─────────────────────────────
     漢堡按鈕 & 目錄選單
  ───────────────────────────── */
  var navBtn = document.createElement('button');
  navBtn.className = 'fnav-btn';
  navBtn.setAttribute('aria-label', '目錄');
  navBtn.innerHTML =
    '<span class="bar"></span>' +
    '<span class="bar"></span>' +
    '<span class="bar"></span>';

  var menu = document.createElement('div');
  menu.className = 'fnav-menu';

  var menuTitle = document.createElement('div');
  menuTitle.className = 'fnav-menu-title';
  menuTitle.textContent = '目錄';
  menu.appendChild(menuTitle);

  PAGES.forEach(function (p) {
    var a = document.createElement('a');
    a.href = p.file;
    a.innerHTML = '<span class="pg-num">' + p.num + '</span>' + p.label;
    if (p.file === currentFile) a.classList.add('current');
    menu.appendChild(a);
  });

  navBtn.addEventListener('click', function (e) {
    e.stopPropagation();
    menu.classList.toggle('open');
  });
  document.addEventListener('click', function () { menu.classList.remove('open'); });
  menu.addEventListener('click', function (e) { e.stopPropagation(); });

  document.body.appendChild(navBtn);
  document.body.appendChild(menu);

  /* ─────────────────────────────
     下載整頁 PDF 按鈕（每頁都顯示）
     直接列印目前頁面 →（在列印視窗選「另存為 PDF」）。
     會完整保留目前的顯示狀態：關閉翻譯／關閉說明／放大字級／
     分音節／拼音／代詞…等都會原樣呈現在 PDF 裡。
  ───────────────────────────── */
  var pdfBtn = document.createElement('button');
  pdfBtn.className = 'fpdf-btn no-print';
  pdfBtn.setAttribute('aria-label', '下載整頁 PDF');
  pdfBtn.innerHTML =
    '<span class="btn-icon">⬇</span>' +
    '<span class="btn-label">PDF</span>';
  pdfBtn.addEventListener('click', function () {
    /* 收合可能開著的選單／彈窗，避免印進 PDF */
    menu.classList.remove('open');
    window.print();
  });
  document.body.appendChild(pdfBtn);

  /* 列印用文件抬頭（平時隱藏，只在 PDF/列印時顯示於首頁頂端） */
  var pdfPageLabel = document.title || '泰語教材';
  PAGES.forEach(function (p) { if (p.file === currentFile) pdfPageLabel = p.label; });
  var printHd = document.createElement('div');
  printHd.className = 'print-only print-doc-header';
  printHd.innerHTML =
    '<div class="pdh-brand">泰語教材 · 學習講義</div>' +
    '<div class="pdh-title"></div>';
  printHd.querySelector('.pdh-title').textContent = pdfPageLabel;
  document.body.insertBefore(printHd, document.body.firstChild);

  /* ─────────────────────────────
     補充說明按鈕（每頁都顯示）
     上半：window.PAGE_NOTES 預寫教師說明（有才顯示）
     下半：學生自己的筆記（localStorage，關閉瀏覽器自動下載）
  ───────────────────────────── */
  var notesBtn = document.createElement('button');
  notesBtn.className = 'fnotes-btn';
  notesBtn.setAttribute('aria-label', '補充說明');
  notesBtn.innerHTML =
    '<span class="btn-icon">📝</span>' +
    '<span class="btn-label">補充</span>';

  /* 教師說明區 */
  var notes = window.PAGE_NOTES;
  var teacherHtml = '';
  if (typeof notes === 'string' && notes.trim()) {
    teacherHtml =
      '<div class="fnotes-section-title">📖 教師說明</div>' +
      '<div class="fnotes-body">' + notes + '</div>' +
      '<hr class="fnotes-hr">';
  }

  var overlay = document.createElement('div');
  overlay.className = 'fnotes-overlay';
  overlay.innerHTML =
    '<div class="fnotes-modal">' +
      '<button class="fnotes-close" aria-label="關閉">✕</button>' +
      '<div class="fnotes-title">📝&ensp;補充說明</div>' +
      teacherHtml +
      '<textarea class="fnotes-textarea" placeholder="在這裡寫下你的筆記⋯"></textarea>' +
      '<div class="fnotes-actions">' +
        '<span class="fnotes-hint">筆記會自動儲存在這個瀏覽器</span>' +
        '<button class="fnotes-dl-btn">⬇ 下載 PDF</button>' +
      '</div>' +
    '</div>';

  var textarea = overlay.querySelector('.fnotes-textarea');

  /* 載入 localStorage 筆記 */
  var saved = localStorage.getItem(NOTES_KEY);
  if (saved) textarea.value = saved;

  /* 是否有「尚未存成 PDF」的變更（用來決定關閉頁面時要不要提醒） */
  var unsavedSincePDF = false;

  /* 即時存入 localStorage */
  textarea.addEventListener('input', function () {
    localStorage.setItem(NOTES_KEY, textarea.value);
    if (textarea.value.trim()) unsavedSincePDF = true;
  });

  /* 下載筆記為 PDF（用瀏覽器列印 → 另存為 PDF；版面與網頁同風格） */
  function escapeHtml(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  /* 下載筆記為 PDF（用瀏覽器列印 → 另存為 PDF；版面與網頁同風格） */
  function downloadPDF() {
    var content = textarea.value.trim();
    if (!content) return;

    /* 取得目前頁面標題（目錄裡的頁名） */
    var pageLabel = '泰語學習筆記';
    PAGES.forEach(function (p) { if (p.file === currentFile) pageLabel = p.label; });

    var now  = new Date();
    var pad  = function (n) { return String(n).padStart(2, '0'); };
    var dateStr = now.getFullYear() + '/' + pad(now.getMonth() + 1) + '/' + pad(now.getDate()) +
                  ' ' + pad(now.getHours()) + ':' + pad(now.getMinutes());
    /* 檔名（另存 PDF 時取自 title）＝ 日期_時間 */
    var fileTitle = now.getFullYear() + '-' + pad(now.getMonth() + 1) + '-' + pad(now.getDate()) +
                    '_' + pad(now.getHours()) + '-' + pad(now.getMinutes());

    /* 將純文字轉成段落（空行分段，單行換行保留） */
    var bodyHtml = escapeHtml(content)
      .split(/\n{2,}/)
      .map(function (para) { return '<p>' + para.replace(/\n/g, '<br>') + '</p>'; })
      .join('');

    var html =
      '<!DOCTYPE html><html lang="zh-Hant"><head><meta charset="utf-8">' +
      '<title>' + fileTitle + '</title>' +
      '<link rel="stylesheet" href="theme.css">' +
      '<style>' +
        '*{box-sizing:border-box;}' +
        'html,body{margin:0;padding:0;}' +
        'body{background:#e7e0d2;color:#2d2a22;' +
          "font-family:'Noto Sans TC','PingFang TC','Microsoft JhengHei',sans-serif;" +
          '-webkit-print-color-adjust:exact;print-color-adjust:exact;}' +
        /* A4 紙張 */
        '.page{width:210mm;min-height:297mm;margin:14px auto;background:#faf7f2;' +
          'padding:24mm 22mm 20mm;position:relative;display:flex;flex-direction:column;' +
          'box-shadow:0 6px 26px rgba(0,0,0,0.14);}' +
        /* 頁首 */
        '.hd{border-bottom:2.5px solid #4a6741;padding-bottom:14px;margin-bottom:26px;' +
          'display:flex;justify-content:space-between;align-items:flex-end;gap:16px;}' +
        '.hd-l{min-width:0;}' +
        '.brand{font-size:12px;font-weight:700;letter-spacing:0.16em;color:#4a6741;' +
          'text-transform:uppercase;margin-bottom:7px;}' +
        '.title{font-family:"Noto Serif TC",Georgia,serif;font-size:32px;font-weight:700;' +
          'color:#2d2a22;line-height:1.2;}' +
        '.meta{font-size:13px;color:#9a9080;white-space:nowrap;text-align:right;line-height:1.5;}' +
        /* 內文 */
        '.notes{flex:1;font-size:17px;line-height:2.0;color:#2d2a22;}' +
        '.notes p{margin:0 0 15px;}' +
        '.notes p:last-child{margin-bottom:0;}' +
        /* 頁尾 */
        '.ft{margin-top:26px;padding-top:12px;border-top:1px solid #d8d0c0;' +
          'display:flex;justify-content:space-between;font-size:11px;color:#9a9080;}' +
        '@page{size:A4;margin:0;}' +
        '@media print{body{background:#faf7f2;}' +
          '.page{width:auto;min-height:auto;margin:0;box-shadow:none;padding:18mm 17mm;}}' +
      '</style></head><body>' +
        '<div class="page">' +
          '<div class="hd">' +
            '<div class="hd-l">' +
              '<div class="brand">泰語學習 · 我的筆記</div>' +
              '<div class="title">' + escapeHtml(pageLabel) + '</div>' +
            '</div>' +
            '<div class="meta">' + dateStr + '</div>' +
          '</div>' +
          '<div class="notes">' + bodyHtml + '</div>' +
          '<div class="ft"><span>泰語教材 · 學習筆記</span><span>' + escapeHtml(pageLabel) + '</span></div>' +
        '</div>' +
      '</body></html>';

    var w = window.open('', '_blank');
    if (!w) { alert('請允許彈出視窗以下載 PDF'); return; }
    w.document.open();
    w.document.write(html);
    w.document.close();
    /* 等字體與樣式載入後再列印 */
    var go = function () { w.focus(); w.print(); };
    if (w.document.readyState === 'complete') { setTimeout(go, 400); }
    else { w.onload = function () { setTimeout(go, 400); }; }
    /* 已開啟列印／另存 PDF，視為已存檔 */
    unsavedSincePDF = false;
  }

  overlay.querySelector('.fnotes-dl-btn').addEventListener('click', downloadPDF);

  /* 關閉頁面時，若有尚未存成 PDF 的筆記，跳出瀏覽器確認視窗提醒先存檔
     （筆記本身已即時存在瀏覽器；這裡是提醒下載 PDF 備份） */
  window.addEventListener('beforeunload', function (e) {
    if (unsavedSincePDF && textarea.value.trim()) {
      e.preventDefault();
      e.returnValue = '';   /* 觸發瀏覽器原生「確定離開？」確認視窗 */
      return '';
    }
  });

  /* 開啟 / 關閉 */
  notesBtn.addEventListener('click', function () { overlay.classList.add('open'); });
  overlay.addEventListener('click', function (e) {
    if (e.target === overlay) overlay.classList.remove('open');
  });
  overlay.querySelector('.fnotes-close').addEventListener('click', function () {
    overlay.classList.remove('open');
  });

  document.body.appendChild(notesBtn);
  document.body.appendChild(overlay);

})();
