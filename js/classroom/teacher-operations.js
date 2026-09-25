// FILE MAP: next class and add-class entry → shared recurrence helper → slips/receipts/setup
async function loadTeacherNextClassBox(token) {
  var t = token.replace(/'/g, '');
  var el = document.getElementById('teacherNextClass-' + t);
  if (!el) return;
  var s = studentsCache[token];
  try {
    const { data } = await sb.rpc('get_student_schedule', { p_token: token });
    let lessonDate = null, startTimeStr = null;
    if (data && data.length) {
      lessonDate = data[0].lesson_date;
      startTimeStr = (data[0].start_time && /^\d{1,2}:\d{2}/.test(data[0].start_time)) ? data[0].start_time : null;
    } else if (s && s.pending_start_date && s.pending_class_time) {
      let anchor = teacherTimeToDate(s.pending_start_date, s.pending_class_time);
      if (s.pending_recurring) {
        const weekMs = 7 * 24 * 3600 * 1000, nowMs = Date.now();
        if (anchor.getTime() < nowMs) { const weeksPassed = Math.ceil((nowMs - anchor.getTime()) / weekMs); anchor = new Date(anchor.getTime() + weeksPassed * weekMs); }
      } else if (anchor.getTime() < Date.now()) { anchor = null; }
      if (anchor) { const p = formatInTz(anchor, TEACHER_TZ); lessonDate = p.dateStr; startTimeStr = p.timeStr; }
    }
    // 2026-07-18 改（Lin 要求，看截圖比對）：按鈕全部用跟學生頁「下一堂課」一模一樣的金色漸層
    // （不要外框透明/不同色，5 顆通通統一）
    var TEACHER_NEXTCLASS_BTN_STYLE = 'background:linear-gradient(135deg,var(--gold-bright) 0%,var(--gold) 50%,var(--gold-deep) 100%);color:#fff;';
    if (!lessonDate) {
      el.innerHTML = '<div class="card" style="padding:16px 18px;margin-top:12px;"><h2>📅 下一堂課</h2>' +
        '<div style="font-size:0.82rem;color:var(--ink-muted);font-family:\'Noto Sans TC\',sans-serif;margin-bottom:10px;">目前沒有排定下一堂課</div>' +
        '<div style="display:flex;gap:8px;flex-wrap:wrap;">' +
          '<button class="btn-sm" id="teacherAttendToggleBtn-' + t + '" style="' + TEACHER_NEXTCLASS_BTN_STYLE + '" onclick="toggleTeacherAttendPanel(\'' + t + '\')">📅 上課記錄 ▼</button>' +
          '<button class="btn-sm" style="' + TEACHER_NEXTCLASS_BTN_STYLE + '" onclick="openAddClassDayModal(\'' + t + '\')" title="加一個上課時間（單次，或每週固定）">➕ 加課堂時間</button>' +
        '</div>' +
        '<div id="teacherAttendPanel-' + t + '" style="display:none;margin-top:12px;padding-top:12px;border-top:1px solid var(--border);"></div>' +
      '</div>';
      return;
    }
    // 2026-07-18 改（Lin 要求）：跟學生自己看到的「下一堂課」用同一套版型
    // （<h2> 標題 + 米色資訊框顯示日期/時間，不是以前擠成一行的小字）
    var dayZh = ['日','一','二','三','四','五','六'];
    var dLabelDate = new Date(lessonDate + 'T00:00:00');
    var dayLabel = (dLabelDate.getMonth()+1) + '月' + dLabelDate.getDate() + '日（週' + dayZh[dLabelDate.getDay()] + '）';
    var timeStr = startTimeStr ? (startTimeStr + '（泰國時間）') : '';
    el.innerHTML = '<div class="card" style="padding:16px 18px;margin-top:12px;">' +
      '<h2>📅 下一堂課</h2>' +
      '<div style="background:#f8f4ea;border:1px solid #e5d9b8;border-radius:10px;padding:12px 14px;font-family:\'Noto Sans TC\',sans-serif;">' +
        '<div style="font-weight:700;font-size:1rem;color:var(--ink);">' + escHtml(dayLabel) + '</div>' +
        (timeStr ? '<div style="font-size:0.9rem;color:var(--ink-soft);margin-top:2px;">' + escHtml(timeStr) + '</div>' : '') +
      '</div>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-start;margin-top:10px;">' +
        // 2026-07-18 加（Lin 要求）：跟學生頁「下一堂課」按鈕列同一套排法+同一套顏色——
        // 📅上課記錄放第一顆，➕加課堂時間也一起放這裡（不是丟在上面主要按鈕列），全部統一金色漸層
        // 2026-07-19 改（Lin 要求，講了五次）：📅上課記錄從 popup 改成跟學生端一樣的「原地展開」
        // dropdown，不再開 modal 彈窗
        '<button class="btn-sm" id="teacherAttendToggleBtn-' + t + '" style="' + TEACHER_NEXTCLASS_BTN_STYLE + '" onclick="toggleTeacherAttendPanel(\'' + t + '\')">📅 上課記錄 ▼</button>' +
        '<button class="btn-sm" style="' + TEACHER_NEXTCLASS_BTN_STYLE + '" onclick="openAddClassDayModal(\'' + t + '\')" title="加一個上課時間（單次，或每週固定）">➕ 加課堂時間</button>' +
      '</div>' +
      '<div id="teacherAttendPanel-' + t + '" style="display:none;margin-top:12px;padding-top:12px;border-top:1px solid var(--border);"></div>' +
    '</div>';
  } catch (e) {
    el.innerHTML = '<div class="card" style="padding:12px 14px;margin-top:12px;"><div style="font-size:0.8rem;color:var(--ink-muted);font-family:\'Noto Sans TC\',sans-serif;">載入下一堂課失敗：' + escHtml(e.message || String(e)) + '</div></div>';
  }
}

// 📅 抓「這位學生本輪剩餘的課堂」清單，給老師自己挑（不用系統自動猜是哪一堂）
// 剩餘堂數算法跟 loadStudentQuota 共用 computeCurrentCourse；抓不到堂數資料時，先列出未來 12 堂讓老師自己選
function setRruleUntil(recurrenceArr, untilUtcStr) {
  return (recurrenceArr || []).map(function(rule) {
    if (rule.indexOf('RRULE') !== 0) return rule;
    var parts = rule.split(';').filter(function(p) { return p.indexOf('UNTIL=') !== 0 && p.indexOf('COUNT=') !== 0; });
    parts.push('UNTIL=' + untilUtcStr);
    return parts.join(';');
  });
}

function viewSlip(id) {
  var p = (window._slipCache || {})[id];
  if (!p || !p.slip_data) return;
  document.getElementById('slipViewerImg').src = p.slip_data;
  document.getElementById('slipViewer').classList.add('open');
}

function openSlipApproval(id) {
  var p = (window._slipCache || {})[id];
  if (!p) return;
  pendingSlipId = id;
  var slipHtml = p.slip_data
    ? '<img src="' + safeImgSrc(p.slip_data) + '" style="max-width:100%;border-radius:8px;margin-bottom:12px;cursor:zoom-in;" onclick="viewSlip(\'' + escHtml(id) + '\')" />'
    : '';
  document.getElementById('slipApprovalContent').innerHTML =
    '<div style="font-family:\'Noto Sans TC\',sans-serif;font-size:0.88rem;margin-bottom:8px;">' +
      '<strong>' + escHtml(p.student_name) + '</strong> · <strong>' + escHtml(p.course_label) + '</strong> · ' + escHtml(p.lessons) + '堂' +
      (p.note ? '<br>📝 ' + escHtml(p.note) : '') +
    '</div>' + slipHtml;
  document.getElementById('approvalCurrency').value = p.currency || 'THB';
  document.getElementById('approvalPricePer').value  = p.price_per || 800;
  document.getElementById('approvalLessons').value   = p.lessons || 10;
  // 2026-07-14：這筆繳費送出時的優惠堂數是 0（例如自訂單堂購買，送出時一律沒有優惠）→
  // 改成優先帶入老師當初在「入班連結」時就填好的優惠堂數（pending_bonus_lessons），
  // 省得 Lin confirm 收款時要重新想一次、重新打一次數字；Lin 隨時仍可在這裡自己改成別的數字。
  var plannedBonus = (typeof studentsCache !== 'undefined' && studentsCache[p.token] && studentsCache[p.token].pending_bonus_lessons != null)
    ? studentsCache[p.token].pending_bonus_lessons : null;
  document.getElementById('approvalBonus').value = p.bonus_lessons ? p.bonus_lessons : (plannedBonus != null ? plannedBonus : 0);
  document.getElementById('approvalStart').value     = p.start_note || '';
  document.getElementById('approvalNote').value      = p.note || '';
  updateApprovalTotal();
  document.getElementById('slipApprovalModal').classList.add('open');
}

function updateApprovalTotal() {
  var cur = document.getElementById('approvalCurrency').value;
  var pp  = parseInt(document.getElementById('approvalPricePer').value) || 0;
  var ls  = parseInt(document.getElementById('approvalLessons').value)  || 0;
  var bn  = parseInt(document.getElementById('approvalBonus').value)    || 0;
  if (!pp || !ls) { document.getElementById('approvalTotalBox').style.display = 'none'; return; }
  var total = ls * pp;
  document.getElementById('approvalTotalBox').style.display = 'block';
  document.getElementById('approvalTotalText').textContent = cur + ' ' + total.toLocaleString();
  document.getElementById('approvalCalcText').textContent  = ls + '堂 × ' + cur + ' ' + pp + '/堂' + (bn > 0 ? '（贈 ' + bn + ' 堂）' : '');
}

// โหลด script ครั้งเดียว (ถ้าโหลดแล้วข้ามได้เลย)
function _loadScript(url) {
  return new Promise(function(resolve, reject) {
    if (document.querySelector('script[src="' + url + '"]')) { resolve(); return; }
    var s = document.createElement('script'); s.src = url;
    s.onload = resolve; s.onerror = reject;
    document.head.appendChild(s);
  });
}

// 產生收據 PDF ใน browser โดยตรง (html2canvas + jsPDF) → ไม่ผ่าน Google Doc แล้ว
async function generateAndUploadReceipt(p, v) {
  // 2026-07-11 修 bug：以前這裡直接用 p.student_name（繳費記錄當初存的姓名快照），
  // 如果老師後來幫學生改名（改名同時會把 Drive 資料夾也改名，見 saveStudentEdit），
  // 這裡卻還在用舊名字去找/建資料夾 → gdGetStudentSubfolderId 找不到已改名的資料夾，
  // 於是又生出一個「舊名字」的新資料夾，收據就跟目前的學生資料夾（例如「ABG」）對不起來。
  // 一律優先用 studentsCache[token].name（目前最新的真實姓名），沒有 token 或查無資料才退回快照的 student_name。
  const curName = (p.token && typeof studentsCache !== 'undefined' && studentsCache[p.token]) ? studentsCache[p.token].name : null;
  const name = curName || p.student_name || p.token || '學生';
  // เลขที่ใบเสร็จ = วันที่รับเงิน + ลำดับของวันนั้น เช่น 2026-0630-01
  // 2026-07-10 修正：改用 teacherToday()（泰國時間）取代瀏覽器本地時區，避免午夜到早上 7 點這段
  // 收據日期算錯天，連帶編號序號跟著撞號/跳號。
  const _todayParts = teacherToday().split('-'); // [YYYY, MM, DD]
  const datePart = _todayParts[0] + '-' + _todayParts[1] + _todayParts[2];
  // 2026-07-15 修（🟡 項目7，Lin 要求順便修）：以前用「數今天已經有幾筆收據」算下一個序號，
  // 是 check-then-act——只有一位老師在用，機率很低，但兩筆繳費幾乎同時開收據理論上還是會撞號。
  // 改成呼叫資料庫端的 assign_receipt_no()：裡面用 pg_advisory_xact_lock 把「算序號」跟
  // 「把編號寫回這筆繳費記錄」鎖在同一個交易裡做完，兩筆同時呼叫也不會搶到一樣的編號。
  // （這裡直接把編號寫進資料庫，approveSlip/submitPayment 事後只需要再把 status 改成 done，
  // 不用再自己寫一次 receipt_no。）
  const assignRes = await sb.rpc('assign_receipt_no', { p_payment_id: p.id, p_date_part: datePart });
  if (assignRes.error || !assignRes.data) {
    throw new Error('收據編號寫入資料庫失敗：' + (assignRes.error ? assignRes.error.message : '找不到這筆繳費記錄（id=' + p.id + '）'));
  }
  const receiptNo = assignRes.data;
  const today = _todayParts.join('/');
  const total = v.ls * v.pp;

  // โหลด library (โหลดครั้งแรกเท่านั้น ~500KB รวม)
  await _loadScript('https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js');
  await _loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js');

  // สร้าง receipt HTML div ซ่อนไว้นอกจอ
  // ── ประกอบค่าจริงจากฟอร์ม ──
  var terms = (v.ls && v.ls % 10 === 0) ? (v.ls / 10) : 0;
  var lessonTxt = terms > 0 ? (terms + ' 期（' + v.ls + ' 堂）') : (v.ls + ' 堂');
  if (v.bn > 0) lessonTxt += '＋贈 ' + v.bn + ' 堂';
  var itemVal  = '<strong>' + (p.course_label || '泰語 1對1 課程') + '</strong>　' + lessonTxt;
  var startVal = v.start || '依行事曆繼續';
  var perVal   = v.pp + ' ' + v.cur;
  var totalVal = total.toLocaleString() + ' ' + v.cur;
  var noteVal  = v.note || '課程依既有時間表繼續上課，上滿 10 堂為一期。';
  var SERIF = '\'Noto Serif TC\',\'PingFang TC\',serif';
  var SANS  = '\'Noto Sans TC\',\'PingFang TC\',sans-serif';

  function fieldRow(label, value) {
    return '<tr>'
      + '<td style="width:37%;font-family:' + SANS + ';font-size:11px;letter-spacing:0.12em;color:#8B6310;padding:10px 0;vertical-align:top;">' + label + '</td>'
      + '<td style="font-size:16px;color:#1C1C1C;padding:10px 0;">' + value + '</td></tr>';
  }

  const wrap = document.createElement('div');
  wrap.style.cssText = 'position:fixed;left:-9999px;top:0;width:600px;padding:24px;background:#FBF5E7;box-sizing:border-box;font-family:' + SERIF + ';color:#1C1C1C;';
  wrap.innerHTML =
    '<div style="background:#fff;border:1px solid #C8973A;">'
    + '<table style="width:100%;background:#1C1C1C;border-bottom:3px solid #C8973A;border-collapse:collapse;"><tr>'
    +   '<td style="padding:26px 30px;vertical-align:top;">'
    +     '<div style="color:#fff;font-size:23px;font-weight:700;line-height:1.15;font-family:' + SERIF + ';">泰華眼裡的泰語教學</div>'
    +     '<div style="font-family:' + SANS + ';font-size:9px;letter-spacing:0.28em;color:#C8973A;font-weight:700;margin-top:6px;">THAI 1-ON-1 ONLINE　·　mrtaihualin.com</div>'
    +   '</td>'
    +   '<td style="padding:26px 30px;vertical-align:top;text-align:right;color:#C8973A;white-space:nowrap;">'
    +     '<div style="font-size:17px;font-weight:700;letter-spacing:0.15em;font-family:' + SERIF + ';">收　據</div>'
    +     '<div style="font-family:' + SANS + ';font-size:8px;letter-spacing:0.32em;margin-top:3px;">RECEIPT</div>'
    +   '</td>'
    + '</tr></table>'
    + '<div style="padding:26px 30px;">'
    +   '<table style="width:100%;font-family:' + SANS + ';font-size:11px;color:#8B6310;letter-spacing:0.04em;"><tr>'
    +     '<td style="text-align:left;">收據編號 No.　' + escHtml(receiptNo) + '</td>'
    +     '<td style="text-align:right;">開立日期　' + today + '</td>'
    +   '</tr></table>'
    +   '<hr style="border:none;border-top:1px solid rgba(139,99,16,0.28);margin:18px 0;">'
    +   '<table style="width:100%;border-collapse:collapse;">'
    +     fieldRow('學生姓名 STUDENT', escHtml(name))
    +     fieldRow('課程項目 ITEM', escHtml(itemVal))
    +     fieldRow('本輪起算 START', escHtml(startVal))
    +     fieldRow('單堂學費 PER LESSON', escHtml(perVal))
    +   '</table>'
    +   '<hr style="border:none;border-top:1px solid rgba(139,99,16,0.16);margin:18px 0 14px;">'
    +   '<table style="width:100%;"><tr>'
    +     '<td style="font-family:' + SANS + ';font-size:13px;letter-spacing:0.12em;color:#8B6310;">合計金額 TOTAL</td>'
    +     '<td style="text-align:right;font-size:26px;font-weight:700;color:#5a3e0a;font-family:' + SERIF + ';">' + escHtml(totalVal) + '</td>'
    +   '</tr></table>'
    +   '<table style="width:100%;margin-top:18px;"><tr>'
    +     '<td style="width:1%;white-space:nowrap;font-family:' + SANS + ';font-size:12px;letter-spacing:0.12em;color:#8B6310;padding-right:16px;">付款狀態</td>'
    +     '<td><span style="display:inline-block;background:#F3E4C2;border:1px solid #8B6310;color:#5a3e0a;font-family:' + SANS + ';font-size:12px;font-weight:700;letter-spacing:0.12em;padding:7px 24px;">已付款 PAID</span></td>'
    +   '</tr></table>'
    +   '<div style="margin-top:18px;padding-top:13px;border-top:1px solid rgba(139,99,16,0.16);font-size:11px;color:#666;line-height:1.75;font-family:' + SANS + ';">' + escHtml(noteVal) + '</div>'
    + '</div>'
    + '</div>'
    + '<div style="text-align:center;font-family:' + SANS + ';font-size:9.5px;letter-spacing:0.18em;color:#8B6310;padding:18px 30px 4px;">泰語 1對1 線上課程　·　1 期 = 10 堂　·　mrtaihualin.com　·　mr.taihualin@gmail.com</div>';
  document.body.appendChild(wrap);

  // รอ font โหลดเสร็จ แล้ว render เป็น canvas
  await document.fonts.ready;
  const canvas = await html2canvas(wrap, { scale: 2, useCORS: true, backgroundColor: '#ffffff', logging: false });
  document.body.removeChild(wrap);

  // แปลง canvas → PDF blob
  const { jsPDF } = window.jspdf;
  const imgW = canvas.width / 2;
  const imgH = canvas.height / 2;
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'px', format: [imgW, imgH] });
  pdf.addImage(canvas.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, imgW, imgH);
  const pdfBlob = pdf.output('blob');

  // อัปโหลด PDF ขึ้น Drive ตรงๆ (ไม่ผ่าน Google Doc แล้ว)
  const pdfName = name + '_收據_' + receiptNo + '.pdf';
  const folderId = await gdGetStudentSubfolderId(name, '課表 & 收據');
  const doc = await gdUploadSmall(pdfBlob, pdfName, 'application/pdf', folderId);
  const link = doc.webViewLink || ('https://drive.google.com/file/d/' + doc.id + '/view');
  try { await gdShareAnyone(doc.id); } catch (e) {}
  if (p.token) { try { await saveRecordingLink(p.token, pdfName, doc.id, link, '', null); } catch (e) {} }
  return { receiptNo: receiptNo, link: link };
}

// 學生付款前老師「入班連結」建立的學生 setup_status = 'pending'、meet 是空的，
// 完全沒有建立 Drive 資料夾／Google Meet／行事曆。這裡在老師第一次「確認收款」時才補做這一切
// （只做一次；已經 confirmed 過的學生不會重複建立），重用跟「新增學生」完全一樣的既有邏輯。
// 2026-07-08 重寫（RELIABILITY FIRST）：
// 「解鎖學生」= 寫一行資料庫（setup_status='confirmed'），這一步幾乎不可能失敗，且不依賴 Google。
// 「建立 Meet 連結」= 依賴 Google，可能失敗 → 但★絕不能因此讓已付款的學生卡在繳費頁。
// 所以：不論 Meet 成功與否，都一定把 setup_status 設成 confirmed；Meet 失敗只是 meet 先留空，
// 學生頁會顯示「課堂連結準備中」，老師再用「🔧 補課堂連結」一鍵補上即可。
// 2026-07-11 修 bug（Lin 回報：新增一個學生卻得到 2 個行事曆活動 + 2 份上課時刻表）：
// 原本只靠瀏覽器記憶體裡的 studentsCache 判斷「是否已經建立過」，如果 Lin 開兩個分頁、
// 或在同一分頁很快點兩次「確認收款」/「補課堂連結」，兩次呼叫都會讀到同一份「還沒 confirmed」的
// 舊快取，於是各自建立一次 Meet + 一份時刻表，最後寫回同一列資料庫 → 資料庫只有 1 個學生，
// 但 Google Calendar／Drive 卻多了一份孤兒資料。修法兩層：
// (1) _studentSetupLocks：同一個 token 正在跑的時候，第二個呼叫直接擋掉，不會重複建立
//     （擋得住同分頁快速點兩下，也擋得住同一支手機/電腦同分頁重疊呼叫）。
// (2) 動手建立 Meet 前，先重新向資料庫（不是快取）確認目前狀態，如果別的分頁已經先建好了，
//     這裡就直接沿用，不再建第二次（擋得住開兩個分頁各點一次的情況）。
// 回傳 { ok, meet, meetError, dbError, already }
var _studentSetupLocks = new Set();
async function runDeferredStudentSetup(token, name) {
  if (_studentSetupLocks.has(token)) return { ok: false, already: true, locked: true };
  _studentSetupLocks.add(token);
  try {
    // 先問資料庫最新狀態（不信任本地快取，快取可能是別的分頁還沒同步過的舊資料）
    var fresh = null;
    try {
      var freshRes = await sb.from('classroom_students').select('setup_status,meet').eq('token', token).single();
      if (!freshRes.error) fresh = freshRes.data;
    } catch (e) { /* 查詢失敗就退回用本地快取，不擋主流程 */ }
    var s = fresh || studentsCache[token] || {};
    if (s.setup_status === 'confirmed' && s.meet) {
      if (studentsCache[token]) { studentsCache[token].setup_status = 'confirmed'; studentsCache[token].meet = s.meet; }
      return { ok: true, already: true };
    }

    var meet = s.meet || null, meetError = null;
    if (!meet) {
      var p = studentsCache[token] || {};
      try {
        meet = await createMeetLinkForStudent(name, {
          startDate: p.pending_start_date, classTime: p.pending_class_time, recurring: !!p.pending_recurring
        });
      } catch (e) { meetError = e; }
    }

    // ★ 一定解鎖：不論 Meet 有沒有建成功，都把學生設為 confirmed（Meet 有就一起寫）
    var upd = { setup_status: 'confirmed' };
    if (meet) upd.meet = meet;
    // 🔴 2026-07-26 (RED 4)：เดิมเช็คแค่ error → ถ้า RLS แก้ได้ 0 แถว จะขึ้นว่า "ปลดล็อกแล้ว"
    // ทั้งที่ setup_status ในฐานข้อมูลยังเป็น pending อยู่ (นักเรียนยังเข้าห้องเรียนไม่ได้)
    var res = await sb.from('classroom_students').update(upd).eq('token', token).select();
    if (res.error) return { ok: false, dbError: res.error, meetError: meetError };
    if (!res.data || !res.data.length) return { ok: false, dbError: { message: '更新了 0 筆（資料庫沒有真的改到，可能是 RLS 權限或登入過期）' }, meetError: meetError };
    if (studentsCache[token]) { studentsCache[token].setup_status = 'confirmed'; if (meet) studentsCache[token].meet = meet; }

    // Drive 資料夾（best-effort，任何一步失敗都不影響「已解鎖」這個結果）
    try {
      await gdGetStudentSubfolderId(name, '學習內容');
      await gdGetStudentSubfolderId(name, '影片');
      var newStuReceiptFolder = await gdGetStudentSubfolderId(name, '課表 & 收據');
      try { await gdShareAnyone(newStuReceiptFolder); } catch (e) {}
      try { await createBlankTimetable(name, token, newStuReceiptFolder); } catch (e) { console.warn('建立空白課表失敗：', e); }
      try { await ensureStudentFolderShared(name, token); } catch (e) { console.warn('分享學生資料夾失敗（下次上傳檔案時會自動再補一次）：', e); }
    } catch (e) { console.warn('自動建立學生資料夾失敗（可日後上傳時自動補建）：', e); }

    return { ok: true, meet: meet, meetError: meetError };
  } finally {
    _studentSetupLocks.delete(token);
  }
}

async function approveSlip() {
  if (!pendingSlipId) return;
  var slipId = pendingSlipId;
  var slip   = (window._slipCache || {})[slipId] || {};
  var cur   = document.getElementById('approvalCurrency').value;
  var pp    = parseInt(document.getElementById('approvalPricePer').value);
  var ls    = parseInt(document.getElementById('approvalLessons').value);
  var bn    = parseInt(document.getElementById('approvalBonus').value)  || 0;
  var start = document.getElementById('approvalStart').value.trim();
  var note  = document.getElementById('approvalNote').value.trim();
  if (!pp || !ls) { alert('請填寫單價與堂數'); return; }
  var btn = document.getElementById('slipApproveBtn');
  btn.disabled = true; btn.textContent = '確認中…';
  var res = await sb.from('classroom_payments').update({
    status: 'pending', currency: cur, price_per: pp,
    lessons: ls, bonus_lessons: bn, total_amount: ls * pp,
    start_note: start || null, start_date: start || null, note: note || null
  }).eq('id', slipId).select();
  if (res.error || !res.data || !res.data.length) {
    btn.disabled = false; btn.textContent = '✅ 確認收款・開立收據';
    alert('儲存失敗：' + (res.error ? res.error.message : '資料庫沒有真的更新到（可能是 RLS 權限問題）'));
    return;
  }
  if (typeof gtag === 'function') gtag('event', 'payment_slip_approved', { category: 'course' });

  // 第一次確認收款 → 建立 Meet／Drive 並解鎖學生。
  // runDeferredStudentSetup 已保證「不論 Meet 成敗都會把學生設成 confirmed（解鎖）」，
  // 所以這裡不會再出現「開了收據卻卡在繳費頁」的情況。Meet 失敗只需之後一鍵補上。
  var setupResult = null;
  if (slip.token && slip.student_name) {
    btn.textContent = '建立課堂資源中…';
    try { await ensureGoogleReady(); } catch (e) { /* 授權沒完成也照樣往下：學生仍會被解鎖，只是 meet 先留空 */ }
    try {
      setupResult = await runDeferredStudentSetup(slip.token, slip.student_name);
    } catch (e) { console.warn('補建課堂資源失敗：', e); setupResult = { ok: false, meetError: e }; }
  }

  // 產生收據檔到學生「收據」資料夾
  var receipt = null;
  var receiptErrMsg = ''; // 2026-07-15 加：以前這裡失敗只 console.warn，老師只看到「請確認已用 Google 登入授權」
                           // 這種通用訊息，猜不到真正原因（Lin 回報）。改成把 e.message 存起來，直接顯示給老師看。
  btn.textContent = '產生收據中…';
  var receiptDbWarn = '';
  try {
    // 2026-07-15 修：收據編號現在由 generateAndUploadReceipt() 內部的 assign_receipt_no()
    // 原子寫入資料庫了，這裡不用也不該再寫一次 receipt_no，只需要把 status 改成 done。
    receipt = await generateAndUploadReceipt(slip, { cur: cur, pp: pp, ls: ls, bn: bn, start: start, note: note });
    if (receipt) {
      var rdRes = await sb.from('classroom_payments').update({ status: 'done' }).eq('id', slipId).select();
      if (rdRes.error || !rdRes.data || !rdRes.data.length) {
        receiptDbWarn = '\n\n⚠️ 收據已產生（編號 ' + receipt.receiptNo + '），但繳費狀態改成「已完成」失敗（' + (rdRes.error ? rdRes.error.message : 'RLS 權限問題') + '），這筆可能還停在「pending」，請檢查。';
      }
    }
  } catch (e) { console.warn('收據產生失敗：', e); receiptErrMsg = (e && e.message) ? e.message : String(e); }
  btn.disabled = false; btn.textContent = '✅ 確認收款・開立收據';
  document.getElementById('slipApprovalModal').classList.remove('open');
  pendingSlipId = null;
  var meetWarn = (setupResult && setupResult.meetError)
    ? '\n\n⚠️ 課堂 Meet 連結自動建立失敗，但學生已解鎖（連結先留空）。\n請在學生面板按「🔧 補課堂連結」補上（學生頁目前顯示「課堂連結準備中」）。'
    : '';
  // 2026-07-15 改：收據失敗時顯示真正的錯誤原因（不再是固定的通用訊息），方便抓根本原因。
  alert('✅ 已確認！' + (receipt
    ? '\n收據已存到學生「課表 & 收據」資料夾\n編號：' + receipt.receiptNo
    : '\n⚠️ 收據檔產生失敗：' + (receiptErrMsg || '未知錯誤') + '\n（付款已確認生效，學生已解鎖，不受影響）') + meetWarn + receiptDbWarn);
  await loadPendingSlips();
  loadLowQuotaBanner();
  await refreshStudentList();
  if (slip.token) loadTeacherStudentInfo(slip.token);
}

// ลบรายการชำระเงิน
async function deletePayment(paymentId, token) {
  if (!confirm('確定刪除此筆繳費記錄？（無法復原）')) return;
  if (!(await ensureTeacherSession('刪除繳費記錄'))) return;
  // 🔴 2026-07-26 (RED 4)：เดิมเช็คแค่ error → RLS ที่ลบได้ 0 แถวจะขึ้นว่าสำเร็จ ทั้งที่ยอดเงิน/คาบยังอยู่
  var res = await sb.from('classroom_payments').delete().eq('id', paymentId).select();
  if (res.error) { alert(await writeErrorMessage(res.error.message, '刪除繳費記錄') + '\n（這筆記錄還在）'); return; }
  if (!res.data || !res.data.length) { alert(await writeErrorMessage('刪除了 0 筆', '刪除繳費記錄') + '\n\n⚠️ 這筆繳費記錄「還在」，堂數也沒有跟著變。'); return; }
  loadTeacherStudentInfo(token);
  loadLowQuotaBanner();
}

// 重新開立收據（用於補開或替換格式不對的舊收據）
async function regenReceipt(paymentId) {
  if (!confirm('重新開立收據？（舊收據不會自動刪除，會新增一份到 Drive）')) return;
  try {
    var res = await sb.from('classroom_payments').select('*').eq('id', paymentId).single();
    var p = res.data;
    if (!p) { alert('找不到繳費記錄'); return; }
    var v = {
      cur: p.currency || 'THB',
      pp:  p.price_per || Math.round((p.total_amount || 0) / (p.lessons || 1)),
      ls:  p.lessons || 0,
      bn:  p.bonus_lessons || 0,
      start: p.start_note || p.start_date || ''
    };
    alert('開始產生 PDF 收據，請稍候…');
    // 2026-07-15 修：收據編號現在由 generateAndUploadReceipt() 內部的 assign_receipt_no()
    // 原子寫入資料庫了（失敗會直接丟例外，被下面的 catch 擋到），這裡不用再自己寫一次。
    var receipt = await generateAndUploadReceipt(p, v);
    var doneWarn = '';
    // 2026-07-16 加：以前這裡只補收據檔，不會把卡在 pending（收據曾經開立失敗）的記錄
    // 補改成 done，狀態欄一直停在「✅ 已確認」跟「已經有收據了」對不起來，容易讓老師誤會還沒開。
    if (p.status !== 'done') {
      var mdRes = await sb.from('classroom_payments').update({ status: 'done' }).eq('id', paymentId).select();
      if (mdRes.error || !mdRes.data || !mdRes.data.length) {
        doneWarn = '\n\n⚠️ 收據已產生，但狀態改成「已完成」失敗（' + (mdRes.error ? mdRes.error.message : 'RLS 權限問題') + '），畫面可能還顯示待開立，請重新整理確認。';
      }
    }
    alert('✅ 收據已開立！\n編號：' + receipt.receiptNo + '\n已存到學生「課表 & 收據」資料夾' + doneWarn);
    if (p.token) loadTeacherStudentInfo(p.token);
  } catch (e) {
    alert('失敗：' + (e.message || e) + '\n請確認已連接 Google Drive 授權');
  }
}

async function rejectSlip(id) {
  var rid = id || pendingSlipId;
  if (!rid) return;
  var p = (window._slipCache || {})[rid] || {};
  if (!confirm('確定拒絕 ' + (p.student_name || rid) + ' 的繳費通知？')) return;
  var rejRes = await sb.from('classroom_payments').update({ status: 'rejected' }).eq('id', rid).select();
  if (rejRes.error || !rejRes.data || !rejRes.data.length) {
    alert('拒絕失敗：' + (rejRes.error ? rejRes.error.message : '資料庫沒有真的更新到（可能是 RLS 權限問題）'));
    return;
  }
  if (typeof gtag === 'function') gtag('event', 'payment_slip_rejected', { category: 'course' });
  document.getElementById('slipApprovalModal').classList.remove('open');
  await loadPendingSlips();
}
