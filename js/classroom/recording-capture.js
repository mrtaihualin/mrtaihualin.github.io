
// FILE MAP: finalize/save segment → recording stop/result handling → stream cleanup
async function finalizeSegment(chunksArg, mimeArg, startTimeArg, backupIdArg){
  // 用呼叫端傳進來的 chunks/mime/開始時間（該片段自己的 closure），不要讀共用全域變數 ——
  // 因為格式自動切換是非同步重啟下一段，全域 recChunks/recMime/recStartTime 這時可能已經被下一段覆寫掉了，
  // 讀共用全域會有把「這段」的資料/格式標籤/時長跟「下一段」搞混、甚至存到空陣列（資料憑空消失）的風險
  const chunks = chunksArg || recChunks;
  const durMs = Math.max(0, Date.now() - (startTimeArg||recStartTime));  // 必須先算（split 會重設 recStartTime）
  const mime = mimeArg || recMime || (recIsVideo?'video/webm':'audio/webm');
  let blob=new Blob(chunks,{type:mime});
  if(!blob.size) return;
  // webm 補時長 → 存檔/上雲端後可正常顯示長度並拖動（mp4 不需要）
  // 2026-07-19：補時長要把整個檔讀進記憶體一次。改成一堂課一個檔之後檔案變大，
  // 超過 1.5 GB（3 小時的上限錄滿也還不到，正常上課不可能）就跳過，寧可少了「時長」標記，
  // 也不要冒著整個分頁記憶體爆掉的風險——檔案本身還是完整的，轉成 mp4 後時長就會正常。
  const FIX_DURATION_MAX = 1.5 * 1024 * 1024 * 1024;
  if(/webm/i.test(blob.type) && window.ysFixWebmDuration && durMs>0 && blob.size<=FIX_DURATION_MAX){
    try { blob = await window.ysFixWebmDuration(blob, durMs, { logger:false }); } catch(e){}
  }
  recPartCount++;
  const isVideo=recIsVideo;
  const ext = isVideo ? (mime.includes('mp4')?'mp4':'webm')
                      : (mime.includes('mp4')?'m4a':(mime.includes('ogg')?'ogg':'webm'));
  const url=URL.createObjectURL(blob);
  const player=document.getElementById(isVideo?'recVideoPlayer':'recAudioPlayer');
  player.src=url; player.style.display='block';
  document.getElementById('recOutSection').classList.add('visible');
  const sizeMB=(blob.size/1048576).toFixed(1);
  const prefix = isVideo?'video':'audio';
  const _now=new Date();
  const _p=new Intl.DateTimeFormat('en-CA',{timeZone:TEACHER_TZ,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}).formatToParts(_now);
  const _g=t=>{const x=_p.find(p=>p.type===t);return x?x.value:'';};
  let _hh=_g('hour'); if(_hh==='24')_hh='00';
  const _tsTH=_g('year')+'-'+_g('month')+'-'+_g('day')+'-'+_hh+'-'+_g('minute')+'-'+_g('second');
  const name=prefix+'_'+_tsTH+(recPartCount>1?'_part'+recPartCount:'')+'.'+ext;
  const a=document.createElement('a');
  a.href=url; a.download=name; a.className='btn btn-download';
  a.style.cssText='width:100%;justify-content:center;margin-top:8px;display:flex;';
  a.textContent='⬇ 下載'+(isVideo?'影片':'聲音')+'（'+sizeMB+' MB）'+(recPartCount>1?'·第'+recPartCount+'段':'');
  document.getElementById('recDownloads').appendChild(a);
  // 若此次錄影綁定了學生 → 自動上傳到該生的 Google Drive 資料夾
  if(recActiveStudent){
    const upRow=document.createElement('div');
    upRow.style.cssText='font-size:0.8rem;color:var(--ink-muted);margin-top:6px;font-family:\'Noto Sans TC\',sans-serif;';
    upRow.textContent='☁️ 準備上傳到雲端…';
    document.getElementById('recDownloads').appendChild(upRow);
    autoUploadRecording(blob, name, recActiveStudent, sizeMB, recPartCount, upRow, recActiveFolder||'影片', backupIdArg);
  }
}

// 2026-07-11：錄影上傳中的旗標，跟 beforeunload 掛勾（見上方 uploadInProgress 的同一顆監聽器），
// 上傳影片途中關分頁一樣要跳出警告，避免整堂錄影傳到一半就不見（RELIABILITY FIRST）
let recUploadInProgress = false;
async function autoUploadRecording(blob, fileName, token, sizeMB, part, statusEl, folder, backupId){
  folder = folder || '影片';
  const s=(typeof studentsCache!=='undefined' && studentsCache[token])?studentsCache[token]:{name:token};
  const setMsg=(t)=>{ if(statusEl) statusEl.textContent=t; };
  recUploadInProgress = true;
  try{
    setMsg('☁️ 連線 Google Drive…（首次會跳出 Google 授權）');
    const stuFolderId=await gdGetStudentSubfolderId(s.name||token, folder);
    setMsg('☁️ 上傳中（'+sizeMB+' MB）…請勿關閉分頁');
    const up=await gdUpload(blob, fileName, stuFolderId);
    await gdShareAnyone(up.id);
    const link=up.webViewLink||('https://drive.google.com/file/d/'+up.id+'/view');
    await saveRecordingLink(token, fileName, up.id, link, sizeMB, part);
    try { await ensureStudentFolderShared(s.name||token, token); } catch(e) {}
    if(statusEl) statusEl.innerHTML='✅ 已上傳到「'+escHtml(s.name||token)+' / '+escHtml(folder)+'」　<a href="'+escHtml(safeHref(link))+'" target="_blank" rel="noopener" style="color:var(--amber-dark);font-weight:700;">開啟</a>';
    // Drive 上傳成功 → 現在才安全清掉「這一段」的 IDB 崩潰備份
    // ⚠️ 一定要指名 backupId：不指名會清到「目前正在錄的那一段」，第 2 段之後就變成完全沒備份（2026-07-19 修）
    try { if(backupId) await recBackupClear(backupId); } catch(e) {}
  }catch(err){
    recLogIssue('upload_fail', (err&&(err.message||err))||'未知錯誤', {part:part});
    setMsg('⚠️ 自動上傳失敗：'+(err.message||err)+'（已保留上方下載按鈕，可手動存檔）');
    recShowStallWarning('自動上傳到雲端失敗：'+(err.message||err)+'（檔案還在，可用上方下載按鈕手動存檔）');
    recPlayAlert(2);
    // ⚠️ 不清 IDB → 讓使用者下次開頁面仍可從「救回」banner 救回
  }finally{
    recUploadInProgress = false;
  }
}

function stopRecording(){
  clearTimeout(recSplitID); recSplitID=null;
  clearInterval(recTimerID); recTimerID=null;
  const tEl=document.getElementById('recTimer'); if(tEl) tEl.classList.remove('visible');
  recState='idle';
  recStopWatchdog();
  recReleaseWakeLock();
  // 2026-07-19 修 2 點：
  //  (1) 不再自己蓋成 finalizeSegment()（沒帶參數＝讀共用全域，資料/格式/備份 id 會錯）→ 接在原本的 onstop 後面
  //  (2) cleanupRecStreams()（關鏡頭/麥克風）要等 onstop 跑完才做，
  //      原本在 stop() 之後馬上關，最後一秒的資料有機會被切掉
  if(recMR && recMR.state!=='inactive'){
    const prevOnStop=recMR.onstop;
    recMR.onstop=async ()=>{ try{ if(prevOnStop) await prevOnStop(); }finally{ cleanupRecStreams(); recAfterStop(); } };
    recMR.stop();
  } else { cleanupRecStreams(); recAfterStop(); }
  recToggleStartBtns(false);
  document.getElementById('recStopBtn').disabled=true;
}
// 停止後才判斷成敗 —— 真的有錄到才說「完成」，0 位元組大聲示警，絕不假裝成功
function recAfterStop(){
  if(recHadData){
    recSetStatus('✅ 錄製完成，可預覽或下載','done');
    // 無綁定學生 → 手動下載即備份，立即清掉 IDB
    // 有綁定學生 → 等 Drive 上傳成功後才清（由 autoUploadRecording 負責）
    if(!recActiveStudent) recBackupClearAll();   // 清全部段（不是只有最後一段）
  }else{
    recLogIssue('zero_bytes', '整堂錄影結束後完全沒有任何資料（0 位元組）');
    recSetStatus('❌ 這次完全沒有錄到內容（0 位元組）！請立即重新錄影。','');
    recShowStallWarning('這次完全沒有錄到內容（0 位元組），請立即重新錄影！');
    recPlayAlert(3);
  }
}

function cleanupRecStreams(){
  [recDisplayStream,recMicStream].forEach(s=>{ if(s) s.getTracks().forEach(t=>t.stop()); });
  recDisplayStream=null; recMicStream=null;
  if(recAudioCtx){ try{recAudioCtx.close();}catch(e){} recAudioCtx=null; }
}
