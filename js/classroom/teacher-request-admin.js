// ============================================================
// FILE MAP: slip form/submission → pending queues → claims/verification → request processing → alternatives
// SLIP SYSTEM (student-initiated payment)
// ============================================================
let slipToken = null, slipType = null, slipLessons = null, slipBonus = 0, slipImageData = null, slipCurrency = null;
let pendingSlipId = null;
let slipLocked = false; // true = 老師已指定方案（入班前頁面），學生不能自己改選別的課程/堂數

// 共用按鈕樣式
var OFF_CUR  = 'flex:1;padding:9px;border-radius:9px;border:1.5px solid #e5d9b8;background:#fff;cursor:pointer;font-family:\'Noto Sans TC\',sans-serif;font-size:0.86rem;';
var ON_CUR   = 'flex:1;padding:9px;border-radius:9px;border:2px solid var(--gold-deep);background:#fdf6e3;cursor:pointer;font-family:\'Noto Sans TC\',sans-serif;font-size:0.86rem;font-weight:700;';
var OFF_PACK = 'min-width:88px;flex:1;padding:9px 6px;border-radius:9px;border:1.5px solid #e5d9b8;background:#fff;cursor:pointer;font-family:\'Noto Sans TC\',sans-serif;font-size:0.86rem;text-align:center;';
var ON_PACK  = 'min-width:88px;flex:1;padding:9px 6px;border-radius:9px;border:2px solid var(--gold-deep);background:#fdf6e3;cursor:pointer;font-family:\'Noto Sans TC\',sans-serif;font-size:0.86rem;text-align:center;';

// — Student: open slip modal —
// lock = { courseId, lessons } — 有給的話（入班前頁面）就只顯示老師指定的那個方案，
// 學生不能自己換成別的課程/堂數，避免跟老師談好的價錢對不起來
function openSlipModal(token, lock) {
  slipToken = token; slipType = null; slipLessons = null; slipBonus = 0; slipImageData = null; slipCurrency = null;
  slipLocked = !!(lock && lock.courseId && lock.lessons);
  var lockedCourse = slipLocked ? COURSE_TYPES.find(function(x) { return x.id === lock.courseId; }) : null;

  if (slipLocked && lockedCourse) {
    document.getElementById('slipCourseGrid').innerHTML =
      '<div class="course-card selected" style="cursor:default;grid-column:1 / -1;">' +
        '<div class="c-name">' + lockedCourse.label + '</div>' +
        '<div class="c-desc">' + lockedCourse.desc + '　·　老師已指定此方案</div>' +
      '</div>';
    var bonus = slipBonusFor(lock.lessons);
    document.getElementById('slipPackGrid').innerHTML =
      '<div class="course-card selected" style="cursor:default;min-width:88px;text-align:center;">' +
        '<div style="font-weight:700;">' + lock.lessons + ' 堂</div>' +
        (bonus ? '<div style="font-size:0.72rem;color:var(--gold-deep);">贈 ' + bonus + ' 堂</div>' : '') +
      '</div>';
    document.getElementById('slipPackWrap').style.display = 'block';
    document.getElementById('slipCurrencyWrap').style.display = 'block';
    slipType = lock.courseId; slipLessons = lock.lessons; slipBonus = bonus;
  } else {
    document.getElementById('slipCourseGrid').innerHTML = COURSE_TYPES.concat([{ id:'custom', label:'自訂（單堂購買）', desc:'不買課程包，單堂購買' }]).map(function(c) {
      return '<button class="course-card" id="sc-' + c.id + '" onclick="selectSlipType(\'' + c.id + '\')">' +
        '<div class="c-name">' + c.label + '</div>' +
        '<div class="c-desc">' + c.desc + '</div>' +
      '</button>';
    }).join('');
    document.getElementById('slipPackWrap').style.display = 'none';
    document.getElementById('slipPackGrid').innerHTML = '';
    document.getElementById('slipCustomWrap').style.display = 'none';
    document.getElementById('slipCurrencyWrap').style.display = 'none';
  }
  document.getElementById('slipBankBox').style.display = 'none';
  document.getElementById('slipActualAmountWrap').style.display = 'none';
  document.getElementById('slipAmountWarning').style.display = 'none';
  document.getElementById('curSelect').value = '';
  document.getElementById('ctBtn-1on1').style.cssText = OFF_CUR;
  document.getElementById('ctBtn-pair').style.cssText = OFF_CUR;
  document.getElementById('slipTotalBox').style.display = 'none';
  document.getElementById('slipPreviewImg').style.display = 'none';
  document.getElementById('slipUploadPlaceholder').style.display = '';
  document.getElementById('slipUploadArea').classList.remove('has-image');
  document.getElementById('slipFileInput').value = '';
  document.getElementById('slipModal').classList.add('open');
}

// 1) 選課程類型 → 顯示堂數選項（或「自訂」單堂購買）
function selectSlipType(id) {
  slipType = id; slipLessons = null; slipBonus = 0; slipCurrency = null;
  document.querySelectorAll('#slipCourseGrid .course-card').forEach(function(el) { el.classList.remove('selected'); });
  var el = document.getElementById('sc-' + id);
  if (el) el.classList.add('selected');
  document.getElementById('curSelect').value = '';
  document.getElementById('slipTotalBox').style.display = 'none';
  document.getElementById('slipBankBox').style.display = 'none';
  document.getElementById('slipActualAmountWrap').style.display = 'none';
  document.getElementById('slipAmountWarning').style.display = 'none';
  if (id === 'custom') {
    document.getElementById('slipPackWrap').style.display = 'none';
    document.getElementById('slipPackGrid').innerHTML = '';
    document.getElementById('slipCustomWrap').style.display = 'block';
    document.getElementById('ctBtn-1on1').style.cssText = OFF_CUR;
    document.getElementById('ctBtn-pair').style.cssText = OFF_CUR;
    document.getElementById('slipCustomLessons').value = 1;
    document.getElementById('slipCustomPricePer').value = '';
    document.getElementById('slipCurrencyWrap').style.display = 'block';
    return;
  }
  document.getElementById('slipCustomWrap').style.display = 'none';
  var c = COURSE_TYPES.find(function(x) { return x.id === id; });
  if (!c) return;
  document.getElementById('slipPackGrid').innerHTML = c.packs.map(function(n) {
    var bonus = slipBonusFor(n);
    return '<button type="button" id="pk-' + n + '" onclick="selectSlipPack(' + n + ')" style="' + OFF_PACK + '">' +
      '<div style="font-weight:700;">' + n + ' 堂</div>' +
      (bonus ? '<div style="font-size:0.72rem;color:var(--gold-deep);">贈 ' + bonus + ' 堂</div>'
             : (c.note ? '<div style="font-size:0.72rem;color:var(--ink-muted);">' + c.note + '</div>' : '')) +
    '</button>';
  }).join('');
  document.getElementById('slipPackWrap').style.display = 'block';
  document.getElementById('slipCurrencyWrap').style.display = 'none';
  if (c.packs.length === 1) selectSlipPack(c.packs[0]);
}

// 選「自訂」的教學類型 → 帶入參考單價（NTD 才自動帶，THB/Wise 留給老師手動填）
function selectSlipCustomType(t) {
  document.getElementById('ctBtn-1on1').style.cssText = t === '1on1' ? ON_CUR : OFF_CUR;
  document.getElementById('ctBtn-pair').style.cssText = t === 'pair' ? ON_CUR : OFF_CUR;
  if (slipCurrency === 'NTD') {
    document.getElementById('slipCustomPricePer').value = t === 'pair' ? 1500 : 1000;
  }
  renderSlipTotalAndBank();
}

// 2) 選堂數 → 顯示幣別
function selectSlipPack(n) {
  slipLessons = n; slipBonus = slipBonusFor(n);
  document.querySelectorAll('#slipPackGrid button').forEach(function(b) { b.style.cssText = OFF_PACK; });
  var b = document.getElementById('pk-' + n);
  if (b) b.style.cssText = ON_PACK;
  document.getElementById('slipCurrencyWrap').style.display = 'block';
  renderSlipTotalAndBank();
}

// 3) 選幣別 → 顯示金額 + 帳戶
function selectSlipCurrency(cur) {
  slipCurrency = cur;
  document.getElementById('curSelect').value = cur;
  if (slipType === 'custom' && cur === 'NTD') {
    var pricePerInput = document.getElementById('slipCustomPricePer');
    if (!pricePerInput.value) {
      var is1on1 = document.getElementById('ctBtn-1on1').style.cssText.indexOf('gold-deep') !== -1;
      var isPair = document.getElementById('ctBtn-pair').style.cssText.indexOf('gold-deep') !== -1;
      if (is1on1 || isPair) pricePerInput.value = isPair ? 1500 : 1000;
    }
  }
  renderSlipTotalAndBank();
}

// 只對「選現成方案」有效：比對學生填的「實際匯款金額」跟方案計算出來的金額是否一致
// 不一致不會擋送出（避免 OCR/計算誤判卡到真的付對錢的學生），只顯示黃色提醒讓老師確認時多留意
function checkSlipAmountMatch() {
  var warnBox = document.getElementById('slipAmountWarning');
  var input = document.getElementById('slipActualAmountInput');
  if (slipType === 'custom' || !slipType) { warnBox.style.display = 'none'; return; }
  var c = COURSE_TYPES.find(function(x) { return x.id === slipType; });
  if (!c || !slipLessons || !slipCurrency || !input || !input.value) { warnBox.style.display = 'none'; return; }
  var price = slipCurrency === 'NTD' ? c.priceNTD : c.priceTHB;
  if (!price) { warnBox.style.display = 'none'; return; }
  var amtCur = slipCurrency === 'WISE' ? 'THB' : slipCurrency;
  var expected = slipLessons * price;
  var actual = parseFloat(input.value) || 0;
  if (Math.round(actual) !== Math.round(expected)) {
    document.getElementById('slipExpectedAmountText').textContent = amtCur + ' ' + expected.toLocaleString();
    warnBox.style.display = 'block';
  } else {
    warnBox.style.display = 'none';
  }
}

function renderSlipTotalAndBank() {
  var totalBox = document.getElementById('slipTotalBox');
  var bankBox  = document.getElementById('slipBankBox');
  var actualWrap = document.getElementById('slipActualAmountWrap');
  var amtCur = slipCurrency === 'WISE' ? 'THB' : slipCurrency;

  if (slipType === 'custom') {
    actualWrap.style.display = 'none';
    var cLessons = parseInt(document.getElementById('slipCustomLessons').value, 10) || 0;
    var cPricePer = parseFloat(document.getElementById('slipCustomPricePer').value) || 0;
    if (!slipCurrency || !cLessons || !cPricePer) { totalBox.style.display = 'none'; bankBox.style.display = 'none'; return; }
    totalBox.style.display = 'block';
    document.getElementById('slipTotalText').textContent = amtCur + ' ' + (cLessons * cPricePer).toLocaleString() + (slipCurrency === 'WISE' ? '（透過 Wise）' : '');
    document.getElementById('slipCalcText').textContent  = cLessons + '堂 × ' + amtCur + ' ' + cPricePer + '/堂（自訂單堂購買）';
  } else {
    var c = COURSE_TYPES.find(function(x) { return x.id === slipType; });
    if (!c || !slipLessons || !slipCurrency) { totalBox.style.display = 'none'; bankBox.style.display = 'none'; actualWrap.style.display = 'none'; return; }
    // Wise 用 THB 基準金額；NTD 用台幣價
    var price = slipCurrency === 'NTD' ? c.priceNTD : c.priceTHB;
    totalBox.style.display = 'block';
    if (price) {
      document.getElementById('slipTotalText').textContent = amtCur + ' ' + (slipLessons * price).toLocaleString() + (slipCurrency === 'WISE' ? '（透過 Wise）' : '');
      document.getElementById('slipCalcText').textContent  = slipLessons + '堂 × ' + amtCur + ' ' + price + '/堂' + (slipBonus ? '（贈 ' + slipBonus + ' 堂）' : '') + (c.note ? ' · ' + c.note : '');
      actualWrap.style.display = 'block';
      document.getElementById('slipActualAmountInput').value = '';
      document.getElementById('slipAmountWarning').style.display = 'none';
    } else {
      document.getElementById('slipTotalText').textContent = amtCur + ' 金額請與老師確認';
      document.getElementById('slipCalcText').textContent  = c.label + ' · ' + slipLessons + ' 堂';
      actualWrap.style.display = 'none';
    }
  }
  // 2026-07-08 簡化：QR 裡本身就印了轉帳資訊（PromptPay QR 上面就有戶名/帳號/參考編號），
  // 不用再重複打一次文字，塞太多東西版面反而爆版。有 QR 就只放大顯示 QR，沒有 QR 才顯示文字帳戶資訊。
  var qrOnly = function(title, qrSrc, qrCap) {
    return '<div style="font-weight:700;margin-bottom:10px;">' + title + '</div>'
      + '<div style="text-align:center;">'
        + '<img src="' + qrSrc + '" alt="QR" style="width:170px;max-width:100%;border-radius:10px;display:inline-block;" onerror="this.parentNode.style.display=\'none\'">'
        + (qrCap ? '<div style="font-size:0.76rem;color:var(--ink-muted);margin-top:6px;">' + qrCap + '</div>' : '')
      + '</div>';
  };
  bankBox.style.display = 'block';
  if (slipCurrency === 'WISE') {
    bankBox.innerHTML = qrOnly('🌍 Wise（國際匯款）', WISE_INFO.qr, '打開 Wise App 掃這個 QR 付款') +
      '<div style="text-align:center;margin-top:8px;font-size:0.78rem;">或前往 <a href="' + WISE_INFO.siteUrl + '" target="_blank" rel="noopener" style="color:var(--gold-deep);font-weight:700;text-decoration:underline;">' + WISE_INFO.siteUrl + '</a> 網站轉帳</div>';
  } else {
    var b = BANK_INFO[slipCurrency];
    if (b.qr) {
      bankBox.innerHTML = qrOnly(b.title, b.qr, '掃 QR 轉帳');
    } else {
      var anyVal = b.lines.some(function(l) { return /[：:]\s*\S/.test(l); });
      bankBox.innerHTML = '<div style="font-weight:700;margin-bottom:6px;">' + b.title + '</div>'
        + b.lines.map(function(l) { return '<div>' + l + '</div>'; }).join('')
        + (anyVal ? '' : '<div style="color:var(--amber);font-size:0.78rem;margin-top:6px;">（老師尚未填寫帳戶，請用 LINE 向老師索取匯款資訊）</div>');
    }
  }
}

function handleSlipImage(file) {
  if (!file) return;
  var reader = new FileReader();
  reader.onload = function(e) {
    var img = new Image();
    img.onload = function() {
      var canvas = document.createElement('canvas');
      var maxW = 900, scale = Math.min(1, maxW / img.width);
      canvas.width = img.width * scale; canvas.height = img.height * scale;
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      slipImageData = canvas.toDataURL('image/jpeg', 0.75);
      document.getElementById('slipPreviewImg').src = slipImageData;
      document.getElementById('slipPreviewImg').style.display = 'block';
      document.getElementById('slipUploadPlaceholder').style.display = 'none';
      document.getElementById('slipUploadArea').classList.add('has-image');
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

function closeSlipModal() {
  document.getElementById('slipModal').classList.remove('open');
  slipToken = null; slipType = null; slipLessons = null; slipBonus = 0; slipImageData = null; slipCurrency = null;
}

async function submitSlip() {
  if (!slipType) { alert('請先選擇課程'); return; }
  var lessons, bonus, price, courseLabel;
  if (slipType === 'custom') {
    lessons = parseInt(document.getElementById('slipCustomLessons').value, 10) || 0;
    price = parseFloat(document.getElementById('slipCustomPricePer').value) || 0;
    bonus = 0;
    if (!lessons || !price) { alert('請填寫堂數和單價'); return; }
    var typeLabel = document.getElementById('ctBtn-pair').style.cssText.indexOf('gold-deep') !== -1 ? '雙人共學' : '一對一';
    courseLabel = '自訂・' + typeLabel + ' ' + lessons + '堂';
  } else {
    if (!slipLessons) { alert('請先選擇堂數'); return; }
    var c = COURSE_TYPES.find(function(x) { return x.id === slipType; }) || {};
    lessons = slipLessons;
    bonus = slipBonus;
    price = (slipCurrency === 'NTD' ? c.priceNTD : c.priceTHB) || 0;
    courseLabel = (c.label || slipType) + ' ' + lessons + '堂' + (bonus ? '（贈' + bonus + '）' : '');
  }
  if (!slipCurrency) { alert('請先選擇付款幣別'); return; }
  if (!slipImageData) { alert('請先上傳匯款截圖'); return; }
  var payCur = slipCurrency === 'WISE' ? 'THB' : slipCurrency; // Wise 金額以 THB 計
  courseLabel += (slipCurrency === 'WISE' ? '・Wise' : '');
  var total = lessons * price;
  var note = '';
  // 選現成方案時，如果學生填的「實際匯款金額」跟方案算出來的金額不同，寫進備註讓老師確認時看得到
  // （自訂模式不用檢查，因為金額本來就是學生自己填的單價 × 堂數，不會有「方案金額」這種東西可比對）
  if (slipType !== 'custom') {
    var actualInput = document.getElementById('slipActualAmountInput');
    var actualVal = actualInput ? parseFloat(actualInput.value) : NaN;
    if (!isNaN(actualVal) && Math.round(actualVal) !== Math.round(total)) {
      note = (note ? note + '\n' : '') + '⚠️ 學生填寫實際匯款金額為 ' + payCur + ' ' + actualVal.toLocaleString() + '（與方案金額 ' + payCur + ' ' + total.toLocaleString() + ' 不同，請確認）';
    }
  }
  // 2026-07-14 修正：改用既有的 currentStudentName()（理由同上，requestCancelClass 那顆）
  var studentName = currentStudentName(slipToken);
  var btn = document.getElementById('slipSubmitBtn');
  btn.disabled = true; btn.textContent = '送出中…';
  // ผ่าน RPC security-definer → บังคับ status='slip_submitted' ฝั่ง DB (anon เขียนตรงตารางไม่ได้แล้ว)
  var res = await sb.rpc('submit_payment_slip', {
    p_token: slipToken,
    p_student_name: studentName,
    p_course_id: slipType,
    p_course_label: courseLabel,
    p_lessons: lessons,
    p_bonus_lessons: bonus,
    p_price_per: price,
    p_currency: payCur,
    p_total_amount: total,
    p_note: note || null,
    p_slip_data: slipImageData
  });
  btn.disabled = false; btn.textContent = '📤 送出繳費通知';
  if (res.error) { alert('送出失敗：' + res.error.message); return; }
  if (typeof gtag === 'function') gtag('event', 'payment_slip_submitted', { category: 'course' });
  // 寄信通知老師（沿用全站既有的 Web3Forms，免後端）
  notifyTeacherNewSlip({ name: studentName, course: courseLabel, lessons: lessons, bonus: bonus, currency: payCur, total: total, note: note });
  closeSlipModal();
  // 顯示狀態於頁面，不用 alert
  var statusEl = document.getElementById('slipStatusMsg');
  if (statusEl) {
    statusEl.innerHTML = '<div style="background:#fef3c7;border-radius:9px;padding:10px 14px;font-family:\'Noto Sans TC\',sans-serif;font-size:0.85rem;color:#92400e;font-weight:600;margin-bottom:12px;">⏳ 已送出，等待老師確認<br><span style="font-weight:400;font-size:0.78rem;">' + courseLabel + '</span></div>';
  }
  loadStudentPayments(slipToken);
  loadStudentQuota(slipToken);
}

// 寄信通知老師有新的繳費通知（Web3Forms，與全站聯絡表單同一把 key）
function notifyTeacherNewSlip(d) {
  try {
    var body = {
      access_key: 'b3bfdb97-19dd-4910-bd15-89720be846c2',
      subject: '💰 新繳費通知 — ' + (d.name || '學生'),
      from_name: '線上教室系統',
      message: '學生：' + (d.name || '-') + '\n課程：' + (d.course || '-')
        + '\n堂數：' + (d.lessons || 0) + ' 堂' + (d.bonus ? '（贈 ' + d.bonus + ' 堂）' : '')
        + '\n金額：' + (d.currency || '') + ' ' + (d.total || 0).toLocaleString()
        + (d.note ? '\n備註：' + d.note : '')
        + '\n\n請至老師頁「⏳ 待確認繳費」確認收款並開立收據。'
    };
    fetch('https://api.web3forms.com/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify(body)
    }).catch(function(){});
  } catch (e) {}
}

// — Teacher: load pending slips —
async function loadPendingSlips() {
  var container = document.getElementById('pendingSlipsSection');
  if (!container) return;
  var res = await sb.from('classroom_payments').select('*')
    .eq('status', 'slip_submitted').order('submitted_at', { ascending: true });
  var data = res.data || [];
  if (data.length === 0) { container.innerHTML = ''; return; }
  var rows = data.map(function(p) {
    var thumbHtml = p.slip_data
      ? '<img class="slip-thumb" src="' + safeImgSrc(p.slip_data) + '" onclick="viewSlip(\'' + escHtml(p.id) + '\')" title="點擊查看原圖" />'
      : '<div class="slip-thumb-placeholder">📄</div>';
    return '<div class="slip-row" id="slip-row-' + p.id + '">' +
      thumbHtml +
      '<div class="slip-info">' +
        '<div class="slip-name">' + escHtml(p.student_name) + '</div>' +
        '<div class="slip-course"><strong style="color:var(--ink);">' + escHtml(p.course_label) + '</strong> · ' + escHtml(p.lessons) + '堂 · ' + escHtml(p.currency) + ' ' + (p.total_amount || 0).toLocaleString() + '</div>' +
        (p.note ? '<div class="slip-course" style="color:var(--gold-deep);">📝 ' + escHtml(p.note) + '</div>' : '') +
      '</div>' +
      '<div class="slip-actions">' +
        '<button class="btn-approve" onclick="openSlipApproval(\'' + p.id + '\')">✅ 確認</button>' +
        '<button class="btn-reject"  onclick="rejectSlip(\'' + p.id + '\')">❌</button>' +
      '</div>' +
    '</div>';
  }).join('');
  container.innerHTML = '<div class="pending-card">' +
    '<h2>⏳ 待確認繳費 <span class="pending-badge">' + data.length + '</span></h2>' +
    rows + '</div>';
  // cache slip data for viewer
  window._slipCache = {};
  data.forEach(function(p) { window._slipCache[p.id] = p; });
}

// 2026-07-10 新增，2026-07-13 改版：學生「申請改期/取消」清單（老師端）
//   🔗 開 Calendar → 只是開連結到正確的那一天，完全不改資料庫任何東西
//   ✅ 處理       → 自動搜尋 Calendar 上對應的那一次課堂，move（改期）或 delete（取消），
//                    動手前一定先備份，動完才把這筆申請標記 acknowledged
//   ⚙️ 其他       → 開小視窗選：自己聯絡學生（單純關掉）／提議新時間給學生（傳 LINE 讓學生按同意/不方便）
// 2026-07-16 加（Lin 要求）：LINE 通知（學生申請取消）現在只留一顆「📋 到網站處理」按鈕，
// 網址後面會帶 #req-row-<申請id>，點了開網頁後要自動捲到那張申請卡片、框起來讓老師一眼看到，
// 不用自己在清單裡找。清單是非同步載入的（loadPendingClassRequests 跑完才有這個 DOM），
// 瀏覽器自己的「網址帶 # 自動捲動」在頁面一開始（DOM 還沒有這張卡片）時不會生效，所以要自己補這段。
// 找不到對應的卡片（例如這筆申請已經被處理掉、卡片不在清單裡了）就安靜跳過，不影響其他功能。
function scrollToRequestFromHash() {
  try {
    var hash = location.hash || '';
    // 2026-07-20 加（Lin 要求：LINE「💬 聯繫學生」按鈕直接開聯絡視窗）：#contact-student-<token>
    // 開頁後直接呼叫 openContactStudentModal，不用老師自己在清單裡找學生點「💬 聯繫學生」。
    // studentsCache 在呼叫這個函式之前（renderTeacherView 裡 await refreshStudentList() 之後）已經備妥。
    if (hash.indexOf('#contact-student-') === 0) {
      var contactToken = decodeURIComponent(hash.slice('#contact-student-'.length));
      if (contactToken && studentsCache[contactToken]) openContactStudentModal(contactToken);
      return;
    }
    if (hash.indexOf('#req-row-') !== 0) return;
    var elId = decodeURIComponent(hash.slice(1));
    // 2026-08-02 加：申請卡片現在收在「那位學生的詳細卡片」裡面，不是一直都在畫面上——
    // 要先用 requestId 反查是哪個學生（window._classRequestCache，loadPendingClassRequests()
    // 已經備妥），呼叫 selectStudent() 把他的卡片打開（裡面會順便呼叫
    // renderStudentPendingRequestsBlock() 把申請卡片畫出來），這個 #req-row-xxx 的 id 才會出現在畫面上。
    var reqIdFromHash = elId.slice('req-row-'.length);
    var reqFromHash = window._classRequestCache && window._classRequestCache[reqIdFromHash];
    if (reqFromHash && reqFromHash.token && studentsCache[reqFromHash.token]) {
      selectStudent(reqFromHash.token);
    }
    var el = document.getElementById(elId);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.style.outline = '3px solid var(--gold-bright)';
    el.style.outlineOffset = '3px';
    setTimeout(function () { el.style.outline = ''; el.style.outlineOffset = ''; }, 5000);
  } catch (e) {}
}

// 2026-07-20 加（Lin 要求：คิวคำขอต้องขึ้นเองไม่ต้องกดรีเฟรช）：ใช้ Supabase Realtime ฟัง
// การเปลี่ยนแปลงตาราง classroom_requests สด ๆ แทนที่จะรอให้ครูกดปุ่ม/รีเฟรชหน้าเอง
// ⚠️ ก่อนใช้งานได้จริง Lin ต้องเปิด Realtime ให้ตาราง classroom_requests ก่อน 1 ครั้ง
// (Supabase Dashboard → Database → Replication → เปิดสวิตช์ตาราง classroom_requests
// ให้ publication "supabase_realtime") ไม่งั้นโค้ดนี้จะแค่ subscribe เฉย ๆ ไม่มี event เข้ามา
// (ไม่ error ไม่พังอะไร แค่เงียบ — เหมือนเดิมทุกอย่างจนกว่าจะเปิดสวิตช์ให้)
var _pendingRequestsRealtimeChannel = null;
var _pendingRequestsRealtimeDebounce = null;
function subscribePendingClassRequestsRealtime() {
  // กันซ้อน—ถ้าเคย subscribe ไว้แล้ว (เช่น กลับมาหน้าครูซ้ำ) ต้องถอนตัวเก่าก่อนเสมอ ไม่งั้นจะเปิดซ้อน
  // กันหลายช่องพร้อมกัน โหลดซ้ำหลายรอบโดยไม่จำเป็น
  try { if (_pendingRequestsRealtimeChannel) sb.removeChannel(_pendingRequestsRealtimeChannel); } catch (e) {}
  _pendingRequestsRealtimeChannel = sb.channel('classroom_requests_realtime')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'classroom_requests' }, function (payload) {
      var changed = payload && (payload.new || payload.old);
      if (changed && changed.request_type && changed.request_type !== 'add_class') return;
      // 2026-07-20：ดีบาวซ์ 800ms กันเหตุการณ์รัว ๆ (เช่นกด "+" หลายคาบพร้อมกัน = INSERT หลายแถวติดกัน)
      // ทำให้โหลดซ้ำรัว ๆ โดยไม่จำเป็น—รวมเป็นโหลดครั้งเดียวพอ
      clearTimeout(_pendingRequestsRealtimeDebounce);
      _pendingRequestsRealtimeDebounce = setTimeout(function () { loadPendingClassRequests(); }, 800);
    })
    .subscribe();
}

// 2026-08-02 改（Lin 要求拿掉最上面的「學生申請改期/取消」清單）：這支函式不再找
// #pendingRequestsSection 畫一整塊清單了——改成把每筆申請按 token 分組存進
// window._pendingRequestsByToken，讓 (1) สารบัญ清單的狀態 badge、(2) 打開中的那位學生詳細卡片
// 最下面的「待處理申請」區塊，都能各自去讀自己那份。actionsHtml 的按鈕邏輯完全沒動，
// 只是把「畫一整塊清單」改成「分組存起來，讓別的地方畫」。
async function loadPendingClassRequests() {
  var res = await sb.from('classroom_requests').select('*')
    .eq('status', 'pending').eq('request_type', 'add_class')
    .order('created_at', { ascending: true });
  if (res.error) console.warn('讀取加課申請失敗：', res.error.message);
  var data = res.error ? [] : (res.data || []);
  window._classRequestCache = {};
  var byToken = {};
  data.forEach(function (r) {
    if (r.request_type !== 'add_class') return;
    window._classRequestCache[r.id] = r;
    var date = r.requested_date || r.original_date;
    var calUrl = null;
    if (date && /^\d{4}-\d{2}-\d{2}/.test(date)) {
      var parts = date.split('-');
      calUrl = 'https://calendar.google.com/calendar/r/day/' + parseInt(parts[0], 10) + '/' + parseInt(parts[1], 10) + '/' + parseInt(parts[2], 10);
    }
    var actions = (calUrl ? '<a class="btn-approve" style="text-decoration:none;text-align:center;" href="' + calUrl + '" target="_blank" rel="noopener">🔗 開 Calendar</a>' : '') +
      '<button class="btn-approve" onclick="handleAddClassRequest(\'' + r.id + '\')">📅 開始安排</button>' +
      '<button class="btn-reject" onclick="contactStudentForAddRequest(\'' + r.id + '\')">💬 聯繫學生</button>' +
      '<button class="btn-reject" onclick="closeAddRequestAfterContact(\'' + r.id + '\')">✔️ 關掉這筆</button>';
    if (r.processing_started_at) {
      var minutes = Math.max(0, Math.floor((Date.now() - new Date(r.processing_started_at).getTime()) / 60000));
      var stale = minutes >= 10;
      actions = '<div style="font-size:0.74rem;color:var(--ink-muted);">' +
        (stale ? '🔓 這筆卡在「處理中」已經 ' : '⏳ 這筆正在處理中（') + minutes +
        (stale ? ' 分鐘了，請確認後手動解鎖' : ' 分鐘前開始）') + '</div>' +
        (stale ? '<button class="btn-sm" onclick="unlockStuckRequest(\'' + r.id + '\')">🔓 解鎖這筆</button>' : '') + actions;
    }
    var detail = '申請時間：' + (r.requested_date || '-') + (r.requested_time ? ' ' + r.requested_time : '') + '（泰國時間）';
    var html = '<div class="slip-row" id="req-row-' + r.id + '">' +
      '<div class="slip-thumb-placeholder">➕</div>' +
      '<div class="slip-info"><div class="slip-name">' + escHtml(r.student_name || '-') + '　' +
      (r.initiated_by === 'teacher' ? '（老師提出）' : '') + '申請加課</div>' +
      '<div class="slip-course">' + escHtml(detail) + '</div>' +
      (r.note ? '<div class="slip-course" style="color:var(--gold-deep);">📝 ' + escHtml(r.note) + '</div>' : '') +
      '</div><div class="slip-actions" style="flex-direction:column;gap:6px;">' + actions + '</div></div>';
    (byToken[r.token] = byToken[r.token] || []).push({ id: r.id, type: 'add_class', html: html });
  });
  window._pendingRequestsByToken = byToken;
  refreshAllRosterMeta();
  if (currentTeacherPanelToken) renderStudentPendingRequestsBlock(currentTeacherPanelToken);
}

async function claimAddClassRequest(id) {
  var res = await sb.from('classroom_requests')
    .update({ processing_started_at: new Date().toISOString() })
    .eq('id', id).eq('status', 'pending').is('processing_started_at', null)
    .select();
  if (res.error) return { ok: false, reason: '搶佔處理權失敗：' + res.error.message + '\n為了安全，這次先不動 Calendar，請重試一次。' };
  if (!res.data || !res.data.length) return { ok: false, reason: '這筆申請已經在別的地方（LINE 或另一個分頁）處理中，或剛好已經處理完了，請重新整理頁面查看最新狀態，不會重複建立課堂。\n（如果確定是中途斷掉卡住的，等 10 分鐘後卡片上會出現「🔓 解鎖這筆」按鈕，按了才會解開——加課故意不自動解鎖，避免建立到重複的課堂）' };
  return { ok: true };
}

// ════════════════════════════════════════════════════════════════════════════
// 🔴 2026-08-02 เพิ่ม (ตรวจ 3 ระบบ ข้อ 4.12) — ล็อกเฉพาะของ "เลื่อนคาบ" ที่ห้ามแย่งเช่นกัน
//
// เดิมเส้นทางเลื่อนคาบฝั่งเว็บใช้ claimRequestForProcessing (แย่งล็อกค้าง 10 นาทีได้)
// ซึ่งถูกสำหรับ "ยกเลิกคาบ" (ลบซ้ำ = คาบหายไปแล้ว ไม่มีอะไรเพิ่ม)
// แต่ผิดสำหรับ "เลื่อนคาบ" — เส้นทางนี้มี 2 จุดที่ **จงใจทิ้งล็อกค้างไว้** เพราะคาบอาจย้ายไปแล้ว:
//   (1) movePatchSent1 / movePatchSent2 — ส่งคำสั่งย้ายไปแล้วแต่ตรวจซ้ำไม่ได้
//   (2) finalizeRequestStatus ล้มเหลว — ย้ายสำเร็จแล้วแต่บันทึกไม่ได้
// ปล่อยให้แย่งได้เมื่อครบ 10 นาที = จุดที่ตั้งใจกันไว้กลายเป็นช่องโหว่ (ย้ายซ้ำ + แถวสำรองขยะ)
//
// ⚠️ ต้องคู่กับฝั่ง LINE เสมอ (line-webhook → confirm_reschedule_move / confirm_reschedule_pick
//    ตอนนี้ใช้ .is('processing_started_at', null) ทั้งคู่แล้ว)
//    แก้ฝั่งเดียว = รูแค่ย้ายที่ ไม่ได้หาย (บทเรียนจริง 2026-07-31 ของระบบเพิ่มคาบ)
// ล็อกค้างเพราะเน็ตหลุดจริง → ปุ่ม 🔓 解鎖這筆 บนการ์ดคิว (unlockStuckRequest ข้างล่าง)
// ════════════════════════════════════════════════════════════════════════════
async function unlockStuckRequest(id) {
  var r = (window._classRequestCache || {})[id];
  var lockMin = (r && r.processing_started_at)
    ? Math.max(0, Math.floor((Date.now() - new Date(r.processing_started_at).getTime()) / 60000)) : 0;
  if (!confirm('確定要解鎖這筆申請嗎？\n\n它卡在「處理中」已經 ' + lockMin + ' 分鐘了。\n\n' +
      '解鎖只是把「處理中」的記號清掉，讓這筆可以重新被處理，\n不會動到 Google Calendar，也不會通知學生。\n\n' +
      '⚠️ 如果剛剛真的有人正在處理它（例如你在手機 LINE 上按了按鈕還沒跑完），\n請先等一下再解鎖，避免兩邊同時動同一堂課。')) return;
  var res = await sb.from('classroom_requests')
    .update({ processing_started_at: null })
    .eq('id', id).eq('status', 'pending').select();
  if (res.error) { alert('⚠️ 解鎖失敗：' + res.error.message); return; }
  if (!res.data || !res.data.length) {
    alert('ℹ️ 沒有解鎖到任何東西——這筆的狀態剛剛可能已經被改掉了（例如已經處理完），重新整理看看。');
  } else {
    alert('✅ 已解鎖，這筆申請可以重新處理了');
  }
  await loadPendingClassRequests();
}

// 只在「Calendar API 還沒真的成功」就失敗時呼叫——把鎖放開，讓之後還能重試。
// 注意：如果 Calendar 已經動了、但後面存資料庫（finalizeRequestStatus）失敗，不要呼叫這個放鎖，
// 讓鎖故意卡住比較安全（避免有人之後又搶到鎖，對同一個已經被動過的 Calendar 事件重複動手）。
async function releaseRequestClaim(id) {
  try {
    // 2026-07-20 加（照 _แผนงาน/ทำต่อในอนาคต.md「ฝั่งครู UPDATE ที่ยังไม่เช็กจำนวนแถว」補齊）：
    // 以前這裡只看 error，RLS 靜靜擋掉「更新 0 筆」不會回 error，鎖會誤以為解開了但其實沒有，
    // 之後這筆申請可能永遠搶不到鎖。加 .select() + 檢查筆數，0 筆就大聲警告（不擋流程，
    // 因為老師目前都是本人登入、RLS 通常會過，風險低，但至少留紀錄方便之後追）。
    const res = await sb.from('classroom_requests').update({ processing_started_at: null }).eq('id', id).select();
    if (res.error) { console.warn('⚠️ 放開處理鎖失敗（不影響本次已經取消的操作，重新整理頁面即可）：', res.error.message); return; }
    if (!res.data || !res.data.length) {
      console.warn('⚠️ 放開處理鎖：更新 0 筆（可能是 RLS 擋住或這筆申請已經不在了），鎖可能沒有真的解開，id=' + id);
    }
  } catch (e) { console.warn('⚠️ 放開處理鎖失敗（不影響本次已經取消的操作，重新整理頁面即可）：', e.message || e); }
}

async function finalizeRequestStatus(id, statusValue) {
  var rowEl = document.getElementById('req-row-' + id);
  if (rowEl) rowEl.remove();
  // 2026-07-16 加（稽核發現）：一定要加 .eq('status','pending') 當保險閘——沒有這道閘的話，
  // 就算這筆申請已經被別的動作（例如學生收回）改成別的狀態，這裡還是會「成功」蓋回去，
  // 讓畫面誤以為剛剛的操作真的處理成功了。
  // 2026-07-19 加：同時把 processing_started_at 鎖清掉（跟 status 一起，同一個 atomic update）——
  // 如果這個 update 整包失敗，鎖會「故意」維持鎖住狀態（因為沒有任何欄位真的被改到），代表 Calendar
  // 可能已經動了但這裡沒存成功，不能讓別人再搶到鎖重複動 Calendar，要 Lin 自己去 Supabase 檢查這筆。
  var res = await sb.from('classroom_requests').update({ status: statusValue, processing_started_at: null }).eq('id', id).eq('status', 'pending').select();
  if (res.error) {
    alert('⚠️ 更新失敗：' + res.error.message + '\n⚠️ 注意：Calendar 動作可能已經成功了，但狀態沒存進資料庫，這筆的處理鎖會維持鎖住（避免被重複動 Calendar），請直接去 Supabase 檢查這筆（id: ' + id + '）。');
    await loadPendingClassRequests();
    return;
  }
  if (!res.data || res.data.length === 0) {
    alert('⚠️ 標記失敗：這筆申請的狀態剛好被改變了（可能學生剛收回、或已經被處理過），不是 RLS 問題，畫面重新整理一下看最新狀態。（如果確定不是這個原因，才需要去檢查 Supabase 的 UPDATE 權限）');
    await loadPendingClassRequests();
    return;
  }
  await loadPendingClassRequests();
  await loadRecentBackups();
}

// 2026-07-16 加（稽核發現，RED#1）：動 Google Calendar 之前，一定要回頭問資料庫一次最新狀態，
// 不能只信任畫面上快取的資料——防止「老師在畫面上按處理」跟「學生剛好收回/回覆」同一瞬間搶著發生，
// 導致 Calendar 已經被移動/刪除了，畫面卻沒有任何警告。
var _inFlightRequestIds = {};

function contactStudentForAddRequest(id) {
  var r = (window._classRequestCache || {})[id];
  if (!r || !r.token) return;
  openContactStudentModal(r.token, null);
}
async function closeAddRequestAfterContact(id) {
  var r = (window._classRequestCache || {})[id];
  if (!confirm('確定要關掉這筆加課申請嗎？\n\n・不會新增任何課堂、不會動 Calendar\n・會傳一則 LINE 告訴學生「這個時間沒辦法，老師會直接聯絡你」\n・建議先用「💬 聯繫學生」跟學生說清楚原因')) return;
  if (_inFlightRequestIds[id]) return; // 防重複點擊，跟其他處理按鈕同一套
  _inFlightRequestIds[id] = true;
  try {
    // 🟡 2026-07-31 เพิ่ม (ข้อ #13)：ปิดคำขอได้ต่อเมื่อไม่มีใครกำลังทำอยู่
    //
    // พังยังไงถ้าไม่มีด่านนี้: ครูกด ✅ 確認新增 ใน LINE (ระบบจับป้าย "มีคนใช้อยู่" แล้วกำลังคุยกับ Google)
    //   แล้วเผลอกด ✔️ 關掉這筆 บนโน้ตบุ๊กในไม่กี่วินาทีเดียวกัน
    //   → ฝั่งเว็บปิดคำขอสำเร็จ นักเรียนได้ LINE ว่า "เวลานั้นครูไม่สะดวก"
    //     แล้วฝั่ง LINE สร้างคาบสำเร็จ นักเรียนได้อีกข้อความว่า "จัดคาบให้แล้ว" = ขัดกันเอง
    //
    // ⚠️ ทำไมเขียนคำสั่งเองตรงนี้ แทนที่จะ "จับป้ายก่อน แล้วค่อยเรียก finalizeRequestStatus":
    //   ถ้าจับป้ายแล้ว finalizeRequestStatus ล้มเหลว (เช่นสถานะถูกเปลี่ยนไประหว่างทาง) ป้ายจะค้างไว้
    //   → **นักเรียนจะกดปุ่ม 收回這筆 ของตัวเองไม่ได้อีกเลยตลอดกาล** เพราะด่านฝั่งฐานข้อมูลของนักเรียน
    //     (student_update_own_request) บังคับว่าป้ายต้อง "ว่างเปล่า" เท่านั้น ไม่มีกฎ 10 นาทีเหมือนฝั่งครู
    //   → ยิงคำสั่งเดียวจบ ทั้งเช็คป้ายและปิดคำขอพร้อมกัน: ไม่สำเร็จ = ไม่มีอะไรเปลี่ยน ไม่มีอะไรค้าง
    //
    // ⚠️ ทำไมไม่ไปเติมเงื่อนไข "ป้ายต้องว่าง" ใน finalizeRequestStatus (ซึ่งดูตรงจุดกว่า):
    //   finalizeRequestStatus เป็นของใช้ร่วมทุกประเภทคำขอ (ยกเลิก/ขอเลื่อน/เพิ่มคาบ) และเส้นทางอื่น
    //   เรียกมัน "หลัง" จากที่ตัวเองจับป้ายไว้แล้ว → ถ้าบังคับว่าป้ายต้องว่าง มันจะปิดงานของตัวเองไม่ได้เลย
    //   = พังทั้งระบบยกเลิกและระบบขอเลื่อนทันที
    var closeRes = await sb.from('classroom_requests')
      .update({ status: 'acknowledged', processing_started_at: null })
      .eq('id', id).eq('status', 'pending').is('processing_started_at', null)
      .select();
    if (closeRes.error) { alert('⚠️ 關閉失敗：' + closeRes.error.message + '\n沒有關掉任何東西，請重試一次。'); await loadPendingClassRequests(); return; }
    if (!closeRes.data || !closeRes.data.length) {
      alert('ℹ️ 沒有關掉這筆——可能正在別的地方處理中（例如你剛在 LINE 按了「確認新增」），或狀態剛好被改掉了。\n'
        + '沒有送出任何 LINE 通知。請重新整理頁面看最新狀態。\n'
        + '（如果確定是中途斷掉卡住的，等 10 分鐘後卡片上會出現「🔓 解鎖這筆」按鈕）');
      await loadPendingClassRequests();
      return;
    }
    var rowEl = document.getElementById('req-row-' + id);
    if (rowEl) rowEl.remove();
    // 2026-07-30 加（Lin สั่ง: ทุกกรณีต้องแจ้งผลให้นักเรียนรู้）：ถ้าไม่บอก การ์ด "⏳ 加課申請處理中"
    // ของนักเรียนจะหายไปเฉยๆ เหมือนคำขอถูกกลืน นักเรียนไม่รู้เลยว่าเกิดอะไรขึ้น
    // ส่งไม่สำเร็จก็ไม่ย้อนสถานะ (คำขอปิดไปแล้วจริง) แต่ต้องบอกครูให้รู้ ห้ามเงียบ
    var notifyWarn = '';
    if (r && r.token) {
      try {
        var nres = await fetch(LINE_NOTIFY_ENDPOINT, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'apikey': window.SUPABASE_CONFIG.anonKey, 'Authorization': 'Bearer ' + (await teacherAuthHeader()) },
          body: JSON.stringify({ to: { studentToken: r.token }, message: 'ℹ️ 關於你申請的加課（' + (r.requested_date || '') + ' ' + (r.requested_time || '') + '）：那個時間老師沒辦法，老師會直接跟你聯絡安排別的時間。' }),
        });
        if (!nres.ok) notifyWarn = '\n⚠️ 但 LINE 通知學生沒送出去（' + (await lineNotifyErrorText(nres)) + '）';
      } catch (e) { notifyWarn = '\n⚠️ 但 LINE 通知學生沒送出去（' + (e.message || e) + '）'; }
    } else {
      notifyWarn = '\n⚠️ 找不到這位學生的資料，沒有送出 LINE 通知';
    }
    alert('ℹ️ 已關掉這筆申請' + (notifyWarn || '，也已用 LINE 告訴學生了') + '\n記得自己再跟學生說一聲比較保險');
    // 2026-07-31：เดิม finalizeRequestStatus รีเฟรชคิวให้เอง ตอนนี้เขียนคำสั่งปิดเองแล้วจึงต้องเรียกเอง
    await loadPendingClassRequests();
  } finally {
    delete _inFlightRequestIds[id];
  }
}

// 💬 聯絡學生（2026-07-16 新增，Lin 要求）：老師直接在網站打字，送 LINE 給指定學生
// 沒有連到某個 request，只需要 token，所以任何地方都能呼叫（目前先接在「學生申請改期/取消」清單）
var _contactStudentToken = null;
// 2026-07-20 加（Lin 回報：從「➕ 加課堂時間」按「💬 聯繫學生」，兩個 modal 都用同一個
// z-index，addClassDayModal 還開著、疊在上面，把新開的聯絡視窗整個擋住）：記住是從哪個 modal
// 開進來的，開的時候把那個 modal 先「藏起來」（不是整個關掉/清空——不能用 closeAddClassDayModal，
// 那個會把已經填的日期/時間全部重設，teacher 辛苦填的東西不能因為順手聯絡一下學生就不見了）
// 關掉/傳送完再把它「叫回來」，狀態原封不動。
var _contactStudentReturnTo = null;
function openContactStudentModal(token, returnTo) {
  _contactStudentToken = token;
  _contactStudentReturnTo = returnTo || null;
  var s = studentsCache[token];
  document.getElementById('contactStudentTargetLabel').textContent = '傳送對象：' + (s && s.name ? s.name : token);
  document.getElementById('contactStudentText').value = '';
  var statusEl = document.getElementById('contactStudentStatus');
  statusEl.textContent = ''; statusEl.style.color = 'var(--ink-muted)';
  var cancelBtn = document.getElementById('contactStudentCancelBtn');
  if (cancelBtn) cancelBtn.textContent = returnTo ? '← 返回' : '取消';
  document.getElementById('contactStudentModal').classList.add('open');
}
// 2026-07-20 加：專門給「➕ 加課堂時間」modal 裡的「💬 聯繫學生」按鈕用——先把 addClassDayModal
// 藏起來（只拿掉 .open，不呼叫 closeAddClassDayModal，裡面填的東西完全保留），再開聯絡視窗。
function openContactStudentModalFromAddClassDay() {
  document.getElementById('addClassDayModal').classList.remove('open');
  openContactStudentModal(_addClassDayToken, 'addClassDay');
}
function closeContactStudentModal() {
  document.getElementById('contactStudentModal').classList.remove('open');
  _contactStudentToken = null;
  if (_contactStudentReturnTo === 'addClassDay') {
    document.getElementById('addClassDayModal').classList.add('open'); // 叫回加課視窗，裡面填的日期/時間都還在
  }
  _contactStudentReturnTo = null;
}
async function sendContactStudentMessage() {
  var token = _contactStudentToken;
  var text = document.getElementById('contactStudentText').value.trim();
  var statusEl = document.getElementById('contactStudentStatus');
  if (!token) { closeContactStudentModal(); return; }
  if (!text) { alert('請輸入訊息內容'); return; }
  var btn = document.getElementById('contactStudentSendBtn');
  btn.disabled = true; btn.textContent = '傳送中…';
  try {
    var res = await fetch(LINE_NOTIFY_ENDPOINT, {
      method: 'POST',
      // 2026-07-19 แก้（SECURITY FIRST）：notify-line สาขา to:{studentToken} ตอนนี้บังคับต้องมี session จริงของครู
      headers: { 'Content-Type': 'application/json', 'apikey': window.SUPABASE_CONFIG.anonKey, 'Authorization': 'Bearer ' + (await teacherAuthHeader()) },
      body: JSON.stringify({ to: { studentToken: token }, message: text }),
    });
    if (res.ok) {
      statusEl.style.color = 'var(--gold-deep)';
      statusEl.textContent = '✅ 已送出';
      setTimeout(closeContactStudentModal, 900);
    } else {
      var errMsg = '';
      try { var j = await res.json(); errMsg = j.error || ''; } catch (e2) {}
      statusEl.style.color = 'var(--amber)';
      statusEl.textContent = '⚠️ 傳送失敗（' + (errMsg || ('HTTP ' + res.status)) + '），學生可能還沒連結 LINE';
    }
  } catch (e) {
    statusEl.style.color = 'var(--amber)';
    statusEl.textContent = '⚠️ 傳送失敗：' + (e.message || e);
  } finally {
    btn.disabled = false; btn.textContent = '📤 傳送';
  }
}

// ✅ 學生已經同意提議的新時間 → 老師按這顆才真的動 Calendar（一定要等老師開電腦，Google 授權只在老師瀏覽器裡）
function dismissedBackupIds() {
  try { return JSON.parse(localStorage.getItem('dismissedBackupNotices') || '{}'); } catch (e) { return {}; }
}
function dismissBackupNotice(id) {
  try {
    var d = dismissedBackupIds();
    d[id] = 1;
    localStorage.setItem('dismissedBackupNotices', JSON.stringify(d));
  } catch (e) {}
  var row = document.getElementById('backup-row-' + id);
  if (row) row.remove();
}
async function loadRecentBackups() {
  var container = document.getElementById('recentBackupsSection');
  if (!container) return;
  // 🟠 2026-07-26 แก้：เดิม .limit(20) ทำงาน "ก่อน" การกรองรายการหมดอายุ (กรองใน JS ข้างล่าง)
  // → ถ้ามีรายการหมดอายุใหม่ๆ 20 รายการแรก รายการที่ยังกดคืนค่าได้จะถูกตัดทิ้งตั้งแต่ตอน query
  //   ปุ่ม ↩️ 復原 หายไปเงียบๆ ทั้งที่ข้อมูลสำรองยังอยู่ในฐานข้อมูลครบ
  // แก้: ดึงมา 200 แถว (ยังจำกัดอยู่ กันดึงทั้งตาราง) แล้วค่อยกรองหมดอายุ + ตัดเหลือ 20 ใบล่าสุดที่ "ยังคืนค่าได้จริง"
  var res = await sb.from('classroom_calendar_backups').select('*').eq('reverted', false).order('created_at', { ascending: false }).limit(200);
  var data = res.data || [];
  if (res.error) {
    // 🟠 2026-07-26 แก้：เดิมล้างช่องนี้ให้ว่างเปล่า = หน้าตาเหมือน "ไม่มีอะไรให้คืนค่า" เป๊ะ
    // ครูจะไม่มีทางรู้เลยว่ามีรายการที่กดคืนค่าได้ค้างอยู่ แค่อ่านไม่ออกรอบนี้
    container.innerHTML = '<div class="pending-card"><h2>↩️ 最近處理</h2>'
      + '<div style="background:var(--cream);border:1.5px solid var(--amber);border-radius:9px;padding:10px 13px;'
      + 'font-family:\'Noto Sans TC\',sans-serif;font-size:0.84rem;color:var(--amber-dark);font-weight:700;">'
      + '⚠️ 讀不到備份紀錄（' + escHtml(res.error.message) + '）'
      + '<span style="font-weight:400;display:block;margin-top:3px;color:var(--ink-muted);">'
      + '現在看不到「可以復原」的項目，但備份本身還在資料庫裡沒有不見。請重新整理頁面再看一次。</span></div></div>';
    console.warn('讀取備份紀錄失敗：', res.error.message);
    return;
  }
  var now = Date.now();
  var dismissed = dismissedBackupIds();
  var inDeadline = data.filter(function(b) {
    if (dismissed[b.id]) return false;
    var expiry;
    if (b.action === 'move') expiry = Math.max(new Date(b.old_start).getTime(), b.new_start ? new Date(b.new_start).getTime() : 0);
    else if (b.action === 'permanent_change') expiry = b.new_start ? new Date(b.new_start).getTime() : 0;
    // 🟠 2026-07-31 (รอบ 4) แก้: action='create' ต้องนับจาก "วันที่กดเพิ่ม" ไม่ใช่ "วันที่ของคาบ"
    //   บั๊กเดิม (เพิ่งทำ create เข้ามาวันนี้ แล้วลืมจุดนี้): เกณฑ์หมดอายุของทุกแบบคือ "เวลาคาบเดิม"
    //   ซึ่งถูกสำหรับ ลบ/ย้าย (คาบผ่านไปแล้ว = คืนค่าไปก็ไม่มีประโยชน์) แต่ผิดสำหรับ "เพิ่มคาบ":
    //     · เพิ่มคาบ 09:00 ของวันนี้ ตอนบ่าย → แถวสำรองหมดอายุตั้งแต่วินาทีที่สร้าง ปุ่มคืนค่าไม่ขึ้นเลย
    //     · คาบทุกสัปดาห์ → old_start คือครั้งแรก พอผ่านสัปดาห์แรก ปุ่มคืนค่าของทั้งชุดก็หายไป
    //       ทั้งที่คาบอีก 11 สัปดาห์ข้างหน้ายังอยู่ในปฏิทินจริงๆ (นี่คือเคสที่ต้องใช้ปุ่มมากที่สุด)
    //   → ใช้ created_at + 7 วันแทน (เผลอเพิ่มผิดมักรู้ตัวภายในไม่กี่วัน) · ไม่มี created_at ถอยไปใช้ของเดิม
    else if (b.action === 'create') expiry = b.created_at ? (new Date(b.created_at).getTime() + 7 * 24 * 60 * 60 * 1000) : new Date(b.old_start).getTime();
    else expiry = new Date(b.old_start).getTime();
    return now < expiry;
  });
  // 🟠 2026-07-26：ตัด 20 ใบ "หลัง" กรองหมดอายุแล้ว (เดิม .limit(20) ทำงานก่อนกรอง ปุ่มคืนค่าเลยหายเงียบ)
  // ⚠️ ต้องแยก inDeadline (ทั้งหมดที่ยังอยู่ในกำหนด) ออกจาก visible (20 ใบที่โชว์) — ไม่งั้นใบที่ 21+
  //   ซึ่งยังอยู่ในกำหนดจริงๆ จะถูกติดป้ายผิดว่า "เลยกำหนดแล้ว"
  var visible = inDeadline.slice(0, 20);
  // 🟠 2026-07-26 เพิ่ม：ปุ่มดู "ทั้งหมดที่ยังไม่ได้กดคืนค่า" (รวมใบที่เลยกำหนดแจ้งเตือนแล้ว)
  //   ข้อมูลสำรองยังอยู่ในฐานข้อมูลครบ แค่เดิมไม่มีทางเปิดดู/กดคืนค่าจากหน้าจอได้อีกเลย
  // ⚠️ ตรงนี้ "ไม่" กรอง dismissed ออกโดยตั้งใจ — ปุ่ม ✕ เขียนไว้ว่า "แค่ปิดการแจ้งเตือน ไม่กระทบการคืนค่า"
  //   ถ้ากรองออกที่นี่ด้วย ใบที่กด ✕ ไปแล้วจะไม่มีทางเปิดกลับมาคืนค่าได้อีกเลย = ผิดจากที่ปุ่มบอกไว้
  //   (ยังกรอง dismissed ออกจาก inDeadline ตามเดิม → รายการแจ้งเตือนปกติยังสะอาดเหมือนเดิม)
  var expiredNotDismissed = data.filter(function(b) {
    return visible.indexOf(b) === -1;
  });
  if (!visible.length && !(window._backupShowAll && expiredNotDismissed.length)) {
    container.innerHTML = expiredNotDismissed.length
      ? '<div class="pending-card"><h2>↩️ 最近處理</h2><div style="font-size:0.83rem;color:var(--ink-muted);font-family:\'Noto Sans TC\',sans-serif;">目前沒有在提醒期限內的項目。'
        + '<button onclick="toggleAllBackups()" style="background:none;border:none;color:var(--gold-deep);text-decoration:underline;cursor:pointer;font-size:0.83rem;padding:0 4px;">查看全部 ' + expiredNotDismissed.length + ' 筆備份（還是可以復原）</button></div></div>'
      : '';
    return;
  }
  var showList = window._backupShowAll ? visible.concat(expiredNotDismissed) : visible;
  window._backupCache = {};
  showList.forEach(function(b) { window._backupCache[b.id] = b; });
  // 🟡 2026-07-31 เพิ่ม create（ข้อ #20）：ป้ายของ "คาบที่เพิ่งเพิ่ม" — กดคืนค่า = ลบคาบนั้นทิ้ง
  // 🟠 2026-08-02 เพิ่ม archive_student (ตรวจ 3 ระบบ ข้อ 4.6)
  //   เดิมไม่มีคีย์นี้ → การ์ดโชว์คำดิบว่า "archive_student" ซึ่งครูอ่านไม่ออก
  //   และปุ่ม ↩️ 復原 ของ action นี้ **ใช้ไม่ได้จริง** (ไม่มีสาขาของตัวเอง → ตกไปสาขา move
  //   → PATCH คาบที่ถูกลบไปแล้ว → 404/410 → ขึ้น「復原失敗」ทุกครั้ง)
  //   → ซ่อนปุ่มคืนค่าของ action นี้ไปเลย (ดูตรงที่ประกอบปุ่มด้านล่าง) แทนที่จะให้ครูกดแล้วเจอ error
  var actionLabel = { move: '🔄 已移動課堂', delete: '❌ 已取消課堂', permanent_change: '📌 已永久變更課表', create: '➕ 已新增課堂', archive_student: '🗄️ 封存學生時關掉的課' };
  var rows = showList.map(function(b) {
    var s = studentsCache[b.token];
    var name = s ? s.name : (b.token || '-');
    var isExpired = inDeadline.indexOf(b) === -1; // 🟠 2026-07-26：เทียบกับ "ทั้งหมดที่ยังอยู่ในกำหนด" ไม่ใช่ 20 ใบที่โชว์
    return '<div class="slip-row" id="backup-row-' + b.id + '"' + (isExpired ? ' style="opacity:0.65;"' : '') + '>' +
      '<div class="slip-thumb-placeholder">↩️</div>' +
      '<div class="slip-info">' +
        '<div class="slip-name">' + escHtml(name) + '　' + (actionLabel[b.action] || b.action) + (isExpired ? '　<span style="font-weight:400;font-size:0.75rem;color:var(--ink-muted);">（已過提醒期限，仍可復原）</span>' : '') + '</div>' +
        '<div class="slip-course">' + formatThaiDateTimeLabel(b.old_start) + (b.new_start ? ('　→　' + formatThaiDateTimeLabel(b.new_start)) : '') + '（泰國時間）</div>' +
      '</div>' +
      '<div class="slip-actions">' +
        // 🟠 2026-08-02 (ข้อ 4.6): action='archive_student' ไม่มีทางคืนค่าอัตโนมัติได้
        //   (คาบเดี่ยวถูกลบไปแล้ว · ชุดคาบประจำถูกตัด RRULE · แถว classroom_recurring_days ถูกล้างทิ้ง)
        //   → ห้ามโชว์ปุ่มที่กดแล้วขึ้น error ทุกครั้ง บอกทางที่ทำได้จริงแทน
        (b.action === 'archive_student'
          ? '<div style="font-size:0.74rem;color:var(--ink-muted);font-family:\'Noto Sans TC\',sans-serif;max-width:190px;">備份留著了，但不能一鍵復原。<br>要救的話請按「恢復學生」，再自己到 Calendar 重排。</div>'
          : '<button class="btn-reject" onclick="revertCalendarBackup(\'' + b.id + '\')">↩️ 復原</button>') +
        '<button onclick="dismissBackupNotice(\'' + b.id + '\')" title="關閉這則通知（復原功能不受影響）" style="background:none;border:none;cursor:pointer;font-size:1.05rem;color:var(--ink-muted);opacity:0.6;padding:2px 6px;">✕</button>' +
      '</div>' +
    '</div>';
  }).join('');
  var toggleHtml = expiredNotDismissed.length
    ? '<div style="text-align:center;margin-top:6px;"><button onclick="toggleAllBackups()" style="background:none;border:none;color:var(--gold-deep);text-decoration:underline;cursor:pointer;font-size:0.8rem;font-family:\'Noto Sans TC\',sans-serif;">'
      + (window._backupShowAll ? '只看提醒期限內的' : '查看全部 ' + (visible.length + expiredNotDismissed.length) + ' 筆備份（過期的也還能復原）') + '</button></div>'
    : '';
  container.innerHTML = '<div class="pending-card">' + '<h2>↩️ 最近處理（還能復原）</h2>' + rows + toggleHtml + '</div>';
}
// 🟠 2026-07-26 เพิ่ม：สลับดู "เฉพาะในกำหนด" ↔ "ทั้งหมดที่ยังไม่ได้คืนค่า"
function toggleAllBackups() {
  window._backupShowAll = !window._backupShowAll;
  loadRecentBackups();
}

// 🟡 2026-07-31 (งาน C11): ตัวแปรพักค่าระหว่างกู้คืน — เลขคาบใหม่ที่เพิ่งสร้าง + คาบนี้เคยเป็นคาบประจำไหม
// ประกาศไว้นอกฟังก์ชันเพราะถูกตั้งค่าในบล็อก try แล้วเอาไปใช้ต่อหลังบล็อกจบ
var _revertNewEventId = null;
var _revertWasRecurring = false;

// ════════════════════════════════════════════════════════════════════════════
// 🔴 2026-08-01 เพิ่มตัวครอบ (audit ระบบเลื่อนคาบ ข้อ A10 — ปุ่มกู้ภัยเองไม่มีตัวกู้ภัย)
//   ปุ่ม ↩️ 復原 เป็น "ตาข่ายรองสุดท้าย" ของทั้งระบบ แต่กลับเป็นจุดที่มีด่านน้อยที่สุด:
//   ไม่มีล็อกกันกดซ้ำเลย (ทุกปุ่มอื่นในไฟล์นี้มี _inFlightRequestIds กันหมด)
//   → กดรัว/เปิด 2 แท็บ = ยิง PATCH ซ้อนกัน แล้วคำสั่งที่ 2 จะขึ้น "資料庫標記失敗"
//     ซึ่งอ่านแล้วเหมือนพัง ทั้งที่คืนค่าสำเร็จไปแล้ว (ครูอาจไปกู้ซ้ำอีกรอบเพราะเข้าใจผิด)
// ════════════════════════════════════════════════════════════════════════════
var _inFlightBackupIds = {};
async function revertCalendarBackup(id) {
  if (_inFlightBackupIds[id]) return;
  _inFlightBackupIds[id] = true;
  try {
    return await revertCalendarBackupInner(id);
  } finally {
    delete _inFlightBackupIds[id];
  }
}

async function revertCalendarBackupInner(id) {
  var b = (window._backupCache || {})[id];
  if (!b) return;
  _revertNewEventId = null;
  _revertWasRecurring = false;
  // 🟡 2026-07-31 เพิ่มสาขา create（ข้อ #20）：คืนค่าการ "เพิ่มคาบ" = ลบคาบนั้นทิ้ง (ตรงข้ามกับสาขาอื่น)
  //   ต้องเขียนให้ชัดว่ากำลังจะ "ลบ" ไม่ใช่ "สร้างกลับ" ไม่งั้นครูกดผิดแน่นอน
  var isRecurCreate = !!(b.action === 'create' && b.old_event_json && b.old_event_json.recurrence);
  var msg = b.action === 'create'
    ? ('確定要復原嗎？這會把剛剛新增的課堂「刪掉」：' + formatThaiDateTimeLabel(b.old_start) + '（泰國時間）'
       + (isRecurCreate ? '\n\n⚠️ 這是「每週固定課」——刪掉的話整組都會不見，不是只有這一次。' : '')
       + '\n\n系統也會通知學生這堂課取消了。')
    : b.action === 'delete'
    ? ('確定要復原嗎？會重新建立回原本的課堂：' + formatThaiDateTimeLabel(b.old_start) + '（泰國時間）')
    : ('確定要復原嗎？會把課堂移回原本時間：' + formatThaiDateTimeLabel(b.old_start) + '（泰國時間）');

  // 🔴 ด่านเดียวกับตอนยกเลิกคาบ (งาน C10)：ถ้าคาบนี้ถูกบันทึกว่า "เรียนไปแล้ว" ห้ามลบเงียบๆ
  //   ลบทิ้ง = โควตาถูกหักไปแล้วแต่ปฏิทินว่างเปล่า = ข้อมูล 2 ฝั่งไม่ตรงกัน (กับดักเดิมของเคส 育郁)
  if (b.action === 'create' && b.token && b.old_start) {
    try {
      var createDateStr = formatInTz(new Date(b.old_start), TEACHER_TZ).dateStr;
      var attCreate = await sb.from('classroom_attendance').select('lesson_date')
        .eq('token', b.token).eq('lesson_date', createDateStr).limit(1);
      if (attCreate.error) {
        msg += '\n\n⚠️ 查不到上課紀錄（' + attCreate.error.message + '），請自己確認過再繼續。';
      } else if (attCreate.data && attCreate.data.length) {
        alert('🛑 這堂課（' + createDateStr + '）已經有「上過課」的紀錄了，沒有刪除任何東西。\n\n'
          + '刪掉的話，堂數已經扣掉但 Calendar 會變空的，兩邊對不起來。\n'
          + '如果真的要刪，請自己到 Google Calendar 處理，並記得一起調整上課紀錄。');
        return;
      }
    } catch (e) {
      msg += '\n\n⚠️ 檢查上課紀錄時出錯（' + (e.message || e) + '），請自己確認過再繼續。';
    }
  }
  // 🔴 2026-07-26 加：復原「永久變更」會把新課表整組刪掉。如果新課表那段期間已經有「上過課」的紀錄，
  // 代表那幾堂是真的上過的，刪掉會讓 Calendar 跟上課紀錄對不起來（就是這次 育郁 事件的同一個坑）。
  // → 先查 classroom_attendance，有就把日期列出來，讓 Lin 知道自己在刪什麼再決定。
  if (b.action === 'permanent_change' && b.new_start && b.token) {
    try {
      var newStartDay = formatInTz(new Date(b.new_start), TEACHER_TZ).dateStr;
      // 🟠 2026-07-26：จำกัด 10 บรรทัด — กล่อง confirm ของเบราว์เซอร์ถ้ายาวเกินจะตัด/เลื่อนไม่ได้
      // แล้วบรรทัดสำคัญที่สุด ("真的要繼續嗎？") จะหลุดออกนอกจอ บนปุ่มที่อันตรายที่สุดในระบบ
      var attWarn = await sb.from('classroom_attendance').select('lesson_date', { count: 'exact' }).eq('token', b.token)
        .gte('lesson_date', newStartDay).order('lesson_date', { ascending: true }).limit(10);
      if (attWarn.error) {
        msg += '\n\n⚠️ 讀不到上課紀錄（' + attWarn.error.message + '），無法確認新課表那段期間有沒有已經上過的課，請自己確認過再繼續。';
      } else if (attWarn.data && attWarn.data.length) {
        var attTotal = (typeof attWarn.count === 'number') ? attWarn.count : attWarn.data.length;
        msg += '\n\n🛑 注意：新課表這段期間已經有「上過課」的紀錄（共 ' + attTotal + ' 堂）：\n'
          + attWarn.data.map(function (x) { return '・' + x.lesson_date; }).join('\n')
          + (attTotal > attWarn.data.length ? '\n・…還有 ' + (attTotal - attWarn.data.length) + ' 堂' : '')
          + '\n復原會把新課表整組從 Calendar 刪掉，這幾堂已經上過的課會從 Calendar 消失（上課紀錄還在資料庫）。\n'
          + '真的要繼續嗎？';
      }
    } catch (e) {
      msg += '\n\n⚠️ 檢查上課紀錄時出錯（' + (e.message || e) + '），請自己確認過再繼續。';
    }
  }
  // ════════════════════════════════════════════════════════════════════════
  // 🔴 2026-08-01 เพิ่มด่านกันอดีต (audit ระบบเลื่อนคาบ ข้อ A10)
  //   เคสจริงที่เกิดได้ทุกสัปดาห์: คาบวันอังคาร → ครูย้ายไปวันศุกร์ → วันพุธเปิดหน้าจอเจอการ์ด
  //   ↩️ 復原 ยังอยู่ (เพราะการ์ดจะอยู่จนกว่าจะถึงเวลาใหม่ = วันศุกร์) → กดกู้คืน
  //   = คาบถูกย้ายกลับไป "วันอังคารที่ผ่านไปแล้ว" ซึ่งคือสิ่งที่ Lin สั่งห้ามทั้งแอป (ดู index.html:1403)
  //   ผลตามมา: ระบบเตือนก่อนเรียนไม่มีวันยิง + คาบหลุดจากตารางเรียน (get_student_schedule กรองวันอดีต)
  //   ⚠️ ตั้งใจใส่ด่านนี้เฉพาะ action='move' — สาขา delete (สร้างคาบกลับ) แค่ "เตือน" ไม่บล็อก
  //      เพราะการสร้างคาบที่เคยมีอยู่แล้วกลับมาเป็นการกู้ข้อมูล ไม่ใช่การจัดคาบใหม่ในอดีต
  // ════════════════════════════════════════════════════════════════════════
  if (b.action === 'move' && b.old_start && new Date(b.old_start).getTime() <= Date.now()) {
    alert('🛑 沒辦法復原，因為原本的時間（' + formatThaiDateTimeLabel(b.old_start) + '，泰國時間）已經過去了。\n\n'
      + '系統一律不把課堂移回已經過去的時間（會讓提醒不會發、課表也看不到這堂）。\n\n'
      + '如果真的需要，請直接到 Google Calendar 手動調整。');
    return;
  }
  if (!confirm(msg)) return;
  try {
    var token = await gdGetToken();
    if (b.action === 'create') {
      // 🟡 2026-07-31 (ข้อ #20)：คืนค่าการเพิ่มคาบ = ลบคาบที่เพิ่งสร้างออกจากปฏิทิน
      //   410 = ถูกลบไปแล้วก่อนหน้า · 404 = ไม่มีอยู่แล้ว → ทั้งคู่คือ "ผลลัพธ์ที่ต้องการเกิดแล้ว" ผ่านได้
      //   (ท่าเดียวกับตอนคืนค่า permanent_change ที่ต้องลบชุดคาบใหม่ทิ้ง)
      // 🔴 2026-07-31 (รอบ 4) เพิ่มด่าน "มองเห็นก่อนลบ" — ลอกจาก deleteCalendarEventById ฝั่ง LINE
      //   บั๊กที่จับได้ตอนตรวจย้อนกลับ: ถ้า event นี้ไม่ได้อยู่ในปฏิทินที่เบราว์เซอร์นี้เห็น (เช่น วันหนึ่ง
      //   ค่า GOOGLE_CALENDAR_ID ถูกเปลี่ยนให้ชี้คนละใบกับ primary) คำสั่งลบจะตอบ 404
      //   ซึ่งบรรทัดล่างตีความว่า "ลบไปแล้ว = สำเร็จ" → ระบบจะลบแถวตารางเรียน, ปิดแถวสำรอง,
      //   ขึ้นว่า「✅ 已刪除」 และส่ง LINE บอกนักเรียนว่าคาบถูกยกเลิก **ทั้งที่คาบยังอยู่ในปฏิทินจริงๆ**
      //   = พังแบบเงียบและกลับด้าน (ระบบบอกว่าหายแล้ว ปฏิทินบอกว่ายังอยู่) ผิดกฎ RELIABILITY FIRST
      //   → เช็คก่อนว่ามองเห็นไหม มองไม่เห็น = หยุด ไม่แตะอะไรเลย แล้วบอกครูตรงๆ
      var preCreate = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events/' + encodeURIComponent(b.old_event_id), {
        headers: { Authorization: 'Bearer ' + token },
      });
      if (preCreate.status === 404 || preCreate.status === 410) {
        alert('🛑 找不到這堂課了，沒有做任何動作。\n\n' +
          '可能是：(1) 已經有人手動刪掉了 (2) 這堂課建立在「另一本」行事曆上，這個帳號看不到。\n\n' +
          '請先自己到 Google Calendar 確認一下這堂課還在不在，再決定要不要處理。');
        return;
      }
      if (!preCreate.ok) {
        throw new Error('確認這堂課是否存在時失敗（' + preCreate.status + '）：' + (await preCreate.text()).slice(0, 200) +
          '\n為了安全，這次沒有刪除任何東西。');
      }
      var delCreate = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events/' + encodeURIComponent(b.old_event_id), {
        method: 'DELETE', headers: { Authorization: 'Bearer ' + token },
      });
      if (!delCreate.ok && delCreate.status !== 410 && delCreate.status !== 404) {
        throw new Error('刪除這堂新增的課失敗（' + delCreate.status + '）：' + (await delCreate.text()).slice(0, 200));
      }
      await verifyEventDeleted(b.old_event_id); // ไม่เชื่อแค่ API ตอบ ok — กลับไปดูของจริงว่าหายแล้วจริง
    } else if (b.action === 'delete') {
      var body = Object.assign({}, b.old_event_json);
      // 🟡 2026-07-31 หมายเหตุ (งาน C11): 2 ตัวที่ตัดทิ้งนี้คือตัวที่บอกว่า "คาบนี้เป็นสมาชิกของชุดคาบประจำ"
      //   Google Calendar ไม่ยอมให้สร้างคาบใหม่กลับ "เข้าชุดเดิม" ที่ถูกลบไปแล้ว (ข้อจำกัดของ Google เอง)
      //   → ตัดทิ้งเป็นทางเดียวที่สร้างกลับมาได้จริง แต่ผลคือคาบที่กู้มาจะกลายเป็น "คาบเดี่ยว" หลุดออกจากชุด
      //   ไม่ฝืนแก้ แต่ต้องบอกครูตรงๆ ตอนจบ (ดูข้อความเตือนท้ายฟังก์ชัน) — ห้ามเงียบ
      var wasRecurringOccurrence = !!(b.old_event_json && (b.old_event_json.recurringEventId || b.old_event_json.originalStartTime));
      ['id', 'etag', 'iCalUID', 'htmlLink', 'created', 'updated', 'creator', 'organizer', 'recurringEventId', 'originalStartTime', 'sequence'].forEach(function(k) { delete body[k]; });
      var r = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events?conferenceDataVersion=1', {
        method: 'POST', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
      if (!r.ok) throw new Error('重新建立課堂失敗（' + r.status + '）：' + (await r.text()).slice(0, 200));
      // 🟡 2026-07-31 加（งาน C11 — RELIABILITY FIRST）：เดิมเช็คแค่ r.ok แล้วถือว่าเสร็จ
      //   เป็นจุดเดียวในไฟล์นี้ที่เขียน Calendar แล้วไม่ย้อนกลับไปดูของจริง (ที่อื่นตรวจซ้ำหมด)
      //   ตอนนี้: อ่านกลับมาว่าคาบใหม่มีอยู่จริง + เก็บเลขคาบใหม่ไว้ใช้ต่อ
      var createdEv = await r.json().catch(function () { return null; });
      _revertNewEventId = (createdEv && createdEv.id) || null;
      _revertWasRecurring = wasRecurringOccurrence;
      if (!_revertNewEventId) throw new Error('重新建立課堂後拿不到新的事件 ID，請自己到 Calendar 確認一下');
      var reGet = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events/' + encodeURIComponent(_revertNewEventId), {
        headers: { Authorization: 'Bearer ' + token },
      });
      if (!reGet.ok) throw new Error('課堂建立了，但回頭確認的時候讀不到（' + reGet.status + '）：請自己到 Calendar 確認一下');
      var reGetEv = await reGet.json().catch(function () { return {}; });
      if (reGetEv.status === 'cancelled') throw new Error('課堂建立了，但回頭確認的時候顯示已取消，請自己到 Calendar 確認一下');
    } else {
      var patchBody = { start: b.old_event_json.start, end: b.old_event_json.end };
      if (b.old_event_json.recurrence) patchBody.recurrence = b.old_event_json.recurrence;
      var r2 = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events/' + encodeURIComponent(b.old_event_id), {
        method: 'PATCH', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, body: JSON.stringify(patchBody),
      });
      if (!r2.ok) throw new Error('復原失敗（' + r2.status + '）：' + (await r2.text()).slice(0, 200));
      // 🔴 2026-08-01 加 (audit ระบบเลื่อนคาบ ข้อ A10 — RELIABILITY FIRST)
      //   เดิมเชื่อแค่ว่า API ตอบ ok แล้วถือว่าคืนค่าสำเร็จ — เป็นจุดสุดท้ายในไฟล์นี้ที่ยังทำแบบนั้น
      //   (ทุกที่อื่นที่แตะ Calendar อ่านกลับมาตรวจซ้ำหมดแล้ว ตั้งแต่ 2026-07-15/2026-07-26/2026-07-31)
      //   บนปุ่มที่เป็น "ตาข่ายรองสุดท้าย" ยิ่งห้ามเดา — ถ้าตรวจแล้วไม่ตรง ต้องโยน error ออกไปเลย
      var revertExpectedStart = b.old_event_json && b.old_event_json.start
        && (b.old_event_json.start.dateTime || b.old_event_json.start.date);
      if (revertExpectedStart) await verifyEventMoved(b.old_event_id, revertExpectedStart);
      if (b.action === 'permanent_change' && b.new_event_id) {
        // 🔴 2026-07-26 แก้ (RELIABILITY FIRST)：เดิมเป็น .catch(function(){}) = กลืน error เงียบสนิท
        // ถ้าลบชุดคาบใหม่ไม่สำเร็จ ครูจะเหลือ "คาบเก่า + คาบใหม่" ซ้อนกัน 2 ชุดในปฏิทิน
        // โดยระบบขึ้นว่าคืนค่าสำเร็จแล้ว → ต้องเช็ค r.ok + verifyEventDeleted จริง แล้วโยน error ออกไป
        var delRes = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events/' + encodeURIComponent(b.new_event_id), {
          method: 'DELETE', headers: { Authorization: 'Bearer ' + token },
        });
        // 410 = ถูกลบไปแล้วก่อนหน้า, 404 = ไม่มีอยู่แล้ว → ทั้งคู่ถือว่า "ผลลัพธ์ที่ต้องการเกิดแล้ว" ผ่านได้
        if (!delRes.ok && delRes.status !== 410 && delRes.status !== 404) {
          throw new Error('舊課表已經復原了，但「刪除新課表」失敗（' + delRes.status + '）：' + (await delRes.text()).slice(0, 200)
            + '\n⚠️ 現在 Calendar 上可能同時有新舊兩份課表，請自己到 Calendar 把新的那份刪掉。');
        }
        await verifyEventDeleted(b.new_event_id); // ไม่เชื่อแค่ API ตอบ ok — กลับไปดูของจริงว่าหายแล้วจริง
      }
    }
  } catch (e) {
    alert('⚠️ 復原失敗：' + (e.message || e));
    return;
  }
  var res = await sb.from('classroom_calendar_backups').update({ reverted: true, reverted_at: new Date().toISOString() }).eq('id', id).select();
  if (res.error || !res.data || !res.data.length) {
    alert('⚠️ Calendar 已經復原了，但資料庫標記失敗，請通知開發者檢查（' + (res.error ? res.error.message : 'RLS 可能擋住') + '）');
  }

  // ══════════════════════════════════════════════════════════════════════════
  // 🟡 2026-07-31 加（งาน C11）：กู้คืน "คาบที่ถูกยกเลิก" ให้ครบ ไม่ใช่แค่สร้างกลับใน Calendar
  //
  // เดิมขาด 3 อย่าง (ทำให้กู้แล้วเหมือนยังไม่กู้ในสายตานักเรียน):
  //   (1) ไม่เขียนแถวตารางเรียนกลับ → นานสุด 20 นาที (รอ cron) ที่หน้าเว็บนักเรียนยังมองไม่เห็นคาบนี้เลย
  //   (2) ไม่อัปเดตเลขคาบใหม่ลงคำขอเดิม → ถ้าครูจะยกเลิกซ้ำอีกครั้ง จะชี้ไปเลขเก่าที่ตายแล้ว
  //   (3) คาบประจำที่กู้กลับมากลายเป็นคาบเดี่ยว แต่ไม่มีใครบอกครู (แก้ไม่ได้จริง แต่ต้องบอก)
  // ══════════════════════════════════════════════════════════════════════════
  var revertExtraWarn = '';

  // ══════════════════════════════════════════════════════════════════════════
  // 🔴 2026-08-02 เพิ่ม (จากการตรวจซ้ำ) — คืนค่า "การย้ายคาบ" ต้องแก้ตารางเรียนกลับด้วย
  //
  // 🕳️ รูที่อุด: สาขา create ลบแถวตารางเรียนให้ · สาขา delete เขียนแถวคืนให้ ·
  //    **มีแต่สาขา move ที่ไม่ทำอะไรเลย** → กดคืนค่าแล้วปฏิทินกลับไปเวลาเดิมจริง
  //    แต่แถวใน classroom_schedule ยังเป็น "เวลาใหม่" จนกว่า cron จะมาแก้ (นานสุด 15-30 นาที)
  //    ระหว่างนั้น class-reminder-cron (รันทุก 5 นาที) อ่านเวลาผิด = เตือนนักเรียนผิดเวลา
  //    และหน้าเว็บนักเรียนก็ยังเห็นเวลาใหม่ที่ถูกยกเลิกไปแล้ว
  //
  // ⚠️ ทำไมเพิ่งมาเป็นปัญหาชัดตอนนี้: ก่อน 2026-08-01 ไม่มีใครเขียนตารางเรียนตอนย้ายคาบ
  //    แถวจึงมักยังเป็นเวลาเก่าอยู่ → กดคืนค่าแล้ว "บังเอิญตรง"
  //    พอเพิ่ม syncScheduleRowAfterMove ฝั่ง LINE (line-webhook:904) แถวถูกเขียนเป็นเวลาใหม่
  //    ทุกครั้งแน่นอน → ช่องว่างนี้กลายเป็น "เกิดขึ้นทุกครั้งที่กดคืนค่า" แทนที่จะเป็น "บางครั้ง"
  //
  // 🔑 ใช้ calendar_event_id เป็นตัวชี้ (ย้ายคาบไม่เปลี่ยนเลข = แถวเดิม) ไม่เดาจาก "ชื่อ+วันที่"
  //    ต้องรีเซ็ตธง "เตือนไปแล้ว" ด้วย ไม่งั้นคาบที่เคยถูกเตือนตอนเวลาใหม่ จะไม่ถูกเตือนอีกเลย
  //    (ตรรกะเดียวกับ syncScheduleRowAfterMove ฝั่ง LINE เป๊ะ รวมทั้งการถอยเมื่อคอลัมน์เก่าถูกลบ)
  // ⚠️ ล้มเหลวที่นี่ "ห้ามย้อนการคืนค่า" — Calendar คือความจริงหลัก และ cron จะตามแก้ให้เอง
  //    แต่ต้องบอกครูตรงๆ ห้ามเงียบ
  // ══════════════════════════════════════════════════════════════════════════
  if (b.action === 'move' && b.old_event_id) {
    try {
      var revBackStart = b.old_start ? formatInTz(new Date(b.old_start), TEACHER_TZ) : null;
      var revBackEndStr = '';
      try {
        var revBackOldEnd = b.old_event_json && b.old_event_json.end && (b.old_event_json.end.dateTime || b.old_event_json.end.date);
        if (revBackOldEnd) revBackEndStr = formatInTz(new Date(revBackOldEnd), TEACHER_TZ).timeStr;
      } catch (e) { /* ไม่มีเวลาจบก็ไม่เป็นไร ปล่อยว่าง */ }
      if (!revBackStart) {
        revertExtraWarn += '\n⚠️ 課堂已經搬回原本時間了，但備份裡沒有原本的時間資料，課表沒有跟著改回去。'
          + '\n最慢 30 分鐘後排程會自己修正。';
      } else {
        var revBase = { lesson_date: revBackStart.dateStr, start_time: revBackStart.timeStr || '', end_time: revBackEndStr, line_reminder24h_sent: false };
        var revWithLegacy = Object.assign({}, revBase, { line_reminder_sent: false, line_followup_sent: false });
        var revUpd = await sb.from('classroom_schedule').update(revWithLegacy, { count: 'exact' }).eq('calendar_event_id', b.old_event_id);
        // คอลัมน์ธงรุ่นเก่าอาจถูกลบไปแล้ว → ลองใหม่เฉพาะตัวที่ใช้จริง (ท่าเดียวกับฝั่ง LINE)
        if (revUpd.error && (revUpd.error.code === 'PGRST204' || revUpd.error.code === '42703'
            || /column .* does not exist|could not find the .* column/i.test(revUpd.error.message || ''))) {
          revUpd = await sb.from('classroom_schedule').update(revBase, { count: 'exact' }).eq('calendar_event_id', b.old_event_id);
        }
        if (revUpd.error) {
          revertExtraWarn += '\n⚠️ 課堂已經搬回原本時間了，但課表資料庫還是新時間（' + revUpd.error.message + '）。'
            + '\n最慢 30 分鐘後排程會自己修正；這段期間學生看到的時間、上課提醒可能還是錯的。';
        } else if (!revUpd.count) {
          console.warn('ℹ️ 復原改期：classroom_schedule 找不到 calendar_event_id=' + b.old_event_id + ' 的資料列（可能還沒同步進去，不影響復原本身）');
        }
      }
    } catch (e) {
      revertExtraWarn += '\n⚠️ 課堂已經搬回原本時間了，但改課表時出錯（' + (e.message || e) + '）。最慢 30 分鐘後排程會自己修正。';
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // 🟠 2026-08-02 เพิ่ม (ตรวจ 3 ระบบ ข้อ 4.7) — คืนค่า「永久變更」ต้องคืนตารางเรียนของนักเรียนด้วย
  //   ตอนกดเปลี่ยนถาวร ระบบเขียน pending_start_date/pending_class_time/pending_recurring ทับไว้
  //   (submitPermanentChangeInner) แต่ตอนคืนค่าไม่เคยมีใครเขียนกลับเลย
  //   → Calendar กลับชุดเก่า แต่หน้าเว็บนักเรียนยังคำนวณจากเวลาใหม่ตลอดกาล = คนละเรื่องกันทั้ง 2 ฝั่ง
  //   ⚠️ แถวสำรองเก่า (ก่อน 2026-08-02) ไม่มี _pendingBefore → ข้ามไป + บอกครูตรงๆ ห้ามเดาค่า
  //   ⚠️ ล้มเหลวที่นี่ "ห้ามย้อนการคืนค่า" — Calendar คือความจริงหลัก แต่ต้องบอกครู ห้ามเงียบ
  // ══════════════════════════════════════════════════════════════════════════
  if (b.action === 'permanent_change') {
    var pendBefore = b.old_event_json && b.old_event_json._pendingBefore;
    if (!pendBefore) {
      revertExtraWarn += '\n⚠️ 這筆備份是舊版的，沒有存到「學生課表設定」的原始值，'
        + '所以學生頁面上的固定上課時間還是新的那個。請到學生資料裡自己改回來。';
    } else {
      try {
        var pendRes = await sb.from('classroom_students').update({
          pending_start_date: pendBefore.pending_start_date,
          pending_class_time: pendBefore.pending_class_time,
          pending_recurring: pendBefore.pending_recurring,
        }).eq('token', b.token).select();
        if (pendRes.error || !pendRes.data || !pendRes.data.length) {
          revertExtraWarn += '\n⚠️ 課表已經復原了，但學生頁面的固定上課時間沒改回去（'
            + (pendRes.error ? pendRes.error.message : '更新 0 筆') + '），請自己到學生資料改回來。';
        } else if (studentsCache[b.token]) {
          studentsCache[b.token].pending_start_date = pendBefore.pending_start_date;
          studentsCache[b.token].pending_class_time = pendBefore.pending_class_time;
          studentsCache[b.token].pending_recurring = pendBefore.pending_recurring;
        }
      } catch (e) {
        revertExtraWarn += '\n⚠️ 課表已經復原了，但改回學生頁面的固定上課時間時出錯（' + (e.message || e) + '），請自己確認一下。';
      }
    }
  }

  // 🟡 2026-07-31 (ข้อ #20)：ลบคาบออกจากปฏิทินแล้ว ต้องลบแถวในตารางเรียนตามด้วย
  //   ไม่งั้นหน้าเว็บนักเรียนจะยังโชว์คาบนี้อยู่ (นานสุด 20 นาทีกว่า cron จะมาเก็บกวาด)
  //   ใช้ calendar_event_id เป็นตัวชี้ ไม่เดาจาก "ชื่อ+วันที่" (ท่าเดียวกับที่ระบบยกเลิกใช้)
  if (b.action === 'create') {
    var isRecurRevert = !!(b.old_event_json && b.old_event_json.recurrence);
    var tableToClean = isRecurRevert ? 'classroom_recurring_days' : 'classroom_schedule';
    try {
      var cleanRes = await sb.from(tableToClean).delete().eq('calendar_event_id', b.old_event_id).select();
      if (cleanRes.error) {
        revertExtraWarn += '\n⚠️ 課堂已經從 Calendar 刪掉了，但課表那筆沒清乾淨（' + cleanRes.error.message
          + '）。學生頁面可能還會看到它，最慢 20 分鐘後會自己修正。';
      }
    } catch (e) {
      revertExtraWarn += '\n⚠️ 課堂已經從 Calendar 刪掉了，但清課表時出錯（' + (e.message || e) + '）。最慢 20 分鐘後會自己修正。';
    }
    if (isRecurRevert) {
      revertExtraWarn += '\n\n⚠️ 這是「每週固定課」，整組都已經刪掉了，不是只有這一次。';
    }
  }

  if (b.action === 'delete' && _revertNewEventId) {
    // (1) เขียนแถวตารางเรียนกลับทันที ไม่ต้องรอ cron รอบถัดไป
    try {
      var revStart = b.old_start ? formatInTz(new Date(b.old_start), TEACHER_TZ) : null;
      var revEndStr = '';
      try {
        var revOldEnd = b.old_event_json && b.old_event_json.end && (b.old_event_json.end.dateTime || b.old_event_json.end.date);
        if (revOldEnd) revEndStr = formatInTz(new Date(revOldEnd), TEACHER_TZ).timeStr;
      } catch (e) { /* ไม่มีเวลาจบก็ไม่เป็นไร ปล่อยว่าง */ }
      if (revStart && b.token) {
        var schedRes = await sb.from('classroom_schedule').upsert({
          token: b.token,
          lesson_date: revStart.dateStr,
          start_time: revStart.timeStr || '',
          end_time: revEndStr,
          title: (studentsCache[b.token] && studentsCache[b.token].name) || '',
          calendar_event_id: _revertNewEventId,
          // 🟡 2026-08-02 เพิ่ม (ตรวจ 3 ระบบ ข้อ 4.14) — ต้องรีเซ็ตธง "เตือนไปแล้ว" ด้วย
          //   ถ้าแถวเดิมยังอยู่ (ลบตอนยกเลิกไม่สำเร็จ) upsert จะไปทับแถวเดิมที่ธงเป็น true อยู่
          //   → คาบที่กู้กลับมาจะไม่มีวันได้รับข้อความเตือนอีกเลย
          //   สาขา move ทำถูกมาแล้ว (ดูก้อน revBase ด้านบน) ที่นี่คือจุดสุดท้ายที่ยังขาด
          line_reminder24h_sent: false,
        }, { onConflict: 'token,lesson_date,start_time' }).select();
        if (schedRes.error || !schedRes.data || !schedRes.data.length) {
          revertExtraWarn += '\n⚠️ 課堂復原了，但課表沒有馬上寫回去（' + (schedRes.error ? schedRes.error.message : '寫入 0 筆')
            + '）。學生頁面最慢 20 分鐘後會自己補上。';
        }
      }
    } catch (e) {
      revertExtraWarn += '\n⚠️ 課堂復原了，但寫回課表時出錯（' + (e.message || e) + '）。學生頁面最慢 20 分鐘後會自己補上。';
    }
    // (2) อัปเดตเลขคาบใหม่ลงคำขอเดิม (ถ้าหาเจอ) — คำขอเดิมยังเก็บเลขคาบเก่าที่ถูกลบไปแล้ว
    try {
      if (b.request_id) {
        // 2026-08-11 加 .select() + เช็กจำนวนแถว (จุดสุดท้ายที่ตกหล่นจากรายการ「ฝั่งครู UPDATE ไม่เช็กแถว」
        //   ที่เก็บครบ 4 จุดไปแล้วเมื่อ 2026-07-20)：RLS ที่บล็อกจะแก้ 0 แถวเงียบๆ ไม่คืน error
        //   ผลถ้าพลาด: คำขอเดิมยังชี้ไปเลขคาบเก่าที่ถูกลบไปแล้ว → ปุ่มต่อๆ ไปหาคาบไม่เจอ
        //   ไม่ขัดจังหวะการกู้คืน (ทำสำเร็จไปแล้ว) แค่ต้องไม่เงียบ
        var revReqUpd = await sb.from('classroom_requests').update({ calendar_event_id: _revertNewEventId }).eq('id', b.request_id).select();
        if (revReqUpd.error || !revReqUpd.data || !revReqUpd.data.length) {
          console.warn('⚠️ อัปเดตเลขคาบใหม่ลงคำขอไม่สำเร็จ (ไม่กระทบการกู้คืน) request_id=' + b.request_id + '：',
            revReqUpd.error ? revReqUpd.error.message : '更新 0 筆');
        }
      }
    } catch (e) { console.warn('⚠️ อัปเดตเลขคาบใหม่ลงคำขอไม่สำเร็จ (ไม่กระทบการกู้คืน):', e.message || e); }
    // (3) คาบประจำ → บอกครูตรงๆ ว่าตอนนี้กลายเป็นคาบเดี่ยวแล้ว
    if (_revertWasRecurring) {
      revertExtraWarn += '\n\n⚠️ 這堂原本是「每週固定課」裡的其中一次。\nGoogle 不允許把課塞回已經刪掉的那組固定課，'
        + '所以復原回來的這一堂現在是「單獨一堂」，不在原本的每週系列裡了。\n'
        + '（其他週的課完全不受影響）如果希望它回到系列裡，要自己到 Google Calendar 調整。';
    }
  }
  // 2026-07-31：สาขา create ต้องขึ้นข้อความว่า "ลบแล้ว" ไม่ใช่ "คืนค่าแล้ว" (ครูจะเข้าใจผิดว่าคาบยังอยู่)
  if (b.action === 'create') alert('✅ 已刪除剛剛新增的課堂' + revertExtraWarn);
  else if (revertExtraWarn) alert('✅ 課堂已復原' + revertExtraWarn);

  // 2026-07-17 加（Lin 要求）：復原之後也要跟取消/改期/加課一樣，用 LINE 通知學生和老師自己一份，
  // 三種復原類型（取消復原/改期復原/永久變更復原）各自用不同文案講清楚剛剛發生了什麼。
  // 通知失敗不影響已經完成的 Calendar 復原動作（跟其他通知一樣，只在主控台留紀錄）。
  var sForRevert = studentsCache[b.token];
  var revertNotifyWarn = ''; // 2026-08-02: ผลการแจ้งนักเรียน (ว่าง = ส่งถึงจริง)
  // 🟡 2026-07-31 เพิ่มสาขา create（ข้อ #20）：ห้ามบอกนักเรียนว่า "คืนค่าแล้ว" ทั้งที่คาบถูก "ลบทิ้ง"
  //   นักเรียนอ่านแล้วจะเข้าใจว่ายังมีคาบอยู่ แล้วมารอเรียน → ต้องเขียนตรงๆ ว่าคาบนั้นถูกยกเลิก
  var revertLabelForStudent = { delete: '這堂課復原了', move: '課堂復原回原本時間了', permanent_change: '固定課表復原回原本時間了' }[b.action] || '已經復原了';
  var revertLabelForTeacher = { delete: '已復原取消', move: '已把課復原回原本時間', permanent_change: '已復原固定課表', create: '已刪除剛剛新增的課堂' }[b.action] || '已復原';
  if (sForRevert && sForRevert.line_user_id) {
    try {
      var studentOldTimeLabel = studentFacingTimeLabel(b.old_start, sForRevert.pending_student_tz);
      var revertStudentMsg = b.action === 'create'
        ? ('ℹ️ 抱歉，老師剛剛新增的那堂課取消了：' + studentOldTimeLabel + '\n這堂課不會上，如有疑問請直接聯絡老師。')
        : ('老師剛剛把之前的操作復原了，' + revertLabelForStudent + '：' + studentOldTimeLabel + '，如有疑問請直接聯絡老師');
      // 🟠 2026-08-02 (ตรวจ 3 ระบบ Q1 ข้อ 2)：เดิมยิงทิ้ง ไม่เช็ค res.ok และไม่บอกครู
      //   → คาบถูกลบ/ย้ายกลับไปแล้วจริง แต่นักเรียนอาจไม่รู้เลย และไม่มีใครรู้ว่าเขาไม่รู้
      //   สาขา create ยิ่งหนัก: คาบถูก "ลบทิ้ง" นักเรียนต้องรู้แน่ๆ ไม่งั้นมารอเรียน
      var revertNotifyRes = await fetch(LINE_NOTIFY_ENDPOINT, {
        method: 'POST',
        // 2026-07-19 แก้（SECURITY FIRST）：notify-line สาขา to:{studentToken} ตอนนี้บังคับต้องมี session จริงของครู
        headers: { 'Content-Type': 'application/json', 'apikey': window.SUPABASE_CONFIG.anonKey, 'Authorization': 'Bearer ' + (await teacherAuthHeader()) },
        body: JSON.stringify({ to: { studentToken: b.token }, message: revertStudentMsg }),
      });
      if (!revertNotifyRes.ok) revertNotifyWarn = '\n⚠️ 但 LINE 通知學生沒送出去（' + (await lineNotifyErrorText(revertNotifyRes)) + '），請自己再跟學生說一聲';
    } catch (e) {
      console.warn('⚠️ 復原通知學生失敗（不影響已經完成的復原）：', e.message || e);
      revertNotifyWarn = '\n⚠️ 但 LINE 通知學生沒送出去（' + (e.message || e) + '），請自己再跟學生說一聲';
    }
  } else {
    revertNotifyWarn = '\n⚠️ 這位學生還沒連結 LINE，沒收到通知，記得自己說一聲';
  }
  // 🟠 2026-08-02：ถ้าแจ้งนักเรียนไม่สำเร็จ ต้องเด้งบอกครูเสมอ (ข้อความสรุปด้านบนอาจไม่ได้ขึ้นเลยถ้าไม่มีคำเตือนอื่น)
  if (revertNotifyWarn) alert('ℹ️ ' + (b.action === 'create' ? '已刪除剛剛新增的課堂' : '課堂已復原') + revertNotifyWarn);
  try {
    await fetch(LINE_NOTIFY_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': window.SUPABASE_CONFIG.anonKey, 'Authorization': 'Bearer ' + (await teacherAuthHeader()) }, // 2026-07-26：สาขา to:'teacher' บังคับพิสูจน์ตัวแล้ว — ฝั่งครูใช้ session จริง
      body: JSON.stringify({ to: 'teacher', message: '✅ ' + revertLabelForTeacher + '：' + (sForRevert ? sForRevert.name : (b.token || '-')) + '　' + formatThaiDateTimeLabel(b.old_start) + '（泰國時間）' }),
    });
  } catch (e) { console.warn('⚠️ 復原通知老師自己失敗（不影響已經完成的復原）：', e.message || e); }

  try { await refreshTodayScheduleSection(); } catch (e) { console.warn('⚠️ 課表 resync 失敗（不影響已經完成的復原）：', e.message || e); }

  await loadRecentBackups();
}

// ════════════════════════════════════════════════════════════
// 2026-07-13 新增：老師端「幫學生改期/取消/永久變更」——「下一堂課」小卡片
// 放在老師選到某學生時的面板裡（跟學生自己頁面看到的「下一堂課」同樣邏輯，只是給老師用）
// ════════════════════════════════════════════════════════════
var _teacherNextClassCtx = {};
