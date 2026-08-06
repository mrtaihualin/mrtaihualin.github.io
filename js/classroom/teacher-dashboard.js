// ============================================================
// FILE MAP: student links/recording → roster/filtering → archive/delete/Drive → selection/requests → notes
// TEACHER ACTIONS
// ============================================================
function buildStudentUrl(token) {
  const s = studentsCache[token];
  if (!s) return null;
  // 2026-07-11：老師有填「自訂入班連結」的話，一律優先用這個，取代系統自動產生的連結
  if (s.custom_entry_link) return s.custom_entry_link;
  const baseUrl = window.location.origin + window.location.pathname;
  // 還沒確認收款、meet 是空的（入班前狀態）→ 連結只帶 token 就好，
  // 學生頁面本來就會即時去資料庫抓最新狀態，不用凍結 name/meet 在網址裡
  if (!s.meet) return baseUrl + '?s=' + token;
  return baseUrl + '?s=' + token + '&n=' + btoa(encodeURIComponent(s.name)) + '&m=' + btoa(encodeURIComponent(s.meet));
}

function copyStudentLink(token, btnId) {
  const link = buildStudentUrl(token);
  if (!link) return;
  navigator.clipboard.writeText(link).then(() => {
    const btn = document.getElementById(btnId);
    if (!btn) return;
    const orig = btn.innerHTML;
    btn.innerHTML = '✅ 已複製'; btn.classList.add('copied');
    setTimeout(() => { btn.innerHTML = orig; btn.classList.remove('copied'); }, 2000);
  });
}

function previewStudent(token) {
  const link = buildStudentUrl(token);
  if (link) window.open(link, '_blank');
}

// ============================================================
// RENDER
// ============================================================
// 錄音控制面板（無大標題；按「進入課堂」後才顯示，含停止鈕／狀態／上傳結果）
function recordingHTML() {
  return '<div class="card" id="recCard" style="margin-top:16px;display:none;">' +
    '<div class="rec-card-gold">' +
      '<div class="rec-card-header">' +
        '<span class="rec-card-icon">⏺</span>' +
        '<span class="rec-card-title" id="recCardTitle" style="font-weight:700;font-family:\'Noto Sans TC\',sans-serif;font-size:0.95rem;color:var(--ink-soft);">課堂錄影</span>' +
        '<span class="timer" id="recTimer"></span>' +
      '</div>' +
      '<p class="rec-hint" style="color:var(--ink-muted);font-size:0.78rem;margin:6px 0;">跳出視窗請選「<b>整個畫面</b>」並勾「<b>分享系統音訊</b>」才錄得到畫面＋師生雙聲。停止後自動上傳到該學生 Drive。</p>' +
      '<div style="display:flex;gap:8px;">' +
        '<button class="btn-rec-stop" id="recStopBtn" onclick="stopRecording()" disabled>⏹ 停止錄影</button>' +
      '</div>' +
      '<div class="status" id="recStatus"></div>' +
      '<div class="audio-section" id="recOutSection">' +
        '<audio id="recAudioPlayer" controls style="display:none;width:100%;"></audio>' +
        '<video id="recVideoPlayer" controls playsinline style="display:none;width:100%;"></video>' +
        '<div id="recDownloads"></div>' +
      '</div>' +
      '<div style="margin-top:8px;">' +
        '<button type="button" onclick="recToggleIssuesPanel()" style="background:none;border:none;color:var(--ink-muted);font-size:0.78rem;text-decoration:underline;cursor:pointer;padding:0;">🔧 查看最近的錄影問題紀錄</button>' +
        '<div id="recIssuesPanel" style="display:none;margin-top:8px;max-height:260px;overflow:auto;background:#fff8ec;border:1px solid #e9dcb8;border-radius:8px;padding:8px 10px;font-size:0.78rem;"></div>' +
      '</div>' +
    '</div>' +
  '</div>';
}

// ── 錄影問題紀錄面板：從 classroom_recording_issues 撈最近 20 筆給老師自己查 ──
let recIssuesPanelOpen=false;
async function recToggleIssuesPanel(){
  const panel=document.getElementById('recIssuesPanel'); if(!panel) return;
  recIssuesPanelOpen=!recIssuesPanelOpen;
  panel.style.display=recIssuesPanelOpen?'block':'none';
  if(!recIssuesPanelOpen) return;
  panel.innerHTML='讀取中…';
  try{
    const { data, error } = await sb.from('classroom_recording_issues').select('*').order('created_at',{ascending:false}).limit(20);
    if(error){ panel.innerHTML='讀取失敗：'+escHtml(error.message)+'（可能是還沒建立 classroom_recording_issues 這張表，請照說明先建立）'; return; }
    if(!data || !data.length){ panel.innerHTML='目前沒有任何紀錄（表示最近錄影都很順利 👍）'; return; }
    const typeLabel={ encoding_error_fallback:'⚠️ 格式失敗已自動切換', encoding_error_fatal:'❌ 格式全部失敗', zero_bytes:'❌ 0 位元組', stall:'⚠️ 疑似卡住', upload_fail:'⚠️ 上傳失敗' };
    panel.innerHTML=data.map(function(r){
      const name=(typeof studentsCache!=='undefined' && r.token && studentsCache[r.token]) ? studentsCache[r.token].name : (r.token||'（未綁定學生）');
      return '<div style="padding:6px 0;border-bottom:1px solid #e9dcb8;">'
        +'<b>'+escHtml(typeLabel[r.event_type]||r.event_type)+'</b>　'
        +escHtml(new Date(r.created_at).toLocaleString('zh-TW'))+'　'
        +escHtml(name)
        +'<br>'+escHtml(r.detail||'')
        +(r.mime?'　<span style="color:var(--ink-muted);">格式：'+escHtml(r.mime)+'</span>':'')
        +'</div>';
    }).join('');
  }catch(e){ panel.innerHTML='讀取失敗：'+escHtml(e.message||String(e)); }
}

const meetSVG = '<svg viewBox="0 0 24 24" fill="none"><path d="M4 6C4 4.9 4.9 4 6 4H14L20 10V18C20 19.1 19.1 20 18 20H6C4.9 20 4 19.1 4 18V6Z" fill="#34A853" opacity="0.25"/><path d="M14 4L20 10H14V4Z" fill="#34A853" opacity="0.5"/><circle cx="12" cy="14" r="3.5" fill="#fff"/><path d="M17 11.5L20 9.5V18.5L17 16.5V11.5Z" fill="#fff"/></svg>';

// ── Text colors / highlight presets ────────────────────────────
const TEXT_COLORS  = ['#1C1C1C','#b45309','#15803d','#1d4ed8','#7c3aed','#be185d','#dc2626'];
const HL_COLORS    = ['#fef08a','#bbf7d0','#bfdbfe','#f5d0fe','#fed7aa','#fecaca','transparent'];

// 2026-07-14 加：已封存（archived_at 有值）的學生不列進「選擇學生」清單裡 —
//   要看/恢復舊生要點下面的「📦 舊生列表」才會展開
// 2026-08-02（รอบ 4）改（Lin 要求）：原生 <select> 是瀏覽器/作業系統自己畫的，塞不進顏色 badge、
//   也沒辦法把「姓名/時間靠左、狀態 badge 靠右」這種排版做出來——改成自己刻的「假 dropdown」：
//   上面一顆 .roster-trigger 按鈕（顯示目前選到的學生），點下去打開 .roster-panel 面板，
//   裡面沿用 .roster-item 卡片版型（見上面 CSS，取消清單版時就做好了，這次直接重用）。
//   選了哪一位一樣呼叫 selectStudent(token)，邏輯完全沒變。
function renderStudentListHTML() {
  const allEntries = Object.entries(studentsCache);
  if (allEntries.length === 0) return '<div class="empty-state">尚未新增學生<br>點擊下方按鈕新增第一位學生</div>';

  const entries = allEntries.filter(function(e) { return !e[1].archived_at; });
  const archived = allEntries.filter(function(e) { return e[1].archived_at; });

  const rows = entries.map(function(entry) {
    const token = entry[0], s = entry[1];
    const t = token.replace(/'/g, '');
    const initial = s.name ? s.name.charAt(0) : '?';
    return '<div class="roster-item" id="rosterItem-' + escHtml(t) + '" data-roster-token="' + escHtml(token) + '" onclick="pickRosterItem(\'' + t + '\')">' +
      '<div class="roster-avatar">' + escHtml(initial) + '</div>' +
      '<div class="roster-info">' +
        '<div class="roster-name">' + escHtml(s.name) + '</div>' +
        '<div class="roster-sub" id="rosterSub-' + escHtml(t) + '">' + escHtml(rosterSubText(token)) + '</div>' +
      '</div>' +
      '<div id="rosterBadge-' + escHtml(t) + '">' + renderRosterBadgeHtml(token) + '</div>' +
    '</div>';
  }).join('');

  ensureRosterOutsideClickHandler();

  return '<div class="roster-dropdown" id="rosterDropdown">' +
    '<button type="button" class="roster-trigger" id="rosterTrigger" onclick="toggleRosterDropdown(event)">' +
      '<span id="rosterTriggerText">— 選擇學生 —</span><span class="roster-trigger-arrow">▼</span>' +
    '</button>' +
    '<div class="roster-panel" id="rosterDropdownPanel">' +
      '<div class="roster-list">' + (rows || '<div class="empty-state" style="padding:16px;">目前沒有在學學生</div>') + '</div>' +
    '</div>' +
  '</div>' +
  '<div class="stu-panel" id="stuPanel"></div>' +
  '<div style="margin-top:14px;text-align:right;">' +
    '<button class="btn-sm" style="background:none;border:1px solid var(--border);color:var(--ink-muted);" onclick="toggleArchivedStudents()" id="archivedToggleBtn">📦 舊生列表（' + archived.length + '）</button>' +
  '</div>' +
  '<div id="archivedStudentsPanel" style="display:none;margin-top:8px;"></div>';
}

// 2026-08-02（รอบ 4）加：假 dropdown 的開關邏輯 —— 面板用 position:absolute 掛在
// .roster-dropdown（position:relative）底下展開，不用 position:fixed（違反規則，見 CLAUDE.md）。
function openRosterDropdown() {
  var panel = document.getElementById('rosterDropdownPanel');
  var trigger = document.getElementById('rosterTrigger');
  if (!panel) return;
  panel.classList.add('open');
  if (trigger) trigger.classList.add('open');
}
function closeRosterDropdown() {
  var panel = document.getElementById('rosterDropdownPanel');
  var trigger = document.getElementById('rosterTrigger');
  if (!panel) return;
  panel.classList.remove('open');
  if (trigger) trigger.classList.remove('open');
}
function toggleRosterDropdown(e) {
  if (e) e.stopPropagation();
  var panel = document.getElementById('rosterDropdownPanel');
  if (!panel) return;
  if (panel.classList.contains('open')) closeRosterDropdown(); else openRosterDropdown();
}
// 點某一行 → 收起面板，照舊呼叫 selectStudent(token)（trigger 文字換成誰的邏輯統一寫在
// selectStudent() 裡面，這樣不管從哪裡呼叫 selectStudent 都會同步更新，不會漏掉）。
function pickRosterItem(token) {
  closeRosterDropdown();
  selectStudent(token);
}
// 點面板以外的地方要自動收起來 —— 監聽器只綁一次（用 _rosterOutsideClickBound 擋重複綁），
// 因為 renderStudentListHTML() 每次重畫清單都會呼叫，不擋的話切分頁/重整清單幾次就會疊加好幾個監聽器。
var _rosterOutsideClickBound = false;
function ensureRosterOutsideClickHandler() {
  if (_rosterOutsideClickBound) return;
  _rosterOutsideClickBound = true;
  document.addEventListener('click', function(e) {
    var dropdown = document.getElementById('rosterDropdown');
    if (!dropdown) return;
    if (!dropdown.contains(e.target)) closeRosterDropdown();
  });
}

// 2026-08-02 加：สารบัญ副標題文字（上課時間 + 剩餘堂數），quota 資料還沒載入時只顯示上課時間。
function rosterSubText(token) {
  var sched = (window._rosterScheduleByToken && window._rosterScheduleByToken[token]) || '';
  var q = (window._rosterQuotaByToken && window._rosterQuotaByToken[token]) || null;
  var quotaText = (q && q.hasCourse) ? ('剩 ' + (q.remain < 0 ? 0 : q.remain) + ' 堂') : '';
  if (sched && quotaText) return sched + '　·　' + quotaText;
  return sched || quotaText || '尚未排課';
}

// 2026-08-02 加：算這位學生右邊的狀態 badge——優先順序（Lin 指定）：
//   有申請（取消 > 改期 > 加課）> 課程快上完（≤1堂）> 正常。一人只顯示一個 badge。
function computeRosterBadge(token) {
  var reqs = (window._pendingRequestsByToken && window._pendingRequestsByToken[token]) || [];
  if (reqs.length) {
    var hasCancel = reqs.some(function(r) { return r.type === 'cancel'; });
    var hasReschedule = reqs.some(function(r) { return r.type === 'reschedule'; });
    if (hasCancel) return { cls: 'roster-badge-cancel', icon: '❌', label: '取消申請' };
    if (hasReschedule) return { cls: 'roster-badge-reschedule', icon: '🔄', label: '改期申請' };
    return { cls: 'roster-badge-add', icon: '➕', label: '加課申請' };
  }
  var q = (window._rosterQuotaByToken && window._rosterQuotaByToken[token]) || null;
  if (q && q.hasCourse && q.remain <= 1) {
    return { cls: 'roster-badge-lowquota', icon: '⏰', label: '剩' + (q.remain < 0 ? 0 : q.remain) + '堂' };
  }
  return { cls: 'roster-badge-normal', icon: '', label: '正常' };
}
function renderRosterBadgeHtml(token) {
  var b = computeRosterBadge(token);
  return '<span class="roster-badge ' + b.cls + '">' + (b.icon ? b.icon + ' ' : '') + escHtml(b.label) + '</span>';
}
// 2026-08-02（รอบ 4）改：改回假 dropdown 之後不用再把狀態塞成一行純文字了（那是原生
//   <select><option> 不能塞顏色 badge 時的權宜做法）——現在面板裡每一行本來就是真的 HTML，
//   直接補畫 .roster-sub（上課時間＋剩餘堂數）和 .roster-badge（彩色狀態徽章）兩個小區塊就好，
//   不用整個重畫面板，這樣老師正打開的學生詳細卡片（<div id="stuPanel">）不會被清掉。
function refreshAllRosterMeta() {
  var items = document.querySelectorAll('.roster-item[data-roster-token]');
  if (!items.length) return;
  Array.prototype.forEach.call(items, function(itemEl) {
    var tk = itemEl.getAttribute('data-roster-token');
    if (!tk) return;
    var s = studentsCache[tk];
    if (!s) return;
    var t = tk.replace(/'/g, '');
    var subEl = document.getElementById('rosterSub-' + t);
    if (subEl) subEl.textContent = rosterSubText(tk);
    var badgeEl = document.getElementById('rosterBadge-' + t);
    if (badgeEl) badgeEl.innerHTML = renderRosterBadgeHtml(tk);
  });
}

// 2026-07-14 加：展開/收合「舊生列表」面板 — 每次展開都重新從 studentsCache 畫一次，
//   確保剛封存/恢復完之後資料是最新的
function toggleArchivedStudents() {
  const panel = document.getElementById('archivedStudentsPanel');
  if (!panel) return;
  const showing = panel.style.display !== 'none';
  panel.style.display = showing ? 'none' : 'block';
  if (!showing) panel.innerHTML = renderArchivedStudentsHTML();
}

function renderArchivedStudentsHTML() {
  const archived = Object.entries(studentsCache).filter(function(e) { return e[1].archived_at; });
  if (!archived.length) return '<div class="empty-state" style="font-size:0.85rem;padding:16px;">目前沒有舊生</div>';
  return archived.map(function(entry) {
    const token = entry[0], s = entry[1];
    const t = token.replace(/'/g, '');
    let archivedDateStr = '';
    try { archivedDateStr = new Date(s.archived_at).toLocaleDateString('zh-TW'); } catch (e) {}
    return '<div class="card" style="padding:10px 14px;margin-top:6px;display:flex;justify-content:space-between;align-items:center;gap:10px;">' +
      '<div>' +
        '<div style="font-weight:700;color:var(--ink);font-family:\'Noto Serif TC\',serif;">' + escHtml(s.name) + '</div>' +
        '<div style="font-size:0.75rem;color:var(--ink-muted);font-family:\'Noto Sans TC\',sans-serif;">封存於 ' + escHtml(archivedDateStr) + '</div>' +
      '</div>' +
      '<div style="display:flex;gap:6px;flex-shrink:0;">' +
        '<button class="btn-sm" style="background:linear-gradient(135deg,var(--gold-bright),var(--gold-deep));color:#fff;" onclick="restoreStudent(\'' + t + '\')">♻️ 恢復</button>' +
        '<button class="btn-sm btn-sm-delete" onclick="permanentlyDeleteStudent(\'' + t + '\')" title="永久刪除（無法復原，Google Drive 檔案不受影響）">🗑️ 永久刪除</button>' +
      '</div>' +
    '</div>';
  }).join('');
}

// 2026-07-14 加（Lin 要求把「永久刪除」加回來）：只能對「已封存」的舊生使用——
//   一定要先封存過（Calendar 停課＋Drive 資料夾搬進「舊生」）才能永久刪除，避免誤刪還在上課中的學生。
//   永久刪除只砍資料庫這筆學生紀錄，不會動 Google Drive 檔案（封存時已經搬進「舊生」資料夾保留了）。
//   RELIABILITY FIRST：要求 Lin 手動打一次學生姓名才能刪，防止手滑點錯；刪除失敗要清楚顯示原因，不能默默失敗。
async function permanentlyDeleteStudent(token) {
  const s = studentsCache[token];
  const name = s?.name || token;
  if (!s || !s.archived_at) { alert('⚠️ 只能永久刪除「已封存」的舊生，請先封存再刪除。'); return; }
  // 2026-07-26 แก้ข้อความให้ตรงความจริง: ระบบลบให้แค่ 2 ตาราง (ข้อมูลนักเรียน + วันเรียนประจำ)
  // ตารางอื่น (ประวัติการเรียน/การจ่ายเงิน/คำขอ) จะถูกลบตามหรือไม่ ขึ้นกับการตั้งค่าฐานข้อมูล
  // → ห้ามเขียนว่า "ลบทุกอย่าง" ถ้าไม่ได้ตรวจว่าลบจริง (RELIABILITY FIRST: ห้ามขึ้นสำเร็จโดยไม่ตรวจ)
  const typed = prompt('⚠️ 永久刪除「' + name + '」無法復原！\n\n・會刪除：學生基本資料 + 每週固定上課日設定\n・其他紀錄（上課紀錄／繳費／申請單）是否一併刪除，取決於資料庫設定，請自己到 Supabase 確認一次\n・Google Drive 資料夾不會被刪除（檔案還在「舊生」資料夾裡）\n\n請輸入學生姓名「' + name + '」以確認刪除：');
  if (typed !== name) { if (typed !== null) alert('姓名不符，已取消刪除。'); return; }
  if (!(await ensureTeacherSession('永久刪除學生'))) return;
  // 🟠 2026-07-26：ลบรายการ "วันเรียนประจำ" ของคนนี้ทิ้งก่อน (ไม่มีที่ไหนลบตารางนี้มาก่อนเลย)
  // ทำก่อนลบตัวนักเรียน ถ้าล้มเหลวจะได้หยุดโดยที่ยังไม่ลบอะไรสำคัญ
  // ⚠️ นับจำนวนก่อน แล้วเทียบกับจำนวนที่ลบได้จริง — RLS ที่บล็อกการลบจะ "ลบได้ 0 แถวโดยไม่ error"
  //    ถ้าดูแค่ error จะขึ้นว่าสำเร็จทั้งที่ไม่ได้ลบอะไรเลย (บทเรียนเดิมใน CLAUDE.md)
  //    หมายเหตุ: 0 แถวจริงๆ ก็เป็นไปได้ (นักเรียนไม่มีคาบประจำ) เลยต้องนับก่อน ไม่ใช่ฟันธงจาก 0
  try {
    const rdBefore = await sb.from('classroom_recurring_days').select('token').eq('token', token);
    if (rdBefore.error) { alert(await writeErrorMessage(rdBefore.error.message, '讀取「每週固定上課日」資料') + '\n\n為了安全，這次「沒有」刪除學生。'); return; }
    const rdCount = (rdBefore.data || []).length;
    if (rdCount > 0) {
      const rdWipe = await sb.from('classroom_recurring_days').delete().eq('token', token).select();
      if (rdWipe.error) { alert(await writeErrorMessage(rdWipe.error.message, '清空「每週固定上課日」資料') + '\n\n為了安全，這次「沒有」刪除學生。'); return; }
      if (!rdWipe.data || rdWipe.data.length < rdCount) {
        alert(await writeErrorMessage('應該刪除 ' + rdCount + ' 筆，實際只刪掉 ' + ((rdWipe.data || []).length) + ' 筆（可能是資料庫權限擋住）', '清空「每週固定上課日」資料')
          + '\n\n為了安全，這次「沒有」刪除學生。');
        return;
      }
    }
  } catch (e) { alert('❌ 清空「每週固定上課日」資料失敗：' + (e.message || e) + '\n為了安全，這次「沒有」刪除學生。'); return; }
  // 🔴 2026-07-26 (RED 4)：เดิมเช็คแค่ error — RLS ที่ "ลบได้ 0 แถวโดยไม่ error" จะทำให้ขึ้นว่า
  // ลบสำเร็จ + ลบออกจาก studentsCache ในจอ ทั้งที่ข้อมูลยังอยู่ในฐานข้อมูล → รีเฟรชแล้วโผล่กลับมา
  const { data: gone, error } = await sb.from('classroom_students').delete().eq('token', token).select();
  if (error) { alert(await writeErrorMessage(error.message, '永久刪除學生') + '\n（資料還在，沒有被刪除）'); return; }
  if (!gone || !gone.length) { alert(await writeErrorMessage('刪除了 0 筆', '永久刪除學生') + '\n\n⚠️ 資料「還在」，沒有被刪除。'); return; }
  delete studentsCache[token];
  alert('✅ 已永久刪除「' + name + '」的資料庫紀錄。');
  await refreshStudentList(); // 舊生列表面板會跟著重新整理收合，點「📦 舊生列表」重新展開就會看到最新名單
}

// 老師：開啟某學生的 Drive 資料夾（用老師的 Google 權限解析資料夾）
async function openStudentDriveFolder(name) {
  try {
    var id = await gdGetStudentFolderId(name);
    window.open('https://drive.google.com/drive/folders/' + id, '_blank');
  } catch (e) { alert('開啟失敗，請先連接 Google：' + (e.message || e)); }
}

function selectStudent(token) {
  const panel = document.getElementById('stuPanel');
  if (!panel) return;
  // 2026-08-02 加：清單裡框起來目前選到的那一行
  currentTeacherPanelToken = token || null;
  document.querySelectorAll('.roster-item.roster-item-active').forEach(function(el) { el.classList.remove('roster-item-active'); });
  if (token) {
    var activeRosterEl = document.getElementById('rosterItem-' + token.replace(/'/g, ''));
    if (activeRosterEl) activeRosterEl.classList.add('roster-item-active');
  }
  // 2026-08-02（รอบ 4）加：假 dropdown 不像原生 <select> 選了會自己顯示選到誰，
  // 這裡要自己把 trigger 按鈕上的文字換掉——不只是 pickRosterItem() 點面板那條路要更新，
  // 別的地方（例如建完 Meet 連結後 refreshStudentList() 重畫清單、再回頭呼叫 selectStudent()）
  // 也會走到這裡，兩條路都要對，不然清單重畫後 trigger 會被打回「— 選擇學生 —」的預設字。
  var trigText = document.getElementById('rosterTriggerText');
  if (trigText) {
    var selStu = token ? studentsCache[token] : null;
    trigText.textContent = selStu ? selStu.name : '— 選擇學生 —';
  }
  if (!token) { panel.classList.remove('visible'); panel.innerHTML = ''; return; }

  const s = studentsCache[token];
  if (!s) return;
  const t = token.replace(/'/g, '');
  const initial = s.name ? s.name.charAt(0) : '?';


  panel.innerHTML =
    '<div class="stu-panel-header">' +
      '<div class="stu-acc-avatar">' + initial + '</div>' +
      '<span class="stu-panel-name">' + escHtml(s.name) + '</span>' +
    '</div>' +
    '<div class="class-actions-row">' +
      '<button class="btn-start-class" onclick="enterClass(\'' + t + '\')">📹 進入課堂</button>' +
      '<button class="btn-start-class" onclick="recordClass(\'' + t + '\')">🔴 開始錄影</button>' +
      '<button class="btn-start-class" style="background:linear-gradient(135deg,var(--gold-bright),var(--gold-deep));" onclick="recordAttendance(\'' + t + '\')">✅ 記錄今日上課</button>' +
    '</div>' +
    // 2026-07-18 改（Lin 要求）：主要按鈕列只留 5 顆固定順序、統一米色：
    // 📝開啟課堂筆記／👁預覽／📁Drive／✏️編輯／💳收費。
    // ⬆️上傳 併進「📚 教材連結」卡片、🔗連結／📦封存 移進 ✏️編輯 視窗（見 editMeetModal）
    // 📅上課記錄／➕加課堂時間 移到下面「📅 下一堂課」小卡片裡（跟學生頁「下一堂課」按鈕列同一套排法）
    // 🔧補課堂連結／🔄同步LINE選單 拿掉（補連結可以直接用 ✏️編輯 手動貼 Meet 連結，效果一樣）
    '<div class="stu-acc-actions">' +
      '<button class="btn-sm" style="background:var(--gold-light);color:var(--gold-deep);" onclick="openStudentNotesDoc(\'' + t + '\')">📝 開啟課堂筆記</button>' +
      '<button class="btn-sm" style="background:var(--gold-light);color:var(--gold-deep);" onclick="previewStudent(\'' + t + '\')">👁 預覽</button>' +
      '<button class="btn-sm" style="background:var(--gold-light);color:var(--gold-deep);" onclick="openStudentDriveFolder(\'' + (s.name||'').replace(/'/g,"\\'") + '\')">📁 Drive</button>' +
      '<button class="btn-sm" style="background:var(--gold-light);color:var(--gold-deep);" onclick="openEditMeetModal(\'' + t + '\')">✏️ 編輯</button>' +
      '<button class="btn-sm" style="background:var(--gold-light);color:var(--gold-deep);" onclick="openPaymentModal(\'' + t + '\')">💳 收費</button>' +
    '</div>' +
    '<div class="card" style="margin-top:12px;padding:14px;">' +
      '<div style="font-weight:700;font-size:0.85rem;color:var(--ink);margin-bottom:8px;font-family:\'Noto Sans TC\',sans-serif;">📚 教材連結</div>' +
      '<input id="matLabel-' + t + '" placeholder="教材名稱（例：拼音規則）" style="width:100%;padding:8px 10px;border-radius:8px;border:1px solid var(--border);font-size:0.85rem;font-family:\'Noto Sans TC\',sans-serif;background:#fff;color:var(--ink);margin-bottom:6px;box-sizing:border-box;">' +
      '<input id="matUrl-' + t + '" placeholder="貼上連結 URL（https://…）" style="width:100%;padding:8px 10px;border-radius:8px;border:1px solid var(--border);font-size:0.85rem;font-family:\'Noto Sans TC\',sans-serif;background:#fff;color:var(--ink);margin-bottom:8px;box-sizing:border-box;">' +
      '<div style="display:flex;gap:8px;">' +
        '<button class="btn-sm" style="background:var(--gold-deep);color:#fff;flex:1;" onclick="saveMaterialLink(\'' + t + '\')">💾 儲存連結</button>' +
        // 2026-07-18 移過來（Lin 要求）：以前⬆️上傳單獨在主按鈕列，現在跟教材連結放一起（都是「給學生的課堂資料」）
        '<button class="btn-sm" style="background:var(--gold-deep);color:#fff;flex:1;" onclick="openUploadModal(\'' + t + '\')">⬆️ 上傳檔案</button>' +
      '</div>' +
      '<div id="matList-' + t + '" style="margin-top:10px;"></div>' +
    '</div>' +
    '<div class="card" style="margin-top:12px;padding:14px;">' +
      '<div style="font-weight:700;font-size:0.85rem;color:var(--ink);margin-bottom:8px;font-family:\'Noto Sans TC\',sans-serif;">📖 上課進度</div>' +
      '<textarea id="progress-' + t + '" placeholder="例：拼音規則上到第3課，下次繼續聲調練習…" style="width:100%;min-height:70px;border-radius:8px;border:1px solid var(--border);padding:8px 10px;font-family:\'Noto Sans TC\',sans-serif;font-size:0.85rem;color:var(--ink);background:#fff;resize:vertical;box-sizing:border-box;">' + escHtml(s.lesson_progress || '') + '</textarea>' +
      '<div style="display:flex;align-items:center;gap:10px;margin-top:8px;">' +
        '<button class="btn-sm" style="background:var(--gold-deep);color:#fff;" onclick="saveLessonProgress(\'' + t + '\')">💾 儲存進度</button>' +
        '<span id="progressStatus-' + t + '" style="font-size:0.78rem;color:var(--ink-muted);font-family:\'Noto Sans TC\',sans-serif;"></span>' +
      '</div>' +
    '</div>' +
    '<div id="teacherNextClass-' + t + '"></div>' +
    '<div id="stuInfo-' + t + '" style="margin-top:12px;"></div>' +
    // 2026-08-02 加（原本在最上面「學生申請改期/取消」清單被拆掉，改成搬到這位學生自己的詳細卡片
    // 最下面）：只有這位學生有待處理申請時才會有內容，資料來自 loadPendingClassRequests()（見該函式）。
    '<div id="stuPendingReq-' + t + '" style="margin-top:12px;"></div>';

  panel.classList.add('visible');
  loadTeacherStudentInfo(token);
  loadMaterialLinks(token);
  loadTeacherNextClassBox(token);
  renderStudentPendingRequestsBlock(token); // 資料可能還沒載入完（畫面上就先空著），loadPendingClassRequests() 跑完會自動補上

  // Auto-save to localStorage on input
  var editor = document.getElementById('note-' + t);
  if (editor) {
    editor.addEventListener('input', function() {
      localStorage.setItem('notehtml_' + t, editor.innerHTML);
    });
    editor.focus();
  }
}

// 2026-08-02 加：畫「這位學生的待處理申請」區塊（改期/取消/加課）——內容（每筆申請的按鈕邏輯）
//   100% 沿用 loadPendingClassRequests() 裡算好的 actionsHtml，這裡只負責「挑出這個學生的份，畫出來」。
//   沒有待處理申請就清空這個區塊，不留空卡片。
function renderStudentPendingRequestsBlock(token) {
  if (!token) return;
  var el = document.getElementById('stuPendingReq-' + token.replace(/'/g, ''));
  if (!el) return;
  var reqs = (window._pendingRequestsByToken && window._pendingRequestsByToken[token]) || [];
  if (!reqs.length) { el.innerHTML = ''; return; }
  el.innerHTML = '<div class="pending-card">' +
    '<h2>📋 待處理申請 <span class="pending-badge">' + reqs.length + '</span></h2>' +
    reqs.map(function(x) { return x.html; }).join('') +
  '</div>';
}

let currentNoteToken = '';

let noteAutosaveTimer = null;   // 停手後延遲自動存
let noteSaving = false;         // 是否正在上傳中（避免同時送多次）
let noteDirtyAgain = false;     // 上傳中又有新編輯 → 存完再存一次

function noteSetStatus(html) { const el = document.getElementById('notepadStatus'); if (el) el.innerHTML = html; }
// 每位學生每天一份文件 → 同一天的編輯都覆蓋同一份，不會洗版
function noteDocKey(token) { return 'notedocid_' + token + '_' + teacherToday(); }
