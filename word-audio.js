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

  function urlFor(th) {
    if (!th) return null;
    var f = _manifest()[th];
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
      '.word-audio-btn[data-playing="1"]{background:#fff3d8;border-color:#C8973A;}' +
      '#rg-sound-toggle[data-on="0"]{opacity:.55;background:rgba(139,99,16,0.06);}' +
      'body.games-sound-off .word-audio-btn{display:none !important;}';
    document.head.appendChild(s);
    _styled = true;
  }
  // ฉีด style ทันทีตอนโหลดไฟล์ — ปุ่มอื่นในแถวเดียวกัน (🐣 คำอ่าน) ใช้ class .word-ctl-btn ร่วมด้วย
  injectStyles();

  function play(th, btn) {
    // ปุ่มเปิด/ปิดเสียง 🔊/🔇 (แถบลอยข้างๆ จาก shared.js) ปิดอยู่ → ไม่เล่นเสียง — Lin 2026-07-16
    if (document.body && document.body.classList.contains('games-sound-off')) return;
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

  // ── ปุ่มเปิด/ปิดเสียงคำศัพท์ 🔊/🔇 — อยู่ในแถวปุ่มใต้คำศัพท์ แถวเดียวกับ 🐣/🍙/🔖 (Lin 2026-07-16) ──
  // โชว์ทันทีตั้งแต่ยังไม่มีไฟล์เสียง · จำค่าไว้ใน localStorage · ปิด = ไม่เล่นเสียง + ซ่อนปุ่มลำโพงรายคำ
  var SOUND_KEY = 'games_sound_on';
  var _soundOn = true;
  try { _soundOn = localStorage.getItem(SOUND_KEY) !== '0'; } catch (e) {}

  function soundOn() { return _soundOn; }

  function _renderToggle(btn) {
    btn.textContent = _soundOn ? '🔊' : '🔇';
    btn.title = _soundOn ? '目前：單字發音已開啟（點擊關閉）' : '目前：單字發音已關閉（點擊開啟）';
    btn.setAttribute('aria-label', btn.title);
    btn.setAttribute('data-on', _soundOn ? '1' : '0');
    if (document.body) document.body.classList.toggle('games-sound-off', !_soundOn);
  }

  function _setSound(on) {
    _soundOn = !!on;
    try { localStorage.setItem(SOUND_KEY, _soundOn ? '1' : '0'); } catch (e) {}
    var btn = document.getElementById('rg-sound-toggle');
    if (btn) _renderToggle(btn);
    if (!_soundOn && _current) { try { _current.pause(); } catch (e) {} }
  }

  function _initToggle() {
    var btn = document.getElementById('rg-sound-toggle');
    if (!btn) return;
    _renderToggle(btn);
    btn.addEventListener('click', function (e) { e.stopPropagation(); _setSound(!_soundOn); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', _initToggle);
  else _initToggle();

  // เล่นเสียงคำอัตโนมัติตอนคำใหม่โหลด (เฉพาะตอนเปิด 🔊 + คำนั้นมีไฟล์เสียงจริง)
  var _lastAuto = null;
  function autoPlay(th) {
    if (!_soundOn || !th) return;
    if (_lastAuto === th) return; // กันเล่นซ้ำตอนหน้าจอ re-render คำเดิม
    _lastAuto = th;
    if (!has(th)) return;
    play(th, null);
  }

  window.WordAudio = { has: has, urlFor: urlFor, play: play, createBtn: createBtn, btnHtml: btnHtml, fillSlot: fillSlot, soundOn: soundOn, autoPlay: autoPlay };
})();
