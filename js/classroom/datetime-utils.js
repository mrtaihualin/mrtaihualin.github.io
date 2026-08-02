// js/classroom/datetime-utils.js
// ย้ายมาจาก classroom/index.html เฟส 4 (2026-08-02) — ฟังก์ชันช่วยล้วนๆ ไม่แตะ Supabase/Calendar/ล็อก
// เนื้อโค้ดเหมือนต้นฉบับ 100% (ตรวจด้วย diff แล้ว) แค่ย้ายตำแหน่งไฟล์
function teacherTimeToDate(dateStr, timeStr) {
  return new Date(dateStr + 'T' + timeStr + ':00+07:00');
}

function teacherToday() {
  return formatInTz(new Date(), TEACHER_TZ).dateStr;
}

function todayInTz(tz) {
  try { return formatInTz(new Date(), tz || TEACHER_TZ).dateStr; }
  catch (e) { return formatInTz(new Date(), TEACHER_TZ).dateStr; } // tz พัง → ถอยมาใช้เวลาไทย ไม่ปล่อยหลุด
}

function formatThaiDateTimeLabel(isoOrDateStr) {
  if (!isoOrDateStr) return '-';
  var f = formatInTz(new Date(isoOrDateStr), TEACHER_TZ);
  return f.dateStr + ' ' + f.timeStr;
}

function isValidTimeStr(str) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test((str || '').trim());
}

function conflictWarnText(res) {
  if (!res) return '';
  if (!res.ok) {
    return '\n\n⚠️ 系統這次「沒能檢查」這個時間有沒有跟其他行程撞到（' + (res.reason || '原因不明') + '）。\n'
      + '這不代表沒有撞到——請自己先看一眼 Google Calendar 再決定。';
  }
  if (!res.items.length) return '';
  return '\n\n⚠️ 這個新時間跟其他行事曆事件重疊：\n' + res.items.map(function (c) { return '・' + (c.summary || '(無標題)'); }).join('\n');
}

function thaiDateWeekday(dateStr) {
  return new Date(dateStr + 'T12:00:00+07:00').getUTCDay(); // 0=日 ... 6=六（เที่ยงกันขอบวันเพี้ยน）
}

function buildRowOccurrences(row) {
  const occs = [];
  if (row.recurring) {
    const untilMs = row.untilVal ? teacherTimeToDate(row.untilVal, '23:59').getTime() : null;
    for (let k = 0; k < RECURRING_CHECK_MAX_WEEKS; k++) {
      const oStart = new Date(row.startAbs.getTime() + k * 7 * 24 * 60 * 60 * 1000);
      if (untilMs !== null && oStart.getTime() > untilMs) break;
      occs.push({ start: oStart, end: new Date(oStart.getTime() + 60 * 60 * 1000) });
    }
  }
  // กันพังแบบไม่คาดคิด: ถ้าไม่ได้สักครั้ง (ไม่ควรเกิด เพราะเช็ค 固定到 < 開課日 ไปแล้ว) ถอยไปครั้งเดียว
  if (!occs.length) occs.push({ start: row.startAbs, end: row.endAbs });
  return occs;
}

function addOneHourTimeStr(timeStr) {
  const parts = timeStr.split(':');
  const h = (parseInt(parts[0], 10) + 1) % 24;
  return String(h).padStart(2, '0') + ':' + parts[1];
}

function safeImgSrc(u){ u=String(u==null?'':u); return /^(data:image\/[a-z0-9.+-]+;base64,|https:\/\/)/i.test(u) ? escHtml(u) : ''; }

function escHtml(s){return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];});}

function escAttrJs(s){ return escHtml(String(s==null?'':s).replace(/\\/g,'\\\\').replace(/'/g,"\\'")); }

function safeHref(u){var s=String(u==null?'':u).trim();return /^https:\/\//i.test(s)?s:'#';}

function formatInTz(date, tz) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false, weekday: 'short'
  }).formatToParts(date);
  const get = function(t) { const p = parts.find(function(x) { return x.type === t; }); return p ? p.value : ''; };
  let hour = get('hour'); if (hour === '24') hour = '00'; // 某些瀏覽器午夜會給 24:xx
  const weekdayMap = { Sun:0, Mon:1, Tue:2, Wed:3, Thu:4, Fri:5, Sat:6 };
  return {
    dateStr: get('year') + '-' + get('month') + '-' + get('day'),
    timeStr: hour + ':' + get('minute'),
    weekday: weekdayMap[get('weekday')] !== undefined ? weekdayMap[get('weekday')] : new Date(date).getDay()
  };
}

function parseInTzToDate(dateStr, timeStr, tz) {
  const probe = new Date(dateStr + 'T' + timeStr + ':00Z');
  const fmt = new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'shortOffset' });
  const parts = fmt.formatToParts(probe);
  const offsetPart = parts.find(function(p) { return p.type === 'timeZoneName'; });
  let offsetMin = 0;
  if (offsetPart) {
    const m = offsetPart.value.match(/GMT([+-]\d{1,2})(?::?(\d{2}))?/);
    if (m) offsetMin = (parseInt(m[1], 10) * 60) + (m[1].startsWith('-') ? -1 : 1) * (parseInt(m[2] || '0', 10));
  }
  return new Date(new Date(dateStr + 'T' + timeStr + ':00Z').getTime() - offsetMin * 60000);
}

function studentFacingTimeLabel(dateOrIso, studentTz) {
  const d = (dateOrIso instanceof Date) ? dateOrIso : new Date(dateOrIso);
  if (studentTz) {
    const conv = formatInTz(d, studentTz);
    return conv.dateStr + ' ' + conv.timeStr + '（你的當地時間）';
  }
  const thai = formatInTz(d, TEACHER_TZ);
  return thai.dateStr + ' ' + thai.timeStr + '（泰國時間 — 尚未設定你的時區，可能跟你的當地時間不同）';
}

function bareTimeLabel(dateOrIso, studentTz) {
  const d = (dateOrIso instanceof Date) ? dateOrIso : new Date(dateOrIso);
  const conv = studentTz ? formatInTz(d, studentTz) : formatInTz(d, TEACHER_TZ);
  return conv.dateStr + ' ' + conv.timeStr;
}

function buildIcalUntilUtc(date) {
  var d = new Date(date);
  var pad = function(n) { return String(n).padStart(2, '0'); };
  return d.getUTCFullYear() + pad(d.getUTCMonth() + 1) + pad(d.getUTCDate()) + 'T' + pad(d.getUTCHours()) + pad(d.getUTCMinutes()) + pad(d.getUTCSeconds()) + 'Z';
}

function icalUntilToMs(v) {
  var m = String(v || '').match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})Z?)?$/);
  if (!m) return null;
  return Date.UTC(+m[1], +m[2] - 1, +m[3], +(m[4] || 23), +(m[5] || 59), +(m[6] || 59));
}

function slipBonusFor(n) { return n >= 30 ? 3 : n >= 20 ? 1 : 0; }

function recFmtTime(sec){ return String(Math.floor(sec/60)).padStart(2,'0')+':'+String(sec%60).padStart(2,'0'); }
