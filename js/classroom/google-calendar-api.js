// ── Google Calendar: fetch today's events ──────────────────────
// 2026-07-06 แก้จาก 3 → 9 วัน: เดิม 3 วันแคบไปสำหรับนักเรียนที่เรียนสัปดาห์ละครั้ง
// (คาบถัดไปอาจอยู่ไกลกว่า 3 วัน) ทำให้การ์ด "คลาสต่อไป" ฝั่งนักเรียนขึ้นว่าง ๆ ทั้งที่จริงมีคาบแล้ว
// 2026-07-18 Lin สั่งเปลี่ยนกลับเป็น 3 วัน: การ์ดนักเรียนใช้ classroom_schedule (sync 90 วัน) แยกกันอยู่แล้ว
// ไม่ได้พึ่ง SCHEDULE_DAYS ตัวนี้ (มีจุดเรียก calFetchUpcomingEvents() แค่จุดเดียว ระบุ SCHEDULE_SYNC_DAYS เสมอ)
// ตัวนี้คุมแค่ "近期課表" ที่ครูเห็นบนหน้าจอเท่านั้น ปลอดภัยที่จะแก้
// FILE MAP: date guards → event fetch/create → time controls → find/move/delete/verify → conflicts/archive cleanup
const SCHEDULE_DAYS = 3; // "近期課表" ที่ครูเห็นบนหน้าจอ แสดงกี่วัน
// 2026-07-15 เพิ่ม：ข้อมูลที่ sync ลง classroom_schedule (ให้นักเรียนใช้เลือก "คาบจะยกเลิก")
// ต้องมองไกลกว่าที่ครูเห็นบนจอ ไม่งั้นนักเรียนที่เรียนหลายวัน/สัปดาห์จะเห็นแค่ 1-2 คาบให้เลือก
// Lin ยืนยันแล้ว (2026-07-15)：จอครูไม่ได้เปลี่ยนตาม (ตัดแสดงแค่ SCHEDULE_DAYS อยู่แล้ว)
// งั้นขยับเป็น 60 วันไปเลย ไม่มีข้อเสียเพิ่ม (ถ้าจะยกเลิกไกลกว่านั้นให้ทักหาครูตรงๆ)
// 2026-07-17 ขยับเป็น 90 วัน (Lin ยืนยัน)：60 วันยังไม่พอครอบคลุมนักเรียนที่เหลือโควตาเยอะ
// (เช่นเรียนสัปดาห์ละครั้ง เหลือ 10 คาบ = ยาวเกือบ 70 วัน) พอ cap ที่ "คาบจะยกเลิก" เปลี่ยนไปโชว์
// ตามโควตาที่เหลือจริงแล้ว (ไม่ใช่ล็อก 6 คาบ) ต้องขยับ sync window ให้กว้างพอด้วย ไม่งั้นข้อมูลไม่ครบ
// 2026-07-19 ขยับเป็น 180 วัน (Lin ยืนยัน — คอร์สใหญ่สุดที่ขายคือ 20 คาบ เรียนสัปดาห์ละครั้ง)：
// 90 วัน ≈ 13 คาบล่วงหน้าเท่านั้น พอบวกคาบที่เรียนไปแล้วรวมไม่ครบ 20 คาบ (พบจริง: MARK ซื้อ 20
// เห็นแค่ 15) นับจาก "วันนี้" เสมอ (ไม่ใช่นับจากวันแรกที่เริ่มคอร์ส) เพราะนักเรียนที่เรียนไปแล้วครึ่งคอร์ส
// เหลือคาบน้อยกว่าคนเพิ่งเริ่ม อยู่แล้ว ไม่ต้องคำนวณแยกราย — 20 คาบ×7 วัน=140 วัน บวกกันชนสำรอง
// วันหยุด/เลื่อนคาบ = 180 วัน ครอบคลุมคอร์สใหญ่สุดที่มีขายได้เกินพอทุกจุดของคอร์ส
// ⚠️ ต้องแก้พร้อมกันกับ supabase/functions/calendar-schedule-sync-cron/index.ts (มีค่าเดียวกันแยกไฟล์)
const SCHEDULE_SYNC_DAYS = 180;

// 2026-07-10 เพิ่ม：ครูกรอกวัน/เวลาสอน (pending_start_date/pending_class_time, classroom_schedule.start_time)
// เป็น "เวลาไทยเสมอ" (Asia/Bangkok, UTC+7 ตายตัว ไม่มี DST) — ต้องแปลงด้วย offset ตายตัวนี้เท่านั้น
// ห้ามใช้ new Date(dateStr+'T'+timeStr) เฉยๆ เพราะ browser จะตีความตาม timezone ของเครื่องที่รันโค้ด
// (พังทันทีถ้าโค้ดรันบนเครื่อง/browser ของนักเรียนที่ timezone ไม่ตรงกับครู)
const TEACHER_TZ = 'Asia/Bangkok';
// 2026-07-10 เพิ่ม："วันนี้" ของครูต้องนับตามเวลาไทยเสมอ ห้ามใช้ new Date().toISOString().slice(0,10)
// เพราะอันนั้นตอบเป็นวันที่แบบ UTC เสมอ — เที่ยงคืนถึงตี 7 เวลาไทยของทุกวัน UTC จะยังเป็น "เมื่อวาน"
// อยู่ ถ้าเอาไปบันทึก/เทียบวันที่ตรงๆ จะพลาดวันที่ในช่วงนั้นทุกครั้ง (ไม่เกี่ยวกับ timezone เครื่องผิด)

// 🔴 2026-07-26 เพิ่ม (Lin สั่ง หลังเคสจริง: คาบของ 育郁 ที่สอนไปแล้ว 5 คาบ หายจาก Google Calendar)
// ────────────────────────────────────────────────────────────────────────────────
// ต้นตอจริง: ช่องเลือกวันที่ของ "📌 永久變更固定上課時間" ไม่มีขอบล่าง (ไม่มี min) → เลือกวันย้อนหลังได้
//   โค้ดเอาวันใหม่นั้นไปตัดจบชุดคาบเดิม (RRULE UNTIL = เวลาเริ่มใหม่ − 1 ชม.)
//   → ถ้าวันใหม่อยู่ในอดีต UNTIL ก็ตกไปอยู่ในอดีตด้วย → คาบทุกคาบหลังจุดนั้น "รวมคาบที่สอนไปแล้ว"
//     ถูกลบทิ้งเงียบๆ ทั้งหมด (Calendar หาย แต่ classroom_attendance ยังจำว่าเรียนแล้ว = ข้อมูล 2 ฝั่งไม่ตรง)
// กฎที่ Lin สั่ง (ใช้ทั้งแอป ไม่ใช่แค่ปุ่มนี้): "ห้ามจัด/ย้าย/ตั้งคาบไปวันย้อนหลัง ทุกจุดในแอปนี้
//   ไม่มีปุ่มยกเว้น ไม่มี 'ยืนยันแล้วผ่านได้'" — ถ้าจำเป็นต้องแก้ย้อนหลังจริงๆ Lin ไปย้ายเองใน Google Calendar
// ────────────────────────────────────────────────────────────────────────────────
// ⚠️ ต้องใช้ 2 ชั้นเสมอ ห้ามใช้ชั้นเดียว:
//   ชั้น 1  lockDateInputToFuture(id, tz)  → ใส่ min ให้ช่อง input (กันตั้งแต่หน้าจอ ใช้งานง่ายขึ้น)
//   ชั้น 2  assertNotPastDate(date, label, tz) → เช็คซ้ำ "ตอนกดส่ง" ก่อนยิงเข้า Supabase/Calendar
//   เหตุผลที่ min อย่างเดียวไม่พอ: min เป็นแค่ UI hint — บางเบราว์เซอร์ยังพิมพ์วันเองทะลุได้,
//   แก้ DOM ก็ทะลุได้, autofill/prefill ก็ทะลุได้ → ห้ามไว้ใจ min เป็นด่านความปลอดภัย
// ⚠️ เพิ่มช่องวันที่ใหม่ในอนาคต ต้องต่อ 2 ชั้นนี้ด้วยเสมอ (อย่าเขียนเช็คเองซ้ำ ใช้ตัวกลางนี้)
//   ยกเว้นช่องที่ "บันทึกสิ่งที่เกิดขึ้นไปแล้ว" ไม่ใช่การจัดคาบ (approvalStart / payStart / แก้วันที่ของ
//   คาบที่บันทึกเข้าเรียนไปแล้ว) — พวกนั้นต้องเลือกวันย้อนหลังได้ตามปกติ ห้ามใส่ด่านนี้
function lockDateInputToFuture(elOrId, tz) {
  var node = (typeof elOrId === 'string') ? document.getElementById(elOrId) : elOrId;
  if (node) node.min = todayInTz(tz);
}
function assertNotPastDate(dateStr, label, tz) {
  var today = todayInTz(tz);
  var name = label || '日期';
  if (!dateStr) { alert('⚠️ ' + name + '：還沒選日期'); return false; }
  if (String(dateStr) < today) {
    alert('⚠️ ' + name + ' 不能選過去的日期。\n\n你選的是 ' + dateStr + '，今天是 ' + today + '。\n請改選今天或之後的日期。\n\n'
      + '（系統一律不動已經過去的課——之前就是這樣把已經上過的課整批從 Calendar 刪掉的。\n'
      + '真的需要改過去的課，請直接到 Google Calendar 手動處理。）');
    return false;
  }
  return true;
}
// 2026-07-15 加：รับพารามิเตอร์ "กี่วันล่วงหน้า" ได้ (ไม่ใส่ = ใช้ SCHEDULE_DAYS เหมือนเดิม)
// ให้ connectCalendar() เรียกแบบ 30 วัน (SCHEDULE_SYNC_DAYS) ไป sync ลง classroom_schedule ได้
// โดยจอครูเองยังคง "近期課表" แค่ SCHEDULE_DAYS วันเหมือนเดิม (ตัดแสดงแยกที่ connectCalendar)
async function calFetchUpcomingEvents(days) {
  const rangeDays = days || SCHEDULE_DAYS;
  let token = await gdGetToken();
  // ถ้า token ที่จำไว้ยังไม่มีสิทธิ์ Calendar (เพราะ scope เพิ่งถูกเพิ่มทีหลัง) → ขอ consent ใหม่ครั้งเดียว
  if (gdTokenScopes && gdTokenScopes.indexOf('calendar') === -1) {
    token = await gdGetToken(true);
  }
  // 2026-07-10 修正：เดิมใช้ now.getFullYear()/getMonth()/getDate() (timezone เครื่องที่รันโค้ด)
  // มาคำนวณช่วงวันที่ดึงตาราง → ถ้าเครื่องไม่ได้ตั้งเวลาไทย ช่วงวันที่ที่ดึงมาจะเพี้ยนได้ 1 วัน
  // เปลี่ยนมายึด "วันนี้ตามเวลาไทย" (teacherToday) แล้วบวกเป็นมิลลิวินาทีตรงๆ (ไทยไม่มี DST ปลอดภัย)
  const todayIso = teacherToday();
  const dayMs = 24 * 3600 * 1000;
  const start = teacherTimeToDate(todayIso, '00:00').toISOString();
  const end   = new Date(teacherTimeToDate(todayIso, '00:00').getTime() + rangeDays * dayMs - 1000).toISOString();
  // 2026-07-15 加：ช่วงยาวขึ้น (สูงสุด 30 วัน) อาจมี event ทั้งปฏิทินเกิน 100 รายการได้ (มีทั้งคาบเรียน
  // และนัดส่วนตัวอื่นๆ ของครูปนกัน) → ขยับ maxResults ขึ้นเป็น 250 กันข้อมูลตกหล่นแบบเงียบๆ
  const url = 'https://www.googleapis.com/calendar/v3/calendars/primary/events'
    + '?timeMin=' + encodeURIComponent(start)
    + '&timeMax=' + encodeURIComponent(end)
    + '&singleEvents=true&orderBy=startTime&maxResults=250';
  let r = await fetch(url, { headers: { Authorization: 'Bearer ' + token } });
  // 403 ที่เกิดจากสิทธิ์ไม่พอ → ขอ consent ใหม่แล้วลองอีกครั้ง (จัดการเคส token จำสิทธิ์เก่า)
  if (r.status === 403) {
    let body = await r.text();
    if (/insufficient|scope|PERMISSION_DENIED/i.test(body)) {
      token = await gdGetToken(true);
      r = await fetch(url, { headers: { Authorization: 'Bearer ' + token } });
      if (!r.ok) body = await r.text();
    }
    if (!r.ok) throw new Error('Calendar API ' + r.status + '：' + body.slice(0, 200));
  } else if (!r.ok) {
    throw new Error('Calendar API ' + r.status + '：' + (await r.text()).slice(0, 200));
  }
  let data = await r.json();
  let items = data.items || [];
  // 2026-07-19 加（RELIABILITY FIX，Lin 問到才發現）：以前 maxResults=250 是「一頁最多 250 筆」，
  // 超過的話 Google 會回傳 nextPageToken，之前沒接著撈下一頁——如果全部學生+老師自己其他行程
  // 加起來在這個天數範圍內超過 250 筆，最早（時間最前）的 250 筆會被留下，超過的部分會被悄悄漏掉，
  // 不會噴錯誤，只是資料不完整。現在改成有 nextPageToken 就一直撈到撈完為止。
  let guard = 0;
  while (data.nextPageToken && guard < 20) {
    guard++;
    const pageR = await fetch(url + '&pageToken=' + encodeURIComponent(data.nextPageToken), { headers: { Authorization: 'Bearer ' + token } });
    if (!pageR.ok) break; // 撈下一頁失敗就停在目前撈到的，不讓整個同步失敗
    data = await pageR.json();
    items = items.concat(data.items || []);
  }
  return items;
}

// ── Google Calendar：自動建立一個帶 Google Meet 的行事曆活動，回傳 Meet 連結 ──
// 用於「新增學生／入班連結」時自動生成 Meet，老師不用自己去 Google Meet 建立再貼連結。
// opts.startDate + opts.classTime（有填的話）→ 用這個日期時間當第一堂課時間；
// opts.recurring = true → 加上「每週重複」規則（RRULE:FREQ=WEEKLY），之後每週會自動出現在
// 「近期課表」，不用老師每週手動加一次。opts.recurring = false（或沒給時間）→ 只建立單次活動，
// 純粹拿來掛 Meet 連結用（連結本身不會因為活動時間過了就失效，任何時間都能用）。
async function createMeetLinkForStudent(studentName, opts) {
  opts = opts || {};
  let token = await gdGetToken();
  if (gdTokenScopes && gdTokenScopes.indexOf('calendar') === -1) {
    token = await gdGetToken(true); // 舊 token 還沒有 calendar 權限（例如舊使用者剛升級這個功能）→ 重新跳同意畫面
  }
  let start;
  if (opts.startDate && opts.classTime) {
    // 2026-07-10 修正：改用 teacherTimeToDate（固定 +07:00）解析，不再靠瀏覽器當下時區猜，
    // 因為這支函式一律在老師自己的瀏覽器執行沒錯，但直接信任瀏覽器系統時區設定不夠可靠
    // （設錯/忘記調時區 → Meet 建到錯的時間，學生課表也會跟著錯），固定寫死泰國時間最安全。
    start = teacherTimeToDate(opts.startDate, opts.classTime);
  } else {
    start = new Date();
    start.setDate(start.getDate() + 1);
    start.setHours(20, 0, 0, 0);
  }
  const end = new Date(start.getTime() + 60 * 60 * 1000);
  // Google Calendar 規定：有 recurrence（每週重複）時，start/end 一定要帶明確的 IANA 時區名稱，
  // 不能只靠 dateTime 的 UTC 偏移量（不然會回 400 Missing time zone definition）。
  // 2026-07-10 改成固定寫死 TEACHER_TZ（Asia/Bangkok），不再用瀏覽器當下時區（同上，避免設備時區設錯）。
  const tz = TEACHER_TZ;
  const body = {
    summary: studentName,
    // 2026-07-10：ยืนยันแล้วจาก Google Calendar API อย่างเป็นทางการ — event colorId มีแค่ 11 สี (1-11)
    // ไม่มีสีชื่อ "Mango" เลย (Mango อยู่ในจานสี "สีปฏิทิน" 24 สีคนละระบบ ใช้กับ event เดี่ยวไม่ได้)
    // เทียบ RGB จริงจาก Google API แล้ว "Tangerine" (colorId '6', #ffb878) คือสีที่ Lin เลือกเอง
    // ใกล้เคียง Mango (#ffad46) ที่สุดในบรรดา 11 สีที่ใช้ได้จริง — ยืนยันกับ Lin แล้ว 2026-07-10
    colorId: '6',
    description: opts.startDate && opts.classTime
      ? '系統自動建立，用於產生固定的 Google Meet 連結' + (opts.recurring ? '（每週固定時間上課）' : '（單次課程）')
      : '系統自動建立，用於產生固定的 Google Meet 連結（實際上課時間依老師安排的課表為主）',
    start: { dateTime: start.toISOString(), timeZone: tz },
    end: { dateTime: end.toISOString(), timeZone: tz },
    recurrence: opts.recurring ? ['RRULE:FREQ=WEEKLY'] : undefined,
    conferenceData: {
      createRequest: {
        requestId: 'meet-' + Date.now() + '-' + Math.random().toString(36).slice(2),
        conferenceSolutionKey: { type: 'hangoutsMeet' }
      }
    }
  };
  let r = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events?conferenceDataVersion=1', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (r.status === 403) {
    const errBody = await r.text();
    if (/insufficient|scope|PERMISSION_DENIED/i.test(errBody)) {
      token = await gdGetToken(true);
      r = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events?conferenceDataVersion=1', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
    } else {
      throw new Error('建立 Meet 連結失敗（' + r.status + '）：' + errBody.slice(0, 200));
    }
  }
  if (!r.ok) throw new Error('建立 Meet 連結失敗（' + r.status + '）：' + (await r.text()).slice(0, 200));
  let data = await r.json();
  function extractLink(d) {
    const videoEntry = d.conferenceData && d.conferenceData.entryPoints && d.conferenceData.entryPoints.find(function(e) { return e.entryPointType === 'video'; });
    return d.hangoutLink || (videoEntry && videoEntry.uri);
  }
  let link = extractLink(data);
  // 2026-07-14 加（Lin 回報：Calendar 上看得到 Meet 連結，網站卻說沒有）：
  // Google 建立 Meet 連結是非同步的——剛建立完 event 那一瞬間，回應裡的 conferenceData
  // 常常還是「processing」狀態，entryPoints/hangoutLink 都還是空的，要過幾秒才會真的生出來
  // （這是 Google Calendar API 已知的行為，不是我們建立失敗）。原本的寫法只看第一次回應，
  // 沒等就直接判定「沒有連結」報錯——但 Google 那邊其實還在處理中，Calendar 事件本身已經
  // 建好了，等一下重新整理 Calendar 就會看到連結，只是我們的資料庫沒存到而已。
  // 改成：沒拿到就重新 GET 這個 event 最多 5 次，每次間隔 1.5 秒，給 Google 時間把連結生出來。
  if (!link) {
    for (let i = 0; i < 5 && !link; i++) {
      await new Promise(function(resolve) { setTimeout(resolve, 1500); });
      try {
        const pollRes = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events/' + encodeURIComponent(data.id), {
          headers: { Authorization: 'Bearer ' + token },
        });
        if (pollRes.ok) { data = await pollRes.json(); link = extractLink(data); }
      } catch (e) { /* 這次輪詢失敗就再試下一次，不中斷整個流程 */ }
    }
  }
  // ⚠️ 這裡故意不建議「再按一次 🔧 補課堂連結重試」——重按會再建立一個全新的 Calendar
  // 事件，變成同一位學生有兩筆重複課表。真的遇到這個罕見狀況，請改用「✏️」編輯，
  // 把 Google Calendar 裡那個事件的 Meet 連結手動複製貼上（只更新網站資料，不會動 Calendar）。
  if (!link) throw new Error('Google Calendar 事件已經建立好了，但 Meet 連結還沒產生完成（Google 那邊比較慢，通常等 10~20 秒就會出現）。請不要再按一次「🔧 補課堂連結」（會多建一筆重複課表）——到 Google Calendar 找到剛剛那個事件，等連結出現後複製，改用「✏️」編輯貼上就好。');
  return link;
}

// ── 2026-07-13 新增：處理「學生申請改期/取消」時，自動搜尋/移動/刪除 Calendar 事件 ──
// 全部用 teacherTimeToDate / TEACHER_TZ（固定泰國時間）計算，理由跟上面 createMeetLinkForStudent 一樣：
// 不信任瀏覽器當下時區設定，避免時間跑掉。

// 2026-07-15 改（Lin 要求）：上課時間欄位改回「下拉選單」（小時 00-23 + 分鐘只有 00/30），
// 不讓老師/學生自己打字了，改用兩個 <select> + 一個隱藏 <input>（id 不變，值="HH:MM"）同步，
// 這樣下面所有讀 .value 的地方完全不用改，isValidTimeStr() 還是拿來做最後一道防線。

// 小時+分鐘其中一個沒選 → 隱藏 input 清空；兩個都選了 → 組成 "HH:MM" 寫回隱藏 input，
// 再手動 dispatch input/change event，讓原本掛在隱藏 input 上的 oninput/onchange 屬性照常觸發。
function syncTimeDropdown(baseId) {
  var hEl = document.getElementById(baseId + '_h'), mEl = document.getElementById(baseId + '_m');
  var hidden = document.getElementById(baseId);
  if (!hEl || !mEl || !hidden) return;
  hidden.value = (hEl.value && mEl.value) ? (hEl.value + ':' + mEl.value) : '';
  hidden.dispatchEvent(new Event('input', { bubbles: true }));
  hidden.dispatchEvent(new Event('change', { bubbles: true }));
}

// 開 modal / 送出後要清空時間欄位 → 用這個，把小時+分鐘下拉跟隱藏 input 一起清空
// （原本直接 document.getElementById(id).value='' 只清得到隱藏 input，下拉選單不會跟著變空）
function resetTimeDropdown(baseId) {
  var hEl = document.getElementById(baseId + '_h'), mEl = document.getElementById(baseId + '_m');
  if (hEl) hEl.value = '';
  if (mEl) mEl.value = '';
  var hidden = document.getElementById(baseId);
  if (hidden) hidden.value = '';
}

// 2026-07-18 加（Lin 要求「➕加課堂時間」也改用下拉選單）：反過來，用「HH:MM」字串去設定
// 小時+分鐘下拉（例如帶入學生申請加課時填的時間）。分鐘只有 00/30 兩個選項——不是整點半點
// 就設不進去（下拉選不到那個值），保留隱藏 input 原始值，讓後面 isValidTimeStr() 還是會抓到格式沒對上。
function setTimeDropdown(baseId, value) {
  var hEl = document.getElementById(baseId + '_h'), mEl = document.getElementById(baseId + '_m');
  var hidden = document.getElementById(baseId);
  var m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec((value || '').trim());
  if (!m) { resetTimeDropdown(baseId); return; }
  if (hEl) hEl.value = m[1];
  if (mEl) mEl.value = (m[2] === '00' || m[2] === '30') ? m[2] : '';
  if (hidden) hidden.value = (hEl && mEl && hEl.value && mEl.value) ? (hEl.value + ':' + mEl.value) : '';
}

// 搜尋「某天」Calendar 上「標題完全等於學生姓名」的事件（singleEvents 展開後每一次重複都有自己的 id，
// 只動這一筆，不會影響其他週）。刻意用「完全相符」比對，不信任 Google 的模糊搜尋，找不到/找到超過 1 筆
// 都直接回傳給呼叫端自己決定要不要動作（絕不用猜的自動選一筆）。
async function findClassEventForRequest(studentName, dateStr) {
  let token = await gdGetToken();
  if (gdTokenScopes && gdTokenScopes.indexOf('calendar') === -1) token = await gdGetToken(true);
  const dayStart = teacherTimeToDate(dateStr, '00:00').toISOString();
  const dayEnd = new Date(teacherTimeToDate(dateStr, '00:00').getTime() + 24 * 3600 * 1000 - 1000).toISOString();
  const url = 'https://www.googleapis.com/calendar/v3/calendars/primary/events'
    + '?timeMin=' + encodeURIComponent(dayStart)
    + '&timeMax=' + encodeURIComponent(dayEnd)
    + '&singleEvents=true&orderBy=startTime&maxResults=50'
    + '&q=' + encodeURIComponent(studentName);
  let r = await fetch(url, { headers: { Authorization: 'Bearer ' + token } });
  if (r.status === 403) {
    const body = await r.text();
    if (/insufficient|scope|PERMISSION_DENIED/i.test(body)) {
      token = await gdGetToken(true);
      r = await fetch(url, { headers: { Authorization: 'Bearer ' + token } });
    }
  }
  if (!r.ok) throw new Error('Calendar API ' + r.status + '：' + (await r.text()).slice(0, 200));
  const data = await r.json();
  const name = (studentName || '').trim();
  return (data.items || []).filter(function(ev) { return (ev.summary || '').trim() === name; });
}

// 2026-07-16 加：如果申請單上已經記了真正的 Calendar 事件 ID（見 requestCancelClass），
// 直接用 ID 拿事件，不用再靠「姓名+日期」猜——比 findClassEventForRequest 準，優先用這個。
// 事件被刪過/ID 是舊的 → 回傳 null，呼叫端要自己退回用 findClassEventForRequest 搜尋。
async function getClassEventById(eventId) {
  const token = await gdGetToken();
  const r = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events/' + encodeURIComponent(eventId), {
    headers: { Authorization: 'Bearer ' + token },
  });
  if (r.status === 404 || r.status === 410) return null;
  if (!r.ok) throw new Error('Calendar API ' + r.status + '：' + (await r.text()).slice(0, 200));
  const ev = await r.json();
  if (ev.status === 'cancelled') return null;
  return ev;
}

// 把「某一次」課堂事件移到新時間（保留原本上課長度），只動這個 instance 的 id
async function moveClassEventOnce(eventId, newDateStr, newTimeStr, durationMs) {
  const token = await gdGetToken();
  const newStart = teacherTimeToDate(newDateStr, newTimeStr);
  const newEnd = new Date(newStart.getTime() + durationMs);
  const body = {
    start: { dateTime: newStart.toISOString(), timeZone: TEACHER_TZ },
    end: { dateTime: newEnd.toISOString(), timeZone: TEACHER_TZ },
  };
  const r = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events/' + encodeURIComponent(eventId), {
    method: 'PATCH', headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error('移動課堂失敗（' + r.status + '）：' + (await r.text()).slice(0, 200));
  return await r.json();
}

// 刪除「某一次」課堂事件（只刪這個 instance，不影響其他週的固定課程）
async function deleteClassEventOnce(eventId) {
  const token = await gdGetToken();
  const r = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events/' + encodeURIComponent(eventId), {
    method: 'DELETE', headers: { Authorization: 'Bearer ' + token },
  });
  if (!r.ok && r.status !== 410 && r.status !== 404) throw new Error('刪除課堂失敗（' + r.status + '）：' + (await r.text()).slice(0, 200));
}

// 2026-07-15 加（Lin 要求：改期/取消完要真的回頭確認 Calendar，不要只信任 API 回應）：
// 刪除/移動完之後重新 GET 一次同一個事件，確認 Calendar 上的實際狀態真的照預期變了。
async function verifyEventDeleted(eventId) {
  const calToken = await gdGetToken();
  const r = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events/' + encodeURIComponent(eventId), {
    headers: { Authorization: 'Bearer ' + calToken },
  });
  if (r.status === 404 || r.status === 410) return true; // ถูกลบไปจริงแล้ว
  if (r.ok) {
    const ev = await r.json();
    if (ev.status === 'cancelled') return true;
    throw new Error('Google Calendar 上這個事件還在（狀態：' + ev.status + '），看起來沒有真的刪除成功');
  }
  throw new Error('確認刪除結果時連線失敗（' + r.status + '），Calendar 上的實際狀態不確定，請自己到 Calendar 檢查一次');
}
async function verifyEventMoved(eventId, expectedStartIso) {
  const calToken = await gdGetToken();
  const r = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events/' + encodeURIComponent(eventId), {
    headers: { Authorization: 'Bearer ' + calToken },
  });
  if (!r.ok) throw new Error('確認改期結果時連線失敗（' + r.status + '），Calendar 上的實際狀態不確定，請自己到 Calendar 檢查一次');
  const ev = await r.json();
  const actualStart = ev.start && (ev.start.dateTime || ev.start.date);
  if (!actualStart || Math.abs(new Date(actualStart).getTime() - new Date(expectedStartIso).getTime()) > 60000) {
    throw new Error('Google Calendar 上的時間跟預期不一樣（Calendar 顯示：' + (actualStart || '無') + '），改期可能沒有成功，請自己到 Calendar 檢查一次');
  }
  return true;
}

// 2026-07-13 加：檢查新時段是否跟其他事件重疊（排除自己本身）。
// 🔴 2026-08-01 แก้ (audit ระบบเลื่อนคาบ ข้อ A7 — "เช็คไม่ได้" ห้ามแปลว่า "ไม่ชน")：
//   เดิมทุกกรณีที่เช็คไม่สำเร็จ (token หมดอายุ / 403 / เน็ตหลุด / โควตา Google หมด) จะ `return []`
//   ซึ่งปลายทางแปลว่า "ไม่มีอะไรชน" แล้วโชว์กล่องยืนยันสะอาดเอี่ยมให้ครูกด = ครูเข้าใจว่าเช็คแล้ว
//   ทั้งที่ไม่เคยเช็คสำเร็จเลย (ผิดกฎ RELIABILITY FIRST ข้อ "ห้ามขึ้นว่าสำเร็จถ้ายังไม่ได้ตรวจ")
//   เทียบกับฝั่งเพิ่มคาบ (checkFreebusyConflict) ที่ throw เสียงดังมาตั้งแต่แรก — คนละมาตรฐานในระบบเดียวกัน
//   ตอนนี้: คืนค่าเป็น { ok, items, reason } — ok=false แปลว่า "ยังไม่รู้" ไม่ใช่ "ไม่ชน"
//   ปลายทางต้องเขียนให้ครูเห็นตรงๆ ในกล่องยืนยันว่าเช็คไม่สำเร็จ (ไม่บล็อก เพราะครูตัดสินใจเองได้
//   และมองเห็นปฏิทินจริงอยู่แล้ว — ต่างจากฝั่ง LINE ที่ไม่มีกล่องให้อ่าน จึงตั้งเป็น "ไม่ผ่าน = ไม่ย้าย")
// ⚠️ maxResults เดิม 10 — วันที่ครูมีนัดเยอะ อาจถูกตัดจนมองไม่เห็นคาบที่ชนจริง ขยับเป็น 50
async function findConflictingEvents(newStartIso, newEndIso, excludeEventId) {
  try {
    const token = await gdGetToken();
    const url = 'https://www.googleapis.com/calendar/v3/calendars/primary/events'
      + '?timeMin=' + encodeURIComponent(newStartIso)
      + '&timeMax=' + encodeURIComponent(newEndIso)
      + '&singleEvents=true&orderBy=startTime&maxResults=50';
    const r = await fetch(url, { headers: { Authorization: 'Bearer ' + token } });
    if (!r.ok) return { ok: false, items: [], reason: 'Calendar API ' + r.status };
    const data = await r.json();
    // 🟡 2026-08-02 แก้ตัวกรองให้ตรงกับฝั่ง LINE (ตรวจ 3 ระบบ ข้อ 4.16)
    //   เดิมต่างจาก filterCandidateEvents ใน line-webhook 2 เรื่อง = ระบบเดียวกันตัดสินคนละแบบ:
    //   (1) ไม่ตัด recurringEventId → ถ้าเลขที่จำไว้เป็น "เลขชุดคาบประจำ" ระบบจะเห็นตัวเองเป็นสิ่งกีดขวาง
    //       แล้วเตือนครูว่า "ชนกับตัวเอง" ทุกครั้งที่ย้ายคาบในชุด
    //   (2) ไม่ข้าม transparency==='transparent' → รายการที่ครูตั้งเองว่า "ว่าง/ไม่ติดธุระ"
    //       (freeBusy ไม่นับ, ฝั่ง LINE ไม่นับ) แต่ที่นี่นับ = เตือนหลอก
    //   ⚠️ ตรรกะต้องตรงกับ supabase/functions/line-webhook/index.ts → filterCandidateEvents เป๊ะ
    return { ok: true, items: (data.items || []).filter(function(ev) {
      if (!ev) return false;
      if (ev.status === 'cancelled') return false;
      if (ev.transparency === 'transparent') return false;
      if (excludeEventId && (ev.id === excludeEventId || ev.recurringEventId === excludeEventId)) return false;
      return true;
    }), reason: null };
  } catch (e) { return { ok: false, items: [], reason: (e && e.message) || String(e) }; }
}

// 🔴 2026-08-01 เพิ่ม (audit ระบบเลื่อนคาบ ข้อ A7)：ข้อความเตือนเรื่องคาบชน สำหรับใส่ในกล่องยืนยัน
// รวมไว้ที่เดียวเพื่อให้ทุกเส้นทาง (ขอเลื่อนของนักเรียน / ยืนยันหลังนักเรียนตอบรับ) พูดเหมือนกันเป๊ะ

// 🔴 2026-08-01 เพิ่ม (audit ระบบเลื่อนคาบ ข้อ A8 — ด่านกันอดีต "ระดับชั่วโมง")
// ทำไมต้องมีตัวใหม่ ไม่ไปแก้ assertNotPastDate เดิม:
//   assertNotPastDate ถูกใช้ร่วมทั่วทั้งแอป (เพิ่มคาบ / เปลี่ยนตารางถาวร / เสนอเวลา) และหลายจุด
//   ตั้งใจให้ "วันนี้" ผ่านได้ — ถ้าไปเพิ่มเงื่อนไขเวลาเข้าไปในตัวเดิม จะกระทบเส้นทางอื่นที่ไม่เกี่ยวกัน
//   ตัวนี้ใช้เฉพาะ "ตอนกำลังจะย้ายคาบจริงๆ" ซึ่งเป็นจังหวะเดียวที่รู้ทั้งวันและเวลาแน่นอน
// รูที่อุด: 20:00 น. ครูยังกดย้ายคาบไป "วันนี้ 14:00" ได้ (ผ่าน min ของช่อง input, ผ่าน assertNotPastDate,
//   และตัวเช็คคาบชนก็ไม่เจออะไรเพราะช่วงนั้นว่างจริง) → คาบไปโผล่ในอดีต ระบบเตือนก่อนเรียนไม่มีวันยิง
function assertNotPastDateTime(dateStr, timeStr, label) {
  var name = label || '要改到的時間';
  if (!dateStr) { alert('⚠️ ' + name + '：還沒選日期'); return false; }
  var target = teacherTimeToDate(dateStr, timeStr || '00:00');
  if (!target || isNaN(target.getTime())) { alert('⚠️ ' + name + '：日期或時間格式怪怪的（' + dateStr + ' ' + (timeStr || '') + '），為了安全不處理。'); return false; }
  if (target.getTime() <= Date.now()) {
    alert('⚠️ ' + name + ' 已經是過去的時間了。\n\n你要移到的是 ' + dateStr + ' ' + (timeStr || '') + '（泰國時間），現在已經過了。\n\n'
      + '（系統一律不動已經過去的課——之前就是這樣把上過的課整批從 Calendar 刪掉的。\n'
      + '真的需要處理過去的課，請直接到 Google Calendar 手動調整。）');
    return false;
  }
  return true;
}

// 2026-07-14 加：封存學生時停掉「往後」的固定課，但「已經上過」的課堂紀錄一定要保留 —
//   固定課是「一個」有 RRULE 的 recurring event，「往後全部停掉、以前全部保留」不用一筆一筆刪，
//   只要把 RRULE 的 UNTIL 改成「現在這一刻」就好（UNTIL 之前的 occurrence 都還在，
//   之後的 occurrence 全部消失，天生就符合「上過的別動、以後的都停」）。
//   單次（非固定）課程才需要真的刪除。
// 2026-07-15 改版（Lin 要求：「直接用名字找，不要用下一堂課日期去猜」）：
//   舊版先算「下一堂課是哪天」再拿那天去 Calendar 找符合的 1 筆事件——如果學生一週上好幾天課
//   （例如週五+週一各自是獨立的 recurring event），舊版只找得到「下一堂課那天」對應的那一筆，
//   另一天的固定課系列完全沒被關掉，封存後還是會繼續每週出現。
//   新版改成：直接拿學生姓名去 Calendar 搜尋「未來 2 年內」所有符合的事件，不管幾天/幾個
//   獨立的 recurring series，全部找出來、去重（同一個 recurring 系列可能展開成很多筆 instance，
//   用 masterId 去重只留「主系列」），每一個系列各自關閉（UNTIL=現在）或刪除（單次）。
async function cancelFutureClassesForArchive(token) {
  const s = studentsCache[token];
  if (!s) return { ok: true, note: '找不到學生資料，略過 Calendar' };
  const studentName = s.name;

  // 1) 直接用姓名搜尋「未來 2 年內」所有符合的課堂事件（涵蓋所有星期幾、所有獨立的固定課系列）
  let items;
  try {
    const calToken = await gdGetToken();
    const nowIso = new Date().toISOString();
    const farFutureIso = new Date(Date.now() + 2 * 365 * 24 * 3600 * 1000).toISOString();
    const url = 'https://www.googleapis.com/calendar/v3/calendars/primary/events'
      + '?timeMin=' + encodeURIComponent(nowIso)
      + '&timeMax=' + encodeURIComponent(farFutureIso)
      + '&singleEvents=true&orderBy=startTime&maxResults=250'
      + '&q=' + encodeURIComponent(studentName);
    const r = await fetch(url, { headers: { Authorization: 'Bearer ' + calToken } });
    if (!r.ok) throw new Error('Calendar API ' + r.status + '：' + (await r.text()).slice(0, 200));
    const data = await r.json();
    const name = (studentName || '').trim();
    items = (data.items || []).filter(function(ev) { return ev.status !== 'cancelled' && (ev.summary || '').trim() === name; });
  } catch (e) { return { ok: false, error: '搜尋 Calendar 失敗：' + (e.message || e) }; }

  if (!items.length) return { ok: true, note: '在 Calendar 找不到符合的課堂事件（可能已經手動處理過）' };

  // 2) 去重：同一個 recurring 系列會展開成很多筆 instance，只留「主系列」的 id（masterId）處理一次
  const masterIds = [];
  items.forEach(function(ev) {
    const mid = ev.recurringEventId || ev.id;
    if (masterIds.indexOf(mid) === -1) masterIds.push(mid);
  });

  const errors = [];
  for (const masterId of masterIds) {
    let masterEv;
    try {
      const calToken = await gdGetToken();
      const mr = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events/' + encodeURIComponent(masterId), { headers: { Authorization: 'Bearer ' + calToken } });
      if (!mr.ok) throw new Error('讀取課表事件失敗（' + mr.status + '）');
      masterEv = await mr.json();
    } catch (e) { errors.push((e.message || e) + '（event: ' + masterId + '）'); continue; }

    // RELIABILITY FIRST：動 Calendar 之前先備份整包事件，之後有需要能人工復原
    // 2026-07-15 修：以前這裡空的 catch 會吞掉備份失敗，備份沒存到還是照樣往下關掉/刪掉
    // Calendar 事件——改成備份失敗就跳過這筆的風險操作，記進 errors 讓老師看到。
    try {
      const bkRes = await sb.from('classroom_calendar_backups').insert({
        request_id: null, token: token, action: 'archive_student',
        old_event_id: masterEv.id, new_event_id: null,
        old_event_json: masterEv, old_start: masterEv.start && (masterEv.start.dateTime || masterEv.start.date),
      });
      if (bkRes.error) throw new Error('備份失敗：' + bkRes.error.message);
    } catch (e) {
      errors.push((e.message || String(e)) + '（event: ' + masterEv.id + '，為了安全跳過這筆，沒有動 Calendar）');
      continue;
    }

    try {
      const calToken = await gdGetToken();
      if (masterEv.recurrence && masterEv.recurrence.length) {
        const untilStr = buildIcalUntilUtc(new Date());
        const patchBody = { recurrence: setRruleUntil(masterEv.recurrence, untilStr) };
        const pr = await fetch('https://www.googleapis.com/calendar/v3/calendars/primary/events/' + encodeURIComponent(masterEv.id), {
          method: 'PATCH', headers: { Authorization: 'Bearer ' + calToken, 'Content-Type': 'application/json' }, body: JSON.stringify(patchBody),
        });
        if (!pr.ok) throw new Error('關閉往後課表失敗（' + pr.status + '）：' + (await pr.text()).slice(0, 200));
      } else {
        await deleteClassEventOnce(masterEv.id);
      }
    } catch (e) { errors.push(e.message || String(e)); }
  }

  // 2026-07-14 加（Lin 回報：改過期的課，封存後還在未來出現）：如果這位學生「以前被
  // 單獨改期過」（用 🔄 改期／📌 固定 把某一次課移到別天），Google Calendar 會把那一次
  // 存成跟主系列分開的「例外」事件——只改主系列的 RRULE UNTIL 不會自動清掉這種已經
  // 移到未來某天的例外，要另外找出來刪掉，不然封存後那一次改期還是會單獨出現在未來。
  // 2026-07-15：改成對「每一個」masterId 都掃一次 leftover（原本只掃 1 個），涵蓋多天/多系列。
  try {
    const calToken = await gdGetToken();
    const nowIso2 = new Date().toISOString();
    const farFutureIso2 = new Date(Date.now() + 2 * 365 * 24 * 3600 * 1000).toISOString();
    const sweepUrl = 'https://www.googleapis.com/calendar/v3/calendars/primary/events'
      + '?timeMin=' + encodeURIComponent(nowIso2)
      + '&timeMax=' + encodeURIComponent(farFutureIso2)
      + '&singleEvents=true&orderBy=startTime&maxResults=250'
      + '&q=' + encodeURIComponent(studentName);
    const sweepRes = await fetch(sweepUrl, { headers: { Authorization: 'Bearer ' + calToken } });
    if (sweepRes.ok) {
      const sweepData = await sweepRes.json();
      const leftovers = (sweepData.items || []).filter(function(ev) {
        return ev.status !== 'cancelled' && masterIds.indexOf(ev.recurringEventId || ev.id) !== -1 && ev.id !== ev.recurringEventId;
      });
      // 🟠 2026-07-26 แก้：เดิมลบ exception ทีละอันโดย "ไม่มีการสำรอง" และ catch ว่างเปล่ากลืน error หมด
      // → ถ้าลบผิด/ลบพลาด กู้ไม่ได้เลย และครูไม่มีทางรู้ว่ามีอันไหนลบไม่ผ่าน
      // ใหม่: สำรองลง classroom_calendar_backups ก่อนทุกอัน (สำรองไม่สำเร็จ = ไม่ลบอันนั้น)
      //       + เก็บรายการที่ลบไม่ผ่านไปแจ้งครูตอนจบ ไม่กลืนเงียบ
      for (const ev of leftovers) {
        try {
          assertBackupOk(await backupCalendarEvent(null, token, 'archive_student', ev, null), '已改期過的單堂課');
          await deleteClassEventOnce(ev.id);
        } catch (e) {
          errors.push('清除已改期過的單堂課「' + (ev.summary || ev.id) + '」失敗：' + (e.message || String(e)));
        }
      }
    }
  } catch (e) {
    // 🟠 2026-07-26：ยังไม่บล็อกการ封存 แต่ห้ามกลืนเงียบ — ต้องบอกครูว่าเก็บกวาดไม่สำเร็จ
    errors.push('掃描「已改期過的單堂課」失敗：' + (e.message || String(e)) + '（請自己到 Calendar 檢查一次）');
  }

  // 🟠 2026-07-26 เพิ่ม：ล้างรายการ "วันเรียนประจำ" ของนักเรียนที่ถูกเก็บเข้ากรุด้วย
  // เดิมไม่มีที่ไหนลบแถวในตาราง classroom_recurring_days เลยสักที่ — ไม่เคยเป็นปัญหาเพราะ
  // กฎเก่า (วันละ 1 รอบเวลา) ทำให้แถวเก่าถูกทับทิ้งเองตอนเพิ่มวันเดิมซ้ำ
  // แต่พอเปลี่ยนเป็น "วันเดียวกันมีหลายรอบเวลาได้" แถวเก่าจะไม่ถูกทับอีกแล้ว → ค้างสะสม
  // → ตอนกด "➕ 加課堂時間" ช่อง "วันเรียนประจำที่มีอยู่" จะโชว์คาบผีของนักเรียนที่เลิกเรียนไปแล้ว
  //   ซึ่งเป็นช่องที่ครูใช้ "ดูก่อนเพิ่ม" พอดี = หลอกตาตรงจุดที่สำคัญที่สุด
  // ⚠️ ลบเฉพาะตอนที่ "ขั้นตอน Calendar ข้างบนสำเร็จครบทุกอย่าง" เท่านั้น
  //    แถวพวกนี้คือที่เดียวที่จำได้ว่าคาบประจำอันไหนผูกกับ event ไหนใน Calendar
  //    และไม่ได้ถูกสำรองไว้ที่ไหนเลย (ต่างจาก event ที่มี classroom_calendar_backups)
  //    → ถ้าปิดคาบใน Calendar ไม่สำเร็จ แล้วเรามาลบสายเชื่อมทิ้ง = คาบยังอยู่แต่ตามหาไม่เจอตลอดกาล
  if (!errors.length) {
    try {
      const rdDel = await sb.from('classroom_recurring_days').delete().eq('token', token).select();
      if (rdDel.error) errors.push('清空「每週固定上課日」資料失敗：' + rdDel.error.message + '（不影響封存本身，之後恢復時可能會看到舊的固定時段）');
    } catch (e) {
      errors.push('清空「每週固定上課日」資料失敗：' + (e.message || String(e)));
    }
  }

  if (errors.length) return { ok: false, error: errors.join('；') };

  return { ok: true };
}
