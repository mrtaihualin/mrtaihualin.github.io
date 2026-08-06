// ============================================================
// FILE MAP: personalized material URLs → lesson progress → student schedule sheet → recurring-time summaries
// 教材連結（老師貼連結 → 存進 classroom_recordings → 學生「課堂資料下載」自動出現）
// 如果是自己網站的頁面（mrtaihualin.com／mrtaihualin.github.io）→ 自動加上
// ?s=token&n=學生姓名（base64），讓 拼音規則上課用.html 那類頁面知道「這是哪位學生」
// 才會顯示「☁️ 存入 Google Drive」按鈕（只有自己網站的頁面才加，外部連結不動）
// ============================================================
function personalizeMaterialUrl(url, token, teacherPreview) {
  try {
    const u = new URL(url);
    const isOwnSite = /(^|\.)mrtaihualin\.com$/i.test(u.hostname) || /(^|\.)mrtaihualin\.github\.io$/i.test(u.hostname);
    if (!isOwnSite) return url;
    const s = studentsCache[token];
    if (!s) return url;
    u.searchParams.set('s', token);
    u.searchParams.set('n', btoa(encodeURIComponent(s.name)));
    // tp = teacher only：ติดเฉพาะตอนครูกดปุ่ม "🔗 開啟" ในลิสต์教材ของครู (loadMaterialLinks)
    // ลิงก์ที่บันทึกให้นักเรียน (saveMaterialLink) ไม่มี tp → นักเรียนจะไม่เห็นปุ่ม 存入 Google Drive
    // → ปุ่มเซฟลงไดฟ์โผล่เฉพาะตอนครูเปิดจากหน้า Dashboard เท่านั้น
    if (teacherPreview) u.searchParams.set('tp', '1');
    return u.toString();
  } catch (e) { return url; }
}

async function saveMaterialLink(token) {
  const t = token.replace(/'/g, '');
  const labelEl = document.getElementById('matLabel-' + t);
  const urlEl = document.getElementById('matUrl-' + t);
  const label = (labelEl && labelEl.value || '').trim();
  const url = (urlEl && urlEl.value || '').trim();
  if (!label) { alert('請輸入教材名稱'); return; }
  if (!/^https:\/\//i.test(url)) { alert('請貼上正確的連結（需以 https:// 開頭）'); return; }
  const finalUrl = personalizeMaterialUrl(url, token);
  // 2026-07-17 修（RELIABILITY FIRST）：以前不管存有沒有成功，都清空欄位+當作存好了——
  // 如果存失敗（例如 RLS 擋掉），老師看到欄位清空以為存好了，其實教材連結沒有真的存進去。
  const err = await saveRecordingLink(token, '教材_' + label, null, finalUrl, '', null);
  if (err) { alert('❌ 儲存教材連結失敗：' + err.message + '\n（還沒存進去，請再試一次，欄位內容保留）'); return; }
  if (labelEl) labelEl.value = '';
  if (urlEl) urlEl.value = '';
  loadMaterialLinks(token);
}

// 上課進度筆記（教師專用）— 存在 classroom_students.lesson_progress，學生頁面不會顯示
async function saveLessonProgress(token) {
  const t = token.replace(/'/g, '');
  const ta = document.getElementById('progress-' + t);
  const statusEl = document.getElementById('progressStatus-' + t);
  if (!ta) return;
  const val = ta.value;
  if (statusEl) statusEl.textContent = '儲存中…';
  const res = await sb.from('classroom_students').update({ lesson_progress: val }).eq('token', t).select();
  if (res.error || !res.data || !res.data.length) {
    if (statusEl) statusEl.textContent = '❌ 儲存失敗：' + (res.error ? res.error.message : '資料庫沒有真的更新到（可能是 RLS 權限問題）');
    return;
  }
  if (studentsCache[t]) studentsCache[t].lesson_progress = val;
  if (statusEl) {
    statusEl.textContent = '✅ 已儲存';
    setTimeout(function() { if (statusEl) statusEl.textContent = ''; }, 2500);
  }
}

async function loadMaterialLinks(token) {
  const t = token.replace(/'/g, '');
  const el = document.getElementById('matList-' + t);
  if (!el) return;
  el.innerHTML = '<div style="font-size:0.78rem;color:var(--ink-muted);">載入中…</div>';
  try {
    const { data, error } = await sb.rpc('get_student_recordings', { p_token: token });
    const items = (error || !data) ? [] : data.filter(function(r) { return (r.name || '').indexOf('教材_') === 0; });
    if (!items.length) { el.innerHTML = '<div style="font-size:0.78rem;color:var(--ink-muted);">尚未儲存教材連結</div>'; return; }
    el.innerHTML = items.map(function(r) {
      const label = (r.name || '').replace(/^教材_/, '');
      const safeUrl = escAttrJs(r.url || '');
      return '<div style="display:flex;align-items:center;gap:6px;padding:5px 0;border-bottom:1px solid rgba(0,0,0,0.06);font-family:\'Noto Sans TC\',sans-serif;font-size:0.8rem;">' +
        '<span style="flex:1;">📚 ' + escHtml(label) + '</span>' +
        '<a href="' + escHtml(safeHref(personalizeMaterialUrl(r.url, token, true))) + '" target="_blank" rel="noopener" style="color:var(--gold-deep);font-weight:700;text-decoration:none;">🔗 開啟</a>' +
        '<button onclick="deleteMaterialLink(\'' + t + '\',\'' + safeUrl + '\')" style="background:none;border:none;cursor:pointer;font-size:0.85rem;opacity:0.5;">🗑</button>' +
      '</div>';
    }).join('');
  } catch (e) {
    el.innerHTML = '<div style="font-size:0.78rem;color:var(--ink-muted);">載入失敗</div>';
  }
}

async function deleteMaterialLink(token, url) {
  if (!confirm('確定要移除這個教材連結嗎？（不會刪掉原本的網頁，只是從清單移除）')) return;
  // 2026-07-17 修（RELIABILITY FIRST）：以前用 try/catch 包 rpc，但 supabase-js 的 rpc()
  // 失敗時是回傳 { error }，不是 throw，所以這個 catch 根本接不到——刪除失敗也完全看不出來，
  // 連結會在重新整理後「自己跑回來」，老師搞不懂為什麼刪不掉。改成直接檢查 error 並提示。
  const { error } = await sb.rpc('delete_student_recording', { p_token: token, p_url: url });
  if (error) alert('❌ 移除失敗：' + error.message + '\n（連結可能還在，請再試一次）');
  loadMaterialLinks(token);
}

// 新生：建立一份空白「上課時刻表」Google Sheet（範本 課次/日期/次數）→ 分享 + 記錄，學生頁可見
async function createBlankTimetable(name, token, folderId) {
  if (!folderId) folderId = await gdGetStudentSubfolderId(name, '課表 & 收據');
  var csv = name + ' 上課時刻表\n學費：\n本輪起算：\n\n課次,日期,次數\n,,\n,,\n,,\n,,\n,,';
  var blob = new Blob(['\ufeff' + csv], { type: 'text/csv' });
  var fname = name + ' 上課時刻表';
  var doc = await gdUploadSmall(blob, fname, 'application/vnd.google-apps.spreadsheet', folderId);
  if (!doc || !doc.id) return null;
  try { await gdShareAnyone(doc.id); } catch (e) {}
  var link = doc.webViewLink || ('https://docs.google.com/spreadsheets/d/' + doc.id + '/edit');
  try { await saveRecordingLink(token, fname, doc.id, link, '', null); } catch (e) {}
  return { id: doc.id, link: link };
}

async function refreshStudentList() {
  const el = document.getElementById('studentListContainer');
  if (!el) return;
  el.innerHTML = '<div class="empty-state">載入中…</div>';
  await fetchStudents();
  await loadRosterScheduleMeta(); // 2026-08-02 加：สารบัญ副標題要顯示上課時間，一次抓全部學生的固定上課日
  el.innerHTML = renderStudentListHTML();
  refreshAllRosterMeta(); // 補上「之前已經算好」的 badge/剩餘堂數資料（例如切換頁籤回來重畫清單時）
}

// 2026-08-02 加：一次抓「全部學生」的每週固定上課日，給สารบัญ的副標題用（週X HH:MM）。
//   只抓一次、不分學生查，避免每個學生各自查一次（見 CLAUDE.md「檢查再做，不要重複查」）。
//   同一個學生如果排多天，只取抓到的第一筆當簡短顯示，不影響「⚙️ 每週固定上課日」設定本身的完整資料。
// 2026-08-02 修 bug（Lin 指出）：原本只查 classroom_recurring_days（那是「加課堂時間」功能加的補充課表），
//   完全沒讀 classroom_students.pending_class_time/pending_recurring/pending_start_date（新生設定時填的
//   「原本的固定課」，真正的主要來源）——導致大部分還沒按過「⚙️ 每週固定上課日」的學生完全不顯示時間，
//   即使資料庫裡其實有。這兩個來源不是互相取代的關係、是「原本的固定課」+「後來額外加的」並存
//   （同樣的並存邏輯可以對照 renderAddClassDayExistingList() 那邊兩份資料一起列出來的寫法，行號約 2149）。
//   pending_* 不用另外查表：refreshStudentList() 一定會先呼叫 fetchStudents()（select('*')）把它整包
//   存進 studentsCache 了，這裡直接讀快取即可，全部人只需要 1 個 query（classroom_recurring_days）。
async function loadRosterScheduleMeta() {
  try {
    var dayZh = ['日','一','二','三','四','五','六'];
    var byTok = {};

    // 來源 1（主表，優先顯示）：studentsCache 裡的 pending_* —— 不用查資料庫，fetchStudents() 已經抓好了
    Object.keys(studentsCache).forEach(function(token) {
      var s = studentsCache[token];
      if (s && s.pending_recurring && s.pending_start_date && s.pending_class_time) {
        var wd = thaiDateWeekday(s.pending_start_date);
        var t = String(s.pending_class_time).slice(0, 5);
        byTok[token] = '週' + dayZh[wd] + (t ? ' ' + t : '');
      }
    });

    // 來源 2（補充表）：classroom_recurring_days —— 只補「來源 1 沒有」的學生
    var rd = (await sb.from('classroom_recurring_days').select('token,weekday,start_time').order('weekday').order('start_time')).data || [];
    rd.forEach(function(r) {
      if (byTok[r.token] || !r.token) return;
      var t = (r.start_time || '').slice(0, 5);
      byTok[r.token] = '週' + dayZh[r.weekday] + (t ? ' ' + t : '');
    });

    window._rosterScheduleByToken = byTok;
  } catch (e) { console.warn('讀取固定上課日失敗（不影響其他功能，只是สารบัญ副標題會少顯示上課時間）：', e && (e.message || e)); }
}
