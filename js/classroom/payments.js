// ============================================================
// PAYMENT SYSTEM
// ============================================================
// ⚠️ 老師填這裡：匯款帳戶（留空會顯示「待老師填寫」）。改完直接 push 即可
// 注意：靜態網站 → 帳號會出現在網頁原始碼，任何人都看得到（與公開的聯絡 Email 同性質）
// QR 圖片：放在 assets/pay-qr/（檔名見該資料夾 README）。沒放檔也不會壞，會自動隱藏
const BANK_INFO = {
  NTD: { title: '🇹🇼 台灣銀行帳戶（匯 NTD）', qr: '../assets/pay-qr/ntd-ctbc.jpg', lines: [
    '銀行：中國信託 (822)',
    '分行：城中分行 (0107)',
    '帳號：107540587096',
    '戶名：林泰華'
  ] },
  THB: { title: '🇹🇭 PromptPay（匯 THB）', qr: '../assets/pay-qr/thb-promptpay.jpg', lines: [
    'PromptPay：掃下方 QR 轉帳',
    '戶名：นาย ไท่หัว หลิน（林泰華）',
    '帳號：xxx-x-x7358-x',
    '參考編號：004999017326389'
  ] }
};
// Wise（國際匯款，兩種幣別都可用）— 網站轉帳 跟 掃 QR 是兩種「各自獨立可選」的付款方式，不是同一套步驟
const WISE_INFO = {
  tag: '@taihual7', qr: '../assets/pay-qr/wise.jpg',
  siteUrl: 'https://wise.com',
  lines: [
    '收款人姓名：Taihua Lin',
    '銀行名稱：Kasikorn Bank',
    '銀行地址：Lotus Petchkasem 81',
    'Swift Code：KASITHBK',
    '帳號：0208373587',
    '收款人地址：Nongkhaem, Bangkok, Thailand 10160'
  ]
};

// 課程方案：NTD 價依 pricing.html#pricing（權威）；THB 沿用舊值，請老師確認
const COURSES = [
  { id:'basic',    label:'入門 Basic',      lessons:10, bonus:0, priceNTD:700,  priceTHB:800,  note:'只限購買一期', desc:'10堂 · 打好發音基礎' },
  { id:'std1',     label:'進階 Standard ①', lessons:10, bonus:0, priceNTD:800,  priceTHB:800,  desc:'10堂 · 客製主題會話' },
  { id:'std2',     label:'進階 Standard ②', lessons:20, bonus:1, priceNTD:800,  priceTHB:800,  desc:'20堂 · 贈 1 堂' },
  { id:'std3',     label:'進階 Standard ③', lessons:30, bonus:3, priceNTD:800,  priceTHB:800,  desc:'30堂 · 贈 3 堂 ⭐' },
  { id:'pair_basic', label:'雙人 Basic',    lessons:10, bonus:0, priceNTD:1100, priceTHB:null, desc:'每人 · Basic 雙人共學' },
  { id:'pair_std',   label:'雙人 Standard', lessons:10, bonus:0, priceNTD:1200, priceTHB:null, desc:'每人 · Standard 雙人共學' },
  { id:'custom',   label:'自訂',            lessons:null, bonus:0, priceNTD:null, priceTHB:null, desc:'自行填寫堂數/單價' },
];

// 學生繳費表單用：先選課程類型 → 再選堂數(10/20/30，含贈送) → 再選幣別
// （老師頁收費 modal 仍用上面的 COURSES；學生面價格改這裡）
const COURSE_TYPES = [
  { id:'basic',      label:'入門 Basic',    priceNTD:700,  priceTHB:700,  packs:[10],       note:'只限購買一期', desc:'打好發音基礎' },
  { id:'std',        label:'進階 Standard', priceNTD:800,  priceTHB:800,  packs:[10,20,30], desc:'客製主題會話' },
  { id:'pair_basic', label:'雙人 Basic',    priceNTD:1100, priceTHB:1100, packs:[10,20,30], desc:'Basic 雙人共學・每人' },
  { id:'pair_std',   label:'雙人 Standard', priceNTD:1200, priceTHB:1200, packs:[10,20,30], desc:'Standard 雙人共學・每人' },
];

let payToken = null;
let paySelectedCourse = null;

function openPaymentModal(token) {
  payToken = token;
  paySelectedCourse = null;
  const s = studentsCache[token];
  document.getElementById('payStudentLabel').textContent = s ? '💳 ' + s.name : '';
  // build course cards（同學生：類型→堂數→幣別；另保留「自訂」手動輸入）
  var payCards = COURSE_TYPES.concat([{ id:'custom', label:'自訂', desc:'自行填寫堂數/單價' }]);
  document.getElementById('courseGrid').innerHTML = payCards.map(function(c) {
    return '<button class="course-card" id="cc-' + c.id + '" onclick="selectPayType(\'' + c.id + '\')">' +
      '<div class="c-name">' + c.label + '</div>' +
      '<div class="c-desc">' + c.desc + '</div>' +
    '</button>';
  }).join('');
  document.getElementById('payPackWrap').style.display = 'none';
  document.getElementById('payPackGrid').innerHTML = '';
  document.getElementById('payCurrencyWrap').style.display = 'none';
  document.getElementById('payCustomWrap').style.display = 'none';
  document.getElementById('payCurrencySelect').value = '';
  document.getElementById('payLessons').value = '';
  document.getElementById('payBonus').value = '0';
  document.getElementById('payCurrency').value = 'THB';
  document.getElementById('payPricePer').value = '';
  document.getElementById('payStart').value = '';
  document.getElementById('payTotalBox').style.display = 'none';
  document.getElementById('paymentModal').classList.add('open');
}

function selectPayType(id) {
  paySelectedCourse = id;
  document.querySelectorAll('#courseGrid .course-card').forEach(function(el) { el.classList.remove('selected'); });
  var card = document.getElementById('cc-' + id);
  if (card) card.classList.add('selected');
  if (id === 'custom') {
    document.getElementById('payPackWrap').style.display = 'none';
    document.getElementById('payCurrencyWrap').style.display = 'none';
    document.getElementById('payCustomWrap').style.display = 'block';
    document.getElementById('payLessons').value = '';
    document.getElementById('payPricePer').value = '';
    updatePayTotal();
    return;
  }
  document.getElementById('payCustomWrap').style.display = 'none';
  var c = COURSE_TYPES.find(function(x) { return x.id === id; });
  if (!c) return;
  document.getElementById('payPackGrid').innerHTML = c.packs.map(function(n) {
    var bonus = slipBonusFor(n);
    return '<button type="button" id="ppk-' + n + '" onclick="selectPayPack(' + n + ')" style="' + OFF_PACK + '">' +
      '<div style="font-weight:700;">' + n + ' 堂</div>' +
      (bonus ? '<div style="font-size:0.72rem;color:var(--gold-deep);">贈 ' + bonus + ' 堂</div>' : (c.note ? '<div style="font-size:0.72rem;color:var(--ink-muted);">' + c.note + '</div>' : '')) +
    '</button>';
  }).join('');
  document.getElementById('payPackWrap').style.display = 'block';
  document.getElementById('payCurrencyWrap').style.display = 'none';
  document.getElementById('payCurrencySelect').value = '';
  document.getElementById('payLessons').value = '';
  document.getElementById('payBonus').value = '0';
  document.getElementById('payPricePer').value = '';
  document.getElementById('payTotalBox').style.display = 'none';
  if (c.packs.length === 1) selectPayPack(c.packs[0]);
}

function selectPayPack(n) {
  document.getElementById('payLessons').value = n;
  document.getElementById('payBonus').value = slipBonusFor(n);
  document.querySelectorAll('#payPackGrid button').forEach(function(b) { b.style.cssText = OFF_PACK; });
  var b = document.getElementById('ppk-' + n);
  if (b) b.style.cssText = ON_PACK;
  document.getElementById('payCurrencyWrap').style.display = 'block';
  updatePayTotal();
}

function selectPayCurrency(cur) {
  document.getElementById('payCurrency').value = cur;
  document.getElementById('payCurrencySelect').value = cur;
  var c = COURSE_TYPES.find(function(x) { return x.id === paySelectedCourse; });
  if (c) { var pp = cur === 'NTD' ? c.priceNTD : c.priceTHB; document.getElementById('payPricePer').value = pp || ''; }
  updatePayTotal();
}

function updatePayTotal() {
  const lessons = parseInt(document.getElementById('payLessons').value) || 0;
  const bonus   = parseInt(document.getElementById('payBonus').value)   || 0;
  const pricePer = parseInt(document.getElementById('payPricePer').value) || 0;
  const cur = document.getElementById('payCurrency').value;
  if (lessons <= 0 || pricePer <= 0) { document.getElementById('payTotalBox').style.display = 'none'; return; }
  const total = lessons * pricePer;
  const box = document.getElementById('payTotalBox');
  box.style.display = 'block';
  document.getElementById('payTotalText').textContent = cur + ' ' + total.toLocaleString();
  let calcStr = lessons + '堂 × ' + cur + ' ' + pricePer + '/堂 = ' + cur + ' ' + total.toLocaleString();
  if (bonus > 0) calcStr += '（另贈 ' + bonus + ' 堂）';
  document.getElementById('payCalcText').textContent = calcStr;
  // update price per if currency changed（自訂模式不覆蓋老師填的單價）
  if (paySelectedCourse && paySelectedCourse !== 'custom') {
    const c = COURSE_TYPES.find(function(x) { return x.id === paySelectedCourse; });
    if (c) {
      const pp = cur === 'NTD' ? c.priceNTD : c.priceTHB;
      if (pp) document.getElementById('payPricePer').value = pp;
    }
  }
}

function closePaymentModal() {
  document.getElementById('paymentModal').classList.remove('open');
  payToken = null; paySelectedCourse = null;
}

async function submitPayment() {
  if (!payToken) return;
  const s = studentsCache[payToken];
  const lessons  = parseInt(document.getElementById('payLessons').value);
  const bonus    = parseInt(document.getElementById('payBonus').value)   || 0;
  const pricePer = parseInt(document.getElementById('payPricePer').value);
  const cur      = document.getElementById('payCurrency').value;
  const start    = document.getElementById('payStart').value.trim();
  const note     = '';
  if (!paySelectedCourse) { alert('請選擇課程方案'); return; }
  if (!lessons || !pricePer) { alert('請填寫堂數和單價'); return; }
  const c = COURSE_TYPES.concat([{ id:'custom', label:'自訂' }]).find(function(x) { return x.id === paySelectedCourse; }) || {};
  const courseLabel = (c.label || paySelectedCourse) + ' ' + lessons + '堂' + (bonus ? '（贈' + bonus + '）' : '');
  const total = lessons * pricePer;
  const btn = document.getElementById('paySubmitBtn');
  btn.disabled = true; btn.textContent = '儲存中…';
  const ins = await sb.from('classroom_payments').insert({
    token: payToken,
    student_name: s ? s.name : payToken,
    course_id: paySelectedCourse,
    course_label: courseLabel,
    lessons: lessons,
    bonus_lessons: bonus,
    price_per: pricePer,
    currency: cur,
    total_amount: total,
    start_note: start || null,
    start_date: start || null,
    note: note || null,
    status: 'pending'
  }).select().single();
  if (ins.error) { btn.disabled = false; btn.textContent = '確認收費'; alert('儲存失敗：' + ins.error.message); return; }
  const row = ins.data;
  // 用既有的收據系統產生收據 → 存進該學生「課表 & 收據」資料夾，並讓學生頁出現下載鈕
  btn.textContent = '產生收據中…';
  var receipt = null;
  var receiptDbWarn = '';
  try {
    // 2026-07-15 修（Lin 回報這裡跟 approveSlip 有一樣的問題）：收據編號現在由
    // generateAndUploadReceipt() 內部的 assign_receipt_no() 原子寫入資料庫了，
    // 這裡只需要另外把 status 改成 done，並且要檢查真的有改到（以前完全沒檢查）。
    receipt = await generateAndUploadReceipt(row, { cur: cur, pp: pricePer, ls: lessons, bn: bonus, start: start });
    if (receipt) {
      var payDoneRes = await sb.from('classroom_payments').update({ status: 'done' }).eq('id', row.id).select();
      if (payDoneRes.error || !payDoneRes.data || !payDoneRes.data.length) {
        receiptDbWarn = '\n\n⚠️ 收據已產生（編號 ' + receipt.receiptNo + '），但繳費狀態改成「已完成」失敗（' + (payDoneRes.error ? payDoneRes.error.message : 'RLS 權限問題') + '），這筆可能還停在「pending」，請檢查。';
      }
    }
  } catch (e) { console.warn('收據產生失敗：', e); }
  btn.disabled = false; btn.textContent = '確認收費';
  var tkRefresh = payToken;
  closePaymentModal();
  if (typeof loadLowQuotaBanner === 'function') loadLowQuotaBanner();
  if (typeof loadTeacherStudentInfo === 'function' && tkRefresh) loadTeacherStudentInfo(tkRefresh);
  alert('✅ 已記錄！\n' + (s ? s.name : '') + ' · ' + courseLabel + ' · ' + cur + ' ' + total.toLocaleString()
    + (receipt ? '\n\n🧾 收據已存到學生「課表 & 收據」資料夾\n編號：' + receipt.receiptNo : '\n\n（收據產生失敗，請確認已用 Google 登入授權後再試）') + receiptDbWarn);
}

