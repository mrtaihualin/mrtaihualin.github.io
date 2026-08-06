// ============================================================
// 學生：下一堂課（唯讀，資料來自老師端同步的 Google Calendar）
// 2026-07-06 新增：只顯示，學生不能自己改課表本身；要改期/取消 → 送「申請」給老師，
// 老師收到通知後自己去 Google Calendar 手動調整（系統不會自動改老師的行事曆）
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
let nextClassCtx = null; // 目前顯示中的下一堂課資訊，給申請改期/取消用

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
      // 2026-07-22 改（Lin 要求）：主按鈕列拿掉「💬 聯絡老師」——學生本來就是從 LINE 點進這個網站的，
      // 不需要再一顆按鈕跳回去（其他真的必要的地方，例如 24 小時內無法線上取消/老師提議的時間都不方便，
      // 那種「非聯絡老師不可」的情境還是保留這顆按鈕，只有這排常駐主按鈕拿掉）。
      el.innerHTML = '<div style="color:var(--ink-muted);font-family:\'Noto Sans TC\',sans-serif;font-size:0.85rem;">目前沒有排定下一堂課，如需安排請聯絡老師，或直接送出「申請加課」。</div>' +
        '<div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-start;margin-top:10px;">' +
          '<button class="btn-sm" id="courseRecordToggleBtn" style="background:linear-gradient(135deg,var(--gold-bright) 0%,var(--gold) 50%,var(--gold-deep) 100%);color:#fff;" onclick="toggleCourseRecordPanel()">📅 我的課程記錄 ▼</button>' +
          '<button class="btn-sm" style="background:linear-gradient(135deg,var(--gold-bright) 0%,var(--gold) 50%,var(--gold-deep) 100%);color:#fff;" onclick="openAddRequestModal(\'' + token + '\')">➕ 申請加課</button>' +
        '</div>';
      nextClassCtx = null;
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
    // 🟢 2026-08-01（audit #14）：以前這裡不管有沒有真的知道上課時間，一律用 00:00 代入算「剩幾小時」——
    //   結果比實際情況「更嚴格」（例如真正 21:00 的課被當成 00:00 開始，算出來剩的時數少了 21 小時，
    //   導致明明還來得及線上取消的課被擋掉）。現在跟「選擇要取消的課堂」清單（งาน C9，同一天稍早改的）
    //   用同一套邏輯：不知道時間就是不知道，不能拿 00:00 冒充，也不能拿它去判斷是否<24小時。
    var timeUnknown = !startTimeStr;
    const hoursUntil = timeUnknown ? null : (teacherTimeToDate(lessonDate, startTimeStr).getTime() - Date.now()) / 3600000;
    const canCancel = !timeUnknown && hoursUntil >= 24;
    // 2026-07-14：多存一份 timeStr（泰國時間 HH:MM），讓「選擇要取消的課堂」清單可以直接
    // 沿用這裡已經算好、且已經成功顯示在畫面上的下一堂課時間，不用另外重新算一次。
    // 🟢 2026-08-01（audit #14）：加 hasTime 旗標（純新增，不動 timeStr 原本的值/預設值，
    //   避免影響「申請改期」等其他讀 nextClassCtx.timeStr 的地方）。
    nextClassCtx = { token: token, isoDate: lessonDate, timeStr: startTimeStr || '00:00', hasTime: !timeUnknown };

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
        '<button class="btn-sm" style="background:linear-gradient(135deg,var(--gold-bright) 0%,var(--gold) 50%,var(--gold-deep) 100%);color:#fff;" onclick="openCancelPickerModal()">❌ 取消課堂</button>' +
        '<button class="btn-sm" style="background:linear-gradient(135deg,var(--gold-bright) 0%,var(--gold) 50%,var(--gold-deep) 100%);color:#fff;" onclick="openReschedulePickerModal()">🔄 申請改期</button>' +
        '<button class="btn-sm" style="background:linear-gradient(135deg,var(--gold-bright) 0%,var(--gold) 50%,var(--gold-deep) 100%);color:#fff;" onclick="openAddRequestModal(\'' + token + '\')">➕ 申請加課</button>' +
        (canCancel ? '' : '<div style="width:100%;font-size:0.78rem;color:var(--amber);font-family:\'Noto Sans TC\',sans-serif;margin-top:2px;">'
          // 🟢 2026-08-01（audit #14）：時間不明 vs 不到 24 小時，是兩種不同情況，訊息要分開講清楚，
          //   不要都寫成「不到 24 小時」（那句話在時間不明的情況下是編出來的，系統其實根本不知道）。
          + (timeUnknown
            ? '⚠️ 這堂課系統裡沒有記錄上課時間，沒辦法自動判斷，請直接聯絡老師'
            : '⚠️ 最近這一堂距離上課不到 24 小時，無法線上取消（其他週的課仍可在「❌ 取消課堂」裡選）')
          + '</div>') +
      '</div>';
  } catch (e) {
    el.innerHTML = '<div style="color:var(--ink-muted);font-family:\'Noto Sans TC\',sans-serif;font-size:0.85rem;">載入失敗：' + (e.message || e) + '</div>';
  }
}

// 2026-07-13 加：申請改期/取消前，一定要先連結 LINE（老師處理完/提議新時間都要用 LINE 通知學生回覆）
function requireLineLinkedOrPrompt(token) {
  var s = studentsCache[token];
  if (s && s.line_user_id) return true;
  if (confirm('申請改期/取消前，需要先連結 LINE 帳號（老師才能用 LINE 通知你處理結果、或提議新時間讓你回覆）。\n現在就去連結嗎？')) {
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
    return '這堂課距離上課不到 24 小時，沒辦法線上取消。\n你可以改用「🔄 申請改期」，或直接聯絡老師。';
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
async function requestCancelClass(isoDate, calendarEventId, timeStr) {
  if (!nextClassCtx) return;
  const targetDate = isoDate || nextClassCtx.isoDate;
  if (!requireLineLinkedOrPrompt(nextClassCtx.token)) return;
  if (!confirm('確定要送出「申請取消 ' + targetDate + ' 這堂課」給老師嗎？\n（老師確認後才算真的取消，請耐心等候回覆）')) return;
  // 2026-07-14 修正：改用既有的 currentStudentName()（2026-07-08 就修過同一個 bug 的共用函式），
  // 之前這裡沒用到，只信網址參數 n，沒帶 n 的連結會送出空白姓名，老師端顯示「-」
  const studentName = currentStudentName(nextClassCtx.token);
  const res = await sb.rpc('submit_class_request', {
    p_token: nextClassCtx.token,
    p_student_name: studentName,
    p_request_type: 'cancel',
    p_original_date: targetDate,
    p_requested_date: null,
    p_requested_time: null,
    p_note: null,
    // 2026-07-14 加：資料庫裡 submit_class_request 現在有兩個版本（一個有 p_initiated_by
    // 一個沒有），沒帶這個參數會讓 Postgres 分不出要用哪一個（"Could not choose the best
    // candidate function"）送出失敗。老師端呼叫時都有帶 p_initiated_by:'teacher'，
    // 學生端這裡也要帶（'student'），兩邊都明確帶才不會撞到這個問題。
    p_initiated_by: 'student',
    // 🔴 2026-07-30 加（สำคัญมาก）：ฐานข้อมูล (supabase/sql/2026-07-30_submit_class_request_consolidated.sql)
    // เพิ่มกฎ "นักเรียนยกเลิกเองได้เฉพาะตอนเหลือเวลา 24 ชม.ขึ้นไป" ซึ่งต้องรู้ "คาบเริ่มกี่โมง" ถึงจะนับได้
    // ถ้าไม่ส่งค่านี้ไป ฐานข้อมูลจะตอบ error 'missing original_time...' = นักเรียนกดยกเลิกไม่ได้เลยสักคน
    // (ครูไม่โดนด่านนี้ ยกเลิกได้ตลอดเหมือนเดิม)
    // ⚠️ ต้องมาจาก "คาบเดียวกัน" กับ p_original_date เสมอ — ถ้ามี isoDate แต่ไม่มี timeStr
    // ห้ามเอาเวลาของ "คาบถัดไป" มาใช้แทนเด็ดขาด (คนละคาบกัน ด่าน 24 ชม.จะคำนวณจากเวลาผิด)
    p_original_time: timeStr || (isoDate ? null : (nextClassCtx && nextClassCtx.timeStr) || null),
  });
  // 🟡 2026-07-31 แก้（งาน C12）：แปลง error ที่รู้จักเป็นภาษาจีนก่อนโชว์ให้นักเรียน
  if (res.error) {
    var friendlySubmit = friendlyRequestError(res.error.message);
    alert(friendlySubmit ? ('⚠️ ' + friendlySubmit) : ('送出失敗：' + res.error.message + '\n請直接聯絡老師比較保險。'));
    return;
  }
  if (typeof gtag === 'function') gtag('event', 'class_request_submitted', { category: 'course', request_type: 'cancel' });
  // 2026-07-16 加：submit_class_request 這個 RPC 目前不收 calendar_event_id 參數（不想動資料庫
  // 函式本身，風險比較低），改成插入成功後馬上補一個 update 把真正的事件 ID 存上去。
  // 存不成功也不擋這次申請（老師那邊會退回舊版「姓名+日期」搜尋），只在主控台留紀錄。
  const extraFields1 = {};
  if (calendarEventId) extraFields1.calendar_event_id = calendarEventId;
  // 2026-07-31 拿掉（งาน C14 後續）：original_time 已經在上面 submit_class_request 送出的
  // p_original_time 裡了，資料庫（2026-07-31_store_original_time_on_insert.sql）現在會直接存進
  // classroom_requests，不用這裡再補一次相同的值——少一個補存失敗點。
  // 2026-07-19 修正（就是這個 bug）：舊版用 sb.from(...).update(...) 直接補存，
  // 被 RLS 靜靜擋掉「更新 0 筆」且不回 error → calendar_event_id 永遠是 null，
  // 老師按 LINE 的「✅ 確認並刪除課程」就會跳「這筆沒有記錄 Calendar 事件 ID」。
  // 改走 RPC，並且真的檢查有沒有存進去（rows.length），失敗就大聲講，不再吞掉。
  let backfillOk = true;
  if (Object.keys(extraFields1).length && res.data) {
    const idRes = await studentPatchRequest(nextClassCtx.token, res.data, extraFields1, {});
    if (idRes.error || !idRes.rows.length) {
      backfillOk = false;
      console.error('⚠️ 補存 calendar_event_id 失敗：', idRes.error ? idRes.error.message : '更新 0 筆（token 對不上或該筆不存在）');
    }
  }
  // 2026-07-16 加：把這筆申請的 id 一起帶給 notifyTeacherClassRequest，
  // 讓 LINE 通知裡的按鈕可以直接連到網站上這一筆卡片的位置（#req-row-<id>）。
  notifyTeacherClassRequest({ type: 'cancel', name: studentName, token: nextClassCtx.token, originalDate: targetDate, originalTime: timeStr, requestId: res.data });
  closeCancelPickerModal();
  // 2026-07-19 加（照 CLAUDE.md 規則 12：沒確認成功就不准顯示「成功」）：
  // 申請本身確實送出去了（RPC 成功），但如果事件 ID 沒補存成功，老師端要多花工夫確認，
  // 所以老實跟學生講一句，不要假裝一切完美。
  alert(backfillOk
    ? '✅ 已送出取消申請，老師確認後會回覆你。'
    : '✅ 已送出取消申請，老師確認後會回覆你。\n（系統備註：這筆需要老師手動核對課堂，處理可能稍慢一點）');
}

// 2026-07-14 新增（Lin 要求）：算出「未來還有哪幾堂課」，讓學生可以選其他週的課來取消，
// 不是只能取消最近下一堂。
// 2026-07-15 改版（Lin 要求：一定要「對到真的課堂」+「照真實剩餘堂數」）：
//   舊版只會「+7 天」一直往後推，假設每個人只有 1 個固定星期幾 —— 學生一週上好幾天課
//   （例如週五+週一都上）就會漏掉其中一天，甚至猜出根本沒有課的那一天。
//   新版改成直接讀 classroom_schedule（get_student_schedule RPC，來源＝真的 Google Calendar
//   同步下來的資料，2026-07-15 已經改成同步未來 SCHEDULE_SYNC_DAYS=30 天），有幾堂就是幾堂，
//   不用猜。再用 computeCurrentCourse（跟「本輪剩餘 X 堂」同一套算法）算出真實剩餘堂數，
//   把清單裁到剩餘堂數以內，不會讓學生選到「已經上完」的課。
//   RPC 讀不到資料時（例如剛好還沒 sync）→ 退回舊版「+7 天」邏輯當保底，至少不會整個空白。
// 2026-07-16 改（Lin 要求：取消要對到真的 Calendar 事件 ID，不要事後用「姓名+日期」用猜的）：
// 回傳值從單純 Date[] 改成 {date, calendarEventId}[]，calendarEventId 有值就是「這一堂真正
// 對應的 Google Calendar 事件 ID」，之後老師端可以直接用這個 ID 刪/搬，不用再搜尋比對。
// ⚠️ 前提：get_student_schedule 這個 RPC 要有回傳 calendar_event_id 欄位（classroom_schedule
// 資料表本來就有這欄）。如果 RPC 目前的 SELECT 清單沒帶到，這裡會拿到 undefined → calendarEventId
// 變成 null，不會壞掉，但也享受不到這次改的好處，記得跟 Lin 確認/更新那個 RPC。
async function computeUpcomingOccurrences(token, count) {
  try {
    const { data, error } = await sb.rpc('get_student_schedule', { p_token: token });
    if (error) throw error;
    let rows = (data || []).filter(function(r) { return r.lesson_date; });
    if (!rows.length) throw new Error('no rows'); // ยังไม่ sync ข้อมูล → ไปใช้ fallback ด้านล่าง
    var limit = count || rows.length;
    try {
      var pays = (await sb.rpc('get_student_payments', { p_token: token })).data || [];
      var atts = (await sb.rpc('get_student_attendance', { p_token: token })).data || [];
      var q = computeCurrentCourse(pays, atts);
      if (q.hasCourse) limit = Math.min(count || q.remain, q.remain < 0 ? 0 : q.remain);
    } catch (qerr) { /* เช็คโควตาไม่ได้ก็ไม่บล็อก แค่ใช้ count เดิมเป็น cap */ }
    var sliced = rows.slice(0, limit);
    if (sliced.length && sliced.every(function(r) { return !r.calendar_event_id; })) {
      console.warn('⚠️ get_student_schedule 沒有回傳 calendar_event_id，取消申請會退回用姓名+日期比對（不夠準），請跟 Lin 確認這個 RPC 的 SELECT 欄位。');
    }
    return sliced.map(function(r) {
      // 🟡 2026-07-31 แก้（งาน C9）：เดิมคาบที่ "ไม่มีเวลาเริ่ม" ถูกเดาเป็น 00:00 แล้วเอาไปคิดเป็นเวลาจริง
      //   พังพร้อมกัน 3 อย่าง: (1) จอโชว์คาบตอนเที่ยงคืน (2) การนับ 24 ชม.คิดจากเที่ยงคืน =
      //   "เข้มกว่าความจริง" (คาบ 21:00 ถูกมองว่าเริ่มเร็วขึ้น 21 ชม. → คาบที่ยกเลิกได้จริงกลับโดนปฏิเสธ)
      //   (3) ข้อความที่นักเรียนได้เขียนเวลาผิดเป็น 00:00
      //   ตอนนี้: ติดธง hasTime ไว้ แล้วให้ปลายทางซ่อนปุ่มยกเลิกออนไลน์ของแถวนั้นไปเลย ดีกว่าเดา
      var hasTime = !!(r.start_time && /^\d{1,2}:\d{2}/.test(r.start_time));
      var t = hasTime ? r.start_time : '00:00';
      return { date: teacherTimeToDate(r.lesson_date, t), calendarEventId: r.calendar_event_id || null, hasTime: hasTime };
    });
  } catch (e) {
    // Fallback：ข้อมูลจริงยังดึงไม่ได้ (RPC พัง/ยังไม่ sync) → ใช้วิธีเดิม (+7 วันจากคาบเดียว)
    // ดีกว่าไม่มีอะไรให้เลือกเลย แต่รู้ตัวว่าไม่แม่นสำหรับคนเรียนหลายวัน/สัปดาห์ ไม่มี calendarEventId ให้
    if (!nextClassCtx || nextClassCtx.token !== token || !nextClassCtx.isoDate) return [];
    const anchor1 = teacherTimeToDate(nextClassCtx.isoDate, nextClassCtx.timeStr || '00:00');
    // 🟢 2026-08-01（audit #14）：這裡是「RPC 整個讀不到才會用到」的備援清單，本來沒有帶 hasTime，
    //   如果剛好又遇到「這堂課時間本來就不明」，選單那邊（onCancelPickerSelectChange，งาน C9 加的）
    //   會因為看不到 hasTime 而誤判成「知道時間」，讓人送出一筆時間是編出來的取消申請。
    //   補上 hasTime，跟主要路徑（上面 5801-5803 那段）用同一個旗標，行為才會一致。
    var fallbackHasTime = nextClassCtx.hasTime !== false;
    const results = [{ date: anchor1, calendarEventId: null, hasTime: fallbackHasTime }];
    const s = studentsCache[token];
    if (s && s.pending_recurring && s.pending_start_date && s.pending_class_time) {
      const weekMs = 7 * 24 * 3600 * 1000;
      let cur = new Date(anchor1.getTime() + weekMs);
      for (let i = 1; i < (count || 6); i++) {
        results.push({ date: cur, calendarEventId: null, hasTime: fallbackHasTime });
        cur = new Date(cur.getTime() + weekMs);
      }
    }
    return results;
  }
}

// 2026-07-14 改（Lin 要求）：老師端選課堂已經是「下拉選單」（見 pickLessonModal/
// openPickLessonModal），學生端這裡改成同一種體驗，不要用一排排按鈕的清單。
var _cancelPickerOptions = [];
// 2026-07-16 加：學生「改選課堂」自己已送出的取消申請時用——不是 null 就代表現在是
// 「編輯模式」，送出時要改成更新同一筆申請（editCancelRequestChoice），不是新建一筆。
var _cancelPickerEditRequestId = null;

async function openCancelPickerModal() {
  if (!nextClassCtx) return;
  if (!requireLineLinkedOrPrompt(nextClassCtx.token)) return;
  document.getElementById('cancelPickerModal').classList.add('open');
  await renderCancelPickerSelect();
}

// 2026-07-16 加：學生對自己已送出、老師還沒處理的取消申請按「✏️ 改選課堂」——
// 重用同一個下拉選單 modal，只是設一個旗標讓送出時改成「更新」而不是「新建」。
async function openEditCancelRequestPicker(id) {
  if (!nextClassCtx) return;
  if (!requireLineLinkedOrPrompt(nextClassCtx.token)) return;
  _cancelPickerEditRequestId = id;
  document.getElementById('cancelPickerModal').classList.add('open');
  await renderCancelPickerSelect();
}

function closeCancelPickerModal() {
  document.getElementById('cancelPickerModal').classList.remove('open');
  _cancelPickerEditRequestId = null; // 關閉就重設，下次打開預設都是「新建」模式
}

async function renderCancelPickerSelect() {
  const sel = document.getElementById('cancelPickerSelect');
  if (!nextClassCtx || !sel) return;
  const token = nextClassCtx.token;
  const s = studentsCache[token];
  const studentTz = s && s.pending_student_tz;
  sel.innerHTML = '<option value="">讀取中…</option>';
  // 2026-07-17 改（Lin 要求）：以前這裡寫死只列 6 堂，跟老師端「選擇要取消的課堂」（列到本輪剩餘堂數）
  // 不一致，學生自己取消看起來選項比老師少很多、很奇怪。改成不傳 count，讓 computeUpcomingOccurrences
  // 用本輪實際剩餘堂數當上限（q.remain），沒有課程資料時退回原本的保底行為（不會壞掉）。
  const occurrences = await computeUpcomingOccurrences(token);
  _cancelPickerOptions = occurrences;
  if (!occurrences.length) {
    sel.innerHTML = '<option value="">目前沒有排定的課堂</option>';
    onCancelPickerSelectChange();
    return;
  }
  const dayZh = ['日','一','二','三','四','五','六'];
  sel.innerHTML = occurrences.map(function(occ, i) {
    const disp = studentTz ? formatInTz(occ.date, studentTz) : formatInTz(occ.date, TEACHER_TZ); // 學生自己時區 → 顯示用
    const d = new Date(disp.dateStr + 'T00:00:00');
    // 🟡 2026-07-31（งาน C9）：คาบที่ไม่มีเวลาเริ่ม ห้ามโชว์ 00:00 หลอกตา — บอกตรงๆ ว่าไม่รู้เวลา
    const label = (d.getMonth()+1) + '月' + d.getDate() + '日（週' + dayZh[d.getDay()] + '）'
      + (occ.hasTime === false ? '（時間未知）' : disp.timeStr);
    return '<option value="' + i + '">' + escHtml(label) + '</option>';
  }).join('');
  onCancelPickerSelectChange();
}

// 選單換選項 → 即時判斷這一堂是否 >24 小時，不能取消就換成「聯絡老師」按鈕，不讓送出。
function onCancelPickerSelectChange() {
  const sel = document.getElementById('cancelPickerSelect');
  const hint = document.getElementById('cancelPickerHint');
  const submitBtn = document.getElementById('cancelPickerSubmitBtn');
  const contactBtn = document.getElementById('cancelPickerContactBtn');
  const chosen = _cancelPickerOptions[sel.value];
  if (!chosen) {
    hint.style.display = 'none';
    submitBtn.style.display = 'none';
    contactBtn.style.display = 'none';
    return;
  }
  // 🟡 2026-07-31 แก้（งาน C9）：คาบที่ไม่รู้เวลาเริ่ม ห้ามให้ยกเลิกออนไลน์
  //   เพราะถ้าปล่อยผ่าน จะส่งคำขอที่ไม่มีเวลา → ฐานข้อมูลคำนวณ 24 ชม.ไม่ได้ (จะตีกลับเป็น error อังกฤษ)
  //   และข้อความที่นักเรียนได้รับจะเขียนเวลาผิด → ให้ไปคุยกับครูโดยตรงแทน ชัดเจนกว่า
  const hoursUntil = (chosen.date.getTime() - Date.now()) / 3600000;
  const timeUnknown = chosen.hasTime === false;
  const canCancel = !timeUnknown && hoursUntil >= 24;
  hint.style.display = canCancel ? 'none' : 'block';
  hint.textContent = canCancel ? ''
    : timeUnknown
      ? '⚠️ 這堂課系統裡沒有記錄上課時間，沒辦法自動判斷，請直接聯絡老師取消'
      : '⚠️ 這堂距離上課不到 24 小時，無法線上取消，請直接聯絡老師';
  submitBtn.style.display = canCancel ? '' : 'none';
  contactBtn.style.display = canCancel ? 'none' : '';
  contactBtn.href = LINE_OA_URL;
}

function submitCancelPickerChoice() {
  const sel = document.getElementById('cancelPickerSelect');
  const chosen = _cancelPickerOptions[sel.value];
  if (!chosen) return;
  const thai = formatInTz(chosen.date, TEACHER_TZ); // 泰國時間 → 送給老師/資料庫用
  if (_cancelPickerEditRequestId) {
    editCancelRequestChoice(_cancelPickerEditRequestId, thai.dateStr, chosen.calendarEventId, thai.timeStr);
  } else {
    requestCancelClass(thai.dateStr, chosen.calendarEventId, thai.timeStr);
  }
}

// 2026-07-16 加：學生改選另一堂課取消（不是重新送出新的一筆，是更新同一筆申請）——
// 跟老師端 teacherEditOwnCancelRequest_chosen 同樣邏輯，只是這裡是學生改自己的，
// 通知對象換成老師。用 .eq('status','pending') 當保險閘：如果老師剛好在這一刻已經
// 處理完了，這裡就會抓不到（count=0），要老實跟學生講來不及改了。
async function editCancelRequestChoice(id, isoDate, calendarEventId, timeStr) {
  if (!nextClassCtx) return;
  const token = nextClassCtx.token;
  if (!confirm('確定要改成申請取消 ' + isoDate + ' 這一堂嗎？（會重新通知老師）')) return;
  const studentName = currentStudentName(token);
  const updateFields = { original_date: isoDate };
  if (calendarEventId) updateFields.calendar_event_id = calendarEventId;
  if (timeStr) updateFields.original_time = timeStr;
  // 2026-07-19 改：直接 update 會被 RLS 擋掉（見 studentPatchRequest 的說明），改走 RPC
  // 🟠 2026-08-01 เพิ่ม notProcessing (ตรวจระบบยกเลิก/เพิ่มคาบ ข้อ 8):
  //   เดิมขาดด่านนี้ ทั้งที่ปุ่มถอนคำขอข้างๆ (studentWithdrawOwnRequest / studentWithdrawOwnAddRequest)
  //   มีครบทั้งคู่ — และเคสนี้เกิดจากการใช้งานปกติ ไม่ต้องมีใครแฮ็ก:
  //   ครูกด ✅ 處理 ระบบจับล็อกแล้วกำลังคุยกับ Google อยู่ → นักเรียนกด ✏️ 改選課堂 เปลี่ยนไปคาบอื่นพอดี
  //   → ครูลบ "คาบ A" ไปแล้วจริง แต่คำขอในฐานข้อมูลกลายเป็น "คาบ B" และนักเรียนเห็นว่า "✅ 已更新"
  //   = คาบผิดหายไป 1 คาบ โดยทั้ง 2 ฝ่ายเข้าใจคนละเรื่อง
  const res = await studentPatchRequest(token, id, updateFields, { status: 'pending', notProcessing: true });
  // 🟡 2026-07-31 แก้（งาน C12）：จุดนี้คือที่ด่านใหม่ของงาน C1 จะตีกลับมา ต้องแปลงเป็นภาษาคน
  if (res.error) {
    var friendlyEdit = friendlyRequestError(res.error.message);
    alert(friendlyEdit ? ('⚠️ ' + friendlyEdit) : ('⚠️ 更新失敗：' + res.error.message + '\n請直接聯絡老師比較保險。'));
    return;
  }
  if (!res.rows.length) {
    alert('ℹ️ 更新失敗，這筆申請可能已經被老師處理了，重新整理頁面看看。');
    closeCancelPickerModal();
    loadStudentPendingRequestStatus(token);
    return;
  }
  notifyTeacherClassRequest({ type: 'cancel', name: studentName, token: token, originalDate: isoDate, originalTime: timeStr, requestId: id });
  closeCancelPickerModal();
  alert('✅ 已更新，老師確認後會回覆你。');
  loadStudentPendingRequestStatus(token);
}

// 2026-07-16 加：學生收回自己送出、老師還沒處理的取消申請——跟老師端
// teacherWithdrawOwnCancelRequest 同樣邏輯，角色對調，Calendar 本來就還沒被動過，
// 收回不用管 Calendar。用 .eq('status','pending') 當保險閘，防止跟老師處理的動作互相競爭。
// 2026-07-30 加（稽核發現）：คำขอ "เพิ่มคาบ" ที่นักเรียนส่งเอง เดิมถอนเองไม่ได้เลย ต้องรบกวนครู
// ใช้ท่าเดียวกับ studentWithdrawOwnRequest ทุกอย่าง (รวมด่านกันชนกับตอนครูกำลังจัดการอยู่)
// ต่างแค่ข้อความ เพราะ "ไม่เพิ่มคาบแล้ว" คนละความหมายกับ "ไม่ยกเลิกคาบแล้ว"
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

async function studentWithdrawOwnRequest(token, id) {
  if (!confirm('確定要收回這個取消申請嗎？（等於不取消了，這堂課維持原本安排）')) return;
  // 2026-07-19 加（稽核 ORANGE：學生收回 vs 老師刪除 Calendar 撞期）：多加 .is('processing_started_at', null)
  // 當第二道閘——如果老師剛好已經搶到鎖、正在動 Calendar 的路上（見 claimRequestForProcessing），
  // 這裡就不能悄悄收回成功，不然畫面會顯示「收回成功」但 Calendar 其實已經被刪掉了。
  // 2026-07-19 改：直接 update 會被 RLS 擋掉（見 studentPatchRequest 的說明），改走 RPC
  const res = await studentPatchRequest(token, id, { status: 'acknowledged' }, { status: 'pending', notProcessing: true });
  if (res.error) { alert('⚠️ 收回失敗：' + res.error.message); return; }
  if (!res.rows.length) {
    alert('ℹ️ 收回失敗——老師可能正在處理中，或剛好已經處理完了，請直接用 LINE 聯絡老師確認狀況。');
    loadStudentPendingRequestStatus(token);
    return;
  }
  alert('✅ 已收回，這堂課不會被取消');
  loadStudentPendingRequestStatus(token);
}

// ════════════════════════════════════════════════════════════
// 2026-07-16 稽核後新增（ORANGE#6）：申請改期先選「要改哪一堂」，跟取消申請一樣可以挑好幾週的課，
// 不再只能挑「下一堂課」。選好之後才進到既有的「填新時間（最多 3 選項）」那一步（classRequestModal）。
// ════════════════════════════════════════════════════════════
var _reschedulePickerOptions = [];
// 選好要改期的那一堂之後，記下來給 submitClassRequest 用：{isoDate, time, calendarEventId}
var _rescheduleChosenOccurrence = null;

async function openReschedulePickerModal() {
  if (!nextClassCtx) return;
  if (!requireLineLinkedOrPrompt(nextClassCtx.token)) return;
  document.getElementById('reschedulePickerModal').classList.add('open');
  await renderReschedulePickerSelect();
}

function closeReschedulePickerModal() {
  document.getElementById('reschedulePickerModal').classList.remove('open');
}

async function renderReschedulePickerSelect() {
  const sel = document.getElementById('reschedulePickerSelect');
  if (!nextClassCtx || !sel) return;
  const token = nextClassCtx.token;
  const s = studentsCache[token];
  const studentTz = s && s.pending_student_tz;
  sel.innerHTML = '<option value="">讀取中…</option>';
  // 2026-07-16：跟取消申請共用同一個 computeUpcomingOccurrences，一樣可以列出未來好幾堂，
  // 也一樣拿得到 calendarEventId（讓老師端可以直接用 ID 搬 Calendar，不用姓名+日期用猜的）。
  // 2026-07-17 改（Lin 要求）：不寫死 6 堂了，改用本輪實際剩餘堂數當上限，跟取消申請那邊一致。
  const occurrences = await computeUpcomingOccurrences(token);
  _reschedulePickerOptions = occurrences;
  const nextBtn = document.getElementById('reschedulePickerNextBtn');
  if (!occurrences.length) {
    sel.innerHTML = '<option value="">目前沒有排定的課堂</option>';
    if (nextBtn) nextBtn.disabled = true;
    // 2026-08-01：ต้องล้างข้อความเตือนของรอบก่อนด้วย ไม่งั้นค้างบนจอทั้งที่ไม่มีคาบให้เลือกแล้ว
    var hintEmpty = document.getElementById('reschedulePickerHint');
    if (hintEmpty) { hintEmpty.style.display = 'none'; hintEmpty.textContent = ''; }
    return;
  }
  if (nextBtn) nextBtn.disabled = false;
  const dayZh = ['日','一','二','三','四','五','六'];
  sel.innerHTML = occurrences.map(function(occ, i) {
    const disp = studentTz ? formatInTz(occ.date, studentTz) : formatInTz(occ.date, TEACHER_TZ);
    const d = new Date(disp.dateStr + 'T00:00:00');
    // 🔴 2026-08-01（audit ข้อ A5）：คาบที่ไม่รู้เวลาเริ่ม ห้ามโชว์ 00:00 หลอกตา — ท่าเดียวกับ picker ของการยกเลิก
    const label = (d.getMonth()+1) + '月' + d.getDate() + '日（週' + dayZh[d.getDay()] + '）'
      + (occ.hasTime === false ? '（時間未知）' : disp.timeStr);
    return '<option value="' + i + '">' + escHtml(label) + '</option>';
  }).join('');
  onReschedulePickerSelectChange();
}

// ════════════════════════════════════════════════════════════════════════════
// 🔴 2026-08-01 เพิ่ม (audit ระบบเลื่อนคาบ ข้อ A5 — Lin เลือกกฎ "ต้องเหลืออย่างน้อย 6 ชั่วโมง")
//
// รูเดิม: การขอเลื่อนคาบ "ไม่มีด่านเวลาเลยแม้แต่ชั้นเดียว" —
//   get_student_schedule กรองแค่ "วันที่ ≥ วันนี้" (ไม่ดูเวลา) + ฟังก์ชันในฐานข้อมูลข้าม reschedule ทั้งอัน
//   → ตอน 3 ทุ่ม นักเรียนยังเลือก "คาบ 9 โมงเช้าวันนี้ที่เรียนจบไปแล้ว" มาขอเลื่อนได้
//     หรือคาบที่จะเริ่มอีก 10 นาที (ครูเตรียมสอน/เข้าห้องรออยู่แล้ว)
//
// กฎที่ Lin ตัดสินใจ 2026-08-01: ขอเลื่อนได้ถ้าเหลืออย่างน้อย 6 ชั่วโมงก่อนคาบเริ่ม
//   (เทียบกับการ "ยกเลิก" ที่เข้มกว่า = 24 ชม. เพราะยกเลิกคือทิ้งคาบไปเลย)
// ⚠️ ต้องมี 3 ชั้นเสมอ ห้ามมีแค่ชั้นเดียว (ซ่อนปุ่มไม่ใช่การป้องกัน):
//   ชั้น 1 = ตรงนี้ (ปิดปุ่ม "下一步" + บอกเหตุผลบนจอ)
//   ชั้น 2 = proceedToRescheduleTimeOptions (เช็คซ้ำตอนกด)
//   ชั้น 3 = ฐานข้อมูล submit_class_request (ดู supabase/sql/2026-08-01_reschedule_guards.sql)
//   เลข 6 ต้องตรงกันทั้ง 3 ชั้น — แก้ที่ไหนต้องแก้ให้ครบ ไม่งั้นนักเรียนจะเจอ error ดิบจากฐานข้อมูล
// ════════════════════════════════════════════════════════════════════════════
var RESCHEDULE_MIN_HOURS = 6;

// คืนค่า { canGo, reason } — ใช้ร่วมกันทั้งชั้น 1 และชั้น 2 จะได้ตัดสินเหมือนกันเป๊ะ
function rescheduleOccurrenceGate(occ) {
  if (!occ) return { canGo: false, reason: '' };
  if (occ.hasTime === false) {
    return { canGo: false, reason: '⚠️ 這堂課系統裡沒有記錄上課時間，沒辦法自動判斷，請直接聯絡老師改期' };
  }
  var hoursUntil = (occ.date.getTime() - Date.now()) / 3600000;
  if (hoursUntil < RESCHEDULE_MIN_HOURS) {
    return {
      canGo: false,
      reason: hoursUntil <= 0
        ? '⚠️ 這堂課的時間已經過了，沒辦法線上改期，請直接聯絡老師'
        : '⚠️ 這堂距離上課不到 ' + RESCHEDULE_MIN_HOURS + ' 小時，沒辦法線上改期，請直接用 LINE 聯絡老師',
    };
  }
  return { canGo: true, reason: '' };
}

function onReschedulePickerSelectChange() {
  const sel = document.getElementById('reschedulePickerSelect');
  const hint = document.getElementById('reschedulePickerHint');
  const nextBtn = document.getElementById('reschedulePickerNextBtn');
  if (!sel) return;
  const chosen = _reschedulePickerOptions[sel.value];
  const gate = rescheduleOccurrenceGate(chosen);
  if (hint) {
    hint.style.display = gate.reason ? 'block' : 'none';
    hint.textContent = gate.reason;
  }
  if (nextBtn) nextBtn.disabled = !gate.canGo;
}

function proceedToRescheduleTimeOptions() {
  const sel = document.getElementById('reschedulePickerSelect');
  const chosen = _reschedulePickerOptions[sel.value];
  if (!chosen) { alert('請先選一堂課'); return; }
  // 🔴 2026-08-01 ชั้นที่ 2 (audit ข้อ A5)：ปุ่มถูกปิดอยู่แล้วก็จริง แต่ปุ่มที่ปิดไม่ใช่ด่านความปลอดภัย
  //   (แก้ DOM ก็กดได้ / เวลาผ่านไประหว่างที่เปิดหน้าค้างไว้ก็ทะลุได้) → เช็คซ้ำตอนกดจริงเสมอ
  const gate = rescheduleOccurrenceGate(chosen);
  if (!gate.canGo) { alert(gate.reason || '⚠️ 這堂課沒辦法線上改期，請直接聯絡老師'); return; }
  const thai = formatInTz(chosen.date, TEACHER_TZ); // 泰國時間 → 存資料庫/給老師看用
  _rescheduleChosenOccurrence = { isoDate: thai.dateStr, time: thai.timeStr, calendarEventId: chosen.calendarEventId };
  closeReschedulePickerModal();
  openClassRequestModal();
}

// 2026-07-16 加：編輯模式旗標——學生對自己已送出、老師還沒回覆的改期申請按「✏️ 修改」時設成該筆 id，
// 送出時就會改成「更新」而不是「新建」一筆。
var _classRequestEditRequestId = null;

function resetClassRequestModalFields() {
  // 🔴 2026-07-26：ช่องฝั่งนักเรียน ใช้ "วันนี้ของนักเรียนเอง" เป็นขอบล่าง (ไม่ใช่วันนี้ของครู)
  // นักเรียนที่อยู่โซนเวลาช้ากว่าไทย ถ้าไปใช้วันนี้ของครูจะโดนบล็อกวันที่ยังเป็นวันนี้ของเขาจริงๆ
  var _s = (nextClassCtx && typeof studentsCache !== 'undefined') ? studentsCache[nextClassCtx.token] : null;
  var _tz = _s && _s.pending_student_tz;
  [1, 2, 3].forEach(function (i) {
    document.getElementById('reqDateInput' + i).value = '';
    lockDateInputToFuture('reqDateInput' + i, _tz);
    resetTimeDropdown('reqTimeInput' + i);
    document.getElementById('reqScheduleHint' + i).style.display = 'none';
  });
}

function openClassRequestModal() {
  if (!nextClassCtx) return;
  if (!requireLineLinkedOrPrompt(nextClassCtx.token)) return;
  _classRequestEditRequestId = null;
  document.getElementById('classRequestModalTitle').textContent = '🔄 申請改期';
  resetClassRequestModalFields();
  document.getElementById('classRequestModal').classList.add('open');
}

// 2026-07-16 加：學生對自己已送出、老師還沒回覆的改期申請按「✏️ 修改」——重用同一個 modal，
// 只是設旗標讓送出時改成「更新」（跟取消申請的 openEditCancelRequestPicker 同樣做法）。
function openEditRescheduleRequestPicker(id) {
  if (!nextClassCtx) return;
  if (!requireLineLinkedOrPrompt(nextClassCtx.token)) return;
  _classRequestEditRequestId = id;
  _rescheduleChosenOccurrence = null; // 改的是時間選項，不是換課堂，跟「選哪一堂」無關
  document.getElementById('classRequestModalTitle').textContent = '✏️ 修改改期申請';
  resetClassRequestModalFields();
  document.getElementById('classRequestModal').classList.add('open');
}

function closeClassRequestModal() {
  document.getElementById('classRequestModal').classList.remove('open');
  _classRequestEditRequestId = null;
  _rescheduleChosenOccurrence = null;
}

// 2026-07-14 加（Lin 回報學生對時區會搞混）：學生在這個框填的是「他自己現在所在地」的時間
// （這樣他才不用自己心算換算成泰國時間），送給老師看之前這裡先即時換算成泰國時間預覽給他看，
// 讓他能確認换算結果跟自己想的對得上（跟老師那邊 onGenScheduleChange 的雙時區預覽同一招）。
// 2026-07-16 改：最多 3 個選項，每個選項各自獨立預覽，所以要傳 idx 進來認是哪一組欄位。
function onReqScheduleChange(idx) {
  const dateVal = document.getElementById('reqDateInput' + idx).value;
  const timeVal = document.getElementById('reqTimeInput' + idx).value.trim();
  const hint = document.getElementById('reqScheduleHint' + idx);
  if (!dateVal || !timeVal) { hint.style.display = 'none'; return; }
  if (!isValidTimeStr(timeVal)) { hint.style.display = 'block'; hint.textContent = '⚠️ 時間格式不對，請用 HH:MM，例如 14:30'; return; }
  const s = (nextClassCtx && typeof studentsCache !== 'undefined') ? studentsCache[nextClassCtx.token] : null;
  const studentTz = s && s.pending_student_tz;
  if (studentTz) {
    // 2026-07-14 加：時區字串萬一是壞資料，parseInTzToDate 內的 Intl.DateTimeFormat 會直接
    // throw——這裡只是即時預覽用，接住錯誤退回泰國時間版本就好，不要讓整個輸入框卡住不能用
    // 2026-07-22 改（Lin 要求移除）：時區換算正常時不再顯示「＝ 老師端泰國時間」這行提示，只在有問題時才顯示警告。
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

// 2026-07-16 加：最多蒐集 3 組「想改到」的日期/時間（選項 1 必填，2/3 選填），換算成泰國時間。
// 回傳 null 代表格式錯誤（已經 alert 過了），回傳 [] 代表選項 1 沒填。
function collectClassRequestOptions() {
  const s = studentsCache[nextClassCtx.token];
  const studentTz = s && s.pending_student_tz;
  const options = [];
  for (let i = 1; i <= 3; i++) {
    const rawDate = document.getElementById('reqDateInput' + i).value;
    const rawTime = document.getElementById('reqTimeInput' + i).value.trim();
    if (!rawDate) continue; // 選項 2/3 沒填就跳過
    if (rawTime && !isValidTimeStr(rawTime)) { alert('選項 ' + i + ' 時間格式不對，請用 HH:MM，例如 14:30'); return null; }
    // 🔴 2026-07-26 ชั้นที่ 2：เช็คซ้ำตอนกดส่ง (เทียบกับ "วันนี้ของนักเรียนเอง")
    if (!assertNotPastDate(rawDate, '選項 ' + i + ' 的日期', studentTz)) return null;
    let newDate = rawDate, newTime = rawTime || null;
    if (rawTime && studentTz) {
      // 2026-07-14 加：壞的時區字串會讓 Intl.DateTimeFormat throw——接住錯誤退回「當泰國時間
      // 直接送出」，不要讓學生點了送出卻整個沒反應（RELIABILITY FIRST：至少要送得出去）
      try {
        const abs = parseInTzToDate(rawDate, rawTime, studentTz);
        const thai = formatInTz(abs, TEACHER_TZ);
        newDate = thai.dateStr; newTime = thai.timeStr;
      } catch (e) { /* 換算失敗就照原樣送出（當泰國時間），至少不會整個卡住 */ }
    }
    // 🔴 2026-08-01 加 (audit ระบบเลื่อนคาบ ข้อ A12 — ด่านกันอดีตต้องเช็ค "หลังแปลงเป็นเวลาไทย" ด้วย)
    //   รูเดิม: ด่านข้างบน (assertNotPastDate) เทียบกับ "วันนี้ของนักเรียนเอง" แล้วค่อยแปลงเป็นเวลาไทยทีหลัง
    //   ไต้หวัน UTC+8 / ไทย UTC+7 → นักเรียนไต้หวันเลือก "วันนี้ 00:30" ผ่านด่าน แต่ถูกเก็บลงฐานข้อมูล
    //   เป็น "เมื่อวาน 23:30 เวลาไทย" = วันที่ในอดีต → ฝั่งครูบนเว็บจับได้ แต่ปุ่มใน LINE เคยไม่จับ
    //   ตอนนี้เช็คซ้ำด้วยค่าที่จะเก็บจริง (เวลาไทย) ตั้งแต่ต้นทาง จะได้ไม่มีคำขอแบบนี้เกิดขึ้นเลย
    //   ⚠️ เช็คเฉพาะกรณี "มีเวลา" เท่านั้น — กรณีไม่กรอกเวลา ค่าที่เก็บคือวันที่ที่นักเรียนเลือกตรงๆ
    //   (ไม่มีการแปลงเขตเวลาเกิดขึ้นเลย) ด่านข้างบนที่เทียบกับ "วันนี้ของนักเรียนเอง" ถูกต้องอยู่แล้ว
    //   ถ้าดันไปเทียบกับวันนี้ของไทยซ้ำ นักเรียนที่อยู่โซนเวลาช้ากว่าไทยจะโดนบล็อกวันที่ยังไม่ถึงของเขา
    if (newTime && !assertNotPastDateTime(newDate, newTime, '選項 ' + i + ' 換算成泰國時間後的時間')) return null;
    options.push({ date: newDate, time: newTime });
  }
  // 2026-07-16 加（稽核發現，GREEN）：避免學生不小心把 2-3 個選項填成完全一樣的日期時間，
  // 送出去老師看到會覺得莫名其妙（明明說給 3 個選項，卻是同一個時間重複 3 次）。
  const seenKeys = {};
  for (const opt of options) {
    const key = opt.date + '|' + (opt.time || '');
    if (seenKeys[key]) { alert('選項裡有重複的日期時間，請改成不一樣的時間再送出。'); return null; }
    seenKeys[key] = true;
  }
  return options;
}

// 2026-07-16 改（Lin 要求：最多可以給 3 個時間選項）：不再只送 1 個「想改到」的時間，
// 改成蒐集 1-3 個選項存進 proposed_options（JSONB 陣列），offer_status 直接設成 'proposed'
// ——跟老師「提議新時間給學生」共用同一套「列出選項讓對方挑」機制，老師那邊會看到清單可以直接挑，
// 不用先按「處理」再走「其他 → 提議新時間」。
async function submitClassRequest() {
  if (!nextClassCtx) { closeClassRequestModal(); return; }
  const options = collectClassRequestOptions();
  if (options === null) return; // 格式錯誤，collectClassRequestOptions 已經 alert 過了
  if (!options.length) { alert('請至少填選項 1 的日期'); return; }

  const studentName = currentStudentName(nextClassCtx.token);
  const btn = document.getElementById('reqSubmitBtn');
  btn.disabled = true; btn.textContent = '送出中…';

  if (_classRequestEditRequestId) {
    await submitClassRequestEdit(_classRequestEditRequestId, options, studentName);
    btn.disabled = false; btn.textContent = '📤 送出申請';
    return;
  }

  // 2026-07-16 加（稽核後，ORANGE#6）：改用學生在「選擇要改期的課堂」picker 裡選的那一堂
  // （_rescheduleChosenOccurrence），不是只能用 nextClassCtx（下一堂課）——沒選過（理論上不會發生，
  // 例如舊連結直接呼叫這個 function）就退回原本抓「下一堂課」的行為，不會壞掉。
  const originalDateToUse = (_rescheduleChosenOccurrence && _rescheduleChosenOccurrence.isoDate) || nextClassCtx.isoDate;
  const originalTimeToUse = (_rescheduleChosenOccurrence && _rescheduleChosenOccurrence.time) || nextClassCtx.timeStr;
  const chosenCalendarEventId = _rescheduleChosenOccurrence && _rescheduleChosenOccurrence.calendarEventId;

  const res = await sb.rpc('submit_class_request', {
    p_token: nextClassCtx.token,
    p_student_name: studentName,
    p_request_type: 'reschedule',
    p_original_date: originalDateToUse,
    p_requested_date: options[0].date,
    p_requested_time: options[0].time,
    p_note: null,
    // 2026-07-14 加：同上（requestCancelClass 那顆）—— 一定要帶 p_initiated_by，
    // 不然資料庫裡兩個版本的 submit_class_request 會分不出來選哪個，送出失敗。
    p_initiated_by: 'student',
    // 🔴 2026-08-01 加（สำคัญมาก — ต้องมาคู่กับ supabase/sql/2026-08-01_reschedule_guards.sql）：
    //   ฐานข้อมูลมีด่านใหม่ "ขอเลื่อนคาบต้องเหลืออย่างน้อย 6 ชั่วโมง" ซึ่งต้องรู้ว่าคาบเดิมเริ่มกี่โมง
    //   ไม่ส่งค่านี้ = ฐานข้อมูลตอบ 'missing original_time...' → นักเรียนขอเลื่อนไม่ได้เลยสักคน
    //   (ท่าเดียวกับที่ requestCancelClass ทำอยู่แล้วสำหรับด่าน 24 ชม.)
    //   ผลพลอยได้: ฐานข้อมูลเก็บ original_time ให้ตั้งแต่ตอน INSERT เลย ไม่ต้องรอเขียนรอบ 2
    //   = ลดจุดพังไปอีกหนึ่งจุด (ดูคอมเมนต์ backfillOk2 ข้างล่าง)
    p_original_time: originalTimeToUse || null,
  });
  // 🔴 2026-08-01 แก้ (audit ระบบเลื่อนคาบ ข้อ A4)：เดิมปลดล็อกปุ่มตรงนี้ ซึ่งเร็วไปหนึ่งจังหวะ —
  //   หลังบรรทัดนี้ยังมี await อีกอย่างน้อย 1 ครั้ง (เขียนฐานข้อมูลรอบ 2) กว่ากล่องจะปิด
  //   ระหว่างนั้นปุ่มกดได้ = กดรัว 2 ทีได้คำขอ 2 ใบจริงๆ → ย้ายไปปลดตอนจบ (ทุกทางออก)
  const submitTokenForCard = nextClassCtx.token;
  function releaseSubmitBtn() { btn.disabled = false; btn.textContent = '📤 送出申請'; }
  if (res.error) { releaseSubmitBtn(); var friendlyResched = friendlyRequestError(res.error.message); alert(friendlyResched ? ('⚠️ ' + friendlyResched) : ('送出失敗：' + res.error.message + '\n請直接聯絡老師比較保險。')); return; }
  if (typeof gtag === 'function') gtag('event', 'class_request_submitted', { category: 'course', request_type: 'reschedule' });
  const newId = res.data;
  // 2026-07-16 加：submit_class_request 這個 RPC 不收 proposed_options/offer_status 參數
  // （不想動資料庫函式本身），插入成功後馬上補一個 update 存上完整選項清單 + 設 offer_status。
  // 🔴 2026-08-01 (audit ข้อ A3)：ไม่มี newId = ไม่มีทางเขียนรอบ 2 ได้เลย → ถือว่า "ไม่สำเร็จ" ตั้งแต่ต้น
  let backfillOk2 = !!newId;
  if (newId) {
    const updFields = {
      proposed_options: options, offer_status: 'proposed', offer_created_at: new Date().toISOString(), sla_reminder_sent: false,
    };
    // 2026-07-16 加（稽核後，ORANGE#6 順便補上）：跟取消申請一樣，把真正對應的 Google Calendar
    // 事件 ID 存起來，老師端就能直接用 ID 搬課，不用再靠「姓名+日期」猜哪一筆（以前改期申請
    // 完全沒有存過這個欄位）。拿不到 ID（例如舊版 fallback）就不存，退回原本的姓名+日期比對。
    if (chosenCalendarEventId) updFields.calendar_event_id = chosenCalendarEventId;
    // 2026-08-01 拿掉 original_time：ตอนนี้ส่งไปกับ p_original_time ตั้งแต่ตอน INSERT แล้ว
    //   (ฐานข้อมูลเก็บให้เองตั้งแต่ 2026-07-31_store_original_time_on_insert.sql)
    //   → ลดของที่ต้อง "เขียนรอบ 2" ลงอีกหนึ่งอย่าง = จุดพังน้อยลง (ท่าเดียวกับที่ requestCancelClass ทำไปแล้ว)
    // 2026-07-19 改：直接 update 會被 RLS 靜靜擋掉（更新 0 筆又不回 error），
    // 導致 proposed_options／calendar_event_id 從來沒存進去過。改走 RPC + 檢查筆數。
    const upd = await studentPatchRequest(submitTokenForCard, newId, updFields, {});
    if (upd.error || !upd.rows.length) {
      backfillOk2 = false;
      console.error('⚠️ 補存選項清單失敗：', upd.error ? upd.error.message : '更新 0 筆');
    }
  }
  // ════════════════════════════════════════════════════════════════════════
  // 🔴 2026-08-01 แก้ (audit ระบบเลื่อนคาบ ข้อ A3 — ผิดกฎ RELIABILITY FIRST ที่ Lin ตั้งเอง)
  //
  // เดิม: การเขียนรอบ 2 พังแล้วเขียนลง console อย่างเดียว แล้วขึ้น "✅ ส่งแล้ว" ทุกกรณี
  //   บนมือถือไม่มีใครเปิด console → นักเรียนไม่มีทางรู้ และพังพร้อมกัน 4 อย่าง:
  //   (1) ตัวเลือกที่ 2-3 หายไป (เหลือแต่อันแรกที่ฝังมากับ INSERT)
  //   (2) offer_status ยังว่าง → การ์ดของนักเรียนตกไปกิ่งทั่วไป = ปุ่ม ✏️ แก้ / 收回 หายถาวร
  //   (3) calendar_event_id ไม่ถูกเก็บ → ครูต้องเดาชื่อ+วัน และปุ่มใน LINE ปฏิเสธทันที
  //   (4) การ์ดใน LINE ที่ครูได้รับ "โกหก" — โชว์ 3 ปุ่มจากตัวเลือกในเครื่องนักเรียน
  //       แต่ฐานข้อมูลมีอันเดียว → ครูกดปุ่มที่ 2/3 แล้วเจอ "選項已失效"
  //
  // ตอนนี้: เขียนรอบ 2 ไม่สำเร็จ = ส่งการ์ดแบบ "ตัวเลือกเดียว" (ตรงกับฐานข้อมูลจริง) + บอกนักเรียนตรงๆ
  //   ท่าเดียวกับ backfillOk ของฝั่งยกเลิก (requestCancelClass) ที่ทำถูกอยู่แล้วตั้งแต่ 2026-07-19
  // ════════════════════════════════════════════════════════════════════════
  notifyTeacherClassRequest({
    type: 'reschedule', name: studentName, token: submitTokenForCard,
    originalDate: originalDateToUse, originalTime: originalTimeToUse,
    options: backfillOk2 ? options : [options[0]],
    requestId: newId,
  });
  closeClassRequestModal();
  releaseSubmitBtn();
  alert(backfillOk2
    ? '✅ 已送出改期申請，老師確認後會回覆你。'
    : '✅ 已送出改期申請（老師收到的是第 1 個時間）。\n⚠️ 其他備選時間這次沒存進去，如果第 1 個時間老師不方便，請直接用 LINE 告訴老師其他時間。');
  // 🔴 2026-08-01 加 (audit ข้อ A4)：เดิมส่งเสร็จไม่ได้รีเฟรชการ์ดสถานะเลย (ต่างจากทางแก้/ถอนที่รีเฟรชหมด)
  //   → หน้าจอยังโล่ง ปุ่ม 🔄 申請改期 ยังอยู่ นักเรียนนึกว่ายังไม่ได้ส่ง แล้วกดส่งซ้ำอีกใบ
  //   และการ์ดโชว์ได้ใบเดียว ใบเก่าจะถูกซ่อน = ถอนเองไม่ได้ตลอดกาล
  loadStudentPendingRequestStatus(submitTokenForCard);
}

// 2026-07-16 加：學生修改自己已送出、老師還沒回覆的改期申請——重新給 1-3 個新選項，
// 用 .eq('offer_status','proposed') 當保險閘：如果老師剛好在這一刻已經處理了，這裡就會抓不到。
async function submitClassRequestEdit(id, options, studentName) {
  // 2026-07-19 改：直接 update 會被 RLS 擋掉（見 studentPatchRequest 的說明），改走 RPC
  // 🔴 2026-08-01 加 notProcessing (audit ระบบเลื่อนคาบ ข้อ A2)：ด่านชั้นที่ 2 แบบเดียวกับฝั่งยกเลิก
  //   ถ้าครูกำลังจับล็อกและกำลังคุยกับ Google Calendar อยู่ (processing_started_at ไม่ว่าง)
  //   ห้ามให้นักเรียนแก้ตัวเลือกทับเข้าไปได้ — ไม่งั้นครูกดปุ่มที่เขียนว่า "8/5 14:00"
  //   แต่คาบไปลงเวลาใหม่ที่นักเรียนเพิ่งเปลี่ยน โดยไม่มีใครรู้ทั้งสองฝ่าย
  const res = await studentPatchRequest(nextClassCtx.token, id, {
    requested_date: options[0].date, requested_time: options[0].time,
    proposed_options: options, offer_created_at: new Date().toISOString(), sla_reminder_sent: false,
  }, { status: 'pending', offerStatus: 'proposed', notProcessing: true });
  if (res.error) { var friendlyReschedEdit = friendlyRequestError(res.error.message); alert(friendlyReschedEdit ? ('⚠️ ' + friendlyReschedEdit) : ('⚠️ 更新失敗：' + res.error.message + '\n請直接聯絡老師比較保險。')); return; }
  if (!res.rows.length) {
    // 🔴 2026-08-01 แก้ข้อความ (audit ข้อ A2)：ตอนนี้มีอีกสาเหตุหนึ่งที่ทำให้แก้ไม่ได้ = ครูกำลังจัดการอยู่
    alert('ℹ️ 更新失敗——老師可能正在處理這筆（或已經處理完了）。\n請重新整理頁面看最新狀態，需要的話直接用 LINE 聯絡老師。');
    closeClassRequestModal();
    loadStudentPendingRequestStatus(nextClassCtx.token);
    return;
  }
  // 🟡 2026-08-01 加 originalTime (audit ข้อ A11 เดิม)：เดิมทางแก้คำขอไม่ส่งเวลาคาบเดิมไปด้วย
  //   ครูจึงเห็นใน LINE แค่ "原本：2026-08-05" ไม่มีเวลา ทั้งที่ตอนส่งครั้งแรกมี (ผิดกฎ 2026-07-17)
  notifyTeacherClassRequest({ type: 'reschedule', name: studentName, token: nextClassCtx.token, originalDate: res.rows[0].original_date, originalTime: res.rows[0].original_time, options: options, requestId: id });
  closeClassRequestModal();
  alert('✅ 已更新，老師確認後會回覆你。');
  loadStudentPendingRequestStatus(nextClassCtx.token);
}

// 2026-07-16 加：學生收回自己送出、老師還沒回覆的改期申請——跟收回取消申請
// （studentWithdrawOwnRequest）同樣邏輯，用 .eq('offer_status','proposed') 當保險閘。
async function studentWithdrawOwnRescheduleRequest(token, id) {
  if (!confirm('確定要收回這個改期申請嗎？（這堂課維持原本安排）')) return;
  // 2026-07-19 改：直接 update 會被 RLS 擋掉（見 studentPatchRequest 的說明），改走 RPC
  // 🔴 2026-08-01 加 notProcessing (audit ระบบเลื่อนคาบ ข้อ A2 — รูที่อันตรายที่สุดข้อหนึ่ง)
  //   ฝั่ง "ยกเลิกคาบ" มีด่านนี้มาตั้งแต่ 2026-07-19 แล้ว แต่ฝั่ง "เลื่อนคาบ" ถูกลืม
  //   ตอนครูกดปุ่ม ระบบจับล็อกโดยไม่เปลี่ยน status (ยังเป็น pending) → ด่าน 2 อันเดิมของนักเรียนผ่านหมด
  //   ผลจริง: คาบถูกย้ายไปแล้ว แต่หน้าจอนักเรียนขึ้น "✅ 已收回，這堂課維持原本安排"
  //   = นักเรียนไปรอเวลาเดิม แล้วขาดเรียน (ช่วงเสี่ยงไม่กี่วินาที แต่ผลหนักที่สุดในระบบนี้)
  const res = await studentPatchRequest(token, id, { status: 'acknowledged', offer_status: null }, { status: 'pending', offerStatus: 'proposed', notProcessing: true });
  if (res.error) { alert('⚠️ 收回失敗：' + res.error.message); return; }
  if (!res.rows.length) {
    alert('ℹ️ 收回失敗——老師可能正在處理這筆（或剛好已經處理完了）。\n這堂課的安排可能已經被更動，請直接用 LINE 聯絡老師確認狀況。');
    loadStudentPendingRequestStatus(token);
    return;
  }
  alert('✅ 已收回，這堂課維持原本安排');
  loadStudentPendingRequestStatus(token);
}

// 2026-07-15 加：「申請加課」— 給不固定/偶爾約課的學生（例如 Edward、米線）自己提出想加的時間，
// 跟「申請改期」共用同一張 classroom_requests 表 + 同一套審核清單，只是 request_type 不同
// （'add_class'），p_original_date 特意傳 null（沒有「原本課堂」這回事，純粹是新加的一堂）。
// 老師端確認沒有衝突、真的排進 Calendar，用的是已經做好的「➕ 加課堂時間」那套工具（見
// openAddClassDayModal／checkAddClassDayConflict／confirmAddClassDay），不用重造一次。
// 2026-07-20 加（Lin 要求：跟老師端「➕ 加課堂時間」一致，一次可以送出好幾筆＋有「固定」欄位）
// 跟老師端 addClassDayRowHtml 同一套 row 樣板做法：每筆一個 row（id 帶 idx 後綴），
// 「➕ 再加一筆時間」複製新的一份、「－ 移除這筆」拿掉一份（不能減到 0 筆）。
// 2026-07-22 改（Lin 要求：學生自己申請加課不需要「🔁 每週固定」這個欄位——固定課表變更
// 應該只由老師發起，學生自己臨時想加的都是單次課）：拿掉勾選框＋「固定到」欄位，
// recurring/untilVal 直接在 submitAddRequest 裡固定寫 false/null，不用再讀這兩個 DOM 元素了。
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
  if (!el) {
    // 2026-07-31：ถ้าหากล่องหลักไม่เจอ ต้องล้างการ์ดเพิ่มคาบด้วย ไม่งั้นค้างบนจอเป็นข้อมูลเก่าหลอกนักเรียน
    var addElNoMain = document.getElementById('pendingAddRequestCard');
    if (addElNoMain) addElNoMain.innerHTML = '';
    return;
  }
  try {
    // 2026-07-16 改：多撈幾筆，自己篩掉「老師發起的取消」（那個已經有專屬的
    // teacherCancelAckBanner 處理確認流程了，這裡不用重複顯示，不然學生會看到兩個一樣的東西）。
    // 2026-07-18 加：同理篩掉「老師發起的加課」（曾經有專屬的 teacherAddAckBanner 顯示確認流程）。
    // 🗑️ 2026-07-31：teacherAddAckBanner 那套已經整個刪掉了（系統不再產生「等學生確認」的加課申請）。
    //    這個篩選留著只是為了萬一資料庫裡還有很久以前的舊資料，不會讓學生看到已經沒有用的卡片。
    // 2026-07-19 改：直接 select 會被 RLS 擋掉，永遠回空陣列（學生因此完全看不到自己的
    // 申請狀態，而且不會有任何錯誤訊息）。改走 student_get_own_requests RPC。
    // 🟡 2026-07-31 แก้ (ข้อ #22)：ดึงจาก 5 เป็น 10 แถว
    //   นักเรียนที่ขอเพิ่มคาบทีเดียวหลายเวลา + มีคำขอยกเลิกค้างด้วย จะเกิน 5 ได้ง่ายมาก
    //   แถวที่เกินโควตาหายไปเฉยๆ โดยไม่มีอะไรบอก = ถอนเองไม่ได้
    const res = await studentFetchRequests(token, { status: 'pending', limit: 10 });
    const rows = res.rows;

    // ════════════════════════════════════════════════════════════════════════
    // 🟡 2026-07-31 แก้ (ข้อ #22) — การ์ด "ขอเพิ่มคาบ" ต้องโชว์คู่กับการ์ดอื่นได้ ไม่ใช่แย่งที่กัน
    //
    // เดิม: การ์ดเพิ่มคาบโชว์เฉพาะตอนคำขอ "ใหม่สุด" บังเอิญเป็นคำขอเพิ่มคาบเท่านั้น
    //   → นักเรียนที่มีคำขอยกเลิก 1 ใบ + ขอเพิ่มคาบ 3 ใบ จะเห็นแค่ใบยกเลิก
    //     อีก 3 ใบหายไปเฉยๆ เหมือนไม่เคยส่ง และ "ถอนเองไม่ได้" ต้องรบกวนครูอย่างเดียว
    //   โค้ดเดิมเขียนว่าตั้งใจ (กันการ์ดบังกัน) — เจตนาถูก แต่วิธีทำให้ของหาย
    //
    // ตอนนี้: แยกเป็นกล่องของตัวเองคนละใบ วางต่อท้ายกล่องเดิม → โชว์พร้อมกันได้ ไม่บังกัน
    //   ข้อดีอีกอย่าง: ไม่ต้องแตะตรรกะการ์ดยกเลิก/ขอเลื่อนที่อยู่ข้างล่างเลยสักบรรทัด
    // ════════════════════════════════════════════════════════════════════════
    const myAddRows = rows.filter(function (x) {
      return x.request_type === 'add_class' && x.initiated_by !== 'teacher';
    });
    var addEl = document.getElementById('pendingAddRequestCard');
    if (!addEl) {
      // กันพังเงียบ: ถ้าหาที่วางไม่เจอ (ไม่ควรเกิด) ห้ามปล่อยให้ error ไปโดน catch ข้างล่าง
      // ซึ่งจะล้างการ์ดหลักทิ้งโดยที่ไม่มีใครรู้ว่าทำไม
      if (!el.parentNode) return;
      addEl = document.createElement('div');
      addEl.id = 'pendingAddRequestCard';
      el.parentNode.insertBefore(addEl, el.nextSibling);
    }
    if (myAddRows.length) {
      const addListHtml = myAddRows.map(function (x) {
        return '<div style="border-top:1px solid var(--border);padding-top:8px;margin-top:8px;">' +
          '<div style="font-size:0.85rem;color:var(--ink);font-family:\'Noto Sans TC\',sans-serif;">📅 ' +
            escHtml(x.requested_date || '-') + ' ' + escHtml(x.requested_time || '') + '（泰國時間）</div>' +
          '<button class="btn-sm" style="margin-top:6px;background:none;border:1px solid var(--border);color:#b45309;" onclick="studentWithdrawOwnAddRequest(\'' + token + '\',\'' + x.id + '\')">收回這筆</button>' +
        '</div>';
      }).join('');
      addEl.innerHTML = '<div class="card">' +
        '<h2>⏳ 加課申請處理中（' + myAddRows.length + ' 筆）</h2>' +
        '<p style="font-size:0.85rem;color:var(--ink-muted);font-family:\'Noto Sans TC\',sans-serif;">' + hoursLeftLabel(myAddRows[0].created_at) + '</p>' +
        addListHtml +
      '</div>';
    } else {
      addEl.innerHTML = '';
    }

    // กล่องหลักด้านล่าง: ไม่เอาคำขอเพิ่มคาบของนักเรียนมาแสดงซ้ำอีก (มีกล่องของตัวเองแล้วข้างบน)
    const r = rows.find(function (x) {
      return !(x.request_type === 'cancel' && x.initiated_by === 'teacher') &&
        !(x.request_type === 'add_class' && x.initiated_by === 'teacher') &&
        !(x.request_type === 'add_class' && x.initiated_by !== 'teacher');
    });
    if (!r) {
      // ไม่มีคำขออื่นค้าง → กล่องหลักโชว์ "คาบที่เพิ่งถูกยกเลิก" ตามเดิม
      // (กล่องเพิ่มคาบข้างบนไม่ถูกแตะ ยังโชว์อยู่ถ้ามี)
      await loadStudentRecentAcknowledgedCancelCard(token, el);
      return;
    }
    window._myPendingRequest = r;
    const isCancel = r.request_type === 'cancel';
    // 2026-07-31 หมายเหตุ: ตั้งแต่แก้ข้อ #22 ตัวนี้จะเป็น false เสมอ (คำขอเพิ่มคาบมีกล่องของตัวเองข้างบนแล้ว)
    //   เก็บเงื่อนไขไว้เฉยๆ ไม่ลบ เผื่อวันหลังเปลี่ยนใจให้กลับมาโชว์รวมกล่องเดียว
    const isAdd = r.request_type === 'add_class';
    const isOwnCancel = isCancel && r.initiated_by !== 'teacher'; // 學生自己申請的取消（不是老師發起的）

    function hoursLeftLabel(sinceIso) {
      if (!sinceIso) return '';
      const hoursPassed = (Date.now() - new Date(sinceIso).getTime()) / 3600000;
      const left = REQUEST_SLA_HOURS - hoursPassed;
      return left > 0 ? ('（建議 48 小時內處理，剩約 ' + Math.max(0, Math.round(left)) + ' 小時）') : '（已超過 48 小時，建議直接用 LINE 提醒老師）';
    }

    // 2026-07-16 改（Lin 要求：最多 3 個時間選項）：offer_status='proposed' 現在兩種情況都會用到——
    //   initiated_by==='teacher' → 老師提議新時間給學生，這裡要讓學生挑一個（或都不方便）
    //   initiated_by==='student'（自己申請的）→ 自己送出的改期申請，等老師回覆，可以查看/修改/收回
    if (r.offer_status === 'proposed' && r.initiated_by === 'teacher') {
      var sForTz = studentsCache[token];
      var studentTzForCard = sForTz && sForTz.pending_student_tz;
      var opts = (Array.isArray(r.proposed_options) && r.proposed_options.length) ? r.proposed_options : [{ date: r.requested_date, time: r.requested_time }];
      var optButtonsHtml = opts.map(function (opt, i) {
        return '<button class="btn-sm" style="width:100%;margin-bottom:6px;background:linear-gradient(135deg,var(--gold-bright),var(--gold-deep));color:#fff;" onclick="respondToOfferAsStudent(\'' + r.id + '\',\'accepted\',' + i + ')">' + escHtml(formatOfferOptionForStudent(opt, studentTzForCard)) + '</button>';
      }).join('');
      // 2026-07-17 加（Lin 要求）：「原本」要連時間一起顯示，不能只有日期，換算成學生自己的時區看比較清楚。
      var origLabelForCard = r.original_date
        ? escHtml(formatOfferOptionForStudent({ date: r.original_date, time: r.original_time }, studentTzForCard))
        : '-';
      el.innerHTML = '<div class="card" style="border-color:var(--gold-bright);">' +
        '<h2>🔁 老師提議新時間</h2>' +
        '<p style="font-size:0.88rem;color:var(--ink);font-family:\'Noto Sans TC\',sans-serif;margin-bottom:10px;">原本：' + origLabelForCard + '</p>' +
        optButtonsHtml +
        '<button class="btn-sm" style="width:100%;background:none;border:1px solid var(--border);color:var(--ink-muted);" onclick="respondToOfferAsStudent(\'' + r.id + '\',\'declined\')">都不方便，請老師直接聯絡我</button>' +
        '<p style="font-size:0.78rem;color:var(--ink-muted);font-family:\'Noto Sans TC\',sans-serif;margin-top:10px;">' + hoursLeftLabel(r.offer_created_at) + '</p>' +
      '</div>';
    } else if (r.offer_status === 'proposed') {
      // 自己申請改期，等老師回覆——可以查看/修改（重選 1-3 個新選項）/收回，跟自己申請取消的做法一樣。
      el.innerHTML = '<div class="card">' +
        '<h2>⏳ 改期申請處理中</h2>' +
        '<p style="font-size:0.85rem;color:var(--ink-muted);font-family:\'Noto Sans TC\',sans-serif;">' + hoursLeftLabel(r.offer_created_at) + '</p>' +
        '<div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap;">' +
          '<button class="btn-sm" style="background:none;border:1px solid var(--border);color:var(--ink-muted);" onclick="viewRequestDetail(window._myPendingRequest)">👁️ 查看</button>' +
          '<button class="btn-sm" style="background:none;border:1px solid var(--border);color:var(--gold-deep);" onclick="openEditRescheduleRequestPicker(\'' + r.id + '\')">✏️ 修改</button>' +
          '<button class="btn-sm" style="background:none;border:1px solid var(--border);color:#b45309;" onclick="studentWithdrawOwnRescheduleRequest(\'' + token + '\',\'' + r.id + '\')">收回申請</button>' +
        '</div>' +
      '</div>';
    } else if (r.offer_status === 'accepted') {
      // 已經回覆了，等老師端按確認才會真的動 Calendar（Calendar 綁在老師自己的 Google 帳號，一定要等老師開電腦）
      el.innerHTML = '<div class="card">' +
        '<h2>✅ 已選好新時間</h2>' +
        '<p style="font-size:0.85rem;color:var(--ink-muted);font-family:\'Noto Sans TC\',sans-serif;">等老師開電腦確認後，才會真的調整行事曆喔！</p>' +
      '</div>';
    } else if (r.offer_status === 'declined') {
      el.innerHTML = '<div class="card">' +
        '<h2>❌ 已回覆都不方便</h2>' +
        '<p style="font-size:0.85rem;color:var(--ink-muted);font-family:\'Noto Sans TC\',sans-serif;">老師會直接聯絡你討論時間</p>' +
      '</div>';
    } else {
      // 2026-07-16 加（Lin 要求）：老師還沒處理前，學生自己申請的取消可以「查看／改選課堂／收回」，
      // 跟老師端能對自己發起的取消做的事一樣，角色對調。加課申請維持原本（沒有這些按鈕）。
      var ownCancelActions = isOwnCancel
        ? ('<div style="display:flex;gap:8px;margin-top:10px;flex-wrap:wrap;">' +
             '<button class="btn-sm" style="background:none;border:1px solid var(--border);color:var(--ink-muted);" onclick="viewRequestDetail(window._myPendingRequest)">👁️ 查看</button>' +
             '<button class="btn-sm" style="background:none;border:1px solid var(--border);color:var(--gold-deep);" onclick="openEditCancelRequestPicker(\'' + r.id + '\')">✏️ 改選課堂</button>' +
             '<button class="btn-sm" style="background:none;border:1px solid var(--border);color:#b45309;" onclick="studentWithdrawOwnRequest(\'' + token + '\',\'' + r.id + '\')">收回申請</button>' +
           '</div>')
        : '';
      el.innerHTML = '<div class="card">' +
        '<h2>' + (isCancel ? '⏳ 取消申請處理中' : isAdd ? '⏳ 加課申請處理中' : '⏳ 改期申請處理中') + '</h2>' +
        (isAdd ? '<p style="font-size:0.85rem;color:var(--ink);font-family:\'Noto Sans TC\',sans-serif;margin-bottom:4px;">申請時間：' + escHtml(r.requested_date || '-') + ' ' + escHtml(r.requested_time || '') + '（泰國時間）</p>' : '') +
        '<p style="font-size:0.85rem;color:var(--ink-muted);font-family:\'Noto Sans TC\',sans-serif;">' + hoursLeftLabel(r.created_at) + '</p>' +
        ownCancelActions +
      '</div>';
    }
  } catch (e) {
    // 🔴 2026-08-01 แก้ (audit ระบบเลื่อนคาบ ข้อ A9 — "หายเงียบ" คือสิ่งที่ห้ามที่สุด)
    //   เดิมพังตรงไหนก็ล้างการ์ดทิ้งทั้งใบแบบไม่มีคำอธิบาย (เช่น proposed_options มีวันที่รูปแบบแปลก
    //   → formatInTz เจอ Invalid Date → throw ทั้งฟังก์ชัน) → นักเรียนเห็นจอโล่ง สรุปเองว่า "ไม่ได้ส่ง"
    //   แล้วส่งใหม่ซ้ำอีกใบ (ไปเจอปัญหาการ์ดโชว์ได้ใบเดียว = ใบเก่าถอนไม่ได้อีกต่อไป)
    //   ตอนนี้: บอกตรงๆ ว่าจอนี้โหลดไม่ขึ้น + ย้ำว่าคำขอที่ส่งไปแล้วยังอยู่ + ให้ทางออกที่ปลอดภัย
    console.error('⚠️ 載入申請狀態卡片失敗：', e && (e.message || e));
    //   (ข้อความตั้งใจไม่ฟันธงว่า "มีคำขอค้างอยู่" เพราะ error นี้เกิดตอนเน็ตหลุดก็ได้
    //    คนที่ไม่เคยส่งคำขอเลยจะได้ไม่ตกใจว่าตัวเองมีคำขอค้าง)
    el.innerHTML = '<div class="card" style="border-color:var(--amber);">' +
      '<h2>⚠️ 這個區塊載入失敗</h2>' +
      '<p style="font-size:0.85rem;color:var(--ink);font-family:\'Noto Sans TC\',sans-serif;">' +
        '這裡暫時讀不到資料。<b>如果你剛剛送出過申請，它還在，不會不見。</b><br>' +
        '請先重新整理頁面；如果還是一樣，直接用 LINE 問老師目前的狀態，不要重複送出申請。' +
      '</p>' +
    '</div>';
    // 2026-07-31：ต้องล้างการ์ดเพิ่มคาบด้วย ไม่งั้นการ์ดหลักหายไปเงียบๆ แต่การ์ดเพิ่มคาบค้างอยู่บนจอ
    //   อาจโชว์คำขอที่นักเรียนถอนไปแล้ว (ข้อมูลเก่าค้าง = หลอกนักเรียน)
    var addElErr = document.getElementById('pendingAddRequestCard');
    if (addElErr) addElErr.innerHTML = '';
  }
}

// 2026-07-16 加：把一個候選時間 {date,time} 換算成給學生/老師看的文字。
function optionToDate(opt) { return teacherTimeToDate(opt.date, opt.time || '00:00'); }
function formatOfferOptionForStudent(opt, studentTz) {
  if (!opt || !opt.date) return '-';
  if (!opt.time) return opt.date + '（時間還沒定，泰國時間）';
  return studentFacingTimeLabel(optionToDate(opt), studentTz);
}
function formatOfferOptionForTeacher(opt) {
  if (!opt || !opt.date) return '-';
  return opt.date + (opt.time ? ' ' + opt.time : '（時間未定）') + '（泰國時間）';
}

// 2026-07-16 加：學生自己申請的取消，老師處理完（status='acknowledged'）之後，
// 在「原本課堂那天結束之前」，學生還是可以來「查看／聯絡老師」（不能再改選課堂了，
// 因為 Calendar 已經真的被刪掉，改用「查看＋聯絡老師」比較安全，跟老師發起那邊
// phase 2 的做法一致，只是老師發起的用 teacherCancelNoticeBanner 顯示，這裡是學生
// 自己發起的，用同一張卡片位置（pendingRequestCard）顯示）。
// 用字串比較日期（'YYYY-MM-DD' 字典序＝時間順序，不用轉成真正的 Date 比較），
// 用泰國時間當「今天」的基準（跟 original_date 存的時區一致）。
async function loadStudentRecentAcknowledgedCancelCard(token, el) {
  try {
    var todayStr = formatInTz(new Date(), TEACHER_TZ).dateStr;
    // 2026-07-19 改：直接 select 會被 RLS 擋掉（見 studentFetchRequests 的說明），改走 RPC。
    // RPC 只吃 type/status/initiated_by，剩下的兩個條件（不是老師發起的、原本課堂還沒過）
    // 在這裡自己過濾，行為跟舊版完全一樣。
    var res = await studentFetchRequests(token, { requestType: 'cancel', status: 'acknowledged', limit: 10 });
    var mine = res.rows.filter(function (x) {
      return x.initiated_by !== 'teacher' && (x.original_date || '') >= todayStr;
    });
    if (res.error || !mine.length) { el.innerHTML = ''; return; }
    var r = mine[0];
    window._myPendingRequest = r;
    el.innerHTML = '<div class="card">' +
      '<h2>✅ 取消申請已處理</h2>' +
      '<p style="font-size:0.85rem;color:var(--ink-muted);font-family:\'Noto Sans TC\',sans-serif;margin-bottom:10px;">原本課堂：' + escHtml((r.original_date || '-') + (r.original_time ? ' ' + r.original_time : '')) + '（已取消）</p>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap;">' +
        '<button class="btn-sm" style="background:none;border:1px solid var(--border);color:var(--ink-muted);" onclick="viewRequestDetail(window._myPendingRequest)">👁️ 查看</button>' +
        '<a class="btn-sm" href="' + LINE_OA_URL + '" target="_blank" rel="noopener" style="background:linear-gradient(135deg,var(--gold-bright) 0%,var(--gold) 50%,var(--gold-deep) 100%);color:#fff;text-decoration:none;display:inline-block;">💬 聯絡老師</a>' +
      '</div>' +
    '</div>';
  } catch (e) { el.innerHTML = ''; }
}

// ── 2026-07-16 新增：老師直接取消課堂 → 學生進網站也要看得到（之前只有 LINE 有通知）──
// 設計跟 dismissedFeedbackIds／dismissedReceipts 同一套模式：關閉過的用 localStorage 記住（本機裝置，依 token 分開存），
// 不動資料庫欄位、不需要額外 schema。LINE 那邊卡片本身沒有按鈕（已經在對話裡了，按了也只是跳回同一頁沒用）；
// 網站這邊才需要「聯絡老師」按鈕，因為學生是從網站要跳出去 LINE。
function getDismissedTeacherCancelIds(token) {
  try { return JSON.parse(localStorage.getItem('dismissedTeacherCancel_' + token) || '[]'); } catch (e) { return []; }
}
function markTeacherCancelDismissed(token, id) {
  try {
    var d = getDismissedTeacherCancelIds(token);
    if (d.indexOf(id) === -1) d.push(id);
    if (d.length > 100) d = d.slice(d.length - 100);
    localStorage.setItem('dismissedTeacherCancel_' + token, JSON.stringify(d));
  } catch (e) {}
}
function dismissTeacherCancelNotice(token, id) {
  markTeacherCancelDismissed(token, id);
  loadTeacherCancelNoticeBanner(token);
}
// 合併卡的「全部關閉」（2026-07-19 加）
function dismissAllTeacherCancelNotices(token, ids) {
  (ids || []).forEach(function(id) { markTeacherCancelDismissed(token, id); });
  loadTeacherCancelNoticeBanner(token);
}

async function loadTeacherCancelNoticeBanner(token) {
  var el = document.getElementById('teacherCancelNoticeBanner');
  if (!el) return;
  try {
    // 2026-07-19 改：直接 select 會被 RLS 擋掉（見 studentFetchRequests 的說明），改走 RPC
    var res = await studentFetchRequests(token, { requestType: 'cancel', status: 'acknowledged', initiatedBy: 'teacher', limit: 10 });
    if (res.error) { el.innerHTML = ''; return; }
    var rows = res.rows;
    var dismissed = getDismissedTeacherCancelIds(token);
    var pending = rows.filter(function(r) { return dismissed.indexOf(r.id) === -1; });
    if (!pending.length) { el.innerHTML = ''; return; }
    // 2026-07-19 改（AI 稽核橘色問題）：以前每一則各一張大卡，手機上 3 則就把「點此進入課堂」
    // 推到第一屏外面（實測按鈕在 y=1024px，手機高度只有 844px）→ 2 則以上合併成一張卡。
    var contactBtn = '<a href="' + LINE_OA_URL + '" target="_blank" rel="noopener" style="display:inline-flex;align-items:center;justify-content:center;min-height:44px;margin-top:10px;background:linear-gradient(135deg,var(--gold-bright),var(--gold-deep));color:#fff;text-decoration:none;border-radius:999px;padding:8px 18px;font-size:0.85rem;font-weight:700;">💬 聯絡老師</a>';
    var closeBtnStyle = 'background:none;border:none;cursor:pointer;font-size:1.1rem;line-height:1;color:var(--amber-dark);opacity:0.6;padding:10px;min-width:44px;min-height:44px;flex-shrink:0;';
    var cardOpen = '<div style="background:var(--gold-light);border:1.5px solid var(--amber);border-radius:12px;padding:14px 16px;margin-bottom:14px;font-family:\'Noto Sans TC\',sans-serif;">';
    if (pending.length === 1) {
      var r = pending[0];
      el.innerHTML = cardOpen +
        '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;">' +
          '<div style="flex:1;">' +
            '<div style="font-weight:700;font-size:0.95rem;color:var(--amber-dark);margin-bottom:4px;">❌ 課堂已取消</div>' +
            '<div style="font-size:0.85rem;color:var(--ink);">老師取消了 ' + escHtml(r.original_date || '-') + ' 這堂課</div>' +
          '</div>' +
          '<button onclick="dismissTeacherCancelNotice(\'' + token + '\',\'' + r.id + '\')" title="關閉" style="' + closeBtnStyle + '">✕</button>' +
        '</div>' + contactBtn + '</div>';
      return;
    }
    var ids = pending.map(function(r) { return r.id; });
    var dates = pending.map(function(r) {
      return '<div style="font-size:0.85rem;color:var(--ink);padding:2px 0;">・' + escHtml(r.original_date || '-') + '</div>';
    }).join('');
    el.innerHTML = cardOpen +
      '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;">' +
        '<div style="flex:1;">' +
          '<div style="font-weight:700;font-size:0.95rem;color:var(--amber-dark);margin-bottom:4px;">❌ 有 ' + pending.length + ' 堂課已取消</div>' +
          dates +
        '</div>' +
        '<button onclick="dismissAllTeacherCancelNotices(\'' + token + '\',' + JSON.stringify(ids).replace(/"/g, '&quot;') + ')" title="全部關閉" style="' + closeBtnStyle + '">✕</button>' +
      '</div>' + contactBtn + '</div>';
  } catch (e) { el.innerHTML = ''; }
}

// 2026-07-16 加（Lin 要求）：老師發起取消 → 不再馬上刪 Calendar，改成先請學生按「我知道了」確認。
// 這裡是學生網站上的確認按鈕（LINE 那邊也有一顆一樣功能的，見 line-webhook 的 ack_teacher_cancel，
// 兩邊哪個先按都算數，按下去馬上互相同步，不是各自本機記憶而已）。
async function loadTeacherCancelAckBanner(token) {
  var el = document.getElementById('teacherCancelAckBanner');
  if (!el) return;
  try {
    // 2026-07-19 改：直接 select 會被 RLS 擋掉（見 studentFetchRequests 的說明），改走 RPC。
    // 「還沒按過我知道了」（teacher_cancel_ack_at is null）在這裡自己過濾。
    var res = await studentFetchRequests(token, { requestType: 'cancel', status: 'pending', initiatedBy: 'teacher', limit: 10 });
    if (res.error) { el.innerHTML = ''; return; }
    var rows = res.rows.filter(function (x) { return !x.teacher_cancel_ack_at; }).slice(0, 5);
    el.innerHTML = rows.map(function(r) {
      return '<div style="background:var(--gold-light);border:1.5px solid var(--amber);border-radius:12px;padding:14px 16px;margin-bottom:14px;font-family:\'Noto Sans TC\',sans-serif;">' +
        '<div style="font-weight:700;font-size:0.95rem;color:var(--amber-dark);margin-bottom:4px;">❌ 老師想取消這堂課</div>' +
        '<div style="font-size:0.85rem;color:var(--ink);margin-bottom:10px;">時間：' + escHtml(r.original_date || '-') + '，請按一下確認收到</div>' +
        '<button onclick="ackTeacherCancel(\'' + token + '\',\'' + r.id + '\')" style="background:linear-gradient(135deg,var(--gold-bright),var(--gold-deep));color:#fff;border:none;border-radius:999px;padding:8px 16px;font-size:0.85rem;font-weight:700;cursor:pointer;">我知道了</button>' +
      '</div>';
    }).join('');
  } catch (e) { el.innerHTML = ''; }
}

async function ackTeacherCancel(token, id) {
  // 2026-07-19 改：直接 update 會被 RLS 擋掉（見 studentPatchRequest 的說明）→ 學生按了
  // 「我知道了」其實從來沒存進資料庫過，老師端因此一直等不到確認。改走 RPC。
  var res = await studentPatchRequest(token, id, { teacher_cancel_ack_at: new Date().toISOString() }, { nullColumn: 'teacher_cancel_ack_at' });
  if (res.error) { alert('⚠️ 確認失敗：' + res.error.message + '\n可以直接用 LINE 聯絡老師比較保險。'); return; }
  if (!res.rows.length) {
    // count=0：可能已經在 LINE 按過了，或老師剛好收回了通知——不管哪一種，重新整理畫面看目前狀態就好
    await loadTeacherCancelAckBanner(token);
    return;
  }
  // 2026-07-16 加：確認後要「彈回去通知老師」，老師才知道可以回網站按「確認刪除」了
  try {
    await fetch(LINE_NOTIFY_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': window.SUPABASE_CONFIG.anonKey, 'Authorization': 'Bearer ' + window.SUPABASE_CONFIG.anonKey },
      // 2026-07-26：ฝั่งนักเรียนไม่ได้ล็อกอิน → ต้องแนบ token ของตัวเองเป็นหลักฐานว่าเป็นนักเรียนจริง
      body: JSON.stringify({ to: 'teacher', fromStudentToken: token, message: 'ℹ️ 學生已確認收到取消通知（' + (res.rows[0].original_date || '-') + '），可以到網站按「確認刪除」了' }),
    });
  } catch (e) { /* 通知老師失敗不影響學生這邊已經確認成功 */ }
  // 2026-07-18 加了又拿掉：Lin 確認網站這裡不用加提示訊息，維持原本按完就悄悄消失的行為。
  // 要改的是 LINE 那邊的回覆文字（見 supabase/functions/line-webhook/index.ts 的 ack_teacher_cancel）
  await loadTeacherCancelAckBanner(token);
}

// 🗑️ 2026-07-31 (รอบ 4) ลบทิ้ง — loadTeacherAddAckBanner / declineTeacherAdd / ackTeacherAdd
//
// ทั้ง 3 ตัวคือระบบเก่า "ครูเสนอเวลา → รอนักเรียนกด 我知道了/婉拒 → ครูค่อยกดลงปฏิทิน"
// Lin สั่งเลิกใช้ตั้งแต่ 2026-07-30 (ครูกดยืนยัน = ลงปฏิทินทันที ไม่ต้องรอนักเรียน)
// วันนั้นยังลบไม่ได้ เพราะกลัวมีคำขอเก่าค้างในฐานข้อมูล แล้วนักเรียนกลุ่มนั้นจะตอบไม่ได้เลย
//
// ✅ 2026-07-31 เช็คแล้ว คิวว่างจริง (Lin รันเองใน Supabase ได้ 0):
//    select count(*) from classroom_requests
//    where request_type='add_class' and initiated_by='teacher' and status='pending';
//    → ไม่มีใครรออยู่แล้ว ลบได้ปลอดภัย
//
// ⚠️ ฝั่ง LINE ลบไม่ได้แบบนี้ — ปุ่มในแชท LINE ค้างอยู่ในประวัติแชทตลอดกาล นักเรียนเลื่อนขึ้นไป
//    กดเมื่อไหร่ก็ได้ → ที่นั่นเปลี่ยนเป็น "ตอบข้อความบอกว่าปุ่มเลิกใช้แล้ว" แทนการลบทิ้ง
//    (supabase/functions/line-webhook/index.ts → ack_teacher_add / decline_add_class)
//    ที่นี่ลบเต็มๆ ได้เพราะเว็บสร้างปุ่มใหม่ทุกครั้งที่เปิดหน้า ไม่มีปุ่มเก่าค้าง
//
// 🚫 ห้ามเอากลับมาไม่ว่าจะดูสมเหตุสมผลแค่ไหน — ดูหัวข้อ 📅 ระบบเพิ่มคาบเรียน ใน CLAUDE.md

// 2026-07-16 改（Lin 要求：最多 3 個時間選項 + 都不方便要通知老師）：
//   accepted 現在要帶 optIndex，指出學生挑的是 proposed_options 裡第幾個——先把那個選項存成
//   requested_date/requested_time（老師「確認並搬 Calendar」讀的就是這兩欄，這樣完全不用改那段
//   既有的搬 Calendar 邏輯），再呼叫既有的 respond_to_offer_as_student RPC 正式把 offer_status
//   翻成 accepted/declined（沿用原本的 RPC，不新增/改動資料庫函式）。
//   不管選了時間還是都不方便，都要彈回去通知老師（老師可能不在電腦前，不然要自己開網站才會知道）。
async function respondToOfferAsStudent(requestId, response, optIndex) {
  if (!confirm(response === 'accepted' ? '確定接受這個時間嗎？' : '確定都不方便這些時間嗎？（老師會收到通知，直接跟你聯絡）')) return;
  const token = urlParams.get('s') || '';
  let chosenOpt = null;
  if (response === 'accepted') {
    const r = window._myPendingRequest;
    const opts = (r && Array.isArray(r.proposed_options) && r.proposed_options.length) ? r.proposed_options : (r ? [{ date: r.requested_date, time: r.requested_time }] : []);
    const idx = (typeof optIndex === 'number') ? optIndex : 0;
    chosenOpt = opts[idx] || null;
    // 2026-07-16 加（稽核發現，RED#2）：以前這裡如果選項對不到，會直接跳過存新時間，
    // 但下面還是照樣送出「已接受」——變成老師之後拿到的是舊的/錯的時間，卻完全沒有警告。
    // 現在改成：對不到就當作失敗，請學生重新整理頁面看最新選項，不能用猜的。
    if (!chosenOpt) { alert('⚠️ 這個選項好像已經失效了（老師可能剛修改過提議），請重新整理頁面看最新的選項再選一次。'); return; }
    // 2026-07-19 改：直接 update 會被 RLS 靜靜擋掉（更新 0 筆又不回 error）→ 學生挑的新時間
    // 根本沒存進去，老師之後看到的還是舊時間，而且完全沒有警告。改走 RPC + 檢查筆數。
    // 🔴 2026-08-01 加 notProcessing (audit ระบบเลื่อนคาบ)：ถ้าครูกำลังจับล็อกและกำลังย้ายคาบอยู่
    //   ห้ามให้นักเรียนเขียนเวลาที่เลือกทับเข้าไป — ครูจะย้ายไปเวลาหนึ่ง แต่ฐานข้อมูลบันทึกอีกเวลาหนึ่ง
    //   (ฐานข้อมูลฝั่ง respond_to_offer_as_student ก็มีด่านเดียวกันแล้ว ดู 2026-08-01_reschedule_guards.sql)
    const upd = await studentPatchRequest(token, requestId, { requested_date: chosenOpt.date, requested_time: chosenOpt.time }, { offerStatus: 'proposed', notProcessing: true });
    // 🟡 2026-08-02 加：แปล error ที่รู้จักเป็นภาษาคนก่อนโชว์ (ด่านใหม่ในฐานข้อมูลจะตีกลับมาที่นี่)
    if (upd.error) {
      var friendlyPick = friendlyRequestError(upd.error.message);
      alert(friendlyPick ? ('⚠️ ' + friendlyPick) : ('⚠️ 儲存選擇失敗：' + upd.error.message + '\n請直接聯絡老師比較保險。'));
      return;
    }
    if (!upd.rows.length) { alert('⚠️ 儲存選擇失敗（這個提議可能已經被老師改過或處理掉了），請重新整理頁面看最新狀態。'); return; }
  }
  const res = await sb.rpc('respond_to_offer_as_student', { p_request_id: requestId, p_token: token, p_response: response });
  if (res.error || res.data !== true) {
    alert('⚠️ 回覆失敗，可能是這個提議已經處理過了，重新整理頁面看看：' + (res.error ? res.error.message : ''));
    return;
  }
  // 2026-07-16 加（稽核發現，ORANGE#4）：學生接受後，重開 48 小時計時器讓「老師確認搬 Calendar」
  // 這一步也會被提醒到（不然可能在「等學生回覆」階段就已經提醒過，老師之後永遠不會再被提醒）。
  // 用既有的「RPC 寫完再補一筆 update」模式，不用改 respond_to_offer_as_student 這個 RPC 本身。
  if (response === 'accepted') {
    try {
      // 2026-07-19 改：直接 update 會被 RLS 擋掉（見 studentPatchRequest 的說明），改走 RPC
      const accUpd = await studentPatchRequest(token, requestId, { offer_accepted_at: new Date().toISOString(), sla_reminder_sent: false }, {});
      if (accUpd.error || !accUpd.rows.length) console.error('⚠️ 重開 48 小時計時器失敗：', accUpd.error ? accUpd.error.message : '更新 0 筆');
    } catch (e) { /* 這步失敗頂多是少一次 48 小時提醒，不影響已經成功的回覆 */ }
  }
  try {
    const timeLabelForTeacher = chosenOpt ? (chosenOpt.date + (chosenOpt.time ? ' ' + chosenOpt.time : '')) : '（時間資料異常，請到網站確認）';
    const msg = response === 'accepted'
      ? ('ℹ️ 學生已經選好新時間（' + timeLabelForTeacher + '），到網站按「確認並搬 Calendar」')
      : '⚠️ 學生說這些時間都不方便，請直接聯絡學生討論';
    // 2026-07-20 加（Lin 要求：都不方便要能直接聯繫學生，不能只有純文字警告）：都不方便時附一顆
    // 「💬 聯繫學生」按鈕——2026-07-20 改：直接在 LINE 裡打字回覆，不用開網站。
    // 2026-07-22 加（Lin 要求：改期也要能直接在 LINE 按一顆按鈕完成，不用開網站）：接受新時間時
    // 也附一顆按鈕，共用 line-webhook 新增的 action=confirm_reschedule_move（跟 confirm_add_class
    // 同一套模式），不管學生是從網站還是從 LINE 回覆的，老師都能直接在 LINE 按完成。
    // 2026-07-26：แนบ token ของนักเรียนเป็นหลักฐาน (สาขา to:'teacher' ไม่เปิดโล่งแล้ว)
    const bodyPayload = { to: 'teacher', fromStudentToken: token, message: msg };
    if (response === 'accepted') {
      bodyPayload.flex = {
        title: 'ℹ️ 學生已經選好新時間',
        bodyText: '時間：' + timeLabelForTeacher + '（泰國時間）\n\n可以直接按下方按鈕搬 Calendar，或到網站處理',
        // 🔴 2026-08-02 (ตรวจ 3 ระบบ ข้อ 4.8): พก d/t = "เวลาที่เขียนอยู่บนการ์ดใบนี้" ไปด้วยเสมอ
        //   ปุ่มใน LINE ค้างในประวัติแชทตลอดกาล — ถ้าเวลาที่ขอถูกแก้ทีหลัง ครูกดปุ่มเก่าแล้วคาบจะไป
        //   โผล่เวลาใหม่โดยไม่มีใครรู้ · ฝั่ง webhook (confirm_reschedule_move) เทียบก่อนย้าย ไม่ตรง = ไม่ย้าย
        //   ⚠️ รูปแบบต้องตรงกับ supabase/functions/line-webhook/index.ts ก้อน confirm_reschedule_move เป๊ะ
        buttons: [{ label: '✅ 確認並搬 Calendar',
          postbackData: 'action=confirm_reschedule_move&request=' + encodeURIComponent(requestId)
            + '&d=' + encodeURIComponent((chosenOpt && chosenOpt.date) || '')
            + '&t=' + encodeURIComponent((chosenOpt && chosenOpt.time) || ''),
          style: 'primary' }],
      };
    } else {
      bodyPayload.flex = {
        title: '⚠️ 學生說這些時間都不方便',
        bodyText: msg,
        buttons: [contactStudentPostbackButton(token)],
      };
    }
    await fetch(LINE_NOTIFY_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': window.SUPABASE_CONFIG.anonKey, 'Authorization': 'Bearer ' + window.SUPABASE_CONFIG.anonKey },
      body: JSON.stringify(bodyPayload),
    });
  } catch (e) { /* 通知老師失敗不影響學生這邊已經回覆成功 */ }
  alert(response === 'accepted' ? '✅ 已回覆，等老師確認完成調整' : '✅ 已回覆，老師會直接聯絡你');
  loadStudentPendingRequestStatus(token);
}

// 通知老師「有學生申請取消/改期」
// 2026-07-06 設計成「LINE 優先、email 保底」，一次涵蓋現在跟未來：
//   - 現在：LINE Edge Function 還沒 deploy → 呼叫會失敗 → 自動 fallback 寄 email（Web3Forms，跟繳費通知同一把 key，已驗證能用）
//   - 之後：Lin 把 supabase_functions_notify-line_index.ts 部署好、設定好 secret 之後
//     → 同一段程式碼會自動改成走 LINE 通知，完全不用再改這裡的程式
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
  try {
    var isCancel = d.type === 'cancel';
    var isAdd = d.type === 'add_class';
    var isReschedule = !isCancel && !isAdd;
    var addRows = isAdd && Array.isArray(d.rows) && d.rows.length ? d.rows : null;
    // 2026-07-15 加：type='add_class'（學生自己申請加課，沒有「原本課堂」這回事）獨立出文案，
    // 不然會照 isCancel=false 的舊邏輯誤顯示成「申請改期」+「原本課堂日期：-」，讓老師看不懂。
    var subject = (isCancel ? '❌ 學生申請取消課程 — ' : isAdd ? ('➕ 學生申請加課' + (addRows && addRows.length > 1 ? '（' + addRows.length + ' 個時段）' : '') + ' — ') : '🔄 學生申請改期 — ') + (d.name || '學生');
    // 2026-07-10 加：直接附 Google Calendar 那一天的連結，點了就直接開到正確日期（在 LINE 裡點也會開）
    // 2026-07-16 改（Lin 要求：改期也簡化成一顆按鈕）：只有「加課」還需要這條 Calendar 連結
    // （老師要自己去那天新增），取消／改期現在都走「到網站處理」單一按鈕，不用另外開 Calendar 連結。
    // 2026-07-20 加：多筆時段橫跨不同天，不清楚要開哪一天，只有剛好只有 1 筆時才附這顆連結。
    var calDateStr = isAdd ? ((addRows && addRows.length === 1 ? addRows[0].newDate : (!addRows ? (d.requestedDate || d.originalDate) : null))) : null;
    var calLink = null;
    if (calDateStr && /^\d{4}-\d{2}-\d{2}/.test(calDateStr)) {
      var _p = calDateStr.split('-');
      calLink = 'https://calendar.google.com/calendar/r/day/' + parseInt(_p[0],10) + '/' + parseInt(_p[1],10) + '/' + parseInt(_p[2],10);
    }
    // 2026-07-16 改：取消／改期的網站連結都帶 #req-row-<id> 直接跳到這筆申請的卡片
    // （見 scrollToRequestFromHash）。沒有 requestId（理論上不會發生，保險起見還是防一下）
    // 就退回沒有 # 的舊版連結，最多就是老師自己要滑一下找，不會壞掉。
    // 2026-07-20 改（順手修）：加課現在也一起帶 # 了（以前特地排除 isAdd，但 scrollToRequestFromHash
    // 本來就認得住所有 req-row-<id>，加課申請的卡片也是同一個 id，之前沒有理由不給，順便讓
    // 「📋 到網站處理」在加課卡片也能直接跳到那張卡片，不用自己滑）。多筆時用第一筆的 id 跳頁。
    var siteLinkId = (addRows && addRows[0] && addRows[0].requestId) || d.requestId;
    var siteLink = 'https://mrtaihualin.com/classroom/' + (siteLinkId ? ('#req-row-' + encodeURIComponent(siteLinkId)) : '');

    // 2026-07-16 加（Lin 要求：最多可以給 3 個時間選項）：改期把候選時間全部列出來，
    // 老師一眼就看到全部選項，不用點進網站才知道有幾個。
    var optionsText = '';
    if (isReschedule && Array.isArray(d.options) && d.options.length) {
      // 2026-07-17 改（Lin 要求）：「泰國時間」這個註記寫在最後一行講一次就好，
      // 不用每個選項後面都重複寫一次。
      optionsText = '\n' + d.options.map(function (opt, i) {
        return '選項' + (i + 1) + '：' + (opt.date || '-') + (opt.time ? ' ' + opt.time : '');
      }).join('\n') + '\n（以上都是泰國時間）';
    }

    // 2026-07-20 加：多筆加課申請的內容列表——每筆列出日期/時間，有勾「每週固定」的話也列出來
    // （跟老師端 addClassDayTimeLabel 同樣的資訊，但用學生申請的欄位名稱）。
    var addRowsText = addRows ? addRows.map(function (r, i) {
      var label = (r.newDate || '-') + (r.newTime ? ' ' + r.newTime : '');
      var recur = r.recurring ? '（每週固定' + (r.untilVal ? '，固定到 ' + r.untilVal : '，沒有結束日') + '）' : '';
      return (addRows.length > 1 ? (i + 1) + '. ' : '') + label + recur;
    }).join('\n') : null;

    var message = '學生：' + (d.name || '-') + '\n類型：' + (isCancel ? '申請取消' : isAdd ? '申請加課' : '申請改期')
      // 2026-07-17 加（Lin 要求）：原本課堂要連時間一起講，不能只有日期。
      + (isAdd ? '' : ('\n原本課堂日期：' + (d.originalDate || '-') + (d.originalTime ? ' ' + d.originalTime : '') + '（泰國時間）'))
      + (addRows ? ('\n想約：\n' + addRowsText) : (isAdd ? ('\n想約：' + (d.requestedDate || '-') + (d.requestedTime ? ' ' + d.requestedTime : '')) : ''))
      + optionsText
      + (d.note ? '\n備註：' + d.note : '')
      + (isAdd && calLink ? ('\n\n🔗 點此開 Google Calendar：' + calLink) : '')
      // 2026-07-20 改（Lin 回報「檢查加課還有什麼問題」時發現）：以前這段文字是給 LINE flex
      // 訊息當備用純文字用的，但 notify-line 現在只要有帶 flex 就完全不會用到這段文字——
      // 這段文字唯一還會真的被看到的地方，是 LINE 整個推播失敗時的「email 備援」(sendEmailFallback)。
      // Email 是純文字，完全沒有按鈕可以按，「請點下方按鈕」這句話在 email 裡是錯的、老師看了會
      // 找不到按鈕在哪——改成直接附網站連結文字，不管是加課還是取消/改期都能直接點連結過去。
      + '\n\n請直接到網站處理：' + siteLink
      + (isAdd ? '（「📋 學生申請改期/取消」按「📅 開始安排」確認沒有衝突後排進課表）' : '');

    function sendEmailFallback() {
      fetch('https://api.web3forms.com/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify({ access_key: 'b3bfdb97-19dd-4910-bd15-89720be846c2', subject: subject, from_name: '線上教室系統', message: message })
      }).catch(function(){});
    }

    // 2026-07-13 改：不再放「✅ 已處理／❌ 婉拒」這種能直接從 LINE 完成的按鈕了——
    // 現在「處理」牽涉到自動搜尋+搬/刪 Google Calendar，Edge Function 沒有老師的 Google 授權做不到，
    // 從 LINE 按下去只會誤以為處理完成，Calendar 其實完全沒被動到（RELIABILITY FIRST，寧可少一顆按鈕
    // 也不要讓老師誤判）。改成純連結：開 Calendar + 到網站處理。
    // 2026-07-16 改（Lin 要求）：「申請取消」「申請改期」這兩種只留一顆「📋 到網站處理」按鈕，
    // 直接連到那筆申請卡片的位置，不用再多一顆「開 Calendar」。加課維持原本 2 顆按鈕，沒有改動。
    // 2026-07-19 加（Lin 要求：LINE 一鍵刪除）：現在有 Google service account 了，line-webhook
    // 可以自己刪 Calendar，不會再有「按了以為處理完但 Calendar 沒動到」的風險（見 line-webhook
    // action=confirm_cancel_delete）。
    // 2026-07-22 改（Lin 回報：申請改期系統不完整）：改期以前說「需要老師先選新時間，沒辦法一鍵完成」，
    // 現在改成「每個候選時間各一顆按鈕」（見下面 flexRows 組裝＋action=confirm_reschedule_pick），
    // 老師直接在 LINE 挑一個按下去就搬 Calendar，也能一鍵完成了。
    // 2026-07-20 改（Lin 檢查 mockup 後要求，見 _แผนงาน/ทำต่อ_2026-07-20.md）：
    //   ・申請加課：加「🔍 檢查是否衝突」（LINE 內直接查 Google Calendar，服務帳號有讀取權限）
    //     跟「💬 聯繫學生」（開網站聯絡視窗），跟網站上請求佇列卡片的按鈕看齊；
    //     「📋 到網站處理」保留當備援——實際「排進 Calendar」還是要開「➕ 加課堂時間」那個小視窗，
    //     LINE 這裡沒有對應的完整流程可以做。
    //   ・申請取消：「✅ 確認並刪除課程」已經能在 LINE 內完成整個流程了，拿掉「📋 到網站處理」
    //     （不需要再多一顆備援連結）。
    //   ・申請改期（學生自己送出的）：「📋 到網站處理」換成「💬 聯繫學生」（老師通常是想直接
    //     聯絡學生討論時間，不是想跳去卡片本身）。
    // 2026-07-20 再改（Lin 看過上面這版 mockup 後又要求，第二輪）：申請加課要能「完全在 LINE 處理
    // 完，不用開網站」——拿掉「🔗 開 Calendar」跟「📋 到網站處理」這兩顆，每個時段改成一顆
    // 「✅ 確認新增：<日期時間>」（沿用既有 action=confirm_add_class，見下面按鈕組裝；webhook 端
    // 那個 action 原本規定一定要等學生先按「我知道了」才能按，現在放寬成：只有「老師自己提議的
    // 時段」才需要等學生確認，「學生自己申請」的時段本來就是學生指定好的，老師按這顆等於直接批准，
    // 不用再多繞一圈——見 line-webhook/index.ts confirm_add_class 的 initiated_by 判斷）。
    var flexButtons = [];
    var flexRows = [];
    // 2026-07-20（第二輪，Lin 看過 mockup 後要求）：學生自己申請加課（➕ 申請加課）這張卡片，
    // 老師要能「完全在 LINE 裡處理完，不用開網站」——拿掉「🔗 開 Calendar」跟「📋 到網站處理」，
    // 改成每個時段一顆「✅ 確認新增」（沿用既有 action=confirm_add_class，webhook 那邊已經放寬
    // 只有 initiated_by==='teacher' 才需要等學生先按「我知道了」，學生自己申請的直接讓老師這裡按
    // 就直接建 Calendar）。「🔍 檢查是否衝突」維持不變，「💬 聯繫學生」也維持不變。
    // 2026-07-20 再改（Lin 看到「接受/婉拒」那張卡的新排版後要求同一套規格）：這裡以前也是把
    // 日期時間整個寫進按鈕文字裡（「🔍 查衝突：7/21 05:30」），變成每個時段兩顆各自佔一整行的
    // 長按鈕，跟之前那個 bug 是同一個問題，一起改成「一行＝日期時間文字＋兩顆小按鈕排右邊」。
    if (isAdd && addRows) {
      addRows.forEach(function (r) {
        var label = (r.newDate || '-') + ' ' + (r.newTime || '');
        flexRows.push({
          label: label,
          buttons: [
            { label: '查衝突', postbackData: 'action=check_conflict&request=' + encodeURIComponent(r.requestId) },
            { label: '確認新增', postbackData: 'action=confirm_add_class&request=' + encodeURIComponent(r.requestId), style: 'primary' },
          ],
        });
      });
      flexButtons.push(contactStudentPostbackButton(d.token));
    } else if (isAdd && d.requestId) {
      var singleLabel = (d.requestedDate || '-') + ' ' + (d.requestedTime || '');
      flexRows.push({
        label: singleLabel,
        buttons: [
          { label: '查衝突', postbackData: 'action=check_conflict&request=' + encodeURIComponent(d.requestId) },
          { label: '確認新增', postbackData: 'action=confirm_add_class&request=' + encodeURIComponent(d.requestId), style: 'primary' },
        ],
      });
      flexButtons.push(contactStudentPostbackButton(d.token));
    } else if (isCancel && d.requestId) {
      flexButtons.push({ label: '✅ 確認並刪除課程', postbackData: 'action=confirm_cancel_delete&request=' + encodeURIComponent(d.requestId) });
    } else if (isReschedule && Array.isArray(d.options) && d.options.length && d.requestId) {
      // 2026-07-22 加（Lin 回報：學生自己申請改期，老師只能到網站處理，系統不完整）：
      // 學生給的 1-3 個候選時間，每個各一行＋一顆「確認搬到這個時間」按鈕，直接在 LINE 完成
      // （沿用新增的 action=confirm_reschedule_pick，跟網站端 teacherPickRescheduleOption 同一套邏輯：
      // 用 calendar_event_id 直接搬，不用姓名+日期猜）。「💬 聯繫學生」保留在下面當備援。
      // 🔴 2026-08-01 加 &d=&t= (audit ระบบเลื่อนคาบ ข้อ B6 — การ์ดเก่าค้างในแชท LINE)
      //   ปุ่มใน LINE ลบไม่ได้ ค้างอยู่ในประวัติแชทตลอดกาล — เดิมปุ่มพกไปแค่ "เลขตัวเลือกที่เท่าไหร่"
      //   แล้วฝั่ง webhook ไปเปิดดูตัวเลือกจากฐานข้อมูล ณ ตอนกด → ถ้านักเรียนแก้ตัวเลือกทีหลัง
      //   ครูกดปุ่มที่เขียนว่า "8/5 14:00" แต่คาบไปลงเวลาใหม่ที่นักเรียนเพิ่งเปลี่ยน โดยไม่มีใครรู้
      //   ตอนนี้ปุ่มพก "เวลาที่สัญญาไว้บนหน้าปุ่ม" ไปด้วย ฝั่ง webhook เทียบก่อนย้าย ไม่ตรง = ไม่ย้าย
      //   ⚠️ รูปแบบนี้ต้องตรงกับ supabase/functions/line-webhook/index.ts (ก้อน confirm_reschedule_pick) เป๊ะ
      //      d = วันที่ (YYYY-MM-DD) · t = เวลา (HH:MM) · ไม่มีเวลา = ส่ง t ว่าง
      //      การ์ดที่ส่งไปก่อนหน้านี้ (ไม่มี d) ฝั่ง webhook ยังรับได้ แต่จะบอกครูว่าเทียบไม่ได้
      d.options.forEach(function (opt, i) {
        var label = (opt.date || '-') + ' ' + (opt.time || '');
        flexRows.push({
          label: label,
          buttons: [
            { label: '確認搬到這個時間', postbackData: 'action=confirm_reschedule_pick&request=' + encodeURIComponent(d.requestId) + '&opt=' + i + '&d=' + encodeURIComponent(opt.date || '') + '&t=' + encodeURIComponent(opt.time || ''), style: 'primary' },
          ],
        });
      });
      flexButtons.push(contactStudentPostbackButton(d.token));
    } else if (isReschedule) {
      // 保底：理論上不會發生（申請改期一定會帶 options），沒有選項資料就只給聯繫學生，不能一鍵搬課
      flexButtons.push(contactStudentPostbackButton(d.token));
    } else {
      // 保底：理論上不會發生（isCancel 沒有 requestId），還是給一顆到網站處理當備援，不會壞掉。
      flexButtons.push({ label: '📋 到網站處理', uri: siteLink });
    }

    // 2026-07-22 改（Lin 要求：申請加課這張卡版面精簡，LINE 卡片裡不用再重複寫「學生／類型／
    // Google Calendar 連結／到網站處理」——這些下面 rows／title 已經有了，只留新的上課時間就好。
    // email 備援 message 維持原本完整版，只有 LINE flex 卡片的 bodyText 改用精簡版）。
    var flexBodyText = message;
    if (isAdd) {
      flexBodyText = (addRows ? addRowsText : ((d.requestedDate || '-') + (d.requestedTime ? ' ' + d.requestedTime : '')));
      if (d.note) flexBodyText += '\n備註：' + d.note;
    } else if (isReschedule) {
      // 2026-07-22 加：同上，候選時間現在改用 rows＋按鈕顯示，bodyText 不用再重複列一次選項文字。
      flexBodyText = '原本：' + (d.originalDate || '-') + (d.originalTime ? ' ' + d.originalTime : '') + '（泰國時間）';
      if (d.note) flexBodyText += '\n備註：' + d.note;
    }

    fetch(LINE_NOTIFY_ENDPOINT, {
      method: 'POST',
      // 2026-07-06 修正：Supabase Edge Function 預設一定要帶 anon key，不然還沒進到我們的程式碼就先被擋 401
      headers: {
        'Content-Type': 'application/json',
        'apikey': window.SUPABASE_CONFIG.anonKey,
        'Authorization': 'Bearer ' + window.SUPABASE_CONFIG.anonKey
      },
      body: JSON.stringify({
        to: 'teacher',
        // 2026-07-26：ช่องทางหลักที่นักเรียนแจ้งครู — แนบ token ของตัวเองเป็นหลักฐานว่าเป็นนักเรียนจริง
        // (d.token ถูกส่งมาจากทุกจุดที่เรียกฟังก์ชันนี้อยู่แล้ว — เช็คแล้วครบทั้ง 5 จุด)
        fromStudentToken: d.token || null,
        message: subject + '\n\n' + message,
        flex: { title: subject, bodyText: flexBodyText, rows: flexRows, buttons: flexButtons }
      })
    }).then(function(r) {
      if (!r.ok) sendEmailFallback(); // Edge Function 還沒部署好／回錯誤 → 改寄 email，不會漏通知
    }).catch(function() {
      sendEmailFallback(); // 連不到 Edge Function（例如還沒部署）→ 改寄 email
    });
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

