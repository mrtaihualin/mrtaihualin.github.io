#!/usr/bin/env node
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../js/games/learning-review.js'), 'utf8');
const tick = () => new Promise(resolve => setImmediate(resolve));
const ref = { source: 'game_words', key: 'synthetic@初' };
const snapshot = (state = 'normal', token = 'normal:synthetic') => ({ item_id: 'synthetic-item', content_ref: ref, state, state_token: token, stage: 0, mastered: false });
const packet = game => ({ ok: true, engine_version: 'phase1-login-free-learning-v2', game, level: 1, review_due: [], srs_due: [], regular_or_new: [snapshot()], non_due_srs: [], mastered: [], snapshots: [snapshot()], round_items: [snapshot()] });
function harness(game, invoke, resumeStore = {}) {
  const nodes = new Map();
  const events = [];
  function element() { return { style: {}, children: [], setAttribute() {}, appendChild(child) { this.children.push(child); if (child.id) nodes.set(child.id, child); }, remove() { nodes.delete(this.id); } }; }
  const context = { Promise, Uint8Array, Math, JSON, Object, Array, String, Number, Error, Date, setTimeout, clearTimeout,
    GAME_CONTENT_TIER: 'login', LOGIN_FREE_REVIEW_PUBLIC_ENTRY: true,
    SITE_AUTH: { user: { id: 'synthetic-owner-a' }, learningOwnerEpoch: 1, onChange(fn) { this.change = fn; } },
    crypto: { randomUUID: (() => { let n = 0; return () => 'operation-' + (++n); })() },
    document: { body: element(), createElement: element, getElementById: id => nodes.get(id) },
    CustomEvent: function(type, input) { this.type = type; this.detail = input.detail; },
    dispatchEvent(event) { events.push(event); }, addEventListener() {},
    getSupabaseClient() { return { functions: { invoke(_name, options) { return invoke(options.body); } } }; },
    NetworkGuard: { request(fn) { return Promise.resolve().then(fn); } },
    GameResume: { load(id) { return resumeStore[id] ? JSON.parse(JSON.stringify(resumeStore[id])) : null; }, save(id, state) { resumeStore[id] = JSON.parse(JSON.stringify(state)); } },
  };
  context.window = context;
  vm.runInNewContext(source, context);
  const report = { round_id: 'synthetic-round', game_type: game, difficulty: '初', items: [] };
  return { context, report, api: context.LearningReview, nodes, events, resumeStore,
    async start(options = {}) { await this.api.prime({ game, level: 1, playSetSize: 1 }); return this.api.registerRound({ game, level: 1, report, allItems: [0], idOf: () => 'synthetic', contentRefOf: () => ref, ...options }); },
  };
}
const gameResumeId = game => ({tone:'tone-finder',reading:'reading-game',typing:'typing-game',word_order:'word-order'})[game];
const item = ordinal => ({ key: ref.key, content_ref: ref, ordinal, wrong_count: 0, learning_evidence: { componentWrongCounts: [0] } });
const ack = body => ({ data: { ok: true, operation_id: body.operation_id, to_state: 'srs', snapshot: snapshot('srs', 'committed-token') } });
const suites = [];
function test(name, fn) { suites.push({ name, fn }); }
function scoreHarness(invoke, store = {}) {
  const text = fs.readFileSync(path.join(__dirname,'../js/games/reading-auth.js'),'utf8');
  const helpers = text.slice(text.indexOf('  function saveScore('),text.indexOf('\n  // ── session กลาง:'));
  const context = {Promise,Number,JSON,Object,Error,setTimeout:(fn,ms)=>setTimeout(fn,ms===800?1:ms),clearTimeout,
    publicLoginOnly:false, API:{user:{id:'synthetic-owner-a'}}, ADMIN_EMAIL:'synthetic-admin',pageGame:()=> 'reading',scoreSubmissionId:()=> 'synthetic-submission',
    saveToast(){},console:{warn(){},info(){}},sb:{functions:{invoke(_name,options){return invoke(options.body);}}},
    NetworkGuard:{request:fn=>Promise.resolve().then(fn)},SITE_AUTH:{user:{id:'synthetic-owner-a'},learningOwnerEpoch:1},
    GameResume:{load:id=>store[id]?JSON.parse(JSON.stringify(store[id])):null,save(id,state){store[id]=JSON.parse(JSON.stringify(state));}}
  };
  context.window=context;vm.runInNewContext(helpers,context);
  return {context,store};
}
for (const game of ['tone', 'reading', 'typing', 'word_order']) {
  test(game + ': failure gates Next/Result, retry uses same operation and advances once', async () => {
    let fail = true, advances = 0;
    const requests = [];
    const h = harness(game, body => {
      if (body.action === 'learning_queue') return { data: packet(game) };
      requests.push(JSON.parse(JSON.stringify(body)));
      return fail ? { error: { context: { status: 409, json: async () => ({ error: 'resync_required' }) } } } : ack(body);
    });
    await h.start();
    await assert.rejects(h.api.processItem(h.report, item(1)), /resync_required/);
    assert.equal(await h.api.advance(h.report, () => advances++), false);
    assert.equal(advances, 0);
    const button = h.nodes.get('gsh-learning-save-recovery').children[1];
    fail = false; button.onclick();
    await tick(); await tick();
    assert.equal(advances, 1);
    assert.equal(h.nodes.size, 0);
    assert.equal(new Set(requests.map(row => row.operation_id)).size, 1);
    assert.equal(new Set(requests.map(row => JSON.stringify(row))).size, 1);
  });
  test(game + ': missing snapshot cannot silently pass settle', async () => {
    const p = packet(game); p.snapshots = [];
    const h = harness(game, body => body.action === 'learning_queue' ? { data: p } : ack(body));
    await h.start();
    await assert.rejects(Promise.resolve().then(() => h.api.processItem(h.report, item(1))), /LEARNING_SNAPSHOT_REQUIRED/);
    let advances = 0;
    assert.equal(await h.api.advance(h.report, () => advances++), false);
    assert.equal(advances, 0);
  });
  test(game + ': malformed identity is retained as a blocking failure', async () => {
    const h = harness(game, body => body.action === 'learning_queue' ? { data: packet(game) } : ack(body));
    await h.start();
    await assert.rejects(Promise.resolve().then(() => h.api.processItem(h.report, { ...item(1), key: 'different' })), /CONTENT_REF_IDENTITY_MISMATCH/);
    await assert.rejects(h.api.settle(h.report), /CONTENT_REF_IDENTITY_MISMATCH/);
  });
  test(game + ': old owner cannot send or continue a managed round', async () => {
    let sends = 0, advances = 0;
    const h = harness(game, body => { if (body.action === 'learning_queue') return { data: packet(game) }; sends++; return ack(body); });
    await h.start();
    const pending = h.api.processItem(h.report, item(1));
    h.context.SITE_AUTH.user = { id: 'synthetic-owner-b' };
    await assert.rejects(pending, /LEARNING_OWNER_CHANGED/);
    assert.equal(sends, 0);
    await h.api.advance(h.report, () => advances++).catch(() => {});
    assert.equal(advances, 0);
  });
  test(game + ': commit projection preserves full suffix identity', async () => {
    const h = harness(game, body => body.action === 'learning_queue' ? { data: packet(game) } : ack(body));
    await h.start(); await h.api.processItem(h.report, item(1));
    assert.equal(h.api.snapshot({ game, level: 1, contentRef: ref }).state, 'srs');
    assert.equal(h.api.snapshot({ game, level: 1, contentRef: { ...ref, key: 'synthetic' } }), null);
    assert.equal(h.api.srsRecord({ game, level: 1, contentRef: ref }).stage, 0);
  });
  test(game + ': reload recovers the exact pending request before loading a queue', async () => {
    const store = {}, requests = [];
    const h = harness(game, body => {
      if (body.action === 'learning_queue') return { data: packet(game) };
      requests.push(JSON.parse(JSON.stringify(body)));
      return { error: { context: { status: 503, json: async () => ({ error: 'learning_write_unavailable' }) } } };
    }, store);
    await h.start({ checkpoint() { h.context.GameResume.save(gameResumeId(game), { cur: 1, report: h.report }); } });
    const row = item(1); h.report.items.push(row);
    await assert.rejects(h.api.processItem(h.report, row), /learning_write_unavailable/);
    assert.equal(store[gameResumeId(game)].report.learning_save.jobs.length, 1);
    const order = [];
    const h2 = harness(game, body => { order.push(body.action); if (body.action === 'learning_queue') return {data:packet(game)}; requests.push(body); return ack(body); }, store);
    await h2.api.prime({game,level:1,playSetSize:1});
    assert.deepEqual(order, ['learning_commit','learning_queue']);
    assert.equal(new Set(requests.map(row => JSON.stringify(row))).size, 1);
    assert.equal(store[gameResumeId(game)].cur, 1);
    const restored = store[gameResumeId(game)].report;
    h2.api.registerRound({game,level:1,report:restored,allItems:[0],idOf:()=>ref.key,contentRefOf:()=>ref});
    await h2.api.settle(restored);
    assert.equal(order.filter(action=>action==='learning_commit').length,1);
  });
  test(game + ': result replay waits for score and Played acknowledgements', async () => {
    let scoreOK = false, playedOK = false, advances = 0;
    const h = harness(game, body => body.action === 'learning_queue' ? {data:packet(game)} : ack(body));
    await h.start(); await h.api.processItem(h.report,item(1));
    h.context.READING_AUTH = {settleScore:async()=>{if(!scoreOK)throw new Error('SCORE_SAVE_UNAVAILABLE');return true;}};
    h.context.PracticeEvents = {submitReport:async()=>playedOK};
    assert.equal(await h.api.advanceResult(h.report,()=>advances++),false);
    scoreOK=true;
    assert.equal(await h.api.advanceResult(h.report,()=>advances++),false);
    assert.equal(advances,0);
    playedOK=true;
    assert.equal(await h.api.advanceResult(h.report,()=>advances++),true);
    assert.equal(advances,1);
  });
  test(game + ': duplicate completion and concurrent settle create one operation', async () => {
    let sends = 0;
    const h = harness(game, body => {if(body.action==='learning_queue')return {data:packet(game)};sends++;return ack(body);});
    await h.start();
    await Promise.all([h.api.processItem(h.report,item(1)),h.api.processItem(h.report,item(1)),h.api.settle(h.report),h.api.settle(h.report)]);
    assert.equal(sends,1);
    await assert.rejects(h.api.processItem(h.report,{...item(1),wrong_count:1}),/LEARNING_ATTEMPT_CONFLICT/);
    await assert.rejects(h.api.settle(h.report),/LEARNING_ATTEMPT_CONFLICT/);
  });
}
test('queue response from a former owner cannot hydrate the new owner', async () => {
  let resolve;
  const h = harness('tone', () => new Promise(done => { resolve = done; }));
  const pending = h.api.prime({ game: 'tone', level: 1, playSetSize: 1 });
  await tick();
  h.context.SITE_AUTH.user = { id: 'synthetic-owner-b' };
  h.context.SITE_AUTH.change(h.context.SITE_AUTH.user);
  resolve({ data: packet('tone') });
  await assert.rejects(pending, /LEARNING_OWNER_CHANGED/);
  assert.equal(h.api.snapshot({ game: 'tone', level: 1, contentRef: ref }), null);
});
test('Tone sentence grouping waits for a complete canonical sentence', async () => {
  let commits = 0;
  const h = harness('tone', body => { if (body.action === 'learning_queue') return { data: packet('tone') }; commits++; return ack(body); });
  await h.start({ groupSizeByRef: { 'game_words:synthetic@初': 2 } });
  await h.api.processItem(h.report, item(1));
  assert.equal(commits, 0);
  await h.api.processItem(h.report, item(2));
  assert.equal(commits, 1);
});
test('callback failures do not become a save retry that reruns the callback', async () => {
  const h = harness('tone', body => body.action === 'learning_queue' ? { data: packet('tone') } : ack(body));
  await h.start(); await h.api.processItem(h.report, item(1));
  await assert.rejects(h.api.advance(h.report, () => { throw new Error('synthetic-ui-failure'); }), /synthetic-ui-failure/);
  assert.equal(h.nodes.size, 0);
});
test('failed recovery storage blocks dispatch and continuation', async () => {
  let sends=0;
  const h=harness('tone',body=>{if(body.action==='learning_queue')return {data:packet('tone')};sends++;return ack(body);});
  await h.start({checkpoint(){}});
  await assert.rejects(h.api.processItem(h.report,item(1)),/LEARNING_RECOVERY_STORAGE_UNAVAILABLE/);
  await assert.rejects(h.api.settle(h.report),/LEARNING_RECOVERY_STORAGE_UNAVAILABLE/);
  assert.equal(sends,0);
});
for (const stalled of ['invocation','error body']) test('full timeout bounds a stalled '+stalled,async()=>{
  let sends=0;
  const h=harness('tone',body=>{
    if(body.action==='learning_queue')return {data:packet('tone')};sends++;
    return stalled==='invocation'?new Promise(()=>{}):{error:{context:{status:503,json:()=>new Promise(()=>{})}}};
  });
  h.context.setTimeout=(fn,ms)=>setTimeout(fn,ms===12000||ms===500?5:ms);
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../js/core/network-guard.js'),'utf8'),h.context);
  await h.start();
  await assert.rejects(h.api.processItem(h.report,item(1)),/NETWORK_TIMEOUT/);
  assert.equal(sends,2);
  let advances=0;
  assert.equal(await h.api.advance(h.report,()=>advances++),false);
  assert.equal(advances,0);
  assert.equal(h.nodes.get('gsh-learning-save-recovery').children[1].disabled,undefined);
});
test('Tone group buffer survives reload without prematurely committing a sentence',async()=>{
  const store={};let sends=0;
  const invoke=body=>{if(body.action==='learning_queue')return {data:packet('tone')};sends++;return ack(body);};
  const options={groupSizeByRef:{'game_words:synthetic@初':2}};
  const h=harness('tone',invoke,store);
  await h.start({...options,checkpoint(){h.context.GameResume.save('tone-finder',{index:1,report:h.report});}});
  h.report.items.push(item(1));await h.api.processItem(h.report,item(1));
  const h2=harness('tone',invoke,store);await h2.api.prime({game:'tone',level:1,playSetSize:1});
  const report=store['tone-finder'].report;
  h2.api.registerRound({report,game:'tone',level:1,allItems:[0],idOf:()=>ref.key,contentRefOf:()=>ref,...options});
  assert.equal(sends,0);await h2.api.processItem(report,item(2));assert.equal(sends,1);
});
test('Tone sentence skip never invents a score from incomplete evidence',async()=>{
  let sends=0;const h=harness('tone',body=>{if(body.action==='learning_queue')return {data:packet('tone')};sends++;return ack(body);});
  await h.start({groupSizeByRef:{'game_words:synthetic@初':2}});
  await h.api.processItem(h.report,item(1));await h.api.processItem(h.report,{...item(2),is_skipped:true});
  await h.api.settle(h.report);assert.equal(sends,0);
});
test('score failure/reload preserves payload and submission identity',async()=>{
  const report={round_id:'synthetic-round',game_type:'reading'},store={'reading-game':{cur:1,report}};
  const requests=[];
  const h=scoreHarness(body=>{requests.push(body);return {error:{context:{status:409}}};},store);
  const submission=h.context.saveScore(10,1,'reading',[],{report,difficulty:'初',items:[{key:ref.key,points:10}],roundBonus:0});
  assert.equal(submission,'synthetic-submission');
  await assert.rejects(h.context.settleScore(report),/SCORE_SAVE_UNAVAILABLE/);
  assert.equal(store['reading-game'].report.score_save.status,'failed');
  const h2=scoreHarness(body=>{requests.push(body);return {data:{ok:true,score:10,total:1}};},store);
  await h2.context.settleScore(store['reading-game'].report);
  assert.equal(store['reading-game'].report.score_save.status,'committed');
  assert.equal(new Set(requests.map(row=>JSON.stringify(row))).size,1);
});
test('score owner switch prevents a late retry or a false acknowledgement',async()=>{
  let resolve,sends=0;
  const report={round_id:'synthetic-round',game_type:'reading'},store={'reading-game':{report}};
  const h=scoreHarness(()=>{sends++;return new Promise(done=>{resolve=done;});},store);
  h.context.saveScore(10,1,'reading',[],{report,difficulty:'初',items:[{key:ref.key,points:10}]});
  const pending=h.context.settleScore(report);await tick();
  h.context.API.user={id:'synthetic-owner-b'};h.context.SITE_AUTH.user=h.context.API.user;
  resolve({data:{ok:true,score:10,total:1}});
  await assert.rejects(pending,/SCORE_OWNER_CHANGED/);
  assert.equal(sends,1);assert.notEqual(report.score_save.status,'committed');
});
test('unassured score recovery storage prevents a provider write',async()=>{
  let sends=0;const report={round_id:'synthetic-round',game_type:'reading'};
  const h=scoreHarness(()=>{sends++;return {data:{ok:true,score:10}};});
  assert.throws(()=>h.context.saveScore(10,1,'reading',[],{report,difficulty:'初',items:[{points:10}]}),/SCORE_RECOVERY_STORAGE_UNAVAILABLE/);
  assert.equal(sends,0);
});
test('RoundReport snapshot and restore retain both recovery journals',()=>{
  const context={module:{exports:{}},Date,Math,JSON,Object,Array,String,Number,Error};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../js/games/round-report.js'),'utf8'),context);
  const api=context.RoundReport;
  const report=api.create({round_id:'synthetic-round',game_type:'reading',learning_save:{version:'synthetic'},score_save:{status:'pending'},learning_exempt:true});
  const restored=api.restore(api.snapshot(report));
  assert.equal(restored.learning_save.version,'synthetic');assert.equal(restored.score_save.status,'pending');assert.equal(restored.learning_exempt,true);
});

for (const game of ['tone','reading','typing','word_order']) test(game+': real Next callback advances one item and reaches result once after save',async()=>{
  let fail=true;
  const h=harness(game,body=>body.action==='learning_queue'?{data:packet(game)}:fail?{error:{context:{status:409,json:async()=>({error:'synthetic-save-unavailable'})}}}:ack(body));
  await h.start();
  const filename={tone:'tone-finder-game',reading:'reading-game-app',typing:'typing-game-app',word_order:'word-order-app'}[game];
  const text=fs.readFileSync(path.join(__dirname,'../js/games/'+filename+'.js'),'utf8');
  let block;
  if(game==='tone')block=text.slice(text.indexOf('function tfAdvanceCommittedWord()'),text.indexOf('// ── Lin 2026-07-04:',text.indexOf('function tfAdvanceCommittedWord()')));
  else if(game==='word_order')block=text.slice(text.indexOf('  window.woNext = function()'),text.indexOf("  document.addEventListener('keydown'",text.indexOf('  window.woNext = function()')));
  else block=text.slice(text.indexOf('function nextWord(){'),text.indexOf('function endRound(){',text.indexOf('function nextWord(){')));
  Object.assign(h.context,{roundReport:h.report,cur:0,idx:0,roundQueue:[0,1],SET:[0,1],session:{index:0,words:[0,1]},isWordPractice:false,practiceMode:false,loads:0,ends:0,
    loadWord(){h.context.loads++;},loadSentence(){h.context.loads++;},tfSetupNextWord(){h.context.loads++;},endRound(){h.context.ends++;},finish(){h.context.ends++;},tfGoToSummary(){h.context.ends++;},tfResetGuideForNextUnit(){},tfResetWordScoring(){},tfSaveResumeState(){},tgSaveResume(){},woSaveResume(){}});
  vm.runInNewContext(block,h.context);
  const next=game==='tone'?()=>h.api.advance(h.report,h.context.tfAdvanceCommittedWord):game==='word_order'?h.context.woNext:h.context.nextWord;
  await assert.rejects(h.api.processItem(h.report,item(1)),/synthetic-save-unavailable/);
  next();next();await tick();await tick();
  assert.equal(h.context.loads,0);assert.equal(h.context.ends,0);
  fail=false;h.nodes.get('gsh-learning-save-recovery').children[1].onclick();await tick();await tick();
  assert.equal(h.context.loads,1);assert.equal(h.context.ends,0);
  await h.api.processItem(h.report,item(2));next();next();await tick();await tick();
  assert.equal(h.context.loads,1);assert.equal(h.context.ends,1);
});
for (const game of ['tone','reading','typing','word_order']) test(game+': actual Result capture defers replay and clears only acknowledged round',async()=>{
  const h=harness(game,body=>body.action==='learning_queue'?{data:packet(game)}:ack(body));
  await h.start();
  let releaseScore,replays=0,clears=0;
  h.context.READING_AUTH={settleScore:()=>new Promise(done=>{releaseScore=done;})};h.context.PracticeEvents={submitReport:async()=>true};
  const id=gameResumeId(game);h.context.GameResume.save(id,{report:h.report});h.context.GameResume.clear=key=>{clears++;delete h.resumeStore[key];};
  h.context.RoundReport={snapshot:report=>JSON.parse(JSON.stringify(report))};
  const root={addEventListener(_name,fn){this.capture=fn;}};
  const options={report:h.report};Object.assign(h.context,{root,options});
  const flow=fs.readFileSync(path.join(__dirname,'../js/games/game-flow.js'),'utf8');
  vm.runInNewContext(flow.slice(flow.indexOf('      if (window.LearningReview && LearningReview.runtimeEnabled'),flow.indexOf('      // P1-D-05:')),h.context);
  const control={closest(){return this;},click(){let stopped=false;root.capture({target:this,preventDefault(){},stopImmediatePropagation(){stopped=true;}});if(!stopped)replays++;}};
  control.click();control.click();await tick();assert.equal(replays,0);assert.equal(clears,0);
  releaseScore(true);await tick();await tick();assert.equal(replays,1);assert.equal(clears,1);
  h.context.SITE_AUTH.user={id:'synthetic-owner-b'};h.context.SITE_AUTH.change(h.context.SITE_AUTH.user);control.click();await tick();await tick();assert.equal(replays,1);
});
test('journal verification also blocks storage failure immediately before dispatch',async()=>{
  let sends=0;const h=harness('reading',body=>{if(body.action==='learning_queue')return {data:packet('reading')};sends++;return ack(body);});
  await h.start({checkpoint(){h.context.GameResume.save('reading-game',{report:h.report});h.context.GameResume.save=()=>{};}});
  await assert.rejects(h.api.processItem(h.report,item(1)),/LEARNING_RECOVERY_STORAGE_UNAVAILABLE/);assert.equal(sends,0);
});

(async () => {
  let failed = 0;
  for (const suite of suites) {
    let deadline;
    try {
      await Promise.race([suite.fn(), new Promise((_, reject) => { deadline = setTimeout(() => reject(new Error('synthetic suite did not settle')), 5000); })]);
      console.log('PASS ' + suite.name);
    }
    catch (error) { failed++; console.error('FAIL ' + suite.name + ': ' + error.message); }
    finally { clearTimeout(deadline); }
  }
  console.log(`GAME_SAVE_CONTINUATION ${suites.length - failed}/${suites.length}`);
  process.exitCode = failed ? 1 : 0;
})();
