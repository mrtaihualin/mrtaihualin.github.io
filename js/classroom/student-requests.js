// ============================================================
// FILE MAP: next class/contact → request API → add-class flow/status → notification
// 學生：下一堂課（唯讀，資料來自老師端同步的 Google Calendar）
// 學生要調整或取消既有課堂時直接用 LINE 聯絡老師；老師在 Google Calendar 手動處理。
// ============================================================
// 2026-07-20 改（Lin 實測回報：lin.ee 這個加好友短連結點了只會開「官方帳號主頁」，不是直接跳進聊天室，
// 跟原本以為的行為不一樣）：改用 LINE 官方文件記載的「開啟與官方帳號聊天畫面」深連結格式
// https://line.me/R/oaMessage/{Basic ID} — 這個格式手機上點了會直接開 LINE App 跳進聊天室
// （已加好友的話直接進現有對話，不會再問加好友一次），比 lin.ee 更符合「聯繫老師」按鈕的用途。
// Basic ID 從 LINE Developers Console → 選 Messaging API 那個 channel（泰華眼裡的世界 Taihua Lin）
// → Basic settings 分頁 → 「Bot basic ID」欄位找到（Lin 提供 2026-07-20：@010rhagu）。
// 注意：這個深連結只在手機 LINE App（iOS/Android）有效，LINE 桌面版不支援這個 scheme（LINE 官方文件寫的）。
const LINE_OA_URL = 'https://line.me/R/oaMessage/' + encodeURIComponent('@010rhagu'); // 全站統一用這個 LINE 官方帳號當「聯絡老師」入口
const LIFF_ID = '2010620934-5MFOEYBX'; // 跟 classroom/liff-config.js 同一個 LIFF app，用來在 LINE 裡直接開課堂頁

// 2026-07-20 改（Lin 要求：「💬 聯繫學生」不用再跳去網站，按了直接在同一個 LINE 聊天視窗打字）：
// 以前這裡是「uri 開網站＋帶 hash」開啟網站上的聯絡 modal，需要老師手機瀏覽器已登入教師帳號。
// 現在改成 postback（action=start_contact_student），line-webhook 收到會記住「接下來老師打的
// 下一句純文字要轉給這個學生」，老師直接在 LINE 裡打字回覆即可，完全不用開網站
// （見 supabase/functions/line-webhook/index.ts 的 handleTeacherTextMessage）。
function contactStudentPostbackButton(token) {
  return {
    label: '💬 聯繫學生',
    postbackData: 'action=start_contact_student&token=' + encodeURIComponent(token || ''),
  };
}

// 2026-07-11 加：「下一堂課」卡片下方的 LINE 按鈕 —
//   已連結 LINE（student.line_user_id 有值）→ 顯示「在 LINE 中開啟」，用 LIFF 在 LINE 裡開這個課堂頁
//   還沒連結 LINE → 顯示「連結 LINE 帳號」，帶去 line-link.html 做第一次連結
//   兩顆都用網站統一金色按鈕樣式（跟 meet-btn 同一套），不是只有一行小字連結而已
function buildLineActionBtn(token, student) {
  if (student && student.line_user_id) {
    var openUrl = 'https://liff.line.me/' + LIFF_ID + '?goto=classroom&s=' + encodeURIComponent(token);
    return '<a class="meet-btn" href="' + openUrl + '" style="margin-top:12px;background:linear-gradient(135deg,var(--gold-bright),var(--gold-deep));font-size:0.95rem;padding:12px 20px;">📲 在 LINE 中開啟</a>';
  }
  // 2026-07-11：改用 LIFF 連結（liff.line.me）而不是直接連 line-link.html —
  // 學生在 LINE 裡點開會用「已登入的 LINE 身分」自動連結，完全不用打 email／密碼／驗證碼
  var linkUrl = 'https://liff.line.me/' + LIFF_ID + '?goto=linkline&s=' + encodeURIComponent(token);
  return '<a class="meet-btn" href="' + linkUrl + '" style="margin-top:12px;background:linear-gradient(135deg,var(--gold-bright),var(--gold-deep));font-size:0.95rem;padding:12px 20px;">🔔 連結 LINE 帳號，上課前自動提醒</a>';
}

// 2026-07-18 拿掉 classRequestSameWarn()（Lin 要求刪掉「此為唯讀課表…」這行提示文字）

// 2026-07-18 加：「📅 我的課程記錄」現在是「下一堂課」按鈕列的第一顆按鈕，點下去原地展開/收合
// #courseRecordPanel（裡面是 quotaSummary + scheduleList，資料已經在 loadStudentQuota/
// loadStudentSchedule 載入好了，這裡只是切換顯示/隱藏，不用重新打 API）
function toggleCourseRecordPanel() {
  var panel = document.getElementById('courseRecordPanel');
  var btn = document.getElementById('courseRecordToggleBtn');
  if (!panel) return;
  var opening = panel.style.display === 'none';
  panel.style.display = opening ? '' : 'none';
  if (btn) btn.textContent = opening ? '📅 我的課程記錄 ▲' : '📅 我的課程記錄 ▼';
}

// 2026-07-10 改版：
// (1) 原本只看 classroom_schedule（老師手動連 Google Calendar 才會同步，只涵蓋近 9 天）——
//     學生第一堂課如果排在 9 天以後，這裡會一直空白，即使老師課表早就排好了。
//     現在加 fallback：近 9 天內沒同步到資料 → 直接從 pending_start_date/pending_class_time/
//     pending_recurring 算下一次上課時間（會自動往後推算到下一個還沒過去的星期，如果是每週固定課）。
// (2) 不管資料來自哪一邊，一律當「泰國時間」解讀（跟 pending_class_time 的定義一致），
//     再用 formatInTz 換算成這位學生自己的時區（pending_student_tz）顯示 —— 不是每台裝置/瀏覽器
//     時區不同就換算錯。沒選時區的舊資料 → 照舊顯示泰國時間（維持舊行為，不強制轉換）。
async function loadStudentNextClass(token) {
  const el = document.getElementById('nextClassInfo');
  if (!el) return;
  const s = (typeof studentsCache !== 'undefined') ? studentsCache[token] : null;
  const studentTz = s && s.pending_student_tz;
  try {
    const { data, error } = await sb.rpc('get_student_schedule', { p_token: token });
    if (error) { el.innerHTML = '<div style="color:var(--ink-muted);font-family:\'Noto Sans TC\',sans-serif;font-size:0.85rem;">目前無法讀取課表（' + error.message + '）</div>'; return; }

    let lessonDate = null, startTimeStr = null, endTimeStr = null;
    if (data && data.length) {
      const next = data[0];
      lessonDate = next.lesson_date;
      startTimeStr = (next.start_time && /^\d{1,2}:\d{2}/.test(next.start_time)) ? next.start_time : null;
      endTimeStr = (next.end_time && /^\d{1,2}:\d{2}/.test(next.end_time)) ? next.end_time : null;
    } else if (s && s.pending_start_date && s.pending_class_time) {
      let anchor = teacherTimeToDate(s.pending_start_date, s.pending_class_time);
      if (s.pending_recurring) {
        const weekMs = 7 * 24 * 3600 * 1000;
        const nowMs = Date.now();
        if (anchor.getTime() < nowMs) {
          const weeksPassed = Math.ceil((nowMs - anchor.getTime()) / weekMs);
          anchor = new Date(anchor.getTime() + weeksPassed * weekMs);
        }
      } else if (anchor.getTime() < Date.now()) {
        anchor = null; // 單次課程，時間已過去 → 沒有下一堂課了
      }
      if (anchor) {
        const p = formatInTz(anchor, TEACHER_TZ);
        lessonDate = p.dateStr;
        startTimeStr = p.timeStr;
      }
    }

    if (!lessonDate) {
      el.innerHTML = '<div style="color:var(--ink-muted);font-family:\'Noto Sans TC\',sans-serif;font-size:0.85rem;">目前沒有排定下一堂課，如需安排請聯絡老師，或直接送出「申請加課」。</div>' +
        '<div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-start;margin-top:10px;">' +
          '<button class="btn-sm" id="courseRecordToggleBtn" style="background:linear-gradient(135deg,var(--gold-bright) 0%,var(--gold) 50%,var(--gold-deep) 100%);color:#fff;" onclick="toggleCourseRecordPanel()">📅 我的課程記錄 ▼</button>' +
          '<button class="btn-sm" style="background:linear-gradient(135deg,var(--gold-bright) 0%,var(--gold) 50%,var(--gold-deep) 100%);color:#fff;" onclick="openAddRequestModal(\'' + token + '\')">➕ 申請加課</button>' +
          '<a class="btn-sm" href="' + LINE_OA_URL + '" target="_blank" rel="noopener" style="background:linear-gradient(135deg,var(--gold-bright),var(--gold-deep));color:#fff;text-decoration:none;">💬 聯絡老師</a>' +
        '</div>';
      return;
    }

    const dayZh = ['日','一','二','三','四','五','六'];
    let dLabelDate, timeStr;
    if (startTimeStr && studentTz) {
      const abs = teacherTimeToDate(lessonDate, startTimeStr);
      const conv = formatInTz(abs, studentTz);
      dLabelDate = new Date(conv.dateStr + 'T00:00:00');
      timeStr = conv.timeStr;
    } else {
      dLabelDate = new Date(lessonDate + 'T00:00:00');
      timeStr = startTimeStr ? (startTimeStr + (endTimeStr ? '–' + endTimeStr : '')) : '';
    }
    const dayLabel = (dLabelDate.getMonth()+1) + '月' + dLabelDate.getDate() + '日（週' + dayZh[dLabelDate.getDay()] + '）';
    el.innerHTML =
      '<div style="background:#f8f4ea;border:1px solid #e5d9b8;border-radius:10px;padding:12px 14px;font-family:\'Noto Sans TC\',sans-serif;">' +
        '<div style="font-weight:700;font-size:1rem;color:var(--ink);">' + escHtml(dayLabel) + '</div>' +
        (timeStr ? '<div style="font-size:0.9rem;color:var(--ink-soft);margin-top:2px;">' + escHtml(timeStr) + '</div>' : '') +
      '</div>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-start;margin-top:10px;">' +
        // 2026-07-14 改（Lin 要求）：以前這顆按鈕只能取消「下一堂課」，如果剛好在 24 小時內
        // 就整個沒有取消按鈕，只能傳老師。現在改成一律開「選擇要取消的課堂」清單——
        // 有固定每週上課的學生會列出未來好幾堂，每一堂各自判斷是否超過 24 小時可以線上取消，
        // 不到 24 小時的那一堂會顯示「聯絡老師」而不是擋住整組功能。
        // 2026-07-18 加（Lin 要求）：「📅 我的課程記錄」移到這一排第一顆，點下去原地展開/收合
        '<button class="btn-sm" id="courseRecordToggleBtn" style="background:linear-gradient(135deg,var(--gold-bright) 0%,var(--gold) 50%,var(--gold-deep) 100%);color:#fff;" onclick="toggleCourseRecordPanel()">📅 我的課程記錄 ▼</button>' +
        '<a class="btn-sm" href="' + LINE_OA_URL + '" target="_blank" rel="noopener" style="background:linear-gradient(135deg,var(--gold-bright),var(--gold-deep));color:#fff;text-decoration:none;">💬 聯絡老師</a>' +
        '<button class="btn-sm" style="background:linear-gradient(135deg,var(--gold-bright) 0%,var(--gold) 50%,var(--gold-deep) 100%);color:#fff;" onclick="openAddRequestModal(\'' + token + '\')">➕ 申請加課</button>' +
      '</div>';
  } catch (e) {
    el.innerHTML = '<div style="color:var(--ink-muted);font-family:\'Noto Sans TC\',sans-serif;font-size:0.85rem;">載入失敗：' + (e.message || e) + '</div>';
  }
}

// 2026-07-13 加：申請改期/取消前，一定要先連結 LINE（老師處理完/提議新時間都要用 LINE 通知學生回覆）
function requireLineLinkedOrPrompt(token) {
  var s = studentsCache[token];
  if (s && s.line_user_id) return true;
  if (confirm('申請加課前，需要先連結 LINE 帳號（老師才能用 LINE 通知你處理結果）。\n現在就去連結嗎？')) {
    window.location.href = 'https://liff.line.me/' + LIFF_ID + '?goto=linkline&s=' + encodeURIComponent(token);
  }
  return false;
}

// ════════════════════════════════════════════════════════════
// 2026-07-19 新增（重大修正）：學生端一律改用 RPC 存取 classroom_requests
//
// 為什麼：classroom_requests 有開 RLS，但三條 policy（INSERT/SELECT/UPDATE）
// 全都要求「JWT 的 email＝老師信箱」。學生只有網址上的 token，沒有真的登入
// Supabase（isTeacher 是靠網址參數 s 判斷的，見 2621-2623），所以學生端所有
// `sb.from('classroom_requests')` 直接存取全部會被 RLS 擋掉。
//
// ⚠️ 最陰險的地方：被 RLS 擋掉的 UPDATE **不會回傳 error**，只是「更新 0 筆」，
// PostgREST 回 error=null。所以只檢查 `if (res.error)` 的舊寫法會一路顯示成功，
// 但其實什麼都沒存進去 —— 這就是 2026-07-19 找到的「取消申請沒有
// calendar_event_id」那個 bug 的真正原因（連同其他 14 個一起壞掉的地方）。
//
// 解法：改走 SECURITY DEFINER 的 RPC（見 supabase/sql/2026-07-19_student_request_rpcs.sql），
// 函式內部一定會比對 token，而且只准改白名單欄位、status 只能設成 acknowledged。
// 沒有放寬 RLS，學生依然不能亂改別人的資料。
//
// 用法：回傳 { rows, error }。rows.length === 0 代表「沒改到任何一筆」
//（通常是被老師搶先處理了），呼叫端一定要自己判斷，不能只看 error。
// ════════════════════════════════════════════════════════════
// 🟡 2026-07-31 加（งาน C12）：แปลง error ดิบจากฐานข้อมูลเป็นภาษาจีนสั้นๆ ที่นักเรียนอ่านรู้เรื่อง
//
// ปัญหาเดิม: หน้าเว็บเอาข้อความ error จากฐานข้อมูลมาโชว์ตรงๆ นักเรียนที่กดพอดีตอนข้ามเส้น 24 ชม.
//   จะเห็นข้อความปนอังกฤษยาวๆ เช่น
//   "students may only cancel a class 24+ hours in advance — please use reschedule instead (...)"
//
// ⚠️ ตั้งใจ "ไม่ซ่อน" error ที่ไม่รู้จัก — ยังโชว์ของเดิมต่อไป
//   ถ้าซ่อนหมด วันไหนพังจริงจะหาสาเหตุไม่เจอเลย (ผิดกฎ RELIABILITY FIRST)
//
// ⚠️ เทียบด้วย "คำกลางประโยค" ไม่ใช่ทั้งประโยค — บทเรียนจริงจากไฟล์ consolidated.sql:199-201
//   ที่เคยเทียบคำว่า '24 hours' แล้วพลาด เพราะข้อความจริงเขียน '24+ hours' (มีเครื่องหมาย +)
function friendlyRequestError(msg) {
  var m = String(msg || '');
  // 🔴 2026-08-01 ต้องอยู่ "ก่อน" กฎ 'hours in advance' ข้างล่างเสมอ
  //   ข้อความของด่านใหม่คือ 'students may only reschedule a class 6+ hours in advance ...'
  //   ซึ่งมีคำว่า 'hours in advance' อยู่ด้วย → ถ้าเรียงสลับกัน นักเรียนที่ขอ "เลื่อน" ไม่ทัน
  //   จะได้ข้อความของ "ยกเลิก" ที่บอกให้ไปใช้ปุ่มขอเลื่อน = วนเป็นงูกินหาง
  // 🔴 2026-08-02 เพิ่ม — ด่านใหม่ในฐานข้อมูล "ห้ามแก้เวลาที่ขอ ตอนครูกำลังจัดการอยู่"
  //   (supabase/sql/2026-08-01_reschedule_guards.sql ป้าย ★★★) ต้องแปลเป็นภาษาคนก่อนโชว์
  if (m.indexOf('locked or already closed') >= 0) {
    return '老師正在處理這筆申請，或這筆已經處理完了，現在沒辦法再改時間。\n請重新整理頁面看最新狀態，需要的話直接用 LINE 聯絡老師。';
  }
  if (m.indexOf('only reschedule') >= 0) {
    return '這堂課距離上課不到 6 小時，沒辦法線上改期。\n請直接用 LINE 聯絡老師。';
  }
  if (m.indexOf('6-hour reschedule window') >= 0) {
    return '這堂課系統裡沒有記錄上課時間，沒辦法自動判斷，請直接聯絡老師改期。';
  }
  if (m.indexOf('hours in advance') >= 0) {
    return '這堂課目前無法在線上調整，請直接用 LINE 聯絡老師。';
  }
  if (m.indexOf('missing original_time') >= 0) {
    return '這堂課系統裡沒有記錄上課時間，沒辦法自動判斷，請直接聯絡老師。';
  }
  if (m.indexOf('too many requests') >= 0) {
    return '操作太頻繁了，請等一下再試一次。';
  }
  if (m.indexOf('invalid student token') >= 0) {
    return '找不到你的學生資料，請從老師給你的專屬連結重新進入這個頁面。';
  }
  return null; // ไม่รู้จัก → ให้ผู้เรียกโชว์ข้อความเดิม
}

async function studentPatchRequest(token, id, patch, guards) {
  const g = guards || {};
  const res = await sb.rpc('student_update_own_request', {
    p_token: token,
    p_id: id,
    p_patch: patch,
    p_require_status: g.status || null,
    p_require_offer_status: g.offerStatus || null,
    p_require_not_processing: !!g.notProcessing,
    p_require_null_column: g.nullColumn || null,
  });
  if (res.error) return { rows: [], error: res.error };
  return { rows: res.data || [], error: null };
}

// 2026-07-19 新增：學生端讀自己的申請（取代被 RLS 擋掉的 select）。
// 細部條件（日期、ack 是否為 null、本機關掉過的）留在呼叫端自己過濾，
// 這樣資料庫只需要維護一個函式。
async function studentFetchRequests(token, opts) {
  const o = opts || {};
  const res = await sb.rpc('student_get_own_requests', {
    p_token: token,
    p_request_type: o.requestType || null,
    p_status: o.status || null,
    p_initiated_by: o.initiatedBy || null,
    p_limit: o.limit || 10,
  });
  if (res.error) { console.error('⚠️ 讀取申請失敗：', res.error.message); return { rows: [], error: res.error }; }
  return { rows: res.data || [], error: null };
}

// 2026-07-14 改：現在可以取消「下一堂課」以外的其他堂（從「選擇要取消的課堂」清單點進來），
// isoDate 有帶就取消那一堂，沒帶（舊的呼叫方式）就照舊取消下一堂課，維持相容。
async function studentWithdrawOwnAddRequest(token, id) {
  if (!confirm('確定要收回這筆加課申請嗎？（等於不加這堂課了）')) return;
  const res = await studentPatchRequest(token, id, { status: 'acknowledged' }, { status: 'pending', notProcessing: true });
  if (res.error) { alert('⚠️ 收回失敗：' + res.error.message); return; }
  if (!res.rows.length) {
    alert('ℹ️ 收回失敗——老師可能正在處理中，或剛好已經處理完了，請直接用 LINE 聯絡老師確認狀況。');
    loadStudentPendingRequestStatus(token);
    return;
  }
  alert('✅ 已收回這筆加課申請');
  loadStudentPendingRequestStatus(token);
}

function addReqRowHtml(idx) {
  return '<div class="addReqRow" id="addReqRow_' + idx + '" style="' + (idx > 0 ? 'border-top:1px solid var(--border);padding-top:10px;margin-top:10px;' : '') + '">' +
    '<label class="settings-label">想約哪一天？</label>' +
    '<input class="settings-input" id="addReqDate_' + idx + '" type="date" oninput="onAddReqScheduleChange(' + idx + ')" />' +
    '<label class="settings-label">想約幾點？（請選「你自己現在所在地」的時間，不用換算成泰國時間）</label>' +
    '<div style="display:flex;gap:6px;align-items:center;">' +
      '<select class="settings-input" id="addReqTime_' + idx + '_h" style="flex:1;text-align:center;margin-bottom:0;" onchange="syncTimeDropdown(\'addReqTime_' + idx + '\');onAddReqScheduleChange(' + idx + ')">' + TIME_HOUR_OPTIONS_HTML + '</select>' +
      '<span style="font-family:\'Noto Sans TC\',sans-serif;color:var(--ink-muted);font-weight:700;">:</span>' +
      '<select class="settings-input" id="addReqTime_' + idx + '_m" style="flex:1;text-align:center;margin-bottom:0;" onchange="syncTimeDropdown(\'addReqTime_' + idx + '\');onAddReqScheduleChange(' + idx + ')">' + TIME_MIN_OPTIONS_HTML + '</select>' +
    '</div>' +
    '<input type="hidden" id="addReqTime_' + idx + '" value="" />' +
    '<p id="addReqHint_' + idx + '" style="display:none;font-size:0.8rem;color:var(--gold-deep);font-family:\'Noto Sans TC\',sans-serif;margin-top:-6px;margin-bottom:10px;"></p>' +
    '<div style="text-align:right;">' +
      '<button type="button" class="btn-ghost addReqRemoveBtn" style="display:none;font-size:0.78rem;padding:3px 10px;" onclick="removeReqRow(' + idx + ')">－ 移除這筆</button>' +
    '</div>' +
  '</div>';
}
var _addReqNextIdx = 0;
function updateAddReqRemoveButtons() {
  var rows = document.querySelectorAll('#addReqRows .addReqRow');
  rows.forEach(function (row) {
    var btn = row.querySelector('.addReqRemoveBtn');
    if (btn) btn.style.display = rows.length > 1 ? '' : 'none';
  });
}
function addReqAddRow() {
  var idx = _addReqNextIdx++;
  document.getElementById('addReqRows').insertAdjacentHTML('beforeend', addReqRowHtml(idx));
  // 🔴 2026-07-26：ช่องฝั่งนักเรียน → ยึด "วันนี้ของนักเรียนเอง" (ชั้นที่ 2 อยู่ใน submitAddRequest)
  var _s = (_addReqToken && typeof studentsCache !== 'undefined') ? studentsCache[_addReqToken] : null;
  lockDateInputToFuture('addReqDate_' + idx, _s && _s.pending_student_tz);
  updateAddReqRemoveButtons();
  return idx;
}
function removeReqRow(idx) {
  var rows = document.querySelectorAll('#addReqRows .addReqRow');
  if (rows.length <= 1) return; // 不能減到 0 筆
  var el = document.getElementById('addReqRow_' + idx);
  if (el) el.remove();
  updateAddReqRemoveButtons();
}
function resetAddReqRows() {
  document.getElementById('addReqRows').innerHTML = '';
  _addReqNextIdx = 0;
  addReqAddRow();
}
var _addReqToken = null;
function openAddRequestModal(token) {
  if (!requireLineLinkedOrPrompt(token)) return;
  _addReqToken = token;
  resetAddReqRows();
  document.getElementById('addReqNoteInput').value = '';
  document.getElementById('addRequestModal').classList.add('open');
}
function closeAddRequestModal() { document.getElementById('addRequestModal').classList.remove('open'); }

function onAddReqScheduleChange(idx) {
  const dateVal = document.getElementById('addReqDate_' + idx).value;
  const timeVal = document.getElementById('addReqTime_' + idx).value.trim();
  const hint = document.getElementById('addReqHint_' + idx);
  if (!dateVal || !timeVal) { hint.style.display = 'none'; return; }
  if (!isValidTimeStr(timeVal)) { hint.style.display = 'block'; hint.textContent = '⚠️ 時間格式不對，請用 HH:MM，例如 14:30'; return; }
  const s = (_addReqToken && typeof studentsCache !== 'undefined') ? studentsCache[_addReqToken] : null;
  const studentTz = s && s.pending_student_tz;
  if (studentTz) {
    // 2026-07-22 改（Lin 要求移除，跟 onReqScheduleChange 同一套改法）：時區換算正常時不再顯示
    // 「＝ 老師端泰國時間」這行提示，只在有問題時才顯示警告。
    try {
      parseInTzToDate(dateVal, timeVal, studentTz);
      hint.style.display = 'none';
    } catch (e) {
      hint.style.display = 'block';
      hint.textContent = '⚠️ 時區資料有問題，這個時間會直接當成泰國時間送給老師，建議送出後跟老師確認一下';
    }
  } else {
    hint.style.display = 'block';
    hint.textContent = '⚠️ 你還沒設定過自己的時區，這個時間會直接當成泰國時間送給老師（跟你想的可能會差好幾個小時，建議先跟老師確認）';
  }
}

// 2026-07-20 改（Lin 要求：一次可以送出好幾筆＋要有結構化的「固定/固定到」）：迴圈處理
// #addReqRows 底下每一筆 row，各自送 submit_class_request，然後跟老師端 proposeAddClassDay
// 同一套「update proposed_* 欄位 + .select() + 檢查筆數」寫法補存固定/固定到細節——這是這次
// 真正的 parity 修正：以前學生送出的加課申請完全沒有結構化存這幾個欄位，老師只能從備註文字
// 自己看，現在跟老師端一樣可以直接被 confirm_add_class／confirmTeacherAddClass 讀取使用。
// 備註欄位維持共用同一個（送出時套用到這批送出的每一筆），不做成逐筆備註（避免過度複雜）。
async function submitAddRequest() {
  const token = _addReqToken;
  if (!token) { closeAddRequestModal(); return; }
  const note = document.getElementById('addReqNoteInput').value.trim();
  const s = studentsCache[token];
  const studentTz = s && s.pending_student_tz;
  const studentName = currentStudentName(token);

  const rowEls = Array.prototype.slice.call(document.querySelectorAll('#addReqRows .addReqRow'));
  const rowsInput = [];
  for (let i = 0; i < rowEls.length; i++) {
    const idx = rowEls[i].id.replace('addReqRow_', '');
    const n = i + 1;
    const rawDate = document.getElementById('addReqDate_' + idx).value;
    const rawTime = document.getElementById('addReqTime_' + idx).value.trim();
    if (!rawDate) { alert('第 ' + n + ' 筆：請選擇想約哪一天'); return; }
    if (!assertNotPastDate(rawDate, '第 ' + n + ' 筆的日期', studentTz)) return; // 🔴 2026-07-26 ชั้นที่ 2
    if (!isValidTimeStr(rawTime)) { alert('⚠️ 第 ' + n + ' 筆：時間格式不對，請用 HH:MM，例如 14:30'); return; }

    let newDate = rawDate, newTime = rawTime;
    if (studentTz) {
      try {
        const abs = parseInTzToDate(rawDate, rawTime, studentTz);
        const thai = formatInTz(abs, TEACHER_TZ);
        newDate = thai.dateStr; newTime = thai.timeStr;
      } catch (e) { /* 換算失敗就照原樣送出（當泰國時間），至少不會整個卡住 */ }
    }
    // 2026-07-22 改（Lin 要求）：學生自己申請加課一律當「單次」，不再有「每週固定」選項
    // （固定課表變更只能由老師發起），recurring/untilVal 固定寫死。
    rowsInput.push({ newDate: newDate, newTime: newTime, recurring: false, untilVal: null, endTime: addOneHourTimeStr(newTime), weekday: thaiDateWeekday(newDate) });
  }
  if (!rowsInput.length) { alert('至少要有一筆時間'); return; }

  const btn = document.getElementById('addReqSubmitBtn');
  btn.disabled = true; btn.textContent = '送出中…';

  const created = []; // 成功建立的那幾筆：{ requestId, newDate, newTime, recurring, untilVal, endTime, weekday }
  const failedLines = [];
  for (const row of rowsInput) {
    try {
      const res = await sb.rpc('submit_class_request', {
        p_token: token,
        p_student_name: studentName,
        p_request_type: 'add_class',
        p_original_date: null, // ไม่มี "คาบเดิม" — เป็นคาบใหม่ที่ขอเพิ่ม
        p_requested_date: row.newDate,
        p_requested_time: row.newTime,
        p_note: note || null,
        p_initiated_by: 'student',
      });
      if (res.error) { var friendlyAdd = friendlyRequestError(res.error.message); failedLines.push(row.newDate + ' ' + row.newTime + '：' + (friendlyAdd || res.error.message)); continue; }
      const newId = res.data;

      // ════════════════════════════════════════════════════════════════════════
      // 🟠 2026-07-31 ลบทิ้ง (ข้อ #11 ในรายงานตรวจ) — คำสั่งที่ "ไม่มีทางสำเร็จ" ตั้งแต่วันแรก
      //
      // เดิมตรงนี้ให้นักเรียนเขียน 4 คอลัมน์ (proposed_end_time / proposed_recurring /
      //   proposed_until / proposed_weekday) ตรงเข้าตาราง classroom_requests
      // แต่ RLS บล็อกการเขียนตรงของนักเรียนอยู่แล้ว แบบ "0 แถว ไม่มี error เลย" (ดูคำอธิบายยาว
      //   ที่ studentPatchRequest ด้านบน) → 4 คอลัมน์นี้ไม่เคยถูกบันทึกสักครั้งเดียว
      //   error โผล่แค่ใน console ของเบราว์เซอร์ ส่วนนักเรียนเห็น ✅ ตามปกติ = จอโกหก
      //
      // ทำไม "ลบ" ไม่ใช่ "แก้ให้เขียนได้":
      //   ค่าทั้ง 4 คำนวณกลับได้หมดอยู่แล้ว และทั้ง 2 ฝั่งทำแบบนั้นอยู่จริงตอนนี้ —
      //     เวลาจบ  = เวลาเริ่ม + 1 ชม.  (line-webhook: addOneHourTimeStr · เว็บ: addOneHourTimeStr)
      //     ทุกสัปดาห์ / ถึงวันไหน = นักเรียนติ๊กไม่ได้อยู่แล้ว (ดูบรรทัด "一律當單次" ด้านบน)
      //     วันในสัปดาห์ = คิดจากวันที่ที่ขอมา (line-webhook คำนวณเองอยู่แล้ว)
      //   ทางเลือกอีกทางคือเติม 4 คอลัมน์เข้ารายชื่ออนุญาตของ student_update_own_request
      //     แต่ฟังก์ชันนั้น "ใช้ร่วมทั้ง 3 ระบบ" (ยกเลิก/ขอเลื่อน/เพิ่มคาบ) การแก้ต้องคัดลอกทั้งดุ้น
      //     ถ้ามีอีกงานแก้วันเดียวกัน งานหนึ่งจะหายเงียบโดยไม่มี error (เกือบเกิดจริง 2026-07-31)
      //   → เอาความเสี่ยงจริงไปแลกกับประโยชน์สมมติ (คาบ 90 นาทีที่ยังไม่มีจริง) ไม่คุ้ม
      //
      // 📌 ถ้าวันไหนมีคาบยาวไม่เท่ากัน (เช่น 90 นาที) ต้องกลับมาทำทางนั้นแทน — อย่าเอาโค้ดเดิมกลับมา
      //    เพราะมันเขียนไม่ลงเหมือนเดิม ต้องไปเติมรายชื่ออนุญาตใน SQL แล้วเขียนผ่าน RPC เท่านั้น
      // ════════════════════════════════════════════════════════════════════════

      created.push(Object.assign({ requestId: newId }, row));
    } catch (e) {
      failedLines.push(row.newDate + ' ' + row.newTime + '：' + (e.message || String(e)));
    }
  }

  btn.disabled = false; btn.textContent = '📤 送出申請';

  if (!created.length) {
    alert('送出失敗：\n' + failedLines.join('\n') + (failedLines.some(function (l) { return /request_type|constraint|check/i.test(l); }) ? '\n（可能是資料庫還沒支援「add_class」這個類型，請告訴 Lin/AI 到 Supabase 調整）' : '\n請直接聯絡老師比較保險。'));
    return;
  }

  // 2026-07-20 改：一次送出好幾筆時整合成「一則」通知給老師（見 notifyTeacherClassRequest 的
  // rows 參數），不用一筆一則轟炸老師的 LINE。單筆時維持原本的呼叫方式（rows 陣列長度 1 一樣適用）。
  notifyTeacherClassRequest({ type: 'add_class', name: studentName, token: token, note: note, rows: created });
  closeAddRequestModal();
  let doneMsg = '✅ 已送出 ' + created.length + ' 筆加課申請，老師確認沒有衝突後會安排進課表。';
  if (failedLines.length) doneMsg += '\n⚠️ 但有 ' + failedLines.length + ' 筆沒送出成功：\n' + failedLines.join('\n');
  alert(doneMsg);
  // 2026-07-31：เดิมไม่ได้รีเฟรชการ์ดสถานะเลย นักเรียนเพิ่งเห็น "✅ ส่งแล้ว" แต่การ์ด "⏳ 加課申請處理中"
  //   ไม่ขึ้นจนกว่าจะรีโหลดหน้าเอง = เหมือนคำขอหายไปไหนไม่รู้ · ทุกปุ่มอื่นของนักเรียนเรียกตัวนี้อยู่แล้ว
  loadStudentPendingRequestStatus(token);
}

// 2026-07-13 加：學生自己頁面看「目前送出的申請」狀態
//   - offer_status 空的 → 一般申請，還在等老師處理（顯示 48 小時倒數，純提醒不是硬性規定）
//   - offer_status = 'proposed' → 老師提議了新時間，讓學生直接在網頁上按「可以」/「不方便」
//     （跟 LINE 的按鈕做一樣的事，就算還沒連結 LINE 或漏掉 LINE 訊息，網頁上還是能回覆）
const REQUEST_SLA_HOURS = 48;
async function loadStudentPendingRequestStatus(token) {
  const el = document.getElementById('pendingRequestCard');
  let addEl = document.getElementById('pendingAddRequestCard');
  if (el) el.innerHTML = '';
  if (!addEl && el && el.parentNode) {
    addEl = document.createElement('div');
    addEl.id = 'pendingAddRequestCard';
    el.parentNode.insertBefore(addEl, el.nextSibling);
  }
  if (!addEl) return;
  try {
    const res = await studentFetchRequests(token, { requestType: 'add_class', status: 'pending', limit: 10 });
    if (res.error) throw res.error;
    const rows = res.rows.filter(function (x) {
      return x.request_type === 'add_class' && x.initiated_by !== 'teacher';
    });
    if (!rows.length) { addEl.innerHTML = ''; return; }
    const list = rows.map(function (x) {
      return '<div style="border-top:1px solid var(--border);padding-top:8px;margin-top:8px;">' +
        '<div style="font-size:0.85rem;color:var(--ink);font-family:\'Noto Sans TC\',sans-serif;">📅 ' +
        escHtml(x.requested_date || '-') + ' ' + escHtml(x.requested_time || '') + '（泰國時間）</div>' +
        '<button class="btn-sm" style="margin-top:6px;background:none;border:1px solid var(--border);color:#b45309;" onclick="studentWithdrawOwnAddRequest(\'' + token + '\',\'' + x.id + '\')">收回這筆</button>' +
      '</div>';
    }).join('');
    const left = rows[0].created_at ? (Date.now() - new Date(rows[0].created_at).getTime()) / 3600000 : null;
    const sla = left === null ? '' : left < REQUEST_SLA_HOURS
      ? '（建議 48 小時內處理，剩約 ' + Math.max(0, Math.round(REQUEST_SLA_HOURS - left)) + ' 小時）'
      : '（已超過 48 小時，建議直接用 LINE 提醒老師）';
    addEl.innerHTML = '<div class="card"><h2>⏳ 加課申請處理中（' + rows.length + ' 筆）</h2>' +
      '<p style="font-size:0.85rem;color:var(--ink-muted);font-family:\'Noto Sans TC\',sans-serif;">' + sla + '</p>' + list + '</div>';
  } catch (e) {
    console.error('載入加課申請失敗：', e && (e.message || e));
    addEl.innerHTML = '<div class="card">⚠️ 暫時無法讀取加課申請，請重新整理或用 LINE 聯絡老師。</div>';
  }
}

const LINE_NOTIFY_ENDPOINT = 'https://qzkxlhpcputsvbqmtqfi.supabase.co/functions/v1/notify-line';

// 2026-07-26 加（Lin 要求「แก้ถาวร」）：以前每個地方 LINE 通知失敗時，都只顯示
// 'LINE 回應 ' + res.status —— 但 notify-line 這個 Edge Function 內部不管真正是什麼原因
// 壞掉（LINE token 過期、payload 格式錯、LINE 自己臨時掛掉…），最後都統一回傳 HTTP 500，
// 所以老師畫面上看到的永遠是「LINE 回應 500」，完全看不出真正原因。
// 其實 notify-line 早就有把真正原因寫進回應 body 的 error 欄位（例如 "LINE API 401: ..."），
// 只是前端從來沒讀過 —— 這裡補上共用函式，統一讀出真正原因；讀不到（body 不是 JSON 等意外狀況）
// 才退回顯示狀態碼。之後任何地方要顯示 LINE 通知失敗原因，都呼叫這個函式，
// 不要再自己組 'LINE 回應 ' + res.status。
async function lineNotifyErrorText(res) {
  let detail = '';
  try {
    const j = await res.json();
    if (j && j.error) detail = String(j.error);
  } catch (_e) { /* body 不是 JSON 或讀取失敗 → 退回用狀態碼 */ }
  const base = detail || ('LINE 回應 ' + res.status);
  // 401 這個狀態碼在我們自己的 notify-line 裡，只有「呼叫的人不是登入中的老師本人」這一種原因
  // 會直接回（session 過期最常見），跟 LINE 自己回的錯誤不會混在一起 → 這個備註還是準的。
  return res.status === 401 ? (base + '（老師登入可能已過期）') : base;
}

// 2026-07-20 改（Lin 要求：學生一次送出好幾筆加課申請，要整合成「一則」通知給老師，不要
// 一筆一則轟炸 LINE）：加一個 d.rows（陣列，每個 { requestId, newDate, newTime, recurring, untilVal }）
// 參數，isAdd 時如果有帶 rows 就走「多筆整合」文案/按鈕，沒帶就照舊維持單筆版本的行為不變
// （d.requestId/d.requestedDate/d.requestedTime）——目前唯一呼叫點（submitAddRequest）
// 已經改成一律帶 rows（就算只有 1 筆也是 rows.length===1），舊的單筆分支保留當防呆備援。
function notifyTeacherClassRequest(d) {
  if (!d || d.type !== 'add_class') return;
  try {
    var addRows = Array.isArray(d.rows) && d.rows.length ? d.rows : null;
    var subject = '➕ 學生申請加課' + (addRows && addRows.length > 1 ? '（' + addRows.length + ' 個時段）' : '') + ' — ' + (d.name || '學生');
    var calDateStr = addRows ? (addRows.length === 1 ? addRows[0].newDate : null) : (d.requestedDate || d.originalDate);
    var calLink = null;
    if (calDateStr && /^\d{4}-\d{2}-\d{2}/.test(calDateStr)) {
      var parts = calDateStr.split('-');
      calLink = 'https://calendar.google.com/calendar/r/day/' + parseInt(parts[0], 10) + '/' + parseInt(parts[1], 10) + '/' + parseInt(parts[2], 10);
    }
    var siteLinkId = (addRows && addRows[0] && addRows[0].requestId) || d.requestId;
    var siteLink = 'https://www.mrtaihualin.com/classroom/' + (siteLinkId ? ('#req-row-' + encodeURIComponent(siteLinkId)) : '');
    var addRowsText = addRows ? addRows.map(function (r, i) {
      var label = (r.newDate || '-') + (r.newTime ? ' ' + r.newTime : '');
      var recur = r.recurring ? '（每週固定' + (r.untilVal ? '，固定到 ' + r.untilVal : '，沒有結束日') + '）' : '';
      return (addRows.length > 1 ? (i + 1) + '. ' : '') + label + recur;
    }).join('\n') : null;
    var message = '學生：' + (d.name || '-') + '\n類型：申請加課'
      + (addRows ? ('\n想約：\n' + addRowsText) : ('\n想約：' + (d.requestedDate || '-') + (d.requestedTime ? ' ' + d.requestedTime : '')))
      + (d.note ? '\n備註：' + d.note : '')
      + (calLink ? ('\n\n🔗 點此開 Google Calendar：' + calLink) : '')
      + '\n\n請直接到網站處理：' + siteLink
      + '（在加課申請卡片按「📅 開始安排」確認沒有衝突後排進課表）';

    function sendEmailFallback() {
      fetch('https://api.web3forms.com/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({ access_key: 'b3bfdb97-19dd-4910-bd15-89720be846c2', subject: subject, from_name: '線上教室系統', message: message })
      }).catch(function(){});
    }

    var flexRows = [];
    var flexButtons = [];
    if (addRows) {
      addRows.forEach(function (r) {
        flexRows.push({ label: (r.newDate || '-') + ' ' + (r.newTime || ''), buttons: [
          { label: '查衝突', postbackData: 'action=check_conflict&request=' + encodeURIComponent(r.requestId) },
          { label: '確認新增', postbackData: 'action=confirm_add_class&request=' + encodeURIComponent(r.requestId), style: 'primary' },
        ] });
      });
      flexButtons.push(contactStudentPostbackButton(d.token));
    } else if (d.requestId) {
      flexRows.push({ label: (d.requestedDate || '-') + ' ' + (d.requestedTime || ''), buttons: [
        { label: '查衝突', postbackData: 'action=check_conflict&request=' + encodeURIComponent(d.requestId) },
        { label: '確認新增', postbackData: 'action=confirm_add_class&request=' + encodeURIComponent(d.requestId), style: 'primary' },
      ] });
      flexButtons.push(contactStudentPostbackButton(d.token));
    }
    var flexBodyText = addRows ? addRowsText : ((d.requestedDate || '-') + (d.requestedTime ? ' ' + d.requestedTime : ''));
    if (d.note) flexBodyText += '\n備註：' + d.note;
    fetch(LINE_NOTIFY_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': window.SUPABASE_CONFIG.anonKey,
        'Authorization': 'Bearer ' + window.SUPABASE_CONFIG.anonKey
      },
      body: JSON.stringify({
        to: 'teacher', fromStudentToken: d.token || null,
        message: subject + '\n\n' + message,
        flex: { title: subject, bodyText: flexBodyText, rows: flexRows, buttons: flexButtons }
      })
    }).then(function (r) {
      if (!r.ok) sendEmailFallback();
    }).catch(function () { sendEmailFallback(); });
  } catch (e) {}
}

async function loadStudentRecordings(token){
  if(!token) return;
  // อ่านผ่าน RPC (ต้องรู้ token ถึงดึงได้) — anon อ่านตารางตรงๆ ไม่ได้ กันกวาดลิงก์ทั้งหมด
  const { data, error } = await sb.rpc('get_student_recordings', { p_token: token });
  if(error || !data || !data.length) return;
  const card=document.getElementById('recReplayCard');
  const list=document.getElementById('recReplayList');
  if(!card||!list) return;
  list.innerHTML=data.map(function(r){
    var d=r.created_at? new Date(r.created_at).toLocaleString('zh-TW',{dateStyle:'medium',timeStyle:'short'}) : '';
    var sz=r.size_mb? ('（'+r.size_mb+' MB）') : '';
    return '<a class="meet-btn" style="margin-bottom:8px;" href="'+escHtml(safeHref(r.url))+'" target="_blank" rel="noopener">▶️ '+escHtml(d)+' 的課堂錄影 '+escHtml(sz)+'</a>';
  }).join('');
  card.style.display='';
}
