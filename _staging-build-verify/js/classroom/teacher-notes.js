
// ============================================================
// FILE MAP: notes document lifecycle → editor/autosave → low-quota calculation → selected-student quota/payment view
// 課堂筆記 = 直接開該生 Google 文件來打字（Docs 原生即時自動儲存，最穩）
//   每位學生固定一份「學生名 — 課堂筆記」文件，放在該生 學習內容 資料夾，
//   分享給學生可看，並記錄到「課堂資料下載」。
// ============================================================
async function ensureStudentNotesDoc(studentName, token) {
  // 每天一份，檔名帶當天日期；同一天再開 → 開同一份
  // 2026-07-10 修正：改用 teacherToday()（泰國時間）取代瀏覽器本地時區的 getFullYear/getMonth/getDate，
  // 這裡才是真正接到 UI 的路徑（原本 noteDocKey() 已經修過，但那支沒有任何地方呼叫，白修了）
  const ymd = teacherToday();
  const key = 'notesdocid_' + token + '_' + ymd;
  const docName = studentName + ' — 課堂筆記 ' + ymd;
  let docId = localStorage.getItem(key);
  if (docId) {
    try {
      const meta = await gdApi('drive/v3/files/' + docId + '?fields=id,trashed', { method: 'GET' });
      if (meta.trashed) { docId = null; localStorage.removeItem(key); }   // 被丟到垃圾桶 → 重建
    } catch (e) { docId = null; localStorage.removeItem(key); }            // 找不到（被刪）→ 重建
  }
  if (docId) return docId;
  const folderId = await gdGetStudentSubfolderId(studentName, '學習內容');
  // 字體預設 36pt（Lin 指定）：<body> 設 36pt，Google 文件轉檔會沿用這個當「打字起始字級」
  const seed = '<!DOCTYPE html><html><head><meta charset="UTF-8"><style>body{font-size:36pt;}</style></head><body>'
    + '<h1>📝 ' + studentName + ' — 課堂筆記（' + ymd + '）</h1>'
    + '<p>在這裡打字，Google 文件會自動即時儲存。</p></body></html>';
  const blob = new Blob([seed], { type: 'text/html' });
  const doc = await gdUploadSmall(blob, docName, 'application/vnd.google-apps.document', folderId);
  docId = doc.id;
  localStorage.setItem(key, docId);
  const link = doc.webViewLink || ('https://docs.google.com/document/d/' + docId + '/edit');
  try { await gdShareAnyone(docId); } catch (e) {}
  try { await saveRecordingLink(token, docName, docId, link, '', null); } catch (e) {}
  // 橫向頁面 + 頁首頁尾浮水印（失敗不擋開啟筆記，只是這次沒套到格式，下次存檔會再補）
  try { await applyNoteDocFormat(docId); } catch (e) { console.warn('套用筆記格式失敗：', e.message || e); }
  return docId;
}
async function openStudentNotesDoc(token) {
  // 先同步開一個空白分頁，保住「使用者點擊」這個手勢 → 之後再導向 Docs，才不會被當彈出視窗擋掉
  const win = window.open('about:blank', '_blank');
  const s = studentsCache[token];
  const studentName = s ? s.name : token;
  try {
    const docId = await ensureStudentNotesDoc(studentName, token);
    const url = 'https://docs.google.com/document/d/' + docId + '/edit';
    if (win) win.location = url; else openTabReliably(url);   // 萬一被擋 → 用穩定的開分頁方式
  } catch (e) {
    if (win) win.close();
    alert('開啟筆記文件失敗：' + (e.message || e) + '（請先確認已連接 Google）');
  }
}

function openNotepad(token) {
  const s = studentsCache[token];
  currentNoteToken = token;
  const title = document.getElementById('notepadTitle');
  if (title) title.textContent = '📝 ' + (s ? s.name : '') + ' — 課堂筆記';
  const editor = document.getElementById('notepadEditor');
  if (editor) {
    editor.innerHTML = localStorage.getItem('notehtml_' + token) || '';
    editor.oninput = function() {                       // 指派 oninput（非 addEventListener）→ 重開不會疊加監聽
      localStorage.setItem('notehtml_' + token, editor.innerHTML);
      scheduleNoteAutosave(token);                      // 邊打邊自動存
    };
  }
  noteSetStatus(localStorage.getItem('gdConnected')
    ? '✏️ 編輯中…停手約 2.5 秒會自動儲存'
    : '⚠️ 尚未連接 Google，請先按一次「💾 存到 Drive」授權，之後就會自動儲存');
  document.getElementById('notepadOverlay').classList.add('open');
  setTimeout(function() { if (editor) editor.focus(); }, 150);
}

function closeNotepad() {
  clearTimeout(noteAutosaveTimer);
  // 關閉前再存一次（只有已連 Google 才做，避免突然彈授權視窗）
  if (currentNoteToken && localStorage.getItem('gdConnected')) persistNote(currentNoteToken, true);
  document.getElementById('notepadOverlay').classList.remove('open');
}

function noteCmd(cmd, val) {
  document.getElementById('notepadEditor').focus();
  document.execCommand(cmd, false, val || null);
  if (currentNoteToken) { localStorage.setItem('notehtml_' + currentNoteToken, document.getElementById('notepadEditor').innerHTML); scheduleNoteAutosave(currentNoteToken); }
}

function noteFontSize(val) {
  document.getElementById('notepadEditor').focus();
  document.execCommand('fontSize', false, val);
  if (currentNoteToken) scheduleNoteAutosave(currentNoteToken);
}

// 手動按鈕：立刻存（未連 Google 時這一步會跳授權）
function saveNote(token) { persistNote(token, false); }

// 邊打邊存：停手 2.5 秒後自動上傳（只有已連 Google 才自動，避免打字打到一半彈授權）
function scheduleNoteAutosave(token) {
  if (!localStorage.getItem('gdConnected')) return;
  clearTimeout(noteAutosaveTimer);
  noteSetStatus('✏️ 編輯中…');
  noteAutosaveTimer = setTimeout(function() { persistNote(token, true); }, 2500);
}

// 核心：建立或「覆蓋同一份」Google 文件（silent=true → 自動儲存，提示較低調）
async function persistNote(token, silent) {
  const editor = document.getElementById('notepadEditor');
  if (!editor || !token) return;
  if (noteSaving) { noteDirtyAgain = true; return; }   // 正在上傳 → 記住，等存完再存一次
  noteSaving = true;
  const htmlContent = editor.innerHTML;
  localStorage.setItem('notehtml_' + token, htmlContent);
  noteSetStatus(silent ? '💾 自動儲存中…' : '⏳ 上傳中…');
  const s = studentsCache[token];
  const studentName = s ? s.name : token;
  const today = new Date().toLocaleDateString('zh-TW', { year: 'numeric', month: '2-digit', day: '2-digit' });
  const fileName = studentName + '_筆記_' + today.replace(/\//g, '-');  // 不加 .html → 轉成 Google Doc
  const fullHtml = '<!DOCTYPE html><html><head><meta charset="UTF-8"><title>' + studentName + ' 課堂筆記 ' + today + '</title>'
    + '<style>body{font-family:serif;max-width:740px;margin:40px auto;padding:0 24px;line-height:1.85;color:#1C1C1C;background:#FFFDF7;}'
    + 'h1{color:#8B6310;border-bottom:2px solid #C8973A;padding-bottom:8px;margin-bottom:4px;}'
    + '.content{font-size:36pt;}</style></head>'
    + '<body><h1>📝 ' + studentName + ' — 課堂筆記</h1>'
    + '<p style="color:#6b6b6b;font-size:0.88rem;margin-top:0;margin-bottom:20px;">日期：' + today + '</p>'
    + '<div class="content">' + htmlContent + '</div>'
    + '<hr style="margin-top:32px;border:none;border-top:1px solid #e5d9c0;">'
    + '<p style="color:#aaa;font-size:0.78rem;">泰華老師課堂筆記 · mrtaihualin.com</p>'
    + '</body></html>';
  const blob = new Blob([fullHtml], { type: 'text/html' });
  const docKey = noteDocKey(token);
  try {
    let docId = localStorage.getItem(docKey);
    if (docId) {
      // 覆蓋同一份文件（不產生新檔、不重複記錄到學生下載清單）
      try { await gdUpdateDocHtml(docId, blob); }
      catch (e) {
        if (/ 40[34]/.test(' ' + (e.message || ''))) { localStorage.removeItem(docKey); docId = null; }  // 檔案被刪/沒權限 → 改建新檔
        else throw e;
      }
    }
    if (!docId) {
      const folderId = await gdGetStudentSubfolderId(studentName, '學習內容');
      const doc = await gdUploadSmall(blob, fileName, 'application/vnd.google-apps.document', folderId);
      docId = doc.id;
      localStorage.setItem(docKey, docId);
      const link = doc.webViewLink || ('https://docs.google.com/document/d/' + docId + '/edit');
      try { await gdShareAnyone(docId); } catch(e) {}
      try { await saveRecordingLink(token, fileName + '（筆記）', docId, link, '', null); } catch(e) {}  // 只在第一次建立時記錄
    }
    // 橫向頁面 + 頁首頁尾浮水印：每次存檔都重新套一次
    // 原因：上面覆蓋文件內容用的是「整份轉檔上傳」，頁面設定／頭尾很可能每次都被洗掉，
    // 所以務必每次存完都重補一次，不然打幾個字之後版面就會跳回直向、頭尾也不見了
    try { await applyNoteDocFormat(docId); }
    catch (e) { console.warn('套用筆記格式失敗（不影響筆記內容已存檔）：', e.message || e); }
    const link = 'https://docs.google.com/document/d/' + docId + '/edit';
    const tt = new Date().toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' });
    noteSetStatus('✅ 已自動儲存 ' + tt + '　<a href="' + escHtml(safeHref(link)) + '" target="_blank" rel="noopener" style="color:var(--gold-deep);font-weight:700;">開啟文件</a>');
  } catch(e) {
    noteSetStatus('⚠️ ' + (e.message || e));
  } finally {
    noteSaving = false;
    if (noteDirtyAgain) { noteDirtyAgain = false; scheduleNoteAutosave(token); }  // 存的途中又改了 → 再排一次
  }
}

// 老師：頂部「快上完」提醒橫幅（一次掃全部學生，只用 2 個查詢）
// 課程快上完提醒：多位學生時每張輪流顯示（自動切換），每張都可按 ✕ 個別關閉
// 關閉後記住當時的剩餘堂數；之後堂數有變動（續課或又用掉）才會重新跳出來提醒
var lowQuotaList = [];
var lowQuotaIdx = 0;
var lowQuotaRotateTimer = null;

function getDismissedLowQuota() {
  try { return JSON.parse(localStorage.getItem('dismissedLowQuota') || '{}'); } catch (e) { return {}; }
}

// 2026-08-02 改（Lin 要求拿掉最上面的課程快上完橫幅）：這支函式現在不找 #lowQuotaBanner 畫東西了
// （那個 div 已經拿掉），但底下算出來的「每個學生剩餘堂數」還是要留著——搬去給 學生管理สารบัญ
// 的副標題／狀態 badge 用（見 window._rosterQuotaByToken）。renderLowQuotaBanner() 那支還在，
// 但 el 一定是 null，會直接跳出，不影響——沒有動它，保留舊行為當保險。
async function loadLowQuotaBanner() {
  try {
    var pays = (await sb.from('classroom_payments').select('token,lessons,bonus_lessons,status,start_date').in('status', ['pending', 'done'])).data || [];
    var atts = (await sb.from('classroom_attendance').select('token,lesson_date,lessons')).data || [];
    var byP = {}, byA = {};
    pays.forEach(function(p) { (byP[p.token] = byP[p.token] || []).push(p); });
    atts.forEach(function(a) { (byA[a.token] = byA[a.token] || []).push(a); });
    var dismissed = getDismissedLowQuota();
    var low = [];
    var quotaByToken = {};
    Object.keys(byP).forEach(function(tk) {
      var q = computeCurrentCourse(byP[tk], byA[tk] || []);
      quotaByToken[tk] = { hasCourse: q.hasCourse, remain: q.remain }; // 2026-08-02 加：给สารบัญ用，不管有沒有關過提醒都要顯示真實堂數
      if (q.hasCourse && q.remain <= 1) {
        var remain = q.remain < 0 ? 0 : q.remain;
        if (dismissed[tk] === remain) return; // 這個堂數已經關過提醒了，狀況沒變就不再顯示（只影響舊橫幅，不影響สารบัญ badge）
        var s = studentsCache[tk];
        low.push({ token: tk, name: s ? s.name : tk, remain: remain });
      }
    });
    window._rosterQuotaByToken = quotaByToken;
    lowQuotaList = low;
    lowQuotaIdx = 0;
    renderLowQuotaBanner();
    refreshAllRosterMeta(); // 2026-08-02 加：剩餘堂數算好了，補畫สารบัญ每一行的副標題／badge
  } catch (e) {}
}

function renderLowQuotaBanner() {
  var el = document.getElementById('lowQuotaBanner');
  if (!el) return;
  if (lowQuotaRotateTimer) { clearInterval(lowQuotaRotateTimer); lowQuotaRotateTimer = null; }
  if (!lowQuotaList.length) { el.innerHTML = ''; return; }
  if (lowQuotaIdx >= lowQuotaList.length) lowQuotaIdx = 0;
  var item = lowQuotaList[lowQuotaIdx];
  var counter = lowQuotaList.length > 1 ? ' <span style="opacity:0.65;font-weight:400;">(' + (lowQuotaIdx + 1) + '/' + lowQuotaList.length + ')</span>' : '';
  el.innerHTML = '<div style="display:flex;align-items:center;gap:10px;background:#fff7ed;border:1.5px solid #f59e0b;border-radius:12px;padding:13px 16px;margin-bottom:14px;font-family:\'Noto Sans TC\',sans-serif;font-size:0.9rem;color:#b45309;font-weight:700;">' +
    '<span style="flex:1;">⏰ 課程快上完提醒：' + escHtml(item.name) + '（剩 ' + item.remain + ' 堂） — 記得提醒續課' + counter + '</span>' +
    '<button onclick="dismissLowQuota(\'' + item.token + '\',' + item.remain + ')" title="關閉" style="background:none;border:none;cursor:pointer;font-size:1.1rem;color:#b45309;opacity:0.6;padding:2px 6px;flex-shrink:0;">✕</button>' +
  '</div>';
  if (lowQuotaList.length > 1) {
    lowQuotaRotateTimer = setInterval(function() {
      lowQuotaIdx = (lowQuotaIdx + 1) % lowQuotaList.length;
      renderLowQuotaBanner();
    }, 5000);
  }
}

function dismissLowQuota(token, remain) {
  try {
    var dismissed = getDismissedLowQuota();
    dismissed[token] = remain;
    localStorage.setItem('dismissedLowQuota', JSON.stringify(dismissed));
  } catch (e) {}
  lowQuotaList = lowQuotaList.filter(function(x) { return x.token !== token; });
  if (lowQuotaIdx >= lowQuotaList.length) lowQuotaIdx = 0;
  renderLowQuotaBanner();
}

// 老師：選到某學生時，顯示剩餘堂數 + 繳費記錄
async function loadTeacherStudentInfo(token) {
  var el = document.getElementById('stuInfo-' + token.replace(/'/g, ''));
  if (!el) return;
  try {
    // 🔴 2026-07-26：อ่านพัง = ต้องบอกว่าอ่านพัง ห้ามคิดเป็น 0 (ดู rowsOrThrow)
    var pays = rowsOrThrow(await sb.from('classroom_payments').select('id,course_label,lessons,bonus_lessons,currency,total_amount,status,start_date,created_at').eq('token', token).order('created_at', { ascending: false }), '繳費紀錄');
    var atts = rowsOrThrow(await sb.from('classroom_attendance').select('lesson_date,lessons').eq('token', token), '上課紀錄');
    var q = computeCurrentCourse(pays, atts);
    var quotaHtml = q.hasCourse
      ? '<div style="background:#fbf6ea;border:1px solid #e9dcb8;border-radius:9px;padding:8px 12px;margin-bottom:10px;font-family:\'Noto Sans TC\',sans-serif;font-size:0.85rem;color:' + (q.remain <= 1 ? '#b45309' : 'var(--gold-deep)') + ';font-weight:700;">本輪剩餘 ' + (q.remain < 0 ? 0 : q.remain) + ' 堂 <span style="font-weight:400;color:var(--ink-muted);">（本輪 ' + q.bought + ' · 已上 ' + q.used + (q.start ? ' · 起算 ' + q.start : '') + '）</span></div>'
      : '';
    var statusZh = { slip_submitted: '⏳ 待確認', pending: '✅ 已確認', done: '🧾 已開立收據', rejected: '❌ 未通過' };
    var histHtml;
    if (pays.length) {
      histHtml = '<div style="font-weight:700;font-size:0.82rem;color:var(--ink);margin-bottom:2px;font-family:\'Noto Sans TC\',sans-serif;">📋 繳費記錄</div>' + pays.map(function(p) {
        var d = p.created_at ? new Date(p.created_at) : null;
        var ds = d ? (d.getFullYear() + '/' + String(d.getMonth()+1).padStart(2,'0') + '/' + String(d.getDate()).padStart(2,'0')) : '';
        var regenBtn = (p.status === 'done' || p.status === 'pending')
          ? ' <button onclick="regenReceipt(\'' + p.id + '\')" title="' + (p.status === 'done' ? '重新開立收據' : '補開收據') + '" style="background:none;border:none;cursor:pointer;font-size:0.8rem;padding:0 2px;opacity:0.6;">🔄</button>'
          : '';
        var delBtn = '<button onclick="deletePayment(\'' + p.id + '\',\'' + token + '\')" title="刪除此筆記錄" style="background:none;border:none;cursor:pointer;font-size:0.8rem;padding:0 2px;opacity:0.4;margin-left:4px;">🗑️</button>';
        return '<div style="display:flex;justify-content:space-between;gap:8px;padding:6px 0;border-bottom:1px solid rgba(0,0,0,0.06);font-family:\'Noto Sans TC\',sans-serif;font-size:0.8rem;">' +
          '<div><span style="font-weight:700;">' + (p.course_label || '-') + '</span><span style="color:var(--ink-muted);"> · ' + ds + ' · ' + (p.lessons || 0) + '堂' + (p.bonus_lessons ? '+' + p.bonus_lessons : '') + ' · ' + (p.currency || '') + ' ' + (p.total_amount || 0).toLocaleString() + '</span></div>' +
          '<span style="white-space:nowrap;color:var(--gold-deep);font-weight:600;">' + (statusZh[p.status] || p.status) + regenBtn + delBtn + '</span>' +
        '</div>';
      }).join('');
    } else {
      histHtml = '<div style="color:var(--ink-muted);font-size:0.8rem;font-family:\'Noto Sans TC\',sans-serif;">尚無繳費記錄</div>';
    }
    // ── 學生感想（最近 5 筆）+ 核准刊登按鈕 ──
    var fbHtml = '';
    try {
      var fbRes = await sb.from('classroom_feedback').select('id,content,approved,display_name,created_at,category').eq('token', token).order('created_at', { ascending: false }).limit(5);
      var fbs = fbRes.data || [];
      // หมวดหมู่รีวิว — key ต้องตรงกับตัวกรองใน pricing.html (CATS array) ห้ามเปลี่ยนตามใจ — Lin 2026-07-10
      var FB_CATS = [['發音','發音'],['文法','文法・文化'],['基礎','初學者・打基礎'],['客製','客製化教學'],['口說','口說・生活'],['綜合','綜合推薦']];
      if (fbs.length) {
        fbHtml = '<div style="margin-top:12px;border-top:1px solid var(--border);padding-top:12px;">' +
          '<div style="font-weight:700;font-size:0.82rem;color:var(--ink);margin-bottom:6px;font-family:\'Noto Sans TC\',sans-serif;">💬 學生感想（最近 ' + fbs.length + ' 筆）</div>' +
          fbs.map(function(f) {
            var d = f.created_at ? new Date(f.created_at).toLocaleDateString('zh-TW', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '';
            var fid = (f.id || '').replace(/'/g, '');
            var approvedBadge = f.approved ? ' <span style="background:var(--gold-light);color:var(--gold-deep);border-radius:10px;padding:1px 7px;font-weight:700;font-size:0.7rem;">✅ 已刊登</span>' : '';
            var curCats = (f.category || '').split(' ').filter(Boolean);
            var catLabel = curCats.length ? FB_CATS.filter(function(c){ return curCats.indexOf(c[0]) > -1; }).map(function(c){ return c[1]; }).join('、') : '（未分類）';
            var checkboxRow = '<div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:6px;font-size:0.76rem;color:var(--ink-muted);font-family:\'Noto Sans TC\',sans-serif;">' +
              FB_CATS.map(function(c) {
                var checked = curCats.indexOf(c[0]) > -1 ? ' checked' : '';
                return '<label style="display:flex;align-items:center;gap:3px;cursor:pointer;"><input type="checkbox" data-fid="' + fid + '" value="' + c[0] + '"' + checked + '>' + c[1] + '</label>';
              }).join('') +
              '</div>';
            var actionRow = f.approved
              ? '<div style="font-size:0.78rem;color:var(--gold-deep);margin-top:5px;">公開名稱：' + escHtml(f.display_name || '匿名學員') + '　分類：' + catLabel +
                  ' <button onclick="unapproveTestimonial(\'' + fid + '\',\'' + token.replace(/'/g,'') + '\')" style="background:none;border:none;cursor:pointer;font-size:0.75rem;color:#b91c1c;padding:0 4px;font-family:\'Noto Sans TC\',sans-serif;">撤銷刊登</button></div>'
              : '<div style="display:flex;gap:6px;align-items:center;margin-top:6px;">' +
                  '<input id="dn-' + fid + '" placeholder="公開名稱（例：小明同學）" value="' + escHtml(f.display_name || '') + '" style="flex:1;padding:5px 8px;border-radius:6px;border:1px solid var(--border);font-size:0.78rem;font-family:\'Noto Sans TC\',sans-serif;background:#fff;color:var(--ink);">' +
                  '<button onclick="approveTestimonial(\'' + fid + '\',\'' + token.replace(/'/g,'') + '\')" style="background:var(--gold);color:#fff;border:none;border-radius:6px;padding:5px 10px;font-size:0.78rem;font-weight:700;cursor:pointer;font-family:\'Noto Sans TC\',sans-serif;white-space:nowrap;">✅ 核准刊登</button>' +
                '</div>' + checkboxRow;
            return '<div style="background:#f9f7f2;border-radius:8px;padding:9px 10px;margin-bottom:6px;font-family:\'Noto Sans TC\',sans-serif;">' +
              '<div style="font-size:0.76rem;color:var(--ink-muted);margin-bottom:3px;">' + d + approvedBadge + '</div>' +
              '<div style="font-size:0.85rem;color:var(--ink);white-space:pre-wrap;word-break:break-word;">' + escHtml(f.content) + '</div>' +
              actionRow +
            '</div>';
          }).join('') +
        '</div>';
      }
    } catch(e) {}
    el.innerHTML = quotaHtml + histHtml + fbHtml;
  } catch (e) {
    // 🔴 2026-07-26：เดิม catch ว่างเปล่า → อ่านพังแล้วช่องนี้ว่างเปล่าเงียบๆ ครูไม่รู้ว่าเลขที่เห็นเชื่อไม่ได้
    el.innerHTML = quotaLoadFailHtml(e && e.message);
    console.warn('loadTeacherStudentInfo failed:', e);
  }
}
