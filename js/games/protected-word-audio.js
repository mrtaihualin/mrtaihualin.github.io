// protected-word-audio.js — Core 5 audio via entitlement-checked Edge + private Storage.
// The browser receives only an availability flag for entitled content and a short-lived URL per play.
(function (global) {
  'use strict';

  var available = Object.create(null);
  var signed = Object.create(null);
  var audioByText = Object.create(null);
  var currentAudio = null;
  var currentWord = null;
  var styled = false;
  var errorToastAt = 0;

  function setAvailability(items) {
    available = Object.create(null);
    (Array.isArray(items) ? items : []).forEach(function (text) {
      if (typeof text === 'string' && text) available[text] = true;
    });
    signed = Object.create(null);
  }

  function has(text) { return !!available[String(text || '')]; }

  function client() {
    try { return global.getSupabaseClient ? global.getSupabaseClient() : null; }
    catch (e) { return null; }
  }

  function injectStyles() {
    if (styled || document.getElementById('word-audio-css')) { styled = true; return; }
    var style = document.createElement('style');
    style.id = 'word-audio-css';
    style.textContent =
      '.word-audio-btn,.word-ctl-btn{background:#fff;border:1.5px solid rgba(139,99,16,.30);cursor:pointer;font-size:17px;' +
      'width:34px;height:34px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;' +
      'padding:0;line-height:1;transition:transform .15s,background .15s;vertical-align:middle}' +
      '.word-audio-btn:hover,.word-ctl-btn:hover{transform:scale(1.12);background:rgba(139,99,16,.10)}' +
      '.word-audio-btn[data-playing="1"],.word-ctl-btn[data-playing="1"]{background:#fff3d8;border-color:#C8973A}';
    document.head.appendChild(style);
    styled = true;
  }

  function toast(id, text, dark) {
    var old = document.getElementById(id);
    if (old) old.remove();
    var node = document.createElement('div');
    node.id = id;
    node.textContent = text;
    node.style.cssText = 'position:fixed;left:50%;bottom:80px;transform:translateX(-50%);' +
      'background:' + (dark ? '#78350f' : '#fff3d8') + ';border:1.5px solid #C8973A;color:' +
      (dark ? '#FAF4E8' : '#5a3e0a') + ';font-family:\'Noto Sans TC\',sans-serif;font-size:14px;' +
      'font-weight:700;padding:9px 16px;border-radius:20px;z-index:100001;box-shadow:0 4px 14px rgba(90,62,10,.25)';
    document.body.appendChild(node);
    setTimeout(function () { try { node.remove(); } catch (e) {} }, dark ? 2600 : 1800);
  }

  function soonToast() { toast('wa-soon-toast', '🔊 即將推出', false); }
  function errorToast() {
    if (Date.now() - errorToastAt < 1800) return;
    errorToastAt = Date.now();
    toast('wa-error-toast', '⚠️ 音檔播放失敗，請檢查網路後再試一次', true);
  }

  function signedUrl(text) {
    text = String(text || '');
    if (!has(text)) return Promise.resolve(null);
    var cached = signed[text];
    if (cached && cached.url && cached.expiresAt > Date.now() + 10000) return Promise.resolve(cached.url);
    var sb = client();
    if (!sb || !sb.functions) return Promise.reject(new Error('audio client unavailable'));
    if (!global.NetworkGuard || typeof global.NetworkGuard.request !== 'function') return Promise.reject(new Error('audio network guard unavailable'));
    return global.NetworkGuard.request(function () {
      return sb.functions.invoke('game-audio', { body: { text: text } });
    }, 'game-audio', {}, 10000, null).then(function (result) {
      if (result.error || !result.data || !result.data.signedUrl) throw (result.error || new Error('empty signed URL'));
      var expiresAt = Number(result.data.expiresAt) || (Date.now() + 60000);
      signed[text] = { url: result.data.signedUrl, expiresAt: expiresAt };
      return result.data.signedUrl;
    });
  }

  function play(text, btn) {
    text = String(text || '');
    if (!has(text)) return Promise.resolve(false);
    if (btn) btn.setAttribute('data-playing', '1');
    return signedUrl(text).then(function (url) {
      if (!url) return false;
      if (currentAudio) { try { currentAudio.pause(); currentAudio.currentTime = 0; } catch (e) {} }
      var audio = audioByText[text];
      if (!audio || audio.src !== url) {
        audio = new Audio(url);
        audio.preload = 'auto';
        audioByText[text] = audio;
      }
      currentAudio = audio;
      var done = function () { if (btn) btn.setAttribute('data-playing', '0'); };
      audio.onended = done;
      audio.onerror = function () { done(); signed[text] = null; errorToast(); };
      audio.currentTime = 0;
      return Promise.resolve(audio.play()).then(function () { return true; }).catch(function () {
        done(); signed[text] = null; errorToast(); return false;
      });
    }).catch(function () {
      if (btn) btn.setAttribute('data-playing', '0');
      errorToast();
      return false;
    });
  }

  function createBtn(text) {
    if (!has(text)) return null;
    injectStyles();
    var btn = document.createElement('button');
    btn.type = 'button'; btn.className = 'word-audio-btn'; btn.textContent = '🔊';
    btn.title = '聽發音'; btn.setAttribute('aria-label', '聽發音');
    btn.addEventListener('click', function (event) { event.stopPropagation(); play(text, btn); });
    return btn;
  }

  function btnHtml(text) {
    if (!has(text)) return '';
    injectStyles();
    var escaped = String(text).replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    return '<button type="button" class="word-audio-btn" title="聽發音" aria-label="聽發音" ' +
      'onclick="event.stopPropagation();WordAudio.play(\'' + escaped + '\',this)">🔊</button>';
  }

  function fillSlot(slotId, text) {
    var slot = document.getElementById(slotId);
    if (!slot) return;
    slot.innerHTML = '';
    var btn = createBtn(text);
    if (btn) slot.appendChild(btn);
  }

  function setCurrent(text) { currentWord = text || null; }
  function initCurrentButton() {
    var btn = document.getElementById('rg-sound-toggle');
    if (!btn) return;
    btn.textContent = '🔊'; btn.title = '聽發音'; btn.setAttribute('aria-label', '聽發音');
    btn.addEventListener('click', function (event) {
      event.stopPropagation();
      if (currentWord && has(currentWord)) play(currentWord, btn); else soonToast();
    });
  }

  injectStyles();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initCurrentButton);
  else initCurrentButton();

  global.WordAudio = {
    setAvailability: setAvailability, has: has, play: play, createBtn: createBtn,
    btnHtml: btnHtml, fillSlot: fillSlot, setCurrent: setCurrent,
    soonToast: soonToast, errorToast: errorToast
  };
})(window);
