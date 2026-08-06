// FILE MAP: next-class/lesson picker → reschedule/cancel → requests/series changes → slips/receipts/setup
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
      _teacherNextClassCtx[token] = null;
      return;
    }
    _teacherNextClassCtx[token] = { isoDate: lessonDate, timeStr: startTimeStr };
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
        '<button class="btn-sm" style="' + TEACHER_NEXTCLASS_BTN_STYLE + '" onclick="initiateTeacherReschedule(\'' + t + '\')">🔄 改期</button>' +
        '<button class="btn-sm" style="' + TEACHER_NEXTCLASS_BTN_STYLE + '" onclick="teacherCancelClassNow(\'' + t + '\')">❌ 取消</button>' +
        '<button class="btn-sm" style="' + TEACHER_NEXTCLASS_BTN_STYLE + '" onclick="openPermanentChangeModal(\'' + t + '\')">📌 固定</button>' +
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
async function listRemainingLessonsForStudent(token) {
  var s = studentsCache[token];
  var studentName = (s ? s.name : token) || '';
  // 🔴 2026-07-26：อ่านโควตาพัง → เดิมเงียบแล้วถอยไปโชว์ 12 คาบ ทำให้ครูอาจเลือกคาบที่ไม่มีสิทธิ์
  // ตอนนี้ยังถอยไป 12 คาบเหมือนเดิม (ไม่บล็อกครู) แต่ "บอกให้รู้" ว่าเลขโควตาเชื่อไม่ได้รอบนี้
  var payRes0 = await sb.rpc('get_student_payments', { p_token: token });
  var attRes0 = await sb.rpc('get_student_attendance', { p_token: token });
  if (payRes0.error || attRes0.error) {
    alert('⚠️ 讀不到這位學生的堂數資料（' + ((payRes0.error && payRes0.error.message) || (attRes0.error && attRes0.error.message)) + '）。\n'
      + '下面的清單會先列出未來 12 堂讓你自己挑，「不代表」他本輪真的剩這麼多堂——請自己確認過再操作。');
  }
  var pays = payRes0.data || [];
  var atts = attRes0.data || [];
  var q = computeCurrentCourse(pays, atts);
  var limit = ((!payRes0.error && !attRes0.error) && q.hasCourse && q.remain > 0) ? q.remain : 12;

  var calToken = await gdGetToken();
  if (gdTokenScopes && gdTokenScopes.indexOf('calendar') === -1) calToken = await gdGetToken(true);
  var timeMin = new Date().toISOString();
  var timeMax = new Date(Date.now() + (limit + 6) * 7 * 24 * 3600 * 1000).toISOString();
  var url = 'https://www.googleapis.com/calendar/v3/calendars/primary/events'
    + '?timeMin=' + encodeURIComponent(timeMin)
    + '&timeMax=' + encodeURIComponent(timeMax)
    + '&singleEvents=true&orderBy=startTime&maxResults=250'
    + '&q=' + encodeURIComponent(studentName);
  var r = await fetch(url, { headers: { Authorization: 'Bearer ' + calToken } });
  if (r.status === 403) {
    var body = await r.text();
    if (/insufficient|scope|PERMISSION_DENIED/i.test(body)) {
      calToken = await gdGetToken(true);
      r = await fetch(url, { headers: { Authorization: 'Bearer ' + calToken } });
    }
  }
  if (!r.ok) throw new Error('Calendar API ' + r.status + '：' + (await r.text()).slice(0, 200));
  var data = await r.json();
  var name = studentName.trim();
  var items = (data.items || []).filter(function(ev) { return (ev.summary || '').trim() === name; });
  return items.slice(0, limit).map(function(ev) {
    var startIso = ev.start && (ev.start.dateTime || ev.start.date);
    return { ev: ev, iso: startIso, label: formatThaiDateTimeLabel(startIso) };
  });
}

var _pickLessonToken = null;
var _pickLessonPurpose = null; // 'reschedule' | 'cancel' | 'edit_teacher_cancel'
var _pickLessonOptions = [];
var _pickLessonEditRequestId = null; // 2026-07-16 加：purpose='edit_teacher_cancel' 時，記著在改哪一筆申請

async function openPickLessonModal(token, purpose) {
  _pickLessonToken = token;
  _pickLessonPurpose = purpose;
  _pickLessonOptions = [];
  document.getElementById('pickLessonTitle').textContent = purpose === 'cancel' ? '❌ 選擇要取消的課堂'
    : purpose === 'edit_teacher_cancel' ? '✏️ 改選要取消的課堂'
    : '🔄 選擇要改期的課堂';
  document.getElementById('pickLessonHint').textContent = purpose === 'cancel'
    ? '從本輪剩餘課堂中，選出要直接取消的那一堂。'
    : purpose === 'edit_teacher_cancel'
    ? '改選這次真正要取消的課堂（原本那筆通知會更新成新的時間，重新請學生確認一次）。'
    : '從本輪剩餘課堂中，選出要改期的那一堂，下一步再選新時間。';
  var sel = document.getElementById('pickLessonSelect');
  sel.innerHTML = '<option value="">讀取中…</option>';
  document.getElementById('pickLessonModal').classList.add('open');
  try {
    _pickLessonOptions = await listRemainingLessonsForStudent(token);
  } catch (e) {
    sel.innerHTML = '<option value="">讀取失敗</option>';
    alert('⚠️ 讀取課表失敗：' + (e.message || e));
    return;
  }
  if (!_pickLessonOptions.length) {
    sel.innerHTML = '<option value="">找不到排定的課堂</option>';
    return;
  }
  sel.innerHTML = _pickLessonOptions.map(function(o, i) {
    return '<option value="' + i + '">' + o.label + '</option>';
  }).join('');
}
function closePickLessonModal() { document.getElementById('pickLessonModal').classList.remove('open'); }

function confirmPickLesson() {
  var sel = document.getElementById('pickLessonSelect');
  var idx = sel.value;
  if (idx === '' || !_pickLessonOptions[idx]) { alert('請選擇一堂課'); return; }
  var chosen = _pickLessonOptions[idx];
  var token = _pickLessonToken, purpose = _pickLessonPurpose;
  closePickLessonModal();
  if (purpose === 'cancel') teacherCancelClassNow_chosen(token, chosen);
  else if (purpose === 'edit_teacher_cancel') teacherEditOwnCancelRequest_chosen(_pickLessonEditRequestId, token, chosen);
  else initiateTeacherReschedule_chosen(token, chosen);
}

// 🔄 老師幫忙改期（只改這一次）：建一筆申請紀錄 + 直接開「提議新時間」視窗，流程跟「其他 → 提議新時間」完全共用
// 2026-07-13 改（Lin 要求）：原本時間改成老師自己從「本輪剩餘課堂」下拉選單挑，不是系統自動猜下一堂
async function initiateTeacherReschedule(token) {
  openPickLessonModal(token, 'reschedule');
}

// 2026-07-16 加（稽核發現，YELLOW#9）：跟 teacherCancelClassNow_chosen 一樣補上防重複點擊鎖——
// 以前這裡按快一點可能連續建立兩筆一樣的改期申請（沒有動 Calendar，不危險，但會讓老師端多出重複的卡片）。
async function initiateTeacherReschedule_chosen(token, chosen) {
  var lockKey = 'reschedule-init:' + token;
  if (_inFlightRequestIds[lockKey]) return;
  _inFlightRequestIds[lockKey] = true;
  try {
    return await initiateTeacherReschedule_chosenInner(token, chosen);
  } finally {
    delete _inFlightRequestIds[lockKey];
  }
}

async function initiateTeacherReschedule_chosenInner(token, chosen) {
  // 🔒 2026-07-26：ฐานข้อมูลบังคับแล้วว่า "คำขอที่ติดป้ายว่าครูเป็นคนขอ" ต้องมาจากครูจริงเท่านั้น
  // → เช็ค session ก่อนตรงนี้ ครูจะได้เห็นข้อความ "ล็อกอินหมดอายุ" แทน error ดิบของฐานข้อมูล
  if (!(await ensureTeacherSession('老師發起改期'))) return;
  var s = studentsCache[token];
  if (!confirm('確定要幫這堂課改期嗎？\n\n學生：' + (s ? s.name : token) + '\n原本時間：' + chosen.label + '（泰國時間）\n\n下一步選新時間，送出後會傳 LINE 通知學生。')) return;
  var p = formatInTz(new Date(chosen.iso), TEACHER_TZ);
  var res = await sb.rpc('submit_class_request', {
    p_token: token, p_student_name: s ? s.name : token, p_request_type: 'reschedule',
    p_original_date: p.dateStr, p_requested_date: null, p_requested_time: null, p_note: null,
    p_initiated_by: 'teacher',
  });
  // 2026-07-16 改（稽核發現，YELLOW#13）：統一跟 teacherCancelClassNowInner 用一樣的錯誤文字，
  // 以前這裡寫「建立申請失敗」、取消那邊寫「建立紀錄失敗」，同一種失敗卻用詞不一致。
  if (res.error) { alert('建立紀錄失敗：' + res.error.message); return; }
  var newId = res.data;
  // 2026-07-17 加（Lin 要求）：把原本課堂的時間也存進去，不要只有日期。
  // 2026-07-22 加（Lin 回報：LINE 按「確認並搬 Calendar」跳「這筆沒有記錄 Calendar 事件 ID」）：
  // 這裡以前漏存 calendar_event_id——跟 teacherCancelClassNowInner 同一個 chosen（都來自
  // listRemainingLessonsForStudent，一定有 chosen.ev 這個真正的 Calendar 事件），但那邊有存
  // calendar_event_id，這裡沒有，導致老師自己發起的改期提議永遠沒有 ID，只能退回姓名+日期
  // 搜尋（網站版還有這條備援，但 LINE 一鍵按鈕 confirm_reschedule_move 沒有備援，直接失敗）。
  // 2026-07-20 加：補上 .select() + 檢查筆數（照 ทำต่อในอนาคต.md 補齊「ฝั่งครู UPDATE ไม่เช็กแถว」清單）——
  // 以前只看 error，RLS 靜靜擋掉更新 0 筆不會回 error，這些欄位可能沒真的存進去卻不會有任何警告。
  var timeRes1 = await sb.from('classroom_requests').update({ original_time: p.timeStr, calendar_event_id: chosen.ev ? chosen.ev.id : null }).eq('id', newId).select();
  if (timeRes1.error || !timeRes1.data || !timeRes1.data.length) console.warn('⚠️ 補存 original_time/calendar_event_id 失敗（不影響這次通知本身，可能是 RLS 靜靜擋掉更新 0 筆）：', timeRes1.error ? timeRes1.error.message : '更新 0 筆');
  window._classRequestCache = window._classRequestCache || {};
  window._classRequestCache[newId] = { id: newId, token: token, student_name: s ? s.name : token, original_date: p.dateStr, original_time: p.timeStr, request_type: 'reschedule' };
  _otherOptionsRequestId = newId;
  openProposeTimeModal();
  loadPendingClassRequests();
}

// ❌ 老師直接取消這一次課（自己決定，不用等學生同意，但一樣會備份+通知）
// 2026-07-13 改（Lin 要求）：要取消的那一堂改成老師自己從下拉選單挑，不是系統自動猜下一堂
// 同一組防重複點擊鎖（跟處理/確認同意共用 _inFlightRequestIds，用 'cancel:'+token 當 key 避免撞名）
async function teacherCancelClassNow(token) {
  openPickLessonModal(token, 'cancel');
}

async function teacherCancelClassNow_chosen(token, chosen) {
  var lockKey = 'cancel:' + token;
  if (_inFlightRequestIds[lockKey]) return;
  _inFlightRequestIds[lockKey] = true;
  try {
    return await teacherCancelClassNowInner(token, chosen);
  } finally {
    delete _inFlightRequestIds[lockKey];
  }
}

// 2026-07-16 改（Lin 要求）：以前這裡是「老師一按就馬上刪 Calendar」，現在改成「先請學生確認，
// 學生按了『我知道了』（LINE 或網站都可以）之後，老師要自己回來按一次『確認刪除』才會真的刪」——
// 避免學生完全不知情、課堂就悄悄從 Calendar 消失。超過 48 小時學生沒確認，系統會自動提醒老師
// 直接去聯絡學生（見 request-sla-cron 的新分支）。真正的刪除邏輯還是共用 processClassRequestInner
// （跟學生申請取消、老師按「✅ 處理」同一套），這裡只負責「建立紀錄 + 通知學生來確認」。
async function teacherCancelClassNowInner(token, chosen) {
  // 🔒 2026-07-26：ฐานข้อมูลบังคับแล้วว่า "คำขอที่ติดป้ายว่าครูเป็นคนขอ" ต้องมาจากครูจริงเท่านั้น
  // → เช็ค session ก่อนตรงนี้ ครูจะได้เห็นข้อความ "ล็อกอินหมดอายุ" แทน error ดิบของฐานข้อมูล
  if (!(await ensureTeacherSession('老師取消課堂'))) return;
  var s = studentsCache[token];
  var studentName = s ? s.name : token;
  var ev = chosen.ev;
  var oldStartIso = chosen.iso;
  if (!confirm('確定要取消這堂課嗎？\n\n學生：' + studentName + '\n時間：' + formatThaiDateTimeLabel(oldStartIso) + '（泰國時間）\n\n送出後不會馬上刪 Calendar——會先請學生按「我知道了」確認收到，等學生確認後，你要回來這裡按一次「確認刪除」才會真的刪除。確定要送出這個取消通知嗎？')) return;

  var p = formatInTz(new Date(oldStartIso), TEACHER_TZ);
  var res = await sb.rpc('submit_class_request', {
    p_token: token, p_student_name: studentName, p_request_type: 'cancel',
    p_original_date: p.dateStr, p_requested_date: null, p_requested_time: null, p_note: null,
    p_initiated_by: 'teacher',
  });
  if (res.error) { alert('建立紀錄失敗：' + res.error.message); return; }
  var newId = res.data;

  // 2026-07-16 加：跟學生申請取消同一套做法——現在就把真正的 Calendar 事件 ID 存起來，
  // 之後「確認刪除」才不用再猜，直接用 ID 拿（這裡還沒刪 Calendar，只是先記錄起來）。
  // 2026-07-17 加（Lin 要求）：順便存原本課堂的時間，不要只有日期。
  // 2026-07-20 加：補上 .select() + 檢查筆數——這裡跟學生端當初那個真的發生過的 bug（calendar_event_id
  // 被 RLS 靜靜擋掉、更新 0 筆卻不回 error）是同一個寫法、同一個風險，只是老師端因為是本人登入
  // 目前都會過 RLS，還沒真的出過事，補起來才不會等哪天 RLS/登入方式變了又無聲無息壞掉。
  var idRes = await sb.from('classroom_requests').update({ calendar_event_id: ev.id, original_time: p.timeStr }).eq('id', newId).select();
  if (idRes.error || !idRes.data || !idRes.data.length) console.warn('⚠️ 補存 calendar_event_id/original_time 失敗（不影響通知本身，但之後「確認刪除 Calendar」可能找不到事件 ID、要退回用姓名+日期猜，可能是 RLS 靜靜擋掉更新 0 筆）：', idRes.error ? idRes.error.message : '更新 0 筆');

  var notifySent = false, notifyError = null;
  if (s && s.line_user_id) {
    try {
      // 傳給學生看的時間 → 換算成學生自己的時區，不要直接丟泰國時間給學生
      const cancelTimeLabel = studentFacingTimeLabel(new Date(oldStartIso), s.pending_student_tz);
      // 2026-07-16 改：現在要請學生「確認」，所以要有一顆真的能按的按鈕（postback），
      // 交給 line-webhook 處理 action=ack_teacher_cancel（見該檔案）。
      const notifyRes = await fetch(LINE_NOTIFY_ENDPOINT, {
        method: 'POST',
        // 2026-07-19 แก้（SECURITY FIRST）：notify-line สาขา to:{studentToken} ตอนนี้บังคับต้องมี session จริงของครู
        headers: { 'Content-Type': 'application/json', 'apikey': window.SUPABASE_CONFIG.anonKey, 'Authorization': 'Bearer ' + (await teacherAuthHeader()) },
        body: JSON.stringify({
          to: { studentToken: token },
          message: '老師想取消 ' + cancelTimeLabel + ' 這堂課，請按一下確認收到',
          flex: {
            title: '❌ 老師想取消這堂課',
            bodyText: '時間：' + cancelTimeLabel + '\n\n請按下方按鈕確認收到',
            // 2026-07-20 加（Lin 要求）：跟加課通知一樣加「聯繫老師」，點了直接開 LINE 跟老師的對話。
            buttons: [
              { label: '我知道了', postbackData: 'action=ack_teacher_cancel&request=' + encodeURIComponent(newId) },
              { label: '聯繫老師', uri: LINE_OA_URL },
            ],
          },
        }),
      });
      notifySent = notifyRes.ok;
      if (!notifyRes.ok) notifyError = await lineNotifyErrorText(notifyRes);
    } catch (e) { notifyError = e.message || String(e); }
  }

  var resultMsg = '✅ 已送出取消通知，等學生按「我知道了」（LINE 或網站都可以）之後，記得回來這裡按「確認刪除」才會真的刪 Calendar';
  if (!s || !s.line_user_id) resultMsg += '\n⚠️ 學生還沒連結 LINE，收不到 LINE 通知——學生開網站還是會看到確認按鈕，建議自己也提醒學生上網站看一下';
  else if (!notifySent) resultMsg += '\n⚠️ 但 LINE 通知失敗（' + notifyError + '），學生開網站還是看得到，也可以自己再說一聲';
  alert(resultMsg);
  loadTeacherNextClassBox(token);
  loadPendingClassRequests();
}

// 2026-07-16 加（Lin 要求）：老師自己發起的「取消這堂課」通知，在學生按確認之前，
// 老師也可以反悔收回（跟學生能收回自己送出的取消申請同一個邏輯，角色對調，只是 Calendar
// 本來就還沒被動過，收回不用管 Calendar）。用 .is('teacher_cancel_ack_at', null) 當保險閘：
// 如果學生剛好在這一刻按了確認，這裡就會抓不到（count=0），要老實跟老師講已經來不及收回。
async function teacherWithdrawOwnCancelRequest(id) {
  if (!confirm('確定要收回這個取消通知嗎？（等於不取消了，這堂課維持原本安排，Google Calendar 完全沒被動過）')) return;
  if (_inFlightRequestIds[id]) return; // 2026-07-16 加（稽核發現，GREEN）：補防重複點擊鎖
  _inFlightRequestIds[id] = true;
  try {
    var res = await sb.from('classroom_requests').update({ status: 'acknowledged' })
      .eq('id', id).eq('status', 'pending').is('teacher_cancel_ack_at', null).select();
    if (res.error) { alert('⚠️ 收回失敗：' + res.error.message); return; }
    if (!res.data || !res.data.length) {
      alert('ℹ️ 收回失敗——學生可能剛好已經按了確認，這種情況要用「確認刪除」把 Calendar 也刪掉，或自己聯絡學生說明。');
      await loadPendingClassRequests();
      return;
    }
    alert('✅ 已收回，這堂課不會被取消，Calendar 沒有被動過');
    await loadPendingClassRequests();
  } finally {
    delete _inFlightRequestIds[id];
  }
}

// 🗑️ 2026-07-31 (รอบ 4) ลบทิ้ง — teacherWithdrawOwnAddRequest / confirmTeacherAddClass
//    ทั้งคู่เป็นของระบบเก่า "ครูเสนอเวลาเพิ่มคาบ → รอนักเรียนกด 我知道了 → ครูค่อยกดลงปฏิทิน"
//    Lin สั่งเลิกใช้ 2026-07-30 · เก็บไว้เฉพาะเพื่อจัดการคำขอเก่าที่ค้างในฐานข้อมูล
//    ✅ 2026-07-31 Lin รันเช็คแล้วคิวว่างจริง (ได้ 0) → ไม่มีแถวเก่าให้จัดการอีกแล้ว ลบได้
//    ที่เดียวที่เรียก 2 ตัวนี้คือบล็อกปุ่มในคิวครู ซึ่งถูกลบพร้อมกันในรอบนี้ (ค้นคำว่า isAdd ในไฟล์นี้)
//    🚫 ห้ามเอากลับมา — ดูหัวข้อ 📅 ระบบเพิ่มคาบเรียน ใน CLAUDE.md

// 2026-07-16 加：老師想改成取消「另一堂」而不是原本選的那堂——更新同一筆申請的日期/Calendar
// 事件 ID，不用整個作廢重新來一次。因為時間變了，等於是新的通知，所以重設 teacher_cancel_ack_at，
// 重新發一次 LINE/網站確認請學生重新按一次「我知道了」。只允許學生還沒確認前改（同withdraw的閘）。
async function teacherEditOwnCancelRequest(id) {
  var r = (window._classRequestCache || {})[id];
  if (!r) { alert('資料不見了，重新整理頁面再試'); return; }
  _pickLessonEditRequestId = id;
  await openPickLessonModal(r.token, 'edit_teacher_cancel');
}

async function teacherEditOwnCancelRequest_chosen(id, token, chosen) {
  if (!id) return;
  var s = studentsCache[token];
  var studentName = s ? s.name : token;
  var ev = chosen.ev;
  var oldStartIso = chosen.iso;
  if (!confirm('確定要改成取消這一堂嗎？\n\n學生：' + studentName + '\n時間：' + formatThaiDateTimeLabel(oldStartIso) + '（泰國時間）\n\n會重新請學生確認一次。確定嗎？')) return;

  var p = formatInTz(new Date(oldStartIso), TEACHER_TZ);
  var res = await sb.from('classroom_requests').update({
    original_date: p.dateStr, original_time: p.timeStr, calendar_event_id: ev.id, teacher_cancel_ack_at: null,
  }).eq('id', id).eq('status', 'pending').is('teacher_cancel_ack_at', null).select();
  if (res.error) { alert('⚠️ 更新失敗：' + res.error.message); return; }
  if (!res.data || !res.data.length) { alert('ℹ️ 更新失敗，這筆申請可能已經不是「等學生確認」狀態了，重新整理頁面看看。'); await loadPendingClassRequests(); return; }

  var notifySent = false, notifyError = null;
  if (s && s.line_user_id) {
    try {
      const cancelTimeLabel = studentFacingTimeLabel(new Date(oldStartIso), s.pending_student_tz);
      const notifyRes = await fetch(LINE_NOTIFY_ENDPOINT, {
        method: 'POST',
        // 2026-07-19 แก้（SECURITY FIRST）：notify-line สาขา to:{studentToken} ตอนนี้บังคับต้องมี session จริงของครู
        headers: { 'Content-Type': 'application/json', 'apikey': window.SUPABASE_CONFIG.anonKey, 'Authorization': 'Bearer ' + (await teacherAuthHeader()) },
        body: JSON.stringify({
          to: { studentToken: token },
          message: '老師想取消的課堂時間改了：' + cancelTimeLabel + '，請重新按一下確認收到',
          flex: {
            title: '❌ 老師想取消這堂課（時間更新了）',
            bodyText: '時間：' + cancelTimeLabel + '\n\n請按下方按鈕確認收到',
            // 2026-07-20 加：跟原本第一次發送的取消通知一致，也加「聯繫老師」按鈕。
            buttons: [
              { label: '我知道了', postbackData: 'action=ack_teacher_cancel&request=' + encodeURIComponent(id) },
              { label: '聯繫老師', uri: LINE_OA_URL },
            ],
          },
        }),
      });
      notifySent = notifyRes.ok;
      if (!notifyRes.ok) notifyError = await lineNotifyErrorText(notifyRes);
    } catch (e) { notifyError = e.message || String(e); }
  }
  var msg = '✅ 已更新，重新請學生確認';
  if (!s || !s.line_user_id) msg += '\n⚠️ 學生還沒連結 LINE，收不到 LINE 通知，學生開網站還是看得到';
  else if (!notifySent) msg += '\n⚠️ 但 LINE 通知失敗（' + notifyError + '）';
  alert(msg);
  loadPendingClassRequests();
}

// 2026-07-16 加：通用的「查看申請詳情」——老師/學生共用同一個函式，傳整筆申請物件進來就好，
// 不用另外查資料庫（反正資料早就已經在畫面上，不用多打一次 API）。
function viewRequestDetail(r) {
  if (!r) { alert('資料不見了，重新整理頁面再試'); return; }
  var lines = [
    '學生：' + (r.student_name || '-'),
    '類型：' + (r.request_type === 'cancel' ? '取消' : r.request_type === 'add_class' ? '加課' : '改期') + (r.initiated_by === 'teacher' ? '（老師發起）' : ''),
    '課堂日期：' + (r.original_date || '-') + (r.original_time ? ' ' + r.original_time : ''),
  ];
  // 2026-07-16 加：改期最多有 3 個候選時間（proposed_options），全部列出來，
  // 沒有的話就退回顯示單一 requested_date（舊資料/加課申請的情況）。
  if (Array.isArray(r.proposed_options) && r.proposed_options.length) {
    r.proposed_options.forEach(function (opt, i) {
      lines.push('選項' + (i + 1) + '：' + (opt.date || '-') + (opt.time ? ' ' + opt.time : '') + '（泰國時間）');
    });
  } else if (r.requested_date) {
    lines.push('想改到：' + r.requested_date + (r.requested_time ? ' ' + r.requested_time : ''));
  }
  if (r.note) lines.push('備註：' + r.note);
  lines.push('送出時間：' + (r.created_at ? new Date(r.created_at).toLocaleString('zh-TW', { dateStyle: 'medium', timeStyle: 'short' }) : '-'));
  alert('📋 申請詳情\n\n' + lines.join('\n'));
}

// 📌 永久變更：關閉舊的每週固定課、從新日期開始開一組新的每週固定課（技術上叫「this and following」，
// Google Calendar API 沒有直接支援，用「舊系列加 UNTIL 結束、另開新系列」達成同樣效果）
// 🟠 2026-07-26 เพิ่ม：ตอน "永久變更" เดิมชุดคาบใหม่ถูกสร้างด้วย ['RRULE:FREQ=WEEKLY'] ล้วนๆ
// → เงื่อนไข "จบเมื่อไหร่" ของคอร์สเดิม (UNTIL = จบวันไหน / COUNT = ทั้งหมดกี่ครั้ง / INTERVAL = ทุกกี่สัปดาห์)
//   หายหมด คอร์สที่มีวันจบชัดเจนกลายเป็น "เรียนไปเรื่อยๆ ไม่มีวันจบ" ในปฏิทิน
// ตัวนี้ยกเงื่อนไขเดิมมาต่อให้ชุดใหม่:
//   · UNTIL  → ยกมาตรงๆ (วันจบคอร์สยังเป็นวันเดิม)
//   · COUNT  → หักจำนวนครั้งที่ "ผ่านไปแล้ว" ในชุดเก่าออกก่อน แล้วค่อยยกส่วนที่เหลือมา
//              (ยกมาทั้งก้อนไม่ได้ ไม่งั้นคอร์สจะยาวขึ้นเป็น 2 เท่า)
//   · INTERVAL → ยกมาตรงๆ (เรียนสัปดาห์เว้นสัปดาห์ ฯลฯ)
//   · BYDAY  → ตัดทิ้งโดยตั้งใจ เพราะมันชี้วันในสัปดาห์แบบเดิม ซึ่งกำลังจะเปลี่ยน
//              (ไม่ใส่ Google จะใช้วันของ event เริ่มต้นให้เอง = วันใหม่ที่ถูกต้อง)
// คืน { ok:true, recurrence:[...] } หรือ { ok:false, reason:'ข้อความบอกครู' }
// ok:false = ห้ามทำต่อเด็ดขาด ต้องหยุดก่อนแตะ Calendar (ไม่ใช่เตือนแล้วทำต่อ)
function buildNewSeriesRecurrence(oldRecurrenceArr, oldStartIso, cutMs, newStartMs) {
  var oldRule = (oldRecurrenceArr || []).find(function (r) { return r.indexOf('RRULE') === 0; });
  if (!oldRule) return { ok: true, recurrence: ['RRULE:FREQ=WEEKLY'] };
  var map = {};
  oldRule.replace(/^RRULE:/, '').split(';').forEach(function (p) {
    var i = p.indexOf('=');
    if (i > 0) map[p.slice(0, i).toUpperCase()] = p.slice(i + 1);
  });
  // 🛑 การคำนวณข้างล่างนี้ยึด "ทุก 7 วัน" เป็นฐาน ถ้าชุดเดิมไม่ใช่รายสัปดาห์ (รายวัน/รายเดือน)
  // ตัวเลขจะผิดแบบเงียบๆ (เคยลองแล้ว: FREQ=DAILY;COUNT=20 ได้ COUNT=18 ทั้งที่ควรเป็น 6 = คอร์สยาวขึ้น 3 เท่า)
  // ระบบเราสร้าง event เป็น FREQ=WEEKLY เสมอ เคสนี้เกิดได้เฉพาะซีรีส์ที่ Lin สร้างเองใน Google Calendar
  if ((map.FREQ || 'WEEKLY').toUpperCase() !== 'WEEKLY') {
    return { ok: false, reason: '這個課表系列不是「每週」重複（' + (map.FREQ || '?') + '），\n'
      + '系統沒辦法自動算出新課表還剩幾堂（算錯會直接影響堂數）。\n'
      + '請自己到 Google Calendar 手動調整這個系列。' };
  }
  var interval = parseInt(map.INTERVAL, 10);
  var daysPerCycle = map.BYDAY ? map.BYDAY.split(',').filter(Boolean).length : 1;
  // 🛑 คอร์สเดิมเรียนสัปดาห์ละหลายวัน (BYDAY=TU,TH) — คำนวณ "เหลือกี่ครั้ง" ให้ถูกไม่ได้
  // ถ้าเดาแล้วผิด คอร์สจะยาว/สั้นกว่าที่จ่ายเงินมา → หยุด ให้ครูจัดเองใน Calendar
  if (daysPerCycle > 1) {
    return { ok: false, reason: '這位學生的固定課表是「一週上好幾天」（' + map.BYDAY + '），\n'
      + '系統沒辦法自動算出新課表還剩幾堂（算錯會讓課變多或變少，直接影響堂數）。\n'
      + '請自己到 Google Calendar 手動調整這個系列。' };
  }
  var parts = ['FREQ=WEEKLY'];
  if (interval > 1) parts.push('INTERVAL=' + interval);
  if (map.UNTIL) {
    // 🛑 คอร์สเดิมมีวันจบอยู่แล้ว ถ้าวันเริ่มใหม่เลยวันจบไปแล้ว ชุดใหม่จะ "ไม่มีคาบเลยสักคาบ"
    // (Google รับสร้างได้แต่ว่างเปล่า) — แล้วโค้ดจะไปตัดชุดเก่าต่อ = นักเรียนไม่เหลือคาบเลย
    var untilMs = icalUntilToMs(map.UNTIL);
    if (untilMs !== null && newStartMs !== undefined && untilMs <= newStartMs) {
      return { ok: false, reason: '這位學生本期課程的結束日是 ' + formatThaiDateTimeLabel(new Date(untilMs).toISOString()) + '（泰國時間），\n'
        + '你選的新開始日已經超過結束日了——照這樣改，新課表會「一堂課都沒有」，\n'
        + '舊課表又會被關掉，等於這位學生完全沒課。\n\n'
        + '請先幫他建立新一期的課程，或改選結束日之前的日期。' };
    }
    parts.push('UNTIL=' + map.UNTIL);
  } else if (map.COUNT) {
    var total = parseInt(map.COUNT, 10) || 0;
    var stepMs = (interval > 1 ? interval : 1) * 7 * 24 * 3600 * 1000;
    var oldStartMs = new Date(oldStartIso).getTime();
    // จำนวนครั้งที่เกิดขึ้นไปแล้วในชุดเก่า ตั้งแต่ครั้งแรกจนถึงจุดตัด (นับครั้งแรกด้วย)
    var used = (cutMs > oldStartMs) ? (Math.floor((cutMs - oldStartMs) / stepMs) + 1) : 0;
    if (used > total) used = total;
    var left = total - used;
    // 🛑 คอร์สเดิมครบจำนวนแล้ว — เดิมโค้ดจะ "ไม่ใส่ COUNT" กลายเป็นเรียนไม่มีวันจบ (บั๊กเดิมย้ายที่)
    if (left <= 0) {
      return { ok: false, reason: '這位學生本期的 ' + total + ' 堂課，到你選的新開始日已經全部排完了。\n'
        + '照這樣改，新課表會變成「沒有結束日、一直排下去」。\n\n'
        + '請先幫他建立新一期的課程，再做永久變更。' };
    }
    parts.push('COUNT=' + left);
  }
  return { ok: true, recurrence: ['RRULE:' + parts.join(';')] };
}
// แปลงค่า UNTIL แบบ iCal (20261231T120000Z หรือ 20261231) เป็น timestamp — แปลงไม่ได้คืน null
function setRruleUntil(recurrenceArr, untilUtcStr) {
  return (recurrenceArr || []).map(function(rule) {
    if (rule.indexOf('RRULE') !== 0) return rule;
    var parts = rule.split(';').filter(function(p) { return p.indexOf('UNTIL=') !== 0 && p.indexOf('COUNT=') !== 0; });
    parts.push('UNTIL=' + untilUtcStr);
    return parts.join(';');
  });
}

var _permanentChangeToken = null;
function openPermanentChangeModal(token) {
  _permanentChangeToken = token;
  document.getElementById('permDateInput').value = '';
  lockDateInputToFuture('permDateInput'); // 🔴 2026-07-26：ชั้นที่ 1 กันเลือกวันย้อนหลัง (ชั้นที่ 2 อยู่ใน submitPermanentChangeInner)
  resetTimeDropdown('permTimeInput');
  document.getElementById('permanentChangeModal').classList.add('open');
}
function closePermanentChangeModal() { document.getElementById('permanentChangeModal').classList.remove('open'); }

// 2026-07-13 加：同一組防重複點擊鎖，key 用 'perm:'+token 避免跟其他鎖撞名
async function submitPermanentChange() {
  var token = _permanentChangeToken;
  var lockKey = 'perm:' + token;
  if (_inFlightRequestIds[lockKey]) return;
  _inFlightRequestIds[lockKey] = true;
  try {
    return await submitPermanentChangeInner(token);
  } finally {
    delete _inFlightRequestIds[lockKey];
  }
}

async function submitPermanentChangeInner(token) {
  var ctx = _teacherNextClassCtx[token];
  if (!token || !ctx) { alert('找不到這位學生的下一堂課資料，請重新整理再試'); return; }
  var newDate = document.getElementById('permDateInput').value;
  var newTime = document.getElementById('permTimeInput').value.trim();
  if (!newDate || !newTime) { alert('請選擇新的日期和時間'); return; }
  if (!isValidTimeStr(newTime)) { alert('時間格式不對，請用 HH:MM，例如 14:30'); return; }
  // 🔴 2026-07-26 ชั้นที่ 2 (ด่านหลัก) — ต้องเช็คตรงนี้เสมอ ไม่ใช่หวังพึ่ง min ของ input อย่างเดียว
  if (!assertNotPastDate(newDate, '新的固定上課日期')) return;
  if (!(await ensureTeacherSession('永久變更固定上課時間'))) return; // 🔴 2026-07-26：ก่อนแตะ Calendar/DB ต้องแน่ใจว่ายังล็อกอินอยู่
  var s = studentsCache[token];
  var studentName = s ? s.name : token;
  // 🔴 2026-07-26 ด่านที่ 2 เฉพาะของ 永久變更 (เจาะจงกับเคส 育郁):
  // การ "永久變更" ทำงานโดยตัดจบชุดคาบเดิมที่วันใหม่ (UNTIL) → คาบทุกคาบตั้งแต่วันใหม่เป็นต้นไป
  // ในชุดเดิมจะถูกลบจาก Calendar. ถ้ามีคาบที่ "บันทึกเข้าเรียนไปแล้ว" (classroom_attendance)
  // ตกอยู่ในช่วงที่จะถูกตัด = กำลังจะลบประวัติการสอนจริงทิ้ง → บล็อกทั้งอัน ไม่มีทางผ่าน
  // (ต้องเช็คก่อนสร้างชุดใหม่ เพื่อให้ล้มเหลวตั้งแต่ยังไม่แตะ Calendar เลยสักนิด)
  try {
    var attGuard = await sb.from('classroom_attendance').select('lesson_date').eq('token', token)
      .gte('lesson_date', newDate).order('lesson_date', { ascending: false }).limit(1);
    if (attGuard.error) {
      alert('⚠️ 讀不到這位學生的上課紀錄（' + attGuard.error.message + '），為了安全先不繼續。\n'
        + '（不確定會不會刪掉已經上過的課，就不動 Calendar——請重新整理再試一次。）');
      return;
    }
    if (attGuard.data && attGuard.data.length) {
      alert('🛑 不能這樣改。\n\n' + studentName + ' 在 ' + attGuard.data[0].lesson_date + ' 已經有「上過課」的紀錄，\n'
        + '但你選的新開始日是 ' + newDate + '——永久變更會把 ' + newDate + ' 之後的舊課表整段從 Calendar 砍掉，\n'
        + '那堂已經上過的課會跟著不見（之前 5 堂課消失就是這樣來的）。\n\n'
        + '請把新的開始日改到「最後一堂已上課程的隔天以後」。\n'
        + '如果真的必須改到已經過去的時間，請自己到 Google Calendar 手動處理。');
      return;
    }
  } catch (e) {
    alert('⚠️ 檢查上課紀錄時出錯（' + (e.message || e) + '），為了安全先不繼續，請重試。');
    return;
  }

  var matches;
  try { matches = await findClassEventForRequest(studentName, ctx.isoDate); }
  catch (e) { alert('⚠️ 搜尋 Calendar 失敗：' + (e.message || e)); return; }
  if (matches.length !== 1) {
    alert((matches.length === 0 ? '⚠️ 找不到符合的課堂事件' : '⚠️ 找到 ' + matches.length + ' 筆疑似符合的課堂，不確定是哪一筆') + '，請自己到 Calendar 手動處理。');
    return;
  }
  var instance = matches[0];
  var calToken = await gdGetToken();
  var masterId = instance.recurringEventId || instance.id;
  var masterEv;
  try {
    var mr = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events/' + encodeURIComponent(masterId), { headers: { Authorization: 'Bearer ' + calToken } });
    if (!mr.ok) throw new Error('讀取原本課表失敗（' + mr.status + '）：' + (await mr.text()).slice(0, 200));
    masterEv = await mr.json();
  } catch (e) { alert('⚠️ ' + (e.message || e)); return; }

  var newStart = teacherTimeToDate(newDate, newTime);
  var oldStartIso = masterEv.start.dateTime || masterEv.start.date;
  var oldDurationMs = (new Date(masterEv.end.dateTime || masterEv.end.date).getTime() - new Date(oldStartIso).getTime()) || 3600000;
  var newEnd = new Date(newStart.getTime() + oldDurationMs);
  var newStartIso = newStart.toISOString();

  // 🔴 2026-08-01 แก้ตามการเปลี่ยนสัญญาของ findConflictingEvents (audit ข้อ A7)
  //   ตัวนั้นคืนค่าเป็น { ok, items, reason } แล้ว — "เช็คไม่สำเร็จ" ต้องไม่ถูกแปลว่า "ไม่ชน" อีกต่อไป
  //   จุดนี้คือ "เปลี่ยนตารางถาวร" ซึ่งกระทบทุกสัปดาห์ ยิ่งต้องบอกครูตรงๆ ว่าเช็คไม่ได้
  var conflicts = await findConflictingEvents(newStartIso, newEnd.toISOString(), null);
  var conflictWarn = conflictWarnText(conflicts);

  if (!confirm('確定要「永久」把 ' + studentName + ' 的固定上課時間改成每週 ' + formatThaiDateTimeLabel(newStartIso) + '（泰國時間）開始嗎？' + conflictWarn + '\n\n這會影響「往後所有週」的課，不是只有這一次。舊課表會保留備份，第一堂新時間的課上完之前都能復原。')) return;
  if (!confirm('再次確認：真的要永久變更嗎？這個動作影響範圍比一般改期大很多，請確定學生已經同意再繼續。')) return;

  var hasRecurrence = !!masterEv.recurrence;
  var oldEventStillThere = false, oldEventDeleteError = '';
  // 🟠 2026-07-26 แก้：จุดตัดชุดคาบเดิม
  // เดิม UNTIL = (เวลาเริ่มใหม่ − 1 ชั่วโมง) → ถ้าย้ายเวลาให้ "สายขึ้นในวันเดียวกันของสัปดาห์"
  //   (เช่น อังคาร 19:00 → อังคาร 20:00) คาบเก่าของวันนั้นยังอยู่ก่อนจุดตัด = เหลือคาบซ้ำ 2 อันในวันเดียว
  // ใหม่: ตัดที่ "เที่ยงคืนก่อนวันเริ่มใหม่" (เวลาไทย) → ชุดเก่าเก็บทุกคาบก่อนวันนั้น ชุดใหม่รับตั้งแต่วันนั้น
  //   ไม่มีวันไหนที่มีทั้งคาบเก่าและคาบใหม่พร้อมกัน
  var cutMs = teacherTimeToDate(newDate, '00:00').getTime() - 1000;
  var newSeriesBody = {
    summary: masterEv.summary,
    description: masterEv.description,
    colorId: masterEv.colorId,
    start: { dateTime: newStartIso, timeZone: TEACHER_TZ },
    end: { dateTime: newEnd.toISOString(), timeZone: TEACHER_TZ },
  };
  // 🟠 2026-07-26 แก้：ยกเงื่อนไข "จบเมื่อไหร่" ของคอร์สเดิมมาต่อ (เดิมเขียนตายเป็น FREQ=WEEKLY ล้วน
  // ทำให้คอร์สที่มีวันจบ กลายเป็นเรียนไม่มีวันจบ) — ดู buildNewSeriesRecurrence
  // ⚠️ ต้องคำนวณ + ตัดสินใจ "ก่อน" สร้างอะไรใน Calendar เพราะบางเคสต้องหยุดทั้งอัน
  if (hasRecurrence) {
    var recur = buildNewSeriesRecurrence(masterEv.recurrence, oldStartIso, cutMs, newStart.getTime());
    if (!recur.ok) { alert('🛑 不能這樣改。\n\n' + recur.reason + '\n\n（Calendar 完全沒有被動到，很安全。）'); return; }
    newSeriesBody.recurrence = recur.recurrence;
  }
  if (masterEv.conferenceData) newSeriesBody.conferenceData = masterEv.conferenceData;

  var newEventId = null;
  try {
    var cr = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events?conferenceDataVersion=1', {
      method: 'POST', headers: { Authorization: 'Bearer ' + calToken, 'Content-Type': 'application/json' }, body: JSON.stringify(newSeriesBody),
    });
    if (!cr.ok) throw new Error('建立新課表失敗（' + cr.status + '）：' + (await cr.text()).slice(0, 200));
    var newEv = await cr.json();
    newEventId = newEv.id;
  } catch (e) { alert('⚠️ ' + (e.message || e) + '\n（還沒動舊課表，安全，可以重試）'); return; }

  // 🟠 2026-07-26 加 (RELIABILITY FIRST)：ไม่เชื่อแค่ "API ตอบว่าสร้างแล้ว" — กลับไปถาม Google ว่า
  // ชุดคาบใหม่นี้มีคาบจริงอย่างน้อย 1 คาบไหม. ถ้าเงื่อนไขซ้ำซ้อนกันจนได้ชุดว่างเปล่า
  // แล้วเราเดินหน้าไปตัดชุดเก่าต่อ = นักเรียนไม่เหลือคาบเลยสักคาบ (พังเงียบสนิท)
  if (hasRecurrence) {
    try {
      var instRes = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events/'
        + encodeURIComponent(newEventId) + '/instances?maxResults=1',
        { headers: { Authorization: 'Bearer ' + calToken } });
      if (!instRes.ok) throw new Error('確認新課表內容失敗（' + instRes.status + '）');
      var instData = await instRes.json();
      if (!instData.items || !instData.items.length) throw new Error('新課表建立出來是「空的」，一堂課都沒有');
    } catch (e) {
      // ลบชุดใหม่ที่เพิ่งสร้างทิ้ง แล้วหยุด — ยังไม่แตะชุดเก่า ปลอดภัย
      var cleanupNote = '';
      try {
        var undoRes = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events/' + encodeURIComponent(newEventId),
          { method: 'DELETE', headers: { Authorization: 'Bearer ' + calToken } });
        if (!undoRes.ok && undoRes.status !== 410 && undoRes.status !== 404) cleanupNote = '\n⚠️ 而且剛剛建立的新課表也刪不掉，請自己到 Calendar 刪掉它。';
      } catch (e2) { cleanupNote = '\n⚠️ 而且剛剛建立的新課表也刪不掉，請自己到 Calendar 刪掉它。'; }
      alert('🛑 停下來了：' + (e.message || e) + '\n\n舊課表完全沒有被動到，學生的課都還在。' + cleanupNote);
      return;
    }
  }

  // 2026-07-15 修：以前這裡空的 catch 會吞掉備份失敗，備份沒存到還是照樣往下關掉/刪掉
  // 舊課表——新課表已經建好了，只保護「關掉舊課表」這步：備份失敗就不要動舊課表，
  // 明確警告 Lin 自己到 Calendar 處理（新課表不用重建、也不會重複）。
  var backupOk = true, backupErrMsg = '';
  try {
    // 🟠 2026-08-02 (ตรวจ 3 ระบบ ข้อ 4.7): เก็บ "ค่าตารางเรียนเดิมของนักเรียน" ไว้ในแถวสำรองด้วย
    //   เดิมสำรองแต่ตัว Calendar event → กดคืนค่าแล้ว Calendar กลับชุดเก่าจริง
    //   แต่ classroom_students.pending_start_date/pending_class_time/pending_recurring ยังเป็นเวลาใหม่
    //   **ตลอดกาล** → หน้าเว็บนักเรียนโชว์คาบผิดวันไปเรื่อยๆ โดยไม่มีใครรู้
    //   เก็บใส่ old_event_json (ไม่ต้องเพิ่มคอลัมน์ใหม่ = ไม่ต้องแก้ฐานข้อมูล) ใต้คีย์ที่ Google ไม่ใช้
    var permBackupJson = Object.assign({}, masterEv, {
      _pendingBefore: {
        pending_start_date: (s && s.pending_start_date) || null,
        pending_class_time: (s && s.pending_class_time) || null,
        pending_recurring: (s && typeof s.pending_recurring !== 'undefined') ? s.pending_recurring : null,
      },
    });
    var bkRes2 = await sb.from('classroom_calendar_backups').insert({
      request_id: null, token: token, action: 'permanent_change',
      old_event_id: masterEv.id, new_event_id: newEventId,
      old_event_json: permBackupJson, old_start: oldStartIso, new_start: newStartIso,
    });
    if (bkRes2.error) { backupOk = false; backupErrMsg = bkRes2.error.message; }
  } catch (e) { backupOk = false; backupErrMsg = e.message || String(e); }

  if (!backupOk) {
    alert('⚠️ 新課表已經建立好了，但備份舊課表失敗（' + backupErrMsg + '），為了安全「沒有」關閉/刪除舊課表。\n請自己到 Calendar 手動關閉舊課表，避免兩份課表同時存在。（新課表不用重建）');
  } else if (hasRecurrence) {
    try {
      var untilStr = buildIcalUntilUtc(new Date(cutMs)); // 🟠 2026-07-26：ตัดที่เที่ยงคืนก่อนวันใหม่ ไม่ใช่ −1 ชั่วโมง
      var patchBody = { recurrence: setRruleUntil(masterEv.recurrence, untilStr) };
      var pr = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events/' + encodeURIComponent(masterEv.id), {
        method: 'PATCH', headers: { Authorization: 'Bearer ' + calToken, 'Content-Type': 'application/json' }, body: JSON.stringify(patchBody),
      });
      if (!pr.ok) throw new Error('關閉舊課表失敗（' + pr.status + '）：' + (await pr.text()).slice(0, 200));
    } catch (e) {
      oldEventStillThere = true; oldEventDeleteError = e.message || String(e);
      alert('⚠️ 新課表已經建立好了，但關閉舊課表失敗：' + (e.message || e) + '\n請自己到 Calendar 檢查，避免舊課表繼續出現（新課表不用重建）。');
    }
  } else {
    try { await deleteClassEventOnce(masterEv.id); }
    catch (e) {
      oldEventStillThere = true; oldEventDeleteError = e.message || String(e);
      alert('⚠️ 新課表已經建立好了，但刪除舊時間失敗：' + oldEventDeleteError + '\n請自己到 Calendar 手動刪除舊的那一筆，避免新舊時間同時出現。（新課表不用重建）');
    }
  }

  // 2026-07-14 修 bug（Lin 回報：老師端「選擇要取消的課堂」能列出好幾週，學生端卻只有一堂）：
  //   原因找到了——這個函式只有改 Google Calendar 的真實課表，從來沒有把新的固定時間寫回
  //   classroom_students.pending_start_date/pending_class_time/pending_recurring。
  //   老師端的清單是直接讀 Google Calendar（老師有 OAuth 權限），永遠準；學生端沒有 Calendar
  //   權限，只能靠這三個欄位往後推算未來每一堂——欄位沒同步，學生端當然只看得到眼前這一堂。
  //   改法：Calendar 那邊處理完，順手把這三個欄位也更新，兩邊資料源才會一致。
  var pendingSyncOk = true, pendingSyncError = null;
  try {
    // 🔴 2026-07-26 (RED 4)：เช็คจำนวนแถวจริงด้วย ไม่ใช่แค่ error (RLS บล็อกแบบ 0 แถวได้)
    const { data: pendingSyncRows, error: pendingSyncErr } = await sb.from('classroom_students').update({
      pending_start_date: newDate, pending_class_time: newTime, pending_recurring: true,
    }).eq('token', token).select();
    if (pendingSyncErr) { pendingSyncOk = false; pendingSyncError = pendingSyncErr.message; }
    else if (!pendingSyncRows || !pendingSyncRows.length) { pendingSyncOk = false; pendingSyncError = '更新了 0 筆（資料庫沒有真的改到，可能是 RLS 權限或登入過期）'; }
    else if (studentsCache[token]) {
      studentsCache[token].pending_start_date = newDate;
      studentsCache[token].pending_class_time = newTime;
      studentsCache[token].pending_recurring = true;
    }
  } catch (e) { pendingSyncOk = false; pendingSyncError = e.message || String(e); }

  // 2026-07-14 加（RELIABILITY FIRST，同樣道理：空 catch 會吞掉失敗，不能還跟老師說「已通知學生」）
  var permNotifySent = false, permNotifyError = null;
  if (s && s.line_user_id) {
    try {
      // newDate/newTime 是老師輸入的泰國時間 → 傳給學生看之前先換算成他自己的時區
      const permTimeLabel = studentFacingTimeLabel(new Date(newStartIso), s.pending_student_tz);
      const permNotifyRes = await fetch(LINE_NOTIFY_ENDPOINT, {
        method: 'POST',
        // 2026-07-19 แก้（SECURITY FIRST）：notify-line สาขา to:{studentToken} ตอนนี้บังคับต้องมี session จริงของครู
        headers: { 'Content-Type': 'application/json', 'apikey': window.SUPABASE_CONFIG.anonKey, 'Authorization': 'Bearer ' + (await teacherAuthHeader()) },
        body: JSON.stringify({ to: { studentToken: token }, message: '老師調整了你的固定上課時間，之後改成每週 ' + permTimeLabel + '，如有疑問請直接聯絡老師' }),
      });
      permNotifySent = permNotifyRes.ok;
      if (!permNotifyRes.ok) permNotifyError = await lineNotifyErrorText(permNotifyRes);
    } catch (e) { permNotifyError = e.message || String(e); }
  }

  closePermanentChangeModal();
  var permResultMsg = '✅ 已永久變更課表';
  if (!s || !s.line_user_id) permResultMsg += '（學生還沒連結 LINE，建議自己說一聲）';
  else if (permNotifySent) permResultMsg += '，並已通知學生';
  else permResultMsg += '\n⚠️ 但 LINE 通知學生失敗（' + permNotifyError + '），請自己再跟學生說一聲';
  if (!pendingSyncOk) permResultMsg += '\n⚠️ Google Calendar 已經改好了，但學生端的課表資料同步失敗（' + pendingSyncError + '）——學生自己頁面上的「選擇要取消的課堂」可能還是只看得到下一堂，不影響 Calendar 本身，建議通知開發者檢查。';
  if (oldEventStillThere) permResultMsg += '\n⚠️ 舊的上課時間可能還沒清掉（' + oldEventDeleteError + '），請自己到 Calendar 確認，避免新舊時間同時出現。';
  alert(permResultMsg);
  try { await refreshTodayScheduleSection(); } catch (e) { console.warn('⚠️ 課表 resync 失敗（不影響 Calendar 本身）：', e.message || e); }
  loadTeacherNextClassBox(token);
  loadRecentBackups();
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
