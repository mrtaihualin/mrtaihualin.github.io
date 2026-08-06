// GEN LINK MODAL（入班連結：姓名+Meet+課程資訊 → 建立學生 + 產生附課程摘要的連結）
// ============================================================
let genPendingToken = '';

// 常用時區清單（給「學生所在時區」下拉選單用）── 空值 = 不轉換，照老師自己的時間顯示（跟舊版行為一致）
const TZ_OPTIONS = [
  { v: '',                  label: '— 不轉換 —' },
  { v: 'Asia/Taipei',       label: '🇹🇼 台灣' },
  { v: 'Asia/Hong_Kong',    label: '🇭🇰 香港' },
  { v: 'Asia/Kuala_Lumpur', label: '🇲🇾 馬來西亞' },
  { v: 'Asia/Bangkok',      label: '🇹🇭 泰國' }
];
function populateGenStudentTzDropdown() {
  document.getElementById('genStudentTz').innerHTML =
    TZ_OPTIONS.map(function(t) { return '<option value="' + t.v + '">' + t.label + '</option>'; }).join('');
}
// 把一個絕對時間點（Date 物件）換算成某個時區當地的日期／時間／星期幾

// 2026-07-14 加：跟 teacherTimeToDate 相反方向——把「某個時區的 wall-clock 時間」換算成
// 絕對時間點（Date）。teacherTimeToDate 只能處理泰國（固定 +07:00，泰國沒有日光節約時間，
// 這樣寫死沒問題），但學生可能在任何時區（可能有日光節約時間），所以要用「查那一天那個時區
// 實際的 UTC 偏移量」的寫法（跟 supabase/functions/class-reminder-cron/index.ts 的
// localToUtcMs 同一招）。

// 2026-07-14 加（Lin 要求）：任何要「傳給學生看」的時間，一律換算成學生自己的時區顯示 —
//   不管是誰改的時間、用哪個功能改的，都要一致。傳給「老師自己」看的維持泰國時間不變
//   （老師習慣用泰國時間工作，這是老師自己要的）。
//   studentTz 有填 → 換算成他自己的時間（不用特別標時區名字，反正就是他自己的時間，不會搞混）
//   studentTz 沒填（舊資料/還沒設定過）→ 退回泰國時間，並清楚標「泰國時間」提醒可能跟學生本地時間不同

// 2026-07-17 加（Lin 要求）：跟 studentFacingTimeLabel 一樣換算時區，但不附加「（你的當地時間）」
// 這種註記——給「列出好幾個時間」的地方用（例如老師提議的 1-3 個新時間），註記只要在最後
// 統一寫一次就好，不用每一行都重複講一次是不是本地時間。

let genLinkGenerated = false; // true = 連結已產生，按鈕變成「關閉」

function openGenLinkModal() {
  document.getElementById('genName').value = '';
  document.getElementById('genTokenPreview').style.display = 'none';
  document.getElementById('genStartDate').value = '';
  lockDateInputToFuture('genStartDate'); // 🔴 2026-07-26 (Lin เลือกให้บล็อกด้วย)：開課日期 ใช้สร้างคาบใน Calendar จริง ห้ามย้อนหลัง
  resetTimeDropdown('genClassTime');
  populateGenStudentTzDropdown();
  document.getElementById('genStudentTz').value = '';
  document.getElementById('genWeeklyRecurring').checked = true;
  document.getElementById('genScheduleHint').style.display = 'none';
  document.getElementById('genLinkResult').style.display = 'none';
  document.getElementById('genLinkOutput').value = '';
  populateGenCourseDropdown();
  genPendingToken = '';
  genLinkGenerated = false;
  const submitBtn = document.getElementById('genModalSubmitBtn');
  submitBtn.disabled = false; submitBtn.textContent = '入班連結';
  document.getElementById('genLinkModal').classList.add('open');
  setTimeout(() => document.getElementById('genName').focus(), 100);
}
function closeGenLinkModal() { document.getElementById('genLinkModal').classList.remove('open'); }

// 只有一顆按鈕：還沒產生連結 → 執行「入班連結」；已經產生了 → 直接關視窗
function genModalSubmitClick() {
  if (genLinkGenerated) { closeGenLinkModal(); return; }
  genLinkAddStudent();
}

function previewGenToken() {
  const name = document.getElementById('genName').value.trim();
  if (!name) { document.getElementById('genTokenPreview').style.display = 'none'; return; }
  genPendingToken = generateToken(name);
  const baseUrl = window.location.origin + window.location.pathname;
  document.getElementById('genTokenPreview').textContent = '🔗 ' + baseUrl + '?s=' + genPendingToken + '…';
  document.getElementById('genTokenPreview').style.display = 'block';
}

const WEEKDAY_ZH = ['日','一','二','三','四','五','六'];
function onGenScheduleChange() {
  const dateVal = document.getElementById('genStartDate').value;
  const timeVal = document.getElementById('genClassTime').value;
  const tzVal = document.getElementById('genStudentTz') ? document.getElementById('genStudentTz').value : '';
  const hint = document.getElementById('genScheduleHint');
  if (!dateVal || !timeVal) { hint.style.display = 'none'; return; }
  if (!isValidTimeStr(timeVal)) { hint.style.display = 'block'; hint.textContent = '⚠️ 時間格式不對，請用 HH:MM，例如 14:30'; return; }
  // 2026-07-10：改用 teacherTimeToDate（固定泰國 +07:00）+ formatInTz，不再用瀏覽器本地時區的
  // start.getMonth()/getDate()/getDay()，避免這台電腦時區設錯時連老師自己看到的預覽都跟著算錯。
  const start = teacherTimeToDate(dateVal, timeVal);
  const teacherParts = formatInTz(start, TEACHER_TZ);
  hint.style.display = 'block';
  // 2026-07-11 簡化：只留兩個事實 — 老師幾點教、學生幾點上課
  let text = '👩‍🏫 老師上課時間：週' + WEEKDAY_ZH[teacherParts.weekday] + ' ' + timeVal;
  if (tzVal) {
    const conv = formatInTz(start, tzVal);
    text += '　｜　🧑‍🎓 學生上課時間：週' + WEEKDAY_ZH[conv.weekday] + ' ' + conv.timeStr;
  } else {
    text += '　｜　🧑‍🎓 學生上課時間：同上（未選學生時區）';
  }
  hint.textContent = text;
}

// ── 課程方案下拉（沿用付款流程用的 COURSE_TYPES，避免另外維護一份課程資料）──
function populateGenCourseDropdown() {
  const sel = document.getElementById('genCourse');
  // 2026-07-11：加「自訂（單堂購買）」選項，跟 pay.html 繳費頁的自訂單堂購買同一種概念——
  // 不鎖定堂數方案，學生會在繳費頁自己填單堂購買的堂數／單價。
  sel.innerHTML = '<option value="">— 不指定 —</option>' +
    COURSE_TYPES.map(function(c) { return '<option value="' + c.id + '">' + c.label + '</option>'; }).join('') +
    '<option value="custom">自訂（單堂購買）</option>';
  document.getElementById('genPack').innerHTML = '';
  document.getElementById('genCoursePreview').style.display = 'none';
  hideGenBonusField();
}

// 2026-07-14 新增（Lin 要求）：優惠堂數（贈送）欄位，每個方案（含自訂）都能填。
// 選堂數時先帶入舊規則的自動預設值（20堂送1／30堂送3，自訂預設0），Lin 隨時可以自己改成別的數字，
// 改完的數字會存進 pending_bonus_lessons，之後付款頁/課程摘要卡都改讀這個真實數字，不再是死公式。
function hideGenBonusField() {
  document.getElementById('genBonusLabel').style.display = 'none';
  document.getElementById('genBonus').style.display = 'none';
  document.getElementById('genBonus').value = '';
}
function showGenBonusField(defaultVal) {
  document.getElementById('genBonusLabel').style.display = 'block';
  document.getElementById('genBonus').style.display = 'block';
  document.getElementById('genBonus').value = defaultVal;
}
// 老師手動改優惠堂數 → 只更新價格預覽文字，不要動堂數/其他欄位
function onGenBonusInput() {
  const courseId = document.getElementById('genCourse').value;
  if (!courseId || courseId === 'custom') return;
  const c = COURSE_TYPES.find(function(x) { return x.id === courseId; });
  if (!c) return;
  const lessons = parseInt(document.getElementById('genPack').value, 10) || 0;
  renderGenCoursePreview(c, lessons);
}
function onGenCourseChange() {
  const courseId = document.getElementById('genCourse').value;
  let packSel = document.getElementById('genPack');
  const preview = document.getElementById('genCoursePreview');
  if (courseId === 'custom') {
    // 2026-07-11 改（Lin 要求）：自訂方案的堂數以前完全不填，留給學生自己在繳費頁決定；
    // 現在改成老師這裡就直接「輸入堂數」（換成數字輸入框，跟原本的堂數下拉共用 id="genPack"，
    // 這樣 genLinkAddStudent() 讀 .value 的地方完全不用改）。
    if (packSel.tagName !== 'INPUT') {
      packSel.outerHTML = '<input class="settings-input" type="number" id="genPack" min="1" step="1" placeholder="輸入堂數" oninput="onGenPackChange()" />';
    } else {
      packSel.value = '';
    }
    showGenBonusField(0); // 2026-07-14：自訂方案以前完全沒有優惠堂數，現在也能填了
    preview.style.display = 'block';
    preview.textContent = '💡 自訂方案：請直接輸入這期共幾堂課（單價／一對一或雙人共學，學生會在繳費頁自己選）。上面「優惠堂數」可填加送幾堂。';
    return;
  }
  if (packSel.tagName !== 'SELECT') {
    packSel.outerHTML = '<select class="settings-input" id="genPack" onchange="onGenPackChange()"></select>';
    packSel = document.getElementById('genPack');
  }
  const c = COURSE_TYPES.find(function(x) { return x.id === courseId; });
  if (!c) { packSel.innerHTML = ''; preview.style.display = 'none'; hideGenBonusField(); return; }
  packSel.innerHTML = c.packs.map(function(n) { return '<option value="' + n + '">' + n + ' 堂</option>'; }).join('');
  onGenPackChange();
}
function onGenPackChange() {
  const courseId = document.getElementById('genCourse').value;
  if (courseId === 'custom') return; // 自訂堂數：優惠堂數欄位維持老師自己填的值，換堂數不用重算
  const c = COURSE_TYPES.find(function(x) { return x.id === courseId; });
  const preview = document.getElementById('genCoursePreview');
  if (!c) { preview.style.display = 'none'; hideGenBonusField(); return; }
  const lessons = parseInt(document.getElementById('genPack').value, 10) || 0;
  const autoBonus = typeof slipBonusFor === 'function' ? slipBonusFor(lessons) : 0;
  showGenBonusField(autoBonus); // 換堂數 → 重新帶入自動預設值（老師隨時可以自己改成別的數字）
  renderGenCoursePreview(c, lessons);
}
function renderGenCoursePreview(c, lessons) {
  const preview = document.getElementById('genCoursePreview');
  const bonus = parseInt(document.getElementById('genBonus').value, 10) || 0;
  const total = lessons * (c.priceNTD || 0);
  preview.style.display = 'block';
  preview.textContent = '💰 NTD ' + total.toLocaleString() + '（THB ' + (lessons * (c.priceTHB || 0)).toLocaleString() + '）' +
    (bonus ? '・贈 ' + bonus + ' 堂' : '');
}

function copyGeneratedLink() {
  const input = document.getElementById('genLinkOutput');
  if (!input.value) return;
  navigator.clipboard.writeText(input.value).then(function() {
    const btn = document.getElementById('genLinkCopyBtn');
    const orig = btn.innerHTML;
    btn.innerHTML = '✅ 已複製'; btn.classList.add('copied');
    setTimeout(function() { btn.innerHTML = orig; btn.classList.remove('copied'); }, 2000);
  });
}

// 2026-07-08 改版：入班連結不再馬上建 Meet／Drive。
// 只先把「老師預先設定的課程/課表」存進 classroom_students 的 pending_* 欄位，
// setup_status = 'pending'，meet 留空。真正建立 Meet/Drive 的動作延後到
// 老師在「待審核繳費」按下「✅ 確認收款」時才觸發（見 approveSlip()），
// 這樣才符合「學生付款前不建立任何資源」的要求。
async function genLinkAddStudent() {
  const name = document.getElementById('genName').value.trim();
  if (!name) { alert('請填寫學生姓名'); return; }
  let token = genPendingToken || generateToken(name);
  while (studentsCache[token]) token = generateToken(name);

  const courseId   = document.getElementById('genCourse').value;
  const lessons    = parseInt(document.getElementById('genPack').value, 10) || null;
  // 2026-07-14 新增：優惠堂數（贈送），老師自己填的真實數字，不指定課程方案時沒有欄位所以是 null
  const bonusRaw   = document.getElementById('genBonus').value;
  const bonusLessons = (courseId && bonusRaw !== '') ? (parseInt(bonusRaw, 10) || 0) : null;
  const startDate  = document.getElementById('genStartDate').value || null; // 老師自己時區的日期
  // 🔴 2026-07-26 ชั้นที่ 2 (Lin เลือกให้บล็อก)：ไม่กรอกได้ (ยังไม่รู้วันเปิดคอร์ส) แต่ถ้ากรอก ห้ามย้อนหลัง
  if (startDate && !assertNotPastDate(startDate, '開課日期')) return;
  const classTimeRaw = document.getElementById('genClassTime').value.trim();
  if (classTimeRaw && !isValidTimeStr(classTimeRaw)) {
    alert('⚠️ 上課時間格式不對，請用 HH:MM，例如 14:30');
    return;
  }
  const classTime  = classTimeRaw || null; // 老師自己時區的時間
  const studentTz  = document.getElementById('genStudentTz').value || null;
  const recurringChecked = document.getElementById('genWeeklyRecurring').checked;
  // 2026-07-11 修 bug（Lin 回報：明明有勾「每週固定上課」，Google Calendar 卻沒有每週重複）：
  // 真正原因查到了——之前這裡只要「開課日期」或「上課時間」有一個沒填，就會悄悄把 recurring
  // 改成 false，完全不會提醒老師。結果 Lin 只填了日期、忘了填時間，勾勾照樣打勾，
  // 但存進資料庫的 pending_recurring 卻默默變成 false，老師完全不知道。
  // 改法：勾了「每週固定上課」卻沒把日期+時間兩個都填齊 → 直接擋下來、跳出明確提醒，
  // 不讓它悄悄退化成「不重複」（RELIABILITY FIRST：失敗要吵，不能默默吞掉）。
  if (recurringChecked && (!startDate || !classTime)) {
    alert('⚠️ 已勾選「🔁 每週固定上課」，但「開課日期」或「上課時間」還沒填齊。\n兩個都要填，系統才能真的設定成每週重複；否則請取消勾選「每週固定上課」再送出。');
    return;
  }
  const recurring  = recurringChecked && !!(startDate && classTime);

  const saveBtn = document.getElementById('genModalSubmitBtn');
  saveBtn.disabled = true; saveBtn.textContent = '儲存中…';
  const { error } = await sb.from('classroom_students').insert({
    token, name, meet: null, setup_status: 'pending',
    pending_course_id: courseId || null,
    pending_lessons: lessons,
    pending_bonus_lessons: bonusLessons,
    pending_start_date: startDate,
    pending_class_time: classTime,
    pending_student_tz: studentTz,
    pending_recurring: recurring
  });
  saveBtn.disabled = false; saveBtn.textContent = '入班連結';
  if (error) { alert('新增失敗：' + error.message + '\n（如果錯誤訊息提到 pending_ 開頭的欄位不存在，代表 Supabase 資料庫還沒加新欄位，要先請 Lin 執行 SQL）'); return; }

  // 2026-07-08：老師傳給學生的連結改成「繳費・入班頁」pay.html（付款方式＋課程＋上課連結都在裡面）。
  // 學生在 pay.html 繳費 → 老師確認收款後，pay.html 裡的上課連結（?s=token）才開通。
  // token 一樣走資料庫即時狀態，不把資訊凍結在網址裡。
  const payBase = window.location.origin + window.location.pathname.replace(/[^/]*$/, '') + 'pay.html';
  const link = payBase + '?s=' + token;
  document.getElementById('genLinkOutput').value = link;
  document.getElementById('genLinkResult').style.display = 'block';
  genLinkGenerated = true;
  saveBtn.disabled = false; saveBtn.textContent = '✅ 已產生（按此關閉）';

  await refreshStudentList();
}

// ============================================================
// EDIT MEET LINK
// ============================================================
let editingToken = '';

function openEditMeetModal(token) {
  const s = studentsCache[token];
  if (!s) return;
  editingToken = token;
  document.getElementById('editNameInput').value = s.name;
  document.getElementById('editMeetOld').textContent = s.meet;
  document.getElementById('editMeetInput').value = s.meet;
  document.getElementById('editEntryLinkInput').value = s.custom_entry_link || '';
  document.getElementById('editMeetModal').classList.add('open');
  setTimeout(() => document.getElementById('editNameInput').select(), 100);
}
function closeEditMeetModal() { document.getElementById('editMeetModal').classList.remove('open'); }

// 改學生姓名／Meet 連結（2026-07-06 新增改名功能，Lin 要求要安全，不能讓舊檔案不見）
// 安全流程：
//   1) 姓名有改 → 先把 Google Drive 學生資料夾「改名」（同一個 folder id，只改 name，舊檔案都還在同一個資料夾裡，不是新建）
//   2) Drive 改名成功後，才更新 Supabase classroom_students.name
//   3) 任何一步失敗都要跳出明顯警告＋停手，不能悄悄改一半，避免 Drive 跟資料庫的名字對不起來（RELIABILITY FIRST）
async function saveStudentEdit() {
  const newName = document.getElementById('editNameInput').value.trim();
  const newMeet = normalizeMeet(document.getElementById('editMeetInput').value);
  const newEntryLink = document.getElementById('editEntryLinkInput').value.trim();
  if (!newName) { alert('請填寫學生姓名'); return; }
  if (!newMeet) { alert('請填寫 Meet 連結'); return; }

  const s = studentsCache[editingToken];
  const oldName = s ? s.name : null;
  const nameChanged = !!(oldName && newName !== oldName);

  const saveBtn = document.querySelector('#editMeetModal .btn-gold');
  saveBtn.disabled = true; saveBtn.textContent = '儲存中…';

  // Step 1：姓名有改 → 先同步改 Google Drive 資料夾名稱（用舊名找到「現有」資料夾再改名，不會新建）
  if (nameChanged) {
    try {
      const folderId = await gdGetStudentFolderId(oldName);
      await gdRenameFolder(folderId, newName);
    } catch (e) {
      saveBtn.disabled = false; saveBtn.textContent = '儲存';
      alert('❌ 改名失敗：Google Drive 資料夾改名沒有成功，姓名還沒有更新（避免資料夾跟資料庫對不上）。\n錯誤訊息：' + (e.message || e) + '\n請確認 Google 授權還有效後再試一次。');
      return; // 停手，不繼續改 Supabase
    }
  }

  // Step 2：Drive 那邊沒問題了（或姓名根本沒改）→ 才更新 Supabase
  // 2026-07-08：老師手動填了 Meet 連結 = 等於確認開通 → 一併把 setup_status 設成 confirmed，
  // 否則學生頁的閘門（只看 confirmed）會讓學生還是進不去（這是之前卡住的第二個原因）。
  // 2026-07-11：新增 custom_entry_link（老師自訂入班連結，留空就用系統自動產生的），
  // 跟其他學生欄位一樣直接寫進 classroom_students，走同一個 update。
  // 2026-07-15 修：以前這裡只看 error，沒確認真的有 row 被改到——RLS 擋掉的話會顯示
  // 「儲存成功」但資料庫其實沒變。改成用 .select() 檢查 data.length。
  let res = await sb.from('classroom_students').update({ name: newName, meet: newMeet, setup_status: 'confirmed', custom_entry_link: newEntryLink || null }).eq('token', editingToken).select();
  let error = res.error || ((!res.data || !res.data.length) ? { message: '資料庫沒有真的更新到（可能是 RLS 權限問題）' } : null);
  if (res.error && /custom_entry_link/.test(res.error.message || '')) {
    // Supabase 資料庫還沒加這個欄位 → 先不帶這欄位重存一次，姓名/Meet 還是要能正常存
    console.warn('custom_entry_link 欄位可能還沒建立，改用不含此欄位的方式儲存：', res.error.message);
    const retry = await sb.from('classroom_students').update({ name: newName, meet: newMeet, setup_status: 'confirmed' }).eq('token', editingToken).select();
    error = retry.error || ((!retry.data || !retry.data.length) ? { message: '資料庫沒有真的更新到（可能是 RLS 權限問題）' } : null);
    if (!error) alert('⚠️ 姓名／Meet 連結已儲存，但「自訂入班連結」還沒存成功——資料庫缺少 custom_entry_link 欄位，請先請 Lin 在 Supabase 執行對應的 SQL 再重試一次。');
  }
  saveBtn.disabled = false; saveBtn.textContent = '儲存';
  if (error) {
    if (nameChanged) {
      alert('⚠️ 注意：Google Drive 資料夾已經改名成功，但資料庫更新失敗！\n請重新整理頁面後再按一次「儲存」，否則姓名會顯示不一致。\n錯誤訊息：' + error.message);
    } else {
      alert('更新失敗：' + error.message);
    }
    return;
  }
  closeEditMeetModal();
  await refreshStudentList();
  const dd = document.getElementById('stuDropdown');
  if (dd) dd.value = editingToken;
  selectStudent(editingToken); // 改完馬上刷新右邊的學生面板，姓名/連結立刻顯示新的
}

// 2026-07-08：一鍵補上「已付款、已確認，但 Meet 連結還沒建好」的學生的課堂連結。
// 用於 Meet 自動建立失敗（例如 Google 授權過期）後的補救，讓學生頁的「課堂連結準備中」變成可用連結。
async function repairMeet(token) {
  var s = studentsCache[token];
  if (!s) return;

  // 2026-07-14 加：舊生從「📦 舊生列表」恢復回來之後，舊的課表日期會被清空
  // （比照全新學生，要重新選一次日期，見 restoreStudent()）——這裡補問一次新日期/時間，
  // 不然照舊用空白的 pending_start_date 建立，會變成沒有固定課表的 Meet。
  if (!s.pending_start_date || !s.pending_class_time) {
    var newDate = prompt('這位學生還沒有排課表日期，請輸入開課日期（格式 YYYY-MM-DD，例如 2026-08-01）：', '');
    if (!newDate) { alert('沒有輸入日期，已取消。'); return; }
    var newTime = prompt('請輸入上課時間（老師自己泰國時區，格式 HH:MM，例如 14:30）：', '');
    if (!newTime || !isValidTimeStr(newTime)) { alert('時間格式不對或沒有輸入，已取消。'); return; }
    var newRecurring = confirm('是否為「每週固定上課」？\n（按「確定」＝是，每週重複／按「取消」＝否，只有這一次）');
    var scheduleUpd = { pending_start_date: newDate, pending_class_time: newTime, pending_recurring: newRecurring };
    var scheduleRes = await sb.from('classroom_students').update(scheduleUpd).eq('token', token).select();
    if (scheduleRes.error || !scheduleRes.data || !scheduleRes.data.length) {
      alert('儲存課表失敗：' + (scheduleRes.error ? scheduleRes.error.message : '資料庫沒有真的更新到（可能是 RLS 權限問題）'));
      return;
    }
    Object.assign(s, scheduleUpd);
  }

  if (!confirm('要為「' + s.name + '」建立課堂 Meet 連結嗎？（會同時把學生設為已開通）')) return;
  // 2026-07-11：跟「確認收款」共用同一把鎖（_studentSetupLocks），避免 Lin 同時點這顆按鈕
  // 和「確認收款」（或開兩個分頁各點一次）→ 兩邊各自建一份 Meet + 時刻表，變成重複資料。
  if (_studentSetupLocks.has(token)) { alert('這位學生正在建立課堂連結中，請稍等一下再試一次。'); return; }
  _studentSetupLocks.add(token);
  try {
    // 動手前先問資料庫最新狀態，如果剛好已經有別的地方建好了（例如同時點了確認收款），
    // 就直接沿用，不要再建第二次。
    try {
      var freshRes = await sb.from('classroom_students').select('setup_status,meet').eq('token', token).single();
      if (!freshRes.error && freshRes.data && freshRes.data.setup_status === 'confirmed' && freshRes.data.meet) {
        s.meet = freshRes.data.meet; s.setup_status = 'confirmed';
        alert('✅ 課堂連結已經建立好了（剛剛已由其他操作建立），不用重複建立。');
        await refreshStudentList();
        selectStudent(token);
        return;
      }
    } catch (e) { /* 查詢失敗就照舊往下走，不擋主流程 */ }

    await ensureGoogleReady();
    var meet = await createMeetLinkForStudent(s.name, {
      startDate: s.pending_start_date, classTime: s.pending_class_time, recurring: !!s.pending_recurring
    });
    var res = await sb.from('classroom_students').update({ meet: meet, setup_status: 'confirmed' }).eq('token', token).select();
    if (res.error || !res.data || !res.data.length) {
      alert('⚠️ Meet 建好了但寫入資料庫失敗：' + (res.error ? res.error.message : '資料庫沒有真的更新到（可能是 RLS 權限問題）'));
      return;
    }
    s.meet = meet; s.setup_status = 'confirmed';
    // Drive 資料夾 best-effort（跟確認收款時一樣，缺就補）
    try {
      await gdGetStudentSubfolderId(s.name, '學習內容');
      await gdGetStudentSubfolderId(s.name, '影片');
      var rf = await gdGetStudentSubfolderId(s.name, '課表 & 收據');
      try { await gdShareAnyone(rf); } catch (e) {}
      try { await createBlankTimetable(s.name, token, rf); } catch (e) {}
      try { await ensureStudentFolderShared(s.name, token); } catch (e) {}
    } catch (e) { console.warn('補建資料夾失敗（可日後補）：', e); }
    alert('✅ 已建立課堂連結，學生頁已開通！');
    await refreshStudentList();
    selectStudent(token);
  } catch (e) {
    alert('❌ 建立失敗：' + (e.message || e) + '\n請確認已用 Google 登入授權後再試一次。');
  } finally {
    _studentSetupLocks.delete(token);
  }
}

// 2026-07-14：改成先呼叫 Edge Function unlink-line-student —
//   如果這個學生有綁 LINE，會先把他的 LINE 選單切回「win-back」版（避免封存後
//   選單卡在學生版、點「我的教室」變成「尚未綁定」很奇怪），再由 Edge Function
//   本身把資料庫那筆標記 archived_at（一次做完，避免切選單成功但標記失敗的競態）。
//   🆕 2026-07-14（第 2 版）：Edge Function 內部已改成 UPDATE archived_at，不再是 DELETE。
//   Edge Function 還沒部署/連不到時，自動退回原本「client 直接標記」的做法，
//   確保封存功能本身不會被新功能卡住（RELIABILITY FIRST：封存一定要成功或明確報錯）。
const LINE_UNLINK_ENDPOINT = 'https://qzkxlhpcputsvbqmtqfi.supabase.co/functions/v1/unlink-line-student';
const LINE_RESTORE_ENDPOINT = 'https://qzkxlhpcputsvbqmtqfi.supabase.co/functions/v1/restore-line-student';
// 2026-07-17 加：แก้ปัญหาจริง Jenny/Ling/育郁 — ผูกบัญชี LINE ก่อนแอด OA เป็นเพื่อน (ก่อนมีด่านกันใน link-line
// ที่เพิ่มเมื่อ 2026-07-16) ทำให้ Rich Menu ไม่เคยสลับเป็นเมนูนักเรียนสำเร็จ ทั้งที่ตอนนี้แอดเพื่อนแล้ว
// หน้านักเรียนเองมองว่า "ผูกแล้ว" (buildLineActionBtn เช็คแค่ line_user_id) เลยไม่มีปุ่มให้กดผูกซ้ำอีก
// → ให้ครูกดสั่งสลับเมนูเองจากหน้า admin ได้เลย ไม่ต้องรบกวนนักเรียน (ดูปุ่ม "🔄 同步 LINE 選單" ใน selectStudent())
const SYNC_LINE_MENU_ENDPOINT = 'https://qzkxlhpcputsvbqmtqfi.supabase.co/functions/v1/sync-line-menu';
// 2026-07-15 加：เช็ค+ส่งเตือน "โควต้าใกล้หมด" ทันทีตอนบันทึกเข้าเรียน (แทนที่จะรอ cron วันละครั้ง)
// เผื่อคาบที่เพิ่งบันทึกเป็นคาบสุดท้ายของรอบพอดี นักเรียนจะได้รับ LINE เตือนทันทีวันนั้นเลย ไม่ต้องรอถึงพรุ่งนี้เช้า
const LOW_QUOTA_CHECK_ENDPOINT = 'https://qzkxlhpcputsvbqmtqfi.supabase.co/functions/v1/low-quota-cron';

// 2026-07-14 加（SECURITY FIRST）：以前這兩個 Edge Function 呼叫都只帶公開的 anonKey 當
// Authorization，等於誰都能照樣打這個 API 封存/恢復任何學生，不用真的登入成老師。
// 現在改成帶「老師真的登入的 session token」，Edge Function 那邊會驗證這個 token 真的屬於
// 老師的信箱才放行（跟 teacherSendOtp/teacherVerifyOtp 用的同一個登入 session）。
async function teacherAuthHeader() {
  try {
    const { data } = await sb.auth.getSession();
    const accessToken = data && data.session && data.session.access_token;
    return accessToken || window.SUPABASE_CONFIG.anonKey; // 沒 session 就退回 anonKey（Edge Function 會拒絕，不會誤放行）
  } catch (e) { return window.SUPABASE_CONFIG.anonKey; }
}

// 🔴 2026-07-26 เพิ่ม (RELIABILITY FIRST — จากอาการจริงที่เจอวันนี้)
// ────────────────────────────────────────────────────────────────────────────────
// อาการ: ครูเปิดแท็บหน้าห้องเรียนทิ้งไว้ข้ามคืน พอกด "✅ 今日上課" ขึ้น
//   "記錄失敗：new row violates row-level security policy for table classroom_attendance"
// ตรวจแล้ว: ทั้งด่าน RLS และฟังก์ชัน record_attendance_increment() ในฐานข้อมูล "ถูกต้องอยู่แล้ว"
//   ต้นตอจริงคือ session (การล็อกอิน) ของครูหมดอายุไปเงียบๆ → Supabase มองเป็นคนแปลกหน้า เลยโดนด่านเด้ง
//   เดิมโค้ดเช็คการล็อกอิน "แค่ครั้งเดียวตอนเปิดหน้า" หลังจากนั้นไม่เคยเช็คอีกเลย
// วิธีแก้ 2 ชั้น:
//   ชั้น 1  ensureTeacherSession()  → เช็คก่อนเขียนข้อมูลทุกครั้ง หมดอายุ = หยุด + บอกให้ล็อกอินใหม่
//   ชั้น 2  writeErrorMessage()     → ถ้าเขียนพังจริง แปล error ดิบของ Postgres เป็นภาษาคนก่อนโชว์
// ⚠️ ทั้ง 2 ตัว "ห้ามฟันธงว่าหมดอายุเพราะเน็ตหลุด" — ถ้าเช็คไม่ได้เพราะเน็ต ให้ปล่อยผ่านไปก่อน
//   (ตัวเขียนจริงจะฟ้องเองอยู่แล้ว) ไม่งั้นเน็ตกระตุกทีเดียวจะเด้งครูออกจากระบบทั้งที่ยังล็อกอินอยู่

// error ของ getUser() แบบไหน = "เน็ตมีปัญหา" (เช็คไม่ได้) ไม่ใช่ "token ใช้ไม่ได้"
function isRetryableAuthError(err) {
  if (!err) return false;
  if (err.name === 'AuthRetryableFetchError') return true;
  if (err.status === 0 || err.status >= 500) return true;
  return /fetch|network|timeout|offline|Load failed/i.test(String(err.message || ''));
}
// ยิงถาม server จริงว่า token ตอนนี้ยังใช้ได้ไหม (getSession อ่านจากเครื่องตัวเองอย่างเดียว เชื่อไม่ได้)
// คืน true = ให้ทำต่อได้ · false = หยุด (แจ้งครูเรียบร้อยแล้ว)
// silent = true → แค่คืนค่า ไม่เด้ง alert และไม่เด้งกลับหน้าล็อกอิน
//   ใช้กับงานที่ "ทำงานเองอัตโนมัติ ไม่ได้มาจากการกดปุ่ม" (เช่นซิงค์ตารางตอนเปิดหน้า)
//   ไม่งั้นครูจะโดนกล่องเด้งขึ้นมาเองโดยไม่ได้กดอะไร แล้วจอถูกล้างกลางคันด้วย
async function ensureTeacherSession(actionLabel, silent) {
  var label = actionLabel || '這個動作';
  var res;
  try { res = await sb.auth.getUser(); }
  catch (e) { return true; } // เช็คไม่ได้เพราะเน็ต → ไม่บล็อก
  if (res && res.error) {
    if (isRetryableAuthError(res.error)) return true; // เน็ตมีปัญหา ไม่ใช่หมดอายุ
    if (silent) { console.warn('[session] 登入過期，略過：' + label); return false; }
    alert('🔑 老師登入已經過期了。\n\n「' + label + '」沒有執行，資料完全沒有被改動。\n'
      + '請重新登入之後再做一次。\n\n（這不是資料庫壞掉，是分頁開太久沒動、登入失效了。）');
    try { if (typeof renderTeacherLogin === 'function') renderTeacherLogin(); } catch (e2) {}
    return false;
  }
  var email = res && res.data && res.data.user && res.data.user.email;
  if ((email || '').toLowerCase() !== TEACHER_EMAIL) {
    if (silent) { console.warn('[session] 不是老師帳號，略過：' + label); return false; }
    alert('🔑 目前登入的不是老師的帳號（' + (email || '沒有登入') + '）。\n\n「' + label + '」沒有執行。請用老師的帳號重新登入。');
    return false;
  }
  return true;
}
// แปล error ตอนเขียนข้อมูลให้เป็นภาษาคน — โดยเฉพาะ error ที่หน้าตาเหมือน RLS แต่จริงๆ คือ session หมดอายุ
async function writeErrorMessage(rawMsg, actionLabel) {
  var base = '❌ ' + (actionLabel || '這個動作') + '失敗：' + (rawMsg || '（資料庫沒有回傳錯誤訊息）');
  if (!/row.level security|violates|JWT|jwt|401|not authenticated|permission denied/i.test(String(rawMsg || ''))) return base;
  var loggedIn = true;
  try {
    var res = await sb.auth.getUser();
    if (res && res.error && !isRetryableAuthError(res.error)) loggedIn = false;
    else if (res && res.data && res.data.user) loggedIn = (res.data.user.email || '').toLowerCase() === TEACHER_EMAIL;
  } catch (e) { loggedIn = true; } // เช็คไม่ได้ → ไม่ฟันธง
  if (!loggedIn) {
    return '🔑 老師登入已經過期了，所以資料庫把這個動作擋掉了。\n\n「' + (actionLabel || '這個動作') + '」沒有成功，資料沒有被改動。\n'
      + '請重新登入之後再做一次。\n\n（原始訊息：' + rawMsg + '）';
  }
  return base + '\n\n（登入是正常的，所以不是登入過期的問題——請截圖這個畫面給 Lin/AI 看。）';
}

// 2026-07-14（第 2 版，Lin 要求改成「封存」不要真的刪除資料）：
//   按這顆按鈕不再是永久刪除 —
//   (1) 先處理 Google Calendar：往後的固定課停掉、已經上過的課堂紀錄一律保留
//   (2) 再把 Google Drive 學生資料夾整個搬進「舊生」子資料夾（檔案都還在，只是換位置）
//   (3) 最後才把資料庫那筆標記成「已封存」(archived_at)，不是刪除 —
//       之後在「📦 舊生列表」裡隨時可以用「♻️ 恢復」按鈕救回來
//   (1)(2) 是 best-effort：失敗會跳警告請 Lin 自己去 Calendar/Drive 檢查，但不會擋住封存本身，
//   因為封存學生（讓他從常用名單消失）才是這顆按鈕最重要、最不能失敗的部分。
async function deleteStudent(token) {
  const name = studentsCache[token]?.name || token;
  if (!confirm('確定要把「' + name + '」封存成舊生嗎？\n\n・往後排定的課會停止，但已經上過的課堂紀錄都會保留\n・Google Drive 資料夾會整個搬進「舊生」資料夾，檔案不會不見\n・之後可以在「📦 舊生列表」隨時恢復')) return;

  const warnings = [];

  const calRes = await cancelFutureClassesForArchive(token);
  if (!calRes.ok) warnings.push('⚠️ Google Calendar 沒處理成功：' + calRes.error + '\n（不影響封存本身，請自己到 Calendar 手動處理往後的課）');

  const driveRes = await moveStudentFolderToArchive(name);
  if (!driveRes.ok) warnings.push('⚠️ Google Drive 資料夾沒搬成功：' + driveRes.error + '\n（資料還在原本位置，不影響封存本身，之後可以自己手動搬進「舊生」資料夾）');

  let handledByFunction = false;
  try {
    const r = await fetch(LINE_UNLINK_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': window.SUPABASE_CONFIG.anonKey,
        'Authorization': 'Bearer ' + (await teacherAuthHeader())
      },
      body: JSON.stringify({ token: token })
    });
    if (r.ok) handledByFunction = true;
  } catch (e) {
    // 連不到 Edge Function（例如還沒部署）→ 往下退回原本的直接標記
  }

  if (!handledByFunction) {
    const archRes = await sb.from('classroom_students').update({ archived_at: new Date().toISOString() }).eq('token', token).select();
    if (archRes.error || !archRes.data || !archRes.data.length) {
      alert('封存失敗：' + (archRes.error ? archRes.error.message : '資料庫沒有真的更新到（可能是 RLS 權限問題）'));
      return;
    }
  }
  await refreshStudentList();
  if (warnings.length) alert(warnings.join('\n\n'));
}

// 2026-07-14 加：從「📦 舊生列表」把封存的學生恢復成使用中。
// 2026-07-14（第 3 版，Lin 明確要求）：恢復舊生要「完全比照全新付款學生」——
//   Drive 資料夾「不」搬回來，永久留在「舊生」當歷史紀錄；之後建立 Meet 時會自動
//   生一個全新的資料夾（不管舊的還在不在，一律重新建立，不嘗試沿用）
//   Calendar 完全重來 — 舊的排課資訊清空，回到「setup_status = pending」（跟從沒
//   確認過收款的新學生一模一樣的狀態），等 Lin 用「🔧 補課堂連結」重新選一次日期/時間
//   LINE 綁定 (line_user_id) 不會被清掉，選單也會切回學生版。
async function restoreStudent(token) {
  const s = studentsCache[token];
  const name = (s && s.name) || token;
  if (!confirm('確定要把「' + name + '」從舊生恢復嗎？\n\n・原本「舊生」資料夾裡的 Drive 資料會留在原地當歷史紀錄，不會搬回來\n・之後建立 Meet 連結時，會自動建立一個全新的 Drive 資料夾\n・舊的上課時間會清空，回到「待確認收款」狀態，之後要重新選一次新的日期/時間\n・LINE 綁定狀態不會不見')) return;

  let handledByFunction = false;
  try {
    const r = await fetch(LINE_RESTORE_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': window.SUPABASE_CONFIG.anonKey,
        'Authorization': 'Bearer ' + (await teacherAuthHeader())
      },
      body: JSON.stringify({ token: token })
    });
    if (r.ok) handledByFunction = true;
  } catch (e) {
    // 連不到 Edge Function（例如還沒部署）→ 往下退回原本的直接標記
  }

  if (!handledByFunction) {
    const restRes = await sb.from('classroom_students').update({ archived_at: null }).eq('token', token).select();
    if (restRes.error || !restRes.data || !restRes.data.length) {
      alert('恢復失敗：' + (restRes.error ? restRes.error.message : '資料庫沒有真的更新到（可能是 RLS 權限問題）'));
      return;
    }
  }

  // 比照新學生：清空舊排課資訊，回到「待安排課表」狀態（critical 這步失敗要明確講，
  // 不能默默失敗讓舊資料留著混淆——RELIABILITY FIRST）
  const resetRes = await sb.from('classroom_students').update({
    setup_status: 'pending', meet: null,
    pending_start_date: null, pending_class_time: null, pending_recurring: null
  }).eq('token', token).select();
  if (resetRes.error || !resetRes.data || !resetRes.data.length) {
    alert('⚠️ 學生已經恢復回來了，但清空舊課表狀態失敗：' + (resetRes.error ? resetRes.error.message : '資料庫沒有真的更新到（可能是 RLS 權限問題）') + '\n（不影響恢復本身，可以之後用「✏️」手動調整，或再點一次「♻️ 恢復」重試這步）');
  } else if (s) {
    Object.assign(s, { setup_status: 'pending', meet: null, pending_start_date: null, pending_class_time: null, pending_recurring: null, archived_at: null });
  }

  await refreshStudentList();
  alert('✅ 已恢復「' + name + '」為使用中學生。\n下一步：點選這位學生 →「🔧 補課堂連結」→ 會請你輸入新的上課日期/時間，建立新的 Meet/Calendar。');
}

// 2026-07-17 加：手動幫已連結 LINE 的學生「重新同步」Rich Menu（改成學生版，出現 我的教室）。
//   用途：學生是「先連結網站帳號、後來才加 LINE 好友」的情況（舊資料，2026-07-16 以前發生過），
//   導致當時 LINE 不肯切選單、卡在一般版（體驗課）——現在已經加好友了，但學生頁面看起來「已連結」
//   （buildLineActionBtn 只看 line_user_id 有沒有值）不會再跳出連結按鈕讓他重新觸發一次。
//   這顆按鈕讓「老師」直接從後台把這個學生的選單切過去，不用麻煩學生做任何事。
async function syncLineMenu(token) {
  const s = studentsCache[token];
  const name = (s && s.name) || token;
  try {
    const r = await fetch(SYNC_LINE_MENU_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': window.SUPABASE_CONFIG.anonKey,
        'Authorization': 'Bearer ' + (await teacherAuthHeader())
      },
      body: JSON.stringify({ token: token })
    });
    const data = await r.json().catch(() => ({}));
    if (r.ok && data.ok) {
      alert('✅ 「' + name + '」的 LINE 選單已切換成學生版（我的教室）。');
      return;
    }
    const reasonMsg = {
      not_linked: '這位學生還沒連結過 LINE 帳號，不用同步。',
      not_friend: '這位學生還沒加 LINE 官方帳號好友（或已封鎖），要先請他加好友，加完再按一次這顆按鈕。',
      not_configured: '伺服器還沒設定好 STUDENT_RICH_MENU_ID / LINE_CHANNEL_ACCESS_TOKEN，要先在 Supabase 設定。',
      switch_failed: '呼叫 LINE API 失敗：' + (data.detail || ''),
    };
    alert('⚠️ 沒有切換成功：' + (reasonMsg[data.reason] || data.error || data.detail || ('HTTP ' + r.status)));
  } catch (e) {
    alert('❌ 同步失敗：' + (e.message || e) + '（請確認已用教師帳號登入後再試一次）');
  }
}
