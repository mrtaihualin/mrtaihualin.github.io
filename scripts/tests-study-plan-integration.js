#!/usr/bin/env node
'use strict';

const assert=require('assert');
const fs=require('fs');
const path=require('path');
const vm=require('vm');
const root=path.resolve(__dirname,'..');
const read=rel=>fs.readFileSync(path.join(root,rel),'utf8');
const Core=require(path.join(root,'js/games/study-plan-core.js'));
const planSource=read('js/games/study-plan.js');

let passed=0;
function test(label,fn){
  try{
    const result=fn();
    if(result&&typeof result.then==='function')return result.then(()=>{passed++;console.log('✓ '+label);});
    passed++;console.log('✓ '+label);return Promise.resolve();
  }catch(error){return Promise.reject(new Error(label+': '+error.message));}
}
function response(status,body){return {ok:status>=200&&status<300,status,json:async()=>body};}
function settle(){return new Promise(resolve=>setImmediate(resolve));}
async function settleAll(){for(let i=0;i<8;i++)await settle();}

function storage(backing=new Map()){
  return {
    backing,
    getItem:key=>backing.has(key)?backing.get(key):null,
    setItem:(key,value)=>backing.set(key,String(value)),
    removeItem:key=>backing.delete(key)
  };
}

class FakeElement{
  constructor(id,doc){this.id=id||'';this.doc=doc;this.value='5';this.disabled=false;this.hidden=false;this.checked=false;this.style={};this.textContent='';this.onclick=null;this.onchange=null;this._innerHTML='';}
  set innerHTML(value){
    this._innerHTML=String(value);
    if(this._innerHTML.includes('id="gsh-auto-plan-skip"'))this.doc.elements['gsh-auto-plan-skip']=new FakeElement('gsh-auto-plan-skip',this.doc);
    else delete this.doc.elements['gsh-auto-plan-skip'];
  }
  get innerHTML(){return this._innerHTML;}
  setAttribute(){}
  getAttribute(){return null;}
  closest(){return null;}
}

class FakeDocument{
  constructor(ids){
    this.elements=Object.create(null);this.listeners=Object.create(null);this.hidden=false;this.readyState='complete';
    ids.forEach(id=>{this.elements[id]=new FakeElement(id,this);});
    this.body={appendChild:el=>{if(el.id)this.elements[el.id]=el;}};
  }
  getElementById(id){return this.elements[id]||null;}
  createElement(){return new FakeElement('',this);}
  addEventListener(type,callback){(this.listeners[type]||(this.listeners[type]=[])).push(callback);}
  emit(type,event={}){for(const cb of this.listeners[type]||[])cb(event);}
}

function activePlan(overrides={}){
  return Object.assign({
    version:2,active:true,requestId:'00000000-0000-4000-8000-000000000001',quotaCommitted:true,
    owner:'guest',targetMinutes:5,selectedGames:[{game:'tone',level:1},{game:'reading',level:'初'}],
    currentIndex:0,segmentSeconds:0,currentGame:'tone',roundInProgress:false,
    atBoundary:false,systemNavigation:true,startedAt:1
  },overrides);
}

function harness(options={}){
  const pathname=options.pathname||'/games.html';
  const hub=pathname==='/games.html';
  const doc=new FakeDocument(hub?['timePlanMinutes','timePlanBtn','timePlanHint','timePlanMessage','timePlanProposal','timePlanProposalList','timePlanConfirm','timePlanCancel']:[]);
  const local=options.localStorage||storage();
  const session=options.sessionStorage||storage();
  if(options.plan)session.setItem('gsh_auto_plan_session_v1',JSON.stringify(options.plan));
  const windowListeners=Object.create(null),intervals=[],fetchCalls=[];
  let now=options.now||Date.now();
  class FakeDate extends Date{
    constructor(...args){super(...(args.length?args:[now]));}
    static now(){return now;}
  }
  const authCallbacks=[];
  const auth={
    ready:true,authResolved:options.resolved!==false,authError:null,user:options.user||null,
    onChange(callback){authCallbacks.push(callback);if(this.authResolved)callback(this.user);},
    resolve(user){this.user=user||null;this.authResolved=true;authCallbacks.slice().forEach(cb=>cb(this.user));}
  };
  const loc={
    pathname,href:'https://mrtaihualin.com'+pathname,replaced:'',
    replace(value){this.replaced=value;this.href=value;}
  };
  const mode=options.backend||'allow';
  const mockSessionCredential=['mock','session','credential'].join('-');
  const context={
    console,document:doc,location:loc,localStorage:local,sessionStorage:session,
    StudyPlanCore:Core,SITE_AUTH:auth,Date:FakeDate,Intl,URL,Promise,JSON,Math,Array,Uint8Array,
    SUPABASE_CONFIG:{url:'https://example.supabase.co',anonKey:['public','test','key'].join('-')},
    getSupabaseClient:()=>({auth:{getSession:async()=>({data:{session:auth.user?{user:auth.user,access_token:mockSessionCredential}:null}})}}),
    crypto:{randomUUID:()=> '00000000-0000-4000-8000-000000000099',getRandomValues:array=>array.fill(1)},
    CustomEvent:class{constructor(type,init){this.type=type;this.detail=init&&init.detail;}},
    addEventListener(type,callback){(windowListeners[type]||(windowListeners[type]=[])).push(callback);},
    dispatchEvent(event){for(const cb of windowListeners[event.type]||[])cb(event);return true;},
    setInterval(callback){intervals.push(callback);return intervals.length;},clearInterval(){},setTimeout,clearTimeout,
    fetch:async(url,request)=>{
      fetchCalls.push({url,request,body:JSON.parse(request.body||'{}')});
      if(mode==='error')return response(503,{ok:false,error:'service_error'});
      if(mode==='limit')return response(429,{ok:true,allowed:false,reason:'limit'});
      return response(200,{ok:true,allowed:true,idempotent:false});
    }
  };
  context.window=context;context.self=context;
  vm.runInNewContext(planSource,context,{filename:'study-plan.js'});
  return {
    context,doc,auth,loc,local,session,intervals,fetchCalls,
    setNow:value=>{now=value;},advanceNow:value=>{now+=value;},
    emitWindow:(type,detail)=>context.dispatchEvent(new context.CustomEvent(type,{detail}))
  };
}

async function main(){
  await test('hub keeps Search gate separate and exposes the locked Time Plan UI',()=>{
    const html=read('games.html');
    assert.match(html,/id="gameSearchGate"[\s\S]+id="timePlanTitle">今天有多少時間？/);
    assert.match(html,/id="timePlanMinutes"[\s\S]+分鐘[\s\S]+id="timePlanBtn"[\s\S]+幫我安排/);
    assert.strictEqual((html.match(/id="gameSearchGate"/g)||[]).length,1);
    assert.doesNotMatch(html,/id="gameSearchInput"/);
  });

  await test('all six games load lifecycle listeners before gameplay',()=>{
    const pages={
      'tone-finder.html':'tone-finder-game',
      'reading-game.html':'reading-game-app',
      'listening-game.html':'listening-game-app',
      'typing-game.html':'typing-game-app',
      'word-order.html':'word-order-app',
      'lego.html':'lego-game-app'
    };
    for(const [page,app] of Object.entries(pages)){
      const html=read(page),core=html.indexOf('study-plan-core.js?v=2'),plan=html.indexOf('study-plan.js?v=2'),game=html.lastIndexOf(app);
      assert(core>=0&&plan>core&&game>plan,page+' script order');
    }
  });

  await test('RoundReport emits Core-5 start/complete but excludes Lego print reports',()=>{
    const events=[];
    const context={console,localStorage:storage(),crypto:{randomUUID:()=> '00000000-0000-4000-8000-000000000001'},Uint8Array,Date,Intl,JSON,Math,setTimeout,CustomEvent:class{constructor(type,init){this.type=type;this.detail=init.detail;}},dispatchEvent:event=>events.push(event)};
    context.window=context;
    vm.runInNewContext(read('js/games/round-report.js'),context,{filename:'round-report.js'});
    const report=context.RoundReport.create({game_type:'wordorder'});
    assert.strictEqual(events[0].type,'gsh:round-start');
    context.RoundReport.addItem(report,{content_ref:{key:'x'},is_correct:true,item_score:10});
    context.RoundReport.finish(report,{});
    assert.strictEqual(events[1].type,'gsh:round-complete');
    assert.strictEqual(events[1].detail.report.total_items,1);
    context.RoundReport.create({game_type:'lego'});
    assert.strictEqual(events.length,2);
  });

  await test('Lego lifecycle fires once at actual round start and only at five-sentence completion',()=>{
    const source=read('js/games/lego-game-app.js');
    const start=source.indexOf("legoDispatchStudyRound('gsh:round-start'");
    const quotaAllowed=source.indexOf('if(!quota.ok)');
    const completeGuard=source.indexOf('if(sentencesThisRound<SENTENCES_PER_ROUND)');
    const complete=source.indexOf("legoDispatchStudyRound('gsh:round-complete'");
    assert(start>quotaAllowed);
    assert(complete>completeGuard);
    assert.match(source,/if\(!legoStudyRoundActive\)[\s\S]+gsh:round-start/);
    assert.match(source,/legoStudyRoundActive=false;[\s\S]+gsh:round-complete/);
  });

  await test('Guest and Login minute gates build proposals without quota, active plan, or navigation',()=>{
    const guest=harness();
    assert.strictEqual(guest.doc.getElementById('timePlanBtn').disabled,false);
    assert.match(guest.doc.getElementById('timePlanHint').textContent,/5–10/);
    assert.strictEqual(guest.context.StudyPlan.start(11).ok,false);
    assert.strictEqual(guest.context.StudyPlan.start(10).ok,true);
    assert.strictEqual(guest.fetchCalls.length,0);
    assert.strictEqual(guest.loc.href,'https://mrtaihualin.com/games.html');
    assert.strictEqual(guest.context.StudyPlan.plan(),null);
    assert.strictEqual(guest.context.StudyPlan.proposal().recommendedItems.length,1);
    assert.strictEqual(guest.context.StudyPlan.proposal().recommendedItems[0].level,1);
    assert.strictEqual(guest.doc.getElementById('timePlanProposal').hidden,false);

    const login=harness({user:{id:'account-a'}});
    assert.match(login.doc.getElementById('timePlanHint').textContent,/5–20/);
    assert.strictEqual(login.context.StudyPlan.start(21).ok,false);
    assert.strictEqual(login.context.StudyPlan.start(20).ok,true);
    assert.strictEqual(login.fetchCalls.length,0);
    assert.strictEqual(login.loc.href,'https://mrtaihualin.com/games.html');
    assert.strictEqual(login.context.StudyPlan.plan(),null);
    assert.strictEqual(login.context.StudyPlan.proposal().recommendedItems.length,2);
  });

  await test('confirmation claims quota exactly once on the hub before creating v2 plan and navigating',async()=>{
    const h=harness();
    const before=JSON.stringify(h.context.StudyPlan.state().rotation);
    assert.strictEqual(h.context.StudyPlan.start(5).ok,true);
    const proposal=h.context.StudyPlan.proposal();
    assert.strictEqual(h.fetchCalls.length,0);
    assert.strictEqual(JSON.stringify(h.context.StudyPlan.state().rotation),before);
    const result=await h.context.StudyPlan.confirm();
    assert.strictEqual(result.ok,true);
    assert.strictEqual(h.fetchCalls.length,1);
    assert.deepStrictEqual(Object.keys(h.fetchCalls[0].body),['request_id']);
    assert.strictEqual(h.fetchCalls[0].body.request_id,proposal.requestId);
    assert.match(h.fetchCalls[0].url,/time-plan-daily-limit$/);
    assert.strictEqual(h.loc.href,'/tone-finder.html');
    assert.strictEqual(h.context.StudyPlan.plan().version,2);
    assert.strictEqual(h.context.StudyPlan.plan().quotaCommitted,true);
    assert.strictEqual(h.context.StudyPlan.proposal(),null);
  });

  await test('backend failure on confirmation fails closed on hub and preserves request id for retry',async()=>{
    const h=harness({backend:'error'});
    h.context.StudyPlan.start(5);
    const requestId=h.context.StudyPlan.proposal().requestId;
    const result=await h.context.StudyPlan.confirm();
    assert.strictEqual(result.ok,false);
    assert.strictEqual(h.fetchCalls.length,1);
    assert.strictEqual(h.context.StudyPlan.plan(),null);
    assert.strictEqual(h.loc.href,'https://mrtaihualin.com/games.html');
    assert.strictEqual(h.context.StudyPlan.proposal().requestId,requestId);
    await h.context.StudyPlan.confirm();
    assert.strictEqual(h.fetchCalls[1].body.request_id,requestId);
  });

  await test('daily limit stays on hub with no transient active plan or navigation',async()=>{
    const h=harness({backend:'limit'});
    h.context.StudyPlan.start(5);
    const result=await h.context.StudyPlan.confirm();
    assert.strictEqual(result.reason,'limit');
    assert.strictEqual(h.context.StudyPlan.plan(),null);
    assert.strictEqual(h.loc.href,'https://mrtaihualin.com/games.html');
    assert.match(h.doc.getElementById('timePlanMessage').textContent,/已使用 1 次/);
  });

  await test('cancel and zero-selection validation consume no quota and do not commit rotation',async()=>{
    const h=harness();
    const rotation=JSON.stringify(h.context.StudyPlan.state().rotation);
    h.context.StudyPlan.start(5);
    h.context.StudyPlan.cancelProposal();
    assert.strictEqual(h.context.StudyPlan.proposal(),null);
    assert.strictEqual(JSON.stringify(h.context.StudyPlan.state().rotation),rotation);
    assert.strictEqual(h.fetchCalls.length,0);
    h.context.StudyPlan.start(5);
    const game=h.context.StudyPlan.proposal().recommendedItems[0].game;
    h.context.StudyPlan.updateProposal(game,false);
    assert.strictEqual(h.doc.getElementById('timePlanConfirm').disabled,true);
    const result=await h.context.StudyPlan.confirm();
    assert.strictEqual(result.reason,'selection');
    assert.strictEqual(h.fetchCalls.length,0);
    assert.strictEqual(JSON.stringify(h.context.StudyPlan.state().rotation),rotation);
  });

  await test('confirmation rejects an owner change before quota call',async()=>{
    const h=harness({user:{id:'account-a'}});
    h.context.StudyPlan.start(5);
    h.auth.resolve({id:'account-b'});
    const result=await h.context.StudyPlan.confirm();
    assert.strictEqual(result.reason,'auth_unavailable');
    assert.strictEqual(h.fetchCalls.length,0);
    assert.strictEqual(h.context.StudyPlan.plan(),null);
    assert.strictEqual(h.loc.href,'https://mrtaihualin.com/games.html');
  });

  await test('unchecked recommendations never enter the plan and chosen level is exposed to the game',async()=>{
    const h=harness({user:{id:'account-a'}});
    h.context.StudyPlan.start(20);
    const items=h.context.StudyPlan.proposal().recommendedItems;
    assert.strictEqual(items.length,2);
    h.context.StudyPlan.updateProposal(items[0].game,false);
    h.context.StudyPlan.updateProposal(items[1].game,undefined,'高');
    const result=await h.context.StudyPlan.confirm();
    assert.strictEqual(result.ok,true);
    assert.strictEqual(result.plan.selectedGames.length,1);
    assert.strictEqual(result.plan.selectedGames[0].game,items[1].game);
    assert.strictEqual(result.plan.selectedGames[0].level,'高');
    assert.strictEqual(h.loc.href,Core.URLS[items[1].game]);
    assert.strictEqual(h.context.StudyPlan.preferredLevel(items[1].game),'高');
  });

  await test('Daily Timer counts active foreground seconds, persists pagehide, pauses, idles, and resumes',()=>{
    const h=harness({pathname:'/tone-finder.html',now:1000});
    assert.strictEqual(h.intervals.length,1);
    h.emitWindow('gsh:round-start',{report:{game_type:'tone',items:[]}});
    for(let i=0;i<3;i++){h.advanceNow(1000);h.intervals[0]();}
    assert.strictEqual(h.context.StudyPlan.state().daily.seconds,3);
    h.emitWindow('pagehide');
    assert.strictEqual(JSON.parse(h.local.getItem('gsh_study_plan_guest_v1')).daily.seconds,3);
    h.doc.hidden=true;h.advanceNow(1000);h.intervals[0]();
    assert.strictEqual(h.context.StudyPlan.state().daily.seconds,3);
    h.doc.hidden=false;h.emitWindow('gsh:study-pause');h.advanceNow(1000);h.intervals[0]();
    assert.strictEqual(h.context.StudyPlan.state().daily.seconds,3);
    h.emitWindow('gsh:study-resume');h.advanceNow(1000);h.intervals[0]();
    assert.strictEqual(h.context.StudyPlan.state().daily.seconds,4);
    h.advanceNow(180001);h.intervals[0]();
    assert.strictEqual(h.context.StudyPlan.state().daily.seconds,4);
    h.doc.emit('pointerdown',{target:null});h.advanceNow(1000);h.intervals[0]();
    assert.strictEqual(h.context.StudyPlan.state().daily.seconds,5);
  });

  await test('soft 10-minute segment waits mid-round and advances only at the boundary',async()=>{
    const local=storage();
    local.setItem('gsh_study_plan_guest_v1',JSON.stringify({performance:Core.emptyPerf(),rotation:{order:Core.GAME_ORDER,nextIndex:1},daily:{day:new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei'}).format(new Date()),seconds:0}}));
    const h=harness({pathname:'/tone-finder.html',localStorage:local,plan:activePlan({quotaCommitted:true,segmentSeconds:599})});
    await settleAll();
    h.emitWindow('gsh:round-start',{report:{game_type:'tone',items:[]}});
    h.advanceNow(1000);h.intervals[0]();
    assert.strictEqual(h.context.StudyPlan.plan().segmentSeconds,600);
    assert.strictEqual(h.loc.href,'https://mrtaihualin.com/tone-finder.html');
    h.emitWindow('gsh:round-complete',{report:{game_type:'tone',items:[]}});
    assert.strictEqual(h.loc.href,'/reading-game.html');
    assert.strictEqual(h.context.StudyPlan.plan().segmentSeconds,0);
  });

  await test('rounds below 10 minutes stay, target minutes are not a hard stop, and Skip resets the segment',async()=>{
    const local=storage();
    local.setItem('gsh_study_plan_guest_v1',JSON.stringify({performance:Core.emptyPerf(),rotation:{order:Core.GAME_ORDER,nextIndex:1},daily:{day:new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Taipei'}).format(new Date()),seconds:900}}));
    const h=harness({pathname:'/tone-finder.html',localStorage:local,plan:activePlan({quotaCommitted:true,segmentSeconds:120,targetMinutes:5})});
    await settleAll();
    h.emitWindow('gsh:round-complete',{report:{game_type:'tone',items:[]}});
    assert.strictEqual(h.context.StudyPlan.plan().currentGame,'tone');
    assert.strictEqual(h.context.StudyPlan.state().daily.seconds,900);
    h.context.StudyPlan.skip();
    assert.strictEqual(h.loc.href,'/reading-game.html');
    assert.strictEqual(h.context.StudyPlan.plan().segmentSeconds,0);
  });

  await test('one selected game resets at a soft boundary and Skip ends at the hub',async()=>{
    const plan=activePlan({selectedGames:[{game:'tone',level:3}],segmentSeconds:599});
    const h=harness({pathname:'/tone-finder.html',plan});
    await settleAll();
    assert.strictEqual(h.context.StudyPlan.preferredLevel('tone'),3);
    h.emitWindow('gsh:round-start',{report:{game_type:'tone',items:[]}});
    h.advanceNow(1000);h.intervals[0]();
    h.emitWindow('gsh:round-complete',{report:{game_type:'tone',items:[]}});
    assert.strictEqual(h.loc.href,'https://mrtaihualin.com/tone-finder.html');
    assert.strictEqual(h.context.StudyPlan.plan().segmentSeconds,0);
    h.context.StudyPlan.skip();
    assert.strictEqual(h.loc.href,'/games.html');
    assert.strictEqual(h.context.StudyPlan.plan(),null);
  });

  await test('manual game switch ends Auto Plan',async()=>{
    const h=harness({pathname:'/tone-finder.html',plan:activePlan({quotaCommitted:true})});
    await settleAll();
    h.doc.emit('click',{target:{closest:selector=>selector==='a[href]'?{href:'https://mrtaihualin.com/reading-game.html'}:null}});
    assert.strictEqual(h.context.StudyPlan.plan(),null);
  });

  await test('Login performance uses normalized weakness data while Guest contributes nothing',()=>{
    const report={game_type:'listening',items:[{linguistic:{answer_mode:'type',listening_score:7,typing_score:6}}]};
    const login=harness({pathname:'/listening-game.html',user:{id:'account-a'}});
    login.context.StudyPlan.recordReport(report);
    assert.strictEqual(login.context.StudyPlan.state().performance.listening.totalScore,7);
    assert.strictEqual(login.context.StudyPlan.state().performance.typing.totalScore,6);
    const guest=harness({pathname:'/listening-game.html'});
    guest.context.StudyPlan.recordReport(report);
    assert.strictEqual(guest.context.StudyPlan.state().performance.listening.count,0);
  });

  await test('Time Plan quota is service-only, idempotent, IP-hashed, and separate from Search quota',()=>{
    const sql=read('supabase/sql/2026-08-23_time_plan_daily_usage.sql');
    const edge=read('supabase/functions/time-plan-daily-limit/index.ts');
    const auth=read('js/core/auth-widget.js');
    assert.match(sql,/primary key \(identity_key, day\)/);
    assert.match(sql,/on conflict\(identity_key,day\) do nothing/);
    assert.match(sql,/v_existing=p_request_id/);
    assert.match(sql,/enable row level security/);
    assert.match(sql,/revoke all on table public\.time_plan_daily_usage from public,anon,authenticated/);
    assert.match(sql,/grant execute on function public\.time_plan_consume_daily\(text,date,uuid\) to service_role/);
    assert.match(edge,/service\.auth\.getUser\(token\)/);
    assert.match(edge,/identity='user:'\+data\.user\.id/);
    assert.match(edge,/identity='ip:'\+await hashIp\(clientIp\(req\)\)/);
    assert.doesNotMatch(edge,/user_id/);
    assert.match(edge,/keys\.length!==1\|\|keys\[0\]!==['"]request_id['"]/);
    assert.doesNotMatch(edge,/problem-search-daily-limit/);
    assert.match(auth,/gsh_study_plan_account_v1/);
  });

  console.log(`PASS ${passed} Time Auto Plan integration contracts`);
}

main().catch(error=>{console.error(error.stack||error);process.exit(1);});
