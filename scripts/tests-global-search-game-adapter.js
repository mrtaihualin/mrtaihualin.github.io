#!/usr/bin/env node
'use strict';
const path=require('path');
const root=path.resolve(__dirname,'..');
const adapter=require(path.join(root,'js/core/global-search-game-adapter.js'));
function assert(cond,msg){if(!cond)throw new Error(msg);}
function ids(rows){return rows.map(r=>r.entry.id);}
let pass=0;
function ok(name){pass++;console.log('✓ '+name);}

const pool=adapter.nonGamePool();
assert(pool.length>0,'nonGamePool should not be empty');
assert(pool.every(e=>e.category!=='practice'),'generic Global Search pool must exclude practice');
ok('generic public pool excludes every practice/game entry');

let plan=adapter.analyze('聲調');
assert(adapter.gameIntent(plan)==='direct','聲調 must be direct-game intent');
let rows=adapter.related(plan,false);
assert(rows[0]&&rows[0].entry.id==='game-hub'&&rows[0].entry.href==='/games.html','direct game alias must collapse to canonical Game Hub');
assert(rows.every(r=>r.entry.category!=='practice'),'direct game alias must never expose a per-game entry');
ok('direct six-game label reuses GameProblemSearch but exposes Game Hub only');

plan=adapter.analyze('ฟังคนไทยไม่ทัน');
assert(adapter.gameIntent(plan)==='problem','supported natural learner problem must be problem intent');
let guestRows=adapter.related(plan,false);
assert(guestRows[0]&&guestRows[0].entry.id==='game-hub','problem intent must expose canonical Game Hub');
assert(guestRows.every(r=>r.entry.category!=='practice'),'Global Search must not expose Problem Search game recommendations');
let loginRows=adapter.related(plan,true);
assert(loginRows.length<=3,'Global related results must be max 3');
assert(loginRows.filter(r=>r.entry.id==='game-hub').length===1,'game intent must contribute at most one Game Hub entry');
assert(loginRows.every(r=>r.entry.category!=='practice'),'Login result composition must remain hub-only');
assert(new Set(ids(loginRows)).size===loginRows.length,'Global related results must be deduplicated');
ok('Problem Search is hub-only and related results stay max 3');

plan=adapter.analyze('เรียนเองหรือเรียนกับครู');
assert(adapter.gameIntent(plan)==='none','unsupported/non-game learner need must not become Global problem-game intent');
rows=adapter.related(plan,true);
assert(rows.every(r=>r.entry.category!=='practice'&&r.entry.id!=='game-hub'),'unsupported Global query must not force a game into Related');
ok('unsupported corpus route does not force irrelevant game results');

plan=adapter.analyze('費用');
rows=adapter.related(plan,true);
assert(rows.some(r=>r.entry.id==='course-pricing'),'normal Global public query must still return non-game content');
assert(rows.every(r=>r.entry.category!=='practice'&&r.entry.id!=='game-hub'),'normal public query must not be polluted by legacy game keywords/default rotation');
ok('non-game Global Search remains public-search behavior');

console.log(`PASS ${pass} global-game adapter contracts`);
