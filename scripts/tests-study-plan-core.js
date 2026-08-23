#!/usr/bin/env node
'use strict';
const assert=require('assert');
const Core=require('../js/games/study-plan-core.js');

assert.strictEqual(Core.validateMinutes(5,false).ok,true);
assert.strictEqual(Core.validateMinutes(10,false).ok,true);
assert.strictEqual(Core.validateMinutes(11,false).ok,false);
assert.strictEqual(Core.validateMinutes(4,true).ok,false);
assert.strictEqual(Core.validateMinutes(5,true).ok,true);
assert.strictEqual(Core.validateMinutes(20,true).ok,true);
assert.strictEqual(Core.validateMinutes(21,true).ok,false);

const report={game_type:'listening',items:[
  {item_score:5,linguistic:{answer_mode:'mc',listening_score:5,typing_score:0}},
  {item_score:20,linguistic:{answer_mode:'type',listening_score:8,typing_score:6}}
]};
const rows=Core.normalizeReport(report);
assert.deepStrictEqual(rows,[
  {game:'listening',score10:10,source:'listening'},
  {game:'listening',score10:8,source:'listening'},
  {game:'typing',score10:6,source:'listening-typed'}
]);
assert.deepStrictEqual(Core.normalizeReport({game_type:'lego',items:[{item_score:10}]}),[]);

const perf=Core.applyContributions(Core.emptyPerf(),rows);
assert.strictEqual(perf.listening.count,2);
assert.strictEqual(perf.listening.totalScore,18);
assert.strictEqual(perf.listening.averageScore,9);
assert.strictEqual(perf.typing.totalScore,6);

const weakness=Core.emptyPerf();
weakness.tone={count:100,totalScore:100,averageScore:1};
weakness.reading={count:100,totalScore:200,averageScore:2};
weakness.listening={count:1,totalScore:3,averageScore:3};
weakness.typing={count:1,totalScore:4,averageScore:4};
weakness.word_order={count:1,totalScore:5,averageScore:5};
assert.deepStrictEqual(Core.buildCycle(weakness,true),[
  'tone','listening','reading','typing','word_order','lego'
]);

const partial=Core.emptyPerf();
partial.typing={count:2,totalScore:8,averageScore:4};
assert.deepStrictEqual(Core.buildCycle(partial,true),[
  'typing','tone','reading','listening','word_order','lego'
]);
assert.deepStrictEqual(Core.buildCycle(Core.emptyPerf(),false),Core.GAME_ORDER);
assert.deepStrictEqual(Core.buildCycle(Core.emptyPerf(),true),Core.GAME_ORDER);

let rotation={order:null,nextIndex:0};
const sequence=[];
for(let i=0;i<7;i++){
  const next=Core.nextFromRotation(rotation,Core.emptyPerf(),false);
  sequence.push(next.game);rotation=next.rotation;
}
assert.deepStrictEqual(sequence,[...Core.GAME_ORDER,'tone']);
assert.strictEqual(Core.formatSeconds(601),'10:01');

console.log('PASS study-plan-core');
