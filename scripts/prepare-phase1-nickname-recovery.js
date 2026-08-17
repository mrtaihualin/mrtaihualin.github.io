#!/usr/bin/env node
'use strict';

// P1-B-04 RECOVERY PREPARATION ONLY.
// This creates the exact source Delta for a recovery branch. It never deploys,
// runs SQL, contacts Supabase, commits, pushes, or touches Production.

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const root = path.resolve(__dirname, '..');
const priorRef = '575104d925273d30ef39b7068119f888a7444c09';
const mode = process.argv[2];

if (mode !== '--check' && mode !== '--apply') {
  throw new Error('usage: node scripts/prepare-phase1-nickname-recovery.js --check|--apply');
}

const priorBlobPaths = [
  'admin-player-accounts.html',
  'js/score/leaderboard.js',
  'js/score/reading-leaderboard.js',
  'supabase/functions/admin-player-accounts/index.ts',
];

const exactReplacements = {
  'js/core/auth-widget.js': [
    [
      '個人檔案名稱（不會顯示在排行榜）',
      '名稱（會顯示在這裡和排行榜）',
    ],
  ],
  'leaderboard.html': [
    ['<script src="js/score/nickname-safety.js?v=1"></script>\n', ''],
    ['<script src="js/score/leaderboard.js?v=13"></script>', '<script src="js/score/leaderboard.js?v=14"></script>'],
  ],
  'listening-board.html': [
    ['<script src="js/score/nickname-safety.js?v=1"></script>\n', ''],
    ['<script src="js/score/reading-leaderboard.js?v=9"></script>', '<script src="js/score/reading-leaderboard.js?v=10"></script>'],
  ],
  'reading-board.html': [
    ['<script src="js/score/nickname-safety.js?v=1"></script>\n', ''],
    ['<script src="js/score/reading-leaderboard.js?v=9"></script>', '<script src="js/score/reading-leaderboard.js?v=10"></script>'],
  ],
  'typing-board.html': [
    ['<script src="js/score/nickname-safety.js?v=1"></script>\n', ''],
    ['<script src="js/score/reading-leaderboard.js?v=9"></script>', '<script src="js/score/reading-leaderboard.js?v=10"></script>'],
  ],
  'word-order-board.html': [
    ['<script src="js/score/nickname-safety.js?v=1"></script>\n', ''],
    ['<script src="js/score/reading-leaderboard.js?v=9"></script>', '<script src="js/score/reading-leaderboard.js?v=10"></script>'],
  ],
};

function git(args) {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8' });
}

function replaceExactlyOnce(source, before, after, file) {
  const first = source.indexOf(before);
  if (first < 0 || source.indexOf(before, first + before.length) >= 0) {
    throw new Error(`${file}: expected exact recovery anchor once`);
  }
  return source.slice(0, first) + after + source.slice(first + before.length);
}

function sha256(source) {
  return crypto.createHash('sha256').update(source).digest('hex');
}

const outputs = new Map();
for (const file of priorBlobPaths) {
  outputs.set(file, git(['show', `${priorRef}:${file}`]));
}
for (const [file, replacements] of Object.entries(exactReplacements)) {
  let source = fs.readFileSync(path.join(root, file), 'utf8');
  for (const [before, after] of replacements) {
    source = replaceExactlyOnce(source, before, after, file);
  }
  outputs.set(file, source);
}

// Fail closed if the generated behavior is not the exact prior recovery shape.
for (const file of ['js/score/leaderboard.js', 'js/score/reading-leaderboard.js']) {
  const source = outputs.get(file);
  if (!/from\(['"]profiles['"]\)\.upsert\(\{ user_id: currentUser\.id, nickname: nickname \}/.test(source)
      || /set_leaderboard_nickname|report_leaderboard_nickname|get_my_leaderboard_identity|NICKNAME_SAFETY/.test(source)) {
    throw new Error(`${file}: prior board behavior was not restored exactly`);
  }
}
const adminEdge = outputs.get('supabase/functions/admin-player-accounts/index.ts');
const adminPage = outputs.get('admin-player-accounts.html');
if (/moderate_leaderboard_nickname|leaderboard_nickname_reports|leaderboard_public_identities/.test(adminEdge)
    || /data-nickname-action|leaderboard_nickname_hidden|pending_nickname_reports/.test(adminPage)) {
  throw new Error('admin nickname moderation behavior remains in the recovery output');
}
for (const file of Object.keys(exactReplacements).filter((name) => name.endsWith('-board.html') || name === 'leaderboard.html')) {
  if (/nickname-safety\.js/.test(outputs.get(file))) {
    throw new Error(`${file}: nickname rollout client remains loaded`);
  }
}

const summary = [];
for (const [file, source] of outputs) {
  const current = fs.readFileSync(path.join(root, file), 'utf8');
  summary.push({ file, changed: current !== source, sha256: sha256(source) });
}

const manifest = JSON.parse(fs.readFileSync(
  path.join(root, 'supabase/recovery/p1-b-04_nickname_recovery_manifest.json'),
  'utf8'
));
for (const item of summary) {
  if (manifest.generated_source_sha256[item.file] !== item.sha256) {
    throw new Error(`${item.file}: generated recovery hash differs from the exact approved manifest`);
  }
}
if (Object.keys(manifest.generated_source_sha256).length !== summary.length) {
  throw new Error('recovery manifest write-set differs from generated source write-set');
}

if (mode === '--apply') {
  for (const [file, source] of outputs) {
    const current = fs.readFileSync(path.join(root, file), 'utf8');
    if (current !== source) fs.writeFileSync(path.join(root, file), source);
  }
}

process.stdout.write(JSON.stringify({
  result: 'PASS',
  mode,
  priorRef,
  writeSet: summary,
  productionAction: 'NONE',
}, null, 2) + '\n');
