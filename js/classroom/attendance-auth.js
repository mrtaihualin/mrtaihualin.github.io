// ============================================================
// FILE MAP: attendance/schedule sync → history/edit/delete → slip status → teacher session/OTP boot
// ATTENDANCE SYSTEM
// ============================================================
async function recordAttendance(token) {
  const s = studentsCache[token];
  const name = s ? s.name : token;
  const today = teacherToday();
  const btn = document.getElementById('attend-' + token);
  // 🔴 2026-07-26：เช็ค session ก่อนเขียน — อาการ "new row violates row-level security policy" ที่เจอจริง
  // เกิดจาก session หมดอายุ ไม่ใช่ฐานข้อมูลพัง (ดู ensureTeacherSession)
  if (!(await ensureTeacherSession('記錄今日上課'))) return;
  if (btn) { btn.disabled = true; btn.textContent = '記錄中…'; }
  // 2026-07-15 修（🔴 項目3）：以前「先查今天有沒有紀錄 → 再決定 insert 或 update」是
  // check-then-act，雙擊按鈕或開兩個分頁同時按，會各自查到「還沒有」再各自 insert（重複兩筆），
  // 或各自查到同一個 lessons 值各自 +1（結果少算一堂）——兩種都會讓學生的堂數算錯。
  // 已請 Lin 確認 classroom_attendance 已經有 (token, lesson_date) 的 unique constraint
  // （classroom_attendance_token_lesson_date_key），改用資料庫端 record_attendance_increment()
  // 做「INSERT ... ON CONFLICT DO UPDATE」原子的 insert-or-increment，不在 JS 端查完再算。
  const attRes = await sb.rpc('record_attendance_increment', {
    p_token: token, p_student_name: name, p_lesson_date: today
  });
  if (btn) { btn.disabled = false; }
  if (attRes.error || !attRes.data || !attRes.data.length) {
    // 🔴 2026-07-26：แปล error ดิบของฐานข้อมูลเป็นภาษาคนก่อน (โดยเฉพาะเคส session หมดอายุ)
    alert(await writeErrorMessage(attRes.error ? attRes.error.message : '資料庫沒有回傳結果', '記錄今日上課'));
    if (btn) btn.textContent = '✅ 今日上課'; return;
  }
  await refreshTodayScheduleSection(); // refresh today section（2026-07-06 修正：原本呼叫 loadTodaySchedule() 會把整塊課表重置成「尚未連接」的初始畫面，卡片跟按鈕就整個消失，要重新連接才會再出現）
  openAttendanceHistory(token); // open history so Lin can verify & undo
  loadLowQuotaBanner();
  loadTeacherStudentInfo(token);
  // 2026-07-15 加（Lin 要求）：บันทึกเข้าเรียนเสร็จ เช็คทันทีว่าคาบนี้เป็นคาบสุดท้ายของรอบไหม
  // ถ้าใช่ ส่ง LINE เตือนนักเรียนทันทีวันนั้นเลย ไม่ต้องรอ cron วันละครั้งตอน 9 โมงเช้า
  // (best-effort — ยิงไปเฉยๆ ไม่รอผล ไม่กระทบการบันทึกเข้าเรียนซึ่งสำเร็จไปแล้วข้างบน)
  try {
    fetch(LOW_QUOTA_CHECK_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'apikey': window.SUPABASE_CONFIG.anonKey, 'Authorization': 'Bearer ' + (await teacherAuthHeader()) },
      body: JSON.stringify({ token: token })
    }).catch(function() { /* best-effort — cron รายวันยังเป็นตาข่ายสำรอง */ });
  } catch (e) { /* best-effort เฉยๆ ไม่ critical — cron วันละครั้งเป็นตาข่ายสำรองอยู่แล้ว */ }
}

// 2026-07-06 新增：記錄/取消出席後，用這個來刷新「近期課表」區塊
//   已經連接過 Google Calendar（有 localStorage flag）→ 直接重新抓真正的課表（跟按「連接 Google Calendar」效果一樣）
//   還沒連接過 → 維持原本顯示「連接 Google Calendar」按鈕，不會平白多打一次 Google API
async function refreshTodayScheduleSection() {
  if (localStorage.getItem('gdConnected')) {
    await connectCalendar();
  } else {
    await loadTodaySchedule();
  }
}

async function loadTodaySchedule() {
  const container = document.getElementById('attendanceSection');
  if (!container) return;
  container.innerHTML = '<div class="attend-card"><h2>📅 近期課表（' + SCHEDULE_DAYS + '天）</h2>'
    + '<div class="empty-attend"><button class="btn-gold" id="calConnectBtn" onclick="connectCalendar()">📅 連接 Google Calendar</button>'
    + '<div style="margin-top:8px;font-size:0.77rem;color:var(--ink-muted);font-family:\'Noto Sans TC\',sans-serif;">點擊後登入 Google 帳號即可顯示今日課表</div></div></div>';
}

let _calConnecting = false;
async function connectCalendar() {
  if (_calConnecting) return;
  _calConnecting = true;
  const container = document.getElementById('attendanceSection');
  const now = new Date();
  const dayZh = ['日','一','二','三','四','五','六'];
  // 2026-07-10：一律用「泰國時間」判斷今天/日期，不用瀏覽器本地時區猜（避免這台電腦時區設錯就跟著算錯）
  const nowParts = formatInTz(now, TEACHER_TZ);

  if (container) {
    const inner = container.querySelector('.attend-card');
    if (inner) inner.innerHTML = '<h2>📅 近期課表（' + SCHEDULE_DAYS + '天）</h2><div class="empty-attend">連接中…</div>';
  }

  try {
    // 2026-07-15 改：ดึงยาวขึ้นเป็น SCHEDULE_SYNC_DAYS (90 วัน) — ไม่ใช่แค่ SCHEDULE_DAYS (3 วัน, แก้ 2026-07-18)
    // เหตุผล：matched ชุดนี้จะถูกส่งเข้า syncScheduleToSupabase() ทั้งหมด ให้นักเรียนที่เรียน
    // หลายวัน/สัปดาห์เลือก "คาบจะยกเลิก" ได้ครบจริง ไม่ใช่แค่ 9 วันที่จอครูเองแสดง
    // (จอครู "近期課表" ยังคงตัดมาแสดงแค่ SCHEDULE_DAYS วันเหมือนเดิม ดูด้านล่าง matchedForDisplay)
    const events = await calFetchUpcomingEvents(SCHEDULE_SYNC_DAYS);
    const studentNames = Object.entries(studentsCache);
    const todayKey = nowParts.dateStr;
    // 2026-07-11 修 bug：按「今日上課」畫面上卡片會馬上被移除，但這裡是整段重新用 Google Calendar
    // 資料重建近期課表——行事曆的活動不會因為記錄出席就消失，所以重建後同一堂課又跑回來了
    // （Lin 回報「กดไปแล้ว เด้งกลับมาใหม่อยู่ดี」）。
    // 修法：先查今天已經記錄出席的 token，重建列表時把「今天 + 已記錄出席」的課直接排除，不再顯示。
    let attendedTodayTokens = new Set();
    try {
      const { data: attendedRows, error: attendedErr } = await sb.from('classroom_attendance')
        .select('token').eq('lesson_date', todayKey);
      if (!attendedErr && attendedRows) attendedTodayTokens = new Set(attendedRows.map(function(r){ return r.token; }));
    } catch(attendErrCatch) { /* 查不到就當作沒人記錄過，不影響原本流程 */ }
    const matched = [];
    events.forEach(function(ev) {
      const title = (ev.summary || '').toLowerCase();
      // 2026-07-19 แก้บั๊ก (Lin สั่ง)：เดิมเช็คแบบ substring ตรงๆ (title.includes(ชื่อ)) — ถ้ามีนักเรียน
      // 2 คนที่ชื่อหนึ่งเป็นส่วนหนึ่งของอีกชื่อ (เช่น "Ann" อยู่ใน "Anna") event ชื่อ "Anna" จะจับคู่ผิด
      // ไปโดนทั้ง 2 คน ตอนนี้เก็บผู้สมัครทั้งหมดก่อน แล้วตัดคนที่ชื่อสั้นกว่า+เป็น substring ของอีกคนที่จับคู่ได้ทิ้ง
      // (เก็บเฉพาะชื่อที่ยาว/เจาะจงกว่าไว้) — ถ้ามีการตัดออกจะ log เตือนไว้ กันเงียบเกินไป (RELIABILITY FIRST)
      const candidates = studentNames.filter(function(entry) { return title.includes(entry[1].name.toLowerCase()); });
      const finalists = candidates.filter(function(entry) {
        return !candidates.some(function(other) {
          return other[1].name !== entry[1].name
            && other[1].name.toLowerCase().includes(entry[1].name.toLowerCase())
            && other[1].name.length > entry[1].name.length;
        });
      });
      if (finalists.length < candidates.length) {
        console.warn('[connectCalendar] ชื่อนักเรียนซ้อนกันใน event "' + (ev.summary || '') + '" — ตัดชื่อสั้นกว่าออก:',
          candidates.map(function(c){return c[1].name;}), '→ เหลือ', finalists.map(function(c){return c[1].name;}));
      }
      finalists.forEach(function(entry) {
        const token = entry[0], s = entry[1];
        const hasDateTime = !!(ev.start && ev.start.dateTime);
        const startAbs = hasDateTime ? new Date(ev.start.dateTime)
          : ev.start && ev.start.date ? teacherTimeToDate(ev.start.date, '00:00') : now;
        // 2026-07-10：一律用 formatInTz 換算成泰國時間的日期/時間/星期幾，不再用 browser 本地時區的
        // getFullYear()/getMonth()/getDate()/toLocaleTimeString()（那些是「這台電腦現在的時區」，不保證是泰國）
        const startParts = formatInTz(startAbs, TEACHER_TZ);
        const startTime = hasDateTime ? startParts.timeStr : (ev.start && ev.start.date ? '全天' : '');
        const endTime = ev.end && ev.end.dateTime ? formatInTz(new Date(ev.end.dateTime), TEACHER_TZ).timeStr : '';
        const dayKey = startParts.dateStr;
        const isoDate = startParts.dateStr;
        const dayLabel = parseInt(startParts.dateStr.slice(5,7),10) + '月' + parseInt(startParts.dateStr.slice(8,10),10) + '日（週' + dayZh[startParts.weekday] + '）';
        const isToday = dayKey === todayKey;
        if (isToday && attendedTodayTokens.has(token)) return; // 今天已記錄出席過 → 不再顯示這張卡
        // 🟠 2026-07-31 加（งาน C5 — RELIABILITY）：เดิมตรงนี้ทิ้ง ev.id ไปเฉยๆ ทั้งที่มีอยู่ในมือแล้ว
        // ทำให้แถวที่ "เบราว์เซอร์ครู" เขียนลงตาราง ไม่มีเลขอ้างอิงคาบของ Google Calendar ติดไปด้วย
        // → นักเรียนที่กดขอยกเลิกในจังหวะนั้น (ก่อน cron รอบถัดไป) จะได้คำขอที่ไม่มีเลขคาบ
        //   ครูกดจัดการแล้วระบบต้องถอยไปเดาจาก "ชื่อ+วัน" ซึ่งถ้าเจอ 0 หรือ 2 รายการจะไม่ยอมทำอะไรเลย
        //   ส่วนปุ่มใน LINE ไม่มีทางถอยเลย ตอบ「請到網站手動處理」อย่างเดียว
        // ตัว cron แก้จุดนี้ไปแล้วตั้งแต่ 2026-07-19 (calendar-schedule-sync-cron/index.ts:166)
        // แต่ฝั่งเบราว์เซอร์ไม่ได้แก้ตาม — อันนี้คือแก้ให้ตรงกัน ใช้วิธีเดียวกันเป๊ะ
        matched.push({ token, s, startTime, endTime, dayKey, isoDate, dayLabel, isToday, eventId: ev.id || null });
      });
    });

    // 2026-07-15 加：matched ตอนนี้ยาวถึง SCHEDULE_SYNC_DAYS (30 วัน) แล้ว แต่จอครู "近期課表"
    // ยังอยากโชว์แค่ SCHEDULE_DAYS (3 วัน, แก้ 2026-07-18) เหมือนเดิม (ไม่ให้รกจอ) → ตัดมาแสดงแค่ช่วงนี้
    const displayCutoff = formatInTz(new Date(teacherTimeToDate(todayKey, '00:00').getTime() + SCHEDULE_DAYS * 24 * 3600 * 1000), TEACHER_TZ).dateStr;
    const matchedForDisplay = matched.filter(function(m) { return m.dayKey < displayCutoff; });

    let content;
    if (matchedForDisplay.length === 0) {
      content = '<div class="empty-attend">未來七天沒有排課</div>';
    } else {
      // จัดกลุ่มตามวัน (events เรียงตามเวลามาแล้ว → ลำดับวันถูกต้อง)
      const order = []; const groups = {};
      matchedForDisplay.forEach(function(item) {
        if (!groups[item.dayKey]) { groups[item.dayKey] = []; order.push(item.dayKey); }
        groups[item.dayKey].push(item);
      });
      content = order.map(function(key) {
        const list = groups[key];
        const head = list[0];
        const todayTag = head.isToday
          ? '<span style="margin-left:8px;font-size:0.7rem;background:var(--gold-deep);color:#fff;padding:1px 8px;border-radius:10px;vertical-align:middle;">今日</span>'
          : '';
        const dayHead = '<div style="margin:14px 0 6px;padding-bottom:4px;border-bottom:1px solid rgba(0,0,0,0.08);font-weight:700;font-size:0.9rem;font-family:\'Noto Sans TC\',sans-serif;color:var(--ink);">' + head.dayLabel + todayTag + '</div>';
        const rows = list.map(function(item) {
          const timeStr = item.startTime + (item.endTime ? '–' + item.endTime : '');
          const action = item.isToday
            ? '<button class="today-done" style="background:linear-gradient(135deg,var(--gold-bright),var(--gold-deep));color:#fff;" onclick="recordAttendance(\'' + item.token + '\');this.closest(\'.class-card\').remove()">✅ 今日上課</button>'
            : '<span style="font-size:0.78rem;color:var(--ink-muted);font-family:\'Noto Sans TC\',sans-serif;align-self:center;">即將到來</span>';
          return '<div class="today-row class-card">' +
            '<div style="flex:1;">' +
              '<span class="t-name">' + escHtml(item.s.name) + '</span>' +
              (timeStr ? '<div style="font-size:0.78rem;color:var(--ink-muted);font-family:\'Noto Sans TC\',sans-serif;margin-top:2px;">' + timeStr + '</div>' : '') +
            '</div>' + action +
          '</div>';
        }).join('');
        return dayHead + '<div class="attend-list">' + rows + '</div>';
      }).join('');
    }

    if (container) container.innerHTML = '<div class="attend-card"><h2>📅 近期課表（' + SCHEDULE_DAYS + '天）</h2>' + content + '</div>';
    syncScheduleToSupabase(matched);  // ซิงค์คาบล่วงหน้าลงฐานข้อมูล → นักเรียนเห็นในหน้าตัวเอง
  } catch(e) {
    if (container) container.innerHTML = '<div class="attend-card"><h2>📅 近期課表（' + SCHEDULE_DAYS + '天）</h2>'
      + '<div class="empty-attend"><div style="color:var(--amber);font-size:0.82rem;margin-bottom:8px;">連接失敗：' + e.message + '</div>'
      + '<button class="btn-gold" onclick="connectCalendar()">🔄 重試</button></div></div>';
  } finally {
    _calConnecting = false;
  }
}

// ซิงค์คาบล่วงหน้า (จาก Calendar) ลง Supabase → หน้านักเรียนดึงไปแสดง
async function syncScheduleToSupabase(matched) {
  try {
    // 🔴 2026-07-26：ซิงค์ตารางเป็นการ "เขียน+ลบ" ข้อมูลตารางเรียนของนักเรียนทุกคน
    // ถ้า session หมดอายุ RLS จะบล็อกแบบเงียบๆ (เขียนไม่เข้า/ลบไม่ออก 0 แถว) → ต้องเช็คก่อนเริ่ม
    // ⚠️ ใช้โหมดเงียบ (silent) เพราะฟังก์ชันนี้ถูกเรียกอัตโนมัติตอนเปิดหน้า ไม่ได้มาจากการกดปุ่ม
    //    ถ้าเด้ง alert + กลับหน้าล็อกอินตรงนี้ จอครูจะถูกล้างกลางคันทั้งที่ยังโหลดไม่เสร็จ
    //    → แจ้งเป็นแถบเตือนในหน้าแทน (ดูข้างล่าง) แล้วจบเงียบๆ
    if (!(await ensureTeacherSession('同步課表', true))) {
      var syncWarnEl = document.getElementById('attendanceSection');
      if (syncWarnEl) {
        syncWarnEl.insertAdjacentHTML('afterbegin',
          '<div style="background:var(--cream);border:1.5px solid var(--amber);border-radius:10px;padding:10px 13px;margin-bottom:10px;'
          + 'font-family:\'Noto Sans TC\',sans-serif;font-size:0.84rem;color:var(--amber-dark);font-weight:700;">'
          + '🔑 老師登入已經過期，這次「沒有」同步課表到學生那邊'
          + '<span style="font-weight:400;display:block;margin-top:3px;color:var(--ink-muted);">'
          + '資料完全沒有被改動。請重新登入之後再連接一次 Google Calendar。</span></div>');
      }
      return;
    }
    const todayIso = teacherToday();
    // 🔴 2026-07-19 แก้บั๊กแดง (AI ตรวจ 2 ตัวเจอตรงกัน — ตัวหนึ่งอ่านโค้ด ตัวหนึ่งเห็น DELETE 204 ในเว็บจริง)
    // เดิม: "ลบคาบอนาคตของนักเรียนทุกคนทิ้งก่อน แล้วค่อยเช็คว่ามีข้อมูลจะเขียนไหม" (เช็คทีหลังการลบ)
    //   → ถ้ารอบนั้นดึง Calendar ได้ไม่ครบ / จับคู่ชื่อไม่เจอสักคน / เน็ตหลุดหลังลบ
    //     = ตารางเรียนของนักเรียนทุกคนหายเกลี้ยง กู้ไม่ได้ (ตรงกับบทเรียน RELIABILITY FIRST)
    // ใหม่: "เขียนของใหม่ให้สำเร็จก่อน แล้วค่อยลบเฉพาะแถวที่หายไปจาก Calendar จริงๆ ทีละ id"
    //   → ไม่มีวินาทีไหนเลยที่ตารางว่าง และถ้าขั้นไหนพัง จะหยุดโดยที่ข้อมูลเดิมยังอยู่ครบ
    if (!matched || !matched.length) {
      console.warn('[syncSchedule] รอบนี้จับคู่คาบไม่ได้เลย → ไม่แตะฐานข้อมูล (กันลบตารางทิ้งทั้งหมด)');
      return;
    }
    // 2026-07-16 แก้（error: "ON CONFLICT DO UPDATE command cannot affect row a second time"）：
    //   ต้นตอคือ matched มีแถวซ้ำ key เดียวกัน (token+lesson_date+start_time) ปนมาในชุดเดียวกัน
    //   (เช่น ชื่อนักเรียนคนหนึ่งเป็นคำย่อยของอีกคน หรือ event ปฏิทินซ้อนกันพอดีเวลาเดียวกัน)
    //   Postgres ห้าม 1 คำสั่ง upsert แก้แถวเดียวกันซ้ำ 2 รอบ → ต้อง dedupe ฝั่ง JS ก่อนส่งเข้า upsert เสมอ
    const rowMap = new Map();
    matched.forEach(function(m) {
      const key = m.token + '|' + m.isoDate + '|' + (m.startTime || '');
      // 🟠 2026-07-31 加（งาน C5）：เก็บเลขอ้างอิงคาบของ Google Calendar ลงไปด้วย
      // เขียนแบบเดียวกับตัว cron เป๊ะ (calendar-schedule-sync-cron/index.ts:175) เพื่อให้ 2 ฝั่งไม่ตีกัน
      rowMap.set(key, { token: m.token, lesson_date: m.isoDate, start_time: m.startTime || '', end_time: m.endTime || '', title: m.s.name, calendar_event_id: m.eventId || null });
    });
    const rows = Array.from(rowMap.values());
    // 2026-07-15 แก้（Lin ตรวจเจอ classroom_schedule มีแถวซ้ำเป็นร้อย ทุก token）：
    //   ต้นตอจริงคือ RLS บล็อกการลบข้างบนแบบเงียบๆ (ไม่ error, แค่ลบได้ 0 แถว) ตามที่ comment
    //   2026-07-11 เตือนไว้แล้ว — แก้ RLS ให้ลบได้จริงคือทางหลัก แต่เพิ่มเกราะกันชั้นที่ 2 ไว้ด้วย：
    //   เปลี่ยนจาก insert เป็น upsert (ทับซ้ำแทนสร้างซ้ำ) กันไว้เผื่อเปิดหลายแท็บพร้อมกันแล้วชนกัน
    //   ต้องมี unique constraint (token, lesson_date, start_time) ในฐานข้อมูลก่อน ไม่งั้น onConflict จะไม่มีผล
    const { error } = await sb.from('classroom_schedule')
      .upsert(rows, { onConflict: 'token,lesson_date,start_time' });
    if (error) {
      console.warn('ซิงค์ตารางลง Supabase ไม่สำเร็จ:', error.message);
      alert('⚠️ ซิงค์ตารางไม่สำเร็จ（เขียนข้อมูลใหม่ไม่ได้）：' + error.message + '\nข้อมูลเดิมยังอยู่ครบ ไม่มีอะไรถูกลบ');
      return;   // เขียนไม่สำเร็จ → ห้ามลบอะไรทั้งสิ้น
    }

    // ---- ขั้นที่ 2：ค่อยเก็บกวาดคาบเก่าที่หายไปจาก Calendar แล้ว (ลบทีละ id เท่านั้น ไม่ลบเหมาเข่ง) ----
    const keepKeys = new Set(rows.map(function(r){ return r.token + '|' + r.lesson_date + '|' + r.start_time; }));
    // ขอบเขตการเก็บกวาด = นักเรียนทุกคนที่รู้จัก (ไม่ใช่แค่คนที่มีคาบรอบนี้) เพราะคนที่ถูกยกเลิกครบทุกคาบ
    // จะไม่โผล่ใน rows แต่แถวเก่าของเขาต้องถูกลบด้วย ไม่งั้นนักเรียนจะเห็นคาบผีค้างอยู่
    let scopeTokens = Array.from(new Set(rows.map(function(r){ return r.token; })));
    try {
      if (typeof studentsCache !== 'undefined' && studentsCache) {
        const all = Object.keys(studentsCache);
        if (all.length) scopeTokens = Array.from(new Set(all.concat(scopeTokens)));
      }
    } catch (e) {}
    // 🟠 2026-07-26 แก้：เดิมมีแต่ขอบล่าง (.gte วันนี้) ไม่มีขอบบน
    //   แต่ rows ที่เพิ่งเขียนมาจาก Calendar แค่ช่วง SCHEDULE_SYNC_DAYS วันเท่านั้น
    //   → คาบที่อยู่ "ไกลกว่าหน้าต่างที่ซิงค์" จะไม่มีวันอยู่ใน keepKeys เลย เลยถูกมองว่าเก่าและโดนลบทุกครั้ง
    //   (ซิงค์ทีไร คาบไกลๆ ก็หายไปรอบหนึ่ง แล้วกลับมาเมื่อขยับเข้ามาในหน้าต่าง — ตารางนักเรียนกะพริบ)
    // ใหม่: จำกัดขอบเขตการเก็บกวาดให้เท่ากับหน้าต่างที่ซิงค์จริงๆ เท่านั้น
    const syncWindowEndIso = formatInTz(new Date(teacherTimeToDate(todayIso, '00:00').getTime()
      + (SCHEDULE_SYNC_DAYS * 24 * 3600 * 1000) - 1000), TEACHER_TZ).dateStr;
    const { data: existing, error: selError } = await sb.from('classroom_schedule')
      .select('id,token,lesson_date,start_time')
      .gte('lesson_date', todayIso)
      .lte('lesson_date', syncWindowEndIso)
      .in('token', scopeTokens);
    if (selError) {
      console.warn('อ่านตารางเดิมเพื่อเก็บกวาดไม่สำเร็จ:', selError.message);
      return;   // อ่านไม่ได้ → ไม่ลบ (ของใหม่เขียนลงไปแล้ว ข้อมูลไม่หาย แค่อาจมีคาบเก่าค้าง)
    }
    const staleRows = (existing || [])
      .filter(function(r){ return !keepKeys.has(r.token + '|' + r.lesson_date + '|' + (r.start_time || '')); });
    const staleIds = staleRows.map(function(r){ return r.id; });
    if (staleIds.length) {
      // 🛑 กันพลาดใหญ่ ชั้นที่ 1: ถ้ารอบนี้จะลบเกินครึ่งของ "ยอดรวมทุกคน" (และ ≥3 แถว) แปลว่าน่าจะผิดปกติทั้งระบบ
      // (เช่น Calendar โหลดมาไม่ครบ) → ถามครูก่อน ไม่ลบเงียบๆ
      const total = (existing || []).length;
      let proceedIds = staleIds;
      if (staleIds.length >= 3 && staleIds.length > total * 0.5) {
        const ok = confirm('⚠️ ระบบกำลังจะลบคาบเก่า ' + staleIds.length + ' จาก ' + total + ' แถว (รวมทุกคน)\n'
          + 'จำนวนเยอะผิดปกติ — อาจเป็นเพราะ Google Calendar โหลดมาไม่ครบรอบนี้\n\n'
          + 'กด OK = ลบตามนี้　·　กด Cancel = ไม่ลบ (ปลอดภัยกว่า แล้วค่อยกดซิงค์ใหม่)');
        if (!ok) { console.warn('[syncSchedule] ครูเลือกไม่ลบรอบนี้'); return; }
      }
      // 🛑 กันพลาดใหญ่ ชั้นที่ 2 (เพิ่ม 2026-07-25 ตาม Lin สั่ง): ยกเลิกทีละนัด/สองนัดของนักเรียนคนหนึ่ง = ปกติ ไม่ต้องถาม
      // แต่ถ้านักเรียนคนไหนคนหนึ่งจะโดนลบเกินครึ่งของคาบตัวเอง (และ ≥3 แถว) ต้องถามก่อนเสมอ แม้ยอดรวมทุกคนจะดูไม่เยอะ
      // (เคสจริง 2026-07-25: 育郁 โดนลบคาบเก่าหมดทุกแถว แต่ยอดรวมทุกคนไม่เกินครึ่ง เลยไม่มีการเตือนมาก่อนหน้านี้)
      const totalByToken = {}, staleByToken = {};
      (existing || []).forEach(function(r){ totalByToken[r.token] = (totalByToken[r.token] || 0) + 1; });
      staleRows.forEach(function(r){ (staleByToken[r.token] = staleByToken[r.token] || []).push(r.id); });
      // 2026-07-25 แก้ตาม Lin สั่ง: ยกเลิก 1 คาบเดียวของนักเรียนคนไหน = ปกติ ไม่ถาม · เกิน 1 คาบ (≥2) ต้องถามเสมอ
      const flagged = Object.keys(staleByToken).map(function(token) {
        return { token: token, cnt: staleByToken[token].length, tot: totalByToken[token] || 0 };
      }).filter(function(f) { return f.cnt > 1; });
      if (flagged.length) {
        const lines = flagged.map(function(f) {
          const nm = (typeof studentsCache !== 'undefined' && studentsCache && studentsCache[f.token] && studentsCache[f.token].name) || f.token;
          return '・' + nm + '：จะถูกลบ ' + f.cnt + ' จาก ' + f.tot + ' คาบ';
        }).join('\n');
        const ok2 = confirm('⚠️ นักเรียนต่อไปนี้กำลังจะถูกลบคาบเก่าเกินครึ่งของตัวเอง:\n' + lines
          + '\n\nกด OK = ลบตามนี้　·　กด Cancel = ข้ามคนเหล่านี้ไว้ก่อน (คนอื่นลบตามปกติ ไม่กระทบ)');
        if (!ok2) {
          const skipTokens = new Set(flagged.map(function(f){ return f.token; }));
          proceedIds = proceedIds.filter(function(id) {
            const row = staleRows.find(function(r){ return r.id === id; });
            return row && !skipTokens.has(row.token);
          });
          console.warn('[syncSchedule] ครูเลือกข้ามการลบของนักเรียนที่ถูก flag:', Array.from(skipTokens));
        }
      }
      if (!proceedIds.length) return;
      const { error: delError } = await sb.from('classroom_schedule').delete().in('id', proceedIds);
      if (delError) {
        console.error('เก็บกวาดคาบเก่าไม่สำเร็จ:', delError.message);
        alert('⚠️ เขียนตารางใหม่สำเร็จแล้ว แต่ลบคาบเก่าที่ยกเลิกไปไม่ได้ (' + delError.message + ')\n'
          + 'นักเรียนอาจเห็นคาบที่ยกเลิกแล้วค้างอยู่ — แคปหน้าจอนี้แจ้ง Lin/AI');
      }
    }
  } catch (e) {
    console.warn('syncScheduleToSupabase error:', e);
    alert('⚠️ ซิงค์ตารางเกิดข้อผิดพลาด：' + (e.message || e));
  }
}

// 2026-07-19 改（Lin 要求，第二輪：畫面要真的長得跟學生那邊一樣，不是只有邏輯像）：
// 📅上課記錄 改成跟學生的 📅我的課程記錄 同一套「表格＋上課日期/狀態」樣式（courseTableHtml），
// 不再用舊的 hist-row 條列樣式。「本期課程」合併已上（✅已完成，來自 classroom_attendance，
// 保留 id 才能編輯/刪除）+ 還沒上到的未來排課（⏳未完成，來自 get_student_schedule，跟學生端
// 同一支 RPC），依日期排序成一張表；只有已完成的列才有編輯/刪除按鈕（多一欄「操作」）。
// 「過去的課程記錄」維持原本可摺疊，一樣改成表格樣式配編輯/刪除。
// 標題文字也跟學生端一樣寫「共 X 堂」（X＝表格列數，不是 classroom_attendance 的 lessons 加總，
// 上一版「本輪共 1 堂（6 天）」數字對不起來就是這裡搞錯，這次修正一致）。
// 2026-07-19 改（Lin 講了五次）：從 modal popup 改成跟學生端一樣「原地展開」的 dropdown——
// 不再開 #attendHistModal，改成寫進按鈕列下面的 #teacherAttendPanel-<token>，toggle 按鈕文字同步換 ▲/▼。
function toggleTeacherAttendPanel(token) {
  var t = String(token).replace(/'/g, '');
  var panel = document.getElementById('teacherAttendPanel-' + t);
  if (!panel) return;
  if (panel.style.display === 'none') {
    openAttendanceHistory(token); // 展開時才載入/重新整理資料
  } else {
    panel.style.display = 'none';
    var btn = document.getElementById('teacherAttendToggleBtn-' + t);
    if (btn) btn.textContent = '📅 上課記錄 ▼';
  }
}

async function openAttendanceHistory(token) {
  const t = String(token).replace(/'/g, '');
  const panel = document.getElementById('teacherAttendPanel-' + t);
  const btn = document.getElementById('teacherAttendToggleBtn-' + t);
  if (!panel) return; // 這個學生目前沒有渲染在畫面上（例如面板還沒載入），略過即可
  const today = teacherToday();

  panel.style.display = '';
  panel.innerHTML = '<div class="empty-attend">載入中…</div>';
  if (btn) btn.textContent = '📅 上課記錄 ▲';

  const [attRes, schedRes, payRes] = await Promise.all([
    sb.from('classroom_attendance').select('id,lesson_date,lessons').eq('token', token).order('lesson_date', { ascending: true }),
    sb.rpc('get_student_schedule', { p_token: token }),
    sb.from('classroom_payments').select('lessons,bonus_lessons,status,start_date').eq('token', token).in('status', ['pending', 'done']),
  ]);
  const data = attRes.data || [];
  const schedData = schedRes.data || [];

  if (!data.length && !schedData.length) {
    panel.innerHTML = '<div class="empty-attend">尚無上課記錄</div>';
    return;
  }

  // 依「本輪起算日」分流：起算日前=過往課程（收進摺疊區，仍可編輯/刪除）
  const q = computeCurrentCourse(payRes.data || [], data);
  const startDay = q.start || null;
  const current = startDay ? data.filter(function(r){ return r.lesson_date >= startDay; }) : data;
  const history = startDay ? data.filter(function(r){ return r.lesson_date < startDay; }) : [];

  // 未來排定但還沒上的課（跟 loadStudentSchedule 同一套合併邏輯，教師端用教師自己的時區日期，不用換算）
  const attCurrentDates = {};
  current.forEach(function(r) { attCurrentDates[r.lesson_date] = true; });
  const upcomingRaw = schedData
    .map(function(r) { return r.lesson_date; })
    .filter(function(d) { return d && (!startDay || d >= startDay) && !attCurrentDates[d]; });
  // 2026-07-19 加（跟 loadStudentSchedule 同一套修法）：只顯示到這期課包結束，不是顯示到 Calendar 同步到多遠
  const upcomingDates = Array.from(new Set(upcomingRaw)).sort().slice(0, Math.max(0, Math.ceil(q.remain || 0)));

  const dayZh = ['日','一','二','三','四','五','六'];
  function fmtDateOnly(dateStr) {
    const d = new Date(dateStr + 'T12:00:00');
    return (d.getMonth()+1) + '/' + d.getDate() + '（週' + dayZh[d.getDay()] + '）';
  }

  // 合併已完成＋未完成，依日期排序（跟學生端 mergedDates 同一套做法）
  var currentRowsByDate = {};
  current.forEach(function(r) { currentRowsByDate[r.lesson_date] = r; });
  var currentMerged = {};
  current.forEach(function(r) { currentMerged[r.lesson_date] = true; });
  upcomingDates.forEach(function(d) { if (!(d in currentMerged)) currentMerged[d] = false; });
  var currentMergedDates = Object.keys(currentMerged).sort();

  function opCellHtml(r) {
    var n = r.lessons || 1;
    return '<button class="hist-edit" title="改堂數（一天幾堂）" onclick="editAttendanceLessons(\'' + r.id + '\',' + n + ',\'' + token + '\')">' + n + '堂</button> ' +
      '<button class="hist-edit" title="改日期" onclick="editAttendanceDate(\'' + r.id + '\',\'' + r.lesson_date + '\',\'' + token + '\')">✏️</button> ' +
      '<button class="hist-del" title="刪除此記錄" onclick="deleteAttendance(\'' + r.id + '\',\'' + token + '\')">🗑</button>';
  }

  function courseTableHtml() {
    if (!currentMergedDates.length) {
      return '<div class="empty-attend">本輪課程尚無上課記錄</div>';
    }
    var rows = currentMergedDates.map(function(dateKey) {
      var done = currentMerged[dateKey];
      var isToday = dateKey === today;
      var dateLabel = fmtDateOnly(dateKey) + (isToday ? ' <span class="hist-today-tag">✨ 今日</span>' : '');
      var statusLabel = done ? '✅ 已完成' : '⏳ 未完成';
      var opCell = done ? opCellHtml(currentRowsByDate[dateKey]) : '';
      return '<tr><td>' + dateLabel + '</td><td>' + statusLabel + '</td><td style="white-space:nowrap;">' + opCell + '</td></tr>';
    }).join('');
    return '<table class="schedule-table"><thead><tr><th>上課日期</th><th>狀態</th><th>操作</th></tr></thead><tbody>' + rows + '</tbody></table>';
  }

  function historyTableHtml() {
    let cum = 0;
    const rows = history.map(function(r) {
      const n = r.lessons || 1;
      const start = cum + 1, end = cum + n; cum = end;
      const badge = n > 1 ? ('第 ' + start + '–' + end + ' 堂') : ('第 ' + start + ' 堂');
      const dateStr = fmtDateOnly(r.lesson_date) + (n > 1 ? ' · ' + n + ' 堂' : '');
      return '<tr><td><span class="lesson-badge">' + badge + '</span></td><td>' + dateStr + '</td><td style="white-space:nowrap;">' + opCellHtml(r) + '</td></tr>';
    }).join('');
    return '<table class="schedule-table"><thead><tr><th>堂次</th><th>上課日期</th><th>操作</th></tr></thead><tbody>' + rows + '</tbody></table>';
  }

  // 2026-07-19 加（Lin 要求：畫面要跟學生端一模一樣，不只邏輯像）：補上「本輪剩餘 X 堂」提示條，
  // 樣式跟 loadStudentQuota（學生端 quotaSummary）完全同一份 CSS，一字不改。
  const remain = q.remain < 0 ? 0 : q.remain;
  const quotaHtml = q.hasCourse
    ? '<div style="background:#fbf6ea;border:1px solid #e9dcb8;border-radius:9px;padding:9px 13px;margin-bottom:10px;font-family:\'Noto Sans TC\',sans-serif;font-size:0.86rem;color:' + (q.remain <= 1 ? '#b45309' : 'var(--gold-deep)') + ';font-weight:700;">本輪剩餘 ' + remain + ' 堂 <span style="font-weight:400;color:var(--ink-muted);">（本輪 ' + q.bought + ' · 已上 ' + q.used + '）</span></div>'
    : '<div style="background:#faf7f0;border:1px solid #e9dcb8;border-radius:9px;padding:9px 13px;margin-bottom:10px;font-family:\'Noto Sans TC\',sans-serif;font-size:0.85rem;color:var(--ink-muted);">剩餘堂數：尚未購課</div>';

  // 2026-08-07 加（Lin 要求）：ครูลืมกด「✅ 今日上課」ตอนวันนั้น → เพิ่มปุ่มให้บันทึกย้อนหลังเองได้
  const backfillHtml =
    '<div style="margin-bottom:10px;">' +
      '<button class="btn-gold" style="font-size:0.82rem;padding:6px 14px;" onclick="toggleBackfillPicker(\'' + token + '\')">➕ 補登上課</button>' +
      '<div id="backfillPicker-' + t + '" style="display:none;margin-top:8px;"></div>' +
    '</div>';

  const html =
    backfillHtml +
    quotaHtml +
    '<div style="color:var(--gold-deep);font-weight:700;font-family:\'Noto Sans TC\',sans-serif;font-size:0.88rem;padding:4px 0;">📖 本期課程' + (currentMergedDates.length ? '（共 ' + currentMergedDates.length + ' 堂）' : '') + '</div>' +
    '<div style="margin-top:8px;">' + courseTableHtml() + '</div>' +
    '<details style="margin-top:12px;">' +
      '<summary style="cursor:pointer;color:var(--ink-muted);font-family:\'Noto Sans TC\',sans-serif;font-size:0.85rem;padding:4px 0;">📅 過去的課程記錄' + (history.length ? '（' + history.length + ' 筆）' : '') + '</summary>' +
      '<div style="margin-top:6px;opacity:0.8;">' + (history.length ? historyTableHtml() : '<div class="empty-attend">尚無過去的課程記錄</div>') + '</div>' +
    '</details>';

  panel.innerHTML = html;
}

// 2026-08-07 加（Lin 要求）：「✅ 今日上課」只能記錄今天，老師忘記按當天就沒辦法補了
// → 加「➕ 補登上課」讓老師自己選日期補記錄。同一顆 RPC (record_attendance_increment)，
// 只是 p_lesson_date 換成老師選的日期，資料庫本來就沒有「必須是今天」的限制（已確認，見 CLAUDE.md 2026-08-07）。
function toggleBackfillPicker(token) {
  const t = String(token).replace(/'/g, '');
  const box = document.getElementById('backfillPicker-' + t);
  if (!box) return;
  if (box.style.display === 'none' || !box.innerHTML) {
    // 預設昨天（最常見忘記按的情況），且不能選未來
    const todayStr = teacherToday();
    const yesterday = formatInTz(new Date(teacherTimeToDate(todayStr, '00:00').getTime() - 24 * 3600 * 1000), TEACHER_TZ).dateStr;
    box.innerHTML =
      '<input type="date" id="backfillDate-' + t + '" value="' + yesterday + '" max="' + todayStr + '" ' +
        'style="border:1.5px solid var(--gold);border-radius:6px;padding:6px 9px;font-size:0.95rem;color:var(--ink);background:#fff;" /> ' +
      '<button class="btn-gold" id="backfillConfirmBtn-' + t + '" style="font-size:0.82rem;padding:6px 12px;margin-left:6px;" onclick="submitBackfillAttendance(\'' + token + '\')">確認補登</button> ' +
      '<button class="hist-del" style="font-size:0.82rem;" onclick="toggleBackfillPicker(\'' + token + '\')">取消</button>';
    box.style.display = '';
  } else {
    box.style.display = 'none';
    box.innerHTML = '';
  }
}

async function submitBackfillAttendance(token) {
  const t = String(token).replace(/'/g, '');
  const inp = document.getElementById('backfillDate-' + t);
  if (!inp) return;
  const dateStr = inp.value;
  if (!dateStr) { alert('請選擇日期'); return; }
  const todayStr = teacherToday();
  if (dateStr > todayStr) { alert('不能補登未來的日期'); return; } // 前端擋一層，防呆用（資料庫本身沒有這個限制）

  const s = studentsCache[token];
  const name = s ? s.name : token;

  if (!(await ensureTeacherSession('補登上課'))) return;

  // 補登前先查這天有沒有記錄過 — RPC 是 insert-or-increment，如果已經有記錄，會直接把堂數 +1
  // 怕老師手滑選錯天（例如那天其實已經記過了），先問清楚再送
  const { data: existing, error: checkErr } = await sb.from('classroom_attendance')
    .select('lessons').eq('token', token).eq('lesson_date', dateStr).maybeSingle();
  if (checkErr) { alert(await writeErrorMessage(checkErr.message, '補登上課')); return; }
  if (existing) {
    const cur = existing.lessons || 1;
    const d = new Date(dateStr + 'T12:00:00');
    const dayZh = ['日','一','二','三','四','五','六'];
    const dateLabel = (d.getMonth() + 1) + '/' + d.getDate() + '（週' + dayZh[d.getDay()] + '）';
    const ok = confirm(dateLabel + ' 已經有 ' + cur + ' 堂記錄了\n確定要補登，變成 ' + (cur + 1) + ' 堂嗎？');
    if (!ok) return;
  }

  const btn = document.getElementById('backfillConfirmBtn-' + t);
  if (btn) { btn.disabled = true; btn.textContent = '記錄中…'; }

  const attRes = await sb.rpc('record_attendance_increment', {
    p_token: token, p_student_name: name, p_lesson_date: dateStr
  });
  if (attRes.error || !attRes.data || !attRes.data.length) {
    alert(await writeErrorMessage(attRes.error ? attRes.error.message : '資料庫沒有回傳結果', '補登上課'));
    if (btn) { btn.disabled = false; btn.textContent = '確認補登'; }
    return;
  }

  await refreshTodayScheduleSection();
  await openAttendanceHistory(token);
  loadLowQuotaBanner();
  loadTeacherStudentInfo(token);
}

// 改某一天的堂數（例如一天上 2 堂）
async function editAttendanceLessons(id, current, token) {
  var v = prompt('這一天上了幾堂課？', current);
  if (v === null) return;
  var n = parseInt(v);
  if (!n || n < 1) { alert('請輸入 1 以上的數字'); return; }
  if (!(await ensureTeacherSession('修改堂數'))) return;
  // 🔴 2026-07-26 (RED 4)：เดิมเช็คแค่ error — แต่ RLS บล็อกแบบ "ไม่ error แค่แก้ได้ 0 แถว" ได้ด้วย
  // → ขึ้นว่าสำเร็จทั้งที่ตัวเลขในฐานข้อมูลไม่ได้เปลี่ยน (เรื่องนี้กระทบการคิดเงินโดยตรง)
  // ต้อง .select() แล้วเช็คว่าได้แถวกลับมาจริง
  var { data: updRows, error } = await sb.from('classroom_attendance').update({ lessons: n }).eq('id', id).select();
  if (error) { alert(await writeErrorMessage(error.message, '修改堂數')); return; }
  if (!updRows || !updRows.length) { alert(await writeErrorMessage('更新了 0 筆（資料庫沒有回傳任何被改到的資料）', '修改堂數') + '\n\n⚠️ 堂數「沒有」被改動，畫面上的數字還是舊的。'); return; }
  await openAttendanceHistory(token);
  if (typeof loadLowQuotaBanner === 'function') loadLowQuotaBanner();
  if (typeof loadTeacherStudentInfo === 'function') loadTeacherStudentInfo(token);
}

function editAttendanceDate(id, currentDate, token) {
  // inject a temporary date-picker input next to the row
  const span = document.getElementById('hist-date-' + id);
  if (!span) return;
  if (document.getElementById('date-picker-' + id)) return; // already open
  const inp = document.createElement('input');
  inp.type = 'date';
  inp.value = currentDate;
  inp.id = 'date-picker-' + id;
  inp.style.cssText = 'border:1.5px solid var(--gold);border-radius:6px;padding:3px 7px;font-size:0.85rem;font-family:sans-serif;color:var(--ink);background:#fff;margin-left:6px;';
  span.after(inp);
  inp.focus();
  inp.showPicker && inp.showPicker();

  async function applyEdit() {
    const newDate = inp.value;
    inp.remove();
    if (!newDate || newDate === currentDate) return;
    if (!(await ensureTeacherSession('修改上課日期'))) return;
    // 🔴 2026-07-26 (RED 4)：เช็คจำนวนแถวที่แก้ได้จริง ไม่ใช่เช็คแค่ error
    // (ช่องวันที่ตรงนี้ "ต้อง" เลือกย้อนหลังได้ — เป็นการแก้บันทึกคาบที่เรียนไปแล้ว ไม่ใช่การจัดคาบใหม่
    //  จึงไม่ใส่ด่าน assertNotPastDate ตรงนี้โดยตั้งใจ)
    const { data: dateRows, error } = await sb.from('classroom_attendance').update({ lesson_date: newDate }).eq('id', id).select();
    if (error) { alert(await writeErrorMessage(error.message, '修改上課日期')); return; }
    if (!dateRows || !dateRows.length) { alert(await writeErrorMessage('更新了 0 筆', '修改上課日期') + '\n\n⚠️ 日期「沒有」被改動。'); return; }
    await openAttendanceHistory(token);
  }
  inp.addEventListener('change', applyEdit);
  inp.addEventListener('blur', function() { setTimeout(function(){ if(inp.parentNode) inp.remove(); }, 200); });
}

async function deleteAttendance(id, token) {
  if (!confirm('確定刪除此堂記錄？')) return;
  // 2026-07-17 修（RELIABILITY FIRST）：以前沒檢查 error，刪除被 RLS 擋掉時會「靜默失敗」——
  // 畫面照樣重新整理，老師看起來像刪除成功，但那筆記錄其實還在資料庫裡。
  if (!(await ensureTeacherSession('刪除上課記錄'))) return;
  // 🔴 2026-07-26 (RED 4)：เดิมเช็คแค่ error — RLS ที่บล็อกแบบ "ลบได้ 0 แถว" ยังหลุดผ่านได้อยู่
  // → ขึ้นว่าลบสำเร็จ แต่แถวยังอยู่ในฐานข้อมูล ต้อง .select() แล้วเช็คว่าลบไปกี่แถวจริง
  const { data: delRows, error } = await sb.from('classroom_attendance').delete().eq('id', id).select();
  if (error) { alert(await writeErrorMessage(error.message, '刪除上課記錄') + '\n（這筆記錄還在，沒有被刪除）'); return; }
  if (!delRows || !delRows.length) { alert(await writeErrorMessage('刪除了 0 筆', '刪除上課記錄') + '\n\n⚠️ 這筆記錄「還在」，沒有被刪除。'); return; }
  await refreshTodayScheduleSection(); // 2026-07-06 修正：同上，避免課表整塊消失
  await openAttendanceHistory(token); // refresh modal
}

async function checkStudentSlipStatus(token) {
  if (!token) return;
  var el = document.getElementById('slipStatusMsg');
  if (!el) return;
  var { data } = await sb.rpc('get_student_payments', { p_token: token });
  if (!data || data.length === 0) return;
  var p = data[0];
  var statusMap = {
    'slip_submitted': '⏳ 已送出，等待老師確認',
    'pending':        '✅ 老師已確認收款',
    'done':           '🧾 收據已開立！收據號碼：' + (p.receipt_no || '—'),
    'rejected':       '❌ 本次付款未通過，請聯繫老師'
  };
  var msg = statusMap[p.status];
  if (!msg) return;
  var dismissKey = 'dismissedStatus_' + token + '_' + p.status + '_' + (p.receipt_no || '');
  try { if (localStorage.getItem(dismissKey)) return; } catch(e) {}
  var color = p.status === 'rejected' ? '#f5ece0' : p.status === 'done' ? 'var(--gold-light)' : '#fef3c7';
  var textColor = p.status === 'rejected' ? '#5c5148' : p.status === 'done' ? 'var(--gold-deep)' : '#92400e';
  el.innerHTML = '<div style="display:flex;align-items:flex-start;gap:8px;background:' + color + ';border-radius:9px;padding:10px 14px;font-family:\'Noto Sans TC\',sans-serif;font-size:0.85rem;color:' + textColor + ';font-weight:600;margin-bottom:12px;">' +
    '<div style="flex:1;">' + msg + '<br><span style="font-weight:700;font-size:0.78rem;">' + p.course_label + '</span></div>' +
    '<button onclick="dismissSlipStatus(\'' + dismissKey + '\')" title="關閉" style="background:none;border:none;cursor:pointer;font-size:1rem;color:' + textColor + ';opacity:0.5;padding:0 2px;line-height:1;flex-shrink:0;">✕</button>' +
    '</div>';
}
function dismissSlipStatus(key) {
  try { localStorage.setItem(key, '1'); } catch(e) {}
  var el = document.getElementById('slipStatusMsg'); if (el) el.innerHTML = '';
}

// 點 popup 外的暗色背景 → 關閉該 popup
document.addEventListener('click', function(e) {
  var t = e.target;
  if (t && t.classList && (t.classList.contains('modal-overlay') || t.classList.contains('slip-viewer-overlay') || t.classList.contains('notepad-overlay'))) {
    if (t.id === 'uploadOverlay' || t.id === 'uploadDoneModal') return; // 上傳視窗：點外面不關
    t.classList.remove('open');
  }
});

// ============================================================
// 教師登入閘門（只有老師本人能看管理頁）— Supabase email OTP
// 學生頁（?s=token）走匿名 RPC，不受此閘門影響
// ============================================================
const TEACHER_EMAIL = 'mr.taihualin@gmail.com';

// ── cookie helpers (1 year, path=/) ──
function setTeacherCookie() {
  document.cookie = 'teacherAuthed=1; max-age=' + (365*24*3600) + '; path=/; SameSite=Strict';
}
function hasTeacherCookie() {
  return document.cookie.split(';').some(function(c){ return c.trim().startsWith('teacherAuthed=1'); });
}
function markTeacherAuthed() {
  localStorage.setItem('teacherAuthed', '1');
  setTeacherCookie();
}
function isTeacherMarked() {
  return localStorage.getItem('teacherAuthed') === '1' || hasTeacherCookie();
}

async function isTeacherAuthed() {
  try {
    const { data } = await sb.auth.getSession();
    const email = data && data.session && data.session.user && data.session.user.email;
    return (email || '').toLowerCase() === TEACHER_EMAIL;
  } catch (e) { return false; }
}

function setTeacherLoginMsg(msg, isErr) {
  var el = document.getElementById('tLoginMsg');
  if (el) { el.style.display = 'block'; el.style.color = isErr ? '#C0392B' : '#8B7340'; el.innerHTML = msg; }
}

function renderTeacherLogin() {
  document.getElementById('studentNameDisplay').textContent = '';
  document.getElementById('mainContainer').innerHTML =
    '<div class="card" style="max-width:380px;margin:30px auto;padding:28px 24px;">' +
      '<h2 style="margin-top:0;">🔒 教師登入</h2>' +
      '<p style="font-size:0.85rem;color:var(--ink-muted);font-family:\'Noto Sans TC\',sans-serif;">此頁面僅限老師本人。請以註冊信箱收取驗證碼登入（每台裝置登入一次即可，之後自動保持登入）。</p>' +
      '<div id="tLoginStep1">' +
        '<input id="tLoginEmail" type="email" autocomplete="email" placeholder="老師信箱" value="' + TEACHER_EMAIL + '" style="width:100%;padding:11px;border:1px solid #e9dcb8;border-radius:9px;margin:10px 0;font-size:0.95rem;box-sizing:border-box;" />' +
        '<button class="btn-add-student" style="width:100%;" onclick="teacherSendOtp()">寄送驗證碼</button>' +
      '</div>' +
      '<div id="tLoginStep2" style="display:none;">' +
        '<input id="tLoginCode" type="text" inputmode="numeric" autocomplete="one-time-code" placeholder="輸入信中的驗證碼" style="width:100%;padding:11px;border:1px solid #e9dcb8;border-radius:9px;margin:10px 0;font-size:1.05rem;letter-spacing:3px;text-align:center;box-sizing:border-box;" />' +
        '<button class="btn-add-student" style="width:100%;" onclick="teacherVerifyOtp()">登入</button>' +
      '</div>' +
      '<div id="tLoginMsg" style="display:none;margin-top:12px;font-size:0.85rem;font-family:\'Noto Sans TC\',sans-serif;"></div>' +
    '</div>';
}

async function teacherSendOtp() {
  var email = (document.getElementById('tLoginEmail').value || '').trim();
  if (email.toLowerCase() !== TEACHER_EMAIL) { setTeacherLoginMsg('此信箱無權限登入', true); return; }
  setTeacherLoginMsg('寄送中…⏳', false);
  var res = await sb.auth.signInWithOtp({ email: email, options: { shouldCreateUser: true } });
  if (res.error) { setTeacherLoginMsg('寄送失敗：' + res.error.message, true); return; }
  document.getElementById('tLoginStep1').style.display = 'none';
  document.getElementById('tLoginStep2').style.display = 'block';
  setTeacherLoginMsg('驗證碼已寄到信箱（含垃圾信匣），請輸入', false);
}

async function teacherVerifyOtp() {
  var code = (document.getElementById('tLoginCode').value || '').trim();
  if (!/^\d{6,10}$/.test(code)) { setTeacherLoginMsg('請輸入信中的驗證碼（純數字）', true); return; }
  setTeacherLoginMsg('驗證中…⏳', false);
  var res = await sb.auth.verifyOtp({ email: TEACHER_EMAIL, token: code, type: 'email' });
  if (res.error) { setTeacherLoginMsg('驗證碼錯誤或已過期，請重新輸入', true); return; }
  if (await isTeacherAuthed()) { markTeacherAuthed(); renderTeacherView(); }
  else setTeacherLoginMsg('此帳號無權限', true);
}

async function bootTeacher() {
  // Always verify actual Supabase session (auto-refreshes token if expired)
  if (await isTeacherAuthed()) { markTeacherAuthed(); renderTeacherView(); return; }
  // No valid session → clear stale cookie/localStorage → show OTP login
  localStorage.removeItem('teacherAuthed');
  document.cookie = 'teacherAuthed=; max-age=0; path=/;';
  renderTeacherLogin();
}

// Run routing — with visible error display
window.onerror = function(msg, src, line) {
  var el = document.getElementById('mainContainer');
  if (el) el.innerHTML = '<div style="background:#fef3c7;border:1px solid #d97706;border-radius:12px;padding:20px;margin:20px 0;font-family:monospace;font-size:0.85rem;color:#78350f;">' +
    '<strong>⚠️ JavaScript Error（請截圖傳給老師）</strong><br><br>' + msg + '<br><br>Line: ' + line + '<br>File: ' + src + '</div>';
};
try {
  if (isTeacher) bootTeacher();
  else renderStudentView();
} catch(e) {
  var el = document.getElementById('mainContainer');
  if (el) el.innerHTML = '<div style="background:#fef3c7;border:1px solid #d97706;border-radius:12px;padding:20px;margin:20px 0;font-family:monospace;font-size:0.85rem;color:#78350f;">' +
    '<strong>⚠️ Error（請截圖傳給老師）</strong><br><br>' + e.message + '</div>';
}
