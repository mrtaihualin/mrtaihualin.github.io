// progress-sync.js — ซิงก์ความก้าวหน้าผู้เล่น (แบดจ์/สตรีค/ล็อกชุด/คำพิเศษ/สถิติคำผิด) ขึ้น Supabase
//   LIN 2026-06-20 · ต้องมีตาราง public.tone_progress + RLS (ดู _แผนงาน/Supabase_sync_progress_2026-06-20.md)
//   ออกแบบให้ "ปลอดภัยเสมอ": ถ้ายังไม่ล็อกอิน / ไม่มีตาราง / เน็ตล่ม → ไม่พัง เล่นต่อด้วย localStorage ปกติ
(function () {
  'use strict';
  var cfg = window.SUPABASE_CONFIG || {};
  var canInit = cfg.url && cfg.anonKey && window.supabase && window.supabase.createClient;
  var sb = canInit ? (window.getSupabaseClient ? window.getSupabaseClient() : window.supabase.createClient(cfg.url, cfg.anonKey)) : null;
  var user = null;
  var pulled = false;

  // คีย์ใน localStorage ที่ต้องซิงก์
  // 2026-07-13 Lin: เพิ่ม tf_wrong_stats_v1 (สถิติผิดรายวัน 今日統計) — ซิงก์ข้ามเครื่อง
  var KEYS = ['tf_badges_v1', 'tf_streak_v1', 'tf_word_wrong_v1', 'tf_wrong_stats_v1'];
  var STATS_KEEP_DAYS = 30; // ต้องตรงกับ STATS_KEEP_DAYS ใน tone-finder.html (ตัดเก็บแค่ 30 วันล่าสุดหลัง merge)

  function lsGet(k) { try { var r = localStorage.getItem(k); return r ? JSON.parse(r) : null; } catch (e) { return null; } }
  function lsSet(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} }
  function maxNum(a, b) { return Math.max(a || 0, b || 0); }

  // ── merge แบบรู้โครงสร้าง: รวมข้อมูล local + remote โดยไม่ทำข้อมูลหาย ──
  function mergeKey(k, local, remote) {
    if (local == null) return remote;
    if (remote == null) return local;
    if (k === 'tf_badges_v1') {
      var u = {}; var i;
      var lu = local.unlocked || {}, ru = remote.unlocked || {};
      for (i in lu) u[i] = lu[i]; for (i in ru) u[i] = ru[i];          // union แบดจ์ที่ปลด
      var ls = local.stats || {}, rs = remote.stats || {};
      var st = {
        wordsTotal: maxNum(ls.wordsTotal, rs.wordsTotal),
        perfectSets: maxNum(ls.perfectSets, rs.perfectSets),
        maxCombo: maxNum(ls.maxCombo, rs.maxCombo),
        streak: maxNum(ls.streak, rs.streak)
      };
      return { unlocked: u, stats: st };
    }
    if (k === 'tf_streak_v1') {
      // ใครมี lastGoalDay ใหม่กว่าใช้ตัวนั้น + freeze เอาค่ามากกว่า
      var newer = (String(remote.lastGoalDay || '') > String(local.lastGoalDay || '')) ? remote : local;
      var out = {}; for (var p in newer) out[p] = newer[p];
      out.freezes = maxNum(local.freezes, remote.freezes);
      out.streak = maxNum(local.streak, remote.streak);
      return out;
    }
    if (k === 'tf_word_wrong_v1') {
      var o = {}, key;
      for (key in local) o[key] = local[key];
      for (key in remote) o[key] = maxNum(o[key], remote[key]);                          // ค่ามากกว่า (กันนับซ้ำ)
      return o;
    }
    if (k === 'tf_wrong_stats_v1') {
      // โครงสร้าง: { 'YYYY-MM-DD': [ {time,word,step,choice,message}, ... ] } — union รายวัน กันซ้ำด้วย signature ของ entry เอง
      var days = {}, d;
      for (d in local) days[d] = (local[d] || []).slice();
      for (d in remote) {
        var la = days[d] || [];
        var seen = {}; la.forEach(function (e) { seen[JSON.stringify(e)] = 1; });
        (remote[d] || []).forEach(function (e) {
          var sig = JSON.stringify(e);
          if (!seen[sig]) { la.push(e); seen[sig] = 1; }
        });
        days[d] = la;
      }
      var dayKeys = Object.keys(days).sort();
      while (dayKeys.length > STATS_KEEP_DAYS) { delete days[dayKeys.shift()]; }   // เก็บแค่ 30 วันล่าสุด กันข้อมูลบวมไม่รู้จบ
      return days;
    }
    return remote; // fallback
  }

  function collectLocal() { var d = {}; KEYS.forEach(function (k) { var v = lsGet(k); if (v != null) d[k] = v; }); return d; }
  function applyMerged(remote) {
    KEYS.forEach(function (k) {
      var merged = mergeKey(k, lsGet(k), remote ? remote[k] : null);
      if (merged != null) lsSet(k, merged);
    });
  }

  // ── ดึงจาก Supabase → merge เข้า local → เขียนกลับขึ้น Supabase (ตอนล็อกอิน) ──
  function pull() {
    if (!sb || !user) return;
    sb.from('tone_progress').select('data').eq('user_id', user.id).maybeSingle()
      .then(function (res) {
        var remote = (res && res.data && res.data.data) ? res.data.data : {};
        applyMerged(remote);
        pulled = true;
        try { if (typeof render === 'function') render(); } catch (e) {}  // รีเฟรชหน้าจอให้เห็นแบดจ์/สตรีคที่ซิงก์มา
        push();   // เขียนผลรวมกลับขึ้นไป
      }, function () { /* เน็ต/ตารางมีปัญหา → เงียบ เล่นต่อด้วย local */ });
  }

  // ── ดันความก้าวหน้าปัจจุบันขึ้น Supabase (ตอนจบรอบ) ──
  var pushTimer = null;
  function push() {
    if (!sb || !user) return;
    var row = { user_id: user.id, data: collectLocal(), updated_at: new Date().toISOString() };
    sb.from('tone_progress').upsert(row, { onConflict: 'user_id' }).then(function () {}, function () {});
  }
  function pushDebounced() { if (pushTimer) clearTimeout(pushTimer); pushTimer = setTimeout(push, 800); }

  // ── ผูกกับสถานะล็อกอิน ──
  if (sb) {
    sb.auth.getSession().then(function (r) {
      user = (r && r.data && r.data.session && r.data.session.user) || null;
      if (user && !pulled) pull();
    }, function () {});
    sb.auth.onAuthStateChange(function (_evt, session) {
      user = (session && session.user) || null;
      if (user) pull();
    });
  }

  // ── API ให้เกมเรียกตอนจบรอบ ──
  window.TF_SYNC = {
    push: pushDebounced,
    pull: pull,
    isOn: function () { return !!(sb && user); },
    _merge: mergeKey   // เผื่อเทสต์
  };
})();
