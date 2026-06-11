// ===================================================================
// 🧭 SHARED NAV  — edit here to update navigation on ALL pages
// ===================================================================
window.goHome = function() {
  var p = window.location.pathname;
  if (p.endsWith('index.html') || p === '/' || p.endsWith('/')) {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  } else {
    window.location.href = 'index.html';
  }
};

(function injectNav() {
  var navEls = document.querySelectorAll('nav.site-nav');
  if (!navEls.length) return;

  var H = [
    '<div class="nav-logo" onclick="goHome()">',
      '<span class="logo-accent">泰華</span>',
      '<span class="logo-dim">眼裡的</span>',
      '<span class="logo-main">泰語教學</span>',
    '</div>',
    '<ul class="nav-links">',
      '<li><a href="javascript:void(0)" onclick="openModal(\'modal-quiz\')">程度測驗</a></li>',
      '<li>',
        '<a href="javascript:void(0)" class="has-drop">關於老師與學生</a>',
        '<div class="nav-drop">',
          '<span class="nav-drop-label">老師與學生</span>',
          '<a href="index.html#teacher">關於老師</a>',
          '<a href="page2.html#testimonials">學生回饋</a>',
          '<a href="page3.html#feedback-section">分享你的經驗</a>',
        '</div>',
      '</li>',
      '<li>',
        '<a href="javascript:void(0)" class="has-drop">了解課程</a>',
        '<div class="nav-drop">',
          '<span class="nav-drop-label">課程資訊</span>',
          '<a href="index.html#problems">學習困境</a>',
          '<a href="page2.html#how">上課方式</a>',
          '<a href="page2.html#pricing">費用方案</a>',
          '<a href="page3.html#faq">常見問題</a>',
          '<div class="nav-drop-divider"></div>',
          '<a href="page3.html#rules">上課須知</a>',
        '</div>',
      '</li>',
      '<li>',
        '<a href="javascript:void(0)" class="has-drop">資源分享</a>',
        '<div class="nav-drop">',
          '<span class="nav-drop-label">學習素材</span>',
          '<a href="page4.html#videos">📺 泰語影片學習庫</a>',
          '<a href="page4.html#sharing">🚀 貼文分享區</a>',
          '<a href="page4.html#sharing">📖 自學專區</a>',
          '<a href="tone-finder.html">🎵 泰語聲調搜尋</a>',
          '<a href="javascript:void(0)" onclick="openModal(\'modal-line-qr\')">🇹🇭 泰語學習心聲與提問</a>',
        '</div>',
      '</li>',
      '<li>',
        '<a href="javascript:void(0)" class="has-drop">專業服務</a>',
        '<div class="nav-drop">',
          '<span class="nav-drop-label">翻譯 · 口譯</span>',
          '<a href="page3.html#interpreter">口譯 / 字幕翻譯</a>',
        '</div>',
      '</li>',
      '<li><a href="javascript:void(0)" onclick="openModal(\'modal-contact\')">聯絡我們</a></li>',
      '<li><a href="javascript:void(0)" onclick="openModal(\'modal-line-qr\')" class="nav-cta">預約免費體驗課</a></li>',
    '</ul>',
    '<button class="nav-mobile-cta" onclick="openModal(\'modal-line-qr\')">預約免費體驗課</button>',
    '<div class="hamburger" onclick="toggleMenu()"><span></span><span></span><span></span></div>',
  ].join('');

  navEls.forEach(function(el) { el.innerHTML = H; });
})();

// ===================================================================

  const observer = new IntersectionObserver(entries => {
    entries.forEach(e => { if(e.isIntersecting){e.target.classList.add('visible');observer.unobserve(e.target);} });
  }, {threshold:0.15});
  document.querySelectorAll('.reveal, .reveal-left, .reveal-right').forEach(el => observer.observe(el));

  function toggleFaq(btn) {
    const a = btn.nextElementSibling, open = btn.classList.contains('open');
    document.querySelectorAll('.faq-q').forEach(b => {b.classList.remove('open');b.nextElementSibling.classList.remove('open');});
    if(!open){btn.classList.add('open');a.classList.add('open');}
  }

  function openModal(id){ document.getElementById(id).classList.add('open'); document.body.style.overflow='hidden'; }
  function closeModal(id){ document.getElementById(id).classList.remove('open'); document.body.style.overflow=''; }
  function closeModalOutside(e,id){ if(e.target===document.getElementById(id)) closeModal(id); }
  document.addEventListener('keydown',e=>{ if(e.key==='Escape'){ document.querySelectorAll('.modal-overlay.open').forEach(m=>m.classList.remove('open')); document.body.style.overflow=''; if(typeof stopYTVideo==='function') stopYTVideo(); } });

  // Quiz logic — state persisted via localStorage
  (function() {
    var STORE_KEY = 'mrtaihua_quiz';

    function loadState() {
      try { return JSON.parse(localStorage.getItem(STORE_KEY)) || null; } catch(e) { return null; }
    }
    function saveState(state) {
      try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch(e) {}
    }
    function clearState() {
      try { localStorage.removeItem(STORE_KEY); } catch(e) {}
    }

    // Restore state on page load
    function restoreQuiz() {
      var st = loadState();
      if (!st) return;
      // Restore visible step or result
      document.querySelectorAll('.quiz-step').forEach(function(s){ s.classList.remove('active'); });
      document.querySelectorAll('.quiz-result').forEach(function(r){ r.classList.remove('active'); });
      if (st.result) {
        var el = document.getElementById(st.result);
        if (el) el.classList.add('active');
      } else if (st.step) {
        var el = document.getElementById(st.step);
        if (el) el.classList.add('active');
      }
    }

    window.quizScore = 0;

    window.quizNext = function(currentId, nextId, score) {
      window.quizScore += score;
      document.getElementById(currentId).classList.remove('active');
      document.getElementById(nextId).classList.add('active');
      saveState({ step: nextId, score: window.quizScore, result: null });
    };

    window.quizResult = function(score) {
      window.quizScore += score;
      document.getElementById('q4').classList.remove('active');
      var result = window.quizScore >= 3 ? 'result-standard' : 'result-basic';
      document.getElementById(result).classList.add('active');
      saveState({ step: null, score: window.quizScore, result: result });
    };

    window.quizReset = function() {
      window.quizScore = 0;
      clearState();
      document.querySelectorAll('.quiz-step').forEach(function(s){ s.classList.remove('active'); });
      document.querySelectorAll('.quiz-result').forEach(function(r){ r.classList.remove('active'); });
      document.getElementById('q1').classList.add('active');
    };

    // Run restore after DOM ready
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', restoreQuiz);
    } else {
      restoreQuiz();
    }
  })();

  function toggleMenu() {
    const links = document.querySelector('.nav-links');
    const isOpen = links.style.display === 'flex';
    if(isOpen){
      links.style.display='none';
    } else {
      links.style.cssText='display:flex;flex-direction:column;position:fixed;top:60px;left:0;right:0;background:rgba(17,17,17,0.98);padding:16px 24px 24px;gap:0;border-bottom:1px solid rgba(212,160,23,0.2);z-index:998;overflow-y:auto;max-height:calc(100vh - 60px);';
      // Expand all dropdowns flat on mobile
      links.querySelectorAll('.nav-drop').forEach(d => d.style.cssText='display:block;position:static;border:none;padding:0 0 0 12px;background:none;');
      links.querySelectorAll('.nav-links > li > a').forEach(a => a.style.cssText='padding:10px 0;border-bottom:1px solid rgba(255,255,255,0.06);font-size:13px;font-weight:700;color:rgba(255,255,255,0.9);');
      links.querySelectorAll('.nav-drop a').forEach(a => a.style.cssText='padding:7px 0;font-size:12px;color:rgba(255,255,255,0.55);');
    }
  }

  function submitFeedback() {
    const name = document.getElementById('fb-name').value.trim();
    const text = document.getElementById('fb-text').value.trim();
    if(!text){ alert('請填寫感想內容'); return; }
    const msg = encodeURIComponent('【學生回饋】\n姓名：' + (name||'匿名') + '\n\n' + text);
    window.open('https://lin.ee/yVBgvywy', '_blank');
    document.getElementById('fb-name').value = '';
    document.getElementById('fb-text').value = '';
    const fbMsg = document.getElementById('fb-msg');
    fbMsg.style.display = 'inline';
    setTimeout(()=>{
      fbMsg.style.display='none';
      const target = document.getElementById('testimonials');
      if(target){ target.scrollIntoView({behavior:'smooth'}); }
    }, 1800);
  }

  function toggleWac(btn) {
    const body = btn.nextElementSibling;
    const isOpen = btn.classList.contains('open');
    // Optionally close others
    btn.closest('.work-accordion').querySelectorAll('.wac-btn.open').forEach(b => {
      b.classList.remove('open');
      b.nextElementSibling.classList.remove('open');
    });
    if(!isOpen){ btn.classList.add('open'); body.classList.add('open'); }
  }

  function openLightbox(img) {
    var lb = document.getElementById('lightbox');
    document.getElementById('lightbox-img').src = img.src;
    lb.style.display = 'flex';
    requestAnimationFrame(function(){ lb.classList.add('lb-open'); });
    document.body.style.overflow = 'hidden';
  }
  function closeLightbox() {
    var lb = document.getElementById('lightbox');
    lb.classList.remove('lb-open');
    setTimeout(function(){ lb.style.display = 'none'; }, 380);
    document.body.style.overflow = '';
  }
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') closeLightbox();
  });
  // Floating QR scroll logic
  var _qrDismissed = false;
  function hideFLoatingQr() { _qrDismissed = true; var el = document.getElementById('floating-qr'); if(el) el.classList.remove('visible'); }
  window.addEventListener('scroll', function() {
    if(_qrDismissed) return;
    var el = document.getElementById('floating-qr');
    if(!el) return;
    if(window.scrollY > 200) { el.classList.add('visible'); } else { el.classList.remove('visible'); }
  }, {passive:true});

document.querySelectorAll('.avail-band-placeholder').forEach(el => { el.outerHTML = '<div class="avail-band"><div class="avail-dot"></div><span class="avail-text">🎉 全新功能 · <strong>拼音規則練習專區</strong> 即將上線 ✦ &nbsp;｜&nbsp; 🔥 現在買課程立折 <strong>100 元</strong>，額度有限，手慢則無！</span><button class="avail-cta" onclick="openModal(\'modal-social\')">訂閱消息</button></div>'; });

// ===== 📬 Contact / LINE QR / Social Modal Injection =====
(function injectSharedModals() {
  var modalsHTML = '';

  if (!document.getElementById('modal-contact')) {
    modalsHTML += `
<!-- Contact -->
<div class="modal-overlay" id="modal-contact" onclick="closeModalOutside(event,'modal-contact')">
  <div class="modal-box">
    <div class="modal-header">
      <div class="modal-title" style="color:var(--ink);">📬 聯絡我們</div>
      <button class="modal-close" onclick="closeModal('modal-contact')">✕</button>
    </div>
    <div class="modal-body">
      <div class="contact-grid">
        <div class="contact-row">
          <span class="contact-icon">💬</span>
          <div>
            <span class="contact-label">LINE</span>
            <a href="https://lin.ee/yVBgvywy" target="_blank" class="contact-link">點此加入 LINE 聯絡</a>
          </div>
        </div>
        <div class="contact-row">
          <span class="contact-icon">📧</span>
          <div>
            <span class="contact-label">電子郵件</span>
            <a href="mailto:mr.taihualin@gmail.com" class="contact-link">mr.taihualin@gmail.com</a>
          </div>
        </div>
        <div class="contact-row">
          <span class="contact-icon">📲</span>
          <div>
            <span class="contact-label">社群媒體</span>
            <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:4px;">
              <a href="https://www.instagram.com/mrtaihua" target="_blank" class="contact-link">Instagram</a>
              <a href="https://www.tiktok.com/@mrtaihua" target="_blank" class="contact-link">TikTok</a>
              <a href="https://www.youtube.com/@mrtaihua" target="_blank" class="contact-link">YouTube</a>
              <a href="https://www.facebook.com/mrtaihua" target="_blank" class="contact-link">Facebook</a>
              <a href="https://www.threads.com/@mrtaihua?invite=0" target="_blank" class="contact-link">Threads</a>
            </div>
          </div>
        </div>
        <div class="contact-row">
          <span class="contact-icon">🕐</span>
          <div>
            <span class="contact-label">回覆時間</span>
            <span class="contact-val">通常於 1–2 個工作天內回覆</span>
          </div>
        </div>
        <div class="contact-row">
          <span class="contact-icon">🆓</span>
          <div>
            <span class="contact-label">免費體驗</span>
            <span class="contact-val">首堂體驗課 30 分鐘完全免費，無壓力</span>
          </div>
        </div>
      </div>
      <button class="contact-cta" onclick="window.open('https://lin.ee/yVBgvywy','_blank')">透過 LINE 預約免費體驗課</button>
    </div>
  </div>
</div>`;
  }

  if (!document.getElementById('modal-line-qr')) {
    modalsHTML += `
<!-- LINE QR MODAL -->
<div class="modal-overlay" id="modal-line-qr" onclick="closeModalOutside(event,'modal-line-qr')">
  <div class="modal-box" style="max-width:380px;overflow:hidden;border:3px solid var(--gold-bright);">
    <div style="background:var(--ink);padding:32px 36px 0;position:relative;text-align:center;">
      <button class="modal-close" onclick="closeModal('modal-line-qr')" style="position:absolute;top:14px;right:16px;color:rgba(255,255,255,0.45);font-size:20px;">✕</button>
      <span style="font-family:'Noto Sans TC',sans-serif;font-size:10px;letter-spacing:4px;text-transform:uppercase;color:var(--gold-bright);font-weight:700;display:block;margin-bottom:10px;">預約免費體驗課</span>
      <div style="font-family:'Noto Serif TC',serif;font-size:24px;font-weight:900;color:var(--white);line-height:1.25;margin-bottom:24px;">掃碼加入 LINE<br><em style="font-style:normal;color:var(--gold-bright);font-size:18px;">開始你的泰文學習之旅</em></div>
      <div style="background:var(--white);padding:14px;display:inline-block;">
        <img src="https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=https://lin.ee/yVBgvywy" alt="LINE QR Code" style="width:168px;height:168px;display:block;" loading="lazy">
      </div>
    </div>
    <div style="background:var(--gold-light);padding:20px 36px 28px;border-top:3px solid var(--gold-bright);text-align:center;">
      <p style="font-family:'Noto Sans TC',sans-serif;font-size:13px;color:var(--ink-soft);line-height:1.85;margin:0 0 18px;">首堂 <strong>30 分鐘完全免費</strong>，無任何壓力<br>歡迎先詢問再決定</p>
      <a href="https://lin.ee/yVBgvywy" target="_blank" style="display:block;background:var(--ink);color:var(--white);font-family:'Noto Sans TC',sans-serif;font-weight:900;font-size:14px;padding:15px 28px;text-decoration:none;letter-spacing:2px;text-align:center;">開啟 LINE 聯絡 →</a>
    </div>
  </div>
</div>`;
  }

  if (!document.getElementById('modal-social')) {
    modalsHTML += `
<!-- SOCIAL MODAL -->
<div class="modal-overlay" id="modal-social" onclick="closeModalOutside(event,'modal-social')">
  <div class="modal-box" style="max-width:420px;">
    <div class="modal-header">
      <div class="modal-title" style="color:var(--ink);">📲 關注我們的社群</div>
      <button class="modal-close" onclick="closeModal('modal-social')">✕</button>
    </div>
    <div class="modal-body" style="padding:20px 28px 28px;">
      <p style="font-family:'Noto Sans TC',sans-serif;font-size:13px;color:var(--ink-muted);margin-bottom:20px;line-height:1.8;">追蹤社群，獲取最新課程資訊、泰文學習技巧與活動消息</p>
      <div style="display:flex;flex-direction:column;gap:0;border:1px solid var(--border);">
        <a href="https://www.instagram.com/mrtaihua" target="_blank" style="display:flex;align-items:center;gap:16px;padding:16px 20px;text-decoration:none;border-bottom:1px solid var(--border);transition:background 0.2s;" onmouseover="this.style.background='var(--gold-light)'" onmouseout="this.style.background=''">
          <span style="font-size:22px;width:30px;text-align:center;">📸</span>
          <div><div style="font-family:'Noto Sans TC',sans-serif;font-size:11px;letter-spacing:2px;text-transform:uppercase;color:var(--gold);font-weight:700;margin-bottom:2px;">Instagram</div><div style="font-family:'Noto Sans TC',sans-serif;font-size:14px;color:var(--ink-soft);">@mrtaihua</div></div>
          <span style="margin-left:auto;font-size:12px;color:var(--ink-muted);">→</span>
        </a>
        <a href="https://www.tiktok.com/@mrtaihua" target="_blank" style="display:flex;align-items:center;gap:16px;padding:16px 20px;text-decoration:none;border-bottom:1px solid var(--border);transition:background 0.2s;" onmouseover="this.style.background='var(--gold-light)'" onmouseout="this.style.background=''">
          <span style="font-size:22px;width:30px;text-align:center;">🎵</span>
          <div><div style="font-family:'Noto Sans TC',sans-serif;font-size:11px;letter-spacing:2px;text-transform:uppercase;color:var(--gold);font-weight:700;margin-bottom:2px;">TikTok</div><div style="font-family:'Noto Sans TC',sans-serif;font-size:14px;color:var(--ink-soft);">@mrtaihua</div></div>
          <span style="margin-left:auto;font-size:12px;color:var(--ink-muted);">→</span>
        </a>
        <a href="https://www.youtube.com/@mrtaihua" target="_blank" style="display:flex;align-items:center;gap:16px;padding:16px 20px;text-decoration:none;border-bottom:1px solid var(--border);transition:background 0.2s;" onmouseover="this.style.background='var(--gold-light)'" onmouseout="this.style.background=''">
          <span style="font-size:22px;width:30px;text-align:center;">▶️</span>
          <div><div style="font-family:'Noto Sans TC',sans-serif;font-size:11px;letter-spacing:2px;text-transform:uppercase;color:var(--gold);font-weight:700;margin-bottom:2px;">YouTube</div><div style="font-family:'Noto Sans TC',sans-serif;font-size:14px;color:var(--ink-soft);">@mrtaihua</div></div>
          <span style="margin-left:auto;font-size:12px;color:var(--ink-muted);">→</span>
        </a>
        <a href="https://www.facebook.com/mrtaihua" target="_blank" style="display:flex;align-items:center;gap:16px;padding:16px 20px;text-decoration:none;border-bottom:1px solid var(--border);transition:background 0.2s;" onmouseover="this.style.background='var(--gold-light)'" onmouseout="this.style.background=''">
          <span style="font-size:22px;width:30px;text-align:center;">👍</span>
          <div><div style="font-family:'Noto Sans TC',sans-serif;font-size:11px;letter-spacing:2px;text-transform:uppercase;color:var(--gold);font-weight:700;margin-bottom:2px;">Facebook</div><div style="font-family:'Noto Sans TC',sans-serif;font-size:14px;color:var(--ink-soft);">mrtaihua</div></div>
          <span style="margin-left:auto;font-size:12px;color:var(--ink-muted);">→</span>
        </a>
        <a href="https://www.threads.com/@mrtaihua?invite=0" target="_blank" style="display:flex;align-items:center;gap:16px;padding:16px 20px;text-decoration:none;transition:background 0.2s;" onmouseover="this.style.background='var(--gold-light)'" onmouseout="this.style.background=''">
          <span style="font-size:22px;width:30px;text-align:center;">🔗</span>
          <div><div style="font-family:'Noto Sans TC',sans-serif;font-size:11px;letter-spacing:2px;text-transform:uppercase;color:var(--gold);font-weight:700;margin-bottom:2px;">Threads</div><div style="font-family:'Noto Sans TC',sans-serif;font-size:14px;color:var(--ink-soft);">@mrtaihua</div></div>
          <span style="margin-left:auto;font-size:12px;color:var(--ink-muted);">→</span>
        </a>
      </div>
    </div>
  </div>
</div>`;
  }

  if (modalsHTML) {
    var wrapper = document.createElement('div');
    wrapper.innerHTML = modalsHTML;
    while (wrapper.firstChild) document.body.appendChild(wrapper.firstChild);
  }
})();

// ===== 📺 YouTube Video Modal =====
if (typeof openYTVideoModal === 'undefined') {
  var YT_CHANNEL_HANDLE = 'mrtaihua';
  var YT_FALLBACK = [];
  var _ytVideos = [];
  var _ytCurrentIndex = -1;
  var _ytLoaded = false;

  window.openYTVideoModal = async function() {
    openModal('modal-videos');
    if (!_ytLoaded) {
      _showYTState('loading');
      var fetched = await _fetchYTVideos();
      _ytVideos = (fetched && fetched.length) ? fetched : YT_FALLBACK;
      _ytLoaded = true;
    }
    loadRandomYTVideo();
  };

  window._fetchYTVideos = async function() {
    var API_KEY = 'AIzaSyAi2d7emgwWPo_KlDZOUs8v-3IUr16By2Y';
    try {
      var r1 = await fetch('https://www.googleapis.com/youtube/v3/channels?key=' + API_KEY + '&forHandle=' + YT_CHANNEL_HANDLE + '&part=contentDetails&maxResults=1');
      var d1 = await r1.json();
      if (d1.error) throw new Error(d1.error.message);
      var uploadsId = d1.items && d1.items[0] && d1.items[0].contentDetails.relatedPlaylists.uploads;
      if (!uploadsId) throw new Error('no uploads playlist');
      var r2 = await fetch('https://www.googleapis.com/youtube/v3/playlistItems?key=' + API_KEY + '&playlistId=' + uploadsId + '&part=snippet&maxResults=50');
      var d2 = await r2.json();
      if (d2.error) throw new Error(d2.error.message);
      var items = d2.items || [];
      if (!items.length) throw new Error('no videos');
      return items.map(function(item) { return { id: item.snippet.resourceId.videoId, title: item.snippet.title }; });
    } catch(e) { console.warn('[YT] API failed:', e.message); return null; }
  };

  window._showYTState = function(state) {
    var player = document.getElementById('yt-player');
    var emptyEl = document.getElementById('yt-empty-state');
    var titleEl = document.getElementById('yt-title');
    var shuffleBtn = document.getElementById('yt-shuffle-btn');
    if (state === 'loading') {
      if (player) { player.src = ''; player.style.display = 'none'; }
      if (emptyEl) { emptyEl.style.display = 'flex'; emptyEl.innerHTML = '<span style="font-size:36px;">⏳</span><div style="font-family:\'Noto Sans TC\',sans-serif;font-size:13px;color:rgba(255,255,255,0.45);margin-top:10px;">載入中...</div>'; }
      if (titleEl) titleEl.textContent = '';
      if (shuffleBtn) shuffleBtn.style.display = 'none';
    } else if (state === 'empty') {
      if (player) { player.src = ''; player.style.display = 'none'; }
      if (emptyEl) { emptyEl.style.display = 'flex'; emptyEl.innerHTML = '<span style="font-size:48px;">📺</span><div style="font-family:\'Noto Sans TC\',sans-serif;font-size:14px;color:rgba(255,255,255,0.5);text-align:center;margin-top:10px;">影片即將上線<br>敬請期待！</div>'; }
      if (titleEl) titleEl.textContent = '';
      if (shuffleBtn) shuffleBtn.style.display = 'none';
    }
  };

  window.loadRandomYTVideo = function() {
    var player = document.getElementById('yt-player');
    var titleEl = document.getElementById('yt-title');
    var emptyEl = document.getElementById('yt-empty-state');
    var shuffleBtn = document.getElementById('yt-shuffle-btn');
    if (!player) return;
    if (!_ytVideos.length) { _showYTState('empty'); return; }
    var idx;
    if (_ytVideos.length === 1) { idx = 0; }
    else { do { idx = Math.floor(Math.random() * _ytVideos.length); } while (idx === _ytCurrentIndex); }
    _ytCurrentIndex = idx;
    var v = _ytVideos[idx];
    player.style.display = '';
    if (emptyEl) emptyEl.style.display = 'none';
    if (shuffleBtn) shuffleBtn.style.display = '';
    player.src = 'https://www.youtube.com/embed/' + v.id + '?autoplay=1&rel=0';
    if (titleEl) titleEl.textContent = v.title || '';
  };

  window.shuffleYTVideo = function() {
    var player = document.getElementById('yt-player');
    if (player) player.src = '';
    setTimeout(loadRandomYTVideo, 80);
  };

  window.stopYTVideo = function() {
    var player = document.getElementById('yt-player');
    if (player) player.src = '';
  };
}

// ===== 🚀 FB Posts Modal =====
if (typeof openFBPostModal === 'undefined') {
  var _fbDetailPostId = null;
  var SITE_URL = 'https://mrtaihua.netlify.app';

  window.openFBPostModal = function() { openModal('modal-fbposts'); showFBList(); };

  window.openLinkedFBPost = function(postId) {
    closeModal('modal-selfstudy');
    openModal('modal-fbposts');
    showFBDetail(postId);
  };

  window.showFBList = function() {
    document.getElementById('fb-list-view').style.display = 'block';
    document.getElementById('fb-detail-view').style.display = 'none';
    var _fbb=document.getElementById('fb-back-btn');if(_fbb)_fbb.style.display='none';
    _renderFBList();
  };

  window._renderFBList = function() {
    var list = document.getElementById('fb-list-view');
    if (!list) return;
    if (!FB_POSTS.length) { list.innerHTML = '<div style="padding:24px;text-align:center;font-family:\'Noto Sans TC\',sans-serif;color:rgba(255,255,255,0.4);">尚無文章</div>'; return; }
    list.innerHTML = FB_POSTS.map(function(p) {
      var count = _getFBComments(p.id).length;
      return '<div onclick="showFBDetail(\'' + p.id + '\')" style="display:flex;align-items:center;justify-content:space-between;padding:16px 24px;border-bottom:1px solid rgba(255,255,255,0.07);cursor:pointer;transition:background 0.15s;" onmouseover="this.style.background=\'rgba(212,160,23,0.07)\'" onmouseout="this.style.background=\'\'">'
        + '<div style="flex:1;min-width:0;">'
        + '<div style="font-family:\'Noto Sans TC\',sans-serif;font-size:12px;color:#D4A017;letter-spacing:1px;margin-bottom:5px;">' + p.date + '</div>'
        + '<div style="font-family:\'Noto Sans TC\',sans-serif;font-size:15px;font-weight:700;color:rgba(255,255,255,0.92);line-height:1.5;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + p.title + '</div>'
        + (count ? '<div style="font-family:\'Noto Sans TC\',sans-serif;font-size:11px;color:rgba(255,255,255,0.35);margin-top:4px;">💬 ' + count + ' 則留言</div>' : '')
        + '</div>'
        + '<div style="color:rgba(212,160,23,0.7);font-size:20px;margin-left:16px;flex-shrink:0;">›</div>'
        + '</div>';
    }).join('');
  };

  window.showFBDetail = function(postId) {
    var post = FB_POSTS.find(function(p) { return p.id === postId; });
    if (!post) return;
    _fbDetailPostId = postId;
    document.getElementById('fb-list-view').style.display = 'none';
    document.getElementById('fb-detail-view').style.display = 'block';
    var _fbb=document.getElementById('fb-back-btn');if(_fbb)_fbb.style.display='';
    document.getElementById('fb-detail-view').scrollTop = 0;
    document.getElementById('fb-detail-date').textContent = post.date;
    document.getElementById('fb-detail-text').textContent = post.text;
    var imgWrap = document.getElementById('fb-detail-img-wrap');
    var img = document.getElementById('fb-detail-img');
    if (post.image) { img.src = post.image; imgWrap.style.display = 'block'; }
    else { imgWrap.style.display = 'none'; }
    _renderFBComments(postId);
  };

  window._getFBComments = function(postId) {
    try { return JSON.parse(localStorage.getItem('fbcmt_' + postId)) || []; } catch(e) { return []; }
  };
  window._saveFBComments = function(postId, arr) {
    try { localStorage.setItem('fbcmt_' + postId, JSON.stringify(arr)); } catch(e) {}
  };

  window._renderFBComments = function(postId) {
    var comments = _getFBComments(postId);
    var el = document.getElementById('fb-comments-list');
    if (!el) return;
    if (!comments.length) { el.innerHTML = '<div style="font-family:\'Noto Sans TC\',sans-serif;font-size:13px;color:rgba(255,255,255,0.3);text-align:center;padding:8px 0;">成為第一個留言的人！</div>'; return; }
    el.innerHTML = comments.map(function(c, i) {
      return '<div style="background:rgba(255,255,255,0.05);border-left:3px solid #D4A017;border-radius:0 6px 6px 0;padding:12px 14px;">'
        + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">'
        + '<span style="font-family:\'Noto Sans TC\',sans-serif;font-size:12px;font-weight:700;color:#D4A017;">' + (c.name || '匿名讀者') + '</span>'
        + '<div style="display:flex;align-items:center;gap:10px;">'
        + '<span style="font-family:\'Noto Sans TC\',sans-serif;font-size:11px;color:rgba(255,255,255,0.3);">' + c.date + '</span>'
        + '<button onclick="deleteFBComment(\'' + postId + '\',' + i + ')" style="background:none;border:none;color:rgba(255,255,255,0.25);cursor:pointer;font-size:14px;padding:0;line-height:1;" onmouseover="this.style.color=\'#ff6b6b\'" onmouseout="this.style.color=\'rgba(255,255,255,0.25)\'">✕</button>'
        + '</div>'
        + '</div>'
        + '<div style="font-family:\'Noto Sans TC\',sans-serif;font-size:13px;line-height:1.7;color:rgba(255,255,255,0.82);">' + c.text.replace(/</g,'&lt;') + '</div>'
        + '</div>';
    }).join('');
  };

  window.submitFBComment = function() {
    var name = (document.getElementById('fb-comment-name').value || '').trim();
    var text = (document.getElementById('fb-comment-text').value || '').trim();
    if (!text) { alert('請填寫留言內容'); return; }
    var comments = _getFBComments(_fbDetailPostId);
    var now = new Date();
    comments.push({ name: name, text: text, date: now.getFullYear() + '/' + (now.getMonth()+1) + '/' + now.getDate() });
    _saveFBComments(_fbDetailPostId, comments);
    document.getElementById('fb-comment-name').value = '';
    document.getElementById('fb-comment-text').value = '';
    _renderFBComments(_fbDetailPostId);
    _renderFBList();
  };

  window.shareFBPost = function() {
    var post = FB_POSTS.find(function(p) { return p.id === _fbDetailPostId; });
    if (!post) return;
    var preview = post.text ? post.text.substring(0, 65).replace(/\n/g,' ') + '...' : '';
    openSharePopup(post.title, preview);
  };
}

// ===== 📖 Self-Study Modal =====
if (typeof openSSModal === 'undefined') {
  window._ssCurrentId = null;

  window.openSSModal = function() { openModal('modal-selfstudy'); showSSList(); };

  window.showSSList = function() {
    document.getElementById('ss-list-view').style.display = 'block';
    document.getElementById('ss-detail-view').style.display = 'none';
    var _ssb=document.getElementById('ss-back-btn');if(_ssb)_ssb.style.display='none';
    _renderSSList();
  };

  window._renderSSList = function() {
    var list = document.getElementById('ss-list-view');
    if (!list) return;
    if (!SELFSTUDY_ARTICLES.length) { list.innerHTML = '<div style="padding:24px;text-align:center;font-family:\'Noto Sans TC\',sans-serif;color:rgba(255,255,255,0.4);">尚無文章</div>'; return; }
    list.innerHTML = SELFSTUDY_ARTICLES.map(function(a) {
      var vocabCount = (a.vocabulary || []).length;
      return '<div onclick="showSSDetail(\'' + a.id + '\')" style="display:flex;align-items:center;justify-content:space-between;padding:16px 24px;border-bottom:1px solid rgba(255,255,255,0.07);cursor:pointer;transition:background 0.15s;" onmouseover="this.style.background=\'rgba(212,160,23,0.07)\'" onmouseout="this.style.background=\'\'">'
        + '<div style="flex:1;min-width:0;">'
        + '<div style="font-family:\'Noto Sans TC\',sans-serif;font-size:12px;color:#D4A017;letter-spacing:1px;margin-bottom:5px;">' + a.date + '</div>'
        + '<div style="font-family:\'Noto Sans TC\',sans-serif;font-size:15px;font-weight:700;color:rgba(255,255,255,0.92);line-height:1.5;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + a.title + '</div>'
        + (vocabCount ? '<div style="font-family:\'Noto Sans TC\',sans-serif;font-size:11px;color:rgba(255,255,255,0.35);margin-top:4px;">📚 ' + vocabCount + ' 個詞彙</div>' : '')
        + '</div>'
        + '<div style="color:rgba(212,160,23,0.7);font-size:20px;margin-left:16px;flex-shrink:0;">›</div>'
        + '</div>';
    }).join('');
  };

  window.showSSDetail = function(articleId) {
    var a = SELFSTUDY_ARTICLES.find(function(x) { return x.id === articleId; });
    if (!a) return;
    window._ssCurrentId = a.linkedPostId;
    document.getElementById('ss-list-view').style.display = 'none';
    document.getElementById('ss-detail-view').style.display = 'block';
    var _ssb=document.getElementById('ss-back-btn');if(_ssb)_ssb.style.display='';
    document.getElementById('ss-detail-view').scrollTop = 0;
    document.getElementById('ss-detail-label').textContent = '詞彙學習 · คำศัพท์';
    var html = '';
    if (a.vocabulary && a.vocabulary.length) {
      html += '<div style="font-family:\'Noto Sans TC\',sans-serif;font-size:12px;font-weight:700;color:#D4A017;letter-spacing:3px;margin-bottom:14px;text-transform:uppercase;">1 · Vocabulary & Useful Phrases</div>';
      a.vocabulary.forEach(function(v) {
        html += '<div style="border:1px solid rgba(255,255,255,0.08);border-radius:10px;overflow:hidden;margin-bottom:14px;">'
          + '<div style="background:rgba(255,255,255,0.04);padding:16px 20px;border-bottom:1px solid rgba(255,255,255,0.07);display:flex;align-items:baseline;gap:14px;flex-wrap:wrap;">'
          + '<span style="font-family:\'Sarabun\',sans-serif;font-size:28px;font-weight:700;color:#D4A017;">' + v.thai + '</span>'
          + '<span style="font-family:\'Noto Sans TC\',sans-serif;font-size:12px;color:rgba(255,255,255,0.45);letter-spacing:1px;">' + v.phonetic + '</span>'
          + '<span style="font-family:\'Noto Sans TC\',sans-serif;font-size:14px;font-weight:700;color:rgba(255,255,255,0.85);margin-left:auto;">' + v.meaning + '</span>'
          + '</div>'
          + '<div style="padding:12px 20px 10px;font-family:\'Noto Sans TC\',sans-serif;font-size:12px;color:rgba(255,255,255,0.45);line-height:1.7;border-bottom:1px solid rgba(255,255,255,0.06);">💡 ' + v.note + '</div>'
          + '<div style="padding:12px 20px 16px;">'
          + '<div style="font-family:\'Noto Sans TC\',sans-serif;font-size:11px;color:#D4A017;letter-spacing:2px;margin-bottom:10px;">📌 例句</div>';
        v.examples.forEach(function(ex, ei) {
          html += '<div style="margin-bottom:' + (ei < v.examples.length-1 ? '12' : '0') + 'px;">'
            + '<div style="font-family:\'Sarabun\',sans-serif;font-size:16px;color:rgba(255,255,255,0.9);">' + ex.thai + '</div>'
            + '<div style="font-family:\'Noto Sans TC\',sans-serif;font-size:12px;color:rgba(255,255,255,0.45);margin-top:2px;">' + ex.zh + '</div>'
            + '</div>';
        });
        html += '</div></div>';
      });
    }
    if (a.conversation) {
      var cv = a.conversation;
      html += '<div style="font-family:\'Noto Sans TC\',sans-serif;font-size:12px;font-weight:700;color:#D4A017;letter-spacing:3px;margin:22px 0 14px;text-transform:uppercase;">2 · Real-life Conversation</div>';
      html += '<div style="border:1px solid rgba(255,255,255,0.08);border-radius:10px;overflow:hidden;">'
        + '<div style="background:rgba(255,255,255,0.04);padding:12px 20px;border-bottom:1px solid rgba(255,255,255,0.07);font-family:\'Noto Sans TC\',sans-serif;font-size:13px;color:rgba(255,255,255,0.7);">' + cv.situation + '</div>'
        + '<div style="padding:14px 20px;display:flex;flex-direction:column;gap:14px;">';
      cv.lines.forEach(function(line) {
        var isYou = line.speaker === '你';
        html += '<div style="display:flex;gap:10px;' + (isYou ? 'flex-direction:row-reverse;' : '') + '">'
          + '<div style="flex-shrink:0;font-family:\'Noto Sans TC\',sans-serif;font-size:11px;color:#D4A017;padding-top:4px;min-width:36px;text-align:' + (isYou ? 'left' : 'right') + ';">' + line.speaker + '</div>'
          + '<div style="background:' + (isYou ? 'rgba(212,160,23,0.12)' : 'rgba(255,255,255,0.05)') + ';border-radius:8px;padding:10px 14px;max-width:85%;">'
          + '<div style="font-family:\'Sarabun\',sans-serif;font-size:15px;color:rgba(255,255,255,0.9);margin-bottom:3px;">' + line.thai + '</div>'
          + '<div style="font-family:\'Noto Sans TC\',sans-serif;font-size:12px;color:rgba(255,255,255,0.45);">' + line.zh + '</div>'
          + '</div></div>';
      });
      html += '</div></div>';
    }
    document.getElementById('ss-vocab-card').innerHTML = html;
    var readBtn = document.getElementById('ss-read-btn');
    if (readBtn) readBtn.style.display = a.linkedPostId ? '' : 'none';
  };

  window.shareSSArticle = function() {
    var a = SELFSTUDY_ARTICLES.find(function(x) { return x.linkedPostId === window._ssCurrentId; });
    if (!a) return;
    var preview = '';
    if (a.vocabulary && a.vocabulary.length) {
      var v = a.vocabulary[0];
      preview = v.thai + '（' + v.phonetic + '）= ' + v.meaning + '\n'
        + '例：' + v.examples[0].thai + '\n　　' + v.examples[0].zh;
    }
    openSharePopup(a.title, preview);
  };
}

// ===== 🔗 Share Popup =====
if (typeof openSharePopup === 'undefined') {
  window.openSharePopup = function(title, preview) {
    var SITE_URL = window.SITE_URL || 'https://mrtaihua.netlify.app';
    var text = '我在「泰華眼裡的泰語教學」發現了一個很實用的泰語學習資源！\n\n'
      + '📌 ' + title + '\n'
      + (preview ? preview + '\n\n' : '\n')
      + '🌐 更多文章內容及免費泰語課程與學習內容：\n'
      + SITE_URL + '\n\n'
      + '學泰語沒有你想的那麼難！每天一句，去泰國旅遊再也不怕了 🇹🇭 快來一起學！';
    document.getElementById('share-text-area').value = text;
    document.getElementById('share-copy-btn').textContent = '一鍵複製';
    document.getElementById('share-bg').style.display = 'block';
    document.getElementById('share-popup').style.display = 'block';
    document.body.style.overflow = 'hidden';
  };

  window.execShareCopy = function() {
    var ta = document.getElementById('share-text-area');
    ta.select();
    try {
      document.execCommand('copy');
      document.getElementById('share-copy-btn').textContent = '✅ 已複製！';
      setTimeout(function(){ document.getElementById('share-copy-btn').textContent = '一鍵複製'; }, 2000);
    } catch(e) { ta.select(); }
  };

  window.closeSharePopup = function() {
    document.getElementById('share-bg').style.display = 'none';
    document.getElementById('share-popup').style.display = 'none';
    document.body.style.overflow = '';
  };
}

// ===== 🔗 openLinkedSSFromPost — always available on all pages =====
window.openLinkedSSFromPost = function() {
  var postId = typeof _fbDetailPostId !== 'undefined' ? _fbDetailPostId : window._fbDetailPostId;
  var arts = typeof SELFSTUDY_ARTICLES !== 'undefined' ? SELFSTUDY_ARTICLES : [];
  var art = arts.find(function(a) { return a.linkedPostId === postId; });
  closeModal('modal-fbposts');
  if (window.openSSModal) openSSModal();
  if (art && window.showSSDetail) showSSDetail(art.id);
};

// ===== 🗑️ Delete comment — always available =====
window.deleteFBComment = function(postId, idx) {
  var getFn = window._getFBComments || function(id) { try { return JSON.parse(localStorage.getItem('fbcmt_' + id)) || []; } catch(e) { return []; } };
  var saveFn = window._saveFBComments || function(id, arr) { try { localStorage.setItem('fbcmt_' + id, JSON.stringify(arr)); } catch(e) {} };
  var comments = getFn(postId);
  comments.splice(idx, 1);
  saveFn(postId, comments);
  if (window._renderFBComments) _renderFBComments(postId);
  if (window._renderFBList) _renderFBList();
};