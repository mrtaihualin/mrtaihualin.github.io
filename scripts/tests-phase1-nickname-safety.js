#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const policy = require(path.join(root, 'js/score/nickname-safety.js'));
const toneBoard = fs.readFileSync(path.join(root, 'js/score/leaderboard.js'), 'utf8');
const skillBoard = fs.readFileSync(path.join(root, 'js/score/reading-leaderboard.js'), 'utf8');
const migration = fs.readFileSync(path.join(root, 'supabase/migrations/20260817041659_phase1_nickname_safety.sql'), 'utf8');
const adminEdge = fs.readFileSync(path.join(root, 'supabase/functions/admin-player-accounts/index.ts'), 'utf8');
const adminPage = fs.readFileSync(path.join(root, 'admin-player-accounts.html'), 'utf8');
const authWidget = fs.readFileSync(path.join(root, 'js/core/auth-widget.js'), 'utf8');

function rejects(value, code) {
  const result = policy.validate(value);
  assert.strictEqual(result.ok, false, `${JSON.stringify(value)} must be rejected`);
  assert.strictEqual(result.code, code, `${JSON.stringify(value)} rejection code`);
}

assert.deepStrictEqual(policy.validate('  小林  '), { ok: true, value: '小林', code: null, message: '' });
assert.strictEqual(policy.validate('ＡＢＣ').value, 'ABC', 'NFKC normalizes full-width input');
assert.strictEqual(policy.validate('สุ​ดา').value, 'สุดา', 'zero-width evasion is removed');
assert.strictEqual(policy.validate('小   Ming').value, '小 Ming', 'whitespace collapses');
rejects('', 'empty');
rejects('A'.repeat(21), 'too_long');
rejects('<img onerror=x>', 'invalid_characters');
rejects('<script>x</script>', 'invalid_characters');
rejects('name@example.com', 'invalid_characters');
rejects('https://example.com', 'invalid_characters');
rejects('0912345678', 'contact_data');
rejects('LINE ID abc', 'contact_data');
rejects('f.u.c.k', 'inappropriate');
rejects('sh1t', 'inappropriate');
rejects('เหี​้ย', 'inappropriate');
rejects('雞 巴', 'inappropriate');
assert.strictEqual(policy.publicDisplayName('<svg/onload=alert(1)>'), '玩家');

[toneBoard, skillBoard].forEach((source) => {
  assert.match(source, /NICKNAME_SAFETY\.validate/, 'board validates before server save');
  assert.match(source, /set_leaderboard_nickname/, 'board uses guarded nickname RPC');
  assert.doesNotMatch(source, /from\(['"]profiles['"]\)\.upsert\(\{ user_id: currentUser\.id, nickname:/, 'board never writes private profile nickname');
  assert.match(source, /NICKNAME_SAFETY\.publicDisplayName/, 'board fail-closes unsafe server output');
  assert.match(source, /report_leaderboard_nickname/, 'board exposes report flow');
  assert.match(source, /esc\(displayName\)/, 'board escapes nickname before innerHTML rendering');
});

assert.match(migration, /create table if not exists public\.leaderboard_public_identities/, 'public identity is separate');
assert.match(migration, /create table if not exists public\.leaderboard_nickname_reports/, 'reports are private records');
assert.match(migration, /revoke all on table public\.leaderboard_nickname_reports from public, anon, authenticated/, 'report table is fail-closed');
assert.match(migration, /nickname_hidden/, 'safe fallback supports hidden nicknames');
assert.match(migration, /then i\.nickname else '玩家'/g, 'all boards use safe fallback');
assert.strictEqual((migration.match(/then i\.nickname else '玩家'/g) || []).length, 4, 'four RPCs cover all five boards');
assert.match(migration, /p_game in \('reading', 'listening', 'typing', 'word_order'\)/, 'four skill boards stay game-scoped');
assert.match(migration, /s\.game = 'tone'/, 'Tone board stays game-scoped');
assert.doesNotMatch(migration.match(/returns table\([^\n]+\)/g).filter((line) => /total_score/.test(line)).join('\n'), /user_id|email/, 'public board contracts expose no private identity');

assert.match(adminEdge, /moderate_leaderboard_nickname/, 'admin Edge has scoped moderation action');
assert.match(adminEdge, /nickname_action === 'hide'/, 'admin can hide');
assert.match(adminEdge, /nickname_action !== 'reset'/, 'admin accepts reset');
assert.doesNotMatch(adminEdge.match(/if \(action === 'moderate_leaderboard_nickname'\)[\s\S]*?return json\(\{ ok: true[\s\S]*?\n    \}/)?.[0] || '', /auth\.admin\.(deleteUser|updateUserById)/, 'moderation does not mutate auth identity');
assert.match(adminPage, /data-nickname-action="hide"/, 'admin UI wires hide');
assert.match(adminPage, /data-nickname-action="reset"/, 'admin UI wires reset');
assert.match(authWidget, /不會顯示在排行榜/, 'private profile copy no longer claims public exposure');

console.log('✓ Phase 1 nickname safety/security tests');
