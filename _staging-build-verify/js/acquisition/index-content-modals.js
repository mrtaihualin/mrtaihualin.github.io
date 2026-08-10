// js/acquisition/index-content-modals.js
// แยกออกมาจาก inline <script> ใน index.html (2026-08-08 — P5-A refactor, อนุมัติแล้ว)
// เนื้อหา: YouTube วิดีโอ modal / Facebook posts modal / Self-study article modal /
// Share popup / คอมเมนต์ localStorage — ทั้งหมดนี้เป็นชุดฟังก์ชัน global (ไม่ใช่ module)
// ต้องโหลดก่อน js/core/shared.min.js เสมอ (ตำแหน่งเดิมในเอกสาร) เพราะ shared.js มี fallback
// เดียวกันคุมด้วย `if (typeof xxx === 'undefined')` — ถ้าไฟล์นี้โหลดก่อน shared.js จะข้ามการ
// นิยามซ้ำของตัวเองไปเอง (เหมือนพฤติกรรมเดิมตอนเป็น inline script)
// ห้ามย้ายตำแหน่ง <script src> ในเอกสารไปหลัง shared.min.js เด็ดขาด

// ===== 📺 泰語影片學習庫 =====
// ดึงวิดีโอจากช่อง @mrtaihua อัตโนมัติผ่าน YouTube RSS feed
// ถ้าดึงไม่ได้ จะแสดง fallback list ด้านล่าง
var YT_CHANNEL_HANDLE = 'mrtaihua'; // เปลี่ยนตรงนี้ถ้าต้องการเปลี่ยนช่อง
var YT_FALLBACK = []; // เพิ่ม { id, title } ที่นี่เป็น fallback ถ้าต้องการ

var _ytVideos = [];
var _ytCurrentIndex = -1;
var _ytLoaded = false;

async function openYTVideoModal() {
  openModal('modal-videos');
  if (!_ytLoaded) {
    _showYTState('loading');
    var fetched = await _fetchYTVideos();
    _ytVideos = (fetched && fetched.length) ? fetched : YT_FALLBACK;
    _ytLoaded = true;
  }
  loadRandomYTVideo();
}

async function _fetchYTVideos() {
  var API_KEY = 'AIzaSyBIY9Mg41RXLNkgDTq1ZyiJnCMrp_3BEeI';
  try {
    // Step 1: หา uploads playlist ID จาก channel handle
    var r1 = await fetch('https://www.googleapis.com/youtube/v3/channels?key=' + API_KEY + '&forHandle=' + YT_CHANNEL_HANDLE + '&part=contentDetails&maxResults=1');
    var d1 = await r1.json();
    if (d1.error) throw new Error(d1.error.message);
    var uploadsId = d1.items && d1.items[0] && d1.items[0].contentDetails.relatedPlaylists.uploads;
    if (!uploadsId) throw new Error('no uploads playlist');

    // Step 2: ดึงวิดีโอทั้งหมดจาก uploads playlist
    var r2 = await fetch('https://www.googleapis.com/youtube/v3/playlistItems?key=' + API_KEY + '&playlistId=' + uploadsId + '&part=snippet&maxResults=50');
    var d2 = await r2.json();
    if (d2.error) throw new Error(d2.error.message);
    var items = d2.items || [];
    if (!items.length) throw new Error('no videos');

    console.log('[YT] Loaded', items.length, 'videos via YouTube API');
    return items.map(function(item) {
      return {
        id: item.snippet.resourceId.videoId,
        title: item.snippet.title
      };
    });
  } catch(e) {
    console.warn('[YT] YouTube API failed:', e.message);
    return null;
  }
}

function _showYTState(state) {
  var player = document.getElementById('yt-player');
  var emptyEl = document.getElementById('yt-empty-state');
  var titleEl = document.getElementById('yt-title');
  var shuffleBtn = document.getElementById('yt-shuffle-btn');
  if (state === 'loading') {
    if (player) { player.src = ''; player.style.display = 'none'; }
    if (emptyEl) { emptyEl.style.display = 'flex'; emptyEl.innerHTML = '<span style="font-size:36px;animation:spin 1s linear infinite">⏳</span><div style="font-family:\'Noto Sans TC\',sans-serif;font-size:13px;color:rgba(255,255,255,0.45);margin-top:10px;">載入中...</div>'; }
    if (titleEl) titleEl.textContent = '';
    if (shuffleBtn) shuffleBtn.style.display = 'none';
  } else if (state === 'empty') {
    if (player) { player.src = ''; player.style.display = 'none'; }
    if (emptyEl) { emptyEl.style.display = 'flex'; emptyEl.innerHTML = '<span style="font-size:48px;">📺</span><div style="font-family:\'Noto Sans TC\',sans-serif;font-size:14px;color:rgba(255,255,255,0.5);text-align:center;margin-top:10px;">影片即將上線<br>敬請期待！</div>'; }
    if (titleEl) titleEl.textContent = '';
    if (shuffleBtn) shuffleBtn.style.display = 'none';
  }
}

function loadRandomYTVideo() {
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
}

function shuffleYTVideo() {
  var player = document.getElementById('yt-player');
  if (player) player.src = '';
  setTimeout(loadRandomYTVideo, 80);
}

function stopYTVideo() {
  var player = document.getElementById('yt-player');
  if (player) player.src = '';
  // allow re-fetch next time if needed (in case channel updated)
}

// FB_POSTS และ SELFSTUDY_ARTICLES อยู่ใน posts-data.js และ lessons-data.js

var _fbDetailPostId = null;

function openFBPostModal() {
  openModal('modal-fbposts');
  showFBList();
}

function openLinkedFBPost(postId) {
  closeModal('modal-selfstudy');
  openModal('modal-fbposts');
  showFBDetail(postId);
}

window._ssCurrentId = null;

function openSSModal() {
  openModal('modal-selfstudy');
  showSSList();
}

function showSSList() {
  document.getElementById('ss-list-view').style.display = 'block';
  document.getElementById('ss-detail-view').style.display = 'none';
  var _ssb=document.getElementById('ss-back-btn');if(_ssb)_ssb.style.display='none';
  _renderSSList();
}

function _renderSSList() {
  var list = document.getElementById('ss-list-view');
  if (!SELFSTUDY_ARTICLES.length) { list.innerHTML = '<div style="padding:24px;text-align:center;font-family:\'Noto Sans TC\',sans-serif;color:rgba(255,255,255,0.4);">尚無文章</div>'; return; }
  list.innerHTML = SELFSTUDY_ARTICLES.map(function(a) {
    var vocabCount = (a.vocabulary || []).length;
    return '<div onclick="showSSDetail(\'' + a.id + '\')" style="display:flex;align-items:center;justify-content:space-between;padding:16px 24px;border-bottom:1px solid rgba(255,255,255,0.07);cursor:pointer;transition:background 0.15s;" onmouseover="this.style.background=\'rgba(200,151,58,0.07)\'" onmouseout="this.style.background=\'\'">'
      + '<div style="flex:1;min-width:0;">'
      + '<div style="font-family:\'Noto Sans TC\',sans-serif;font-size:12px;color:var(--gold);letter-spacing:1px;margin-bottom:5px;">' + a.date + '</div>'
      + '<div style="font-family:\'Noto Sans TC\',sans-serif;font-size:15px;font-weight:700;color:rgba(255,255,255,0.92);line-height:1.5;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + a.title + '</div>'
      + (vocabCount ? '<div style="font-family:\'Noto Sans TC\',sans-serif;font-size:11px;color:rgba(255,255,255,0.35);margin-top:4px;">📚 ' + vocabCount + ' 個詞彙</div>' : '')
      + '</div>'
      + '<div style="color:rgba(200,151,58,0.7);font-size:20px;margin-left:16px;flex-shrink:0;">›</div>'
      + '</div>';
  }).join('');
}

function showSSDetail(articleId) {
  var a = SELFSTUDY_ARTICLES.find(function(x) { return x.id === articleId; });
  if (!a) return;
  window._ssCurrentId = a.linkedPostId;
  document.getElementById('ss-list-view').style.display = 'none';
  document.getElementById('ss-detail-view').style.display = 'block';
  var _ssb=document.getElementById('ss-back-btn');if(_ssb)_ssb.style.display='';
  document.getElementById('ss-detail-view').scrollTop = 0;
  document.getElementById('ss-detail-label').textContent = '詞彙學習 · คำศัพท์';

  var html = '';

  // Section 1: Vocabulary
  if (a.vocabulary && a.vocabulary.length) {
    html += '<div style="font-family:\'Noto Sans TC\',sans-serif;font-size:12px;font-weight:700;color:var(--gold);letter-spacing:3px;margin-bottom:14px;text-transform:uppercase;">1 · Vocabulary & Useful Phrases</div>';
    a.vocabulary.forEach(function(v, i) {
      html += '<div style="border:1px solid rgba(255,255,255,0.08);border-radius:10px;overflow:hidden;margin-bottom:14px;">'
        // Word header
        + '<div style="background:rgba(255,255,255,0.04);padding:16px 20px;border-bottom:1px solid rgba(255,255,255,0.07);display:flex;align-items:baseline;gap:14px;flex-wrap:wrap;">'
        + '<span style="font-family:\'Sarabun\',sans-serif;font-size:28px;font-weight:700;color:var(--gold);">' + v.thai + '</span>'
        + '<span style="font-family:\'Noto Sans TC\',sans-serif;font-size:12px;color:rgba(255,255,255,0.45);letter-spacing:1px;">' + v.phonetic + '</span>'
        + '<span style="font-family:\'Noto Sans TC\',sans-serif;font-size:14px;font-weight:700;color:rgba(255,255,255,0.85);margin-left:auto;">' + v.meaning + '</span>'
        + '</div>'
        // Note
        + '<div style="padding:12px 20px 10px;font-family:\'Noto Sans TC\',sans-serif;font-size:12px;color:rgba(255,255,255,0.45);line-height:1.7;border-bottom:1px solid rgba(255,255,255,0.06);">💡 ' + v.note + '</div>'
        // Examples
        + '<div style="padding:12px 20px 16px;">'
        + '<div style="font-family:\'Noto Sans TC\',sans-serif;font-size:11px;color:var(--gold);letter-spacing:2px;margin-bottom:10px;">📌 例句</div>';
      v.examples.forEach(function(ex, ei) {
        html += '<div style="margin-bottom:' + (ei < v.examples.length-1 ? '12' : '0') + 'px;">'
          + '<div style="font-family:\'Sarabun\',sans-serif;font-size:16px;color:rgba(255,255,255,0.9);">' + ex.thai + '</div>'
          + '<div style="font-family:\'Noto Sans TC\',sans-serif;font-size:12px;color:rgba(255,255,255,0.45);margin-top:2px;">' + ex.zh + '</div>'
          + '</div>';
      });
      html += '</div></div>';
    });
  }

  // Section 2: Conversation
  if (a.conversation) {
    var cv = a.conversation;
    html += '<div style="font-family:\'Noto Sans TC\',sans-serif;font-size:12px;font-weight:700;color:var(--gold);letter-spacing:3px;margin:22px 0 14px;text-transform:uppercase;">2 · Real-life Conversation</div>';
    html += '<div style="border:1px solid rgba(255,255,255,0.08);border-radius:10px;overflow:hidden;">'
      + '<div style="background:rgba(255,255,255,0.04);padding:12px 20px;border-bottom:1px solid rgba(255,255,255,0.07);font-family:\'Noto Sans TC\',sans-serif;font-size:13px;color:rgba(255,255,255,0.7);">' + cv.situation + '</div>'
      + '<div style="padding:14px 20px;display:flex;flex-direction:column;gap:14px;">';
    cv.lines.forEach(function(line) {
      var isYou = line.speaker === '你';
      html += '<div style="display:flex;gap:10px;' + (isYou ? 'flex-direction:row-reverse;' : '') + '">'
        + '<div style="flex-shrink:0;font-family:\'Noto Sans TC\',sans-serif;font-size:11px;color:var(--gold);padding-top:4px;min-width:36px;text-align:' + (isYou ? 'left' : 'right') + ';">' + line.speaker + '</div>'
        + '<div style="background:' + (isYou ? 'rgba(200,151,58,0.12)' : 'rgba(255,255,255,0.05)') + ';border-radius:8px;padding:10px 14px;max-width:85%;">'
        + '<div style="font-family:\'Sarabun\',sans-serif;font-size:15px;color:rgba(255,255,255,0.9);margin-bottom:3px;">' + line.thai + '</div>'
        + '<div style="font-family:\'Noto Sans TC\',sans-serif;font-size:12px;color:rgba(255,255,255,0.45);">' + line.zh + '</div>'
        + '</div></div>';
    });
    html += '</div></div>';
  }

  document.getElementById('ss-vocab-card').innerHTML = html;
  var readBtn = document.getElementById('ss-read-btn');
  if (readBtn) readBtn.style.display = a.linkedPostId ? '' : 'none';
}

function showFBList() {
  document.getElementById('fb-list-view').style.display = 'block';
  document.getElementById('fb-detail-view').style.display = 'none';
  var _fbb=document.getElementById('fb-back-btn');if(_fbb)_fbb.style.display='none';
  _renderFBList();
}

function _renderFBList() {
  var list = document.getElementById('fb-list-view');
  if (!FB_POSTS.length) { list.innerHTML = '<div style="padding:24px;text-align:center;font-family:\'Noto Sans TC\',sans-serif;color:rgba(255,255,255,0.4);">尚無文章</div>'; return; }
  list.innerHTML = FB_POSTS.map(function(p) {
    var count = _getFBComments(p.id).length;
    return '<div onclick="showFBDetail(\'' + p.id + '\')" style="display:flex;align-items:center;justify-content:space-between;padding:16px 24px;border-bottom:1px solid rgba(255,255,255,0.07);cursor:pointer;transition:background 0.15s;" onmouseover="this.style.background=\'rgba(200,151,58,0.07)\'" onmouseout="this.style.background=\'\'">'
      + '<div style="flex:1;min-width:0;">'
      + '<div style="font-family:\'Noto Sans TC\',sans-serif;font-size:12px;color:var(--gold);letter-spacing:1px;margin-bottom:5px;">' + p.date + '</div>'
      + '<div style="font-family:\'Noto Sans TC\',sans-serif;font-size:15px;font-weight:700;color:rgba(255,255,255,0.92);line-height:1.5;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">' + p.title + '</div>'
      + (count ? '<div style="font-family:\'Noto Sans TC\',sans-serif;font-size:11px;color:rgba(255,255,255,0.35);margin-top:4px;">💬 ' + count + ' 則留言</div>' : '')
      + '</div>'
      + '<div style="color:rgba(200,151,58,0.7);font-size:20px;margin-left:16px;flex-shrink:0;">›</div>'
      + '</div>';
  }).join('');
}

function showFBDetail(postId) {
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

  var artBtn = document.getElementById('fb-article-btn');
  if (artBtn) { artBtn.style.opacity = post.articleUrl ? '1' : '0.35'; artBtn.style.cursor = post.articleUrl ? 'pointer' : 'default'; }

  _renderFBComments(postId);
}

function openFBArticle() {
  var post = FB_POSTS.find(function(p) { return p.id === _fbDetailPostId; });
  if (post && post.articleUrl) window.open(post.articleUrl, '_blank');
}

var SITE_URL = 'https://mrtaihualin.com'; // ← เปลี่ยนเป็น domain จริงเมื่อมี

function shareFBPost() {
  var post = FB_POSTS.find(function(p) { return p.id === _fbDetailPostId; });
  if (!post) return;
  // ตัด preview ส่วนแรกของโพส ~60 ตัวอักษร
  var preview = post.text ? post.text.substring(0, 65).replace(/\n/g,' ') + '...' : '';
  openSharePopup(post.title, preview);
}

function shareSSArticle() {
  var a = SELFSTUDY_ARTICLES.find(function(x) { return x.linkedPostId === window._ssCurrentId; });
  if (!a) return;
  // ใช้ vocab ตัวแรกเป็น preview
  var preview = '';
  if (a.vocabulary && a.vocabulary.length) {
    var v = a.vocabulary[0];
    preview = v.thai + '（' + v.phonetic + '）= ' + v.meaning + '\n'
      + '例：' + v.examples[0].thai + '\n　　' + v.examples[0].zh;
  }
  openSharePopup(a.title, preview);
}

function openSharePopup(title, preview) {
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
}

function execShareCopy() {
  var ta = document.getElementById('share-text-area');
  ta.select();
  try {
    document.execCommand('copy');
    document.getElementById('share-copy-btn').textContent = '✅ 已複製！';
    setTimeout(function(){ document.getElementById('share-copy-btn').textContent = '一鍵複製'; }, 2000);
  } catch(e) { ta.select(); }
}

function closeSharePopup() {
  document.getElementById('share-bg').style.display = 'none';
  document.getElementById('share-popup').style.display = 'none';
  document.body.style.overflow = '';
}

// Comments (localStorage)
function _getFBComments(postId) {
  try { return JSON.parse(localStorage.getItem('fbcmt_' + postId)) || []; } catch(e) { return []; }
}
function _saveFBComments(postId, arr) {
  try { localStorage.setItem('fbcmt_' + postId, JSON.stringify(arr)); } catch(e) {}
}
function _renderFBComments(postId) {
  var comments = _getFBComments(postId);
  var el = document.getElementById('fb-comments-list');
  if (!el) return;
  if (!comments.length) { el.innerHTML = '<div style="font-family:\'Noto Sans TC\',sans-serif;font-size:13px;color:rgba(255,255,255,0.3);text-align:center;padding:8px 0;">成為第一個留言的人！</div>'; return; }
  el.innerHTML = comments.map(function(c, i) {
    return '<div style="background:rgba(255,255,255,0.05);border-left:3px solid var(--gold);border-radius:0 6px 6px 0;padding:12px 14px;">'
      + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">'
      + '<span style="font-family:\'Noto Sans TC\',sans-serif;font-size:12px;font-weight:700;color:var(--gold);">' + (c.name || '匿名讀者') + '</span>'
      + '<div style="display:flex;align-items:center;gap:10px;">'
      + '<span style="font-family:\'Noto Sans TC\',sans-serif;font-size:11px;color:rgba(255,255,255,0.3);">' + c.date + '</span>'
      + '<button onclick="deleteFBComment(\'' + postId + '\',' + i + ')" style="background:none;border:none;color:rgba(255,255,255,0.25);cursor:pointer;font-size:14px;padding:0;line-height:1;" onmouseover="this.style.color=\'#ff6b6b\'" onmouseout="this.style.color=\'rgba(255,255,255,0.25)\'">✕</button>'
      + '</div>'
      + '</div>'
      + '<div style="font-family:\'Noto Sans TC\',sans-serif;font-size:13px;line-height:1.7;color:rgba(255,255,255,0.82);">' + c.text.replace(/</g,'&lt;') + '</div>'
      + '</div>';
  }).join('');
}
function submitFBComment() {
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
  _renderFBList(); // update comment count in list
}
function deleteFBComment(postId, idx) {
  var comments = _getFBComments(postId);
  comments.splice(idx, 1);
  _saveFBComments(postId, comments);
  _renderFBComments(postId);
  _renderFBList();
}
