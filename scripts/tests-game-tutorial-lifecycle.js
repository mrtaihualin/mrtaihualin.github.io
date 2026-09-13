#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'js/games/game-tutorial-lifecycle.js'), 'utf8');

function createRuntime() {
  const nodes = new Map();
  const timers = new Map();
  const observers = [];
  let timerId = 0;
  const listeners = new Map();
  const document = {
    documentElement: {},
    querySelector(selector) { return nodes.get(selector) || null; },
    addEventListener(type, callback) { listeners.set('document:' + type, callback); },
    removeEventListener(type) { listeners.delete('document:' + type); },
  };
  const localStorage = new Map();
  const window = {
    document,
    localStorage: {
      getItem(key) { return localStorage.get(key) || null; },
      setItem(key, value) { localStorage.set(key, String(value)); },
    },
    getComputedStyle(node) { return { display: node.display, visibility: node.visibility || 'visible' }; },
    setTimeout(callback) { timerId += 1; timers.set(timerId, callback); return timerId; },
    clearTimeout(id) { timers.delete(id); },
    addEventListener(type, callback) { listeners.set('window:' + type, callback); },
    removeEventListener(type) { listeners.delete('window:' + type); },
    MutationObserver: class {
      constructor(callback) { this.callback = callback; this.connected = true; observers.push(this); }
      observe() {}
      disconnect() { this.connected = false; }
    },
  };
  window.window = window;
  vm.runInNewContext(source, { window, document }, { filename: 'game-tutorial-lifecycle.js' });
  return {
    window,
    node(selector, display) {
      const value = { display, hidden: false, getClientRects() { return this.display === 'none' ? [] : [{}]; } };
      nodes.set(selector, value);
      return value;
    },
    mutate() { observers.filter((observer) => observer.connected).forEach((observer) => observer.callback()); },
    flush() {
      const pending = Array.from(timers.entries());
      pending.forEach(([id, callback]) => { if (timers.delete(id)) callback(); });
    },
    pending() { return timers.size; },
  };
}

assert.doesNotMatch(source, /setInterval|tries\s*>/);
assert.match(source, /MutationObserver/);
assert.match(source, /characterData:\s*true/);

{
  const runtime = createRuntime();
  const resume = runtime.node('#resume', 'block');
  runtime.node('#howto', 'none');
  let ready = false;
  let starts = 0;
  runtime.window.GameTutorialLifecycle.schedule({
    seenKey: 'seen', blockers: ['#resume', '#howto'], ready: () => ready, start: () => { starts += 1; },
  });
  for (let index = 0; index < 40; index += 1) runtime.mutate();
  assert.strictEqual(runtime.pending(), 0, 'cold-load readiness must not start a timeout or give up');
  ready = true;
  runtime.mutate();
  assert.strictEqual(runtime.pending(), 0, 'visible Resume must suppress the automatic tour');
  resume.display = 'none';
  runtime.mutate();
  assert.strictEqual(runtime.pending(), 1, 'closing Resume must retry the automatic tour');
  runtime.flush();
  assert.strictEqual(starts, 1, 'tour starts once after Resume closes and content is ready');
  assert.strictEqual(runtime.window.localStorage.getItem('seen'), '1', 'first automatic open persists immediately without waiting for completion');
}

{
  const runtime = createRuntime();
  runtime.node('#resume', 'none');
  const howto = runtime.node('#howto', 'none');
  let starts = 0;
  runtime.window.GameTutorialLifecycle.schedule({
    seenKey: 'seen', blockers: ['#resume', '#howto'], ready: () => true, start: () => { starts += 1; },
  });
  assert.strictEqual(runtime.pending(), 1, 'ready content schedules the tour');
  howto.display = 'flex';
  runtime.mutate();
  assert.strictEqual(runtime.pending(), 0, 'opening manual help cancels the pending automatic tour');
  runtime.flush();
  assert.strictEqual(starts, 0, 'manual help and automatic tour never overlap');
  howto.display = 'none';
  runtime.mutate();
  runtime.flush();
  assert.strictEqual(starts, 1, 'tour retries once manual help closes');
}

const pages = [
  ['tone-finder.html', 'tone', '#tf-resume-banner', '#tf-howto-modal'],
  ['reading-game.html', 'reading', '#rg-resume-banner', '#rg-howto-modal'],
  ['typing-game.html', 'typing', '#tg-resume-banner', '#rg-howto-modal'],
  ['word-order.html', 'wordorder', '#wo-resume-banner', '#wo-howto-modal'],
];
for (const [file, game, resume, howto] of pages) {
  const html = fs.readFileSync(path.join(root, file), 'utf8');
  assert.match(html, /js\/games\/game-tutorial-lifecycle\.js\?v=1/);
  assert.match(html, new RegExp(`seenKey:'howto_tour_seen_${game}'`));
  assert.ok(html.includes(`blockers:['${resume}','${howto}']`));
}
const legoHtml = fs.readFileSync(path.join(root, 'lego.html'), 'utf8');
const legoApp = fs.readFileSync(path.join(root, 'js/games/lego-game-app.js'), 'utf8');
assert.match(legoHtml, /js\/games\/game-tutorial-lifecycle\.js\?v=1/);
assert.match(legoApp, /seenKey:'howto_tour_seen_lego'/);
assert.ok(legoApp.includes("blockers:['#lego-resume-banner','#lego-howto-modal']"));

const listening = fs.readFileSync(path.join(root, 'listening-game.html'), 'utf8');
assert.match(listening, /data-listening-availability="coming-soon"/);
assert.match(listening, /body\[data-listening-availability="coming-soon"\] \.mrt-login-howto,[\s\S]{0,220}#lg-howto-modal\{display:none!important;\}/);

const browserHarness = fs.readFileSync(path.join(root, 'scripts/browser-tests/game-tutorial-lifecycle.html'), 'utf8');
assert.match(browserHarness, /width:844px; height:390px/);
for (const [file, game, resume, howto] of pages.concat([['lego.html', 'lego', '#lego-resume-banner', '#lego-howto-modal']])) {
  assert.ok(browserHarness.includes(`page:'${file}', game:'${game}', resume:'${resume}', howto:'${howto}'`));
}
assert.match(browserHarness, /load\(config, 8300\)/);
assert.match(browserHarness, /tour stays hidden while Resume owns the screen/);
assert.match(browserHarness, /automatic tour does not overlap manual 玩法/);
const listeningHarness = fs.readFileSync(path.join(root, 'scripts/browser-tests/listening-off-consistency.html'), 'utf8');
assert.match(listeningHarness, /width:844px; height:390px/);
assert.match(listeningHarness, /\.mrt-login-howto,#lg-howto-btn,#lg-howto-modal/);
assert.match(listeningHarness, /listening-game-app\\\.js/);
const completionHarness = fs.readFileSync(path.join(root, 'scripts/browser-tests/game-full-completion-regression.html'), 'utf8');
for (const [file] of pages.concat([['lego.html']])) assert.ok(completionHarness.includes(`page:'${file}'`));
assert.match(completionHarness, /name:'Desktop', width:1440, height:900/);
assert.match(completionHarness, /name:'Portrait', width:390, height:844/);
assert.match(completionHarness, /name:'Landscape', width:844, height:390/);
assert.match(completionHarness, /entry\/answer\/skip\/next\/Result\/replay/);

console.log('✅ game tutorial lifecycle passed: cold load, Resume retry, manual-help exclusion, five games, Listening OFF');
