// ============================================================
// ➕ 加課堂時間（2026-07-15 新增）
// 用途：(1) Danny 這種「一週上好幾天課」的學生 → 加第 2、第 3 個固定星期幾
//       (2) Edward／米線 這種「不固定，偶爾約課」的學生 → 排單次課
// 同一個工具兩用：勾「🔁 每週固定」＝固定課（可選填「固定到」結束日）／不勾＝只排這一次。
// 流程：選日期時間 → 檢查真的 Google Calendar 是否衝突 → 沒衝突才顯示「確認新增」→
// 按確認才真的建立 Calendar 事件＋寫資料庫（Lin 要求：兩步驟都在同一個視窗完成，不用外部通知）。
// ============================================================
var _addClassDayToken = null;
var _addClassDayPending = null; // เช็คไม่ชนคิวแล้ว รอกดยืนยันอีกที
var _addClassDayFromRequestId = null; // 2026-07-15 加：ถ้าเปิดจาก "📅 開始安排" (คำขอของนักเรียน)
                                       // จำ id ของคำขอไว้ → สร้างสำเร็จค่อย mark ว่าจัดการแล้วอัตโนมัติ
// 🗑️ 2026-07-30 ลบ _addClassDayPrefillSnapshot / _addClassDayEligibleDirectIdx ทิ้ง
// ทั้งคู่มีไว้ตัดสินว่า "แถวนี้ตรงกับที่นักเรียนขอเป๊ะไหม → ลงปฏิทินเลยได้ไหม" เท่านั้น
// ตอนนี้ทุกแถวลงปฏิทินเลยหมดอยู่แล้ว จึงไม่ต้องเทียบอะไรอีก
// 2026-07-30 加：คาบ "🔁 每週固定" ที่ไม่ได้ใส่ "固定到" = ไม่มีวันจบ เช็คชนย้อนไปข้างหน้าไม่รู้จบไม่ได้
// → กำหนดเพดานไว้ 12 สัปดาห์ (~3 เดือน) ครอบคอร์สปกติของ Lin ได้สบาย และยิง Google แค่ครั้งเดียวต่อแถว
var RECURRING_CHECK_MAX_WEEKS = 12;


// 2026-07-30 加：กาง 1 แถวที่ครูกรอก ออกเป็น "คาบจริงทุกครั้ง" (คาบเดี่ยว = 1 ครั้ง, ทุกสัปดาห์ = หลายครั้ง)
// ใช้ 2 ที่: (1) เช็คว่าชนกันเองในชุดเดียวกันไหม (2) เช็คว่าชนกับ Google Calendar ไหม
// กรุงเทพไม่มี daylight saving และ teacherTimeToDate ตรึง +07:00 ไว้ → บวกทีละ 7 วันได้ตรงเป๊ะเสมอ

async function checkFreebusyConflict(startIso, endIso) {
  let calToken = await gdGetToken();
  // 2026-07-15 加：舊 token 可能只有 calendar.events（沒有 freebusy）→ 強制補權限一次，
  // 避免又出現 403 insufficient authentication scopes
  if (gdTokenScopes && gdTokenScopes.indexOf('freebusy') === -1) {
    calToken = await gdGetToken(true);
  }
  const r = await fetch('https://www.googleapis.com/calendar/v3/freeBusy', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + calToken, 'Content-Type': 'application/json' },
    body: JSON.stringify({ timeMin: startIso, timeMax: endIso, items: [{ id: 'primary' }] }),
  });
  if (!r.ok) throw new Error('檢查行事曆失敗（' + r.status + '）：' + (await r.text()).slice(0, 200));
  const data = await r.json();
  return (data.calendars && data.calendars.primary && data.calendars.primary.busy) || [];
}

// prefill（選填）：{ date, time, requestId } — 從學生「➕ 申請加課」的申請單帶入日期/時間，
// 老師不用自己重打一次；requestId 記起來，建立成功後自動把那筆申請標記完成。
async function openAddClassDayModal(token, prefill) {
  _addClassDayToken = token;
  _addClassDayPending = null;
  _addClassDayFromRequestId = (prefill && prefill.requestId) || null;
  const s = studentsCache[token];
  document.getElementById('addClassDayStudentLabel').textContent = '學生：' + (s ? s.name : token);
  resetAddClassDayRows(prefill); // 重設回只有 1 筆（清掉上次開視窗殘留的多筆 row）
  document.getElementById('addClassDayResult').innerHTML = prefill && prefill.note
    ? ('<div style="color:var(--ink-muted);">📝 學生備註：' + escHtml(prefill.note) + '</div>') : '';
  document.getElementById('addClassDayModal').classList.add('open');
  await renderAddClassDayExistingList(token);
  renderAddClassDayQuotaHint(token); // ไม่ await: แค่ข้อมูลประกอบ ไม่ควรหน่วงให้ครูรอเปิดหน้าต่าง
}

// 🟠 2026-07-30 加（稽核發現）：ตอน "ขอยกเลิก/ขอเลื่อน" ระบบเช็คโควตาคาบที่เหลืออยู่แล้ว
// แต่ตอน "เพิ่มคาบ" ไม่เคยเช็คเลย → ครูอาจเผลอเพิ่มคาบให้คนที่คาบหมดแล้วโดยไม่รู้ตัว
// Lin เลือกไว้ว่า "เตือนอย่างเดียว ไม่บล็อก" (เผื่อกรณีเรียนก่อนจ่ายทีหลัง/คาบแถม) → โชว์เป็นบรรทัดเตือนเฉยๆ
async function renderAddClassDayQuotaHint(token) {
  var el = document.getElementById('addClassDayQuotaHint');
  if (!el) return;
  el.style.display = 'none';
  el.textContent = '';
  // กันข้อมูลคนละคน: ถ้าครูปิดแล้วเปิดของนักเรียนอีกคนก่อนที่อันนี้จะโหลดเสร็จ ห้ามเขียนทับ
  var writeIfStillSame = function (color, text) {
    if (_addClassDayToken !== token) return;
    el.style.display = 'block'; el.style.color = color; el.textContent = text;
  };
  try {
    var payRes = await sb.rpc('get_student_payments', { p_token: token });
    var attRes = await sb.rpc('get_student_attendance', { p_token: token });
    // อ่านไม่ได้ = ต้องบอกว่าอ่านไม่ได้ ห้ามเงียบแล้วปล่อยให้เข้าใจว่าโควตาเหลือเยอะ (RELIABILITY FIRST)
    if (payRes.error || attRes.error) {
      writeIfStillSame('#b45309', '⚠️ 讀不到這位學生的剩餘堂數，請自己確認過再加課');
      return;
    }
    var q = computeCurrentCourse(payRes.data || [], attRes.data || []);
    if (!q.hasCourse) {
      writeIfStillSame('#b45309', '⚠️ 這位學生目前沒有進行中的課程（沒有繳費紀錄）——還是可以加課，但請自己確認一下');
    } else if (q.remain <= 0) {
      writeIfStillSame('#b45309', '⚠️ 這位學生本輪堂數已經用完（買 ' + q.bought + ' 堂，已上 ' + q.used + ' 堂）——還是可以加課，但請自己確認一下');
    } else if (q.remain <= 2) {
      writeIfStillSame('#b45309', '⚠️ 這位學生本輪只剩 ' + q.remain + ' 堂');
    } else {
      writeIfStillSame('var(--ink-muted)', 'ℹ️ 這位學生本輪還剩 ' + q.remain + ' 堂');
    }
  } catch (e) {
    writeIfStillSame('#b45309', '⚠️ 讀不到剩餘堂數（' + (e.message || e) + '），請自己確認');
  }
}
function closeAddClassDayModal() {
  document.getElementById('addClassDayModal').classList.remove('open');
  _addClassDayToken = null;
  _addClassDayPending = null;
  _addClassDayFromRequestId = null;
}

// 進入點：老師從「📋 學生申請改期/取消」清單按「📅 開始安排」加課申請
// 帶 recurring/untilVal เข้ามาด้วย เผื่อคำขอเก่าที่นักเรียนเคยติ๊ก "ทุกสัปดาห์" ไว้ (ตอนนี้ฝั่งนักเรียนติ๊กไม่ได้แล้ว)
function handleAddClassRequest(id) {
  var r = (window._classRequestCache || {})[id];
  if (!r) return;
  openAddClassDayModal(r.token, {
    date: r.requested_date, time: r.requested_time, note: r.note, requestId: id,
    recurring: !!r.proposed_recurring, untilVal: r.proposed_until || null
  });
}
function onAddClassDayRecurringChange(idx) {
  const checked = document.getElementById('addClassDayRecurring_' + idx).checked;
  document.getElementById('addClassDayUntilWrap_' + idx).style.display = checked ? 'block' : 'none';
  invalidateAddClassDayCheck();
}

// ════════════════════════════════════════════════════════════════════════════
// 🔴 2026-07-31 เพิ่ม (ข้อ #2 ในรายงานตรวจ) — "ผลตรวจเก่า" ต้องหมดอายุทันทีที่ครูแก้ฟอร์ม
//
// พังยังไงถ้าไม่มีตัวนี้:
//   ครูกด 🔍 檢查是否衝突 กับ 8/5 20:00 → ขึ้น ✅ ไม่ชน (ระบบ "ถ่ายรูป" ค่าไว้ที่ _addClassDayPending)
//   ครูเห็นว่าผิด แก้เป็น 21:00 → กด ✅ 確認新增
//   → confirmAddClassDayAll อ่านแต่รูปถ่ายเก่า ไม่เคยกลับไปดูฟอร์มอีกเลย
//   → สร้างคาบ 20:00 และส่ง LINE บอกนักเรียนว่า 20:00 ทั้งที่จอครูขึ้น 21:00 · ไม่มีอะไรบอกใบ้เลย
//   เกิดเหมือนกันกับ: เอาติ๊ก 🔁 每週固定 ออก / กด ＋ เพิ่มแถว / กด － ลบแถว / แก้ 固定到
//
// ทำไมไม่แก้ให้ "อ่านฟอร์มสดตอนกดยืนยัน" แทน:
//   การสร้างจากรูปถ่ายที่ตรวจแล้ว = ปลอดภัยกว่า เพราะสร้างเฉพาะสิ่งที่ผ่านด่านตรวจชนจริงแล้ว
//   ถ้าเปลี่ยนไปอ่านฟอร์มสด จะกลายเป็น "สร้างของที่ไม่เคยตรวจ" ซึ่งแย่กว่าเดิม
//   → เก็บพฤติกรรมเดิมไว้ แต่ทำให้ "จอเลิกโกหก": แก้อะไรปุ๊บ ปุ่มยืนยันตายทันที ต้องกดตรวจใหม่
//
// ทำไมดักที่กล่องแม่ (#addClassDayRows) ไม่ใช่ไปเติม onchange ทีละช่อง:
//   ทุกช่องกรอกถูกสร้างด้วย addClassDayRowHtml → ถ้าเติมทีละช่อง วันหลังมีคนเพิ่มช่องใหม่
//   จะลืมเติมแน่นอน แล้วรูนี้จะกลับมาเงียบๆ · ดักที่กล่องแม่ครั้งเดียว ครอบทุกช่องทั้งที่มีอยู่และที่จะเพิ่ม
// ════════════════════════════════════════════════════════════════════════════
var _addClassDayInvalidateBound = false;
function bindAddClassDayInvalidate() {
  if (_addClassDayInvalidateBound) return;
  var container = document.getElementById('addClassDayRows');
  if (!container) return;
  container.addEventListener('input', invalidateAddClassDayCheck);
  container.addEventListener('change', invalidateAddClassDayCheck);
  _addClassDayInvalidateBound = true;
}
function invalidateAddClassDayCheck() {
  // ไม่มีผลตรวจค้างอยู่ = ไม่มีอะไรต้องทำ (กันไปเขียนทับสรุปผลที่เพิ่งโชว์ให้ครูดู)
  if (!_addClassDayPending) return;
  _addClassDayPending = null;
  // ⚠️ แตะเฉพาะ "ปุ่มยืนยัน" ตัวเดียว ห้ามล้าง addClassDayResult ทั้งกล่อง
  //    เพราะในกล่องนั้นมีสรุปผลตรวจ/ผลสร้างคาบที่ครูยังต้องอ่านอยู่
  var btn = document.getElementById('addClassDayConfirmBtn');
  if (!btn) return;
  btn.outerHTML = '<div id="addClassDayConfirmBtn" style="width:100%;margin-top:8px;padding:10px 12px;border:1.5px dashed var(--amber);'
    + 'border-radius:10px;background:var(--cream);color:var(--amber-dark);font-family:\'Noto Sans TC\',sans-serif;'
    + 'font-weight:700;font-size:0.86rem;text-align:center;">⚠️ 內容已修改，請重新按「🔍 檢查是否衝突」</div>';
}

// โชว์ให้ Lin เห็นว่าตอนนี้นักเรียนคนนี้มีวันประจำอะไรอยู่แล้วบ้าง (กันลืม/ซ้ำ)
async function renderAddClassDayExistingList(token) {
  const el = document.getElementById('addClassDayList');
  if (!el) return;
  el.textContent = '讀取中…';
  const dayZh = ['日','一','二','三','四','五','六'];
  const parts = [];
  try {
    const s = studentsCache[token];
    if (s && s.pending_recurring && s.pending_start_date && s.pending_class_time) {
      const wd = thaiDateWeekday(s.pending_start_date);
      parts.push('週' + dayZh[wd] + ' ' + s.pending_class_time + '（原本的固定課）');
    }
    // 2026-07-26：เรียงตามเวลาด้วย — ตอนนี้วันเดียวกันมีได้หลายรอบเวลา ถ้าไม่เรียง ลำดับจะสุ่มไปมา
    const { data, error } = await sb.from('classroom_recurring_days').select('weekday,start_time,end_time').eq('token', token).order('weekday').order('start_time');
    if (error) throw error;
    (data || []).forEach(function(r) {
      parts.push('週' + dayZh[r.weekday] + ' ' + r.start_time + (r.end_time ? '–' + r.end_time : '') + '（用「加課堂時間」新增）');
    });
    el.innerHTML = parts.length ? ('目前已經有的固定上課日：<br>' + parts.map(escHtml).join('<br>')) : '目前沒有已設定的每週固定上課日';
  } catch (e) {
    el.textContent = '（讀不到目前的固定課表，不影響繼續新增，錯誤：' + (e.message || e) + '）';
  }
}


// ════════════════════════════════════════════════════════════
// 2026-07-20 加（Lin 要求：加課要能一次加好幾筆時間，不用重複開視窗好幾次）
// 老師端「➕ 加課堂時間」的「日期＋開始時間＋固定/固定到」那組欄位改成可以「➕ 再加一筆時間」
// 複製好幾份——每份是一個獨立的 DOM row（id 帶 idx 後綴），永不重新產生已經存在的 row
// （避免使用者已經填的值被清掉）。學生端「➕ 申請加課」用同一套邏輯（見 addReqRowHtml 等）。
// TIME_HOUR_OPTIONS_HTML / TIME_MIN_OPTIONS_HTML 兩邊共用，不用各自複製一份 24 小時的 <option>。
// ════════════════════════════════════════════════════════════
var TIME_HOUR_OPTIONS_HTML = '<option value="">--</option>' +
  Array.from({ length: 24 }, function (_, i) { var h = String(i).padStart(2, '0'); return '<option value="' + h + '">' + h + '</option>'; }).join('');
var TIME_MIN_OPTIONS_HTML = '<option value="">--</option><option value="00">00</option><option value="30">30</option>';

// 2026-07-20 加（Lin 要求：「ทำให้ไม่เผลอได้ไหม」——กังวลว่าครูจะเผลอ + เพิ่มคาบที่นักเรียนไม่ได้ขอ
// ปนกับคาบที่นักเรียนขอเองในโมดัลเดียวกัน）：ให้ทุกแถวมีป้ายชัดเจนว่า "นักเรียนขอเวลานี้เอง" (แถวที่ตรง
// กับ _addClassDayFromRequestId เสมอเป็น idx 0) หรือ "ครูเพิ่มเอง" (ทุกแถวที่กดปุ่ม + เพิ่มเติม) —
// กันสับสน/กดส่งผิดโดยไม่ตั้งใจ ไม่ใช่แค่ให้ระบบจัดการถูกหลังบ้านเฉยๆ
function addClassDayRowBadgeHtml(kind) {
  if (kind === 'student') {
    return '<div style="background:var(--gold-light);color:var(--gold-deep);border:1px solid var(--border);border-radius:6px;padding:5px 10px;font-family:\'Noto Sans TC\',sans-serif;font-size:0.76rem;font-weight:700;margin-bottom:8px;">📌 學生自己申請的時間 — 確認後直接排進 Calendar，並用 LINE 通知學生結果</div>';
  }
  if (kind === 'teacher') {
    return '<div style="background:var(--cream);color:var(--ink-muted);border:1px solid var(--border);border-radius:6px;padding:5px 10px;font-family:\'Noto Sans TC\',sans-serif;font-size:0.76rem;font-weight:700;margin-bottom:8px;">➕ 老師自己加的時間 — 確認後直接排進 Calendar，並用 LINE 通知學生（學生不方便的話，請他自己按「申請取消課堂」）</div>';
  }
  return '';
}
function addClassDayRowHtml(idx, badgeKind) {
  return '<div class="addClassDayRow" id="addClassDayRow_' + idx + '" style="' + (idx > 0 ? 'border-top:1px solid var(--border);padding-top:10px;margin-top:10px;' : '') + '">' +
    addClassDayRowBadgeHtml(badgeKind) +
    '<label class="settings-label">日期</label>' +
    '<input class="settings-input" id="addClassDayDate_' + idx + '" type="date" />' +
    '<label class="settings-label">開始時間（泰國時間，固定算 1 小時一堂）</label>' +
    '<div style="display:flex;gap:6px;align-items:center;">' +
      '<select class="settings-input" id="addClassDayStart_' + idx + '_h" style="flex:1;text-align:center;margin-bottom:0;" onchange="syncTimeDropdown(\'addClassDayStart_' + idx + '\')">' + TIME_HOUR_OPTIONS_HTML + '</select>' +
      '<span style="font-family:\'Noto Sans TC\',sans-serif;color:var(--ink-muted);font-weight:700;">:</span>' +
      '<select class="settings-input" id="addClassDayStart_' + idx + '_m" style="flex:1;text-align:center;margin-bottom:0;" onchange="syncTimeDropdown(\'addClassDayStart_' + idx + '\')">' + TIME_MIN_OPTIONS_HTML + '</select>' +
    '</div>' +
    '<input type="hidden" id="addClassDayStart_' + idx + '" value="" />' +
    '<label style="display:flex;align-items:center;gap:8px;font-family:\'Noto Sans TC\',sans-serif;font-size:0.88rem;color:var(--ink);margin:10px 0;">' +
      '<input type="checkbox" id="addClassDayRecurring_' + idx + '" onchange="onAddClassDayRecurringChange(' + idx + ')" /> 🔁 每週固定（從這天開始，之後每週都排這個時間）' +
    '</label>' +
    '<div id="addClassDayUntilWrap_' + idx + '" style="display:none;">' +
      '<label class="settings-label">固定到（不填＝一直排下去，沒有結束日）</label>' +
      '<input class="settings-input" id="addClassDayUntil_' + idx + '" type="date" />' +
    '</div>' +
    '<div style="text-align:right;">' +
      '<button type="button" class="btn-ghost addClassDayRemoveBtn" style="display:none;font-size:0.78rem;padding:3px 10px;" onclick="removeClassDayRow(' + idx + ')">－ 移除這筆</button>' +
    '</div>' +
  '</div>';
}
var _addClassDayNextIdx = 0;
function updateAddClassDayRemoveButtons() {
  var rows = document.querySelectorAll('#addClassDayRows .addClassDayRow');
  rows.forEach(function (row) {
    var btn = row.querySelector('.addClassDayRemoveBtn');
    // 2026-07-20 加：แถวที่เป็น "นักเรียนขอเวลานี้เอง" (idx 0 ตอนเปิดจากคำขอ) ห้ามลบเด็ดขาด แม้จะมี
    // หลายแถวอยู่ก็ตาม — กันครูเผลอลบคาบที่นักเรียนขอทิ้ง เหลือแต่คาบที่ตัวเองเพิ่มเอง
    var isLockedStudentRow = _addClassDayFromRequestId && row.id === 'addClassDayRow_0';
    if (btn) btn.style.display = (rows.length > 1 && !isLockedStudentRow) ? '' : 'none';
  });
}
// prefill（選填）：{ date, time, recurring, untilVal } — 從學生已送出的加課申請帶入第一筆的日期/時間
// （2026-07-20 再改：連 recurring/untilVal 一起帶，不然改用「每筆比對」判斷能不能直接排時，
// 表單裡的固定/固定到永遠是空的，跟 snapshot 對不起來）
// badgeKind（選填）：'student'＝這筆是學生自己申請的（通常是 idx 0，從 _addClassDayFromRequestId 開進來時）
//                    'teacher'＝這筆是老師自己按「＋ 再加一筆」加的，沒有 badgeKind＝手動開「➕ 加課堂時間」
//                    (沒有任何學生申請單牽扯進來)，不用顯示任何標籤。
function addClassDayAddRow(prefill, badgeKind) {
  var idx = _addClassDayNextIdx++;
  var container = document.getElementById('addClassDayRows');
  container.insertAdjacentHTML('beforeend', addClassDayRowHtml(idx, badgeKind));
  // 🔴 2026-07-26：ช่องฝั่งครู → ยึดวันนี้เวลาไทย ("固定到" ก็เป็นวันในอนาคตเสมอ ห้ามย้อนหลัง)
  lockDateInputToFuture('addClassDayDate_' + idx);
  lockDateInputToFuture('addClassDayUntil_' + idx);
  if (prefill && prefill.date) document.getElementById('addClassDayDate_' + idx).value = prefill.date;
  if (prefill && prefill.time) setTimeDropdown('addClassDayStart_' + idx, prefill.time);
  if (prefill && prefill.recurring) {
    document.getElementById('addClassDayRecurring_' + idx).checked = true;
    onAddClassDayRecurringChange(idx);
    if (prefill.untilVal) document.getElementById('addClassDayUntil_' + idx).value = prefill.untilVal;
  }
  updateAddClassDayRemoveButtons();
  bindAddClassDayInvalidate();   // 🔴 2026-07-31：ดักการแก้ฟอร์มไว้ครั้งเดียว (ดูคำอธิบายที่ invalidateAddClassDayCheck)
  invalidateAddClassDayCheck();  // เพิ่มแถวใหม่ = ผลตรวจเดิมใช้ไม่ได้แล้ว
  return idx;
}
function removeClassDayRow(idx) {
  var rows = document.querySelectorAll('#addClassDayRows .addClassDayRow');
  if (rows.length <= 1) return; // 不能減到 0 筆
  var el = document.getElementById('addClassDayRow_' + idx);
  if (el) el.remove();
  updateAddClassDayRemoveButtons();
  invalidateAddClassDayCheck(); // 🔴 2026-07-31：ลบแถวแล้วผลตรวจเดิมใช้ไม่ได้ (เดิมลบแล้วยังสร้างแถวที่ลบไปแล้วได้)
}
function resetAddClassDayRows(prefill) {
  var container = document.getElementById('addClassDayRows');
  container.innerHTML = '';
  _addClassDayNextIdx = 0;
  // 2026-07-20 加：idx 0 是「從學生申請單開進來」的那筆才貼 'student' 標籤，手動開的「➕ 加課堂時間」
  // （沒有 requestId，_addClassDayFromRequestId 是 null）不用貼任何標籤。
  addClassDayAddRow(prefill, _addClassDayFromRequestId ? 'student' : null);
}

// 2026-07-20 改（Lin 要求：可以一次加好幾筆時間）：改成迴圈檢查 #addClassDayRows 底下每一個
// .addClassDayRow，全部沒衝突才給「送出/確認」按鈕；只要有一筆有問題就整批擋下來、清楚指出是第幾筆。
// _addClassDayPending 從單一物件改成陣列（每個 row 一個物件），confirmAddClassDay/proposeAddClassDay
// 都改成讀陣列、迴圈處理。
async function checkAddClassDayConflict() {
  const token = _addClassDayToken;
  if (!token) return;
  const resultEl = document.getElementById('addClassDayResult');
  const rowEls = Array.prototype.slice.call(document.querySelectorAll('#addClassDayRows .addClassDayRow'));
  const dayZh = ['日','一','二','三','四','五','六'];

  const rowsInput = [];
  for (let i = 0; i < rowEls.length; i++) {
    const idx = rowEls[i].id.replace('addClassDayRow_', '');
    const n = i + 1;
    const dateVal = document.getElementById('addClassDayDate_' + idx).value;
    const startVal = document.getElementById('addClassDayStart_' + idx).value.trim();
    const recurring = document.getElementById('addClassDayRecurring_' + idx).checked;
    const untilVal = document.getElementById('addClassDayUntil_' + idx).value;
    if (!dateVal) { alert('第 ' + n + ' 筆：請選擇日期'); return; }
    // 🔴 2026-07-26 ชั้นที่ 2：ทั้งวันเริ่มและ "固定到" ห้ามย้อนหลัง
    if (!assertNotPastDate(dateVal, '第 ' + n + ' 筆的日期')) return;
    if (recurring && untilVal && !assertNotPastDate(untilVal, '第 ' + n + ' 筆的「固定到」日期')) return;
    if (!isValidTimeStr(startVal)) { alert('⚠️ 第 ' + n + ' 筆：開始時間格式不對，請用 HH:MM，例如 20:00'); return; }
    // 🟠 2026-08-01 เพิ่มด่านชั้นที่ 3 (ตรวจระบบยกเลิก/เพิ่มคาบ ข้อ 7) — เทียบถึง "ชั่วโมง" ไม่ใช่แค่วัน
    //   assertNotPastDate ข้างบนเทียบแค่วัน → รูที่เหลือคือ "วันนี้ แต่เวลาผ่านไปแล้ว"
    //   เคสจริง: ตอน 20:00 ครูกดยืนยันคาบ "วันนี้ 09:00" ได้สบายๆ = คาบในปฏิทินที่ผ่านไปแล้ว
    //     + นักเรียนได้ LINE ว่า "จัดคาบให้แล้ว" ทั้งที่เวลานั้นผ่านไปตั้งนานแล้ว
    //   ระบบเลื่อนคาบอัปเกรดมาใช้ assertNotPastDateTime แล้วตั้งแต่ 2026-08-01 (ปัญหาเดียวกันเป๊ะ)
    //     ระบบเพิ่มคาบเพิ่งตามมาวันนี้ · ฝั่ง LINE (confirm_add_class) ก็เพิ่มด่านคู่กันแล้ว
    //   ต้องเช็ค "หลัง" isValidTimeStr เพราะต้องมั่นใจก่อนว่าเวลาอ่านออกจริง
    //   ⚠️ ยกเว้นคาบทุกสัปดาห์ (ตรวจซ้ำ 2026-08-01): ตั้งชุดคาบประจำที่เริ่ม "วันนี้ แต่เวลาผ่านไปแล้ว"
    //      เป็นเรื่องปกติ ครั้งถัดไป +7 วันเป็นอนาคตหมด · ของเดิมทำได้มาตลอด ห้ามไปห้ามเขา
    //      (ด่านระดับ "วัน" ข้างบนยังกันวันย้อนหลังของชุดคาบประจำอยู่เหมือนเดิม)
    if (!recurring && !assertNotPastDateTime(dateVal, startVal, '第 ' + n + ' 筆的時間')) return;
    const endTime = addOneHourTimeStr(startVal);
    const startAbs = teacherTimeToDate(dateVal, startVal);
    // 2026-07-23 修正 bug（Lin 回報開始時間選 23:00 一定跳「結束時間要晚於開始時間」）：
    // 以前用 teacherTimeToDate(dateVal, endTime) 重組結束時間，但開始時間是 23:xx 時
    // addOneHourTimeStr 只把小時 wrap 成 00，日期字串沒跟著 +1 天，害「結束」被算成
    // 「同一天 00:xx」，比「23:xx 開始」還早 → 一定判定失敗。改成直接用毫秒算「開始 +1 小時」，
    // 不管跨不跨午夜都一定對，不用管日期字串。
    const endAbs = new Date(startAbs.getTime() + 60 * 60 * 1000);
    if (recurring && untilVal && teacherTimeToDate(untilVal, '23:59').getTime() < startAbs.getTime()) {
      alert('⚠️ 第 ' + n + ' 筆：「固定到」的日期不能早於開課日期'); return;
    }
    rowsInput.push({ dateVal: dateVal, startVal: startVal, endTime: endTime, recurring: recurring, untilVal: untilVal || null, startAbs: startAbs, endAbs: endAbs, n: n });
  }
  if (!rowsInput.length) { alert('至少要有一筆時間'); return; }

  // 🟠 2026-07-30 加（稽核發現）：เดิมไม่มีด่านเช็ค "แถวในชุดเดียวกันชนกันเอง" เลย
  // และ Google Calendar ก็ช่วยไม่ได้ เพราะตอนกดเช็ค คาบพวกนี้ยังไม่ถูกสร้าง มันเลยมองไม่เห็น
  // → ต้องเทียบกันเองก่อน โดยกางเป็นคาบจริงทุกครั้งแล้วดูว่าเวลาทับกันไหม
  //   (ไม่ใช่แค่ "วันที่+เวลาเหมือนกันเป๊ะ" — 20:00 กับ 20:30 ก็ทับกัน 30 นาที และคาบทุกสัปดาห์
  //    2 แถว วันเดียวกันเวลาเดียวกันแต่เริ่มคนละวัน จะไปทับกันตั้งแต่สัปดาห์ที่ 2)
  // ระบบ "ขอเลื่อน" มีด่านทำนองนี้อยู่แล้ว (ดู collectProposeTimeOptions) ตรงนี้ทำให้เท่ากัน
  for (var di = 0; di < rowsInput.length; di++) {
    for (var dj = di + 1; dj < rowsInput.length; dj++) {
      var occA = buildRowOccurrences(rowsInput[di]);
      var occB = buildRowOccurrences(rowsInput[dj]);
      var clash = null;
      for (var ai = 0; ai < occA.length && !clash; ai++) {
        for (var bi = 0; bi < occB.length; bi++) {
          if (occA[ai].start.getTime() < occB[bi].end.getTime() && occA[ai].end.getTime() > occB[bi].start.getTime()) {
            clash = occA[ai]; break;
          }
        }
      }
      if (clash) {
        alert('⚠️ 第 ' + rowsInput[di].n + ' 筆和第 ' + rowsInput[dj].n + ' 筆的時間互相重疊'
          + '（第一次撞到：' + formatThaiDateTimeLabel(clash.start.toISOString()) + '）。\n'
          + '請改成不重疊的時間，或把其中一筆移除再檢查一次。');
        return;
      }
    }
  }

  const btn = document.getElementById('addClassDayCheckBtn');
  btn.disabled = true; btn.textContent = '檢查中…';
  resultEl.innerHTML = '';
  _addClassDayPending = null;
  try {
    const previewLines = [];
    const pendingRows = [];
    let anyConflict = false;
    // 依序檢查（不平行送，避免同時打太多次 Google Calendar API），每一筆都跑一次 checkFreebusyConflict
    for (const row of rowsInput) {
      const wd = thaiDateWeekday(row.dateVal);
      try {
        // 🟠 2026-07-30 แก้ (เจอตอน audit): เดิมคาบ "🔁 每週固定" เช็คชนแค่ "ครั้งแรกครั้งเดียว"
        // สัปดาห์ที่ 2, 3, 4... ไปทับคาบอื่นก็ไม่มีใครรู้ ปล่อยสร้างเลย → ตอนนี้เช็คทุกสัปดาห์จริง
        // วิธี: ยิง freeBusy "ครั้งเดียว" ครอบทั้งช่วง (ครั้งแรก → ครั้งสุดท้าย) แล้วเอาช่วงที่ไม่ว่าง
        // ที่ได้มาเทียบกับแต่ละสัปดาห์เองในเบราว์เซอร์ — ไม่ต้องยิง Google หลายรอบ (เร็ว+ไม่โดนจำกัดโควตา)
        // ไม่ใส่ "固定到" = ไม่มีวันจบ เช็คไปข้างหน้า 12 สัปดาห์พอ (ครอบ ~3 เดือน) แล้วบอกครูตรงๆ
        const occs = buildRowOccurrences(row);
        const busyAll = await checkFreebusyConflict(occs[0].start.toISOString(), occs[occs.length - 1].end.toISOString());
        // เก็บเฉพาะ "ช่วงไม่ว่าง" ที่ทับกับคาบจริงๆ ของเรา (ช่วงกลางสัปดาห์ที่ไม่ตรงเวลาเราไม่นับ)
        const hits = [];
        for (const oc of occs) {
          for (const b of busyAll) {
            if (new Date(b.start).getTime() < oc.end.getTime() && new Date(b.end).getTime() > oc.start.getTime()) {
              hits.push({ oc: oc, b: b });
            }
          }
        }
        if (hits.length) {
          anyConflict = true;
          // escHtml ทีละชิ้น (ไม่ใช่ทั้งก้อน) เพราะต้องเหลือ <br> ไว้ขึ้นบรรทัดใหม่จริงๆ
          const list = hits.map(function (h) {
            return escHtml(formatThaiDateTimeLabel(h.oc.start.toISOString()) + ' ← 撞到 ' + formatThaiDateTimeLabel(h.b.start) + ' – ' + formatInTz(new Date(h.b.end), TEACHER_TZ).timeStr);
          }).join('<br>');
          previewLines.push('<div style="color:#b45309;font-weight:700;">⚠️ 第 ' + row.n + ' 筆（' + escHtml(row.dateVal + ' ' + row.startVal) + (row.recurring ? '，每週固定' : '') + '）跟行事曆衝突：<br>' + list + '</div>');
        } else {
          let previewText = '✅ 第 ' + row.n + ' 筆沒有衝突。' + row.dateVal + '（週' + dayZh[wd] + '）' + row.startVal + '–' + row.endTime + '（泰國時間）';
          previewText += row.recurring ? '，每週固定上課' + (row.untilVal ? '，固定到 ' + row.untilVal : '（沒有結束日，之後每週都排）') : '，只有這一次';
          // 2026-07-30 加：บอกครูให้ชัดว่าเช็คไปกี่สัปดาห์แล้ว (กันเข้าใจผิดว่าเช็คครบตลอดกาล)
          if (row.recurring) {
            // ถึงเพดาน 12 สัปดาห์ "และยังไม่จบคอร์ส" = ยังมีคาบไกลกว่านั้นที่ยังไม่ได้เช็ค ต้องบอกตรงๆ
            // (ถ้า 固定到 พอดี 12 ครั้ง = เช็คครบแล้วจริง ห้ามเตือนหลอกให้ครูตกใจฟรี)
            var lastOccMs = occs[occs.length - 1].start.getTime();
            var untilMsForText = row.untilVal ? teacherTimeToDate(row.untilVal, '23:59').getTime() : null;
            var checkedAll = (untilMsForText !== null) && (lastOccMs + 7 * 24 * 60 * 60 * 1000 > untilMsForText);
            previewText += checkedAll
              ? '（已逐週檢查 ' + occs.length + ' 堂，全部沒撞到）'
              : '（已逐週檢查最近 ' + occs.length + ' 堂，更久以後的還沒檢查，請自己留意）';
          }
          previewLines.push('<div style="color:var(--gold-deep);">' + escHtml(previewText) + '</div>');
          // 🟡 2026-07-31 (ข้อ #21)：ติดธง "แถวนี้คือคาบที่นักเรียนขอมาเอง" ไปกับตัวแถวเลย
          //   เดิมตอนสร้างใช้ตำแหน่ง (แถวลำดับ 0) เป็นตัวตัดสินว่าจะปิดคำขอของนักเรียนใบไหน
          //   → พอมีแถวสร้างไม่สำเร็จแล้วระบบสร้างฟอร์มใหม่จากแถวที่เหลือ ตำแหน่งจะขยับ
          //     แถวที่ "ครูเพิ่มเอง" อาจไปปิดคำขอของนักเรียนแทน = นักเรียนได้ LINE ว่าจัดให้แล้ว
          //     ทั้งที่คาบที่เขาขอยังไม่ได้ถูกสร้าง
          //   ธงติดกับตัวแถว ตำแหน่งขยับยังไงก็ไม่หลุด
          pendingRows.push({ token: token, dateVal: row.dateVal, startVal: row.startVal, endTime: row.endTime, recurring: row.recurring, untilVal: row.untilVal, weekday: wd,
            isStudentRow: (row.n === 1 && !!_addClassDayFromRequestId) });
        }
      } catch (e) {
        anyConflict = true; // 檢查失敗當作不能繼續，避免漏檢查到有衝突卻放行
        previewLines.push('<div style="color:#b45309;">第 ' + row.n + ' 筆檢查失敗：' + escHtml(e.message || String(e)) + '</div>');
      }
    }

    if (anyConflict) {
      resultEl.innerHTML = previewLines.join('') + '<div style="margin-top:6px;font-weight:400;color:#b45309;">請調整有問題的時段後再檢查一次（全部都沒問題才能送出）。</div>';
      return;
    }
    _addClassDayPending = pendingRows;
    // ════════════════════════════════════════════════════════════════════
    // 2026-07-30 改（Lin สั่ง — แทนที่กฎ 2026-07-18 และ 2026-07-24 ทั้งคู่）:
    // เลิกใช้ระบบ "ส่งไปให้นักเรียนกดยอมรับก่อน แล้วครูค่อยกลับมากดยืนยัน" ทั้งหมด
    // ตอนนี้ไม่ว่าจะเป็นคาบที่ "นักเรียนขอมาเอง" หรือ "ครูคิดเพิ่มเอง" → ครูกดยืนยัน = ลง Calendar ทันที
    // แล้วส่ง LINE บอกนักเรียนว่าเพิ่มให้แล้ว
    // ถ้านักเรียนไม่สะดวก → นักเรียนกดปุ่ม "申請取消課堂" ที่มีอยู่แล้วเอง (ไม่ต้องมีปุ่ม 婉拒 อีก)
    // ถ้าครูรับเวลาที่นักเรียนขอไม่ได้ → ครูกด "💬 聯繫學生" คุยใน LINE แล้วกดปิดคำขอ
    //   (ไม่มีระบบ "เสนอเวลาใหม่" ในเส้นทางเพิ่มคาบอีกต่อไป — ระบบขอเลื่อน/改期 ยังมีเหมือนเดิม ไม่แตะ)
    // → เลยเหลือปุ่มเดียว ไม่มีสาขาแยกอีกแล้ว
    // ════════════════════════════════════════════════════════════════════
    // 🔴 2026-07-31：ใส่ id ให้ปุ่มนี้ เพื่อให้ invalidateAddClassDayCheck() หาเจอแล้วเปลี่ยนเป็นคำเตือน
    //    ตอนครูแก้ฟอร์มหลังกดตรวจ (แตะเฉพาะปุ่ม ไม่ล้างสรุปผลตรวจที่อยู่เหนือมัน)
    var btnHtml = '<button id="addClassDayConfirmBtn" class="btn-gold" style="width:100%;margin-top:8px;" onclick="confirmAddClassDayAll()">✅ 確認新增（直接排進 Calendar 並用 LINE 通知學生）</button>';
    resultEl.innerHTML = previewLines.join('') + btnHtml;
  } catch (e) {
    resultEl.innerHTML = '<div style="color:#b45309;">檢查失敗：' + escHtml(e.message || String(e)) + '</div>';
  } finally {
    btn.disabled = false; btn.textContent = '🔍 檢查是否衝突';
  }
}

// 2026-07-18 拆出來（Lin 要求「加課要先讓學生確認」）：真正「建立 Calendar 事件＋寫資料庫」的
// 核心邏輯抽成共用函式，confirmAddClassDay（核准學生自己申請的加課／舊行為）跟
// confirmTeacherAddClass（老師自己發起、學生已確認過的加課）都呼叫這個，避免兩份重複邏輯
// 之後改一邊忘記改另一邊。p = { dateVal, startVal, endTime, recurring, untilVal, weekday }
async function createCalendarClassEventForStudent(token, s, p) {
  let calToken = await gdGetToken();
  const start = teacherTimeToDate(p.dateVal, p.startVal);
  // 2026-07-23 修正：同一個跨午夜 bug（開始 23:xx 時 p.endTime 字串是「同一天 00:xx」），
  // 這裡以前也用 teacherTimeToDate(p.dateVal, p.endTime) 重組，會把 Calendar 事件的結束時間
  // 排在開始之前（甚至更早的日期），改成直接「開始 +1 小時」算，永遠對。
  const end = new Date(start.getTime() + 60 * 60 * 1000);
  const body = {
    summary: s.name,
    // 2026-07-15 加（Lin 要求）：跟 createMeetLinkForStudent 用同一個顏色（colorId '6' = Tangerine，
    // 是 Google Calendar 11 個可用顏色裡最接近 Lin 選的 Mango 的那個，2026-07-10 就對過了）
    colorId: '6',
    description: '系統自動建立（➕ 加課堂時間）' + (s.meet ? ('\n上課連結：' + s.meet) : ''),
    start: { dateTime: start.toISOString(), timeZone: TEACHER_TZ },
    end: { dateTime: end.toISOString(), timeZone: TEACHER_TZ },
  };
  if (p.recurring) {
    let rule = 'RRULE:FREQ=WEEKLY';
    if (p.untilVal) rule += ';UNTIL=' + buildIcalUntilUtc(teacherTimeToDate(p.untilVal, '23:59'));
    body.recurrence = [rule];
  }
  let r = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
    method: 'POST', headers: { Authorization: 'Bearer ' + calToken, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  if (r.status === 403) {
    const errBody = await r.text();
    if (/insufficient|scope|PERMISSION_DENIED/i.test(errBody)) {
      calToken = await gdGetToken(true);
      r = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events', {
        method: 'POST', headers: { Authorization: 'Bearer ' + calToken, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
    }
  }
  if (!r.ok) throw new Error('建立 Calendar 事件失敗（' + r.status + '）：' + (await r.text()).slice(0, 200));
  const ev = await r.json();

  // 2026-07-15 加（Lin 要求：加完課要真的回頭確認 Calendar 上有沒有出現，不要只信任建立時的
  // API 回應）：重新 GET 一次這個事件，確認真的存在、時間也對，才繼續寫資料庫。
  try {
    const verifyR = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events/' + encodeURIComponent(ev.id), {
      headers: { Authorization: 'Bearer ' + calToken },
    });
    if (!verifyR.ok) throw new Error('重新確認時連線失敗（' + verifyR.status + '）');
    const verifyEv = await verifyR.json();
    const actualStart = verifyEv.start && (verifyEv.start.dateTime || verifyEv.start.date);
    if (!actualStart || Math.abs(new Date(actualStart).getTime() - start.getTime()) > 60000) {
      throw new Error('Calendar 上顯示的時間跟預期不一樣（顯示：' + (actualStart || '無') + '）');
    }
  } catch (verErr) {
    throw new Error('Calendar 事件建立的 API 有回應，但重新確認時發現不對勁：' + (verErr.message || verErr) + '\n請自己到 Calendar 檢查一次是否真的建立成功，先不寫入資料庫（避免資料庫記了一個不確定存在的事件）。');
  }

  // ════════════════════════════════════════════════════════════════════════════
  // 🟡 2026-07-31 เพิ่ม (ข้อ #20 ในรายงานตรวจ) — สำรอง "การเพิ่มคาบ" ไว้ให้กดคืนค่าได้
  //
  // เดิมระบบสำรองรองรับแค่ ลบ / ย้าย / เก็บเข้ากรุ / แก้ถาวร → ไม่สมมาตร:
  //   ลบคาบผิด  → กด ↩️ 復原 ได้
  //   เพิ่มคาบผิด → ไม่มีปุ่มอะไรเลย ต้องเปิด Google Calendar ไปลบเอง
  //
  // ⚠️ ต่างจากที่อื่น: ตรงนี้ "ห้ามใช้ assertBackupOk" ที่โยน error ออกไป
  //   เพราะคาบถูกสร้างขึ้นจริงไปแล้วก่อนถึงบรรทัดนี้ — ถ้าโยน error ครูจะเข้าใจว่าเพิ่มไม่สำเร็จ
  //   แล้วกดซ้ำ = ได้คาบซ้อนกัน 2 คาบ (ตรงข้ามกับตอนลบ/ย้าย ที่สำรองพัง = ต้องหยุด ห้ามแตะ Calendar)
  //   → สำรองไม่สำเร็จก็ปล่อยผ่าน แต่ต้องเตือนดังๆ ใน console ห้ามเงียบสนิท
  // ════════════════════════════════════════════════════════════════════════════
  // 🟠 2026-08-02 (ตรวจ 3 ระบบ ข้อ 4.15)：เดิมเขียนแค่ console.warn = ครูไม่มีทางรู้
  //   (บนมือถือ/แท็บปกติไม่มีใครเปิด console) · ฝั่ง LINE บอกครูในข้อความตอบกลับมาตั้งแต่ 2026-07-31
  //   → คืนคำเตือนออกไปให้ผู้เรียกเอาไปโชว์ในสรุปผล (confirmAddClassDayAll)
  var addBackupWarn = '';
  try {
    var addBk = await backupCalendarEvent(null, token, 'create', ev, null);
    if (!addBk || addBk.error || !addBk.data) {
      var whyAddBk = (addBk && addBk.error) ? addBk.error.message : 'ไม่ได้ข้อมูลกลับมา';
      console.warn('⚠️ เพิ่มคาบสำเร็จ แต่บันทึกข้อมูลสำรองไม่สำเร็จ — คาบนี้จะไม่มีปุ่ม ↩️ 復原 ให้กด '
        + '(ถ้าเพิ่มผิดต้องไปลบเองใน Google Calendar):', whyAddBk);
      addBackupWarn = '這堂課沒有存到「可復原」的紀錄（' + whyAddBk + '），加錯的話要自己到 Google Calendar 刪掉';
    }
  } catch (bkErr) {
    var whyAddBk2 = bkErr.message || String(bkErr);
    console.warn('⚠️ เพิ่มคาบสำเร็จ แต่บันทึกข้อมูลสำรองพังกลางคัน (คาบยังอยู่ครบ ไม่กระทบอะไร):', whyAddBk2);
    addBackupWarn = '這堂課沒有存到「可復原」的紀錄（' + whyAddBk2 + '），加錯的話要自己到 Google Calendar 刪掉';
  }

  // RELIABILITY FIRST：Calendar 事件已經真的建立了（且重新確認過）→ 資料庫這步失敗也要講清楚「Calendar 上已經有了」，
  // 不能讓 Lin 誤會沒成功而重按一次（會建立重複事件）。
  if (p.recurring) {
    // ✅ 2026-07-26 (Lin สั่ง: ต้องขึ้นได้ทั้ง Calendar และระบบ)
    // เดิมชนกันที่ (token, weekday) = นักเรียน 1 คน มีคาบประจำได้วันละ 1 รอบเวลาเท่านั้น
    // → เพิ่มพุธ 19:00 ให้คนที่มีพุธ 10:00 อยู่แล้ว = แถวพุธ 10:00 โดนทับหาย
    //   คาบ 10:00 ยังอยู่ใน Calendar แต่ระบบจำ calendar_event_id ไม่ได้แล้ว = คาบกำพร้า
    // ตอนนี้ชนกันที่ (token, weekday, start_time) = วันเดียวกันมีได้หลายรอบเวลา ขอแค่เวลาเริ่มไม่ซ้ำ
    // ⚠️ ต้องรัน supabase/sql/2026-07-26_recurring_days_multi_slot.sql ก่อน ถึงจะมีกฎใหม่ในฐานข้อมูล
    //    ยังไม่ได้รัน → Postgres ตอบ error 42P10 → ถอยไปใช้แบบเดิมอัตโนมัติ (ไม่พัง แต่ยังทับกันอยู่)
    //    ทำแบบนี้เพื่อให้ push โค้ดก่อน หรือรัน SQL ก่อน ก็ไม่พังทั้งคู่
    const rdRow = { token: token, weekday: p.weekday, start_time: p.startVal, end_time: p.endTime, calendar_event_id: ev.id };
    let { error } = await sb.from('classroom_recurring_days').upsert(rdRow, { onConflict: 'token,weekday,start_time' });
    if (error && (error.code === '42P10' || /no unique or exclusion constraint/i.test(error.message || ''))) {
      // ⚠️ ยังไม่ได้รัน SQL → ฐานข้อมูลยังใช้กฎเดิม (วันละ 1 รอบเวลา)
      // ห้าม "ถอยไปใช้กฎเดิมเงียบๆ" เด็ดขาด — เพราะกฎเดิมจะ "ทับ" แถวคาบเดิมหายไป
      // แล้วขึ้นว่าสำเร็จ = สร้างคาบกำพร้าซ้ำรอยบั๊กเดิมเป๊ะๆ โดยไม่มีใครรู้
      // → เช็คก่อนว่ามีคาบวันเดียวกันคนละเวลาอยู่หรือเปล่า มี = หยุด บอกให้ไปรัน SQL ก่อน
      console.warn('[recurring_days] ยังไม่ได้รัน 2026-07-26_recurring_days_multi_slot.sql');
      // ⚠️ ห้ามใช้ .neq('start_time', ...) กรองฝั่งฐานข้อมูล — แถวที่ start_time เป็นค่าว่าง (NULL)
      // จะไม่ถูกนับว่า "ไม่เท่ากัน" (NULL <> 'x' ได้ผลเป็น NULL ไม่ใช่ true) → แถวนั้นหลุดออกจากผลลัพธ์
      // = ด่านมองไม่เห็นมัน แล้วปล่อยให้ทับทิ้ง ซึ่งคือบั๊กที่กำลังกันอยู่พอดี
      // → ดึงทุกแถวของวันนั้นมาก่อน แล้วค่อยเทียบเองใน JS (ค่าว่างก็นับเป็น "คนละคาบ" ด้วย)
      const dup = await sb.from('classroom_recurring_days').select('start_time')
        .eq('token', token).eq('weekday', p.weekday);
      const dupOther = (dup.data || []).filter(function (x) {
        return String(x.start_time || '').slice(0, 5) !== String(p.startVal || '').slice(0, 5);
      });
      if (dup.error || dupOther.length) {
        throw new Error('Calendar 事件已經建立成功了，但「沒有」寫進資料庫。\n\n'
          + '原因：這位學生同一個星期幾已經有另一個固定時段（' + (dupOther.map(function (x) { return x.start_time || '(空白)'; }).join('、') || '讀取失敗') + '），\n'
          + '而資料庫還沒升級成「一天可以有多個固定時段」。\n'
          + '硬寫下去會把舊的那筆蓋掉，舊課堂就會變成沒有主人的孤兒課堂——所以這次刻意不寫。\n\n'
          + '👉 請先執行 supabase/sql/2026-07-26_recurring_days_multi_slot.sql，再請 Lin/AI 手動補這一筆。\n'
          + '（不要重按一次，Calendar 上已經有這個事件了）');
      }
      ({ error } = await sb.from('classroom_recurring_days').upsert(rdRow, { onConflict: 'token,weekday' }));
    }
    if (error) throw new Error('Calendar 事件已經建立成功，但存進資料庫失敗：' + error.message + '\n（不要重按一次，Calendar 上已經有這個事件了，請告訴 Lin/AI 手動補資料庫）');
  } else {
    const { error } = await sb.from('classroom_schedule')
      .upsert({ token: token, lesson_date: p.dateVal, start_time: p.startVal, end_time: p.endTime, title: s.name, calendar_event_id: ev.id }, { onConflict: 'token,lesson_date,start_time' });
    if (error) throw new Error('Calendar 事件已經建立成功，但存進資料庫失敗：' + error.message + '\n（不要重按一次，Calendar 上已經有這個事件了，請告訴 Lin/AI 手動補資料庫）');
  }
  // 2026-08-02: backupWarn = ข้อความเตือนถ้าสำรองไม่สำเร็จ (ว่าง = สำรองสำเร็จปกติ)
  return { ev: ev, start: start, end: end, backupWarn: addBackupWarn };
}

// 2026-07-20 再改（Lin 要求：per-row 直接排 vs 送出等確認能同時發生於同一次送出）：把「單筆
// 真正建立 Calendar＋通知學生老師＋（如果是核准學生申請）標記那筆申請完成」的核心邏輯抽出來，
// confirmAddClassDay（單筆、維持原本行為）跟 submitAddClassDayCombined（新的 per-row 組合流程）
// 都呼叫這個，避免兩份重複邏輯之後改一邊忘記改另一邊。
// 不丟例外，回傳 {ok:true,...} 或 {ok:false,error}，呼叫端自己組訊息文字。
async function directConfirmAddClassRow(token, p, requestIdToFinalize) {
  const s = studentsCache[token];
  if (!s) return { ok: false, error: '找不到學生資料' };
  // 🟠 2026-08-01 เพิ่ม (ตรวจระบบยกเลิก/เพิ่มคาบ ข้อ 7 — ด่านชั้นสุดท้าย ตรวจ ณ วินาทีที่จะสร้างจริง)
  //   ด่านในหน้าฟอร์ม (checkAddClassDayConflict) เช็คตอน "กดตรวจ" แต่ครูอาจกดยืนยันทีหลังเป็นชั่วโมง
  //   เคสจริง: กดตรวจ 19:55 สำหรับคาบ "วันนี้ 20:00" ✅ ผ่าน → ไปกินข้าว → กลับมากดยืนยัน 20:30
  //   = สร้างคาบที่เวลาผ่านไปแล้ว โดยไม่มีด่านไหนทัก (ด่านแรกตรวจไปนานแล้ว)
  //   ตรงนี้อยู่ "ก่อนแย่งล็อกและก่อนแตะ Calendar" จึงถอยออกได้สะอาด ไม่มีอะไรค้าง
  //   คืน {ok:false} แทนการ alert เพราะผู้เรียกรวบผลทุกแถวไปแจ้งครูทีเดียวอยู่แล้ว
  //   ⚠️ ยกเว้นคาบทุกสัปดาห์ (เหตุผลเดียวกับด่านในหน้าฟอร์ม — ตั้งชุดคาบประจำตอนเย็นต้องทำได้)
  const startAbsCheck = teacherTimeToDate(p.dateVal, p.startVal);
  if (!startAbsCheck || isNaN(startAbsCheck.getTime()) || (!p.recurring && startAbsCheck.getTime() <= Date.now())) {
    return { ok: false, error: '這個時間（' + p.dateVal + ' ' + p.startVal + ' 泰國時間）已經過去了，沒有建立任何課堂。請改成未來的時間再檢查一次。' };
  }
  // 2026-07-20 加（稽核發現 🔴 RED——這裡以前完全沒搶 processing_started_at 原子鎖，跟取消/改期
  // 走的 claimRequestForProcessing/releaseRequestClaim 不一樣，也跟 LINE 那邊 confirm_add_class
  // 自己有搶鎖不一致）：網頁跟 LINE 兩邊都能觸發「確認新增」，如果剛好同時按（例如電腦開著網頁、
  // 手機同時點 LINE 的「✅ 確認新增」）以前可能會真的在 Google Calendar 建立兩筆重複事件。
  // 這裡補上跟取消/改期同一套鎖，只有真的搶到鎖才往下建立 Calendar。
  let claimedLock = false;
  if (requestIdToFinalize) {
    // 🔴 2026-07-31 เปลี่ยนตัวจับล็อก: เพิ่มคาบต้องใช้ claimAddClassRequest (ห้ามแย่งล็อกค้างเอง)
    //    ไม่ใช่ claimRequestForProcessing ที่แย่งได้เมื่อครบ 10 นาที — เหตุผลเต็มอยู่ที่ claimAddClassRequest
    const claim = await claimAddClassRequest(requestIdToFinalize);
    if (!claim.ok) return { ok: false, error: claim.reason };
    claimedLock = true;
  }
  try {
    const created = await createCalendarClassEventForStudent(token, s, p);
    const start = created.start;

    // 2026-07-17 加（Lin 要求）：加課成功之後，跟取消/改期一樣，用 LINE 通知學生跟老師自己一份，
    // 不要讓學生完全不知情、只能自己上網站才發現多了一堂課。跟 processClassRequestInner 用同一套
    // 「通知失敗不影響已經完成的 Calendar/資料庫動作」的做法，失敗只在主控台留紀錄，不擋流程。
    const addedTimeLabel = p.recurring
      ? ('每週' + ['日','一','二','三','四','五','六'][p.weekday] + ' ' + p.startVal + '–' + p.endTime + '（泰國時間，從 ' + p.dateVal + ' 開始' + (p.untilVal ? '，固定到 ' + p.untilVal : '') + '）')
      : formatThaiDateTimeLabel(start.toISOString()) + '（泰國時間）';
    // 🔴 2026-07-26 (RELIABILITY FIRST)：เดิมทิ้งผลลัพธ์ของ fetch แล้วไปบอกครูว่า "已 LINE 通知學生"
    // โดยดูแค่ว่านักเรียนผูก LINE ไว้ไหม → ถ้าส่งไม่สำเร็จจริง (เช่น session ครูหมดอายุ = 401)
    // ครูจะเข้าใจผิดว่านักเรียนรู้แล้ว ทั้งที่นักเรียนไม่ได้รับอะไรเลย
    let studentNotified = false, studentNotifyErr = null;
    if (s.line_user_id) {
      try {
        const studentTimeLabel = p.recurring ? addedTimeLabel : studentFacingTimeLabel(start, s.pending_student_tz);
        const stuRes = await fetch(LINE_NOTIFY_ENDPOINT, {
          method: 'POST',
          // 2026-07-19 แก้（SECURITY FIRST）：notify-line สาขา to:{studentToken} ตอนนี้บังคับต้องมี session จริงของครู
          headers: { 'Content-Type': 'application/json', 'apikey': window.SUPABASE_CONFIG.anonKey, 'Authorization': 'Bearer ' + (await teacherAuthHeader()) },
          // 2026-07-30 改（Lin สั่ง）：ไม่มีปุ่ม 接受/婉拒 อีกแล้ว คาบถูกเพิ่มลงปฏิทินไปเลย
          // → ข้อความต้องบอกนักเรียนให้ชัดว่า "ถ้าไม่สะดวก กดขอยกเลิกคาบเองได้"
          // 2026-07-31 แก้：คาบทุกสัปดาห์ห้ามเรียกว่า「一堂課」และห้ามชี้ไปปุ่ม「申請取消課堂」
          //   เพราะปุ่มนั้นยกเลิกได้ทีละครั้ง ไม่ใช่ทั้งชุด → ชุดคาบประจำให้ทักครูตรงๆ (ตรงกับฝั่ง LINE)
          body: JSON.stringify({ to: { studentToken: token }, message: p.recurring
            ? ('✅ 老師幫你排好固定課了：' + studentTimeLabel + '\n已經加到課表了。如果這個時間不方便，請直接跟老師說一聲。')
            : ('✅ 老師幫你排好一堂課：' + studentTimeLabel + '\n這堂課已經加到課表了。如果那個時間不方便，請到網站按「申請取消課堂」，或直接跟老師說一聲。') }),
        });
        studentNotified = stuRes.ok;
        if (!stuRes.ok) studentNotifyErr = await lineNotifyErrorText(stuRes);
      } catch (e) { studentNotifyErr = e.message || String(e); console.warn('⚠️ 加課通知學生失敗（不影響已經加成功的課）：', studentNotifyErr); }
    }
    try {
      await fetch(LINE_NOTIFY_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'apikey': window.SUPABASE_CONFIG.anonKey, 'Authorization': 'Bearer ' + (await teacherAuthHeader()) }, // 2026-07-26：สาขา to:'teacher' บังคับพิสูจน์ตัวแล้ว — ฝั่งครูใช้ session จริง
        body: JSON.stringify({ to: 'teacher', message: '✅ 已幫 ' + s.name + ' 加課：' + addedTimeLabel }),
      }).then(async function (r) { if (!r.ok) console.warn('⚠️ 通知老師自己失敗（' + (await lineNotifyErrorText(r)) + '）'); });
    } catch (e) { console.warn('⚠️ 加課通知老師自己失敗（不影響已經加成功的課）：', e.message || e); }

    // 2026-07-15 加：如果是從學生「➕ 申請加課」的申請單開進來的，Calendar+資料庫都真的
    // 成功了才把那筆申請標記完成（RELIABILITY FIRST：先確定真的排進去了才關單，不能先關單）。
    if (requestIdToFinalize) {
      try { await finalizeRequestStatus(requestIdToFinalize, 'acknowledged'); } catch (e) { /* 標記失敗不影響已經建立成功的課堂，loadPendingClassRequests 下次刷新還會看到這筆，可以再按一次 */ }
    }
    // 2026-08-02 (ข้อ 4.15): ส่ง backupWarn ออกไปด้วย ให้ผู้เรียกเอาไปโชว์ให้ครูเห็น ห้ามเงียบ
    return { ok: true, hasLine: !!s.line_user_id, studentNotified: studentNotified, studentNotifyErr: studentNotifyErr, backupWarn: created.backupWarn || '' };
  } catch (e) {
    // 只有「Calendar API 這次真的還沒建立成功」才能安全放鎖讓人重試——如果錯誤訊息顯示
    // 「已經建立成功」或「重新確認時」代表 createCalendarClassEventForStudent 裡 Calendar 事件
    // 可能已經真的建立了，這種情況故意不放鎖，避免重按造成重複事件（跟 line-webhook
    // confirm_add_class 的 eventCreatedButUnverified 判斷同一個原則，寧可少方便也不要重複建立）。
    const msg = e.message || String(e);
    const ambiguous = /已經建立成功|重新確認時/.test(msg);
    if (claimedLock && !ambiguous) await releaseRequestClaim(requestIdToFinalize);
    return { ok: false, error: msg + (claimedLock && ambiguous ? '\n⚠️ Calendar 可能已經建立成功，為了安全這筆先鎖住不能重按，請直接檢查 Google Calendar／Supabase 手動確認，或告訴 Lin/AI 處理。' : '') };
  }
}

// ════════════════════════════════════════════════════════════════════════════
// 第 2 步（2026-07-30 改，Lin สั่ง）：ครูกดยืนยัน = สร้าง Calendar ทันทีทุกแถว + แจ้ง LINE นักเรียน
// แทนที่ของเดิม 3 ตัว (confirmAddClassDay / proposeAddClassDay / submitAddClassDayCombined)
// ที่แยกสาขา "ลงเลย" กับ "ส่งไปรอนักเรียนกดยอมรับ" — ตอนนี้ไม่มีสาขา "รอนักเรียน" อีกแล้ว
// ทำทีละแถวตามลำดับ (ไม่ยิงพร้อมกัน) เพื่อไม่ให้ Google Calendar โดนยิงรัวเกินไป
// แถวแรกเท่านั้นที่แนบ requestId ของคำขอนักเรียนไปด้วย → สร้างสำเร็จค่อยปิดคำขอนั้น
//   (แถวที่ 2, 3... คือคาบที่ครูกด "➕ 再加一筆" เพิ่มเอง ไม่เกี่ยวกับคำขอของนักเรียน)
// RELIABILITY FIRST: แถวไหนพัง แถวอื่นยังทำต่อ แล้วสรุปให้ครูเห็นครบทุกแถวว่าอันไหนสำเร็จ/ไม่สำเร็จ
// ════════════════════════════════════════════════════════════════════════════
async function confirmAddClassDayAll() {
  // 防重複點擊鎖（同一時間只會有一個加課 modal 開著，用固定字串當 key 就夠）
  const lockKey = 'confirmAddClassDayAll';
  if (_inFlightRequestIds[lockKey]) return; // 正在處理中，忽略這次重複點擊
  _inFlightRequestIds[lockKey] = true;

  const rows = _addClassDayPending || [];
  if (!rows.length) { delete _inFlightRequestIds[lockKey]; return; }
  const token = rows[0].token;
  const resultEl = document.getElementById('addClassDayResult');
  const requestIdToFinalize = _addClassDayFromRequestId;

  const okLines = [], warnLines = [], failLines = [];
  const leftoverRows = [];   // แถวที่ยังไม่สำเร็จ → เก็บไว้ให้ครูกดซ้ำ ไม่ต้องพิมพ์ใหม่
  // 🟡 2026-07-31 (ข้อ #21)：เปลี่ยนจาก "แถวแรกสำเร็จไหม" เป็น "แถวของนักเรียนสำเร็จไหม"
  //   ความหมายเดิมผูกกับตำแหน่ง ซึ่งขยับได้เวลาสร้างฟอร์มใหม่หลังมีแถวพัง
  let studentRowOk = false;  // แถวที่นักเรียนขอมาเอง สำเร็จไหม = คำขอของเขาถูกปิดไปแล้วหรือยัง
  try {
    for (let i = 0; i < rows.length; i++) {
      const p = rows[i];
      resultEl.innerHTML = '<div style="color:var(--gold-deep);">建立中…（第 ' + (i + 1) + ' / ' + rows.length + ' 筆）</div>';
      let r;
      try {
        // 🟡 2026-07-31 (ข้อ #21)：ผูกด้วยธงที่ติดมากับตัวแถว ไม่ใช่ตำแหน่ง (เดิมเป็น i === 0)
        r = await directConfirmAddClassRow(token, p, p.isStudentRow ? requestIdToFinalize : null);
      } catch (e) {
        // RELIABILITY FIRST：directConfirmAddClassRow ปกติไม่โยน error ออกมา (คืน {ok:false}) แต่บางจังหวะ
        // เช่นตอนแย่งล็อก/อ่านข้อมูลนักเรียนไม่ได้ อาจหลุดออกมาได้ → ถ้าไม่ดัก หน้าจอจะค้างที่ "建立中…"
        // ตลอดกาล ครูจะไม่รู้เลยว่าเกิดอะไรขึ้น (เงียบ = สิ่งที่ห้ามที่สุด)
        r = { ok: false, error: '意外錯誤：' + (e && e.message ? e.message : String(e)) };
      }
      if (r.ok) {
        if (p.isStudentRow) studentRowOk = true;
        okLines.push('✅ ' + addClassDayTimeLabel(p));
        // 🔴 RELIABILITY FIRST（沿用 2026-07-26 的原則）：不能因為「學生有連 LINE」就說通知到了，
        // 要看真的送出去沒有；沒送到一定要大聲講，不能讓老師誤會學生已經知道了。
        if (!r.hasLine) warnLines.push('⚠️ ' + addClassDayShortLabel(p) + '：學生還沒連結 LINE，沒收到通知');
        else if (!r.studentNotified) warnLines.push('⚠️ ' + addClassDayShortLabel(p) + '：LINE 通知學生沒送出去（' + (r.studentNotifyErr || '原因不明') + '）');
        // 🟠 2026-08-02 (ข้อ 4.15)：สำรองไม่สำเร็จ = ต้องบอกครูตรงๆ ห้ามซ่อนไว้ใน console (ฝั่ง LINE บอกมาตั้งแต่ 07-31)
        if (r.backupWarn) warnLines.push('⚠️ ' + addClassDayShortLabel(p) + '：' + r.backupWarn);
      } else {
        leftoverRows.push(p);
        failLines.push('❌ ' + addClassDayShortLabel(p) + '：' + r.error);
      }
    }
  } finally {
    delete _inFlightRequestIds[lockKey];
  }

  const html = [];
  if (okLines.length) html.push('<div style="color:var(--gold-deep);font-weight:700;">已新增 ' + okLines.length + ' 堂課（已重新確認 Calendar 上真的有）：<br>' + okLines.map(escHtml).join('<br>') + '</div>');
  if (warnLines.length) html.push('<div style="color:#b45309;font-weight:700;margin-top:6px;">' + warnLines.map(escHtml).join('<br>') + '</div>');
  if (failLines.length) html.push('<div style="color:#b45309;font-weight:700;margin-top:6px;">' + failLines.map(escHtml).join('<br>') + '</div>');
  resultEl.innerHTML = html.join('') || '<div style="color:#b45309;">沒有任何一筆成功</div>';

  // 用彈窗確保老師一定看到「通知沒送到 / 有筆數失敗」，不會被畫面上的字漏看（2026-07-24 起的做法）
  if (warnLines.length || failLines.length) {
    alert((okLines.length ? '✅ 已新增 ' + okLines.length + ' 堂課\n\n' : '') + warnLines.concat(failLines).join('\n'));
  }

  if (!okLines.length) return; // ไม่สำเร็จสักแถว → เก็บทุกอย่างไว้เหมือนเดิม ครูกดซ้ำได้เลย

  // 🟠 2026-07-30 (ตรวจซ้ำแล้วแก้)：ห้ามล้างฟอร์มทิ้งทั้งหมดเวลา "สำเร็จบางแถว"
  //   เดิมพอมีสักแถวสำเร็จ จะล้างทุกแถว + ลืม requestId → แถวที่พังหายไปเลย ครูต้องพิมพ์ใหม่
  //   และคำขอของนักเรียนจะไม่มีวันถูกปิดอัตโนมัติอีก ต้องไปกด「✔️ 關掉這筆」เอง
  // ตอนนี้: เก็บเฉพาะแถวที่ยังไม่สำเร็จไว้ + จำ requestId ต่อ ถ้าแถวแรกยังไม่สำเร็จ
  if (studentRowOk) _addClassDayFromRequestId = null; // ปิดคำขอไปแล้วจริงใน directConfirmAddClassRow
  _addClassDayPending = null; // ต้องกด「🔍 檢查是否衝突」ใหม่เสมอ ห้ามให้กดส่งซ้ำโดยไม่เช็ค
  if (leftoverRows.length) {
    // สร้างฟอร์มใหม่ให้เหลือเฉพาะแถวที่ยังไม่สำเร็จ (แถวที่สำเร็จแล้วต้องหายไป กันเผลอสร้างซ้ำ)
    const container = document.getElementById('addClassDayRows');
    container.innerHTML = '';
    _addClassDayNextIdx = 0;
    // 🟡 2026-07-31 (ข้อ #21)：ป้ายกำกับก็ต้องยึดธงที่ติดมากับแถว ไม่ใช่ตำแหน่งใหม่หลังจัดเรียง
    //   เดิมใช้ k === 0 → แถวที่ครูเพิ่มเองอาจได้ป้าย "นักเรียนขอเวลานี้เอง" ไปทั้งที่ไม่ใช่
    leftoverRows.forEach(function (p) {
      addClassDayAddRow(
        { date: p.dateVal, time: p.startVal, recurring: p.recurring, untilVal: p.untilVal },
        (p.isStudentRow && _addClassDayFromRequestId) ? 'student' : 'teacher'
      );
    });
    updateAddClassDayRemoveButtons();
  } else {
    resetAddClassDayRows();
  }
  await renderAddClassDayExistingList(token);
  loadPendingClassRequests(); // รีเฟรชคิว: คำขอที่เพิ่งปิดไปจะได้หายออกจากรายการทันที
}

// 2026-07-18 加（Lin 要求）：老師自己想到要加課（不是在核准學生送出的申請）——
// 這裡「不」直接建立 Calendar，先建一筆 classroom_requests（request_type='add_class',
// initiated_by='teacher'），送 LINE/網站通知請學生按「我知道了」確認，老師之後要回到
// 「📋 學生申請改期/取消」清單按「確認新增」（見 confirmTeacherAddClass）才會真的排進 Calendar。
// 跟 teacherCancelClassNowInner（老師發起取消）同一套模式。
// 把一筆 pending row 換成給學生看的完整時間文字（跟原本單筆版本文字一致）
function addClassDayTimeLabel(p) {
  return p.recurring
    ? ('每週' + ['日','一','二','三','四','五','六'][p.weekday] + ' ' + p.startVal + '–' + p.endTime + '（泰國時間，從 ' + p.dateVal + ' 開始' + (p.untilVal ? '，固定到 ' + p.untilVal : '') + '）')
    : (p.dateVal + '（週' + ['日','一','二','三','四','五','六'][p.weekday] + '）' + p.startVal + '–' + p.endTime + '（泰國時間）');
}
// LINE 按鈕標籤要短（buildFlexMessage 會 slice(0,20)，但先自己盡量精簡）
function addClassDayShortLabel(p) {
  const dayZh = ['日','一','二','三','四','五','六'];
  if (p.recurring) return '每週' + dayZh[p.weekday] + ' ' + p.startVal;
  const dp = p.dateVal.split('-');
  return parseInt(dp[1], 10) + '/' + parseInt(dp[2], 10) + ' ' + p.startVal;
}

// ════════════════════════════════════════════════════════════════════════════
// 🗑️ 2026-07-30 ลบทิ้ง 3 ฟังก์ชัน (Lin สั่งเลิกใช้ระบบ "ส่งไปรอนักเรียนกดยอมรับ" ทั้งหมด):
//   proposeAddClassRows() / proposeAddClassDay() / submitAddClassDayCombined()
// ทั้ง 3 ตัวคือเส้นทาง "สร้างคำขอ initiated_by='teacher' แล้วส่ง LINE ให้นักเรียนกด 接受/婉拒"
// ตอนนี้ครูกดยืนยัน = ลง Calendar ทันทีทุกกรณี (ดู confirmAddClassDayAll ด้านบน) เลยไม่มีอะไรเรียกใช้แล้ว
// เก็บไว้เฉยๆ เสี่ยงกว่าลบ: โค้ดตายที่ยังกดถึงได้จากที่อื่นในอนาคต = ทางลัดที่ไม่มีใครตั้งใจให้มี
// (ประวัติเดิมดูได้จาก git — commit ก่อนหน้าวันนี้)
// ════════════════════════════════════════════════════════════════════════════

// RELIABILITY FIRST：任何「移動/刪除」Calendar 事件之前，一定先把原本的事件整包存起來，
// 之後才有辦法「復原」。存的是移動/刪除「之前」抓到的完整 event JSON。
async function backupCalendarEvent(requestId, token, action, eventObj, newStartIso) {
  const oldStartIso = eventObj.start && (eventObj.start.dateTime || eventObj.start.date);
  return await sb.from('classroom_calendar_backups').insert({
    request_id: requestId || null,
    token: token || null,
    action: action,
    old_event_id: eventObj.id,
    new_event_id: action === 'move' ? eventObj.id : null,
    old_event_json: eventObj,
    old_start: oldStartIso,
    new_start: newStartIso || null,
  }).select().single();
}

// 2026-07-15 加（RELIABILITY FIRST）：以前每個呼叫 backupCalendarEvent() 的地方都沒檢查
// 回傳結果，備份失敗會完全無聲無息——之後真的要復原時才發現那筆根本沒備份到，
// 卻已經動了 Calendar（刪除/搬移）。改成統一用這個檢查，備份失敗就丟出例外，
// 讓外層 try/catch 擋下來、不繼續做真正會動 Calendar 的刪除/搬移。
function assertBackupOk(res, what) {
  if (!res || res.error || !res.data) {
    throw new Error('備份失敗（' + (what || 'Calendar 事件') + '），為了安全不繼續動 Calendar：' +
      (res && res.error ? res.error.message : '資料庫沒有寫入備份記錄'));
  }
}
