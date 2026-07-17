// word-audio.js — ปุ่มลำโพงฟังเสียงคำศัพท์ (เล่นไฟล์เสียงจริงจาก Google Cloud TTS)
// สร้าง 2026-07-16 · ไอคอน 🔊 ชั่วคราว (Lin จะเลือกไอคอนธีมข้าวทีหลัง — กฎ 17)
// กติกา: ปุ่มโชว์ "เฉพาะคำที่มีไฟล์เสียงจริง" ใน AUDIO_MANIFEST (data/audio-manifest.js)
// ไม่มีไฟล์เสียง = ไม่มีปุ่ม (ไม่ใช้ Web Speech API — เว็บปิดเสียงสังเคราะห์ตามคำสั่ง Lin 2026-06-18)
(function () {
  var _cache = {};    // url -> Audio (โหลดครั้งเดียว เล่นซ้ำได้ทันที)
  var _current = null;
  var _styled = false;

  function _manifest() {
    return (window.AUDIO_MANIFEST && window.AUDIO_MANIFEST.words) || {};
  }

  // เพิ่ม 2026-07-17: เสียงประโยค (adv-sentences.js) เก็บแยก key ใน AUDIO_MANIFEST.sentences
  // คีย์ด้วยตัวข้อความจริงเหมือน words — urlFor เช็ค words ก่อน แล้วค่อย sentences (ไม่ชนกันเพราะประโยคยาวกว่าคำมาก)
  function _sentManifest() {
    return (window.AUDIO_MANIFEST && window.AUDIO_MANIFEST.sentences) || {};
  }

  // เพิ่ม 2026-07-17: เช็คลิสต์ "ปิดเสียงชั่วคราว" (data/audio-disabled.js) ก่อนเสมอ — คำ/ประโยคในลิสต์นี้
  // จะไม่มีปุ่ม 🔊 เลย แม้จะมีไฟล์เสียงจริงอยู่ใน manifest ก็ตาม (ปิดไว้ก่อนโดยไม่ลบไฟล์เสียง/ข้อมูลคำ)
  function isDisabled(th) {
    var d = window.AUDIO_DISABLED;
    return !!(d && d.indexOf(th) !== -1);
  }

  function urlFor(th) {
    if (!th || isDisabled(th)) return null;
    var f = _manifest()[th] || _sentManifest()[th];
    if (!f) return null;
    if (/^https?:/.test(f)) return f;
    var base = (window.AUDIO_MANIFEST && window.AUDIO_MANIFEST.baseUrl) || '';
    return base + f;
  }

  function has(th) { return !!urlFor(th); }

  function injectStyles() {
    if (_styled || document.getElementById('word-audio-css')) { _styled = true; return; }
    var s = document.createElement('style');
    s.id = 'word-audio-css';
    s.textContent =
      '.word-audio-btn,.word-ctl-btn{background:#fff;border:1.5px solid rgba(139,99,16,0.30);cursor:pointer;font-size:17px;' +
      'width:34px;height:34px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;' +
      'padding:0;line-height:1;transition:transform .15s,background .15s;vertical-align:middle;}' +
      '.word-audio-btn:hover,.word-ctl-btn:hover{transform:scale(1.12);background:rgba(139,99,16,0.10);}' +
      '.word-audio-btn[data-playing="1"],.word-ctl-btn[data-playing="1"]{background:#fff3d8;border-color:#C8973A;}';
    document.head.appendChild(s);
    _styled = true;
  }
  // ฉีด style ทันทีตอนโหลดไฟล์ — ปุ่มอื่นในแถวเดียวกัน (🐣 คำอ่าน) ใช้ class .word-ctl-btn ร่วมด้วย
  injectStyles();

  function play(th, btn) {
    var url = urlFor(th);
    if (!url) return;
    try {
      if (_current) { try { _current.pause(); _current.currentTime = 0; } catch (e) {} }
      var a = _cache[url];
      if (!a) { a = new Audio(url); a.preload = 'auto'; _cache[url] = a; }
      _current = a;
      if (btn) btn.setAttribute('data-playing', '1');
      var done = function () { if (btn) btn.setAttribute('data-playing', '0'); };
      a.onended = done;
      a.onerror = done;
      a.currentTime = 0;
      var p = a.play();
      if (p && p.catch) p.catch(done);
    } catch (e) { if (btn) btn.setAttribute('data-playing', '0'); }
  }

  // สร้างปุ่มแบบ DOM element (ใช้กับ slot ใน เกมอ่าน/เกมพิมพ์/แบนเนอร์เกมเสียง)
  function createBtn(th) {
    if (!has(th)) return null;
    injectStyles();
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'word-audio-btn';
    btn.textContent = '🔊';
    btn.title = '聽發音';
    btn.setAttribute('aria-label', '聽發音');
    btn.addEventListener('click', function (e) { e.stopPropagation(); play(th, btn); });
    return btn;
  }

  // สร้างปุ่มแบบ HTML string (ใช้กับหน้า result เกมเสียง ที่ประกอบ HTML เป็น string)
  function btnHtml(th) {
    if (!has(th)) return '';
    injectStyles();
    var esc = String(th).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    return '<button type="button" class="word-audio-btn" title="聽發音" aria-label="聽發音" ' +
      'onclick="event.stopPropagation();WordAudio.play(\'' + esc + '\', this)">🔊</button>';
  }

  // เติมปุ่มลง slot (ล้างของเก่าก่อนเสมอ กันปุ่มค้างจากคำก่อนหน้า)
  function fillSlot(slotId, th) {
    var slot = document.getElementById(slotId);
    if (!slot) return;
    slot.innerHTML = '';
    var b = createBtn(th);
    if (b) slot.appendChild(b);
  }

  // ── ปุ่มลำโพง 🔊 ในแถวปุ่มใต้คำศัพท์ — "กด 1 ที = เล่นเสียงคำปัจจุบัน 1 ที" (Lin 2026-07-16) ──
  // โชว์ทันทีตั้งแต่ยังไม่มีไฟล์เสียง · ถ้าคำนั้นยังไม่มีไฟล์เสียง → ขึ้น toast "即將推出" (ไม่เงียบเฉยๆ ให้คนงง)
  var _currentWord = null;

  // เกมเรียกทุกครั้งที่เปลี่ยนคำ เพื่อบอกว่า "คำปัจจุบัน" คือคำไหน
  function setCurrent(th) { _currentWord = th || null; }

  function _showSoonToast() {
    var old = document.getElementById('wa-soon-toast');
    if (old) old.remove();
    var d = document.createElement('div');
    d.id = 'wa-soon-toast';
    d.textContent = '🔊 即將推出';
    d.style.cssText = 'position:fixed;left:50%;bottom:80px;transform:translateX(-50%);background:#fff3d8;border:1.5px solid #C8973A;color:#5a3e0a;font-family:\'Noto Sans TC\',sans-serif;font-size:14px;font-weight:700;padding:8px 16px;border-radius:20px;z-index:100001;box-shadow:0 4px 14px rgba(90,62,10,0.2);';
    document.body.appendChild(d);
    setTimeout(function () { if (d) d.remove(); }, 1800);
  }

  function _initPlayBtn() {
    var btn = document.getElementById('rg-sound-toggle');
    if (!btn) return;
    btn.textContent = '🔊';
    btn.title = '聽發音';
    btn.setAttribute('aria-label', '聽發音');
    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      if (_currentWord && has(_currentWord)) play(_currentWord, btn);
      else _showSoonToast(); // ยังไม่มีไฟล์เสียงของคำนี้
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', _initPlayBtn);
  else _initPlayBtn();

  window.WordAudio = { has: has, urlFor: urlFor, play: play, createBtn: createBtn, btnHtml: btnHtml, fillSlot: fillSlot, setCurrent: setCurrent };
})();
