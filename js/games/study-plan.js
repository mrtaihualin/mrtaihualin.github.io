// js/games/study-plan.js
(function(window,document){
  'use strict';
  var Core=window.StudyPlanCore;
  if(!Core) return;

  var ACCOUNT_KEY='gsh_study_plan_account_v1';
  var GUEST_KEY='gsh_study_plan_guest_v1';
  var PLAN_KEY='gsh_auto_plan_session_v1';
  var PROPOSAL_KEY='gsh_time_plan_proposal_v1';
  var IDLE_MS=3*60*1000;
  var SEGMENT_SECONDS=10*60;
  var saveCounter=0,started=false,paused=false,lastInteraction=Date.now();
  var currentGame=gameFromPath(location.pathname);
  var cachedState=null,cachedStateKey='',timerStarted=false,confirmInFlight=false,initializedOwner=null;

  function safeRead(key,fallback){
    try{var raw=localStorage.getItem(key);return raw?JSON.parse(raw):fallback;}catch(_){return fallback;}
  }
  function safeWrite(key,value){try{localStorage.setItem(key,JSON.stringify(value));}catch(_){}}
  function sessionRead(){try{var x=JSON.parse(sessionStorage.getItem(PLAN_KEY)||'null');return x&&x.active?x:null;}catch(_){return null;}}
  function sessionWrite(v){try{if(v)sessionStorage.setItem(PLAN_KEY,JSON.stringify(v));else sessionStorage.removeItem(PLAN_KEY);}catch(_){}}
  function proposalRead(){try{var x=JSON.parse(sessionStorage.getItem(PROPOSAL_KEY)||'null');return x&&x.version===1?x:null;}catch(_){return null;}}
  function proposalWrite(v){try{if(v)sessionStorage.setItem(PROPOSAL_KEY,JSON.stringify(v));else sessionStorage.removeItem(PROPOSAL_KEY);}catch(_){}}
  function clone(v){return JSON.parse(JSON.stringify(v));}
  function taipeiDay(){
    try{
      var parts=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
      var o={};parts.forEach(function(p){if(p.type!=='literal')o[p.type]=p.value;});
      return o.year+'-'+o.month+'-'+o.day;
    }catch(_){return new Date().toISOString().slice(0,10);}
  }
  function auth(){
    var a=window.SITE_AUTH;
    return {resolved:!!(a&&a.authResolved),user:a&&a.user||null,unavailable:!!(a&&(a.ready===false||a.authError==='unavailable'))};
  }
  function ownerKey(){
    var a=auth();
    return a.user&&a.user.id?ACCOUNT_KEY:GUEST_KEY;
  }
  function ownerIdentity(){
    var a=auth();
    return a.user&&a.user.id?'user:'+a.user.id:'guest';
  }
  function state(){
    var key=ownerKey();
    if(!cachedState||cachedStateKey!==key){
      cachedState=safeRead(key,null);
      cachedStateKey=key;
    }
    var s=cachedState;
    if(!s||typeof s!=='object') s={};
    if(!s.performance) s.performance=Core.emptyPerf();
    if(!s.rotation) s.rotation={order:null,nextIndex:0};
    var day=taipeiDay();
    if(!s.daily||s.daily.day!==day) s.daily={day:day,seconds:0};
    cachedState=s;
    return s;
  }
  function persist(s){
    cachedState=s;
    cachedStateKey=ownerKey();
    safeWrite(cachedStateKey,s);
  }
  function resetStateCache(){cachedState=null;cachedStateKey='';}

  function gameFromPath(path){
    path=String(path||'').split('?')[0].replace(/^\/+/, '/');
    var found=null;
    Object.keys(Core.URLS).some(function(g){
      if(Core.URLS[g]===path){found=g;return true;}return false;
    });
    return found;
  }

  function uuid(){
    if(window.crypto&&window.crypto.randomUUID)return window.crypto.randomUUID();
    var a=new Uint8Array(16);window.crypto.getRandomValues(a);
    a[6]=(a[6]&15)|64;a[8]=(a[8]&63)|128;
    var h=Array.from(a,function(b){return b.toString(16).padStart(2,'0');}).join('');
    return h.slice(0,8)+'-'+h.slice(8,12)+'-'+h.slice(12,16)+'-'+h.slice(16,20)+'-'+h.slice(20);
  }

  function takeNextGame(){
    var s=state(),loggedIn=!!auth().user;
    var n=Core.nextFromRotation(s.rotation,s.performance,loggedIn);
    s.rotation=n.rotation;persist(s);
    return n.game;
  }

  function previewGames(count){
    var s=state(),loggedIn=!!auth().user,rot=JSON.parse(JSON.stringify(s.rotation||{})),out=[];
    for(var i=0;i<count;i++){
      var n=Core.nextFromRotation(rot,s.performance,loggedIn);out.push(n.game);rot=n.rotation;
    }
    return {games:out,rotation:rot};
  }

  function startPlan(minutes){
    var a=auth();
    if(!a.resolved||a.unavailable)return {ok:false,reason:'auth_unavailable'};
    var valid=Core.validateMinutes(minutes,!!a.user);
    if(!valid.ok)return {ok:false,reason:'minutes',min:valid.min,max:valid.max};
    var preview=previewGames(a.user?2:1);
    var proposal={
      version:1,requestId:uuid(),owner:ownerIdentity(),minutes:valid.minutes,
      recommendedItems:preview.games.map(function(game){
        return {game:game,level:Core.defaultLevel(game),selected:true};
      }),
      rotationCheckpoint:preview.rotation
    };
    proposalWrite(proposal);renderProposalUi();
    return {ok:true,proposal:clone(proposal)};
  }

  function updateProposal(game,selected,level){
    var p=proposalRead();if(!p)return false;
    var found=false;
    p.recommendedItems.forEach(function(item){
      if(item.game!==game)return;
      if(typeof selected==='boolean')item.selected=selected;
      if(level!==undefined){var normalized=Core.normalizeLevel(game,level);if(normalized!=null)item.level=normalized;}
      found=true;
    });
    if(found){proposalWrite(p);renderProposalUi();}
    return found;
  }

  function cancelProposal(){if(confirmInFlight)return false;proposalWrite(null);renderProposalUi();setHubMessage('');return true;}

  function selectedProposalItems(proposal){
    var raw=(proposal&&proposal.recommendedItems||[]).filter(function(item){return item&&item.selected;});
    return Core.validateSelectedGames(raw);
  }

  function normalizePlanQueue(plan){
    var raw=Array.isArray(plan&&plan.initialQueue)?plan.initialQueue:plan&&plan.selectedGames;
    var queue=Core.validateSelectedGames(raw);
    if(!queue.ok)return queue;
    var rawIndex=plan&&plan.initialIndex;
    if(rawIndex==null)rawIndex=plan&&plan.currentIndex;
    var index=Math.max(0,Math.floor(Number(rawIndex)||0));
    var phase=((plan&&plan.phase==='rotation')||index>=queue.items.length)?'rotation':'initial';
    if(phase==='rotation')index=queue.items.length;
    return {ok:true,items:queue.items,index:index,phase:phase,item:phase==='initial'?queue.items[index]:null};
  }

  function endPlan(reason){
    var p=sessionRead();if(!p)return;
    p.active=false;p.reason=reason||'ended';
    sessionWrite(null);
    renderPlanUi();
  }

  function tokenForQuota(){
    var client=window.getSupabaseClient?window.getSupabaseClient():null;
    var a=auth();
    if(a.user&&client&&client.auth&&client.auth.getSession){
      return client.auth.getSession().then(function(r){
        return r&&r.data&&r.data.session?r.data.session.access_token:null;
      }).catch(function(){return null;});
    }
    var cfg=window.SUPABASE_CONFIG||{};
    return Promise.resolve(cfg.anonKey||null);
  }

  function commitQuota(plan){
    if(!plan||plan.quotaCommitted)return Promise.resolve({allowed:true});
    var cfg=window.SUPABASE_CONFIG||{};
    return tokenForQuota().then(function(token){
      if(!cfg.url||!cfg.anonKey||!token)return {allowed:false,reason:'service_error'};
      return fetch(cfg.url+'/functions/v1/time-plan-daily-limit',{
        method:'POST',
        headers:{'Content-Type':'application/json',apikey:cfg.anonKey,Authorization:'Bearer '+token},
        body:JSON.stringify({request_id:plan.requestId})
      }).then(function(res){
        return res.json().catch(function(){return{};}).then(function(body){
          if(res.ok&&body&&body.allowed===true)return {allowed:true};
          if(res.status===429||body.reason==='limit')return {allowed:false,reason:'limit'};
          return {allowed:false,reason:'service_error'};
        });
      }).catch(function(){return {allowed:false,reason:'service_error'};});
    });
  }

  function confirmProposal(){
    if(confirmInFlight)return Promise.resolve({ok:false,reason:'in_flight'});
    var proposal=proposalRead(),a=auth();
    if(!proposal||!a.resolved||a.unavailable||proposal.owner!==ownerIdentity()){
      setHubMessage('目前無法開始安排，請稍後再試。');
      return Promise.resolve({ok:false,reason:'auth_unavailable'});
    }
    var selected=selectedProposalItems(proposal);
    if(!selected.ok){setHubMessage('請至少選擇一個遊戲。');renderProposalUi();return Promise.resolve({ok:false,reason:'selection'});}
    confirmInFlight=true;renderProposalUi();setHubMessage('');
    var requestId=proposal.requestId;
    return commitQuota(proposal).then(function(q){
      var live=proposalRead();
      if(!live||live.requestId!==requestId||live.owner!==ownerIdentity()){
        setHubMessage('目前無法開始安排，請稍後再試。');
        return {ok:false,reason:'auth_unavailable'};
      }
      if(!q.allowed){
        setHubMessage(q.reason==='limit'?'今天的自動安排已使用 1 次。':'目前無法開始安排，請稍後再試。');
        return {ok:false,reason:q.reason};
      }
      var s=state();s.rotation=clone(live.rotationCheckpoint);persist(s);
      var first=selected.items[0];
      var plan={
        version:2,active:true,requestId:live.requestId,quotaCommitted:true,
        owner:live.owner,targetMinutes:live.minutes,initialQueue:selected.items,
        initialIndex:0,phase:'initial',currentGame:first.game,segmentSeconds:0,roundInProgress:false,
        atBoundary:false,systemNavigation:true,startedAt:Date.now()
      };
      sessionWrite(plan);proposalWrite(null);location.href=Core.URLS[first.game];
      return {ok:true,plan:clone(plan)};
    }).finally(function(){confirmInFlight=false;renderProposalUi();});
  }

  function ensurePlanOnGame(){
    var p=sessionRead();
    if(!p||!currentGame)return;
    var identity=ownerIdentity();
    var queue=normalizePlanQueue(p),expected=queue.ok&&(queue.item?queue.item.game:Core.normalizeGameType(p.currentGame));
    if(p.version!==2||!p.quotaCommitted||p.owner!==identity||!queue.ok||!expected||expected!==currentGame||p.currentGame!==currentGame){
      endPlan('identity_or_navigation_mismatch');
      location.replace('/games.html?time_plan=service_error');
      return;
    }
    p.initialQueue=queue.items;p.initialIndex=queue.index;p.phase=queue.phase;
    delete p.selectedGames;delete p.currentIndex;
    p.systemNavigation=false;sessionWrite(p);renderPlanUi();
  }

  function advance(reason){
    var p=sessionRead();if(!p||!p.active)return;
    var queue=normalizePlanQueue(p);if(!queue.ok){endPlan('invalid_selection');return;}
    p.initialQueue=queue.items;delete p.selectedGames;delete p.currentIndex;
    var next;
    if(queue.phase==='initial'&&queue.index+1<queue.items.length){
      p.phase='initial';p.initialIndex=queue.index+1;next=queue.items[p.initialIndex].game;
    }else{
      p.phase='rotation';p.initialIndex=queue.items.length;next=takeNextGame();
    }
    p.currentGame=next;p.segmentSeconds=0;p.roundInProgress=false;p.atBoundary=false;
    p.systemNavigation=true;p.advanceReason=reason||'segment';sessionWrite(p);
    location.href=Core.URLS[next];
  }

  function skip(){advance('skip');}

  function preferredLevel(game){
    var p=sessionRead();if(!p||p.version!==2||!p.quotaCommitted||p.currentGame!==game)return null;
    var queue=normalizePlanQueue(p),item=queue.ok&&queue.item;
    return item&&item.game===game?item.level:null;
  }

  function recordReport(report){
    var a=auth();
    // Weakness personalization is Login Free only. Guest stays on persistent default rotation.
    if(!a.user)return;
    var rows=Core.normalizeReport(report);
    if(!rows.length)return;
    var s=state();s.performance=Core.applyContributions(s.performance,rows);persist(s);
  }

  function onRoundStart(){
    started=true;paused=false;lastInteraction=Date.now();
    var p=sessionRead();if(p&&p.active){p.roundInProgress=true;p.atBoundary=false;sessionWrite(p);}
    renderPlanUi();
  }
  function onRoundComplete(ev){
    started=true;lastInteraction=Date.now();
    var report=ev&&ev.detail&&ev.detail.report;
    if(report)recordReport(report);
    var p=sessionRead();
    if(p&&p.active){
      p.roundInProgress=false;p.atBoundary=true;sessionWrite(p);
      if(Number(p.segmentSeconds||0)>=SEGMENT_SECONDS)advance('round_complete');
    }
    renderPlanUi();
  }

  function activeNow(){
    return started&&!paused&&!document.hidden&&(Date.now()-lastInteraction<IDLE_MS);
  }

  function tick(){
    var s=state();
    if(activeNow()){
      s.daily.seconds=Math.max(0,Number(s.daily.seconds)||0)+1;
      var p=sessionRead();
      if(p&&p.active&&p.quotaCommitted){
        p.segmentSeconds=Math.max(0,Number(p.segmentSeconds)||0)+1;
        sessionWrite(p);
        if(p.segmentSeconds>=SEGMENT_SECONDS&&p.atBoundary&&!p.roundInProgress){persist(s);advance('boundary_due');return;}
      }
      saveCounter++;if(saveCounter>=10){saveCounter=0;persist(s);}
    }
    renderPlanUi(s);
  }

  function interact(event){
    lastInteraction=Date.now();
    var t=event&&event.target;
    if(t&&t.closest&&t.closest('[data-game-result-replay="v1"],.lg-restart-btn')){
      var p=sessionRead();if(p&&p.active){p.atBoundary=false;p.roundInProgress=true;sessionWrite(p);}
    }
  }

  function renderPlanUi(s){
    if(!currentGame)return;
    var host=document.getElementById('gsh-study-plan-status');
    if(!host){
      host=document.createElement('div');host.id='gsh-study-plan-status';
      host.style.cssText='position:fixed;right:12px;bottom:78px;z-index:2500;background:#fffaf0;border:1px solid #C8973A;border-radius:12px;padding:8px 10px;font:700 12px "Noto Sans TC",sans-serif;color:#5a3e10;box-shadow:0 3px 12px rgba(0,0,0,.12);display:flex;gap:8px;align-items:center;flex-wrap:wrap;max-width:min(92vw,420px)';
      document.body.appendChild(host);
    }
    s=s||state();
    var p=sessionRead();
    var html='<span>今日練習時間 '+Core.formatSeconds(s.daily.seconds)+'</span>';
    if(p&&p.active){
      html+='<span>・本遊戲 '+Core.formatSeconds(p.segmentSeconds)+' / 約 10:00</span>';
      html+='<button type="button" id="gsh-auto-plan-skip" style="border:1px solid #8B6310;background:#fff;color:#8B6310;border-radius:999px;padding:4px 8px;font:inherit;cursor:pointer">跳過這個遊戲</button>';
    }
    host.innerHTML=html;
    var b=document.getElementById('gsh-auto-plan-skip');if(b)b.onclick=skip;
  }

  function escapeHtml(value){
    return String(value==null?'':value).replace(/[&<>"']/g,function(ch){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch];});
  }

  function setHubMessage(text){var msg=document.getElementById('timePlanMessage');if(msg)msg.textContent=text||'';}

  function renderProposalUi(){
    var host=document.getElementById('timePlanProposal'),list=document.getElementById('timePlanProposalList');
    var confirm=document.getElementById('timePlanConfirm'),cancel=document.getElementById('timePlanCancel');
    var build=document.getElementById('timePlanBtn');if(!host||!list||!confirm)return;
    if(build)build.disabled=confirmInFlight||!auth().resolved||auth().unavailable;
    if(cancel)cancel.disabled=confirmInFlight;
    var p=proposalRead();
    if(!p){host.hidden=true;list.innerHTML='';confirm.disabled=true;return;}
    host.hidden=false;
    list.innerHTML=(p.recommendedItems||[]).map(function(item){
      var title=Core.GAME_TITLES[item.game]||item.game,options=Core.levelOptions(item.game),checked=item.selected?' checked':'';
      var levelControl='';
      if(options.length===1){
        levelControl='<span class="time-plan-fixed-level">'+escapeHtml(options[0].label)+'</span>';
      }else{
        levelControl='<select class="time-plan-level" data-plan-level="'+escapeHtml(item.game)+'" aria-label="'+escapeHtml(title)+'等級"'+(item.selected&&!confirmInFlight?'':' disabled')+'>'+
          options.map(function(option){return '<option value="'+escapeHtml(option.value)+'"'+(option.value===item.level?' selected':'')+'>'+escapeHtml(option.label)+'</option>';}).join('')+'</select>';
      }
      return '<div class="time-plan-proposal-row"><label class="time-plan-game-choice"><input type="checkbox" data-plan-game="'+escapeHtml(item.game)+'" aria-label="選擇'+escapeHtml(title)+'"'+checked+(confirmInFlight?' disabled':'')+'> <span>'+escapeHtml(title)+'</span></label>'+levelControl+'</div>';
    }).join('');
    confirm.disabled=confirmInFlight||!(p.recommendedItems||[]).some(function(item){return item.selected;});
  }

  function showHubResult(){
    var msg=document.getElementById('timePlanMessage');if(!msg)return;
    var reason='';
    try{reason=new URL(location.href).searchParams.get('time_plan')||'';}catch(_){}
    if(reason==='limit')msg.textContent='今天的自動安排已使用 1 次。';
    else if(reason)msg.textContent='目前無法開始安排，請稍後再試。';
  }

  function bindTimePlanUi(){
    var input=document.getElementById('timePlanMinutes'),btn=document.getElementById('timePlanBtn'),msg=document.getElementById('timePlanMessage');
    var list=document.getElementById('timePlanProposalList'),confirm=document.getElementById('timePlanConfirm'),cancel=document.getElementById('timePlanCancel');
    if(!input||!btn)return;
    function paint(){
      var a=auth();
      btn.disabled=!a.resolved||a.unavailable;
      if(!a.resolved)return;
      input.min=5;input.max=a.user?20:10;
      var hint=document.getElementById('timePlanHint');
      if(hint)hint.textContent=a.user?'登入會員：每天 1 次・5–20 分鐘':'訪客：每天 1 次・5–10 分鐘';
    }
    paint();showHubResult();renderProposalUi();
    if(window.SITE_AUTH&&SITE_AUTH.onChange)SITE_AUTH.onChange(paint);
    btn.onclick=function(){
      var r=startPlan(input.value);
      if(!r.ok&&msg)msg.textContent=r.reason==='minutes'?'請輸入 '+r.min+'–'+r.max+' 分鐘':'目前無法開始安排，請稍後再試。';
      else if(r.ok)setHubMessage('');
    };
    if(list)list.onchange=function(event){
      var target=event&&event.target;if(!target||!target.getAttribute)return;
      var game=target.getAttribute('data-plan-game');
      if(game)updateProposal(game,!!target.checked);
      var levelGame=target.getAttribute('data-plan-level');
      if(levelGame)updateProposal(levelGame,undefined,target.value);
    };
    if(confirm)confirm.onclick=function(){confirmProposal();};
    if(cancel)cancel.onclick=cancelProposal;
  }

  function initializeGame(){
    var a=auth();if(!currentGame||!a.resolved)return;
    var identity=ownerIdentity();
    if(initializedOwner!==identity){resetStateCache();initializedOwner=identity;}
    ensurePlanOnGame();
    renderPlanUi();
    if(!timerStarted){timerStarted=true;setInterval(tick,1000);}
  }

  window.addEventListener('gsh:round-start',onRoundStart);
  window.addEventListener('gsh:round-complete',onRoundComplete);
  window.addEventListener('gsh:study-pause',function(){paused=true;});
  window.addEventListener('gsh:study-resume',function(){paused=false;lastInteraction=Date.now();});
  ['pointerdown','keydown','touchstart','input'].forEach(function(type){document.addEventListener(type,interact,true);});
  document.addEventListener('visibilitychange',function(){lastInteraction=Date.now();});
  window.addEventListener('pagehide',function(){if(cachedState)persist(cachedState);});

  // Manual game switch ends Auto Plan. System navigation never clicks a link.
  document.addEventListener('click',function(e){
    var p=sessionRead();if(!p||!p.active)return;
    var a=e.target&&e.target.closest?e.target.closest('a[href]'):null;if(!a)return;
    try{
      var u=new URL(a.href,location.href),g=gameFromPath(u.pathname);
      if(g&&g!==currentGame)endPlan('manual_game_switch');
    }catch(_){}
  },true);

  bindTimePlanUi();
  if(currentGame){
    if(window.SITE_AUTH&&SITE_AUTH.onChange)SITE_AUTH.onChange(function(){initializeGame();});
    initializeGame();
  }else if(location.pathname==='/games.html'||location.pathname.endsWith('/games.html')){
    // Returning to hub means the player exited Auto Plan unless this page is preparing a new start.
    if(sessionRead())endPlan('exit_to_games');
  }

  window.StudyPlan={
    start:startPlan,confirm:confirmProposal,cancelProposal:cancelProposal,updateProposal:updateProposal,
    proposal:proposalRead,end:endPlan,skip:skip,state:state,plan:sessionRead,
    preferredLevel:preferredLevel,recordReport:recordReport,advance:advance
  };
})(window,document);
