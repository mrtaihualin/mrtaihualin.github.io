// ============================================================
// 課堂錄製引擎（統一：只錄聲音 / 雙人聲音 / 影片）
//   - 聲音：Opus ~24kbps（約 11 MB/小時，最低可聽）
//   - 影片：~80kbps，約 45–50 MB/小時；滿 1 小時自動切檔續錄
// ============================================================
const REC_AUDIO_BPS=24000;       // 聲音位元率（約 11 MB/小時）
const REC_VIDEO_BPS=210000;      // 2026-07-17 Lin 指定全體微調升清晰度：180k→210k（約 100 MB/小時）— mp4 轉檔預設 220k/300k 剛好夠涵蓋，轉檔不會再壓縮損失
const REC_VIDEO_BPS_HQ=500000;   // 2026-07-17 Lin 指定：Edward 專用較高畫質（約 225 MB/小時）— webm_to_mp4.py 已同步調高該生轉檔上限，否則轉檔會把畫質壓回去
const REC_HQ_STUDENT_NAMES=['Edward'];  // 高畫質名單（大小寫不分、部分比對 studentsCache[token].name）
function recIsHQStudent(){
  if(!recActiveStudent || typeof studentsCache==='undefined') return false;
  const s=studentsCache[recActiveStudent]; if(!s||!s.name) return false;
  const name=String(s.name).trim().toLowerCase();
  return REC_HQ_STUDENT_NAMES.some(n=>name.indexOf(String(n).trim().toLowerCase())>=0);
}
// 2026-07-19 Lin 指定：一堂課錄成一個檔，不要被切成兩半（以前滿 1 小時就切，1.5 小時的課會被切開很難用）。
// 留 3 小時當「跑掉了」的保險（例如忘記按停止，錄了一整天）——正常上課絕對碰不到，等於不會切。
// 上傳是分段續傳（gdUpload 1MB/塊，斷線可續），所以檔案大不是問題：
// 一般學生約 100 MB/小時、Edward 約 225 MB/小時 → 2 小時的課約 200–450 MB，正常範圍。
const REC_SPLIT_MS=3*60*60*1000;

let recMethod=null, recState='idle';
let recDisplayStream=null, recMicStream=null, recAudioCtx=null;
let recMR=null, recChunks=[], recMime='', recIsVideo=false, recNoSysAudio=false;
let recTimerID=null, recSplitID=null, recStartTime=0, recPart=0, recPartCount=0;
let recHadData=false;                 // 這次到底有沒有錄到資料（防止「假成功」訊息）
let recSessionStart=0;                // 整段錄影開始時間（救援補時長用）
let recActiveFolder='影片';           // 上傳目標子資料夾（課堂錄影＝影片）
// 崩潰防護：邊錄邊備份進 IndexedDB；意外關閉/當機/0 位元組也救得回
let recDB=null, recBackupId=null, recBackupSeq=0;
const REC_DB='classroomRecDB', REC_STORE='recChunks';

// ── 錄影監控：分頁被切走/被瀏覽器關掉/卡住沒資料 → 一律大聲警告（畫面閃紅字＋聲音） ──
let recAlertCtx=null, recWakeLock=null;
let recLastDataTs=0, recWatchdogID=null, recHiddenSince=0, recHiddenWarned=false, recStallLogged=false;
const REC_STALL_MS=15000;    // 超過15秒沒收到任何錄影資料 → 判定卡住
const REC_HIDDEN_WARN_MS=180000;  // 分頁被切到背景超過3分鐘 → 提醒（怕被 Chrome 關掉分頁）

function recSetStatus(t,cls){ const e=document.getElementById('recStatus'); if(e){ e.textContent=t; e.className='status'+(cls?' '+cls:''); } }
function recToggleStartBtns(disabled){ /* 一鍵錄製：開始鈕在學生面板（startClassRec 內已用 recState 防重複），此處無需切換 */ }

// ── 錄影問題紀錄：每次遇到異常都存一筆進 Supabase（classroom_recording_issues），
//    這樣以後回頭查「上次為什麼失敗」不用只靠當下那個轉瞬即逝的紅色警告條 ──
//    需要 Lin 先在 Supabase 執行一次建表 SQL（見 recIssueTableSql 註解），不然這裡會 fail-safe 安靜跳過，不影響錄影本身
async function recLogIssue(eventType, detail, extra){
  try{
    if(typeof sb==='undefined' || !sb) return;
    await sb.from('classroom_recording_issues').insert({
      token: recActiveStudent || null,
      event_type: eventType,
      detail: String(detail==null?'':detail).slice(0,500),
      mime: (extra&&extra.mime)||recMime||null,
      part: (extra&&extra.part!=null)?extra.part:(recPart||null),
      browser_info: (navigator.userAgent||'').slice(0,300)
    });
  }catch(e){ /* 記錄失敗也絕不能擋住錄影本身，安靜跳過就好 */ }
}

// ── 警報聲：用 Web Audio 直接產生嗶嗶聲，不需要外部音檔 ──
// 一定要在 beginRecording() 一開始（還在使用者點擊的手勢裡）就建立好 AudioContext，
// 之後才能在 setInterval／非同步流程裡直接播放，不會被瀏覽器的自動播放限制擋掉。
function recEnsureAlertCtx(){
  try{
    if(!recAlertCtx || recAlertCtx.state==='closed'){ recAlertCtx=new (window.AudioContext||window.webkitAudioContext)(); }
    if(recAlertCtx.state==='suspended'){ recAlertCtx.resume().catch(()=>{}); }
  }catch(e){}
}
function recPlayAlert(times){
  times = times||3;
  recEnsureAlertCtx();
  if(!recAlertCtx) return;
  try{
    let t=recAlertCtx.currentTime;
    for(let i=0;i<times;i++){
      const osc=recAlertCtx.createOscillator(), gain=recAlertCtx.createGain();
      osc.type='sine'; osc.frequency.value=880;
      gain.gain.setValueAtTime(0.0001,t);
      gain.gain.exponentialRampToValueAtTime(0.35,t+0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001,t+0.28);
      osc.connect(gain); gain.connect(recAlertCtx.destination);
      osc.start(t); osc.stop(t+0.3);
      t+=0.45;
    }
  }catch(e){}
}
// 畫面上一直顯示到老師按「知道了」才消失的紅色警告條（避免只嗶一聲沒注意到）
function recShowStallWarning(msg){
  let b=document.getElementById('recStallBanner');
  if(!b){
    b=document.createElement('div');
    b.id='recStallBanner';
    b.style.cssText='position:fixed;top:12px;left:50%;transform:translateX(-50%);z-index:99999;background:#dc2626;color:#fff;padding:14px 20px;border-radius:12px;font-weight:700;font-family:\'Noto Sans TC\',sans-serif;box-shadow:0 8px 24px rgba(0,0,0,0.35);max-width:92vw;text-align:center;font-size:0.9rem;';
    document.body.appendChild(b);
  }
  b.innerHTML='⚠️ '+msg+' <button onclick="recAckStallWarning()" style="margin-left:10px;background:#fff;color:#dc2626;border:none;border-radius:6px;padding:4px 12px;font-weight:700;cursor:pointer;">知道了</button>';
  // 就算老師切到別的分頁／別的視窗／別的App，也要有辦法讓他注意到：閃標題、閃圖示、跳系統通知
  recStartAttentionGrabber();
  recNotify('⚠️ 課堂錄影異常', msg);
}
function recHideStallWarning(){ const b=document.getElementById('recStallBanner'); if(b) b.remove(); recStopAttentionGrabber(); }
// 老師按「知道了」→ 只關掉這次的閃爍/通知，watchdog 還是繼續監控，下次異常照樣會再跳出來
function recAckStallWarning(){ const b=document.getElementById('recStallBanner'); if(b) b.remove(); recStopAttentionGrabber(); }

// ── 抓住注意力：切到別的分頁／別的視窗／別的App 都要看得到 ──
//   - 分頁標題閃爍「⚠️ 錄影異常！」
//   - 分頁圖示（favicon）閃紅色驚嘆號
//   - 瀏覽器系統通知（跳在畫面角落，切到別的 App 也看得到；第一次要老師同意權限）
let recOrigTitle=null, recOrigFaviconHref=null, recTitleFlashID=null, recFlashOn=false, recNotifyPermAsked=false;
function recCaptureOrig(){
  if(recOrigTitle===null) recOrigTitle=document.title;
  if(recOrigFaviconHref===null){ const link=document.querySelector('link[rel~="icon"]'); recOrigFaviconHref=link?link.href:''; }
}
function recSetFavicon(color){
  recCaptureOrig();
  let link=document.querySelector('link[rel~="icon"]');
  if(!link){ link=document.createElement('link'); link.rel='icon'; document.head.appendChild(link); }
  if(color===null){ link.href=recOrigFaviconHref||''; return; }
  try{
    const c=document.createElement('canvas'); c.width=64; c.height=64;
    const ctx=c.getContext('2d');
    ctx.beginPath(); ctx.arc(32,32,30,0,Math.PI*2); ctx.fillStyle=color; ctx.fill();
    ctx.fillStyle='#fff'; ctx.font='bold 42px sans-serif'; ctx.textAlign='center'; ctx.textBaseline='middle';
    ctx.fillText('!',32,37);
    link.href=c.toDataURL('image/png');
  }catch(e){}
}
async function recAskNotifyPermission(){
  try{
    if(!('Notification' in window) || recNotifyPermAsked) return;
    recNotifyPermAsked=true;
    if(Notification.permission==='default') await Notification.requestPermission();
  }catch(e){}
}
function recNotify(title,body){
  try{
    if('Notification' in window && Notification.permission==='granted' && document.visibilityState==='hidden'){
      new Notification(title,{body:body,tag:'classroom-rec-warning',renotify:true});
    }
  }catch(e){}
}
function recStartAttentionGrabber(){
  recCaptureOrig();
  clearInterval(recTitleFlashID);
  recTitleFlashID=setInterval(()=>{
    recFlashOn=!recFlashOn;
    document.title = recFlashOn ? '⚠️ 錄影異常！請查看' : recOrigTitle;
    recSetFavicon(recFlashOn ? '#dc2626' : null);
  },800);
}
function recStopAttentionGrabber(){
  clearInterval(recTitleFlashID); recTitleFlashID=null;
  if(recOrigTitle!==null) document.title=recOrigTitle;
  recSetFavicon(null);
}

// ── 螢幕喚醒鎖：防止電腦自動休眠把錄影中斷（不保證擋得住 Chrome 分頁被切到背景關掉，所以還要靠下面的監控） ──
async function recAcquireWakeLock(){
  try{
    if('wakeLock' in navigator){
      recWakeLock=await navigator.wakeLock.request('screen');
      recWakeLock.addEventListener('release', ()=>{ recWakeLock=null; });
    }
  }catch(e){ recWakeLock=null; }  // 拿不到就算了，不影響錄影本身
}
function recReleaseWakeLock(){
  try{ if(recWakeLock){ recWakeLock.release().catch(()=>{}); } }catch(e){}
  recWakeLock=null;
}
// 分頁被切回來時，wake lock 常常已經被瀏覽器自動釋放 → 補拿回來
document.addEventListener('visibilitychange', async ()=>{
  if(recState!=='recording') return;
  if(document.visibilityState==='hidden'){
    recHiddenSince=Date.now(); recHiddenWarned=false;
  }else{
    recHiddenSince=0;
    if('wakeLock' in navigator && !recWakeLock) await recAcquireWakeLock();
  }
});

// ── 監控：每5秒檢查一次「真的還在收到錄影資料嗎」＋「分頁是否被切走太久」，異常就大聲警告 ──
function recStartWatchdog(){
  clearInterval(recWatchdogID);
  recLastDataTs=Date.now(); recHiddenSince=0; recHiddenWarned=false; recStallLogged=false;
  recHideStallWarning();
  recWatchdogID=setInterval(()=>{
    if(recState!=='recording') return;
    const silentMs=Date.now()-recLastDataTs;
    if(silentMs>REC_STALL_MS){
      if(!recStallLogged){ recStallLogged=true; recLogIssue('stall', '超過 '+Math.round(REC_STALL_MS/1000)+' 秒沒收到任何錄影資料'); }
      recSetStatus('❌ 已經 '+Math.round(silentMs/1000)+' 秒沒收到任何錄影資料，可能已經停止運作！','');
      recShowStallWarning('錄影疑似卡住／已經停止（超過 '+Math.round(REC_STALL_MS/1000)+' 秒沒有新資料），請檢查分頁還在不在，必要時按停止後重新錄影！');
      recPlayAlert(3);
    }
    if(recHiddenSince && (Date.now()-recHiddenSince)>REC_HIDDEN_WARN_MS && (Date.now()-(recHiddenWarned||0))>REC_HIDDEN_WARN_MS){
      recHiddenWarned=Date.now();
      recShowStallWarning('這個錄影分頁已經被切到背景超過 '+Math.round(REC_HIDDEN_WARN_MS/60000)+' 分鐘，Chrome 有可能把它關掉導致錄影中斷，請保持這個分頁開著！');
      recPlayAlert(2);
    }
  }, 5000);
}
function recStopWatchdog(){ clearInterval(recWatchdogID); recWatchdogID=null; recHideStallWarning(); }

// 按鈕直接呼叫（點擊即為使用者手勢，可呼叫 getDisplayMedia）
let recActiveStudent=null;
let recPendingMeet=null;  // 取得螢幕分享後才開的 Meet 連結（避免先開 Meet 搶 focus 導致錄影 00:00）
function startRec(method){ if(recState!=='recording') beginRecording(method); }
// 一般錄影鈕：未綁定特定學生 → 清除綁定，避免自動上傳到上一位學生的資料夾
function startRecGeneric(){ recActiveStudent=null; recActiveFolder='影片'; startRec('video'); }
// 老師端：點某位學生 → 開該生 Meet + 開始錄影（recActiveStudent 供日後上傳到該生 Drive 資料夾使用）
function openTabReliably(url){
  // 用 <a> 觸發開新分頁（與可正常運作的 🎥 Meet 按鈕相同方式，避免 window.open 在本頁變空白頁）
  const a=document.createElement('a');
  a.href=url; a.target='_blank'; a.rel='noopener';
  document.body.appendChild(a); a.click(); a.remove();
}
// ── 進入課堂與錄影拆成兩鍵：避免「開 Meet」與「開螢幕分享」在同一手勢互相搶 → Meet 被擋 ──
let recReminderID=null;
const REC_REMIND_MS=60000;   // 進入課堂後 60 秒仍未錄影 → 跳提醒

// 步驟 1：純連結開 Meet（與學生端可用的 🎥 按鈕相同方式，穩定）＋ 啟動「忘了錄影」提醒
function enterClass(token){
  const s=(typeof studentsCache!=='undefined')?studentsCache[token]:null;
  if(!s){ alert('找不到學生資料'); return; }
  if(!s.meet){ alert('此學生尚未設定 Meet 連結，請先在設定中新增'); return; }
  recActiveStudent=token;
  const card=document.getElementById('recCard'); if(card) card.style.display='';   // 顯示錄製面板
  const title=document.getElementById('recCardTitle'); if(title) title.textContent='課堂錄影 — '+(s.name||token);
  if(card) card.scrollIntoView({block:'nearest'});  // 只在面板不在畫面內才捲動，避免畫面突然往下彈
  recPendingMeet = null;
  openTabReliably(s.meet);
  // 啟動提醒：時間到還沒按錄影就跳視窗
  clearTimeout(recReminderID);
  recReminderID=setTimeout(function(){ if(recState!=='recording') showRecReminder(); }, REC_REMIND_MS);
}

// 步驟 2：開始錄影（此時 Meet 已開，選 Meet 分頁即可；獨立手勢→螢幕分享不會擋）
function recordClass(token){
  const s=(typeof studentsCache!=='undefined')?studentsCache[token]:null;
  if(!s){ alert('找不到學生資料'); return; }
  recActiveStudent=token; recActiveFolder='影片';
  clearTimeout(recReminderID); hideRecReminder();
  const card=document.getElementById('recCard'); if(card) card.style.display='';
  const title=document.getElementById('recCardTitle'); if(title) title.textContent='課堂錄影 — '+(s.name||token);
  startRec('video');
}

// 相容舊呼叫
function startClassRec(token){ enterClass(token); }

// ── 忘了錄影提醒視窗 ──
function showRecReminder(){ const ov=document.getElementById('recReminderOverlay'); if(ov) ov.classList.add('open'); }
function hideRecReminder(){ const ov=document.getElementById('recReminderOverlay'); if(ov) ov.classList.remove('open'); }
function recReminderStartNow(){ hideRecReminder(); if(recActiveStudent) recordClass(recActiveStudent); }  // 點擊＝使用者手勢，可開螢幕分享
function recReminderDismiss(){ clearTimeout(recReminderID); hideRecReminder(); }

// — 格式偵測（2026-07-05 改為預設優先 webm/vp8，可靠度優先於 iPhone 原生播放相容）—
// 原本預設優先 mp4/H.264 是為了 iPhone 播放相容，但這正是造成「阿姨錄影一直失敗」的root cause：
// isTypeSupported()=true 不代表這台電腦的硬體編碼器當下真的能用，Chrome 已知問題是
// mp4/H.264 常在 start() 之後才非同步丟 EncodingError（尤其筆電/沒有獨立顯卡的機器更常見）。
// vp8（webm）是 Chromium 最老牌、幾乎保證有純軟體編碼路徑可用的格式，不吃硬體編碼器，
// 這才是真正把「硬體編碼器不給力」這整類失敗徹底排除掉的做法，而不是靠事後自動重試補救。
// iPhone 播放的部分：我們錄影檔是透過 Google Drive 連結分享（autoUploadRecording → webViewLink），
// 學生點的是 Drive 網頁版預覽，Drive 預覽一律會先在伺服器端轉檔成串流格式再播放，不是瀏覽器原生解碼，
// 所以理論上就算來源檔是 webm，iPhone 開 Drive 連結預覽應該還是能看 —— 但這點沒辦法在這裡實機測試，
// 建議 push 後找一支 iPhone 實際點開一次 Drive 錄影連結確認一下。
// mp4 保留在清單最後一位，當 webm 全部候選都真的不支援時才會用到（機率非常低，等於保底）。
// 備援 webm 格式故意把 vp8 排在 vp9 前面：多份第三方報告指出 Google Drive 對 vp9 webm 的處理/預覽較不穩定，
// vp8 webm 相容性最廣（我們錄影檔會自動上傳到 Google Drive，這點很重要）
const REC_VIDEO_MIMES=['video/webm;codecs=vp8,opus','video/webm','video/webm;codecs=vp9,opus','video/mp4;codecs=avc1.42E01E,mp4a.40.2','video/mp4'];
const REC_AUDIO_MIMES=['audio/mp4;codecs=mp4a.40.2','audio/mp4','audio/webm;codecs=opus','audio/ogg;codecs=opus','audio/webm'];
function recSupportedVideoMimes(){ return REC_VIDEO_MIMES.filter(x=>MediaRecorder.isTypeSupported(x)); }
function recSupportedAudioMimes(){ return REC_AUDIO_MIMES.filter(x=>MediaRecorder.isTypeSupported(x)); }
function recPickVideoMime(){ return recSupportedVideoMimes()[0]||''; }
function recPickAudioMime(){ return recSupportedAudioMimes()[0]||''; }

// ============================================================
// 崩潰防護：邊錄邊把每個片段存進 IndexedDB（寫進磁碟、跨重整/當機仍在）
//   - 任何錯誤都吞掉，絕不影響錄影本身
//   - 正常停止且有檔案 → 清掉備份；意外關閉 → 下次開頁面跳「救回」按鈕
// ============================================================
function recOpenDB(){
  return new Promise((res,rej)=>{
    if(recDB) return res(recDB);
    let r; try{ r=indexedDB.open(REC_DB,1); }catch(e){ return rej(e); }
    r.onupgradeneeded=()=>{ const db=r.result; if(!db.objectStoreNames.contains(REC_STORE)) db.createObjectStore(REC_STORE,{keyPath:'k'}); };
    r.onsuccess=()=>{ recDB=r.result; res(recDB); };
    r.onerror=()=>rej(r.error);
  });
}
function recDBPut(obj){
  return new Promise((res,rej)=>{
    try{ const tx=recDB.transaction(REC_STORE,'readwrite'); tx.objectStore(REC_STORE).put(obj); tx.oncomplete=()=>res(); tx.onerror=()=>rej(tx.error); }
    catch(e){ rej(e); }
  });
}
// 🔒 2026-07-19 修（AI 稽核紅色問題 2）：崩潰備份改成「每一段各自一份」，並用清單記住全部還沒安全清掉的段。
//   舊版問題：整場錄影只在 beginRecording 開一次備份 id；滿 1 小時自動切檔後不會重開，
//   而第 1 段上傳到 Drive 成功時 recBackupClear() 會把 id 清成 null → 第 2 段之後只存在 RAM，
//   當機/關分頁就整段消失，而且救回橫幅也不會出現（RELIABILITY FIRST：備份不能有空窗）。
function recBackupListGet(){
  try{ const a=JSON.parse(localStorage.getItem('recPendingBackups')||'[]'); return Array.isArray(a)?a:[]; }catch(e){ return []; }
}
function recBackupListSet(list){
  try{ localStorage.setItem('recPendingBackups', JSON.stringify(list||[])); }catch(e){}
}
async function recBackupStart(meta){
  // id 一定要「同步」先產生（不要等 await）—— MediaRecorder 每 1 秒就丟資料進來，
  // 晚一步設好 recBackupId 就會漏掉最前面那幾秒沒寫進備份
  recBackupId='rec_'+Date.now()+'_'+Math.random().toString(36).slice(2,7); recBackupSeq=0;
  const myId=recBackupId;
  const list=recBackupListGet(); list.push({ id:myId, meta:meta||{} }); recBackupListSet(list);
  localStorage.setItem('recPendingBackup', myId);   // 舊欄位仍寫著（相容舊版留下來的備份）
  localStorage.setItem('recPendingMeta', JSON.stringify(meta||{}));
  try{
    await recOpenDB();
    await recDBPut({ k:myId+'__meta', meta:meta });
  }catch(e){                                        // 備份失敗 → 照常錄影（只是少了崩潰防護）
    if(recBackupId===myId) recBackupId=null;
    recBackupListSet(recBackupListGet().filter(function(x){ return x && x.id!==myId; }));
  }
  return myId;
}
// 中途自動切換編碼格式（EncodingError fallback）時呼叫：更新備份的 mime 標記，
// 否則萬一切換格式後才當機，救回時會照舊標記（例如 mp4）去重建檔案，但裡面其實是換過的格式（例如 webm）的位元組 → 存出來的檔案打不開
let recBackupMimeQueue=Promise.resolve();   // 序列化佇列：萬一短時間內連續切換格式（連續 fallback），讀改寫不會互相插隊蓋掉彼此
function recBackupUpdateMime(newMime){
  if(!recBackupId) return recBackupMimeQueue;
  const myBackupId=recBackupId;
  recBackupMimeQueue = recBackupMimeQueue.then(async ()=>{
    if(myBackupId!==recBackupId) return;   // 這段排隊的時候整段錄影已經重新開始（新的 backup id），這筆過期了就不寫
    try{
      await recOpenDB();
      const rec = await new Promise((res)=>{ const tx=recDB.transaction(REC_STORE,'readonly'); const rq=tx.objectStore(REC_STORE).get(myBackupId+'__meta'); rq.onsuccess=()=>res(rq.result); rq.onerror=()=>res(null); });
      const meta = (rec&&rec.meta)||{};
      meta.mime = newMime;
      await recDBPut({ k:myBackupId+'__meta', meta:meta });
      localStorage.setItem('recPendingMeta', JSON.stringify(meta));
    }catch(e){}
  });
  return recBackupMimeQueue;
}
async function recBackupChunk(blob){
  if(!recBackupId) return;
  try{ await recDBPut({ k:recBackupId+'__'+String(recBackupSeq++).padStart(6,'0'), blob:blob }); }catch(e){}
}
async function recBackupClear(id){
  id=id||recBackupId; if(!id) return;
  try{
    await recOpenDB();
    await new Promise((res)=>{
      const tx=recDB.transaction(REC_STORE,'readwrite'); const st=tx.objectStore(REC_STORE);
      const rq=st.getAllKeys();
      // ⚠️ 一定要比對 id+'__'（不能只比對 id）——現在同一場錄影的各段 id 開頭很像，
      // 只比對 id 會連「還在上傳中的下一段備份」一起刪掉（2026-07-19 修）
      rq.onsuccess=()=>{ (rq.result||[]).forEach(k=>{ if(String(k).indexOf(id+'__')===0) st.delete(k); }); };
      tx.oncomplete=()=>res(); tx.onerror=()=>res();
    });
  }catch(e){}
  recBackupListSet(recBackupListGet().filter(function(x){ return x && x.id!==id; }));
  if((localStorage.getItem('recPendingBackup')||'')===id){ localStorage.removeItem('recPendingBackup'); localStorage.removeItem('recPendingMeta'); }
  if(id===recBackupId){ recBackupId=null; }
}
// 整場錄影結束、且已經確定安全（例如沒綁學生＝老師自己下載存檔）→ 一次清掉全部段的備份
async function recBackupClearAll(){
  const ids=recBackupListGet().map(function(x){ return x&&x.id; }).filter(Boolean);
  const legacy=localStorage.getItem('recPendingBackup');
  if(legacy && ids.indexOf(legacy)<0) ids.push(legacy);
  for(const id of ids){ try{ await recBackupClear(id); }catch(e){} }
}
// 開頁面時檢查有沒有上次沒存成功的錄影 → 跳救回橫幅
async function recCheckLeftover(){
  // 2026-07-19 改：一次檢查「全部」還沒清掉的段（可能不只一段：第 1 段還在上傳時當機 → 第 1、2 段都留著）
  const list=recBackupListGet();
  const legacyId=localStorage.getItem('recPendingBackup');
  let legacyMeta={}; try{ legacyMeta=JSON.parse(localStorage.getItem('recPendingMeta')||'{}')||{}; }catch(e){}
  const ids=[];
  list.forEach(function(x){ if(x&&x.id&&ids.indexOf(x.id)<0) ids.push(x.id); });
  if(legacyId && ids.indexOf(legacyId)<0) ids.push(legacyId);
  if(!ids.length) return;
  try{
    await recOpenDB();
    const allKeys=await new Promise((res)=>{
      const tx=recDB.transaction(REC_STORE,'readonly'); const rq=tx.objectStore(REC_STORE).getAllKeys();
      rq.onsuccess=()=>res(rq.result||[]); rq.onerror=()=>res([]);
    });
    for(const id of ids){
      const entry=list.filter(function(x){ return x&&x.id===id; })[0];
      const meta=(entry&&entry.meta)||legacyMeta||{};
      const keys=allKeys.filter(k=>String(k).indexOf(id+'__')===0 && String(k).indexOf('__meta')<0).sort();
      if(!keys.length){ await recBackupClear(id); continue; }
      recShowRecoverBanner(id, meta, keys);
    }
  }catch(e){}
}
let recRecoverBannerSeq=0;
function recShowRecoverBanner(id, meta, keys){
  const host=document.getElementById('mainContainer'); if(!host) return;
  const uid='recRecover'+(++recRecoverBannerSeq);   // 可能同時出現好幾張橫幅 → id 不能重複，不然按鈕會綁錯張
  const partLabel=(meta&&meta.part)?('（第'+meta.part+'段）'):'';
  const div=document.createElement('div');
  div.id=uid;
  div.style.cssText='background:#fef3c7;border:1px solid #d97706;border-radius:12px;padding:14px 16px;margin:0 0 16px;font-family:\'Noto Sans TC\',sans-serif;color:#78350f;';
  div.innerHTML='<b>⚠️ 偵測到上次有一段錄影沒存完</b>'+partLabel+'（可能中途關掉了視窗）。共 '+keys.length+' 個片段，點下面救回成檔案：'
    +'<div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap;">'
    +'<button id="'+uid+'Btn" style="background:#b45309;color:#fff;border:none;border-radius:8px;padding:8px 16px;font-weight:700;cursor:pointer;">⬇ 救回並下載</button>'
    +'<button id="'+uid+'Dismiss" style="background:#fff;color:#78350f;border:1px solid #d97706;border-radius:8px;padding:8px 16px;font-weight:700;cursor:pointer;">刪除這段備份</button>'
    +'</div><div id="'+uid+'Msg" style="margin-top:8px;font-size:0.85rem;"></div>';
  host.insertBefore(div, host.firstChild);
  document.getElementById(uid+'Btn').onclick=()=>recRecoverDownload(id, meta, keys, uid+'Msg');
  document.getElementById(uid+'Dismiss').onclick=()=>{ recBackupClear(id); div.remove(); };
}
async function recRecoverDownload(id, meta, keys, msgElId){
  const msg=document.getElementById(msgElId||'recRecoverMsg'); if(msg) msg.textContent='讀取中…';
  try{
    await recOpenDB();
    const parts=[];
    for(const k of keys){
      const rec=await new Promise((res)=>{ const tx=recDB.transaction(REC_STORE,'readonly'); const rq=tx.objectStore(REC_STORE).get(k); rq.onsuccess=()=>res(rq.result); rq.onerror=()=>res(null); });
      if(rec&&rec.blob) parts.push(rec.blob);
    }
    if(!parts.length){ if(msg) msg.textContent='找不到可救回的資料，已清除。'; recBackupClear(id); return; }
    const isVideo=!!(meta&&meta.isVideo);
    const mime=(meta&&meta.mime)||(isVideo?'video/webm':'audio/webm');
    let blob=new Blob(parts,{type:mime});
    // webm 補時長（用片段數×1秒估算）→ 才能正常播放/拖動
    if(/webm/i.test(mime) && window.ysFixWebmDuration){
      try{ blob=await window.ysFixWebmDuration(blob, keys.length*1000, {logger:false}); }catch(e){}
    }
    const ext = isVideo ? (mime.includes('mp4')?'mp4':'webm') : (mime.includes('mp4')?'m4a':(mime.includes('ogg')?'ogg':'webm'));
    const _rNow=new Date(meta&&meta.startTs||Date.now());
    const _rp=new Intl.DateTimeFormat('en-CA',{timeZone:TEACHER_TZ,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}).formatToParts(_rNow);
    const _rg=t=>{const x=_rp.find(p=>p.type===t);return x?x.value:'';};
    let _rhh=_rg('hour'); if(_rhh==='24')_rhh='00';
    const _rTsTH=_rg('year')+'-'+_rg('month')+'-'+_rg('day')+'-'+_rhh+'-'+_rg('minute')+'-'+_rg('second');
    const name='救回_'+(isVideo?'video':'audio')+'_'+_rTsTH+'.'+ext;
    const url=URL.createObjectURL(blob);
    const a=document.createElement('a'); a.href=url; a.download=name; document.body.appendChild(a); a.click(); a.remove();
    if(msg) msg.innerHTML='✅ 已救回（'+(blob.size/1048576).toFixed(1)+' MB）並開始下載。下載確認沒問題後可按「刪除這段備份」清空。';
  }catch(e){ if(msg) msg.textContent='救回失敗：'+(e.message||e); }
}

async function beginRecording(method){
  recEnsureAlertCtx();      // 一定要在這裡（還在使用者點擊的手勢裡）先建立，之後警報聲才播得出來
  recAskNotifyPermission(); // 順便問一次系統通知權限（同意後，切到別的App也看得到警告）
  recMethod=method; recPart=0; recPartCount=0; recNoSysAudio=false;
  recHadData=false; recSessionStart=Date.now();
  const dl=document.getElementById('recDownloads'); if(dl) dl.innerHTML='';
  document.getElementById('recAudioPlayer').style.display='none';
  document.getElementById('recVideoPlayer').style.display='none';
  recSetStatus('準備中…');
  try{
    let finalStream;
    if(method==='mic'){
      recMicStream=await navigator.mediaDevices.getUserMedia({audio:true,video:false});
      finalStream=recMicStream; recIsVideo=false;
    }else{
      recIsVideo=(method==='video');
      recDisplayStream=await navigator.mediaDevices.getDisplayMedia({
        video: recIsVideo ? {frameRate:{ideal:10,max:15}, width:{ideal:1920,max:1920}, height:{ideal:1080,max:1080}} : true,
        audio: { systemAudio: 'include', echoCancellation: false, noiseSuppression: false }
      });
      // Meet 已在 startClassRec（user gesture 同步路徑）開啟，此處不需再呼叫
      recMicStream=await navigator.mediaDevices.getUserMedia({audio:true,video:false});
      const sysTracks=recDisplayStream.getAudioTracks();
      recAudioCtx=new (window.AudioContext||window.webkitAudioContext)();
      const dest=recAudioCtx.createMediaStreamDestination();
      recAudioCtx.createMediaStreamSource(recMicStream).connect(dest);
      const sysOK=sysTracks.length>0;
      if(sysOK) recAudioCtx.createMediaStreamSource(new MediaStream(sysTracks)).connect(dest);
      if(recIsVideo){
        finalStream=new MediaStream([...recDisplayStream.getVideoTracks(), ...dest.stream.getAudioTracks()]);
      }else{
        recDisplayStream.getVideoTracks().forEach(t=>t.stop());
        finalStream=new MediaStream([...dest.stream.getAudioTracks()]);
      }
      recNoSysAudio=!sysOK;
      const vTrack=recDisplayStream.getVideoTracks()[0];
      if(vTrack) vTrack.onended=()=>{ if(recState==='recording') stopRecording(); };
    }
    // 崩潰備份改由 startSegment 每一段各開一份（2026-07-19 修），這裡不再開，避免只有第 1 段有備份
    startSegment(finalStream);
  }catch(err){
    recSetStatus('❌ '+(err.message||err.name||'無法開始錄製'),'');
    cleanupRecStreams();
  }
}

function startSegment(stream, mimeIdx){
  mimeIdx = mimeIdx||0;
  // 依優先順序取出「這台電腦目前真的支援」的格式清單，這次片段用第 mimeIdx 個
  const recMimeCandidates = recIsVideo ? recSupportedVideoMimes() : recSupportedAudioMimes();
  const segMime = recMimeCandidates[mimeIdx] || '';   // 這個片段專用（closure），避免下面 fallback 重啟時被下一段覆蓋掉造成資料/標籤錯亂
  recMime = segMime;   // 仍同步一份全域值，給其他地方（例如崩潰備份標記）讀最新狀態用
  if(recIsVideo && !segMime){ recSetStatus('❌ 此瀏覽器不支援影片錄製，請改用電腦版 Chrome',''); cleanupRecStreams(); return; }
  // （2026-07-19 起改成每段各開一份備份，格式標記在 recBackupStart 當下就寫對了，不用再事後更新）
  const videoBps = recIsHQStudent() ? REC_VIDEO_BPS_HQ : REC_VIDEO_BPS;
  const opts = recIsVideo
    ? {mimeType:segMime||undefined, videoBitsPerSecond:videoBps, audioBitsPerSecond:REC_AUDIO_BPS}
    : {mimeType:segMime||undefined, audioBitsPerSecond:REC_AUDIO_BPS};
  recMR=new MediaRecorder(stream, opts);
  const segChunks=[];   // 這個片段專用的陣列（closure），不是共用全域，才不會被下一段的 startSegment 清空
  let segStartTime;     // 這個片段專用的開始時間（closure），理由同上 —— 算時長要用「這段自己的」開始時間
  recChunks=segChunks; recPart++;
  // 🔒 這一段自己的崩潰備份（每段一份）——滿 1 小時切檔後也會重開，不會有「第 2 段只在 RAM」的空窗
  recBackupStart({ isVideo: recIsVideo, mime: segMime, startTs: Date.now(), student: recActiveStudent||'', part: recPart });
  const segBackupId = recBackupId;   // closure 記住這段的備份 id，上傳成功後只清「這一段」的
  recMR.ondataavailable=e=>{ if(e.data&&e.data.size){ segChunks.push(e.data); recHadData=true; recBackupChunk(e.data); recLastDataTs=Date.now(); recStallLogged=false; } };
  recMR.onerror=ev=>{
    const errName=(ev&&ev.error&&ev.error.name)||'未知';
    // 這個格式的硬體編碼器在這台電腦上啟動失敗（mp4/H.264 常見的已知問題）
    // → 自動換下一個更保險的格式，接著錄下去（已錄到的片段先存檔，不會整堂課黑掉）
    if(errName==='EncodingError' && mimeIdx+1<recMimeCandidates.length){
      const nextMime=recMimeCandidates[mimeIdx+1];
      recSetStatus('⚠️ 錄影格式啟動失敗，已自動切換備用格式繼續錄製'+(nextMime.indexOf('webm')>-1?'（注意：webm 格式 iPhone 無法直接播放，需先下載轉檔）':'')+'','active');
      recLogIssue('encoding_error_fallback', segMime+' 啟動失敗，自動切換到 '+nextMime, {mime:segMime, part:recPart});
      try{ if(recMR.state!=='inactive') recMR.stop(); }catch(e){}
      setTimeout(()=>{ if(recState==='recording') startSegment(stream, mimeIdx+1); }, 300);
      return;
    }
    recLogIssue('encoding_error_fatal', errName+'（'+segMime+'，已無其他備援格式可換）', {mime:segMime, part:recPart});
    recSetStatus('❌ 錄影發生錯誤：'+errName+'　請按停止後重新錄影（已備份的片段仍可救回）','');
    recShowStallWarning('錄影發生錯誤：'+errName+'，請按停止後重新錄影！');
    recPlayAlert(3);
  };
  recMR.onstop=()=>finalizeSegment(segChunks, segMime, segStartTime, segBackupId);
  recMR.start(1000);
  recState='recording';
  recAcquireWakeLock();     // 防止電腦自動休眠中斷錄影
  recStartWatchdog();       // 開始監控：沒資料/分頁被切走太久 → 大聲警告
  clearTimeout(recReminderID); hideRecReminder();   // 已開始錄影 → 取消提醒
  recStartTime=Date.now(); segStartTime=recStartTime;
  recToggleStartBtns(true);
  document.getElementById('recStopBtn').disabled=false;
  const tEl=document.getElementById('recTimer'); if(tEl) tEl.classList.add('visible');
  clearInterval(recTimerID);
  recTimerID=setInterval(()=>{ const e=document.getElementById('recTimer'); if(e) e.textContent=recFmtTime(Math.floor((Date.now()-recStartTime)/1000)); },1000);
  recSetStatus('🔴 錄製中…'+(recIsVideo?'（影片）':'（聲音）')+(recPart>1?'　第'+recPart+'段':'')+(recNoSysAudio?'　⚠️未含對方聲音（請重錄並勾「分享系統音訊」；若沒此選項請更新 Chrome 至 141+）':''),'active');
  if(recIsVideo){
    clearTimeout(recSplitID);
    recSplitID=setTimeout(()=>{ if(recState==='recording') splitSegment(stream); }, REC_SPLIT_MS);
  }
}

// 滿 1 小時：結束目前片段，於同一串流續錄新檔（毋須重新授權）
function splitSegment(stream){
  if(!recMR||recMR.state==='inactive') return;
  // 2026-07-19 修：不要自己重寫成 finalizeSegment()（沒帶參數會去讀共用全域變數，
  // 下一段一開始就把全域蓋掉 → 這段的資料/格式/時長/備份 id 全部會錯甚至變空檔）。
  // 改成「接在原本那個 onstop 後面」，原本的已經帶了這段自己的 chunks/mime/開始時間/備份 id。
  const prevOnStop=recMR.onstop;
  recMR.onstop=()=>{ if(prevOnStop) prevOnStop(); startSegment(stream); };
  recMR.stop();
}
