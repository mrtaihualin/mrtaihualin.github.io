#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const games = [
  { name: 'Typing', file: 'typing-game-app.js', switchToken: 'tg' },
  { name: 'Reading', file: 'reading-game-app.js', switchToken: 'rg' },
];

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function harness(config, runtime, primes) {
  const source = fs.readFileSync(path.join(__dirname, '../js/games', config.file), 'utf8');
  const start = source.indexOf(`var ${config.switchToken}LevelSwitchRequest=0;`);
  const end = source.indexOf('// ════════════════════════════════════════════\n// GAME FLOW', start);
  assert(start >= 0 && end > start, `${config.name} level switch block missing`);
  const game = {
    style: {},
    attributes: {},
    setAttribute(name, value) { this.attributes[name] = value; },
    removeAttribute(name) { delete this.attributes[name]; },
    getAttribute(name) { return this.attributes[name]; },
  };
  const element = { style: {}, classList: { add() {}, remove() {} } };
  const timers = [];
  const starts = [];
  const errors = [];
  const context = {
    Promise,
    window: { __tgSrsSyncedOnce: true, __rgSrsSyncedOnce: true, LearningReview: { runtimeEnabled: () => runtime } },
    LearningReview: { runtimeEnabled: () => runtime },
    localStorage: { setItem() {} },
    document: {
      querySelectorAll() { return [element]; },
      getElementById(id) { return id === 'tg-resume-banner' ? null : id === 'game' ? game : element; },
    },
    console: { error(...args) { errors.push(args); } },
    tgCloseMobileKeyboard() {},
    tgPrimeReview() { return primes.shift().promise; },
    rgPrimeReview() { return primes.shift().promise; },
    rgLoggedIn() { return true; },
    initGame() { starts.push(context.curLevel); },
    setTimeout(callback, milliseconds) { timers.push({ callback, milliseconds }); },
  };
  vm.createContext(context);
  vm.runInContext(source.slice(start, end), context);
  return { context, game, timers, starts, errors };
}

const tick = () => new Promise(setImmediate);

(async () => {
  for (const config of games) {
    const first = deferred();
    const runtime = harness(config, true, [first]);
    runtime.context.setLevel('初');
    assert.deepStrictEqual(runtime.starts, []);
    assert.strictEqual(runtime.game.style.pointerEvents, 'none');
    assert.strictEqual(runtime.game.inert, true);
    assert.strictEqual(runtime.game.attributes['aria-busy'], 'true');
    assert.strictEqual(runtime.timers.length, 0, 'canonical queue must not have a timeout bypass');
    first.resolve([]);
    await tick();
    assert.deepStrictEqual(runtime.starts, ['初']);
    assert.strictEqual(runtime.game.style.pointerEvents, '');
    assert.strictEqual(runtime.game.inert, false);
    assert.strictEqual(runtime.game.attributes['aria-busy'], undefined);

    const old = deferred(), latest = deferred();
    const switches = harness(config, true, [old, latest]);
    switches.context.setLevel('初');
    switches.context.setLevel('中');
    old.resolve([]);
    await tick();
    assert.deepStrictEqual(switches.starts, [], 'an old response must not start a new level');
    latest.resolve([]);
    await tick();
    assert.deepStrictEqual(switches.starts, ['中']);

    const failed = deferred();
    const failure = harness(config, true, [failed]);
    failure.context.setLevel('初');
    failed.reject(new Error('queue unavailable'));
    await tick();
    assert.deepStrictEqual(failure.starts, [], 'a rejected canonical queue must not create a round');
    assert.strictEqual(failure.errors.length, 1);

    const legacyPrime = deferred();
    const legacy = harness(config, false, [legacyPrime]);
    legacy.context.setLevel('初');
    legacy.timers.find((timer) => timer.milliseconds === 1500).callback();
    await tick();
    assert.deepStrictEqual(legacy.starts, ['初'], 'non-runtime timeout recovery remains available');
  }

  console.log('Typing and Reading level readiness: 8/8 PASS');
})().catch((error) => { console.error(error); process.exitCode = 1; });
