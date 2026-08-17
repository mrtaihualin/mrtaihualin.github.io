#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const vm = require('vm');
const root = path.resolve(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const auth = read('js/core/auth-widget.js');
const readingAuth = read('js/games/reading-auth.js');
const audio = read('js/games/protected-word-audio.js');
const content = read('js/games/game-content-client.js');
const toneBoard = read('js/score/leaderboard.js');
const coreBoards = read('js/score/reading-leaderboard.js');
const lineCallback = read('js/games/line-callback.js');
let passed = 0;
function test(label, fn) {
  try { fn(); passed++; console.log('✓ ' + label); }
  catch (error) { console.error('✗ ' + label + ': ' + error.message); process.exitCode = 1; }
}

async function asyncTest(label, fn) {
  try { await fn(); passed++; console.log('✓ ' + label); }
  catch (error) { console.error('✗ ' + label + ': ' + error.message); process.exitCode = 1; }
}

function audioRuntimeHarness(invokeResults, playResults) {
  const appended = [];
  const audios = [];
  let invokeCount = 0;
  let playCount = 0;
  const requestCalls = [];
  const elements = Object.create(null);

  function node(tag) {
    const attrs = Object.create(null);
    return {
      tagName: String(tag || '').toUpperCase(),
      style: {},
      children: [],
      setAttribute(name, value) { attrs[name] = String(value); },
      getAttribute(name) { return attrs[name]; },
      appendChild(child) { this.children.push(child); },
      addEventListener() {},
      remove() { this.removed = true; },
    };
  }

  class FakeAudio {
    constructor(src) {
      this.src = src;
      this.currentTime = 0;
      audios.push(this);
    }
    pause() { this.paused = true; }
    play() {
      const result = playResults[playCount++];
      return result instanceof Error ? Promise.reject(result) : Promise.resolve(result);
    }
  }

  const document = {
    readyState: 'complete',
    head: { appendChild(child) { if (child.id) elements[child.id] = child; } },
    body: { appendChild(child) { appended.push(child); if (child.id) elements[child.id] = child; } },
    createElement: node,
    getElementById(id) { return elements[id] || null; },
    addEventListener() {},
  };
  const sandbox = {
    Audio: FakeAudio,
    Date,
    Promise,
    console,
    document,
    setTimeout() { return 1; },
    clearTimeout() {},
    getSupabaseClient() {
      return {
        functions: {
          invoke() {
            const result = invokeResults[invokeCount++];
            return result instanceof Error ? Promise.reject(result) : Promise.resolve(result);
          },
        },
      };
    },
    NetworkGuard: {
      request(call, key, options, timeoutMs) {
        requestCalls.push({ key, options, timeoutMs });
        return call();
      },
    },
  };
  sandbox.window = sandbox;
  vm.runInNewContext(audio, sandbox, { filename: 'protected-word-audio.js' });
  sandbox.WordAudio.setAvailability(['กา']);
  return {
    WordAudio: sandbox.WordAudio,
    button: node('button'),
    appended,
    audios,
    requestCalls,
    invokeCount: () => invokeCount,
  };
}

test('missing auth dependency exposes Guest recovery instead of a blank widget', () => {
  assert.match(auth, /authResolved: true, authError: 'unavailable'/);
  assert.match(auth, /登入服務暫時無法連線，可先使用訪客模式/);
  assert.match(auth, /renderBadge: renderUnavailable/);
  assert.match(auth, /重新載入/);
});
test('getSession rejection is handled as unknown state without clearing account cache', () => {
  const branch = auth.slice(auth.indexOf("console.warn('[auth] getSession failed:"), auth.indexOf('sb.auth.onAuthStateChange'));
  assert.match(branch, /authError = 'session_unavailable'/);
  assert.doesNotMatch(branch, /bindLearningOwner\(null\)|localStorage\.removeItem/);
});
test('a later auth event clears the temporary error and resumes normal state', () => {
  assert.match(auth, /onAuthStateChange[\s\S]{0,180}API\.authError = null/);
});
test('profile save waits for a bounded remote confirmation before changing local display state', () => {
  const save = auth.slice(auth.indexOf("profileModal.querySelector('#sap-save').onclick"), auth.indexOf('// ----- [03b]'));
  assert.match(save, /withClientTimeout\([\s\S]*profiles[\s\S]*upsert/);
  assert.match(save, /if \(res && res\.error\) throw/);
  assert.ok(save.indexOf('if (res && res.error) throw') < save.indexOf('setAvatarCache(selAvatar)'));
  assert.match(save, /無法確認是否已儲存[\s\S]*重新載入確認目前資料/);
  assert.match(auth, /isLegacyProfileShapeError[\s\S]*42703[\s\S]*PGRST204/);
  assert.match(auth, /isUncertainRemoteError[\s\S]*failed to fetch[\s\S]*network/);
});
test('account operations have bounded requests and never invite blind mutation retries', () => {
  assert.match(auth, /CLIENT_FAILURE_TIMEOUT_MS = 12000/);
  assert.match(auth, /function accountFetch[\s\S]*AbortController[\s\S]*client_timeout/);
  assert.match(auth, /function uncertainMutationMessage[\s\S]*確認前請勿連續重複送出/);
  assert.match(auth, /callAccountFnFresh[\s\S]*withClientTimeout\(sb\.auth\.refreshSession/);
  assert.doesNotMatch(auth, /可安全重新點擊再試一次/);
});
test('login modal always distinguishes login from linking another provider', () => {
  assert.match(readingAuth, /id="rg-account-method-warning"/);
  assert.match(readingAuth, /已有帳號？先用原本的方式登入/);
  assert.match(readingAuth, /登入後，再到「✏️ 個人檔案」連接 Facebook／LINE/);
  assert.match(readingAuth, /可能會建立另一個帳號，原本進度不會跟過去/);
});
test('both leaderboard clients wait for confirmed nickname saves and bound duplicate clicks', () => {
  [toneBoard, coreBoards].forEach((source) => {
    assert.match(source, /NICKNAME_SAVE_TIMEOUT_MS = 12000/);
    assert.match(source, /nicknameSavePending/);
    assert.match(source, /function nicknameSaveError[\s\S]*uncertain[\s\S]*failed to fetch[\s\S]*network/);
    assert.match(source, /saveNicknameWithTimeout\(nm\)[\s\S]*if \(res\.error\)[\s\S]*var saved = res\.data[\s\S]*myNick = \(saved && saved\.nickname\) \|\| nm/);
    assert.match(source, /無法確認暱稱是否已儲存[\s\S]*重新載入確認目前名稱/);
  });
});
test('LINE callback bounds every remote stage and reports uncertain results truthfully', () => {
  assert.match(lineCallback, /CALLBACK_TIMEOUT_MS = 12000/);
  assert.match(lineCallback, /withCallbackTimeout\(invocation, '等待 LINE 伺服器回應', true\)/);
  assert.match(lineCallback, /withCallbackTimeout\(sb\.auth\.getSession\(\), '確認目前登入狀態', false\)/);
  assert.match(lineCallback, /sb\.auth\.verifyOtp[\s\S]*'確認 LINE 登入狀態', true/);
  assert.match(lineCallback, /showUncertain[\s\S]*無法確認 LINE 是否已連接/);
  assert.match(lineCallback, /無法確認 LINE 登入是否完成/);
});
test('protected audio request has a bounded ten-second wait', () => {
  assert.match(audio, /NetworkGuard\.request[\s\S]{0,220}game-audio[\s\S]{0,220}10000/);
});
test('audio failure resets playing state and tells the learner how to recover', () => {
  assert.match(audio, /btn\.setAttribute\('data-playing', '0'\)/);
  assert.match(audio, /音檔播放失敗，請檢查網路後再試一次/);
  assert.match(audio, /signed\[text\] = null/);
});
test('content loading error has retry, home and support recovery', () => {
  assert.match(content, /gc-error-retry/);
  assert.match(content, /返回遊戲總覽/);
  assert.match(content, /用LINE問老師/);
});
test('all Core 5 pages ship current auth/audio error handling', () => {
  ['tone-finder.html','reading-game.html','listening-game.html','typing-game.html','word-order.html'].forEach((page) => {
    const html = read(page);
    assert.match(html, /auth-widget\.js\?v=13/);
    assert.match(html, /protected-word-audio\.js\?v=2/);
  });
});
test('all affected account and callback surfaces ship current failure-handling clients', () => {
  ['leaderboard.html','lego.html','listening-board.html','my-progress.html','reading-board.html',
    'typing-board.html','word-order-board.html']
    .forEach((page) => assert.match(read(page), /auth-widget\.js\?v=12/, page));
  ['listening-game.html','reading-game.html','tone-finder.html','typing-game.html','vault.html','word-order.html']
    .forEach((page) => assert.match(read(page), /auth-widget\.js\?v=13/, page));
  assert.match(read('leaderboard.html'), /leaderboard\.js\?v=13/);
  ['reading-board.html','listening-board.html','typing-board.html','word-order-board.html']
    .forEach((page) => assert.match(read(page), /reading-leaderboard\.js\?v=9/, page));
  assert.match(read('line-callback.html'), /line-callback\.js\?v=5/);
});

(async function runRuntimeAudioRecovery() {
  await asyncTest('protected audio timeout resets the button and exposes retry guidance', async () => {
    const harness = audioRuntimeHarness([new Error('client_timeout')], []);
    const result = await harness.WordAudio.play('กา', harness.button);
    assert.strictEqual(result, false);
    assert.strictEqual(harness.button.getAttribute('data-playing'), '0');
    assert.deepStrictEqual(
      { key: harness.requestCalls[0].key, timeoutMs: harness.requestCalls[0].timeoutMs },
      { key: 'game-audio', timeoutMs: 10000 }
    );
    assert.match(harness.appended.at(-1).textContent, /請檢查網路後再試一次/);
  });

  await asyncTest('protected audio request rejection can recover on an explicit retry', async () => {
    const harness = audioRuntimeHarness([
      new Error('network rejected'),
      { data: { signedUrl: 'https://audio.example/retry.mp3', expiresAt: Date.now() + 60000 } },
    ], [undefined]);
    assert.strictEqual(await harness.WordAudio.play('กา', harness.button), false);
    assert.strictEqual(harness.button.getAttribute('data-playing'), '0');
    assert.strictEqual(await harness.WordAudio.play('กา', harness.button), true);
    assert.strictEqual(harness.invokeCount(), 2);
    assert.strictEqual(harness.button.getAttribute('data-playing'), '1');
    harness.audios[0].onended();
    assert.strictEqual(harness.button.getAttribute('data-playing'), '0');
  });

  await asyncTest('audio.play rejection clears signed state and retries with a fresh URL', async () => {
    const harness = audioRuntimeHarness([
      { data: { signedUrl: 'https://audio.example/first.mp3', expiresAt: Date.now() + 60000 } },
      { data: { signedUrl: 'https://audio.example/second.mp3', expiresAt: Date.now() + 60000 } },
    ], [new Error('play rejected'), undefined]);
    assert.strictEqual(await harness.WordAudio.play('กา', harness.button), false);
    assert.strictEqual(harness.button.getAttribute('data-playing'), '0');
    assert.strictEqual(await harness.WordAudio.play('กา', harness.button), true);
    assert.strictEqual(harness.invokeCount(), 2);
    assert.strictEqual(harness.button.getAttribute('data-playing'), '1');
    harness.audios[1].onended();
    assert.strictEqual(harness.button.getAttribute('data-playing'), '0');
  });

  if (!process.exitCode) console.log('\n✅ Phase 1 audio/loading/auth error UX passed (' + passed + ' checks)');
})().catch((error) => {
  console.error('\n❌ Phase 1 audio/loading/auth error UX runtime failed:', error);
  process.exitCode = 1;
});
