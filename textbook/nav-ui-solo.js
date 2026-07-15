/* =====================================================================
   nav-ui-solo.js — 「上課專用」單頁版：只留 補充說明 + PDF 按鈕
   ⚠️ 這是 nav-ui.js 的精簡版，故意拿掉「☰ 目錄」漢堡選單
   （目錄選單會連去其他章節／回到教材目錄，上課專用頁不放）
   只給特定學生的單一頁面用，不影響 nav-ui.js／其他教材頁面
   ===================================================================== */
(function () {
  'use strict';

  var currentFile = location.pathname.split('/').pop() || '';
  var NOTES_KEY   = 'student-notes-' + currentFile;
  var pageLabel   = document.title || '泰語學習講義';

  /* ─────────────────────────────
     個人化連結參數（?s=token&n=base64姓名&tp=1）
     由老師在「課堂教室」按「🔗 開啟預覽」時自動加上（含 tp=1）
     存給學生看的連結（儲存連結／課堂資料下載）只有 s 和 n，沒有 tp
     → 只有老師自己按「開啟預覽」那個連結才會顯示「存入 Google Drive」按鈕，
       學生從自己的連結打開不會看到這顆按鈕
  ───────────────────────────── */
  var qp = new URLSearchParams(location.search);
  var studentToken = qp.get('s') || '';
  var studentName  = '';
  try { if (qp.get('n')) studentName = decodeURIComponent(atob(qp.get('n'))); } catch (e) {}
  var isTeacherPreview = qp.get('tp') === '1';
  var canSaveToDrive = !!(studentToken && studentName && isTeacherPreview);

  /* ─────────────────────────────
     下載整頁 PDF 按鈕
  ───────────────────────────── */
  var pdfBtn = document.createElement('button');
  pdfBtn.className = 'fpdf-btn no-print';
  pdfBtn.setAttribute('aria-label', '下載整頁 PDF');
  pdfBtn.innerHTML =
    '<span class="btn-icon">⬇</span>' +
    '<span class="btn-label">PDF</span>';
  pdfBtn.addEventListener('click', function () {
    window.print();
  });
  document.body.appendChild(pdfBtn);

  var printHd = document.createElement('div');
  printHd.className = 'print-only print-doc-header';
  printHd.innerHTML =
    '<div class="pdh-brand">泰語教材 · 學習講義</div>' +
    '<div class="pdh-title"></div>';
  printHd.querySelector('.pdh-title').textContent = pageLabel;
  document.body.insertBefore(printHd, document.body.firstChild);

  /* ─────────────────────────────
     補充說明按鈕
     上半：window.PAGE_NOTES 預寫教師說明（有才顯示）
     下半：學生自己的筆記（localStorage，關閉瀏覽器自動下載提醒）
  ───────────────────────────── */
  var notesBtn = document.createElement('button');
  notesBtn.className = 'fnotes-btn';
  notesBtn.setAttribute('aria-label', '補充說明');
  notesBtn.innerHTML =
    '<span class="btn-icon">📝</span>' +
    '<span class="btn-label">補充</span>';

  var notes = window.PAGE_NOTES;
  var teacherHtml = '';
  if (typeof notes === 'string' && notes.trim()) {
    teacherHtml =
      '<div class="fnotes-section-title">📖 教師說明</div>' +
      '<div class="fnotes-body">' + notes + '</div>' +
      '<hr class="fnotes-hr">';
  }

  var driveRow = canSaveToDrive
    ? ('<div class="fnotes-actions" style="margin-top:6px;justify-content:flex-end;">' +
        '<button class="fnotes-dl-btn fnotes-drive-btn">☁️ 存入 Google Drive</button>' +
      '</div>' +
      '<div class="fnotes-drive-status" style="font-size:0.8rem;color:var(--ink-mid,#8a8370);margin-top:4px;"></div>')
    : '';

  function escapeHtml(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  var overlay = document.createElement('div');
  overlay.className = 'fnotes-overlay';
  overlay.innerHTML =
    '<div class="fnotes-modal">' +
      '<button class="fnotes-close" aria-label="關閉">✕</button>' +
      '<div class="fnotes-title">📝&ensp;補充說明</div>' +
      teacherHtml +
      '<div class="fnotes-tools"></div>' +
      '<div class="fnotes-editor" contenteditable="true" data-ph="在這裡寫下你的筆記⋯"></div>' +
      '<div class="fnotes-actions">' +
        '<span class="fnotes-hint">筆記會自動儲存在這個瀏覽器</span>' +
        '<button class="fnotes-dl-btn">⬇ 下載 PDF</button>' +
      '</div>' +
      driveRow +
    '</div>';

  var editor   = overlay.querySelector('.fnotes-editor');
  var toolsBar = overlay.querySelector('.fnotes-tools');

  /* ── 工具列：粗斜底線／文字顏色／螢光筆／字級加減
     （跟浮動的「我的學習筆記」用同一套設計，統一操作方式） ── */
  var fnSaveTimer = null;
  function fnSaveNow() {
    if (fnSaveTimer) { clearTimeout(fnSaveTimer); fnSaveTimer = null; }
    localStorage.setItem(NOTES_KEY, editor.innerHTML);
    if (editor.textContent.trim()) unsavedSincePDF = true;
  }
  function fnCmd(c, v) { editor.focus(); try { document.execCommand(c, false, v); } catch (e) {} fnSaveNow(); }
  function fnBtn(label, title, fn) {
    var b = document.createElement('button'); b.type = 'button'; b.title = title; b.innerHTML = label;
    b.addEventListener('mousedown', function (e) { e.preventDefault(); });
    b.addEventListener('click', fn); toolsBar.appendChild(b); return b;
  }
  function fnSep() { var s = document.createElement('span'); s.className = 'sep'; toolsBar.appendChild(s); }
  // ปุ่มแบบ dropdown — กดค่อยกางสีให้เลือก กันแถบเครื่องมือรก/ยาวเกินไป
  var fnDDs = [];
  function fnCloseAllDD() { fnDDs.forEach(function (p) { p.classList.remove('open'); }); }
  document.addEventListener('click', fnCloseAllDD);
  function fnDD(label, title) {
    var wrap = document.createElement('span'); wrap.className = 'fnotes-dd';
    var b = document.createElement('button'); b.type = 'button'; b.title = title; b.innerHTML = label;
    var pop = document.createElement('div'); pop.className = 'fnotes-dd-pop';
    b.addEventListener('mousedown', function (e) { e.preventDefault(); });
    b.addEventListener('click', function (e) {
      e.stopPropagation();
      var willOpen = !pop.classList.contains('open');
      fnCloseAllDD();
      if (willOpen) pop.classList.add('open');
    });
    wrap.appendChild(b); wrap.appendChild(pop); toolsBar.appendChild(wrap);
    fnDDs.push(pop);
    return pop;
  }
  // ── คีย์ลัด Ctrl/Cmd+B/I/U (กัน default ของเบราว์เซอร์ชนกัน ทำเองให้ชัวร์ทุกเบราว์เซอร์) ──
  function fnBindShortcuts() {
    editor.addEventListener('keydown', function (e) {
      var mod = e.ctrlKey || e.metaKey;
      if (!mod) return;
      var k = e.key.toLowerCase();
      if (k === 'b') { e.preventDefault(); fnCmd('bold'); }
      else if (k === 'i') { e.preventDefault(); fnCmd('italic'); }
      else if (k === 'u') { e.preventDefault(); fnCmd('underline'); }
    });
  }
  function fnHilite(color) {
    editor.focus();
    try { if (!document.execCommand('hiliteColor', false, color)) document.execCommand('backColor', false, color); }
    catch (e) { try { document.execCommand('backColor', false, color); } catch (e2) {} }
    fnSaveNow();
  }
  var FS_KEY = 'fnotes-fontsize', FS_MIN = 18, FS_MAX = 48;
  function fnApplyFontSize(px) {
    editor.style.fontSize = px + 'px';
    try { localStorage.setItem(FS_KEY, String(px)); } catch (e) {}
  }
  function fnStepFont(dir) {
    var cur = parseFloat(editor.style.fontSize) || 29;
    var next = cur + dir * 4;
    if (next < FS_MIN) next = FS_MIN;
    if (next > FS_MAX) next = FS_MAX;
    fnApplyFontSize(next);
  }

  fnBtn('<b>B</b>', '粗體 (Ctrl+B)', function () { fnCmd('bold'); });
  fnBtn('<i>I</i>', '斜體 (Ctrl+I)', function () { fnCmd('italic'); });
  fnBtn('<u>U</u>', '底線 (Ctrl+U)', function () { fnCmd('underline'); });
  fnSep();
  var fnColorPop = fnDD('🎨', '文字顏色');
  ['#1a1a1a', '#d85a30', '#C8973A', '#2e7d32', '#1565c0', '#c62828'].forEach(function (c) {
    var b = document.createElement('button'); b.type = 'button'; b.className = 'fnotes-swatch'; b.style.background = c; b.title = c;
    b.addEventListener('mousedown', function (e) { e.preventDefault(); });
    b.addEventListener('click', function () { fnCmd('foreColor', c); fnCloseAllDD(); });
    fnColorPop.appendChild(b);
  });
  var fnHiPop = fnDD('🖍', '螢光筆');
  ['#fff3a3', '#ffd6a5', '#b8f0c8', '#cfe8ff', '#ffc9de'].forEach(function (c) {
    var b = document.createElement('button'); b.type = 'button'; b.className = 'fnotes-swatch'; b.title = '螢光筆';
    b.style.background = c; b.style.border = '1px solid rgba(0,0,0,.15)';
    b.addEventListener('mousedown', function (e) { e.preventDefault(); });
    b.addEventListener('click', function () { fnHilite(c); fnCloseAllDD(); });
    fnHiPop.appendChild(b);
  });
  fnSep();
  fnBtn('A－', '縮小字體', function () { fnStepFont(-1); });
  fnBtn('A＋', '放大字體', function () { fnStepFont(1); });

  fnBindShortcuts();

  try {
    var savedFs = localStorage.getItem(FS_KEY);
    if (savedFs) editor.style.fontSize = savedFs + 'px';
  } catch (e) {}

  /* 載入 localStorage 筆記（舊資料是純文字 → 自動轉成有換行的 HTML，照樣能正常編輯） */
  var saved = localStorage.getItem(NOTES_KEY);
  if (saved) {
    editor.innerHTML = (saved.indexOf('<') === -1) ? escapeHtml(saved).replace(/\n/g, '<br>') : saved;
  }

  var unsavedSincePDF = false;

  editor.addEventListener('input', function () {
    if (fnSaveTimer) clearTimeout(fnSaveTimer);
    fnSaveTimer = setTimeout(fnSaveNow, 400);
  });

  function downloadPDF() {
    var content = editor.textContent.trim();
    if (!content) return;

    var now  = new Date();
    var pad  = function (n) { return String(n).padStart(2, '0'); };
    var dateStr = now.getFullYear() + '/' + pad(now.getMonth() + 1) + '/' + pad(now.getDate()) +
                  ' ' + pad(now.getHours()) + ':' + pad(now.getMinutes());
    var shortDate = now.getFullYear() + '/' + pad(now.getMonth() + 1) + '/' + pad(now.getDate());
    var fileTitle = now.getFullYear() + '-' + pad(now.getMonth() + 1) + '-' + pad(now.getDate()) +
                    '_' + pad(now.getHours()) + '-' + pad(now.getMinutes());
    var wmText = 'mrtaihualin.com' + (studentName ? (' · ' + studentName) : '') + ' · ' + shortDate;

    /* 筆記本身已經是排版好的 HTML（標題／顏色／螢光筆…），直接帶入 PDF */
    var bodyHtml = editor.innerHTML;

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
        '.page{width:210mm;min-height:297mm;margin:14px auto;background:#faf7f2;' +
          'padding:24mm 22mm 20mm;position:relative;' +
          'box-shadow:0 6px 26px rgba(0,0,0,0.14);}' +
        '.wm-single{position:absolute;top:50%;left:50%;' +
          'transform:translate(-50%,-50%) rotate(-30deg);' +
          'font-size:46px;font-weight:700;color:#8a7d5c;opacity:0.16;' +
          'white-space:nowrap;z-index:0;pointer-events:none;text-align:center;' +
          "font-family:'Noto Sans TC',sans-serif;}" +
        '.content-layer{position:relative;z-index:1;height:100%;display:flex;flex-direction:column;}' +
        '.hd{border-bottom:2.5px solid #4a6741;padding-bottom:14px;margin-bottom:26px;' +
          'display:flex;justify-content:space-between;align-items:flex-end;gap:16px;}' +
        '.hd-l{min-width:0;}' +
        '.brand{font-size:12px;font-weight:700;letter-spacing:0.16em;color:#4a6741;' +
          'text-transform:uppercase;margin-bottom:7px;}' +
        '.title{font-family:"Noto Serif TC",Georgia,serif;font-size:32px;font-weight:700;' +
          'color:#2d2a22;line-height:1.2;}' +
        '.meta{font-size:13px;color:#9a9080;white-space:nowrap;text-align:right;line-height:1.5;}' +
        '.notes{flex:1;font-size:17px;line-height:2.0;color:#2d2a22;}' +
        '.notes p{margin:0 0 15px;}' +
        '.notes p:last-child{margin-bottom:0;}' +
        '.ft{margin-top:26px;padding-top:12px;border-top:1px solid #d8d0c0;' +
          'display:flex;justify-content:space-between;font-size:11px;color:#9a9080;}' +
        '@page{size:A4;margin:0;}' +
        '@media print{body{background:#faf7f2;}' +
          '.page{width:auto;min-height:auto;margin:0;box-shadow:none;padding:18mm 17mm;}}' +
      '</style></head><body>' +
        '<div class="page">' +
          '<div class="wm-single">' + escapeHtml(wmText) + '</div>' +
          '<div class="content-layer">' +
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
        '</div>' +
      '</body></html>';

    var w = window.open('', '_blank');
    if (!w) { alert('請允許彈出視窗以下載 PDF'); return; }
    w.document.open();
    w.document.write(html);
    w.document.close();
    var go = function () { w.focus(); w.print(); };
    if (w.document.readyState === 'complete') { setTimeout(go, 400); }
    else { w.onload = function () { setTimeout(go, 400); }; }
    unsavedSincePDF = false;
  }

  overlay.querySelector('.fnotes-dl-btn').addEventListener('click', downloadPDF);

  /* ─────────────────────────────
     存入 Google Drive（只有帶 ?s=&n= 個人化連結才會出現這顆按鈕）
     跟「課堂教室」用同一組 Google 帳號授權（drive.file scope，只能動到 App 自己建立的檔案）
     ⚠️ 只有老師本人登入 Google 才有寫入權限；學生自己點只會授權寫進自己的 Drive，不會出錯但也存不進老師的資料夾
  ───────────────────────────── */
  if (canSaveToDrive) {
    var GOOGLE_CLIENT_ID = '912926837729-j8n8mojmrmngpha68pbasv9qslvgtvrn.apps.googleusercontent.com';
    var DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
    var DRIVE_ROOT_FOLDER = 'mrtaihualin 課堂錄影';
    var gdToken = null, gdTokenExp = 0, gdTokenClient = null;

    function loadGsiScript() {
      return new Promise(function (resolve, reject) {
        if (window.google && google.accounts && google.accounts.oauth2) { resolve(); return; }
        var s = document.createElement('script');
        s.src = 'https://accounts.google.com/gsi/client';
        s.async = true; s.defer = true;
        s.onload = function () { resolve(); };
        s.onerror = function () { reject(new Error('Google 登入元件載入失敗')); };
        document.head.appendChild(s);
      });
    }

    function gdGetToken(forceConsent) {
      return loadGsiScript().then(function () {
        return new Promise(function (resolve, reject) {
          if (!gdTokenClient) {
            gdTokenClient = google.accounts.oauth2.initTokenClient({
              client_id: GOOGLE_CLIENT_ID, scope: DRIVE_SCOPE, callback: function () {}
            });
          }
          if (!forceConsent && gdToken && Date.now() < gdTokenExp - 60000) { resolve(gdToken); return; }
          var timer = setTimeout(function () { reject(new Error('等候授權逾時，請再按一次')); }, 15000);
          gdTokenClient.callback = function (resp) {
            clearTimeout(timer);
            if (resp.error) { reject(new Error('Google 授權失敗：' + resp.error)); return; }
            gdToken = resp.access_token;
            gdTokenExp = Date.now() + (resp.expires_in || 3600) * 1000;
            resolve(gdToken);
          };
          gdTokenClient.requestAccessToken({ prompt: forceConsent ? 'consent' : '', hint: 'mr.taihualin@gmail.com' });
        });
      });
    }

    function gdApi(path, opts) {
      return gdGetToken().then(function (token) {
        var headers = Object.assign({ Authorization: 'Bearer ' + token }, (opts && opts.headers) || {});
        return fetch('https://www.googleapis.com/' + path, Object.assign({}, opts, { headers })).then(function (r) {
          if (!r.ok) return r.text().then(function (t) { throw new Error('Drive API ' + r.status + '：' + t.slice(0, 200)); });
          return r.json();
        });
      });
    }

    function gdFindFolder(name, parentId) {
      var q = "mimeType='application/vnd.google-apps.folder' and trashed=false and name='" + name.replace(/'/g, "\\'") + "'";
      if (parentId) q += " and '" + parentId + "' in parents";
      return gdApi('drive/v3/files?spaces=drive&fields=files(id)&q=' + encodeURIComponent(q), { method: 'GET' })
        .then(function (res) { return (res.files && res.files[0]) ? res.files[0].id : null; });
    }

    function gdEnsureFolder(name, parentId) {
      return gdFindFolder(name, parentId).then(function (found) {
        if (found) return found;
        var body = { name: name, mimeType: 'application/vnd.google-apps.folder' };
        if (parentId) body.parents = [parentId];
        return gdApi('drive/v3/files?fields=id', {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
        }).then(function (res) { return res.id; });
      });
    }

    function gdGetStudentSubfolderId(name, sub) {
      return gdEnsureFolder(DRIVE_ROOT_FOLDER, null)
        .then(function (rootId) { return gdEnsureFolder(name, rootId); })
        .then(function (stuId) { return gdEnsureFolder(sub, stuId); });
    }

    function gdUploadSmall(blob, name, targetMime, folderId) {
      return gdGetToken().then(function (token) {
        var meta = { name: name, parents: [folderId] };
        if (targetMime) meta.mimeType = targetMime;
        var form = new FormData();
        form.append('metadata', new Blob([JSON.stringify(meta)], { type: 'application/json' }));
        form.append('file', blob);
        return fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink', {
          method: 'POST', headers: { Authorization: 'Bearer ' + token }, body: form
        }).then(function (r) {
          if (!r.ok) throw new Error('上傳失敗 ' + r.status);
          return r.json();
        });
      });
    }

    function gdShareAnyone(fileId) {
      return gdApi('drive/v3/files/' + fileId + '/permissions', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: 'reader', type: 'anyone' })
      });
    }

    var driveBtn = overlay.querySelector('.fnotes-drive-btn');
    var driveStatusEl = overlay.querySelector('.fnotes-drive-status');

    driveBtn.addEventListener('click', function () {
      var content = editor.textContent.trim();
      if (!content) { alert('請先輸入內容再存入 Drive'); return; }
      driveStatusEl.textContent = '☁️ 連線 Google（第一次會跳出授權視窗）…';
      var now = new Date();
      var ymd = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
      var docName = '補充說明_' + studentName + '_' + ymd + '（' + pageLabel + '）';
      /* 筆記本身已經是排版好的 HTML，直接帶入 Google 文件 */
      var bodyHtml = editor.innerHTML;
      var seed = '<!DOCTYPE html><html><head><meta charset="UTF-8"></head><body>' +
        '<h1>📝 ' + docName + '</h1>' + bodyHtml + '</body></html>';
      var blob = new Blob([seed], { type: 'text/html' });

      gdGetStudentSubfolderId(studentName, '學習內容').then(function (folderId) {
        driveStatusEl.textContent = '☁️ 上傳中…';
        return gdUploadSmall(blob, docName, 'application/vnd.google-apps.document', folderId);
      }).then(function (doc) {
        return gdShareAnyone(doc.id).catch(function () {}).then(function () { return doc; });
      }).then(function (doc) {
        driveStatusEl.innerHTML = '✅ 已存入「' + escapeHtml(studentName) + '」的 Drive（學習內容資料夾）';
        unsavedSincePDF = false;
      }).catch(function (e) {
        driveStatusEl.textContent = '❌ 存檔失敗：' + (e.message || e) + '（請確認是用老師的 Google 帳號登入這台瀏覽器）';
      });
    });
  }

  /* 關閉頁面時，若筆記還沒存成 PDF，跳出瀏覽器原生「確定離開？」提醒先下載 */
  window.addEventListener('beforeunload', function (e) {
    if (unsavedSincePDF && editor.textContent.trim()) {
      e.preventDefault();
      e.returnValue = '';
      return '';
    }
  });

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
