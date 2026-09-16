#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const app = fs.readFileSync(path.join(root, 'js/games/word-order-app.js'), 'utf8');
const minApp = fs.readFileSync(path.join(root, 'js/games/word-order-app.min.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'word-order.html'), 'utf8');
const sentenceSource = fs.readFileSync(path.join(root, 'data/adv-sentences.js'), 'utf8');
let passed = 0;

function test(name, fn) {
  fn();
  passed++;
  console.log(`✓ ${name}`);
}

function block(startText, endText) {
  const start = app.indexOf(startText);
  const end = app.indexOf(endText, start + startText.length);
  assert.ok(start >= 0 && end > start, `หา block ${startText} ไม่พบ`);
  return app.slice(start, end);
}

test('answer is validated only against the prescribed target order', () => {
  const check = block('function checkAnswer()', 'function popScore(');
  assert.match(check, /answer\.every\(function\(v, i\)\{ return v === i; \}\)/);
  assert.match(check, /submittedAttempts\.push\(\{answer:lastSubmittedAnswer,is_correct:isCorrect\}\)/);
  assert.doesNotMatch(check, /particleIndex|particleOnlyWrong/);
});

test('report reuses canonical sentence words and submitted order', () => {
  assert.match(app, /words:wordGlosses\|\|\[\]/);
  assert.match(app, /attempts:submittedAttempts\.slice\(\)/);
  assert.match(app, /correctAnswer:wordsArr\.join\(' '\)/);
  assert.match(app, /content_ref:\{source:'game_sentences',key:base\.th\},question:base\.th/);
  assert.doesNotMatch(app, /correctAnswer:s\.th/);
  assert.doesNotMatch(app, /parseGrammar/);
  assert.match(app, /woLogSentence\(\{failed:true/);
  assert.match(app, /woLogSentence\(\{guide:!!hintUsedThisSentence/);
  assert.match(app, /woLogSentence\(\{skipped:true/);
});

test('all 30 current reports use reviewed word chunks with spaces without changing sentence identity', () => {
  const catalogContext = { window: {} };
  vm.createContext(catalogContext);
  vm.runInContext(sentenceSource, catalogContext, { filename: 'adv-sentences.js' });
  const sentences = catalogContext.window.ADV_SENTENCES_FULL;
  assert.strictEqual(sentences.length, 30);
  sentences.forEach((sentence) => {
    const chunks = sentence.words.map((word) => word.th);
    assert.strictEqual(chunks.join(''), sentence.th);
    assert.strictEqual(chunks.join(' ').replace(/ /g, ''), sentence.th);
    assert.strictEqual(chunks.join(' ').split(' ').length, sentence.words.length);
  });
});

test('polite mode is a revealed display tail and never an ordering tile', () => {
  const helpers = block('function woShowParticleFor(s)', 'function woSentenceText(s)');
  const render = block('function woRenderParticleLine()', 'window.woToggleParticleMode');
  const sentence = { th: 'คุณไปไหนมา', politeF: 'คะ', words: [{ th: 'คุณ' }, { th: 'ไปไหนมา' }] };
  const makeNode = () => ({
    id: '', className: '', textContent: '', parentNode: null, children: [], attributes: {},
    appendChild(child) { child.parentNode = this; this.children.push(child); },
    removeChild(child) { this.children = this.children.filter((item) => item !== child); child.parentNode = null; },
    setAttribute(name, value) { this.attributes[name] = value; },
  });
  const slots = makeNode();
  const context = {
    woParticleMode: 'off',
    woSentenceRevealed: false,
    activeSentence: null,
    curSentence() { return context.activeSentence; },
    document: {
      getElementById(id) {
        if (id === 'wo-slots') return slots;
        return slots.children.find((child) => child.id === id) || null;
      },
      createElement() { return makeNode(); },
    },
  };
  vm.createContext(context);
  vm.runInContext(helpers + render, context);

  context.activeSentence = context.woBuildPlayableSentence(sentence);
  assert.strictEqual(context.activeSentence.activeParticle, null);
  assert.strictEqual(context.activeSentence.words.length, 2);
  context.woParticleMode = 'm';
  context.activeSentence = context.woBuildPlayableSentence(sentence);
  assert.strictEqual(context.activeSentence.activeParticle, 'ครับ');
  assert.strictEqual(context.activeSentence.words.length, 2);
  assert.strictEqual(sentence.activeParticle, undefined);
  context.woSentenceRevealed = true;
  context.woRenderParticleLine();
  assert.strictEqual(slots.children.length, 1);
  assert.strictEqual(slots.children[0].id, 'wo-particle-line');
  assert.match(slots.children[0].className, /wo-slot filled correct wo-particle-slot/);
  assert.strictEqual(slots.children[0].children[0].textContent, 'ครับ');
  assert.strictEqual(slots.children[0].children[1].textContent, '禮貌詞');
  assert.strictEqual(slots.children[0].attributes['data-gsh-auto-tail'], 'true');
  context.woParticleMode = 'f';
  context.activeSentence = context.woBuildPlayableSentence(sentence);
  assert.strictEqual(context.activeSentence.activeParticle, 'คะ');
  assert.strictEqual(context.activeSentence.words.length, 2);
  context.woRenderParticleLine();
  assert.strictEqual(slots.children.length, 1, 'particle slot must be replaced, not duplicated');
  assert.strictEqual(slots.children[0].children[0].textContent, 'คะ');
  context.activeSentence = context.woBuildPlayableSentence({ th: 'ผมไปบ้าน', politeF: null, words: [{ th: 'ผม' }, { th: 'ไปบ้าน' }] });
  assert.strictEqual(context.activeSentence.activeParticle, 'ครับ');
  context.woParticleMode = 'off';
  context.activeSentence = context.woBuildPlayableSentence(sentence);
  context.woRenderParticleLine();
  assert.strictEqual(slots.children.length, 0, 'OFF must remove the generated particle slot');
  assert.doesNotMatch(app, /particleSyl|words:\s*s\.words\.concat/);
  assert.doesNotMatch(html, /<div id="wo-particle-line"/);
  assert.match(app, /function renderSlots\(s\)[\s\S]*woRenderParticleLine\(\);/);
  assert.match(app, /function loadSentence\(\)[\s\S]*woSentenceRevealed = false; woSyncParticleBtn\(\); woRenderParticleLine\(\);/);
  assert.match(app, /window\.woToggleParticleMode = function\(\)[\s\S]*if \(SET\.length && idx < SET\.length\) loadSentence\(\);/);
  assert.match(app, /function woAdvanceToNextSentence\(\)[\s\S]*idx\+\+;\s*loadSentence\(\);/);
  assert.match(app, /function woResumeContinue\(state, restoredSet, reviewReady\)[\s\S]*loadSentence\(\);/);
  assert.match(app, /function woResumeRestartSameReady\(p\)[\s\S]*loadSentence\(\);woSaveResume\(\);/);
});

test('a wrong order remains playable and gives correction feedback', () => {
  const check = block('function checkAnswer()', 'function popScore(');
  assert.match(check, /attemptedWrongThisSentence = true/);
  assert.match(check, /點一下格子裡的詞塊，再排排看/);
  assert.match(check, /if \(life <= 0\)[\s\S]*else \{/);
});

test('Hint always applies to a canonical sentence word and keeps the locked deduction', () => {
  const hint = block('window.woHint = function()', 'window.woSkip = function()');
  assert.match(hint, /hintUsedThisSentence = true/);
  assert.match(hint, /hintCountThisSentence\+\+/);
  assert.match(hint, /life -= HINT_DEDUCT/);
  assert.doesNotMatch(hint, /isParticle|particleHint/);
});

test('Phase 1 SRS entry/checkpoint requires unassisted base 10/10', () => {
  assert.match(app, /srsPassed = life === SENTENCE_LIFE_START && !attemptedWrongThisSentence && !hintUsedThisSentence/);
  assert.match(app, /if \(srsPassed\)/);
});

test('new below-10 item does not create a local SRS record', () => {
  const check = block('function checkAnswer()', 'function popScore(');
  assert.match(check, /if \(existingRec\) \{[\s\S]*WO_SRS\.resetOnFail\(existingRec\)/);
  assert.doesNotMatch(check, /WO_SRS\.resetOnFail\(existingRec \|\| WO_SRS\.blank\(\)\)/);
});

test('failed checkpoint is owned by the canonical Learning Engine only', () => {
  assert.match(app, /LearningReview\.owns\(roundReport/);
  assert.doesNotMatch(app, /TONE_SERVER|woServerFinish/);
  assert.match(app, /woLogSentence\(\{failed:true, pts:0/);
});

test('SRS lifecycle is the Phase 1 Day 1 / Day 7 path', () => {
  assert.match(app, /INTERVALS: \[1, 7\]/);
  assert.match(app, /CLEAN_ROUNDS_TO_MASTER: 3/);
});

test('Guest can play while account SRS writes remain login-gated', () => {
  assert.match(app, /if \(woLoggedIn\(\) && !practiceMode && !woReviewOwns\(s\.th\)\) \{/);
  assert.match(app, /else \{\s*pool = allIdx\.slice\(\);/);
});

test('normal rounds fail closed unless they contain exactly five unique valid questions', () => {
  const helpers = block('function woRoundIdentity(', '// ════════════════════════════════════════════════════════════\n  // 勳章');
  const context = {
    ADV_SENTENCES: Array.from({ length: 8 }, (_, index) => ({ th: `ประโยค-${index}` })),
    WO_ROUND_SIZE: 5,
    WO_REVIEW_LIMIT: 1,
    WO_SRS_DUE_LIMIT: 1,
    window: { console: { error() {} } },
    console: { error() {} },
  };
  vm.createContext(context);
  vm.runInContext(helpers, context);

  assert.deepStrictEqual(Array.from(context.woRequireExactRound([0, 1, 2, 3, 4])), [0, 1, 2, 3, 4]);
  assert.throws(() => context.woRequireExactRound([0, 1, 1, 2, 3]), /WORD_ORDER_ROUND_EXACT_FIVE_REQUIRED/);
  assert.throws(() => context.woRequireExactRound([0, 1, 2, 3]), /WORD_ORDER_ROUND_EXACT_FIVE_REQUIRED/);
  context.ADV_SENTENCES[4].th = '';
  assert.throws(() => context.woRequireExactRound([0, 1, 2, 3, 4]), /WORD_ORDER_ROUND_EXACT_FIVE_REQUIRED/);
});

test('Word Order caps Review and SRS Due separately at one without emergency fill', () => {
  const helpers = block('function woRoundIdentity(', '// ════════════════════════════════════════════════════════════\n  // 勳章');
  const context = {
    ADV_SENTENCES: Array.from({ length: 10 }, (_, index) => ({ th: `ประโยค-${index}` })),
    WO_ROUND_SIZE: 5,
    WO_REVIEW_LIMIT: 1,
    WO_SRS_DUE_LIMIT: 1,
    window: { console: { error() {} } },
    console: { error() {} },
  };
  vm.createContext(context);
  vm.runInContext(helpers, context);

  const allocation = context.woAllocateSrsStrict({ total: 5, due: [0, 1, 2], regular: [0, 3, 4, 5, 6, 7] });
  assert.strictEqual(allocation.selectedDue.length, 1);
  assert.strictEqual(allocation.items.length, 5);
  assert.strictEqual(new Set(Array.from(allocation.items)).size, 5);
  const dueOnly = context.woAllocateSrsStrict({ total: 5, due: [0, 1, 2, 3, 4], regular: [] });
  assert.strictEqual(dueOnly.items.length, 1, 'must not emergency-fill from additional Due items');
  assert.throws(() => context.woRequireExactRound(dueOnly.items), /WORD_ORDER_ROUND_EXACT_FIVE_REQUIRED/);

  assert.match(app, /LearningReview\.allocateRuntime\(\{game:'word_order'/);
  assert.match(app, /allocateSrs:woAllocateSrsStrict/);
  assert.match(app, /selectedReview\.length>WO_REVIEW_LIMIT\|\|_reviewAllocation\.selectedSrs\.length>WO_SRS_DUE_LIMIT/);
  assert.doesNotMatch(app, /GameFlow\.allocateSrs\(\{tier:'free'/);
  assert.doesNotMatch(app, /practiceMode = true; pool = allIdx\.slice\(\)/);
});

test('normal-round eligibility excludes all SRS-owned and queued Review items from regular fill', () => {
  assert.match(app, /_reviewDue=.*\.filter\(function\(i\)\{return !srsRecords\[woSrsKey\(ADV_SENTENCES\[i\]\.th\)\];\}\)/);
  assert.match(app, /_regularIdx=allIdx\.filter\(function\(i\)\{return !srsRecords\[woSrsKey\(ADV_SENTENCES\[i\]\.th\)\]&&!_reviewDueSeen\[woRoundIdentity\(i\)\];\}\)/);
  assert.doesNotMatch(app, /Math\.min\(WO_ROUND_SIZE,_dueIdx\.length\+_regularIdx\.length\)/);
});

test('resume accepts only versioned five-question bases and bounded base retries', () => {
  const helpers = block('function woRoundIdentity(', '// ════════════════════════════════════════════════════════════\n  // 勳章');
  const context = {
    ADV_SENTENCES: Array.from({ length: 8 }, (_, index) => ({ th: `ประโยค-${index}` })),
    WO_ROUND_SIZE: 5,
    WO_REVIEW_LIMIT: 1,
    WO_SRS_DUE_LIMIT: 1,
    window: { console: { error() {} } },
    console: { error() {} },
  };
  vm.createContext(context);
  vm.runInContext(helpers, context);

  assert.strictEqual(context.woValidResumeRound({ roundSize: 5, idx: 2 }, [0, 1, 2, 3, 4]), true);
  assert.strictEqual(context.woValidResumeRound({ roundSize: 5, idx: 5 }, [0, 1, 2, 3, 4, 0, 1]), true);
  assert.strictEqual(context.woValidResumeRound({ idx: 1 }, [0, 1, 2]), false, 'legacy short snapshots must be cleared');
  assert.strictEqual(context.woValidResumeRound({ roundSize: 5, idx: 1 }, [0, 1, 1, 3, 4]), false);
  assert.strictEqual(context.woValidResumeRound({ roundSize: 5, idx: 5 }, [0, 1, 2, 3, 4, 5]), false);
  assert.strictEqual(context.woValidResumeRound({ roundSize: 5, idx: 6 }, [0, 1, 2, 3, 4, 0, 0]), false);
  assert.match(app, /roundSize: WO_ROUND_SIZE/);
  assert.match(app, /woValidResumeRound\(_resumeState,_restoredSet\)/);
});

test('direct sentence practice remains a separate single-item mode without Resume writes', () => {
  const fresh = block('function startFreshRound(', 'function loadSentence()');
  assert.match(fresh, /practiceMode = true;\s*SET = \[requestedIndex\]/);
  assert.match(app, /if \(practiceMode \|\| !window\.GameResume \|\| !SET\.length\) return/);
});

test('HTML fetches the exact-five minified runtime and source/minified carry the fail-closed contract', () => {
  assert.match(app, /var WO_ROUND_SIZE = 5/);
  assert.match(html, /word-order-app\.min\.js\?v=45/);
  assert.match(minApp, /WORD_ORDER_ROUND_EXACT_FIVE_REQUIRED/);
  assert.match(minApp, /round unavailable/);
});

test('round completion writes account evidence as word_order', () => {
  assert.match(app, /READING_AUTH\.saveScore\(weightedScore,1,'word_order',rgWrongItemsFromLog\(\),\{/);
  assert.match(app, /items:roundLog\.map/);
});

test('玩法 explains correction and prescribed order', () => {
  assert.match(html, /正確順序/);
  assert.match(html, /放回去重排/);
});

test('resume advances past an already-counted sentence, including legacy snapshots', () => {
  const helper = block('function woResumeCompletedCurrent(', 'function shuffle(');
  const context = {};
  vm.createContext(context);
  vm.runInContext(helper, context);
  assert.strictEqual(context.woResumeCompletedCurrent({ completedCurrent: true }, 'ประโยค'), true);
  assert.strictEqual(context.woResumeCompletedCurrent({
    report: { items: [{ content_ref: { key: 'ประโยค' } }] },
  }, 'ประโยค'), true);
  assert.strictEqual(context.woResumeCompletedCurrent({ roundLog: [{ th: 'ประโยค' }] }, 'ประโยค'), true);
  assert.strictEqual(context.woResumeCompletedCurrent({ completedCurrent: false }, 'ประโยค'), false);
  assert.match(app, /completedCurrent:\s*!!completedCurrent/);
  assert.match(app, /if \(woResumeCompletedCurrent\(state, savedSentence&&savedSentence\.th\)\) idx\+\+/);
  assert.match(app, /if \(idx >= SET\.length\) \{ finish\(\); return; \}/);
  assert.strictEqual((app.match(/woSaveResume\(true\)/g) || []).length, 1);
  assert.match(app, /function woAdvanceToNextSentence\(\)\{\s*woSaveResume\(true\);/, 'completed resume evidence is written only after the learning commit is acknowledged');
});

console.log(`\n${passed} Phase 1 Word Order tests passed.`);
