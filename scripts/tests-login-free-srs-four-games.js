#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const edge = fs.readFileSync(path.join(root, 'supabase/functions/tone-round/index.ts'), 'utf8');
const engineStart = edge.indexOf('var TF_SRS_CFG');
const engineEnd = edge.indexOf('function paidOutcome');
assert.ok(engineStart >= 0 && engineEnd > engineStart, 'shared SRS engine must remain extractable');

const context = { Date, Intl, JSON, Object, Number, Array, Math };
vm.createContext(context);
vm.runInContext(edge.slice(engineStart, engineEnd) + '\nthis.SRS = TF_SRS; this.resolve = resolveRound;', context);

const games = [
  { id: 'tone', file: 'js/games/tone-finder-game.js', known: /knownCheck:\s*wasKnownCheck/, noScore: /noSoftPoints\s*=\s*!!\(session\.curWordIsKnownCheck\)/ },
  { id: 'reading', file: 'js/games/reading-game-app.js', known: /game:'reading'[\s\S]{0,180}knownCheck:true/, noScore: /rgLogWord\(\{mastered:!!passedClean,pts:0/ },
  { id: 'typing', file: 'js/games/typing-game-app.js', known: /game:'typing'[\s\S]{0,180}knownCheck:true/, noScore: /rgLogWord\(\{failed:!passedClean,pts:0,mastered:passedClean/ },
  { id: 'wordorder', file: 'js/games/word-order-app.js', known: /woServerFinish\(s\.th, passedClean, \{knownCheck:true\}\)/, noScore: /woLogSentence\(\{mastered:!!passedClean, pts:0/ },
];

const day0 = Date.parse('2026-09-11T04:00:00Z');
function run(game, rec, clean, opts) {
  return context.resolve({
    game,
    word: game + '-fixture',
    level: 1,
    account: { stars: 17, hardWordsByLevel: {} },
    srsRecord: rec,
    nowMs: day0,
    opts: Object.assign({ spellingGame: true, spellingClean: clean }, opts || {}),
  });
}

for (const game of games) {
  const source = fs.readFileSync(path.join(root, game.file), 'utf8');
  assert.match(source, game.known, game.id + ': memory check must use the authoritative known-check route');
  assert.match(source, game.noScore, game.id + ': memory check must award no gameplay score');

  const day1 = run(game.id, null, true);
  assert.strictEqual(day1.reason, 'advanced', game.id + ': clean entry advances to Day 1');
  assert.strictEqual(day1.newSrsRecord.stage, 1);
  assert.strictEqual(day1.newSrsRecord.dueDate, context.SRS.twDatePlusDays(day0, 1));
  assert.strictEqual(day1.starsAwarded, 0);

  const day7 = run(game.id, Object.assign({}, day1.newSrsRecord, { dueDate: '' }), true);
  assert.strictEqual(day7.reason, 'advanced', game.id + ': second clean pass advances to Day 7');
  assert.strictEqual(day7.newSrsRecord.stage, 2);
  assert.strictEqual(day7.newSrsRecord.dueDate, context.SRS.twDatePlusDays(day0, 7));

  const mastered = run(game.id, Object.assign({}, day7.newSrsRecord, { dueDate: '' }), true);
  assert.strictEqual(mastered.reason, 'mastered', game.id + ': third clean pass masters');
  assert.strictEqual(mastered.newSrsRecord.stage, 3);
  assert.strictEqual(mastered.newSrsRecord.mastered, true);
  assert.strictEqual(mastered.newSrsRecord.dueDate, '');
  assert.strictEqual(context.SRS.isDue(mastered.newSrsRecord, day0), false, game.id + ': mastered item stays out of due work');

  const reset = run(game.id, Object.assign({}, day7.newSrsRecord, { dueDate: '' }), false);
  assert.strictEqual(reset.reason, 'reset', game.id + ': a failed scheduled review resets the ladder');
  assert.strictEqual(reset.newSrsRecord.stage, 0);
  assert.strictEqual(reset.newSrsRecord.everFailed, true);
  assert.strictEqual(reset.newSrsRecord.mastered, false);

  const remembered = run(game.id, Object.assign({}, day1.newSrsRecord, { dueDate: '' }), true, { knownCheck: true });
  assert.strictEqual(remembered.reason, 'known_master', game.id + ': correct memory check masters atomically');
  assert.strictEqual(remembered.newSrsRecord.mastered, true);
  assert.strictEqual(remembered.starsAwarded, 0);

  const forgotten = run(game.id, Object.assign({}, day7.newSrsRecord, { dueDate: '' }), false, { knownCheck: true });
  assert.strictEqual(forgotten.reason, 'known_reset', game.id + ': failed memory check resets atomically');
  assert.strictEqual(forgotten.newSrsRecord.stage, 0);
  assert.strictEqual(forgotten.newSrsRecord.everFailed, true);
  assert.strictEqual(forgotten.starsAwarded, 0);
}

console.log('LOGIN_FREE_SRS_FOUR_GAMES_PASS ' + games.length + '_GAMES');
