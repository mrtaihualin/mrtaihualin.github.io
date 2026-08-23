#!/usr/bin/env node
'use strict';

const assert=require('assert');
const fs=require('fs');
const path=require('path');
const root=path.resolve(__dirname,'..');
const read=rel=>fs.readFileSync(path.join(root,rel),'utf8');
const Core=require(path.join(root,'js/games/study-plan-core.js'));
let passed=0;
function check(label,fn){fn();passed++;console.log('✓ '+label);}

check('proposal UI copy and controls are present only inside the Time Plan section',()=>{
  const html=read('games.html');
  assert.match(html,/id="timePlanTitle"[\s\S]+id="timePlanProposal"[\s\S]+建議這樣練/);
  assert.match(html,/勾選想玩的遊戲，選好等級後再開始。/);
  assert.match(html,/id="timePlanConfirm"[\s\S]+開始這個安排/);
  assert.match(html,/id="timePlanCancel"[\s\S]+取消/);
  assert.strictEqual((html.match(/id="gameSearchGate"/g)||[]).length,1);
  assert.doesNotMatch(html,/id="gameSearchInput"/);
});

check('locked playable level matrix is exact',()=>{
  assert.deepStrictEqual(Core.levelOptions('tone').map(x=>x.value),[1,2,3]);
  assert.deepStrictEqual(Core.levelOptions('reading').map(x=>x.value),['初','中','高']);
  assert.deepStrictEqual(Core.levelOptions('listening').map(x=>x.value),['初','中']);
  assert.deepStrictEqual(Core.levelOptions('typing').map(x=>x.value),['初','中','高']);
  assert.deepStrictEqual(Core.levelOptions('word_order').map(x=>x.value),['高']);
  assert.deepStrictEqual(Core.levelOptions('lego').map(x=>x.value),['lv1']);
});

check('multi-level defaults are beginner and fixed games use their only level',()=>{
  assert.strictEqual(Core.defaultLevel('tone'),1);
  assert.strictEqual(Core.defaultLevel('reading'),'初');
  assert.strictEqual(Core.defaultLevel('listening'),'初');
  assert.strictEqual(Core.defaultLevel('typing'),'初');
  assert.strictEqual(Core.defaultLevel('word_order'),'高');
  assert.strictEqual(Core.defaultLevel('lego'),'lv1');
});

check('locked and hidden levels fail validation',()=>{
  assert.strictEqual(Core.normalizeLevel('listening','高'),null);
  assert.strictEqual(Core.normalizeLevel('lego','lv2'),null);
  assert.strictEqual(Core.normalizeLevel('lego','lv3'),null);
  assert.strictEqual(Core.normalizeLevel('lego','pre'),null);
});

check('proposal and active plan use separate session keys',()=>{
  const source=read('js/games/study-plan.js');
  assert.match(source,/PROPOSAL_KEY='gsh_time_plan_proposal_v1'/);
  assert.match(source,/PLAN_KEY='gsh_auto_plan_session_v1'/);
});

check('proposal start performs no fetch and no navigation',()=>{
  const source=read('js/games/study-plan.js');
  const start=source.slice(source.indexOf('function startPlan'),source.indexOf('function updateProposal'));
  assert.doesNotMatch(start,/fetch\(/);
  assert.doesNotMatch(start,/location\.(?:href|replace)/);
  assert.doesNotMatch(start,/sessionWrite\(/);
});

check('quota confirmation sends request_id only while still on the hub',()=>{
  const source=read('js/games/study-plan.js');
  assert.match(source,/body:JSON\.stringify\(\{request_id:plan\.requestId\}\)/);
  assert.match(source,/commitQuota\(proposal\)[\s\S]+version:2,active:true/);
  assert.doesNotMatch(source,/body:JSON\.stringify\(\{[^}]*minutes/);
  assert.doesNotMatch(source,/body:JSON\.stringify\(\{[^}]*user_id/);
});

check('active v2 plan stores selected games, levels, and current index',()=>{
  const source=read('js/games/study-plan.js');
  assert.match(source,/version:2,active:true[\s\S]+selectedGames:selected\.items[\s\S]+currentIndex:0/);
});

check('rotation checkpoint commits only in allowed confirmation branch',()=>{
  const source=read('js/games/study-plan.js');
  const confirm=source.slice(source.indexOf('function confirmProposal'),source.indexOf('function ensurePlanOnGame'));
  assert(confirm.indexOf('if(!q.allowed)')<confirm.indexOf('s.rotation=clone(live.rotationCheckpoint)'));
});

check('game page never owns the quota request anymore',()=>{
  const source=read('js/games/study-plan.js');
  const ensure=source.slice(source.indexOf('function ensurePlanOnGame'),source.indexOf('function advance'));
  assert.doesNotMatch(ensure,/commitQuota|fetch\(/);
  assert.match(ensure,/!p\.quotaCommitted/);
});

check('selected-only rotation handles multi-game and single-game paths',()=>{
  const source=read('js/games/study-plan.js');
  assert.match(source,/if\(selected\.items\.length===1\)/);
  assert.match(source,/if\(reason==='skip'\)\{endPlan\('skip_single'\);location\.href='\/games\.html'/);
  assert.match(source,/p\.currentIndex=.*%selected\.items\.length/);
});

check('Tone applies proposal preference before auto-start and suppresses old resume',()=>{
  const source=read('js/games/tone-finder-game.js');
  assert.match(source,/StudyPlan\.preferredLevel\('tone'\)/);
  assert.match(source,/TF\.selectLevel\(__tfAutoPlanLevel \|\| 1\)/);
  assert.match(source,/if \(!__tfAutoPlanLevel && __tfResumeSnapshot\)/);
});

check('Reading applies proposal preference without overwriting remembered preference',()=>{
  const source=read('js/games/reading-game-app.js');
  assert.match(source,/StudyPlan\.preferredLevel\('reading'\)/);
  assert.match(source,/_autoPlanReadingLevel\|\|localStorage\.getItem\('rg_reading_level'\)/);
  assert.match(source,/if\(_autoPlanReadingLevel\|\|!rgTryLoadResumeBanner\(\)\)/);
});

check('Listening accepts only beginner/intermediate Auto Plan preferences',()=>{
  const source=read('js/games/listening-game-app.js');
  assert.match(source,/StudyPlan\.preferredLevel\('listening'\)/);
  assert.match(source,/autoPlanListeningLevel !== '初' && autoPlanListeningLevel !== '中'/);
  assert.match(source,/if \(!autoPlanListeningLevel\) tryShowResumeBanner\(\)/);
});

check('Typing applies proposal preference without overwriting remembered preference',()=>{
  const source=read('js/games/typing-game-app.js');
  assert.match(source,/StudyPlan\.preferredLevel\('typing'\)/);
  assert.match(source,/_autoPlanTypingLevel\|\|localStorage\.getItem\('tg_level'\)/);
  assert.match(source,/if\(!_autoPlanTypingLevel\)\{try\{ tgTryResume\(\)/);
});

check('Search and Time Plan quota backends remain separate',()=>{
  const source=read('js/games/study-plan.js');
  assert.match(source,/time-plan-daily-limit/);
  assert.doesNotMatch(source,/problem-search-daily-limit/);
});

console.log(`PASS ${passed} Time Auto Plan confirmation contracts`);
