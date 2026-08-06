// ── Drive: get/create student folder + small-file upload ───────
async function gdGetStudentFolderId(studentName) {
  const rootId = await gdEnsureFolder(DRIVE_ROOT_FOLDER, null);
  return await gdEnsureFolder(studentName, rootId);
}

// 2026-07-14 加：封存/恢復學生時，把整個學生資料夾搬進／搬出「舊生」子資料夾
// （用 addParents/removeParents，資料夾本體 id 不變，裡面的檔案完全不受影響，只是換位置而已）
async function gdMoveFolder(fileId, newParentId, oldParentId) {
  return await gdApi(
    'drive/v3/files/' + fileId + '?addParents=' + encodeURIComponent(newParentId) +
      '&removeParents=' + encodeURIComponent(oldParentId) + '&fields=id,parents',
    { method: 'PATCH' }
  );
}
const DRIVE_ARCHIVE_FOLDER = '舊生';
// 封存：把學生資料夾從根目錄搬進「舊生」— 只搬「已經存在」的資料夾，沒有的話就跳過
// （不要因為封存而意外新建一個空的學生資料夾）
async function moveStudentFolderToArchive(studentName) {
  try {
    const rootId = await gdEnsureFolder(DRIVE_ROOT_FOLDER, null);
    const stuId = await gdFindFolder(studentName, rootId);
    if (!stuId) return { ok: true, note: '找不到這位學生的 Drive 資料夾，略過搬移' };
    const archiveRootId = await gdEnsureFolder(DRIVE_ARCHIVE_FOLDER, rootId);
    await gdMoveFolder(stuId, archiveRootId, rootId);
    return { ok: true };
  } catch (e) { return { ok: false, error: e.message || String(e) }; }
}
// 2026-07-14（第 3 版，Lin 明確要求改成這樣）：恢復舊生「不」把 Drive 資料夾搬回來 —
//   進了「舊生」資料夾就永久留在那裡當歷史紀錄，不會再搬出來。
//   之後這位學生走一次跟全新付款學生完全一樣的流程（確認收款→建立 Meet/Calendar/Drive），
//   到時候 gdGetStudentFolderId(studentName) 只會在根目錄找，找不到（因為舊的在「舊生」
//   裡）就會自動建一個全新的資料夾——不管舊資料夾還在不在，一律重新建立，不嘗試沿用。
//   （曾經寫過一版「搬回原本位置沿用舊資料夾」的 moveStudentFolderFromArchive，
//   Lin 確認不要這樣，2026-07-14 拿掉了）
// 學生資料夾下再分子資料夾：學習內容（筆記）／影片（錄影）
async function gdGetStudentSubfolderId(studentName, sub) {
  const stuId = await gdGetStudentFolderId(studentName);
  return await gdEnsureFolder(sub, stuId);
}
// 分享整個學生資料夾（任何有連結者可看）＋ 記錄連結到 DB，供學生頁面開啟瀏覽
async function ensureStudentFolderShared(studentName, token) {
  try {
    const stuId = await gdGetStudentFolderId(studentName);
    try { await gdShareAnyone(stuId); } catch(e) {}
    const link = 'https://drive.google.com/drive/folders/' + stuId;
    if (token) {
      // 2026-07-15 修：以前這裡吞掉所有結果，連 error 都沒讀，RLS 擋掉也不會發現，
      // 學生頁的資料夾連結永遠不會更新到。改成讀 error + 確認真的有 row 被改到。
      const folderUpdRes = await sb.from('classroom_students').update({ folder_url: link }).eq('token', token).select();
      if (folderUpdRes.error || !folderUpdRes.data || !folderUpdRes.data.length) {
        console.warn('⚠️ ensureStudentFolderShared：資料夾連結沒有真的寫入資料庫（token=' + token + '）：' +
          (folderUpdRes.error ? folderUpdRes.error.message : '可能是 RLS 權限問題，0 筆被更新'));
      }
    }
    return link;
  } catch(e) { return null; }
}
// ── 手動上傳檔案到學生資料夾（透過 App，App 才看得到）──────────
let uploadToken = null, uploadDest = '學習內容', droppedFiles = null;
function openUploadModal(token) {
  uploadToken = token; uploadDest = '學習內容'; droppedFiles = null;
  const s = (typeof studentsCache !== 'undefined') ? studentsCache[token] : null;
  document.getElementById('uploadTitle').textContent = '⬆️ 上傳檔案 — ' + (s ? s.name : token);
  const inp = document.getElementById('uploadFileInput'); if (inp) inp.value = '';
  const fol = document.getElementById('uploadFolderInput'); if (fol) fol.value = '';
  const sel = document.getElementById('upDestSelect'); if (sel) sel.value = '學習內容';
  const zone = document.getElementById('uploadDropZone'); if (zone) { zone.style.borderColor = ''; zone.style.background = ''; }
  document.getElementById('uploadPickInfo').textContent = '';
  document.getElementById('uploadStatus').textContent = '';
  document.getElementById('uploadOverlay').classList.add('open');
}
function closeUploadModal() { document.getElementById('uploadOverlay').classList.remove('open'); }
function handleDropZone(event) {
  event.preventDefault();
  const zone = document.getElementById('uploadDropZone');
  if (zone) { zone.style.borderColor = 'var(--gold-deep)'; zone.style.background = ''; }
  droppedFiles = event.dataTransfer.files;
  updateUploadPick();
}
function getUploadFiles() {
  if (droppedFiles && droppedFiles.length) return [...droppedFiles];
  const a = document.getElementById('uploadFileInput');
  const b = document.getElementById('uploadFolderInput');
  return [...(a && a.files ? a.files : []), ...(b && b.files ? b.files : [])];
}
function updateUploadPick() {
  const files = getUploadFiles();
  const info = document.getElementById('uploadPickInfo');
  info.textContent = files.length ? ('已選 ' + files.length + ' 個檔案') : '';
}
// ── 上傳進度狀態：popup 內 + 右下角浮動條（關掉 popup 也看得到）──
let uploadInProgress = false;
function setUploadStatus(text) {
  const s = document.getElementById('uploadStatus'); if (s) s.textContent = text;
  const f = document.getElementById('uploadFloatText'); if (f) f.textContent = text;
}
function showUploadFloat() { const el = document.getElementById('uploadFloat'); if (el) el.style.display = 'block'; }
function hideUploadFloat() { const el = document.getElementById('uploadFloat'); if (el) el.style.display = 'none'; }
// 上傳途中若要關分頁／跳頁 → 跳出瀏覽器原生警告，避免半途中斷
// 2026-07-11：也涵蓋錄影自動上傳（recUploadInProgress，見 autoUploadRecording），
// 兩種上傳只要有一個還在進行中，就要擋關閉分頁
window.addEventListener('beforeunload', function (e) {
  if (uploadInProgress || recUploadInProgress) {
    e.preventDefault();
    e.returnValue = 'Video is currently uploading. If you close this page now, the upload will be lost.';
    return e.returnValue;
  }
});
function selectUploadDest(d) { uploadDest = d; }
async function doUploadFiles() {
  if (uploadInProgress) { alert('已有一批檔案正在上傳，請等它完成'); return; }
  const files = getUploadFiles();
  if (!files.length) { alert('請先選擇檔案或資料夾'); return; }
  // 一開始就把當下的對象「鎖住」成區域變數 → 即使中途關 popup 或開別位學生，也不會傳錯資料夾
  const token = uploadToken, dest = uploadDest;
  const s = (typeof studentsCache !== 'undefined') ? studentsCache[token] : null;
  const name = s ? s.name : token;
  // 立刻清掉已選清單並顯示浮動進度條（之後關掉 popup 也看得到、上傳照跑）
  document.getElementById('uploadFileInput').value = '';
  document.getElementById('uploadFolderInput').value = '';
  document.getElementById('uploadPickInfo').textContent = '';
  uploadInProgress = true;
  showUploadFloat();
  try {
    setUploadStatus('☁️ 連線 Google Drive…（首次會跳出授權）');
    const folderId = await gdGetStudentSubfolderId(name, dest);
    const folderCache = {};   // 相對路徑 → Drive 資料夾 id（同一次上傳共用，避免重複建立）
    async function ensureSubPath(parts) {
      let parent = folderId, key = '';
      for (const p of parts) {
        key += '/' + p;
        if (!folderCache[key]) folderCache[key] = await gdEnsureFolder(p, parent);
        parent = folderCache[key];
      }
      return parent;
    }
    let n = 0;
    // 2026-07-17 加（RELIABILITY FIRST）：以前 saveRecordingLink 失敗時是 try/catch 吞掉，
    // 檔案明明上傳到 Drive 了，但登記進資料庫失敗的話學生會完全看不到這個檔案，
    // 而畫面卻照樣顯示「✅ 已上傳 N 個檔案」——看起來成功，其實沒完全成功。改成收集失敗清單，
    // 最後如果有失敗，明確告訴老師哪些檔案「Drive 有，但學生看不到」。
    const failedRegistrations = [];
    for (const f of files) {
      // 選「整個資料夾」時 webkitRelativePath = "資料夾/子層/檔名" → 在 Drive 重建一樣的資料夾結構
      const rel = (f.webkitRelativePath || f.name).split('/');
      const baseName = rel.pop();
      const targetFolder = rel.length ? await ensureSubPath(rel) : folderId;
      const showName = f.webkitRelativePath || f.name;
      setUploadStatus('☁️ 上傳中… ' + (n + 1) + '/' + files.length + '：' + showName);
      const up = await gdUpload(f, baseName, targetFolder, function(pct) {
        setUploadStatus('☁️ 上傳中… ' + (n + 1) + '/' + files.length + '：' + showName + (pct > 0 && pct < 100 ? ' (' + pct + '%)' : ''));
      });
      // 分享 + 記錄 → 學生在「課堂資料下載」看得到並可下載
      try { await gdShareAnyone(up.id); } catch(e) {}
      const ulink = up.webViewLink || ('https://drive.google.com/file/d/' + up.id + '/view');
      const regErr = await saveRecordingLink(token, showName, up.id, ulink, (f.size / 1048576).toFixed(1), null);
      if (regErr) failedRegistrations.push(showName + '（' + regErr.message + '）');
      n++;
    }
    try { await ensureStudentFolderShared(name, token); } catch(e) {}
    if (failedRegistrations.length) {
      setUploadStatus('⚠️ 上傳完成，但有 ' + failedRegistrations.length + ' 個檔案登記失敗（學生可能看不到）');
    } else {
      setUploadStatus('✅ 已上傳 ' + n + ' 個檔案到「' + name + ' / ' + dest + '」');
    }
    // 完成 popup：顯示結果 + 到 Drive 查看
    document.getElementById('uploadDoneMsg').innerHTML = '已上傳 <b>' + n + '</b> 個檔案到<br>「' + escHtml(name) + ' / ' + escHtml(dest) + '」'
      + (failedRegistrations.length ? '<br><span style="color:var(--amber-dark);font-weight:700;">⚠️ 但以下 ' + failedRegistrations.length + ' 個檔案登記失敗，學生可能看不到（Drive 裡有檔案，請點下面「同步舊檔」補登記）：<br>' + failedRegistrations.map(function(s){return escHtml(s);}).join('<br>') + '</span>' : '');
    document.getElementById('uploadDoneDriveBtn').href = 'https://drive.google.com/drive/folders/' + folderId;
    document.getElementById('uploadDoneModal').classList.add('open');
  } catch (e) {
    setUploadStatus('⚠️ 上傳失敗：' + (e.message || e));
    alert('上傳失敗：' + (e.message || e));
  } finally {
    uploadInProgress = false;
    hideUploadFloat();
  }
}
// targetMime = ใส่ 'application/vnd.google-apps.document' เพื่อให้ Drive แปลง HTML เป็น Google Doc (เปิดอ่าน/แก้ได้เลย ไม่โชว์โค้ดดิบ)
async function gdUploadSmall(blob, name, targetMime, folderId) {
  const token = await gdGetToken();
  const meta = { name: name, parents: [folderId] };
  if (targetMime) meta.mimeType = targetMime;
  const form = new FormData();
  form.append('metadata', new Blob([JSON.stringify(meta)], { type: 'application/json' }));
  form.append('file', blob);
  const r = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink', {
    method: 'POST', headers: { Authorization: 'Bearer ' + token }, body: form
  });
  if (!r.ok) throw new Error('上傳失敗 ' + r.status);
  return await r.json();  // 老師私人筆記，不公開分享
}
// 用新 HTML「覆蓋」同一份 Google 文件內容（給筆記自動儲存用 → 不會一直產生新檔）
async function gdUpdateDocHtml(fileId, blob) {
  const token = await gdGetToken();
  const r = await fetch('https://www.googleapis.com/upload/drive/v3/files/' + fileId + '?uploadType=media&fields=id,webViewLink', {
    method: 'PATCH', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'text/html' }, body: blob
  });
  if (!r.ok) throw new Error('更新失敗 ' + r.status);
  return await r.json();
}

async function saveRecordingLink(token, name, fileId, url, sizeMB, part) {
  const { error } = await sb.from('classroom_recordings').insert({
    token, name, file_id: fileId, url, size_mb: sizeMB, part
  });
  if (error) console.warn('儲存錄影連結失敗：', error.message);
  // 2026-07-17 加（RELIABILITY FIRST）：以前失敗只 console.warn，呼叫端完全不知道有沒有存成功。
  // 現在把 error 回傳出去，重要的呼叫端（教材連結、上傳檔案）可以直接檢查並提示老師。
  return error || null;
}

// ============================================================
// 同步舊檔案：掃描 Google Drive 學生資料夾，把「不是透過本網站上傳」的舊檔案
// 補登記進 classroom_recordings，學生頁面「課堂資料下載」才看得到
// 2026-07-07 新增（Lin 要求）：之前老師直接拖檔案進 Drive（沒有經過網站上傳按鈕）
// 的舊筆記/資料，網站的學生頁面只讀 classroom_recordings 這張表，不會直接列 Drive
// 資料夾內容，所以永遠不會出現 → 造成「Ling 看不到舊檔案」
// ============================================================

// 遞迴列出資料夾底下所有「檔案」(不含資料夾本身)，回傳 [{id,name,mimeType,webViewLink,size}]
async function gdListFilesRecursive(folderId) {
  let files = [];
  let pageToken = '';
  do {
    const q = "'" + folderId + "' in parents and trashed=false";
    const url = 'drive/v3/files?q=' + encodeURIComponent(q)
      + '&fields=' + encodeURIComponent('nextPageToken,files(id,name,mimeType,webViewLink,size)')
      + '&pageSize=1000'
      + (pageToken ? '&pageToken=' + encodeURIComponent(pageToken) : '');
    const res = await gdApi(url, { method: 'GET' });
    for (const f of (res.files || [])) {
      if (f.mimeType === 'application/vnd.google-apps.folder') {
        const sub = await gdListFilesRecursive(f.id);
        files = files.concat(sub);
      } else {
        files.push(f);
      }
    }
    pageToken = res.nextPageToken || '';
  } while (pageToken);
  return files;
}

// 同步單一學生：掃 Drive → 補登記進資料庫（已登記過的 file_id 不會重複加）→ 回傳新增幾筆
async function syncDriveFilesForStudent(token) {
  const s = studentsCache[token];
  const name = s ? s.name : token;
  const stuId = await gdGetStudentFolderId(name);
  const driveFiles = await gdListFilesRecursive(stuId);
  const { data: existing, error: exErr } = await sb.from('classroom_recordings').select('file_id').eq('token', token);
  if (exErr) throw new Error('讀取現有紀錄失敗：' + exErr.message);
  const existingIds = new Set((existing || []).map(function(r) { return r.file_id; }).filter(Boolean));
  let added = 0;
  for (const f of driveFiles) {
    if (existingIds.has(f.id)) continue; // 已經登記過，跳過，不會重複
    try { await gdShareAnyone(f.id); } catch (e) {} // 舊檔案可能還沒分享過，補分享一次確保學生打得開
    const url = f.webViewLink || ('https://drive.google.com/file/d/' + f.id + '/view');
    const sizeMB = f.size ? (f.size / 1048576).toFixed(1) : '';
    await saveRecordingLink(token, f.name, f.id, url, sizeMB, null);
    added++;
  }
  try { await ensureStudentFolderShared(name, token); } catch (e) {}
  return added;
}

// 老師點單一學生的「🔄 同步舊檔」按鈕
async function syncOneStudentClick(token, btn) {
  const oldText = btn ? btn.textContent : '';
  try {
    if (btn) { btn.disabled = true; btn.textContent = '同步中…'; }
    const added = await syncDriveFilesForStudent(token);
    alert(added ? ('✅ 補登記了 ' + added + ' 個舊檔案，學生現在看得到了') : 'ℹ️ 沒有需要補登記的檔案（Drive 裡的檔案都已經在清單裡了）');
  } catch (e) {
    alert('⚠️ 同步失敗：' + (e.message || e));
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = oldText || '🔄 同步舊檔'; }
  }
}

// 老師點「🔄 同步全部學生」按鈕：逐一掃描每位學生的 Drive 資料夾
async function syncDriveFilesForAllStudents() {
  const tokens = Object.keys(studentsCache);
  if (!tokens.length) { alert('目前沒有學生資料'); return; }
  if (!confirm('要掃描全部 ' + tokens.length + ' 位學生的 Google Drive 資料夾，補登記舊檔案嗎？\n（依檔案數量可能要一點時間，過程中請不要關閉頁面）')) return;
  showUploadFloat();
  let totalAdded = 0;
  const failedNames = [];
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];
    const s = studentsCache[token];
    const name = s ? s.name : token;
    setUploadStatus('🔄 同步中 (' + (i + 1) + '/' + tokens.length + ')：' + name + '…');
    try {
      totalAdded += await syncDriveFilesForStudent(token);
    } catch (e) {
      failedNames.push(name + '（' + (e.message || e) + '）');
    }
  }
  hideUploadFloat();
  let msg = '✅ 同步完成，共補登記 ' + totalAdded + ' 個檔案';
  if (failedNames.length) msg += '\n\n⚠️ 以下學生同步失敗：\n' + failedNames.join('\n');
  alert(msg);
}
