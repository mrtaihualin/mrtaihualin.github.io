#!/usr/bin/env node
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const vm = require('vm');
const { spawnSync } = require('child_process');
const root = path.resolve(__dirname, '..');
const failures = [];
let passed = 0;
function read(relative) { return fs.readFileSync(path.join(root, relative), 'utf8'); }
function check(label, condition) {
  if (condition) { passed++; console.log('✓ ' + label); }
  else failures.push(label);
}

const corePages = ['tone-finder.html', 'reading-game.html', 'listening-game.html', 'typing-game.html', 'word-order.html'];
corePages.forEach((page) => {
  const html = read(page);
  check(page + ' ใช้ protected audio module', /js\/games\/protected-word-audio\.js\?v=\d+/.test(html));
  check(page + ' ไม่มี public audio manifest/disabled fallback', !/data\/(audio-manifest|audio-disabled)\.js/.test(html));
  check(page + ' ไม่โหลด legacy word-audio.js', !/js\/games\/word-audio\.js/.test(html));
});

const client = read('js/games/game-content-client.js');
check('content client ไม่มี embedded Supabase production fallback', !/\.supabase\.co/.test(client) && !/eyJ[A-Za-z0-9_-]{20,}/.test(client));
check('content client fail-closed เมื่อ config ไม่มี', /function currentConfig\(\)/.test(client) && /Supabase config unavailable/.test(client));
check('content client รอ deferred config ก่อน fetch', /function whenDeferredConfigReady\(\)/.test(client) && /whenDeferredConfigReady\(\)\.then\(fetchGameContent\)/.test(client));
check('content client ต้องได้ audioAvailable contract', /Array\.isArray\(data\.audioAvailable\)/.test(client));
check('content client ส่ง availability ให้ protected audio ก่อน boot เกม', /WordAudio\.setAvailability\(data\.audioAvailable\)/.test(client));

const contentEdge = read('supabase/functions/game-content/index.ts');
check('game-content คืน audio availability เฉพาะ entitled response', /entitledTexts/.test(contentEdge) && /audioAvailable/.test(contentEdge));
check('game-content response ไม่คืน storage path/catalog metadata', /return json\(\{ tier, words, sentences, audioAvailable, capped \}/.test(contentEdge));
check('quota เดิมคง 50\/100 และ 20\/40', /anon:\s*\{ '初': 50,\s*'中': 50,\s*sentences: 20 \}/.test(contentEdge) && /login:\s*\{ '初': 100,\s*'中': 100,\s*sentences: 40 \}/.test(contentEdge));

const audioClient = read('js/games/protected-word-audio.js');
check('protected audio ไม่อ่าน AUDIO_MANIFEST หรือ static asset path', !/AUDIO_MANIFEST|assets\/(word|sentence)-audio/.test(audioClient));
check('protected audio ขอ URL ทีละชิ้นจาก game-audio', /functions\.invoke\('game-audio'/.test(audioClient) && /body: \{ text: text \}/.test(audioClient));
check('protected audio cache URL อายุสั้นและล้างเมื่อ error', /expiresAt > Date\.now\(\) \+ 10000/.test(audioClient) && /signed\[text\] = null/.test(audioClient));

const audioEdge = read('supabase/functions/game-audio/index.ts');
check('game-audio ตรวจ entitlement จาก server rank/caps', /game_words/.test(audioEdge) && /game_sentences/.test(audioEdge) && /Number\(row\.rank\) <= caps/.test(audioEdge));
check('game-audio fail-closed เมื่อ rate/entitlement lookup ล่ม', /rate_limit_unavailable/.test(audioEdge) && /entitlement_unavailable/.test(audioEdge));
check('game-audio signed URL 90 วินาทีจาก private bucket', /SIGNED_SECONDS = 90/.test(audioEdge) && /createSignedUrl\(asset\.storage_path, SIGNED_SECONDS\)/.test(audioEdge));
check('game-audio ไม่มี catalog/list response', !/audioAvailable|\.list\(/.test(audioEdge));

const sql = read('supabase/sql/2026-08-14_private_game_audio.sql');
check('private bucket SQL ล็อก public=false', /game-audio-private/.test(sql) && /public, file_size_limit/.test(sql) && /false, 10485760/.test(sql));
check('audio_assets ยังคง revoke client direct access', /revoke all on table public\.audio_assets from anon, authenticated/.test(sql));

const audioContext = { window: {} };
vm.runInNewContext(read('data/adv-sentences.js'), audioContext, { filename: 'adv-sentences.js' });
vm.runInNewContext(read('data/audio-manifest.js'), audioContext, { filename: 'audio-manifest.js' });
const sentenceTexts = new Set((audioContext.window.ADV_SENTENCES || []).map((row) => row.th));
const sentenceAudio = audioContext.window.AUDIO_MANIFEST && audioContext.window.AUDIO_MANIFEST.sentences || {};
['ขอบคุณมาก', 'ขอเมนูหน่อย', 'เก็บเงินด้วย'].forEach((text) => {
  check('source/manifest exact audio key: ' + text,
    sentenceTexts.has(text) && !!sentenceAudio[text] && fs.existsSync(path.join(root, sentenceAudio[text])));
});
['ขอบคุณมากครับ', 'ขอเมนูหน่อยครับ', 'เก็บเงินด้วยครับ'].forEach((text) => {
  check('manifest ไม่มี polite-suffix orphan: ' + text, !sentenceAudio[text]);
});
const exactAudioMigration = read('supabase/migrations/20260816131431_phase1_sentence_audio_exact_text_fix.sql');
check('exact audio migration ถูกประกาศเป็น source-only และไม่ deploy เอง',
  /SOURCE ONLY/.test(exactAudioMigration) && /Do not apply/.test(exactAudioMigration));
['ขอบคุณมาก', 'ขอเมนูหน่อย', 'เก็บเงินด้วย'].forEach((text) => {
  check('exact audio migration มี metadata: ' + text,
    exactAudioMigration.includes("'" + text + "'") && exactAudioMigration.includes(sentenceAudio[text]));
});
check('exact audio migration ปิด orphan โดยไม่ลบ audit row',
  /status = 'needs_fix'/.test(exactAudioMigration) && /storage_path = null/.test(exactAudioMigration) && !/delete\s+from\s+public\.audio_assets/i.test(exactAudioMigration));

const protectedPaths = read('scripts/protected-runtime-paths.js');
['data/words-data.js', 'data/adv-sentences.js', 'data/audio-manifest.js', 'assets/word-audio/', 'assets/sentence-audio/']
  .forEach((value) => check('artifact excludes ' + value, protectedPaths.includes(value)));

const workflow = read('.github/workflows/deploy-protected-pages.yml');
check('Pages deploy เป็น manual only', /workflow_dispatch:/.test(workflow) && !/^\s*push:/m.test(workflow));
check('Pages deploy ใช้ protected artifact builder', /build-pages-artifact\.js _pages-build/.test(workflow));

const pagesConfig = read('_config.yml');
check('standard Pages ยังใช้ Jekyll exclusion', !fs.existsSync(path.join(root, '.nojekyll')));
[
  'data/words-data.js',
  'data/adv-sentences.js',
  'data/audio-manifest.js',
  'assets/word-audio',
  'assets/sentence-audio',
].forEach((value) => check('standard Pages excludes ' + value, pagesConfig.includes('- ' + value)));

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 's13-pages-'));
const build = spawnSync(process.execPath, [path.join(root, 'scripts/build-pages-artifact.js'), temp], { encoding: 'utf8' });
check('protected artifact build ผ่าน', build.status === 0);
check('artifact ไม่มี master datasets/audio catalog',
  !fs.existsSync(path.join(temp, 'data/words-data.js')) &&
  !fs.existsSync(path.join(temp, 'data/adv-sentences.js')) &&
  !fs.existsSync(path.join(temp, 'data/audio-manifest.js')) &&
  !fs.existsSync(path.join(temp, 'assets/word-audio')) &&
  !fs.existsSync(path.join(temp, 'assets/sentence-audio')));
fs.rmSync(temp, { recursive: true, force: true });

if (failures.length) {
  console.error('\nS13 protected architecture FAIL:');
  failures.forEach((label) => console.error('- ' + label));
  process.exit(1);
}
console.log('\nPASS S13 protected architecture: ' + passed + ' checks');
