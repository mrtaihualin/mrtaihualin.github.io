// ============================================================
// GOOGLE DRIVE 自動上傳（課堂錄影 → 各學生資料夾）
// drive.file scope：App 只看得到自己建立的檔案/資料夾
// ============================================================
const GOOGLE_CLIENT_ID = '912926837729-j8n8mojmrmngpha68pbasv9qslvgtvrn.apps.googleusercontent.com';
// 2026-07-05 加入 documents scope：課堂筆記要用 Docs API 做「橫向頁面 + 頁首頁尾浮水印」
// （drive.file 只能整份覆蓋內容，做不到頁首頁尾／橫向；documents scope 才能精準改版面）
// 第一次會多跳一次 Google 同意畫面（多一項權限），之後照舊不用再按
// 2026-07-08 calendar.readonly → calendar.events：改成可讀寫，才能用 Calendar API 自動建立
// 「新增學生／入班連結」時的 Google Meet 連結（不用老師手動貼），calendar.events 本身也涵蓋讀取，
// 所以 calFetchUpcomingEvents() 讀近期課表不受影響
// 2026-07-15 加 calendar.freebusy：官方文件證實 freeBusy.query 需要 calendar.readonly／calendar／
// calendar.freebusy／calendar.events.freebusy 其中一個 scope，calendar.events 不夠用
// （https://developers.google.com/workspace/calendar/api/v3/reference/freebusy/query）
// 「➕ 加課堂時間」按「檢查是否衝突」才會 403 insufficient authentication scopes
const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/calendar.freebusy https://www.googleapis.com/auth/documents';
const DRIVE_ROOT_FOLDER = 'mrtaihualin 課堂錄影';
let gdToken = null, gdTokenExp = 0, gdTokenClient = null, gdTokenScopes = '';

function gdInit() {
  if (gdTokenClient) return true;
  if (!(window.google && google.accounts && google.accounts.oauth2)) return false;
  gdTokenClient = google.accounts.oauth2.initTokenClient({
    client_id: GOOGLE_CLIENT_ID, scope: DRIVE_SCOPE, callback: () => {}
  });
  return true;
}
function gdGetToken(forceConsent) {
  return new Promise((resolve, reject) => {
    if (!gdInit()) { reject(new Error('Google 登入元件尚未載入，請稍候再試')); return; }
    if (!forceConsent && gdToken && Date.now() < gdTokenExp - 60000) { resolve(gdToken); return; }
    // timeout 6 วินาที → ถ้าไม่มี user gesture popup ถูกบล็อก → reject เพื่อ release lock
    const timer = setTimeout(() => reject(new Error('timeout')), 6000);
    gdTokenClient.callback = (resp) => {
      clearTimeout(timer);
      if (resp.error) { reject(new Error('Google 授權失敗：' + resp.error)); return; }
      gdToken = resp.access_token;
      gdTokenScopes = resp.scope || '';
      gdTokenExp = Date.now() + (resp.expires_in || 3600) * 1000;
      localStorage.setItem('gdConnected', '1');
      // auto-refresh ทุก 50 นาที ไม่ต้องกดซ้ำ
      if (!window._gdRefreshTimer) {
        window._gdRefreshTimer = setInterval(function() {
          gdTokenClient.requestAccessToken({ prompt: '', hint: 'mr.taihualin@gmail.com' });
        }, 50 * 60 * 1000);
      }
      resolve(gdToken);
    };
    // prompt '' = หลังกดอนุญาตครั้งแรกแล้ว Google จะจำไว้ ไม่เด้งจอขออนุญาตซ้ำ (ดึง token เงียบๆ)
    // forceConsent = true → บังคับเด้งจอขออนุญาตใหม่ (ใช้ตอน token จำสิทธิ์เก่าที่ยังไม่มี Calendar)
    gdTokenClient.requestAccessToken({ prompt: forceConsent ? 'consent' : '', hint: 'mr.taihualin@gmail.com' });
  });
}
// 2026-07-08：在「使用者剛點擊」的當下就把 Google 授權（含 calendar.events / drive.file / documents 三個 scope）
// 一次補齊，避免之後在 async 深處才 forceConsent 時彈窗被瀏覽器當成「非使用者操作」而封鎖。
// 這是「確認收款卻卡住」的根本原因之一（舊 token 只有 calendar.readonly）。
async function ensureGoogleReady() {
  await gdGetToken(); // 先取一次（靜默或首次同意）
  var sc = gdTokenScopes || '';
  // 2026-07-15 加過 freebusy 檢查又移除：這個函式是「確認收款」「補課堂連結」共用的，
  // 兩個都不會呼叫 freeBusy.query，不需要 freebusy scope。當時誤把 freebusy 加進這裡的
  // 通用檢查，結果每個「舊 token（今天以前授權過、本來就沒有 freebusy 也不需要）」的老師
  // 一按「確認收款」就會被逼著跳出強制重新同意（forceConsent）的彈窗——這種彈窗因為隔著
  // 好幾個 await 才觸發，很容易被瀏覽器當成「非使用者操作」直接擋掉或彈窗卡住 6 秒逾時，
  // 造成「收據產生失敗」（Lin 回報：昨天還正常，今天壞掉）。
  // freebusy 真正需要的地方（checkFreebusyConflict()，「檢查是否衝突」功能）已經有自己
  // 專屬的 freebusy 補權限判斷（見下面），不需要也不該讓這裡的通用檢查重複逼一次。
  var missing = !sc || sc.indexOf('calendar') === -1 || sc.indexOf('drive') === -1 || sc.indexOf('documents') === -1;
  if (missing) { await gdGetToken(true); } // 缺 scope（含舊 token 不知道 scope 的情況）→ 趁點擊手勢還在，強制補權限
  return true;
}
async function gdApi(path, opts) {
  const token = await gdGetToken();
  const headers = Object.assign({ Authorization: 'Bearer ' + token }, (opts && opts.headers) || {});
  const r = await fetch('https://www.googleapis.com/' + path, Object.assign({}, opts, { headers }));
  if (!r.ok) throw new Error('Drive API ' + r.status + '：' + (await r.text()).slice(0, 200));
  return r.json();
}

// ============================================================
// Google Docs API（做 drive.file 做不到的事：橫向頁面／頁首頁尾浮水印）
// 2026-07-05 新增，配合「課堂筆記」新格式（Lin 要求）
// ============================================================
async function gdDocsApi(path, opts) {
  let token = await gdGetToken();
  // 舊的授權沒有 documents scope（第一次加這功能時）→ 跳一次同意畫面補權限
  if (gdTokenScopes && gdTokenScopes.indexOf('documents') === -1) {
    token = await gdGetToken(true);
  }
  const headers = Object.assign({ Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, (opts && opts.headers) || {});
  const r = await fetch('https://docs.googleapis.com/v1/' + path, Object.assign({}, opts, { headers }));
  if (!r.ok) throw new Error('Docs API ' + r.status + '：' + (await r.text()).slice(0, 300));
  return r.json();
}

const NOTE_WATERMARK = '泰華老師課堂筆記 · mrtaihualin.com';

function noteWatermarkRequests(segmentId) {
  const len = NOTE_WATERMARK.length;
  return [
    { insertText: { location: { segmentId: segmentId, index: 0 }, text: NOTE_WATERMARK } },
    { updateParagraphStyle: {
        range: { segmentId: segmentId, startIndex: 0, endIndex: len },
        paragraphStyle: { alignment: 'CENTER' }, fields: 'alignment'
    } },
    { updateTextStyle: {
        range: { segmentId: segmentId, startIndex: 0, endIndex: len },
        textStyle: {
          fontSize: { magnitude: 9, unit: 'PT' },
          foregroundColor: { color: { rgbColor: { red: 0.6, green: 0.6, blue: 0.6 } } },
          italic: true
        },
        fields: 'fontSize,foregroundColor,italic'
    } }
  ];
}

// 套用「橫向頁面 + 頁首頁尾浮水印」到指定的 Google 文件（可重複呼叫、不會重複寫入）
// 做法：先讀目前文件狀態，缺什麼才補什麼 → 不會跟已存在的頭尾衝突（400），也不會浮水印重複疊字
// ⚠️ 每次「課堂筆記」內容用 Drive 覆蓋上傳後，頭尾／橫向設定可能會被整份覆蓋掉，
//    所以 persistNote() 每次存檔後都會重新呼叫這裡一次，確保頭尾一直都在
async function applyNoteDocFormat(docId) {
  const doc = await gdDocsApi('documents/' + docId + '?fields=documentStyle(flipPageOrientation,defaultHeaderId,defaultFooterId)', { method: 'GET' });
  const ds = doc.documentStyle || {};
  const requests = [];
  if (!ds.flipPageOrientation) {
    requests.push({ updateDocumentStyle: { documentStyle: { flipPageOrientation: true }, fields: 'flipPageOrientation' } });
  }
  const needHeader = !ds.defaultHeaderId;
  const needFooter = !ds.defaultFooterId;
  if (needHeader) requests.push({ createHeader: { type: 'DEFAULT' } });
  if (needFooter) requests.push({ createFooter: { type: 'DEFAULT' } });

  let headerId = ds.defaultHeaderId, footerId = ds.defaultFooterId;
  if (requests.length) {
    const res = await gdDocsApi('documents/' + docId + ':batchUpdate', { method: 'POST', body: JSON.stringify({ requests }) });
    (res.replies || []).forEach(function(r) {
      if (r.createHeader) headerId = r.createHeader.headerId;
      if (r.createFooter) footerId = r.createFooter.footerId;
    });
  }

  const wmRequests = [];
  if (needHeader && headerId) wmRequests.push.apply(wmRequests, noteWatermarkRequests(headerId));
  if (needFooter && footerId) wmRequests.push.apply(wmRequests, noteWatermarkRequests(footerId));
  if (wmRequests.length) {
    await gdDocsApi('documents/' + docId + ':batchUpdate', { method: 'POST', body: JSON.stringify({ requests: wmRequests }) });
  }
}

async function gdFindFolder(name, parentId) {
  let q = "mimeType='application/vnd.google-apps.folder' and trashed=false and name='" + name.replace(/'/g, "\\'") + "'";
  if (parentId) q += " and '" + parentId + "' in parents";
  const res = await gdApi('drive/v3/files?spaces=drive&fields=files(id)&q=' + encodeURIComponent(q), { method: 'GET' });
  return res.files && res.files[0] ? res.files[0].id : null;
}
// 2026-07-08 修 bug：Google Drive 搜尋 API 剛建立完資料夾後，短時間內搜尋不到（eventual consistency），
// 連續呼叫好幾次 gdEnsureFolder(同一個 parent+name) 會誤判「找不到」而重複建立好幾個同名資料夾，
// 導致「學習內容」「影片」「課表 & 收據」分散建在不同的重複資料夾裡，看起來像「檔案沒建完整」。
// 用一個 session 內的快取記住已經找到/建立過的資料夾 id，同一個 parent+name 不會再重找一次。
let _gdFolderCache = {};
async function gdEnsureFolder(name, parentId) {
  const cacheKey = (parentId || 'root') + '::' + name;
  if (_gdFolderCache[cacheKey]) return _gdFolderCache[cacheKey];
  const found = await gdFindFolder(name, parentId);
  if (found) { _gdFolderCache[cacheKey] = found; return found; }
  const body = { name, mimeType: 'application/vnd.google-apps.folder' };
  if (parentId) body.parents = [parentId];
  const res = await gdApi('drive/v3/files?fields=id', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
  });
  _gdFolderCache[cacheKey] = res.id;
  return res.id;
}
// 改資料夾「名字」屬性，folder id 不變 → 裡面舊檔案原封不動（改學生姓名時用這個，絕對不能改成「新建資料夾」）
async function gdRenameFolder(folderId, newName) {
  return await gdApi('drive/v3/files/' + folderId + '?fields=id,name', {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: newName })
  });
}
async function gdUpload(blob, name, parentId, onProgress) {
  const token = await gdGetToken();
  const mime = blob.type || 'application/octet-stream';
  const CHUNK = 1 * 1024 * 1024; // 1 MB chunks
  // Step 1: start resumable session (small JSON body, fetch is fine here)
  const init = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&fields=id,webViewLink', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + token,
      'Content-Type': 'application/json; charset=UTF-8',
      'X-Upload-Content-Type': mime,
      'X-Upload-Content-Length': blob.size
    },
    body: JSON.stringify({ name, parents: [parentId] })
  });
  if (!init.ok) throw new Error('上傳啟動失敗 ' + init.status);
  const session = init.headers.get('Location');
  if (!session) throw new Error('取不到上傳工作階段');
  if (onProgress) onProgress(0);
  // Step 2: upload chunks via XHR — fetch() with Blob body fails on iOS Safari (WebKit bug)
  function xhrPut(url, chunk, contentType, contentRange) {
    return new Promise(function(resolve, reject) {
      var xhr = new XMLHttpRequest();
      xhr.open('PUT', url, true);
      xhr.setRequestHeader('Content-Type', contentType);
      xhr.setRequestHeader('Content-Range', contentRange);
      xhr.onload = function() { resolve({ status: xhr.status, body: xhr.responseText, headers: xhr.getAllResponseHeaders() }); };
      xhr.onerror = function() { reject(new Error('網路錯誤，請確認連線後重試')); };
      xhr.ontimeout = function() { reject(new Error('上傳逾時，請重試')); };
      xhr.timeout = 120000; // 2 min per chunk
      xhr.send(chunk);
    });
  }
  let start = 0, result = null;
  while (start < blob.size) {
    const end = Math.min(start + CHUNK, blob.size);
    const chunk = blob.slice(start, end);
    const range = 'bytes ' + start + '-' + (end - 1) + '/' + blob.size;
    const res = await xhrPut(session, chunk, mime, range);
    if (res.status === 200 || res.status === 201) {
      result = JSON.parse(res.body); break;
    } else if (res.status === 308) {
      const m = (res.headers.match(/range:\s*bytes=0-(\d+)/i));
      start = m ? parseInt(m[1]) + 1 : end;
      if (onProgress) onProgress(Math.round(start / blob.size * 100));
    } else {
      throw new Error('上傳失敗 ' + res.status);
    }
  }
  if (!result) throw new Error('上傳未完成');
  return result;
}
async function gdShareAnyone(fileId) {
  await gdApi('drive/v3/files/' + fileId + '/permissions', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ role: 'reader', type: 'anyone' })
  });
}
