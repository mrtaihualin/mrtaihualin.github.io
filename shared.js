// ===================================================================
// 📢 แถบประกาศหมุนเวียน (rotating announcement) — โชว์ทุกหน้า, หมุนทุก 6 วิ
//   เพิ่ม/แก้/ลบประกาศได้ที่ array ด้านล่างนี้ที่เดียว มีผลทุกหน้า
//   emoji+text = ข้อความ | cta = ป้ายปุ่ม | href = ลิงก์  หรือ  modal = id โมดัล
// ===================================================================
var ANN = [
  { emoji:'📡', text:'每週六 20:00（台灣時間）FB 粉絲頁準時直播泰語教學，千萬別錯過！', cta:'前往直播', href:'https://www.facebook.com/mrtaihua' },
  { emoji:'🎉', text:'現正招收新學員！預約免費體驗課再折 100 元，名額有限', cta:'立即預約', modal:'modal-line-qr' },
  { emoji:'📝', text:'拼音規則練習區上線！可免費領「泰語聲調速查表」', cta:'前往練習', href:'tone-finder.html' },
  { emoji:'🚀', text:'全新「造句遊戲」即將推出，敬請期待！', cta:'追蹤我們', modal:'modal-sns' }
];

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
          '<a href="https://www.youtube.com/@mrtaihua" target="_blank" rel="noopener">📺 YouTube 影片頻道</a>',
          '<a href="page4.html#sharing">🚀 貼文分享區</a>',
          '<a href="page4.html#sharing">📖 自學專區</a>',
          '<a href="tone-finder.html">🎵 泰語聲調搜尋</a>',
          '<a href="page-community.html">🇹🇭 泰語學習心聲與提問</a>',
        '</div>',
      '</li>',
      '<li>',
        '<a href="javascript:void(0)" class="has-drop">專業服務</a>',
        '<div class="nav-drop">',
          '<span class="nav-drop-label">專業服務</span>',
          '<a href="page-services.html#tour-guide">🗺️ 導遊服務</a>',
          '<a href="page-services.html#subtitle">🎬 字幕翻譯</a>',
          '<a href="page-services.html#interpret">🎙️ 口譯服務</a>',
          '<div class="nav-drop-divider"></div>',
          '<a href="page-services.html#quote-form">📋 索取報價</a>',
        '</div>',
      '</li>',
      '<li><a href="javascript:void(0)" onclick="openModal(\'modal-contact\')">聯絡我們</a></li>',
      '<li><a href="javascript:void(0)" onclick="openModal(\'modal-line-qr\')" class="nav-cta">預約免費體驗課</a></li>',
    '</ul>',
    '<button class="nav-mobile-cta" onclick="openModal(\'modal-line-qr\')">預約免費體驗課</button>',
    '<div class="hamburger" onclick="toggleMenu()"><span></span><span></span><span></span></div>',
  ].join('');

  navEls.forEach(function(el) { el.innerHTML = H; });

  // 📢 แถบประกาศหมุนเวียน — ฉีดเข้าทุกหน้า (แก้ข้อความที่ตัวแปร ANN ด้านบนสุด)
  if (typeof ANN !== 'undefined' && ANN.length && sessionStorage.getItem('annDismissed') !== '1') {
    var annIdx = 0, annTimer;
    var band = document.createElement('div');
    band.className = 'avail-band';
    band.id = 'ann-band';
    band.style.position = 'relative';

    function annRender(i) {
      var a = ANN[i];
      var cta = '';
      if (a.modal) {
        cta = '<button class="avail-cta" onclick="openModal(\'' + a.modal + '\')">' + a.cta + '</button>';
      } else if (a.href) {
        var tgt = a.href.indexOf('http') === 0 ? ' target="_blank" rel="noopener"' : '';
        cta = '<a class="avail-cta" href="' + a.href + '"' + tgt + '>' + a.cta + '</a>';
      }
      var dots = ANN.map(function(_, j) {
        return '<span onclick="annGoTo(' + j + ')" style="width:7px;height:7px;border-radius:50%;cursor:pointer;background:' + (j === i ? 'var(--gold)' : 'rgba(139,99,16,0.30)') + ';transition:background 0.2s;"></span>';
      }).join('');
      band.innerHTML =
        '<div class="avail-row">' +
          '<span class="avail-dot"></span>' +
          '<span class="avail-text">' + a.emoji + ' ' + a.text + '</span>' +
          cta +
        '</div>' +
        (ANN.length > 1 ? '<div style="display:flex;justify-content:center;align-items:center;gap:10px;margin-top:4px;">' +
            '<button onclick="annPrev()" aria-label="上一則公告" style="background:none;border:none;color:var(--gold-deep);font-size:15px;line-height:1;cursor:pointer;padding:2px 4px;">‹</button>' +
            '<div style="display:flex;align-items:center;gap:6px;">' + dots + '</div>' +
            '<button onclick="annNext()" aria-label="下一則公告" style="background:none;border:none;color:var(--gold-deep);font-size:15px;line-height:1;cursor:pointer;padding:2px 4px;">›</button>' +
          '</div>' : '') +
        '<button onclick="annDismiss()" aria-label="關閉公告" style="position:absolute;right:10px;top:50%;transform:translateY(-50%);background:none;border:none;color:var(--gold-deep);font-size:17px;line-height:1;cursor:pointer;padding:4px;">✕</button>';
    }

    function annStart() {
      if (ANN.length < 2) return;
      clearInterval(annTimer);
      annTimer = setInterval(function() { annIdx = (annIdx + 1) % ANN.length; annRender(annIdx); }, 4000);
    }

    window.annGoTo = function(i) { annIdx = i; annRender(i); annStart(); };
    window.annPrev = function() { annIdx = (annIdx - 1 + ANN.length) % ANN.length; annRender(annIdx); annStart(); };
    window.annNext = function() { annIdx = (annIdx + 1) % ANN.length; annRender(annIdx); annStart(); };
    window.annDismiss = function() { try { sessionStorage.setItem('annDismissed', '1'); } catch(e){} band.remove(); };

    annRender(0);
    document.body.insertBefore(band, document.body.firstChild);
    annStart();
  }

  // Bottom nav bar (mobile only)
  var bottomBar = document.createElement('nav');
  bottomBar.id = 'bottom-nav';
  bottomBar.innerHTML = [
    '<a href="index.html" class="bn-item">',
      '<span class="bn-icon">🏠</span>',
      '<span class="bn-label">首頁</span>',
    '</a>',
    '<a href="page2.html" class="bn-item">',
      '<span class="bn-icon">📚</span>',
      '<span class="bn-label">課程</span>',
    '</a>',
    '<a href="tone-finder.html" class="bn-item">',
      '<span class="bn-icon">🎵</span>',
      '<span class="bn-label">聲調</span>',
    '</a>',
    '<a href="page-services.html" class="bn-item">',
      '<span class="bn-icon">🌐</span>',
      '<span class="bn-label">專業服務</span>',
    '</a>',
    '<a href="javascript:void(0)" onclick="openModal(\'modal-line-qr\')" class="bn-item bn-cta">',
      '<span class="bn-icon">📞</span>',
      '<span class="bn-label">預約</span>',
    '</a>',
  ].join('');
  document.body.appendChild(bottomBar);

  var bnStyle = document.createElement('style');
  bnStyle.textContent = [
    '#bottom-nav{display:none;position:fixed;bottom:0;left:0;right:0;background:rgba(17,17,17,0.97);border-top:1px solid rgba(200,151,58,0.3);z-index:998;padding:0;padding-bottom:env(safe-area-inset-bottom);}',
    '#bottom-nav .bn-item{display:flex;flex-direction:column;align-items:center;justify-content:center;flex:1;padding:8px 4px;text-decoration:none;color:rgba(255,255,255,0.6);gap:3px;}',
    '#bottom-nav .bn-item.bn-cta{color:var(--gold);}',
    '#bottom-nav .bn-icon{font-size:20px;line-height:1;}',
    '#bottom-nav .bn-label{font-family:\'Noto Sans TC\',sans-serif;font-size:10px;letter-spacing:0.5px;}',
    '#bottom-nav .bn-item:hover,.bn-item:active{color:var(--gold);}',
    '@media(max-width:768px){#bottom-nav{display:flex;}body{padding-bottom:60px;}}',
  ].join('');
  document.head.appendChild(bnStyle);
})();

// ===================================================================
// 🪟 SHARED MODALS — injected on EVERY page (single source of truth)
//    แก้ modal ที่นี่ที่เดียว มีผลทุกหน้า
// ===================================================================
(function injectModals(){
  if (document.getElementById('modal-quiz')) return; // หน้าไหนมีอยู่แล้วข้าม
  var wrap = document.createElement('div');
  wrap.id = 'shared-modals';
  wrap.innerHTML = `
<div class="modal-overlay" id="modal-quiz" onclick="closeModalOutside(event,'modal-quiz')">
  <div class="modal-box">
    <div class="modal-header">
      <div class="modal-title">🎯 快速程度測驗</div>
      <button class="modal-close" onclick="closeModal('modal-quiz')">✕</button>
    </div>
    <div class="modal-body">
      <div class="quiz-wrap" id="quiz-wrap">
        <!-- Step 1 -->
        <div class="quiz-step active" id="q1">
          <div class="quiz-progress"><div class="quiz-prog-dot done"></div><div class="quiz-prog-dot"></div><div class="quiz-prog-dot"></div><div class="quiz-prog-dot"></div></div>
          <div class="quiz-q-text">你目前的泰文程度是？</div>
          <div class="quiz-options">
            <button class="quiz-opt" onclick="quizNext('q1','q2',0)">🆕 完全零基礎，從來沒學過</button>
            <button class="quiz-opt" onclick="quizNext('q1','q2',0)">📖 學過一點點（知道一些單字或發音）</button>
            <button class="quiz-opt" onclick="quizNext('q1','q2',1)">🗣️ 可以簡單對話，但常卡關</button>
            <button class="quiz-opt" onclick="quizNext('q1','q2',2)">✅ 能日常溝通，想精進特定部分</button>
          </div>
        </div>
        <!-- Step 2 -->
        <div class="quiz-step" id="q2">
          <div class="quiz-progress"><div class="quiz-prog-dot done"></div><div class="quiz-prog-dot done"></div><div class="quiz-prog-dot"></div><div class="quiz-prog-dot"></div></div>
          <div class="quiz-q-text">你最大的學習困境是什麼？</div>
          <div class="quiz-options">
            <button class="quiz-opt" onclick="quizNext('q2','q3',0)">🔤 不了解聲調系統，不確定自己發音對不對</button>
            <button class="quiz-opt" onclick="quizNext('q2','q3',0)">📝 看不懂泰文文字，不知如何開始</button>
            <button class="quiz-opt" onclick="quizNext('q2','q3',1)">🧱 單字認識不少，但說不出完整句子</button>
            <button class="quiz-opt" onclick="quizNext('q2','q3',2)">🎯 有特定溝通場景需要突破（工作/旅遊/追星）</button>
          </div>
        </div>
        <!-- Step 3 -->
        <div class="quiz-step" id="q3">
          <div class="quiz-progress"><div class="quiz-prog-dot done"></div><div class="quiz-prog-dot done"></div><div class="quiz-prog-dot done"></div><div class="quiz-prog-dot"></div></div>
          <div class="quiz-q-text">你希望多快開始說出第一句泰語？</div>
          <div class="quiz-options">
            <button class="quiz-opt" onclick="quizNext('q3','q4',0)">🚀 越快越好，第一堂就想開口</button>
            <button class="quiz-opt" onclick="quizNext('q3','q4',0)">📅 1–2 個月內穩定打好基礎</button>
            <button class="quiz-opt" onclick="quizNext('q3','q4',1)">🧘 慢慢來，重視紮實理解</button>
          </div>
        </div>
        <!-- Step 4 -->
        <div class="quiz-step" id="q4">
          <div class="quiz-progress"><div class="quiz-prog-dot done"></div><div class="quiz-prog-dot done"></div><div class="quiz-prog-dot done"></div><div class="quiz-prog-dot done"></div></div>
          <div class="quiz-q-text">你每週大概可以投入多少學習時間？</div>
          <div class="quiz-options">
            <button class="quiz-opt" onclick="quizResult(0)">⏱️ 每週 1–2 小時（上課為主）</button>
            <button class="quiz-opt" onclick="quizResult(1)">📚 每週 3–5 小時（上課＋課後複習）</button>
            <button class="quiz-opt" onclick="quizResult(2)">🔥 每週 5 小時以上（密集學習）</button>
          </div>
        </div>
        <!-- Results -->
        <div class="quiz-result" id="result-basic">
          <div class="quiz-result-badge" style="background:var(--gold-light);color:var(--gold);border:1.5px solid var(--gold);">適合你的方案</div>
          <div class="quiz-result-title">建議從 Basic 開始</div>
          <div class="quiz-result-desc">根據你的答案，目前最適合從零開始系統性建立發音與語感基礎。<br>Basic 課程會讓你在 10 堂內真正開口說出第一句完整的泰語。<br><span style="color:var(--gold);font-weight:700;">體驗課 30 分鐘完全免費，無任何壓力。</span></div>
          <button class="contact-cta" onclick="closeModal('modal-quiz');openModal('modal-line-qr')">預約免費體驗課</button>
          <br><button class="quiz-restart" onclick="quizReset()" style="margin-top:14px;">重新測驗</button>
        </div>
        <div class="quiz-result" id="result-standard">
          <div class="quiz-result-badge" style="background:var(--gold-light);color:var(--gold);border:1.5px solid var(--gold);">適合你的方案</div>
          <div class="quiz-result-title">建議選擇 Standard</div>
          <div class="quiz-result-desc">你已有一定基礎，Standard 課程的客製化設計能精準鎖定你的弱點，突破目前的停滯期，讓進步更有效率。<br><span style="color:var(--gold);font-weight:700;">體驗課 30 分鐘完全免費，馬上確認你的程度。</span></div>
          <button class="contact-cta" onclick="closeModal('modal-quiz');openModal('modal-line-qr')">預約免費體驗課</button>
          <br><button class="quiz-restart" onclick="quizReset()" style="margin-top:14px;">重新測驗</button>
        </div>
      </div>
    </div>
  </div>
</div>
<div class="modal-overlay" id="modal-schedule" onclick="closeModalOutside(event,'modal-schedule')">
  <div class="modal-box">
    <div class="modal-header">
      <div class="modal-title">📅 預約上課時段</div>
      <button class="modal-close" onclick="closeModal('modal-schedule')">✕</button>
    </div>
    <div class="modal-body">
      <div class="coming-soon-wrap">
        <span class="coming-soon-icon">🗓️</span>
        <div class="coming-soon-title">線上排課系統</div>
        <p class="coming-soon-sub">即將推出可視化時段選擇介面<br>讓你直接挑選最方便的上課時間<br>無需來回確認，一鍵完成預約</p>
        <div class="coming-soon-badge">即將推出 · Coming Soon</div>
        <p style="font-family:'Noto Sans TC',sans-serif;font-size:14px;color:var(--ink-muted);margin-top:24px;line-height:1.8;">目前請透過下方聯絡方式預約體驗課，我們將盡快為你安排時間。</p>
        <button class="contact-cta" style="margin-top:16px;" onclick="closeModal('modal-schedule');openModal('modal-contact')">立即聯絡預約 →</button>
      </div>
    </div>
  </div>
</div>
<div class="modal-overlay" id="modal-blog" onclick="closeModalOutside(event,'modal-blog')">
  <div class="modal-box">
    <div class="modal-header">
      <div class="modal-title">📚 泰文學習知識庫</div>
      <button class="modal-close" onclick="closeModal('modal-blog')">✕</button>
    </div>
    <div class="modal-body">
      <div class="coming-soon-wrap">
        <span class="coming-soon-icon">✍️</span>
        <div class="coming-soon-title">學習文章與資源</div>
        <p class="coming-soon-sub">即將推出泰文學習專欄<br>涵蓋發音技巧、聲調解析、常用句型<br>以及台灣人最常犯的學習盲點</p>
        <div class="coming-soon-badge">即將推出 · Coming Soon</div>
      </div>
    </div>
  </div>
</div>
<div class="modal-overlay" id="modal-videos" onclick="closeModalOutside(event,'modal-videos');stopYTVideo();">
  <div class="modal-box dark" style="max-width:720px;width:95vw;">
    <div class="modal-header">
      <div class="modal-title" style="color:var(--white)">📺 泰語影片學習庫</div>
      <button class="modal-close" onclick="stopYTVideo();closeModal('modal-videos')">✕</button>
    </div>
    <div class="modal-body" style="padding-top:0;">
      <!-- Video Player -->
      <div style="position:relative;padding-bottom:56.25%;height:0;overflow:hidden;border-radius:10px;background:#111;margin-bottom:16px;">
        <iframe id="yt-player"
          style="position:absolute;top:0;left:0;width:100%;height:100%;border:none;"
          frameborder="0" allowfullscreen
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture">
        </iframe>
        <div id="yt-empty-state" style="display:none;position:absolute;top:0;left:0;width:100%;height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;">
          <span style="font-size:48px;">📺</span>
          <div style="font-family:'Noto Sans TC',sans-serif;font-size:14px;color:rgba(255,255,255,0.5);text-align:center;">影片即將上線<br>敬請期待！</div>
        </div>
      </div>
      <!-- Video Info -->
      <div id="yt-title" style="font-family:'Noto Sans TC',sans-serif;font-size:15px;color:var(--white);font-weight:700;margin-bottom:4px;line-height:1.5;min-height:22px;"></div>
      <div style="font-family:'Noto Sans TC',sans-serif;font-size:12px;color:var(--gold);letter-spacing:1px;margin-bottom:16px;">Mr. Thai Hua · 泰語老師</div>
      <!-- Action Buttons -->
      <div style="display:flex;gap:10px;flex-wrap:wrap;">
        <button id="yt-shuffle-btn" onclick="shuffleYTVideo()" style="flex:1;min-width:130px;padding:12px 20px;background:var(--gold);color:#1a1a1a;border:none;border-radius:6px;font-family:'Noto Sans TC',sans-serif;font-size:13px;font-weight:700;cursor:pointer;letter-spacing:1px;transition:opacity 0.2s;" onmouseover="this.style.opacity='0.85'" onmouseout="this.style.opacity='1'">🔀 換一部影片</button>
        <a href="https://www.youtube.com/@mrtaihua" target="_blank" style="flex:1;min-width:130px;padding:12px 20px;background:rgba(255,255,255,0.07);color:var(--white);border:1px solid rgba(255,255,255,0.15);border-radius:6px;font-family:'Noto Sans TC',sans-serif;font-size:13px;font-weight:700;cursor:pointer;letter-spacing:1px;text-decoration:none;text-align:center;display:flex;align-items:center;justify-content:center;transition:background 0.2s;" onmouseover="this.style.background='rgba(255,255,255,0.12)'" onmouseout="this.style.background='rgba(255,255,255,0.07)'">▶ 前往 YouTube 頻道</a>
      </div>
    </div>
  </div>
</div>
<div class="modal-overlay" id="modal-fbposts" onclick="closeModalOutside(event,'modal-fbposts')">
  <div class="modal-box" style="max-width:800px;width:96vw;padding:0;overflow:hidden;max-height:92vh;display:flex;flex-direction:column;">
    <!-- Header -->
    <div class="modal-header" style="flex-shrink:0;padding:16px 22px;">
      <div style="display:flex;align-items:center;gap:12px;">
        <div class="modal-title" style="color:var(--ink)">🚀 貼文分享區</div>
      </div>
      <button class="modal-close" onclick="closeModal('modal-fbposts')">✕</button>
    </div>

    <!-- LIST VIEW -->
    <div id="fb-list-view" style="overflow-y:auto;flex:1;padding:8px 0 16px;"></div>

    <!-- DETAIL VIEW -->
    <div id="fb-detail-view" style="display:none;overflow-y:auto;flex:1;">
      <div id="fb-detail-img-wrap" style="display:none;">
        <img id="fb-detail-img" src="" alt="" style="width:100%;display:block;max-height:340px;object-fit:cover;">
      </div>
      <div style="padding:22px 28px 20px;border-bottom:1px solid rgba(200,151,58,0.2);">
        <div id="fb-detail-date" style="font-family:'Noto Sans TC',sans-serif;font-size:12px;color:var(--gold);letter-spacing:2px;margin-bottom:14px;"></div>
        <div id="fb-detail-text" style="font-family:'Noto Sans TC',sans-serif;font-size:15px;line-height:2;color:var(--ink);white-space:pre-wrap;word-break:break-word;"></div>
      </div>
      <!-- Action Buttons -->
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;padding:16px 28px;border-bottom:1px solid var(--border);">
        <button onclick="openLinkedSSFromPost()" style="padding:12px 8px;background:var(--gold);color:#1a1a1a;border:none;border-radius:6px;font-family:'Noto Sans TC',sans-serif;font-size:12px;font-weight:700;cursor:pointer;letter-spacing:0.5px;transition:opacity 0.2s;" onmouseover="this.style.opacity='0.8'" onmouseout="this.style.opacity='1'">📖 看文章學泰文</button>
        <button onclick="shareFBPost()" style="padding:12px 8px;background:var(--gold-light);color:var(--gold-deep);border:1px solid rgba(139,99,16,0.35);border-radius:6px;font-family:'Noto Sans TC',sans-serif;font-size:12px;font-weight:700;cursor:pointer;letter-spacing:0.5px;transition:background 0.2s;" onmouseover="this.style.background='rgba(139,99,16,0.14)'" onmouseout="this.style.background='var(--gold-light)'">🔗 分享本文</button>
        <button onclick="closeModal('modal-fbposts');openModal('modal-line-qr')" style="padding:12px 8px;background:var(--gold-light);color:var(--gold-deep);border:1px solid rgba(139,99,16,0.35);border-radius:6px;font-family:'Noto Sans TC',sans-serif;font-size:12px;font-weight:700;cursor:pointer;letter-spacing:0.5px;transition:background 0.2s;" onmouseover="this.style.background='rgba(139,99,16,0.14)'" onmouseout="this.style.background='var(--gold-light)'">🙋 前往提問</button>
      </div></div>
  </div>
</div>
<div class="modal-overlay" id="modal-selfstudy" onclick="closeModalOutside(event,'modal-selfstudy')">
  <div class="modal-box" style="max-width:800px;width:96vw;padding:0;overflow:hidden;max-height:92vh;display:flex;flex-direction:column;">
    <div class="modal-header" style="flex-shrink:0;padding:16px 22px;">
      <div style="display:flex;align-items:center;gap:12px;">
        <div class="modal-title" style="color:var(--ink)">📖 自學專區</div>
      </div>
      <button class="modal-close" onclick="closeModal('modal-selfstudy')">✕</button>
    </div>
    <!-- LIST VIEW -->
    <div id="ss-list-view" style="overflow-y:auto;flex:1;padding:8px 0 16px;"></div>
    <!-- DETAIL VIEW -->
    <div id="ss-detail-view" style="display:none;overflow-y:auto;flex:1;padding:22px 26px 28px;">
      <div style="font-family:'Noto Sans TC',sans-serif;font-size:11px;letter-spacing:3px;color:var(--gold);margin-bottom:16px;" id="ss-detail-label"></div>
      <div id="ss-vocab-card" style="border-radius:12px;overflow:hidden;margin-bottom:20px;"></div>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;">
        <button id="ss-read-btn" onclick="openLinkedFBPost(window._ssCurrentId)" style="padding:12px 8px;background:var(--gold);color:#1a1a1a;border:none;border-radius:6px;font-family:'Noto Sans TC',sans-serif;font-size:12px;font-weight:700;cursor:pointer;letter-spacing:0.5px;transition:opacity 0.2s;" onmouseover="this.style.opacity='0.8'" onmouseout="this.style.opacity='1'">📄 閱讀文章</button>
        <button id="ss-share-btn" onclick="shareSSArticle()" style="padding:12px 8px;background:var(--gold-light);color:var(--gold-deep);border:1px solid rgba(139,99,16,0.35);border-radius:6px;font-family:'Noto Sans TC',sans-serif;font-size:12px;font-weight:700;cursor:pointer;letter-spacing:0.5px;transition:background 0.2s;" onmouseover="this.style.background='rgba(139,99,16,0.14)'" onmouseout="this.style.background='var(--gold-light)'">🔗 分享詞彙</button>
        <button onclick="closeModal('modal-selfstudy');openModal('modal-line-qr')" style="padding:12px 8px;background:var(--gold-light);color:var(--gold-deep);border:1px solid rgba(139,99,16,0.35);border-radius:6px;font-family:'Noto Sans TC',sans-serif;font-size:12px;font-weight:700;cursor:pointer;letter-spacing:0.5px;transition:background 0.2s;" onmouseover="this.style.background='rgba(139,99,16,0.14)'" onmouseout="this.style.background='var(--gold-light)'">🙋 前往提問</button>
      </div>
    </div>
  </div>
</div>
`;
  while (wrap.firstChild) document.body.appendChild(wrap.firstChild);
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

  // 學生回饋直接寄到老師信箱（透過 Web3Forms，免後端）
  var WEB3FORMS_KEY = 'b3bfdb97-19dd-4910-bd15-89720be846c2';

  // 把索取速查表的 Email 同步寫進 Google Sheet（Apps Script Web App，免費）
  var SHEETS_ENDPOINT = 'https://script.google.com/macros/s/AKfycbzrxlkCg5zjA55L74od84QlI2_X7D-YcUrl-TR71XOUZU1K6-2uW_oteS0ybkd3jZcA/exec';
  window.sheetLog = function(fields){
    try{
      if(!SHEETS_ENDPOINT) return;
      var body = new URLSearchParams(fields || {});
      if(navigator.sendBeacon){
        navigator.sendBeacon(SHEETS_ENDPOINT, body);
      } else {
        fetch(SHEETS_ENDPOINT, {method:'POST', mode:'no-cors', keepalive:true,
          headers:{'Content-Type':'application/x-www-form-urlencoded;charset=UTF-8'},
          body: body.toString()});
      }
    }catch(e){}
  };
  async function submitFeedback() {
    const nameEl = document.getElementById('fb-name');
    const textEl = document.getElementById('fb-text');
    const fbMsg  = document.getElementById('fb-msg');
    const name = nameEl ? nameEl.value.trim() : '';
    const text = textEl ? textEl.value.trim() : '';
    if(!text){ alert('請填寫感想內容'); return; }

    const btn = document.querySelector('#feedback-section button[onclick*="submitFeedback"], button[onclick*="submitFeedback"]');
    if(btn){ btn.disabled = true; btn.dataset._t = btn.textContent; btn.textContent = '送出中…'; }

    const show = function(t){ if(fbMsg){ fbMsg.textContent=t; fbMsg.style.display='inline'; setTimeout(()=>{fbMsg.style.display='none';},5000); } };
    const restore = function(){ if(btn){ btn.disabled=false; if(btn.dataset._t) btn.textContent=btn.dataset._t; } };

    try {
      const res = await fetch('https://api.web3forms.com/submit', {
        method:'POST',
        headers:{'Content-Type':'application/json','Accept':'application/json'},
        body: JSON.stringify({
          access_key: WEB3FORMS_KEY,
          subject: '【學生回饋】來自泰華網站',
          from_name: '泰華網站・學生回饋',
          '姓名': name || '匿名',
          '回饋內容': text
        })
      });
      const data = await res.json();
      if(data && data.success){
        if(nameEl) nameEl.value=''; if(textEl) textEl.value='';
        show('✅ 感謝你的回饋，已成功送出給老師！');
      } else {
        show('⚠️ 送出失敗，請稍後再試，或透過 LINE 與我們聯絡。');
      }
    } catch(e){
      show('⚠️ 網路連線問題，送出失敗，請稍後再試。');
    } finally {
      restore();
    }
  }

  // ===== 通用 Web3Forms 送出（聯絡表單／索取資源共用）=====
  window.web3Send = async function(opts){
    opts = opts || {};
    var btn = opts.btn, statusEl = opts.statusEl;
    var show = function(t,ok){ if(statusEl){ statusEl.textContent=t; statusEl.style.display='block'; statusEl.style.color = ok ? 'var(--gold-deep)' : '#b00'; } };
    if(btn){ btn.disabled=true; btn.dataset._t=btn.textContent; btn.textContent='送出中…'; }
    try{
      var body = Object.assign({ access_key: WEB3FORMS_KEY }, opts.fields || {});
      var res = await fetch('https://api.web3forms.com/submit', {
        method:'POST', headers:{'Content-Type':'application/json','Accept':'application/json'},
        body: JSON.stringify(body)
      });
      var data = await res.json();
      if(data && data.success){ if(opts.onsuccess) opts.onsuccess(); show(opts.successMsg || '✅ 已送出，謝謝！', true); return true; }
      show('⚠️ 送出失敗，請稍後再試，或改用 LINE 聯絡。', false); return false;
    }catch(e){ show('⚠️ 網路問題，送出失敗，請稍後再試。', false); return false; }
    finally{ if(btn){ btn.disabled=false; if(btn.dataset._t) btn.textContent=btn.dataset._t; } }
  };

  // 聯絡表單
  window.submitContact = function(){
    var name=document.getElementById('c-name'), email=document.getElementById('c-email'), msg=document.getElementById('c-msg');
    var v=function(el){return el?el.value.trim():'';};
    if(!v(email) || !v(msg)){ alert('請填寫 Email 與訊息內容'); return; }
    web3Send({
      btn: document.querySelector('#modal-contact button[onclick*="submitContact"]'),
      statusEl: document.getElementById('c-status'),
      successMsg: '✅ 已送出！我們會於 1–2 個工作天內回覆你的信箱。',
      fields: { subject:'【網站聯絡】來自泰華網站', from_name:'泰華網站・聯絡表單', '姓名':v(name)||'未填', 'Email':v(email), '訊息':v(msg) },
      onsuccess: function(){ if(name)name.value=''; if(email)email.value=''; if(msg)msg.value=''; }
    });
  };

  // 索取聲調速查表（lead magnet）
  window.submitFreebie = function(){
    var name=document.getElementById('lm-name'), email=document.getElementById('lm-email');
    var v=function(el){return el?el.value.trim():'';};
    if(!v(email)){ alert('請填寫 Email'); return; }
    web3Send({
      btn: document.querySelector('#modal-freebie button[onclick*="submitFreebie"]'),
      statusEl: document.getElementById('lm-status'),
      successMsg: '✅ 謝謝！正在帶你前往下載頁面…',
      fields: { subject:'【索取】泰語聲調速查表', from_name:'泰華網站・索取速查表', '姓名':v(name)||'未填', 'Email':v(email) },
      onsuccess: function(){ sheetLog({ email:v(email), name:v(name), source:'彈窗・索取速查表' }); if(name)name.value=''; if(email)email.value=''; setTimeout(function(){ location.href='thank-you.html'; }, 700); }
    });
  };

  // 首頁速查表索取（inline 表單）
  window.submitHomeFreebie = function(){
    var email=document.getElementById('hm-email');
    var v=email?email.value.trim():'';
    if(!v){ alert('請填寫 Email'); return; }
    web3Send({
      btn: document.querySelector('button[onclick*="submitHomeFreebie"]'),
      statusEl: document.getElementById('hm-status'),
      successMsg: '✅ 謝謝！正在帶你前往下載頁面…',
      fields: { subject:'【索取】泰語聲調速查表（首頁）', from_name:'泰華網站・索取速查表', 'Email':v },
      onsuccess: function(){ sheetLog({ email:v, source:'首頁橫幅・索取速查表' }); if(email)email.value=''; setTimeout(function(){ location.href='thank-you.html'; }, 700); }
    });
  };

  // 預約體驗課（留言版）
  window.submitBooking = function(){
    var name=document.getElementById('b-name'), email=document.getElementById('b-email'), when=document.getElementById('b-when');
    var v=function(el){return el?el.value.trim():'';};
    if(!v(email)){ alert('請填寫 Email 以便回覆你'); return; }
    web3Send({
      btn: document.querySelector('#modal-line-qr button[onclick*="submitBooking"]'),
      statusEl: document.getElementById('b-status'),
      successMsg: '✅ 已收到你的預約！我們會盡快與你聯絡安排體驗課。',
      fields: { subject:'【預約體驗課】來自泰華網站', from_name:'泰華網站・預約體驗課', '姓名':v(name)||'未填', 'Email':v(email), '方便時段':v(when)||'未填' },
      onsuccess: function(){ if(name)name.value=''; if(email)email.value=''; if(when)when.value=''; }
    });
  };

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

document.querySelectorAll('.avail-band-placeholder').forEach(el => { el.outerHTML = '<div class="avail-band"><div class="avail-row"><div class="avail-dot"></div><span class="avail-text">📡 每週六 20:00（台灣時間）FB 粉絲頁準時直播泰語教學，千萬別錯過！</span><a class="avail-cta" href="https://www.facebook.com/mrtaihua" target="_blank">前往直播</a></div></div>'; });

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
      <div style="border-top:1px solid var(--warm-line);margin:18px 0 14px;padding-top:18px;">
        <div class="contact-label" style="margin-bottom:10px;display:block;">不方便加 LINE？直接留言給老師（寄到信箱）</div>
        <input id="c-name" type="text" placeholder="你的名字（可填暱稱）" style="font-family:'Noto Sans TC',sans-serif;font-size:14px;padding:11px 13px;border:1.5px solid var(--gold-bright);border-radius:6px;background:var(--cream);color:var(--ink);width:100%;box-sizing:border-box;margin-bottom:10px;">
        <input id="c-email" type="email" placeholder="你的 Email" style="font-family:'Noto Sans TC',sans-serif;font-size:14px;padding:11px 13px;border:1.5px solid var(--gold-bright);border-radius:6px;background:var(--cream);color:var(--ink);width:100%;box-sizing:border-box;margin-bottom:10px;">
        <textarea id="c-msg" rows="3" placeholder="想詢問的內容…" style="font-family:'Noto Sans TC',sans-serif;font-size:14px;padding:11px 13px;border:1.5px solid var(--gold-bright);border-radius:6px;background:var(--cream);color:var(--ink);width:100%;box-sizing:border-box;resize:vertical;margin-bottom:10px;"></textarea>
        <button class="contact-cta" style="background:var(--gold);" onclick="submitContact()">送出訊息 →</button>
        <span id="c-status" style="display:none;font-family:'Noto Sans TC',sans-serif;font-size:13px;font-weight:700;text-align:center;margin-top:10px;"></span>
      </div>
    </div>
  </div>
</div>`;
  }

  if (!document.getElementById('modal-sns')) {
    var _snsRow = function(url,bg,ic,name,sub,ch){
      return '<a href="'+url+'" target="_blank" rel="noopener" onclick="window.gtag&&gtag(\'event\',\'sns_click\',{ch:\''+ch+'\'})" '+
        'style="display:flex;align-items:center;gap:13px;text-decoration:none;background:var(--cream,#FBF5E7);border:1px solid rgba(200,151,58,0.28);border-radius:12px;padding:11px 14px;transition:background .15s;" onmouseover="this.style.background=\'rgba(200,151,58,0.12)\'" onmouseout="this.style.background=\'var(--cream,#FBF5E7)\'">'+
        '<span style="width:40px;height:40px;border-radius:10px;flex-shrink:0;display:flex;align-items:center;justify-content:center;font-size:20px;font-weight:700;color:#fff;background:'+bg+';">'+ic+'</span>'+
        '<span style="min-width:0;"><span style="display:block;font-family:\'Noto Sans TC\',sans-serif;font-weight:800;color:#5C4410;font-size:15px;line-height:1.2;">'+name+'</span>'+
        '<span style="display:block;font-family:\'Noto Sans TC\',sans-serif;font-size:12px;color:#A0895A;margin-top:2px;">'+sub+'</span></span></a>';
    };
    modalsHTML += `
<!-- SNS LIST -->
<div class="modal-overlay" id="modal-sns" onclick="closeModalOutside(event,'modal-sns')">
  <div class="modal-box" style="max-width:420px;">
    <div class="modal-header">
      <div class="modal-title" style="color:var(--ink);">📲 追蹤我們</div>
      <button class="modal-close" onclick="closeModal('modal-sns')">✕</button>
    </div>
    <div class="modal-body">
      <p style="font-family:'Noto Sans TC',sans-serif;font-size:13px;color:var(--ink-muted);line-height:1.7;margin:0 0 14px;">每天學一點泰語，第一時間收到新課程、教學影片與聲調小技巧 ✨</p>
      <div style="display:flex;flex-direction:column;gap:10px;">
        ${_snsRow('https://www.facebook.com/mrtaihua','#1877F2','f','Facebook','粉絲頁・每週直播教學','facebook')}
        ${_snsRow('https://www.youtube.com/@mrtaihua','#FF0000','▶','YouTube','教學影片・聲調解析','youtube')}
        ${_snsRow('https://www.instagram.com/mrtaihua','linear-gradient(45deg,#F58529,#DD2A7B,#8134AF)','📷','Instagram','每日一字・學習花絮','instagram')}
        ${_snsRow('https://www.tiktok.com/@mrtaihua','#000','🎵','TikTok','短影音・快速學泰語','tiktok')}
        ${_snsRow('https://www.threads.com/@mrtaihua?invite=0','#000','@','Threads','學習筆記・互動討論','threads')}
        ${_snsRow('https://lin.ee/yVBgvywy','#06C755','💬','LINE','預約免費體驗課・私訊諮詢','line')}
      </div>
    </div>
  </div>
</div>`;
  }

  if (!document.getElementById('modal-freebie')) {
    modalsHTML += `
<!-- FREEBIE / LEAD MAGNET -->
<div class="modal-overlay" id="modal-freebie" onclick="closeModalOutside(event,'modal-freebie')">
  <div class="modal-box" style="max-width:430px;">
    <div class="modal-header">
      <div class="modal-title" style="color:var(--ink);">🎁 免費領取・泰語聲調速查表</div>
      <button class="modal-close" onclick="closeModal('modal-freebie')">✕</button>
    </div>
    <div class="modal-body">
      <p style="font-family:'Noto Sans TC',sans-serif;font-size:14px;color:var(--ink-soft);line-height:1.9;margin-bottom:18px;">留下 Email，我們把「泰語聲調速查表」寄給你 — 用台灣人熟悉的中文聲調，一張表搞懂泰語五個聲調與判斷規則。</p>
      <input id="lm-name" type="text" placeholder="你的名字（可填暱稱）" style="font-family:'Noto Sans TC',sans-serif;font-size:14px;padding:11px 13px;border:1.5px solid var(--gold-bright);border-radius:6px;background:var(--cream);color:var(--ink);width:100%;box-sizing:border-box;margin-bottom:10px;">
      <input id="lm-email" type="email" placeholder="你的 Email" style="font-family:'Noto Sans TC',sans-serif;font-size:14px;padding:11px 13px;border:1.5px solid var(--gold-bright);border-radius:6px;background:var(--cream);color:var(--ink);width:100%;box-sizing:border-box;margin-bottom:14px;">
      <button class="contact-cta" onclick="submitFreebie()">把速查表寄給我 →</button>
      <span id="lm-status" style="display:none;font-family:'Noto Sans TC',sans-serif;font-size:13px;font-weight:700;text-align:center;margin-top:12px;"></span>
      <p style="font-family:'Noto Sans TC',sans-serif;font-size:11px;color:var(--ink-muted);text-align:center;margin-top:14px;">我們不會寄垃圾信，隨時可取消。</p>
    </div>
  </div>
</div>`;
  }

  if (!document.getElementById('modal-line-qr')) {
    modalsHTML += `
<!-- LINE QR MODAL -->
<div class="modal-overlay" id="modal-line-qr" onclick="closeModalOutside(event,'modal-line-qr')">
  <div class="modal-box" style="max-width:380px;overflow:hidden;border:3px solid var(--gold-bright);">
    <div style="background:var(--ink);padding:28px 32px 22px;position:relative;text-align:center;">
      <button class="modal-close" onclick="closeModal('modal-line-qr')" style="position:absolute;top:14px;right:16px;color:rgba(255,255,255,0.45);font-size:20px;">✕</button>
      <span style="font-family:'Noto Sans TC',sans-serif;font-size:10px;letter-spacing:4px;text-transform:uppercase;color:var(--gold-bright);font-weight:700;display:block;margin-bottom:10px;">預約免費體驗課</span>
      <div style="font-family:'Noto Serif TC',serif;font-size:23px;font-weight:900;color:var(--white);line-height:1.3;margin-bottom:8px;">首堂 30 分鐘<br><em style="font-style:normal;color:var(--gold-bright);">完全免費體驗</em></div>
      <p style="font-family:'Noto Sans TC',sans-serif;font-size:12.5px;color:rgba(255,255,255,0.72);line-height:1.7;margin-bottom:0;">填寫資料送出 → 老師會主動與你聯絡，確認上課時間</p>
    </div>
    <div style="background:var(--gold-light);padding:22px 32px 26px;border-top:3px solid var(--gold-bright);">
      <input id="b-name" type="text" placeholder="你的名字" style="font-family:'Noto Sans TC',sans-serif;font-size:14px;padding:11px 13px;border:1.5px solid var(--gold-bright);border-radius:6px;background:var(--white);color:var(--ink);width:100%;box-sizing:border-box;margin-bottom:10px;">
      <input id="b-email" type="email" placeholder="你的 Email（老師會回覆這裡）" style="font-family:'Noto Sans TC',sans-serif;font-size:14px;padding:11px 13px;border:1.5px solid var(--gold-bright);border-radius:6px;background:var(--white);color:var(--ink);width:100%;box-sizing:border-box;margin-bottom:10px;">
      <input id="b-when" type="text" placeholder="方便上課的時段（例：平日晚上 / 週末）" style="font-family:'Noto Sans TC',sans-serif;font-size:14px;padding:11px 13px;border:1.5px solid var(--gold-bright);border-radius:6px;background:var(--white);color:var(--ink);width:100%;box-sizing:border-box;margin-bottom:12px;">
      <button class="contact-cta" onclick="submitBooking()">送出預約申請 →</button>
      <span id="b-status" style="display:none;font-family:'Noto Sans TC',sans-serif;font-size:13px;font-weight:700;text-align:center;margin-top:10px;"></span>
      <div style="display:flex;align-items:center;gap:10px;margin:18px 0 14px;color:var(--ink-muted);font-family:'Noto Sans TC',sans-serif;font-size:12px;"><span style="flex:1;height:1px;background:var(--warm-line);"></span>想先聊聊？加 LINE<span style="flex:1;height:1px;background:var(--warm-line);"></span></div>
      <div style="text-align:center;"><div style="background:var(--white);padding:12px;display:inline-block;margin-bottom:12px;"><img src="https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=https://lin.ee/yVBgvywy" alt="LINE QR Code" style="width:130px;height:130px;display:block;" loading="lazy"></div>
      <a href="https://lin.ee/yVBgvywy" target="_blank" style="display:block;background:var(--ink);color:var(--white);font-family:'Noto Sans TC',sans-serif;font-weight:900;font-size:14px;padding:13px 28px;text-decoration:none;letter-spacing:2px;text-align:center;">💬 開啟 LINE 聯絡老師</a></div>
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
    var API_KEY = 'AIzaSyBIY9Mg41RXLNkgDTq1ZyiJnCMrp_3BEeI';
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
  var SITE_URL = 'https://mrtaihualin.github.io';

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
    if (!FB_POSTS.length) { list.innerHTML = '<div style="padding:24px;text-align:center;font-family:\'Noto Sans TC\',sans-serif;color:var(--ink-muted);">尚無文章</div>'; return; }
    list.innerHTML = FB_POSTS.map(function(p) {
      var count = _getFBComments(p.id).length;
      return '<div onclick="showFBDetail(\'' + p.id + '\')" style="display:flex;align-items:center;justify-content:space-between;padding:16px 24px;border-bottom:1px solid var(--border);cursor:pointer;transition:background 0.15s;" onmouseover="this.style.background=\'rgba(212,160,23,0.07)\'" onmouseout="this.style.background=\'\'">'
        + '<div style="flex:1;min-width:0;">'
        + '<div style="font-family:\'Noto Sans TC\',sans-serif;font-size:12px;color:var(--gold-bright);letter-spacing:1px;margin-bottom:5px;">' + p.date + '</div>'
        + '<div style="font-family:\'Noto Sans TC\',sans-serif;font-size:15px;font-weight:700;color:var(--ink);line-height:1.5;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + p.title + '</div>'
        + (count ? '<div style="font-family:\'Noto Sans TC\',sans-serif;font-size:11px;color:var(--ink-muted);margin-top:4px;">💬 ' + count + ' 則留言</div>' : '')
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
    if (!comments.length) { el.innerHTML = '<div style="font-family:\'Noto Sans TC\',sans-serif;font-size:13px;color:var(--ink-muted);text-align:center;padding:8px 0;">成為第一個留言的人！</div>'; return; }
    el.innerHTML = comments.map(function(c, i) {
      return '<div style="background:rgba(139,99,16,0.06);border-left:3px solid var(--gold-bright);border-radius:0 6px 6px 0;padding:12px 14px;">'
        + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">'
        + '<span style="font-family:\'Noto Sans TC\',sans-serif;font-size:12px;font-weight:700;color:var(--gold-bright);">' + (c.name || '匿名讀者') + '</span>'
        + '<div style="display:flex;align-items:center;gap:10px;">'
        + '<span style="font-family:\'Noto Sans TC\',sans-serif;font-size:11px;color:var(--ink-muted);">' + c.date + '</span>'
        + '<button onclick="deleteFBComment(\'' + postId + '\',' + i + ')" style="background:none;border:none;color:rgba(139,99,16,0.45);cursor:pointer;font-size:14px;padding:0;line-height:1;" onmouseover="this.style.color=\'#ff6b6b\'" onmouseout="this.style.color=\'rgba(139,99,16,0.4)\'">✕</button>'
        + '</div>'
        + '</div>'
        + '<div style="font-family:\'Noto Sans TC\',sans-serif;font-size:13px;line-height:1.7;color:var(--ink-soft);">' + c.text.replace(/</g,'&lt;') + '</div>'
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
    if (!SELFSTUDY_ARTICLES.length) { list.innerHTML = '<div style="padding:24px;text-align:center;font-family:\'Noto Sans TC\',sans-serif;color:var(--ink-muted);">尚無文章</div>'; return; }
    list.innerHTML = SELFSTUDY_ARTICLES.map(function(a) {
      var vocabCount = (a.vocabulary || []).length;
      return '<div onclick="showSSDetail(\'' + a.id + '\')" style="display:flex;align-items:center;justify-content:space-between;padding:16px 24px;border-bottom:1px solid var(--border);cursor:pointer;transition:background 0.15s;" onmouseover="this.style.background=\'rgba(212,160,23,0.07)\'" onmouseout="this.style.background=\'\'">'
        + '<div style="flex:1;min-width:0;">'
        + '<div style="font-family:\'Noto Sans TC\',sans-serif;font-size:12px;color:var(--gold-bright);letter-spacing:1px;margin-bottom:5px;">' + a.date + '</div>'
        + '<div style="font-family:\'Noto Sans TC\',sans-serif;font-size:15px;font-weight:700;color:var(--ink);line-height:1.5;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + a.title + '</div>'
        + (vocabCount ? '<div style="font-family:\'Noto Sans TC\',sans-serif;font-size:11px;color:var(--ink-muted);margin-top:4px;">📚 ' + vocabCount + ' 個詞彙</div>' : '')
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
      html += '<div style="font-family:\'Noto Sans TC\',sans-serif;font-size:12px;font-weight:700;color:var(--gold-bright);letter-spacing:3px;margin-bottom:14px;text-transform:uppercase;">1 · Vocabulary & Useful Phrases</div>';
      a.vocabulary.forEach(function(v) {
        html += '<div style="border:1px solid var(--border);border-radius:10px;overflow:hidden;margin-bottom:14px;">'
          + '<div style="background:rgba(139,99,16,0.05);padding:16px 20px;border-bottom:1px solid var(--border);display:flex;align-items:baseline;gap:14px;flex-wrap:wrap;">'
          + '<span style="font-family:\'Sarabun\',sans-serif;font-size:28px;font-weight:700;color:var(--gold-bright);">' + v.thai + '</span>'
          + '<span style="font-family:\'Noto Sans TC\',sans-serif;font-size:12px;color:var(--ink-muted);letter-spacing:1px;">' + v.phonetic + '</span>'
          + '<span style="font-family:\'Noto Sans TC\',sans-serif;font-size:14px;font-weight:700;color:var(--ink-soft);margin-left:auto;">' + v.meaning + '</span>'
          + '</div>'
          + '<div style="padding:12px 20px 10px;font-family:\'Noto Sans TC\',sans-serif;font-size:12px;color:var(--ink-muted);line-height:1.7;border-bottom:1px solid var(--border);">💡 ' + v.note + '</div>'
          + '<div style="padding:12px 20px 16px;">'
          + '<div style="font-family:\'Noto Sans TC\',sans-serif;font-size:11px;color:var(--gold-bright);letter-spacing:2px;margin-bottom:10px;">📌 例句</div>';
        v.examples.forEach(function(ex, ei) {
          html += '<div style="margin-bottom:' + (ei < v.examples.length-1 ? '12' : '0') + 'px;">'
            + '<div style="font-family:\'Sarabun\',sans-serif;font-size:16px;color:var(--ink);">' + ex.thai + '</div>'
            + '<div style="font-family:\'Noto Sans TC\',sans-serif;font-size:12px;color:var(--ink-muted);margin-top:2px;">' + ex.zh + '</div>'
            + '</div>';
        });
        html += '</div></div>';
      });
    }
    if (a.conversation) {
      var cv = a.conversation;
      html += '<div style="font-family:\'Noto Sans TC\',sans-serif;font-size:12px;font-weight:700;color:var(--gold-bright);letter-spacing:3px;margin:22px 0 14px;text-transform:uppercase;">2 · Real-life Conversation</div>';
      html += '<div style="border:1px solid var(--border);border-radius:10px;overflow:hidden;">'
        + '<div style="background:rgba(139,99,16,0.05);padding:12px 20px;border-bottom:1px solid var(--border);font-family:\'Noto Sans TC\',sans-serif;font-size:13px;color:var(--ink-soft);">' + cv.situation + '</div>'
        + '<div style="padding:14px 20px;display:flex;flex-direction:column;gap:14px;">';
      cv.lines.forEach(function(line) {
        var isYou = line.speaker === '你';
        html += '<div style="display:flex;gap:10px;' + (isYou ? 'flex-direction:row-reverse;' : '') + '">'
          + '<div style="flex-shrink:0;font-family:\'Noto Sans TC\',sans-serif;font-size:11px;color:var(--gold-bright);padding-top:4px;min-width:36px;text-align:' + (isYou ? 'left' : 'right') + ';">' + line.speaker + '</div>'
          + '<div style="background:' + (isYou ? 'rgba(212,160,23,0.12)' : 'rgba(139,99,16,0.06)') + ';border-radius:8px;padding:10px 14px;max-width:85%;">'
          + '<div style="font-family:\'Sarabun\',sans-serif;font-size:15px;color:var(--ink);margin-bottom:3px;">' + line.thai + '</div>'
          + '<div style="font-family:\'Noto Sans TC\',sans-serif;font-size:12px;color:var(--ink-muted);">' + line.zh + '</div>'
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
    var SITE_URL = window.SITE_URL || 'https://mrtaihualin.github.io';
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