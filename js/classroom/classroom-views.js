// ── 2026-07-13 新增：學生「回饋」通知 banner（老師首頁）──
// Lin 要求：學生送出感想時，老師一登入首頁就要看到提醒，不用點進每個學生才看得到。
// 設計跟 lowQuotaBanner 同一套模式：已關閉過的用 localStorage 記住（本機裝置），
// 不動資料庫欄位、不需要額外 schema — classroom_feedback 本身沒有「已讀」欄位。
// FILE MAP: teacher alerts/view → student view/joining → quota/receipts/feedback → schedule/files
var newFeedbackList = [];
var newFeedbackIdx = 0;
var newFeedbackRotateTimer = null;

function getDismissedFeedbackIds() {
  try { return JSON.parse(localStorage.getItem('dismissedFeedbackIds') || '[]'); } catch (e) { return []; }
}
function markFeedbackDismissed(id) {
  try {
    var d = getDismissedFeedbackIds();
    if (d.indexOf(id) === -1) d.push(id);
    if (d.length > 300) d = d.slice(d.length - 300); // 防止 localStorage 無限長大
    localStorage.setItem('dismissedFeedbackIds', JSON.stringify(d));
  } catch (e) {}
}

async function loadNewFeedbackBanner() {
  var el = document.getElementById('newFeedbackBanner');
  if (!el) return;
  try {
    var res = await sb.from('classroom_feedback').select('id,token,content,created_at').order('created_at', { ascending: false }).limit(30);
    var rows = res.data || [];
    if (res.error) { el.innerHTML = ''; console.warn('讀取學生回饋失敗：', res.error.message); return; }
    var dismissed = getDismissedFeedbackIds();
    newFeedbackList = rows.filter(function(r) { return dismissed.indexOf(r.id) === -1; })
      .map(function(r) {
        var s = studentsCache[r.token];
        return { id: r.id, token: r.token, name: s ? s.name : '（學生）', content: r.content || '' };
      });
    newFeedbackIdx = 0;
    renderNewFeedbackBanner();
  } catch (e) {}
}

function renderNewFeedbackBanner() {
  var el = document.getElementById('newFeedbackBanner');
  if (!el) return;
  if (newFeedbackRotateTimer) { clearInterval(newFeedbackRotateTimer); newFeedbackRotateTimer = null; }
  if (!newFeedbackList.length) { el.innerHTML = ''; return; }
  if (newFeedbackIdx >= newFeedbackList.length) newFeedbackIdx = 0;
  var item = newFeedbackList[newFeedbackIdx];
  var counter = newFeedbackList.length > 1 ? ' <span style="opacity:0.65;font-weight:400;">(' + (newFeedbackIdx + 1) + '/' + newFeedbackList.length + ')</span>' : '';
  var preview = item.content.length > 36 ? item.content.slice(0, 36) + '…' : item.content;
  el.innerHTML = '<div style="display:flex;align-items:center;gap:10px;background:var(--gold-light);border:1.5px solid var(--gold-bright);border-radius:12px;padding:13px 16px;margin-bottom:14px;font-family:\'Noto Sans TC\',sans-serif;font-size:0.9rem;color:var(--gold-deep);font-weight:700;">' +
    '<span style="flex:1;cursor:pointer;" onclick="openFeedbackFromBanner(\'' + item.token + '\',\'' + item.id + '\')">📝 新回饋：' + escHtml(item.name) + '「' + escHtml(preview) + '」' + counter + '</span>' +
    '<button onclick="dismissFeedbackAlert(\'' + item.id + '\')" title="關閉" style="background:none;border:none;cursor:pointer;font-size:1.1rem;color:var(--gold-deep);opacity:0.6;padding:2px 6px;flex-shrink:0;">✕</button>' +
  '</div>';
  if (newFeedbackList.length > 1) {
    newFeedbackRotateTimer = setInterval(function() {
      newFeedbackIdx = (newFeedbackIdx + 1) % newFeedbackList.length;
      renderNewFeedbackBanner();
    }, 5000);
  }
}

function dismissFeedbackAlert(id) {
  markFeedbackDismissed(id);
  newFeedbackList = newFeedbackList.filter(function(x) { return x.id !== id; });
  if (newFeedbackIdx >= newFeedbackList.length) newFeedbackIdx = 0;
  renderNewFeedbackBanner();
}

// 點 banner 文字 → 直接跳到那位學生的面板（順便關掉這則提醒）
function openFeedbackFromBanner(token, id) {
  dismissFeedbackAlert(id);
  var dd = document.getElementById('stuDropdown');
  if (dd) dd.value = token;
  selectStudent(token);
  setTimeout(function() {
    var panel = document.getElementById('stuPanel');
    if (panel) panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, 50);
}

// ── 2026-07-13 新增：「需要留意」banner（老師首頁）──
// 條件（跟 lowQuotaBanner 同類型的 client-side 檢查，載入首頁就會算，不用另外排 cron）：
//   1) 一般申請 pending 超過 48 小時還沒處理
//   2) 提議新時間 (offer_status='proposed') 超過 48 小時學生還沒回覆
//   3) 學生還沒連結 LINE，可能收不到通知（提議新時間/老師主動聯絡時特別重要）
//   4) 🆕 2026-07-15：有上課紀錄（classroom_attendance）但完全沒有任何 payment
//      （不分 pending/done/rejected，只要一筆都沒有就算）——防止像 Ling 那樣，
//      學生真的上了好幾堂課，卻沒人記得幫他建 payment，導致本輪堂數算不出來、
//      學生頁也一直顯示「尚未購課」。
// ⚠️ 已知限制：這是「打開網頁才會檢查」，不是主動推播提醒——如果要在時間到了就自動推 LINE
// 提醒雙方，需要另外排一個 cron function，這次沒有做，先用這個版本，之後想要再加。
var SLA_HOURS = 48;
async function loadActionNeededBanner() {
  var el = document.getElementById('actionNeededBanner');
  if (!el) return;
  try {
    var res = await sb.from('classroom_requests').select('*').eq('status', 'pending').order('created_at', { ascending: true });
    var data = res.data || [];
    if (res.error) { el.innerHTML = ''; return; }
    var now = Date.now();
    var items = [];
    data.forEach(function(r) {
      var s = studentsCache[r.token];
      var name = s ? s.name : (r.student_name || r.token || '-');
      if (r.offer_status === 'proposed' && r.offer_created_at) {
        var hrs = (now - new Date(r.offer_created_at).getTime()) / 3600000;
        if (hrs >= SLA_HOURS) items.push(escHtml(name) + '：提議新時間超過 48 小時，學生還沒回覆');
      } else if (!r.offer_status) {
        var hrs2 = (now - new Date(r.created_at).getTime()) / 3600000;
        if (hrs2 >= SLA_HOURS) items.push(escHtml(name) + '：申請已經超過 48 小時還沒處理');
      }
      if (s && !s.line_user_id) items.push(escHtml(name) + '：還沒連結 LINE，通知可能收不到');
    });
    // 4) 有上課紀錄卻完全沒有 payment（不分狀態）
    try {
      var attTokRes = await sb.from('classroom_attendance').select('token');
      var attTokRows = attTokRes.data || [];
      var payAnyRes = await sb.from('classroom_payments').select('token');
      var payTokenSet = {};
      (payAnyRes.data || []).forEach(function(p) { payTokenSet[p.token] = true; });
      var seenNoPay = {};
      attTokRows.forEach(function(a) {
        if (payTokenSet[a.token] || seenNoPay[a.token]) return;
        seenNoPay[a.token] = true;
        var s2 = studentsCache[a.token];
        if (s2 && s2.archived_at) return; // 已封存的舊生不提醒
        var name2 = s2 ? s2.name : a.token;
        items.push(escHtml(name2) + '：有上課紀錄，但完全沒有 payment，請確認是否漏建');
      });
    } catch (e) {}
    if (!items.length) { el.innerHTML = ''; return; }
    // 去重（同一個學生可能同時中兩條，只顯示一次同樣的文字）
    items = items.filter(function(t, i) { return items.indexOf(t) === i; });
    el.innerHTML = '<div style="background:#fff7ed;border:1.5px solid #f59e0b;border-radius:12px;padding:13px 16px;margin-bottom:14px;font-family:\'Noto Sans TC\',sans-serif;font-size:0.88rem;color:#b45309;">' +
      '<div style="font-weight:700;margin-bottom:4px;">⏰ 需要留意（超過 48 小時或無法通知）</div>' +
      items.map(function(t) { return '<div>・' + t + '</div>'; }).join('') +
      '</div>';
  } catch (e) { el.innerHTML = ''; }
}

async function renderTeacherView() {
  document.getElementById('studentNameDisplay').textContent = '👩‍🏫 教師管理頁面';
  document.getElementById('mainContainer').innerHTML =
    '<div id="newFeedbackBanner"></div>' +
    '<div id="actionNeededBanner"></div>' +
    // 2026-08-02 改（Lin 要求）：原本這裡有「課程快上完提醒」(lowQuotaBanner) 和「學生申請
    // 改期/取消/加課」(pendingRequestsSection) 兩個區塊，現在整個拿掉——改成下面「學生管理」
    // 的สารบัญ清單，每個學生自己那一行右邊直接顯示狀態 badge（改期/取消/加課/課程快上完），
    // 點進那位學生的詳細卡片，最下面會有完整的「待處理申請」區塊（按鈕邏輯跟以前一模一樣，
    // 只是位置搬過去了）。
    // loadLowQuotaBanner() / loadPendingClassRequests() 兩個函式都還在跑（見下面），只是不再
    // 找 #lowQuotaBanner / #pendingRequestsSection 這兩個 id 畫東西了，資料改成順便算給สารบัญ用。
    '<div class="teacher-panel">' +
      '<h2>👩‍🏫 學生管理 <span class="tag">教師專用</span></h2>' +
      '<div id="studentListContainer"><div class="empty-state">載入中…</div></div>' +
      '<div style="margin-top:16px;">' +
        '<button class="btn-add-student" style="margin-top:0;" onclick="openGenLinkModal()">🔗 入班連結</button>' +
      '</div>' +
    '</div>' +
    '<div id="pendingSlipsSection" style="margin-bottom:16px;"></div>' +
    '<div id="recentBackupsSection" style="margin-bottom:16px;"></div>' +
    '<div id="attendanceSection" style="margin-top:16px;"></div>' +
    recordingHTML();
  initRecording();
  // 2026-07-16 加：載入順序刻意不動（雖然畫面上「學生申請」搬到最上面了）——
  // refreshStudentList() 會重建 studentsCache（見 1042 行），processClassRequestInner
  // 通知學生時要讀 studentsCache[token] 才知道學生的 line_user_id。如果讓 loadPendingClassRequests()
  // 先跑完、老師畫面一出現就能點「✅ 處理」，但 studentsCache 還沒重建好，會誤判成「學生沒連 LINE」
  // 沒發通知（RELIABILITY FIRST：寧可畫面晚一點點出現，也不要讓通知邏輯讀到還沒準備好的資料）。
  await refreshStudentList();
  await loadPendingSlips();
  await loadPendingClassRequests();
  subscribePendingClassRequestsRealtime(); // 2026-07-20 加：訂閱之後，其他分頁/LINE/學生自己送出的異動會自動反映在這個清單，不用手動刷新
  scrollToRequestFromHash(); // 2026-07-16 加：LINE 通知按鈕點進來會帶 #req-row-xxx，載入完清單後跳過去+框起來
  await loadRecentBackups();
  await loadTodaySchedule();
  loadLowQuotaBanner();
  loadNewFeedbackBanner();
  loadActionNeededBanner();
  // auto-click "連接 Google Calendar" ถ้าเคย connect ไว้แล้ว (localStorage flag)
  if (localStorage.getItem('gdConnected')) {
    setTimeout(async function() {
      const btn = document.getElementById('calConnectBtn');
      if (!btn) return;
      // ลอง silent connect — ถ้า timeout (ไม่มี user gesture) จะ reject และ reset lock อัตโนมัติ
      // แล้วปุ่มยังคงอยู่ให้ Lin กดเองได้
      btn.click();
    }, 1000);
  }
}

// 課程摘要卡（只有老師在「入班連結」時有填課程資訊，連結裡才會有 c/p/d/ct 參數）
// 2026-07-08 改版：課程資訊改成從資料庫的學生列（pending_* 欄位）讀，不再靠網址參數。
// 這樣老師確認收款後，同一個連結重新整理就能看到最新狀態，不會有網址上凍結的舊資料對不起來的問題。
function buildCourseSummaryCard(s) {
  const courseId = s && s.pending_course_id;
  if (!courseId) return '';
  // 2026-07-14：自訂（單堂購買）以前不在 COURSE_TYPES 裡，卡片直接不顯示——
  // 現在自訂也能填優惠堂數了，補上自訂專用的顯示資料，卡片才會正常出現。
  const isCustom = courseId === 'custom';
  const c = isCustom
    ? { label: '自訂（單堂購買）', desc: '單價／幣別由學生在繳費頁選' }
    : ((typeof COURSE_TYPES !== 'undefined') ? COURSE_TYPES.find(function(x) { return x.id === courseId; }) : null);
  if (!c) return '';
  const lessons = s.pending_lessons || 0;
  const startDate = s.pending_start_date;   // 老師自己時區的日期
  const classTime = s.pending_class_time;   // 老師自己時區的時間
  const studentTz = s.pending_student_tz;
  const recurring = !!s.pending_recurring;
  // 2026-07-14：優惠堂數改成優先讀老師在「入班連結」時填的真實數字（pending_bonus_lessons）；
  // 沒有值（舊資料，還沒補這個欄位）才退回舊的自動公式（20堂送1／30堂送3）當備援。
  const bonus = (s.pending_bonus_lessons != null) ? (s.pending_bonus_lessons || 0) :
    (lessons && typeof slipBonusFor === 'function' ? slipBonusFor(lessons) : 0);
  const totalNTD = isCustom ? 0 : lessons * (c.priceNTD || 0);
  const totalTHB = isCustom ? 0 : lessons * (c.priceTHB || 0);
  const weekdayZh = ['日','一','二','三','四','五','六'];
  const shortDate = function(d) { return (d.getMonth()+1) + '月' + d.getDate() + '日（週' + weekdayZh[d.getDay()] + '）'; };

  // 2026-07-08 Lin 指定：學生只看「自己的時間」，不顯示老師的時間。
  // 2026-07-10 修正：startAbs 改用 teacherTimeToDate（固定泰國 +07:00）解析 —
  // 這張卡是學生在自己的瀏覽器看的，如果還用 new Date(startDate+'T'+classTime) 會被學生自己的
  // 瀏覽器時區誤判，導致換算結果整個錯掉（不是只有格式問題，是換算出來的絕對時間點本身就錯）。
  let timeLine = '';
  const startDateObj = startDate ? new Date(startDate + 'T00:00:00') : null;
  if (startDate && classTime && studentTz) {
    const startAbs = teacherTimeToDate(startDate, classTime);
    const conv = formatInTz(startAbs, studentTz);
    const studentDateObj = new Date(conv.dateStr + 'T00:00:00');
    timeLine = '上課時間：' + shortDate(studentDateObj) + ' ' + conv.timeStr;
  } else if (startDateObj && classTime) {
    timeLine = '上課時間：' + shortDate(startDateObj) + ' ' + classTime;
  }

  return '<div class="card" style="border-top:2px solid var(--gold-bright);">' +
    '<h2>📋 課程摘要</h2>' +
    '<div style="font-family:\'Noto Sans TC\',sans-serif;font-size:0.92rem;color:var(--ink);line-height:2;">' +
      '<div><strong style="color:var(--gold-deep);">' + escHtml(c.label) + '</strong>' + (c.desc ? '　·　' + escHtml(c.desc) : '') + '</div>' +
      (lessons ? '<div>堂數：' + lessons + ' 堂' + (bonus ? '（贈 ' + bonus + ' 堂）' : '') + '</div>' : '') +
      (lessons && !isCustom ? '<div>費用：NTD ' + totalNTD.toLocaleString() + '　／　THB ' + totalTHB.toLocaleString() + '</div>' : '') +
      (timeLine ? '<div>' + escHtml(timeLine) + '</div>' : '') +
      (recurring ? '<div style="color:var(--ink-muted);font-size:0.82rem;">🔁 每週固定上課</div>' : '') +
    '</div>' +
  '</div>';
}

// 2026-07-08 改版：改成即時去 Supabase 抓這個 token 的最新資料（不再只信網址上凍結的 n/m 參數），
// 因為現在「入班連結」在老師確認收款前 meet 是空的，收款確認後才會補上，
// 學生用同一個連結重新整理，一定要看到當下最新狀態（confirmed 才有完整課堂功能，pending 只看到繳費頁）。
async function renderStudentView() {
  const token = urlParams.get('s') || '';
  let student = null;
  let dbLookupFailed = false;
  if (token) {
    // 2026-07-14 加：RPC 失敗有可能只是網路暫時卡一下，先重試 1 次再放棄，
    // 減少「明明資料庫是好的，卻因為一次網路小狀況而退回舊連結資料」的機會（RELIABILITY FIRST）。
    for (let attempt = 0; attempt < 2 && !student; attempt++) {
      try {
        const { data } = await sb.rpc('get_student_by_token', { p_token: token });
        if (data) { student = data; break; }
        break; // 沒有 error 但也沒資料 → token 本身就查無此人，不用重試
      } catch (e) {
        dbLookupFailed = true;
        console.warn('[classroom] get_student_by_token 失敗（第 ' + (attempt + 1) + ' 次）：', (e && e.message) || e);
        if (attempt === 0) { try { await new Promise(function(r) { setTimeout(r, 800); }); } catch (e2) {} }
      }
    }
  }
  // 舊格式連結（升級前發出去、還沒被打開過的）沒有資料庫紀錄可能還帶著 n/m 參數 → 相容 fallback
  // 2026-07-14 加：這條路現在也會在「資料庫查得到但暫時連不上」時被觸發，資料是「凍結在連結裡」的舊版本
  // （姓名如果後來改過就不是最新的）→ 一定要標記起來，不能悄悄當成跟資料庫查到的一樣可信。
  let usedStaleUrlFallback = false;
  if (!student) {
    const nParam = urlParams.get('n');
    const mParam = urlParams.get('m');
    if (nParam && mParam) {
      try {
        student = { name: decodeURIComponent(atob(nParam)), meet: normalizeMeet(decodeURIComponent(atob(mParam))), setup_status: 'confirmed' };
        usedStaleUrlFallback = true;
      } catch(e) {}
    }
  }
  if (!student) {
    document.getElementById('mainContainer').innerHTML =
      '<div class="card" style="text-align:center;padding:40px;">' +
        '<p style="font-size:1.1rem;color:var(--ink-muted);">❌ 連結無效或已過期</p>' +
        '<p style="font-size:0.85rem;color:var(--ink-muted);margin-top:8px;font-family:\'Noto Sans TC\',sans-serif;">請聯繫泰華老師取得正確的課堂連結</p>' +
      '</div>';
    return;
  }
  student.meet = normalizeMeet(student.meet || '');
  if (token) studentsCache[token] = student; // 讓 openSlipModalLocked() 等函式能透過 studentsCache 拿到 pending_* 資料
  // 2026-07-14 加：用到舊連結資料時，一定要讓學生知道（不能悄悄用可能過期的姓名/狀態），
  // 尤其是資料庫連線真的失敗那種情況（不只是老連結沒被打開過而已）。
  if (usedStaleUrlFallback && dbLookupFailed) {
    try {
      var warnBanner = document.createElement('div');
      warnBanner.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:9999;background:#fef3c7;color:#92400e;text-align:center;padding:8px 12px;font-family:\'Noto Sans TC\',sans-serif;font-size:0.85rem;box-shadow:0 1px 4px rgba(0,0,0,0.1);';
      warnBanner.textContent = '⚠️ 網路連線不穩，目前顯示的資料可能不是最新，建議重新整理一次再操作';
      document.body.insertBefore(warnBanner, document.body.firstChild);
    } catch (e) {}
  }
  var sInitial = student.name ? student.name.charAt(0) : '?';
  document.getElementById('studentNameDisplay').textContent = '';
  // 2026-07-08：閘門只看「老師是否已確認收款」(setup_status === 'confirmed')，不再用 meet 是否存在判斷。
  // 這樣付款已確認的學生「一定」看得到完整課堂頁，就算 Meet 連結還沒建好也不會被鎖回繳費頁（RELIABILITY FIRST）。
  const isPending = student.setup_status !== 'confirmed';

  if (isPending) {
    renderBeforeJoiningView(token, student, sInitial);
    return;
  }

  // ── 已確認 / 完整課堂資料頁（跟改版前完全一樣，功能沒有變）──
  var header = document.querySelector('header');
  if (header) header.style.display = '';
  document.getElementById('mainContainer').innerHTML =
    // 2026-07-17 改（Lin 要求）：取消通知這個 banner 移到全頁最上面，比 hero 歡迎區塊還高
    // ——課堂被取消是最重要的事，要第一眼就看到，不要埋在下面滑半天才看到。
    // 2026-07-16 加：老師剛發起、還沒被學生確認的取消通知放在最上面（要學生按確認的優先度更高），
    // 已經確認完成的舊版通知（純關閉用）放下面。
    '<div id="teacherCancelAckBanner"></div>' +
    /* 🗑️ 2026-07-31 ลบ <div id="teacherAddAckBanner"> ทิ้ง — ไม่มีโค้ดไหนเขียนลงกล่องนี้อีกแล้ว */
    '<div id="teacherCancelNoticeBanner"></div>' +
    '<div class="student-hero">' +
      '<div class="student-hero-avatar">' + escHtml(sInitial) + '</div>' +
      '<div class="student-hero-name">' + escHtml(student.name) + ' 同學</div>' +
      '<div class="student-hero-sub">歡迎回到課堂 ✨</div>' +
    '</div>' +
    '<div id="quotaBanner"></div>' +
    '<div id="receiptBtns"></div>' +
    '<div class="card">' +
      '<h2>📹 進入課堂</h2>' +
      // 2026-07-18 改（Lin 要求）：所有按鈕大小要跟「🔔 連結 LINE 帳號」那顆一樣（font-size:0.95rem;padding:12px 20px）
      (student.meet
        ? '<a class="meet-btn" href="' + escHtml(safeHref(student.meet)) + '" target="_blank" rel="noopener" style="font-size:0.95rem;padding:12px 20px;">' + meetSVG + ' 點此進入課堂</a>' +
          '<p class="meet-link-text">點擊後將在新視窗開啟 Google Meet</p>'
        : '<div class="meet-btn" style="opacity:1;cursor:default;background:var(--gold-light);color:var(--gold-deep);font-size:0.95rem;padding:12px 20px;">' + meetSVG + ' 課堂連結準備中…</div>' +
          '<p class="meet-link-text">老師正在整理你的課堂連結，稍後重新整理就會看到（太久沒出現可用 LINE 提醒老師）</p>') +
    '</div>' +
    // 2026-07-18 改（Lin 要求）：「🔁 老師提議新時間」移到「下一堂課」上面，最優先看到
    '<div id="pendingRequestCard"></div>' +
    // 2026-07-18 再改（Lin 要求）：拿掉獨立的「我的課程記錄」卡片，改成「下一堂課」按鈕列的
    // 第一顆按鈕（放在 ❌取消課堂 前面），點下去直接在原地展開，不用跳到別的卡片
    '<div class="card" id="nextClassCard">' +
      '<h2>📅 下一堂課</h2>' +
      '<div id="nextClassInfo"><div style="text-align:center;color:var(--ink-muted);font-family:\'Noto Sans TC\',sans-serif;font-size:0.85rem;padding:12px 0;">載入中…</div></div>' +
      '<div id="courseRecordPanel" style="display:none;margin-top:12px;padding-top:12px;border-top:1px solid var(--border);">' +
        '<div id="quotaSummary"></div>' +
        '<div id="scheduleList"><div style="text-align:center;color:var(--ink-muted);font-family:\'Noto Sans TC\',sans-serif;font-size:0.85rem;padding:12px 0;">載入中…</div></div>' +
      '</div>' +
      buildLineActionBtn(token, student) +
    '</div>' +
    // 2026-07-18 改（Lin 要求）：「今日學習感想」「課堂資料下載」改回單欄上下排列（取消並排半版）
    '<div class="card">' +
      '<h2>💬 今日學習感想</h2>' +
      '<p style="font-size:0.82rem;color:var(--ink-muted);font-family:\'Noto Sans TC\',sans-serif;margin-bottom:10px;">今天學了什麼？寫下你的感想讓老師知道 ✨</p>' +
      '<textarea id="feedbackText" placeholder="例：今天學了聲調，สวัสดี 的用法還不太確定…" style="width:100%;min-height:88px;border-radius:9px;border:1px solid var(--border);padding:10px 12px;font-family:\'Noto Sans TC\',sans-serif;font-size:0.9rem;color:var(--ink);background:#fff;resize:vertical;box-sizing:border-box;"></textarea>' +
      '<button class="btn-gold" onclick="submitFeedback(\'' + token + '\')" style="margin-top:10px;width:100%;font-size:0.95rem;padding:12px 20px;">送出感想 ✉️</button>' +
      '<div id="feedbackStatus" style="margin-top:8px;font-size:0.82rem;font-family:\'Noto Sans TC\',sans-serif;color:var(--ink-muted);min-height:18px;"></div>' +
    '</div>' +
    // 2026-07-18 加回（Lin 要求）：老師貼的「教材連結」（教科書網頁）要能直接開，不是只有 Drive 資料夾按鈕
    '<div class="card">' +
      '<h2>📂 課堂資料下載</h2>' +
      '<div id="textbookLinks"></div>' +
      '<div id="driveFolderLink"><div style="text-align:center;color:var(--ink-muted);font-family:\'Noto Sans TC\',sans-serif;font-size:0.85rem;padding:12px 0;">載入中…</div></div>' +
    '</div>' +
    '<div class="card">' +
      '<h2>💰 繳費 & 收據</h2>' +
      '<div id="slipStatusMsg"></div>' +
      '<button class="btn-add-student" style="margin-top:8px;font-size:0.95rem;padding:12px 20px;" onclick="openSlipModal(\'' + token + '\')">💰 繳費通知</button>' +
      '<p class="meet-link-text" style="margin-top:8px;">選課程方案 → 選幣別 → 上傳匯款截圖 → 老師確認後自動開立收據</p>' +
      '<div id="payHistory" style="margin-top:14px;"></div>' +
    '</div>' +
    '<div class="card">' +
      '<h2>📚 更多學習資源</h2>' +
      '<div style="display:flex;gap:10px;flex-wrap:wrap;">' +
        '<a href="../content.html" style="flex:1;min-width:140px;text-align:center;display:inline-block;background:var(--off-white);border:1px solid rgba(200,151,58,0.4);color:#8B6310;text-decoration:none;border-radius:999px;padding:10px 16px;font-weight:700;font-size:0.88rem;font-family:\'Noto Sans TC\',sans-serif;">📚 影片與文章</a>' +
        '<a href="../games.html" style="flex:1;min-width:140px;text-align:center;display:inline-block;background:var(--off-white);border:1px solid rgba(200,151,58,0.4);color:#8B6310;text-decoration:none;border-radius:999px;padding:10px 16px;font-weight:700;font-size:0.88rem;font-family:\'Noto Sans TC\',sans-serif;">🎮 泰語遊戲練習室</a>' +
        '<a href="https://mrtaihualin.com/" target="_blank" rel="noopener" style="flex:1;min-width:140px;text-align:center;display:inline-block;background:var(--off-white);border:1px solid rgba(200,151,58,0.4);color:#8B6310;text-decoration:none;border-radius:999px;padding:10px 16px;font-weight:700;font-size:0.88rem;font-family:\'Noto Sans TC\',sans-serif;">🏠 回官網首頁</a>' +
      '</div>' +
    '</div>' +
    '<div style="text-align:center;padding:4px 0 8px;">' +
      '<a href="https://mrtaihualin.com/faq.html#rules" target="_blank" rel="noopener" style="font-size:0.8rem;color:var(--ink-muted);font-family:\'Noto Sans TC\',sans-serif;text-decoration:underline;">📜 上課規則 & 常見問題</a>' +
    '</div>';
  checkStudentSlipStatus(token);
  loadStudentNextClass(token);
  loadTeacherCancelAckBanner(token);
  // 🗑️ 2026-07-31 ลบ loadTeacherAddAckBanner(token) ทิ้ง — ระบบ "รอนักเรียนกดยอมรับก่อนเพิ่มคาบ"
  //    เลิกใช้แล้วตั้งแต่ 2026-07-30 · เหตุผลเต็มดูที่บล็อกคอมเมนต์ 🗑️ ในไฟล์นี้ (ค้นคำว่า loadTeacherAddAckBanner)
  loadTeacherCancelNoticeBanner(token);
  loadStudentPendingRequestStatus(token);
  loadStudentSchedule(token);
  loadStudentTextbookLinks(token);
  loadStudentFolderLink(token);
  loadStudentQuota(token);
  loadStudentReceipts(token);
  loadStudentPayments(token);
}

// ── 「入班前 / 等待老師確認收款」頁面 ──────────────────────
// 學生付款前看到的就是這個縮減版頁面：課程摘要 + 鎖住的（灰色）課堂連結 + 繳費 + 上課須知。
// 不顯示上方 header（要離開了嗎？那個大標題列），也不顯示下一堂課／學習感想／課程記錄／檔案下載／
// 更多學習資源這些「已經是學生」才需要的功能卡片 —— 這些只有 setup_status = 'confirmed' 之後才會出現。
function renderBeforeJoiningView(token, student, sInitial) {
  var header = document.querySelector('header');
  if (header) header.style.display = 'none'; // 入班前頁面：拿掉最上面的老師招牌 header，做成獨立頁面

  document.getElementById('mainContainer').innerHTML =
    '<div class="student-hero">' +
      '<div class="student-hero-avatar">' + escHtml(sInitial) + '</div>' +
      '<div class="student-hero-name">' + escHtml(student.name) + ' 同學</div>' +
      '<div class="student-hero-sub">歡迎加入！入班前請先完成繳費 🙏</div>' +
    '</div>' +
    buildCourseSummaryCard(student) +
    '<div class="card">' +
      '<h2>📹 課堂連結</h2>' +
      '<a class="meet-btn" href="javascript:void(0)" onclick="alert(\'⏳ 等待老師確認收款中，老師確認收款後這個按鈕就會開通，可以直接點進去上課。\')" style="opacity:0.45;filter:grayscale(0.4);cursor:not-allowed;">' + meetSVG + ' 尚未開通（等待老師確認收款）</a>' +
      '<p class="meet-link-text">完成繳費、老師確認收款後，這裡會自動開通課堂連結</p>' +
    '</div>' +
    '<div class="card">' +
      '<h2>💰 繳費</h2>' +
      '<div id="slipStatusMsg"></div>' +
      '<button class="btn-add-student" style="margin-top:8px;" onclick="openSlipModalLocked(\'' + token + '\')">💰 繳費通知</button>' +
      '<p class="meet-link-text" style="margin-top:8px;">上傳匯款截圖 → 老師確認收款後自動開通課堂連結</p>' +
      '<div id="payHistory" style="margin-top:14px;"></div>' +
    '</div>' +
    '<div style="text-align:center;padding:4px 0 8px;">' +
      '<a href="https://mrtaihualin.com/faq.html#rules" target="_blank" rel="noopener" style="font-size:0.8rem;color:var(--ink-muted);font-family:\'Noto Sans TC\',sans-serif;text-decoration:underline;">📜 上課規則 & 常見問題</a>' +
    '</div>';
  checkStudentSlipStatus(token);
  loadStudentPayments(token);
}

// 從「入班前」頁面打開繳費視窗：鎖住課程/堂數（老師在產生入班連結時已經指定好），
// 學生不能自己改成別的方案，避免跟老師談好的價錢對不起來
function openSlipModalLocked(token) {
  var s = studentsCache[token];
  var lock = (s && s.pending_course_id && s.pending_lessons) ? { courseId: s.pending_course_id, lessons: s.pending_lessons } : null;
  openSlipModal(token, lock);
}

// 依「本輪起算日」計算當期課程剩餘堂數（起算日前=舊課，不計入）
// pays: [{lessons,bonus_lessons,status,start_date}]　atts: [{lesson_date,lessons}]
// 🔴 2026-07-26 เพิ่ม (RED 4 — คิดเงินผิดได้จริง)
// เดิมทุกจุดเขียนว่า `(await sb...).data || []` → ถ้าอ่านฐานข้อมูลไม่สำเร็จจะได้ [] เหมือนกับ
// "อ่านสำเร็จแต่ไม่มีข้อมูล" แยกไม่ออกเลย ผลคือ:
//   · อ่านตาราง payments พัง → หน้าจอขึ้น "尚未購課" ทั้งที่นักเรียนจ่ายเงินมาแล้ว
//   · อ่านตาราง attendance พัง → 已上 นับเป็น 0 → "เหลือคาบ" เยอะเกินจริง = ให้เรียนฟรีโดยไม่รู้ตัว
// ตัวนี้บังคับให้แยก "โหลดไม่ได้" ออกจาก "ค่าเป็น 0 จริงๆ" — โหลดไม่ได้ต้องโยน error ออกไป
// ให้ผู้เรียกแสดงสถานะ "อ่านข้อมูลไม่ได้" แทนที่จะแสดงตัวเลขที่ผิด
function rowsOrThrow(res, what) {
  if (res && res.error) throw new Error('讀取' + (what || '資料') + '失敗：' + res.error.message);
  return (res && res.data) || [];
}
function quotaLoadFailHtml(msg) {
  // สีใช้ตัวแปรธีมของเว็บเท่านั้น (กฎข้อ 4 ใน CLAUDE.md) ห้ามฮาร์ดโค้ด hex นอกชุด
  return '<div style="background:var(--cream);border:1.5px solid var(--amber);border-radius:9px;padding:9px 13px;margin-bottom:10px;'
    + 'font-family:\'Noto Sans TC\',sans-serif;font-size:0.85rem;color:var(--amber-dark);font-weight:700;">'
    + '⚠️ 剩餘堂數讀取失敗，暫時無法顯示<span style="font-weight:400;display:block;margin-top:3px;">'
    + escHtml(String(msg || '')) + '<br>請重新整理頁面再看一次（不要照這裡的數字算堂數）。</span></div>';
}
function computeCurrentCourse(pays, atts) {
  var active = (pays || []).filter(function(p) { return p.status === 'pending' || p.status === 'done'; });
  var withDate = active.filter(function(p) { return p.start_date; });
  if (withDate.length) {
    withDate.sort(function(a, b) { return a.start_date < b.start_date ? 1 : -1; }); // 新→舊
    var cur = withDate[0];
    var bought = (cur.lessons || 0) + (cur.bonus_lessons || 0);
    var used = (atts || []).filter(function(a) { return a.lesson_date >= cur.start_date; })
      .reduce(function(s, a) { return s + (a.lessons || 1); }, 0);
    return { hasCourse: true, bought: bought, used: used, remain: bought - used, start: cur.start_date };
  }
  var b = active.reduce(function(s, p) { return s + (p.lessons || 0) + (p.bonus_lessons || 0); }, 0);
  var u = (atts || []).reduce(function(s, a) { return s + (a.lessons || 1); }, 0);
  return { hasCourse: b > 0, bought: b, used: u, remain: b - u, start: null };
}

// 學生：本輪剩餘堂數 + 快用完提醒
async function loadStudentQuota(token) {
  try {
    // 🔴 2026-07-26：อ่านไม่ได้ ต้องรู้ว่าอ่านไม่ได้ ห้ามกลายเป็น 0 เงียบๆ (ดู rowsOrThrow)
    var pays = rowsOrThrow(await sb.rpc('get_student_payments', { p_token: token }), '繳費紀錄');
    var atts = rowsOrThrow(await sb.rpc('get_student_attendance', { p_token: token }), '上課紀錄');
    var q = computeCurrentCourse(pays, atts);
    var remain = q.remain < 0 ? 0 : q.remain;
    var sumEl = document.getElementById('quotaSummary');
    if (sumEl) {
      if (q.hasCourse) {
        var color = q.remain <= 1 ? '#b45309' : 'var(--gold-deep)';
        sumEl.innerHTML = '<div style="background:#fbf6ea;border:1px solid #e9dcb8;border-radius:9px;padding:9px 13px;margin-bottom:10px;font-family:\'Noto Sans TC\',sans-serif;font-size:0.86rem;color:' + color + ';font-weight:700;">本輪剩餘 ' + remain + ' 堂 <span style="font-weight:400;color:var(--ink-muted);">（本輪 ' + q.bought + ' · 已上 ' + q.used + '）</span></div>';
      } else {
        sumEl.innerHTML = '<div style="background:#faf7f0;border:1px solid #e9dcb8;border-radius:9px;padding:9px 13px;margin-bottom:10px;font-family:\'Noto Sans TC\',sans-serif;font-size:0.85rem;color:var(--ink-muted);">剩餘堂數：尚未購課（老師確認繳費後顯示）</div>';
      }
    }
    // 2026-07-18 改（Lin 要求）：原本 remain<=1 每次進網站都會看到提醒，
    // 改成「今天真的有排課 + 今天就是最後一堂」才顯示，語意更準確
    var banEl = document.getElementById('quotaBanner');
    if (banEl && q.hasCourse && q.remain <= 1) {
      try {
        var sched = (await sb.rpc('get_student_schedule', { p_token: token })).data || [];
        var now = new Date();
        var todayLocal = now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0') + '-' + String(now.getDate()).padStart(2, '0');
        var hasClassToday = sched.some(function(r) { return r.lesson_date === todayLocal; });
        if (hasClassToday) {
          banEl.innerHTML = '<div style="background:#fff7ed;border:1.5px solid #f59e0b;border-radius:12px;padding:13px 16px;margin-bottom:14px;font-family:\'Noto Sans TC\',sans-serif;font-size:0.9rem;color:#b45309;font-weight:700;">⏰ 今天是這一期最後一堂課囉！記得跟老師約續課時間，才不會中斷學習喔 😊</div>';
        }
      } catch (e2) {}
    }
  } catch (e) {
    // 🔴 2026-07-26：เดิม catch ว่างเปล่า = อ่านพังแล้วเงียบสนิท นักเรียนเห็นตัวเลขค้างของเก่าหรือไม่เห็นอะไรเลย
    var failEl = document.getElementById('quotaSummary');
    if (failEl) failEl.innerHTML = quotaLoadFailHtml(e && e.message);
    console.warn('loadStudentQuota failed:', e);
  }
}

// 學生：收據下載按鈕（可按 X 關閉，記住已關閉；2026-07-18 加：開立超過 3 天自動不再顯示，不用學生自己關）
async function loadStudentReceipts(token) {
  var el = document.getElementById('receiptBtns');
  if (!el) return;
  try {
    var res = await sb.rpc('get_student_recordings', { p_token: token });
    var data = res.data || [];
    var receipts = data.filter(function(r) { return (r.name || '').indexOf('收據') !== -1; });
    // 2026-07-18 加（Lin 要求）：收據通知只留 3 天，超過自動消失（不用等學生手動按 X 關）
    var RECEIPT_NOTICE_DAYS = 3;
    var cutoffMs = Date.now() - RECEIPT_NOTICE_DAYS * 24 * 3600 * 1000;
    receipts = receipts.filter(function(r) { return !r.created_at || new Date(r.created_at).getTime() >= cutoffMs; });
    if (!receipts.length) { el.innerHTML = ''; return; }
    var dismissed = {};
    try { dismissed = JSON.parse(localStorage.getItem('dismissedReceipts_' + token) || '{}'); } catch (e) {}
    var html = receipts.filter(function(r) { return !dismissed[r.url]; }).map(function(r) {
      var safeUrl = escAttrJs(r.url || '');
      return '<div style="display:flex;align-items:center;gap:10px;background:var(--gold-light);border:1px solid var(--gold-bright);border-radius:11px;padding:11px 14px;margin-bottom:10px;font-family:\'Noto Sans TC\',sans-serif;">' +
        '<span style="font-size:1.2rem;">🧾</span>' +
        '<a href="' + escHtml(safeHref(r.url)) + '" target="_blank" rel="noopener" style="flex:1;color:var(--gold-deep);font-weight:700;font-size:0.88rem;text-decoration:none;">收據已開立，點此下載</a>' +
        '<button onclick="dismissReceipt(\'' + token + '\',\'' + safeUrl + '\',this)" title="關閉" style="background:none;border:none;cursor:pointer;font-size:1.05rem;color:var(--gold-deep);opacity:0.6;padding:2px 6px;">✕</button>' +
      '</div>';
    }).join('');
    el.innerHTML = html;
  } catch (e) { el.innerHTML = ''; }
}

function dismissReceipt(token, url, btn) {
  try {
    var key = 'dismissedReceipts_' + token;
    var dismissed = JSON.parse(localStorage.getItem(key) || '{}');
    dismissed[url] = 1;
    localStorage.setItem(key, JSON.stringify(dismissed));
  } catch (e) {}
  if (btn) { var row = btn.parentNode; if (row && row.parentNode) row.parentNode.removeChild(row); }
}

// ── 老師：核准 / 撤銷 testimonial 刊登 ─────────────────────────────────────
async function approveTestimonial(id, token) {
  var nameEl = document.getElementById('dn-' + id);
  var displayName = (nameEl ? nameEl.value.trim() : '') || '匿名學員';
  var catBoxes = document.querySelectorAll('input[data-fid="' + id + '"]:checked');
  var category = Array.prototype.map.call(catBoxes, function(b){ return b.value; }).join(' ');
  if (!category) { alert('請至少勾選一個分類，才能核准刊登喔'); return; }
  try {
    var res = await sb.from('classroom_feedback').update({ approved: true, display_name: displayName, category: category }).eq('id', id).select();
    if (res.error || !res.data || !res.data.length) throw new Error(res.error ? res.error.message : '資料庫沒有真的更新到（可能是 RLS 權限問題）');
    if (token) loadTeacherStudentInfo(token);
  } catch(e) { alert('核准失敗：' + (e.message || e)); }
}
async function unapproveTestimonial(id, token) {
  try {
    var res = await sb.from('classroom_feedback').update({ approved: false }).eq('id', id).select();
    if (res.error || !res.data || !res.data.length) throw new Error(res.error ? res.error.message : '資料庫沒有真的更新到（可能是 RLS 權限問題）');
    if (token) loadTeacherStudentInfo(token);
  } catch(e) { alert('撤銷失敗：' + (e.message || e)); }
}

// ── 學生送出今日學習感想 → 寫進 classroom_feedback ────────────────────────
async function submitFeedback(token) {
  var ta = document.getElementById('feedbackText');
  var el = document.getElementById('feedbackStatus');
  var text = (ta ? ta.value : '').trim();
  if (!text) { if (el) el.textContent = '請寫點什麼再送出 🙏'; return; }
  if (el) el.textContent = '送出中…';
  try {
    var { error } = await sb.from('classroom_feedback').insert({ token: token, content: text });
    if (error) throw error;
    if (ta) ta.value = '';
    if (el) { el.style.color = 'var(--gold-deep)'; el.textContent = '✅ 已送出，謝謝你的感想！'; }
    setTimeout(function() { if (el) { el.style.color = ''; el.textContent = ''; } }, 6000);
  } catch (e) {
    if (el) { el.style.color = 'var(--amber)'; el.textContent = '⚠️ 送出失敗：' + (e.message || e); }
  }
}

// 學生：繳費記錄列表
async function loadStudentPayments(token) {
  var el = document.getElementById('payHistory');
  if (!el) return;
  try {
    var res = await sb.rpc('get_student_payments', { p_token: token });
    var data = res.data || [];
    var head = '<div style="font-weight:700;font-size:0.85rem;color:var(--ink);margin-bottom:4px;font-family:\'Noto Sans TC\',sans-serif;">📋 繳費記錄</div>';
    if (!data.length) {
      el.innerHTML = head + '<div style="color:var(--ink-muted);font-size:0.82rem;font-family:\'Noto Sans TC\',sans-serif;padding:4px 0;">尚無繳費記錄</div>';
      return;
    }
    var statusZh = { slip_submitted: '⏳ 待確認', pending: '✅ 已確認', done: '🧾 已開立收據', rejected: '❌ 未通過' };
    var rows = data.map(function(p) {
      var d = p.created_at ? new Date(p.created_at) : null;
      var ds = d ? (d.getFullYear() + '/' + String(d.getMonth()+1).padStart(2,'0') + '/' + String(d.getDate()).padStart(2,'0')) : '';
      return '<div style="display:flex;justify-content:space-between;gap:8px;padding:8px 0;border-bottom:1px solid rgba(0,0,0,0.06);font-family:\'Noto Sans TC\',sans-serif;font-size:0.83rem;">' +
        '<div><div style="font-weight:700;color:var(--ink);">' + (p.course_label || '-') + '</div>' +
          '<div style="color:var(--ink-muted);font-size:0.76rem;">' + ds + ' · ' + (p.lessons || 0) + '堂' + (p.bonus_lessons ? '+' + p.bonus_lessons : '') + ' · ' + (p.currency || '') + ' ' + (p.total_amount || 0).toLocaleString() + '</div></div>' +
        '<div style="white-space:nowrap;color:var(--gold-deep);font-weight:600;">' + (statusZh[p.status] || p.status) + '</div>' +
      '</div>';
    }).join('');
    el.innerHTML = head + rows;
  } catch (e) { el.innerHTML = ''; }
}

// 2026-07-18 改（Lin 要求二次調整）：拆成 2 個 dropdown ——
// 1) 「本期課程」：合併本輪已經上過（✅已完成）+ 還沒上、但已排定（⏳未完成／預期）成同一份清單，只顯示 上課日期／狀態
// 2) 「過去的課程記錄」：跟以前的「過往課程記錄」一樣，只列本輪起算日之前、已經上過的舊紀錄
async function loadStudentSchedule(token) {
  const el = document.getElementById('scheduleList');
  if (!el) return;
  const dayZh = ['日','一','二','三','四','五','六'];
  function fmtDate(dateStr) {
    const d = new Date(dateStr + 'T12:00:00');
    return d.getFullYear() + '/' + String(d.getMonth()+1).padStart(2,'0') + '/' + String(d.getDate()).padStart(2,'0') + '（週' + dayZh[d.getDay()] + '）';
  }
  try {
    const s = (typeof studentsCache !== 'undefined') ? studentsCache[token] : null;
    const studentTz = s && s.pending_student_tz;

    const [attRes, schedRes, payRes] = await Promise.all([
      sb.rpc('get_student_attendance', { p_token: token }),
      sb.rpc('get_student_schedule', { p_token: token }),
      sb.rpc('get_student_payments', { p_token: token }),
    ]);
    // 🔴 2026-07-26：อ่านพัง = ต้องรู้ (ไม่งั้น 已上 กลายเป็น 0 → เหลือคาบเกินจริง = คิดเงินผิด)
    const attData = rowsOrThrow(attRes, '上課紀錄');
    const schedData = rowsOrThrow(schedRes, '課表');
    const q = computeCurrentCourse(rowsOrThrow(payRes, '繳費紀錄'), attData);
    const startDay = q.start || null;

    const attCurrent = startDay ? attData.filter(function(r) { return r.lesson_date >= startDay; }) : attData;
    const attHistory = startDay ? attData.filter(function(r) { return r.lesson_date < startDay; }) : [];

    // 未來排定但還沒上的課（用學生自己的時區換算日期，跟「下一堂課」同一套邏輯，避免半夜跨日算錯天）
    function upcomingDateKey(r) {
      const startTimeStr = (r.start_time && /^\d{1,2}:\d{2}/.test(r.start_time)) ? r.start_time : null;
      if (startTimeStr && studentTz) {
        const abs = teacherTimeToDate(r.lesson_date, startTimeStr);
        return formatInTz(abs, studentTz).dateStr;
      }
      return r.lesson_date;
    }
    const attCurrentDates = {};
    attCurrent.forEach(function(r) { attCurrentDates[r.lesson_date] = true; });
    const upcoming = schedData
      .map(function(r) { return upcomingDateKey(r); })
      .filter(function(dateKey) { return (!startDay || dateKey >= startDay) && !attCurrentDates[dateKey]; });

    // 2026-07-19 加（Lin 要求：拿掉 RPC 的 limit 5 之後變成顯示到 classroom_schedule 同步到的
    // 最遠日期，超過買的課包很多）：「本期課程」只該顯示到「這期課包結束」，不是顯示到 Calendar
    // 同步到多遠——用 computeCurrentCourse 算出來的剩餘堂數（q.remain）決定要顯示幾筆「未完成」，
    // 多的（代表下一期或還沒排定續課方案的）先不放進本期課程表。
    const upcomingUnique = Array.from(new Set(upcoming)).sort();
    const remainCount = Math.max(0, Math.ceil(q.remain || 0));
    const upcomingCapped = upcomingUnique.slice(0, remainCount);

    // 合併「本期課程」：已完成（attCurrent）+ 未完成／預期（upcomingCapped，只到課包結束），去重＋依日期排序
    const merged = {};
    attCurrent.forEach(function(r) { merged[r.lesson_date] = true; });
    upcomingCapped.forEach(function(dateKey) { if (!(dateKey in merged)) merged[dateKey] = false; });
    const mergedDates = Object.keys(merged).sort();

    function courseTableHtml() {
      if (!mergedDates.length) {
        return '<div style="text-align:center;color:var(--ink-muted);font-family:\'Noto Sans TC\',sans-serif;font-size:0.85rem;padding:8px 0;">本期課程尚無資料</div>';
      }
      const rows = mergedDates.map(function(dateKey) {
        const done = merged[dateKey];
        const statusLabel = done ? '✅ 已完成' : '⏳ 未完成';
        return '<tr><td>' + fmtDate(dateKey) + '</td><td>' + statusLabel + '</td></tr>';
      }).join('');
      return '<table class="schedule-table"><thead><tr><th>上課日期</th><th>狀態</th></tr></thead><tbody>' + rows + '</tbody></table>';
    }

    function historyTableHtml() {
      let cum = 0;
      const rows = attHistory.map(function(r) {
        const n = r.lessons || 1;
        const start = cum + 1, end = cum + n; cum = end;
        const badge = n > 1 ? ('第 ' + start + '–' + end + ' 堂') : ('第 ' + start + ' 堂');
        const dateStr = fmtDate(r.lesson_date) + (n > 1 ? ' · ' + n + ' 堂' : '');
        return '<tr><td><span class="lesson-badge">' + badge + '</span></td><td>' + dateStr + '</td></tr>';
      }).join('');
      return '<table class="schedule-table"><thead><tr><th>堂次</th><th>上課日期</th></tr></thead><tbody>' + rows + '</tbody></table>';
    }

    const html =
      // 2026-07-19 改（Lin 要求）：「本期課程」不要用 dropdown 折疊，直接展開常駐顯示
      '<div style="color:var(--gold-deep);font-weight:700;font-family:\'Noto Sans TC\',sans-serif;font-size:0.88rem;padding:4px 0;">📖 本期課程' + (mergedDates.length ? '（共 ' + mergedDates.length + ' 堂）' : '') + '</div>' +
      '<div style="margin-top:8px;">' + courseTableHtml() + '</div>' +
      '<details style="margin-top:12px;">' +
        '<summary style="cursor:pointer;color:var(--ink-muted);font-family:\'Noto Sans TC\',sans-serif;font-size:0.85rem;padding:4px 0;">📅 過去的課程記錄' + (attHistory.length ? '（' + attHistory.length + ' 筆）' : '') + '</summary>' +
        '<div style="margin-top:6px;opacity:0.8;">' + (attHistory.length ? historyTableHtml() : '<div style="text-align:center;color:var(--ink-muted);font-family:\'Noto Sans TC\',sans-serif;font-size:0.85rem;padding:8px 0;">尚無過去的課程記錄</div>') + '</div>' +
      '</details>';
    el.innerHTML = html;
  } catch(e) {
    // 🔴 2026-07-26：เดิมขึ้นแค่ "載入失敗" ลอยๆ — ต้องบอกให้ชัดว่า "อย่าเอาเลขที่เห็นไปนับคาบ"
    el.innerHTML = '<div style="color:var(--amber);font-weight:700;font-size:0.83rem;text-align:center;padding:8px 0;font-family:\'Noto Sans TC\',sans-serif;">'
      + '⚠️ 課程記錄載入失敗<div style="font-weight:400;color:var(--ink-muted);margin-top:4px;">' + escHtml(String((e && e.message) || ''))
      + '<br>請重新整理再看一次（不要照這裡的內容算堂數）。</div></div>';
    console.warn('courseTable load failed:', e);
  }
}

// 學生：「課堂資料下載」卡片裡的教科書網頁連結（老師在「📚 教材連結」貼的，name 開頭是 教材_/教材）
// 2026-07-18 加回（Lin 要求）：拿掉檔案清單那次順手把這個也拿掉了，教科書網頁連結是老師/學生
// 常用的東西，要單獨留一顆按鈕（不是塞回整份檔案清單）
async function loadStudentTextbookLinks(token) {
  const el = document.getElementById('textbookLinks');
  if (!el) return;
  try {
    const { data, error } = await sb.rpc('get_student_recordings', { p_token: token });
    if (error || !data) { el.innerHTML = ''; return; }
    const books = data.filter(function(r) { const n = r.name || ''; return n.startsWith('教材_') || n.startsWith('教材'); });
    if (!books.length) { el.innerHTML = ''; return; }
    el.innerHTML = books.map(function(r) {
      const label = (r.name || '').replace(/^教材_/, '') || '教科書';
      return '<a class="btn-sm" href="' + escHtml(safeHref(r.url)) + '" target="_blank" rel="noopener" style="background:var(--gold-light);color:var(--gold-deep);text-decoration:none;display:inline-flex;margin:0 6px 8px 0;">📖 ' + escHtml(label) + '</a>';
    }).join('');
  } catch (e) { el.innerHTML = ''; }
}

// 學生：顯示「開啟我的 Google Drive 資料夾」連結（老師上傳後才會有）
// 2026-07-18 改（Lin 要求）：這張卡現在只留這顆 Drive 按鈕，不再直接列檔案清單/下載鈕
async function loadStudentFolderLink(token) {
  const el = document.getElementById('driveFolderLink');
  if (!el) return;
  try {
    const { data, error } = await sb.rpc('get_student_folder', { p_token: token });
    if (error || !data) {
      el.innerHTML = '<div style="text-align:center;color:var(--ink-muted);font-family:\'Noto Sans TC\',sans-serif;font-size:0.85rem;padding:8px 0;">尚無課堂資料<br><span style="font-size:0.78rem;">課後老師上傳後即可在此下載</span></div>';
      return;
    }
    el.innerHTML = '<a class="meet-btn" href="' + escHtml(safeHref(data)) + '" target="_blank" rel="noopener" style="background:linear-gradient(135deg,var(--gold-bright),var(--gold-deep));font-size:0.95rem;padding:12px 20px;">📁 開啟我的 Google Drive 資料夾</a>' +
      '<p class="meet-link-text" style="margin-top:6px;">這裡有老師上傳的所有課堂資料</p>';
  } catch(e) { el.innerHTML = ''; }
}
