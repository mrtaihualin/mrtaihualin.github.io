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

{
  const runtime = createRuntime();
  runtime.window.localStorage.setItem('gsh_resume_game', '{"legacy":true}');
  let starts = 0;
  runtime.window.GameTutorialLifecycle.schedule({
    seenKey: 'seen',
    hasPriorUse: () => !!runtime.window.localStorage.getItem('gsh_resume_game'),
    blockers: [],
    ready: () => true,
    start: () => { starts += 1; },
  });
  assert.strictEqual(runtime.window.localStorage.getItem('seen'), '1', 'existing Guest resume migrates tutorial state immediately');
  runtime.flush();
  runtime.mutate();
  assert.strictEqual(starts, 0, 'existing Guest resume permanently suppresses automatic tutorial');
  assert.strictEqual(runtime.pending(), 0, 'existing Guest resume leaves no delayed automatic start');
}

{
  const runtime = createRuntime();
  let ready = false;
  let starts = 0;
  runtime.window.GameTutorialLifecycle.schedule({
    seenKey: 'seen',
    hasPriorUse: () => !!runtime.window.localStorage.getItem('gsh_resume_game'),
    blockers: [],
    ready: () => ready,
    start: () => { starts += 1; },
  });
  runtime.window.localStorage.setItem('gsh_resume_game', '{"current":true}');
  ready = true;
  runtime.mutate();
  runtime.flush();
  assert.strictEqual(starts, 1, 'resume written by the current fresh round does not masquerade as prior use');
}

const pages = [
  ['tone-finder.html', 'tone', '#tf-resume-banner', '#tf-howto-modal', 'tone-finder'],
  ['reading-game.html', 'reading', '#rg-resume-banner', '#rg-howto-modal', 'reading-game'],
  ['typing-game.html', 'typing', '#tg-resume-banner', '#rg-howto-modal', 'typing-game'],
  ['word-order.html', 'wordorder', '#wo-resume-banner', '#wo-howto-modal', 'word-order'],
];
for (const [file, game, resume, howto, resumeId] of pages) {
  const html = fs.readFileSync(path.join(root, file), 'utf8');
  assert.match(html, /js\/games\/game-tutorial-lifecycle\.js\?v=2/);
  assert.match(html, new RegExp(`seenKey:'howto_tour_seen_${game}'`));
  assert.ok(html.includes(`localStorage.getItem('gsh_resume_${resumeId}')`));
  assert.ok(html.includes(`blockers:['${resume}','${howto}']`));
}
const legoHtml = fs.readFileSync(path.join(root, 'lego.html'), 'utf8');
const legoApp = fs.readFileSync(path.join(root, 'js/games/lego-game-app.js'), 'utf8');
assert.match(legoHtml, /js\/games\/game-tutorial-lifecycle\.js\?v=2/);
assert.match(legoHtml, /js\/games\/lego-game-app\.js\?v=15/);
assert.ok(legoHtml.includes("window.__legoHadGuestResumeAtLoad=!!localStorage.getItem('gsh_resume_lego')"));
assert.match(legoApp, /seenKey:'howto_tour_seen_lego'/);
assert.ok(legoApp.includes('window.__legoHadGuestResumeAtLoad===true'));
assert.ok(legoApp.includes("blockers:['#lego-resume-banner','#lego-howto-modal']"));

const listening = fs.readFileSync(path.join(root, 'listening-game.html'), 'utf8');
assert.match(listening, /GameContentLoader\.boot\(\['js\/games\/listening-game-app\.js\?v=20'\], \{game:'listening'\}\)/);
assert.doesNotMatch(listening, /data-listening-availability="coming-soon"/);

const browserHarness = fs.readFileSync(path.join(root, 'scripts/browser-tests/game-tutorial-lifecycle.html'), 'utf8');
assert.match(browserHarness, /name:'Desktop', width:1440, height:900/);
assert.match(browserHarness, /name:'Portrait', width:390, height:844/);
assert.match(browserHarness, /name:'Landscape', width:844, height:390/);
for (const [file, game, resume, howto, resumeId] of pages.concat([['lego.html', 'lego', '#lego-resume-banner', '#lego-howto-modal', 'lego']])) {
  assert.ok(browserHarness.includes(`page:'${file}', game:'${game}', resume:'${resume}', howto:'${howto}', resumeId:'${resumeId}'`));
}
assert.match(browserHarness, /load\(config, 8300\)/);
assert.match(browserHarness, /tour stays hidden while Resume owns the screen/);
assert.match(browserHarness, /automatic tour does not overlap manual 玩法/);
assert.match(browserHarness, /existing Guest Resume suppresses automatic tutorial and migrates seen state/);
const completionHarness = fs.readFileSync(path.join(root, 'scripts/browser-tests/game-full-completion-regression.html'), 'utf8');
for (const [file] of pages.concat([['lego.html']])) assert.ok(completionHarness.includes(`page:'${file}'`));
assert.match(completionHarness, /name:'Desktop', width:1440, height:900/);
assert.match(completionHarness, /name:'Portrait', width:390, height:844/);
assert.match(completionHarness, /name:'Landscape', width:844, height:390/);
assert.match(completionHarness, /entry\/answer\/skip\/next\/Result\/replay/);
assert.match(completionHarness, /Typing complete Thai input Next/);
assert.match(completionHarness, /Typing Enter advances to next question/);

console.log('✅ game tutorial lifecycle passed: cold load, Resume retry, Guest-state migration, manual-help exclusion, five games, Listening OFF');
