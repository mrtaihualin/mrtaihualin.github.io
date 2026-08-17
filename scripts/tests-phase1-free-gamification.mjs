import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import { normalizeGamificationStatusBody } from '../supabase/functions/practice-events/practice-events-engine.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const migrationName = fs.readdirSync(path.join(root, 'supabase/migrations'))
  .find((name) => name.endsWith('_phase1_free_gamification_streak.sql'));
assert(migrationName, 'D08 migration must exist');

const sql = read('supabase/migrations/' + migrationName);
const edge = read('supabase/functions/practice-events/index.ts');
const practice = read('js/games/practice-events.js');
const account = read('js/games/game-account.js');
const toneEdge = read('supabase/functions/tone-round/index.ts');
const coreApps = [
  'js/games/tone-finder-game.js',
  'js/games/reading-game-app.js',
  'js/games/typing-game-app.js',
  'js/games/word-order-app.js',
].map(read).join('\n');
const coreHtml = [
  'tone-finder.html', 'reading-game.html', 'listening-game.html', 'typing-game.html', 'word-order.html',
].map(read);

let passed = 0;
function check(label, condition) {
  assert.ok(condition, label);
  passed += 1;
  console.log('PASS', label);
}

check('status action is a closed empty command',
  normalizeGamificationStatusBody({ action: 'gamification_status' }).action === 'gamification_status');
assert.throws(() => normalizeGamificationStatusBody({ action: 'status' }), /invalid_action/);
check('record RPC atomically combines Played evidence and gamification',
  /phase1_practice_events_record_and_gamification/.test(edge) &&
  /v_record := public\.phase1_practice_events_record\(/.test(sql) &&
  /jsonb_build_object\('gamification', v_gamification\)/.test(sql));
check('only server-received completed Played evidence can trigger eligibility',
  /from public\.practice_events e[\s\S]*e\.session_id = p_round_id[\s\S]*played-evidence-v1/.test(sql) &&
  /completed_report_required/.test(sql));
check('Asia Taipei owns the streak day boundary',
  (sql.match(/at time zone 'Asia\/Taipei'/g) || []).length >= 2);
check('one per-user transaction lock serializes record and streak writes',
  (sql.match(/phase1-free-streak:/g) || []).length >= 2 && /pg_advisory_xact_lock/.test(sql));
check('same-day repeats are unique and do not award again',
  /primary key \(user_id, eligible_day\)/.test(sql) && /on conflict \(user_id, eligible_day\) do nothing/.test(sql));
check('only complete confirmed outage-day coverage preserves a gap',
  /dependency_kind in \('platform', 'responsible_dependency'\)/.test(sql) &&
  /where confirmed = true[\s\S]*v_covered = v_missing/.test(sql));
check('browser roles have no table or RPC access',
  (sql.match(/revoke all on table/g) || []).length >= 3 &&
  (sql.match(/revoke all on function/g) || []).length >= 4 &&
  (sql.match(/from public, anon, authenticated/g) || []).length >= 7);
check('service role is the only app role granted streak mutation access',
  /grant execute on function public\.phase1_practice_events_record_and_gamification[\s\S]*to service_role/.test(sql));
check('Free tone SRS commit cannot write Star ledger or game account rewards',
  /'stars', 0[\s\S]*'totalStars', 0/.test(sql) &&
  !/insert into public\.star_ledger/.test(sql) &&
  !/update public\.game_accounts/.test(sql));
check('tone Edge no longer reads game_accounts for rewards',
  !/admin\.from\("game_accounts"\)/.test(toneEdge) && /stars: 0,[\s\S]*totalStars: 0/.test(toneEdge));
check('client applies server status after record and explicit refresh',
  /consumeGamification\(owner, result\.data\.gamification\)/.test(practice) &&
  /gamificationStatus: gamificationStatus/.test(practice));
check('Core apps contain no local Daily Streak writes or three-round daily goal',
  !/localStorage\.setItem\(TF_STREAK_KEY/.test(coreApps) &&
  !/DAILY_GOAL_SETS\s*:\s*3/.test(coreApps) &&
  !/STREAK_FREEZE_EARN_EVERY\s*:/.test(coreApps));
check('all five games load the current authoritative account and Played clients',
  coreHtml.every((html) => /game-account\.js\?v=5/.test(html) && /practice-events\.js\?v=3/.test(html)));
check('Free game markup no longer exposes Star, badge, or freeze controls',
  coreHtml.every((html) => !/(?:tf|rg)-freeze-num|(?:tf-)?star-count|(?:tf-)?badge-count|id="star-modal"|id="badge-modal"/.test(html)));

function accountHarness(userId) {
  const store = new Map();
  const window = {
    SITE_AUTH: { user: userId ? { id: userId } : null },
    READING_AUTH: { user: null },
    addEventListener() {},
    dispatchEvent() {},
  };
  const context = {
    window,
    SITE_AUTH: window.SITE_AUTH,
    READING_AUTH: window.READING_AUTH,
    Promise,
    CustomEvent: function CustomEvent() {},
    localStorage: {
      getItem(key) { return store.has(key) ? store.get(key) : null; },
      setItem(key, value) { store.set(key, String(value)); },
      removeItem(key) { store.delete(key); },
    },
  };
  vm.runInNewContext(account, context, { filename: 'game-account.js' });
  return { window, store };
}

{
  const guest = accountHarness('');
  check('Guest cannot receive a streak or any retired reward',
    guest.window.GAME_ACCOUNT.getStreak() === 0 &&
    guest.window.GAME_ACCOUNT.getStars() === 0 &&
    guest.window.GAME_ACCOUNT.addStars(99) === 0 &&
    guest.window.GAME_ACCOUNT.addHardStars(true, 3).stars === 0);
}

{
  const h = accountHarness('user-a');
  check('authoritative status is accepted only for the current account',
    h.window.GAME_ACCOUNT.consumeStatus({
      ok: true, current_streak: 4, status_as_of: '2026-08-17', last_eligible_day: '2026-08-17'
    }, 'user-a') && h.window.GAME_ACCOUNT.getStreak() === 4);
  check('late cross-account status is rejected',
    h.window.GAME_ACCOUNT.consumeStatus({
      ok: true, current_streak: 99, status_as_of: '2026-08-17', last_eligible_day: '2026-08-17'
    }, 'user-b') === false && h.window.GAME_ACCOUNT.getStreak() === 4);
  check('client bump compatibility cannot increment server streak',
    h.window.GAME_ACCOUNT.bumpStreakToday() === 4 && h.window.GAME_ACCOUNT.getStreak() === 4);
}

check('Free facade exposes no XP API or client database mutation',
  !/\b(?:addXP|getXP)\b/.test(account) && !/\.from\(['"]game_accounts['"]\)/.test(account));

console.log(`Phase 1 Free gamification source tests: ${passed}/${passed} PASS`);
