#!/usr/bin/env node
'use strict';

// Phase 1 regression guard: Guest learning activity must never become account
// Progress/SRS/Mastered data after Login. This test is local-only and uses
// fake browser storage/Supabase objects; it never calls the network.

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const failures = [];
let passes = 0;

function read(rel) { return fs.readFileSync(path.join(root, rel), 'utf8'); }
function check(label, condition) {
  if (!condition) failures.push(label);
  else { passes++; console.log('✓ ' + label); }
}

function makeStorage(seed) {
  const values = Object.assign({}, seed || {});
  return {
    getItem(key) { return Object.prototype.hasOwnProperty.call(values, key) ? values[key] : null; },
    setItem(key, value) { values[key] = String(value); },
    removeItem(key) { delete values[key]; },
    dump() { return Object.assign({}, values); }
  };
}

// Execute auth-widget without starting its async auth boot. This exercises the
// real boundary helper rather than copying its logic into the test.
{
  const localStorage = makeStorage({
    tf_srs_v1: '{"guest":true}',
    rgv3_save: '{"guest":true}',
    linvault_v1: '[{"th":"guest-word"}]',
    sentence_vault_v1: '[{"th":"guest-sentence"}]',
    lego_vault_v1: '[{"th":"guest-lego-word"}]',
    gsh_resume_tone: '{"idx":2}'
  });
  const document = {
    readyState: 'loading',
    addEventListener() {},
    querySelector() { return null; },
    getElementById() { return null; },
    body: {}
  };
  function MutationObserver() { this.observe = function () {}; }
  const fakeClient = { auth: {} };
  const window = {
    SUPABASE_CONFIG: { url: 'https://example.invalid', anonKey: 'public-anon-key' },
    supabase: { createClient() { return fakeClient; } },
    getSupabaseClient() { return fakeClient; },
    addEventListener() {}
  };
  const sandbox = {
    window, document, localStorage, sessionStorage: makeStorage(), MutationObserver,
    console, setTimeout() {}, clearTimeout() {}, URL, URLSearchParams,
    Blob: function Blob() {}, navigator: {}, crypto: {},
  };
  vm.runInNewContext(read('js/core/auth-widget.js'), sandbox, { filename: 'auth-widget.js' });

  const boundary = window.PHASE1_ACCOUNT_BOUNDARY;
  check('boundary helper ถูกประกาศจาก auth-widget', !!boundary && typeof boundary.bind === 'function');
  check('Guest เปิดต่อได้โดยยังไม่ล้าง active local state', boundary.bind(null) === false && !!localStorage.getItem('tf_srs_v1'));

  boundary.bind({ id: 'user-a' });
  check('Login ครั้งแรกไม่ import Guest SRS', localStorage.getItem('tf_srs_v1') === null && localStorage.getItem('rgv3_save') === null);
  check('Login ครั้งแรกไม่ import คลังคำ/ประโยคของ Guest', localStorage.getItem('linvault_v1') === null && localStorage.getItem('sentence_vault_v1') === null && localStorage.getItem('lego_vault_v1') === null);
  check('Login ผูก local learning state กับ account ที่ยืนยันแล้ว', localStorage.getItem(boundary.ownerKey) === 'user-a');
  check('Guest resume ไม่ถูกลบเมื่อเปลี่ยน owner', localStorage.getItem('gsh_resume_tone') === '{"idx":2}');

  localStorage.setItem('tf_srs_v1', '{"account":true}');
  const epoch = window.SITE_AUTH.learningOwnerEpoch;
  boundary.bind({ id: 'user-a' });
  check('auth event ซ้ำของ account เดิมไม่ล้างข้อมูลบัญชี', !!localStorage.getItem('tf_srs_v1') && window.SITE_AUTH.learningOwnerEpoch === epoch);

  boundary.bind({ id: 'user-b' });
  check('สลับ account ไม่ให้ข้อมูล account เดิมปน account ใหม่', localStorage.getItem('tf_srs_v1') === null && localStorage.getItem(boundary.ownerKey) === 'user-b');

  localStorage.setItem('wo_srs_v1', '{"account":true}');
  boundary.bind(null);
  check('Logout ล้าง account learning cache ก่อนกลับเป็น Guest', localStorage.getItem('wo_srs_v1') === null && localStorage.getItem(boundary.ownerKey) === null);
}

// Static guards for the write paths that caused the real mismatch.
{
  const progress = read('js/score/phase1-canonical-state.js');
  const tone = read('js/games/tone-finder-game.js');
  const reading = read('js/games/reading-game-app.js');
  const typing = read('js/games/typing-game-app.js');
  const wordOrder = read('js/games/word-order-app.js');
  const wordVault = read('js/games/word-vault.js');
  const legoVault = read('js/games/lego-vault.js');
  const sentenceVault = read('js/games/sentence-vault.js');
  const readingAuth = read('js/games/reading-auth.js');
  const scoreSql = read('supabase/sql/2026-08-15_s29_authoritative_score_security.sql');

  check('progress pull ต้องผ่าน verified owner boundary', /function pull\(fromConflict\)\s*{\s*if \(!sb \|\| !user \|\| !ownerReady\(\)\) return;/.test(progress));
  check('progress push ต้องผ่าน verified owner boundary', /function push\(meta\)\s*{\s*if \(!sb \|\| !user \|\| !ownerReady\(\) \|\| !hasPending\(meta\)\) return;/.test(progress));
  check('tone Guest completion ไม่ถูกเก็บรอ Login', /if \(!API\.user\) return;/.test(readingAuth) && !/lastSession|pendingGuestScore/.test(readingAuth));
  check('tone session ป้องกัน complete event ซ้ำในรอบเดียวกัน', /submission_id: scoreSubmissionId\(\)/.test(readingAuth) && /submission_id uuid primary key/.test(scoreSql));
  check('Tone SRS หยุดทันทีเมื่อเป็น Guest', /if \(!tfSrsLoggedIn\(\)\) return; \/\/ Guest Free ไม่มี SRS/.test(tone));
  check('Reading reset in-memory SRS เมื่อ owner เปลี่ยน', /rgResetAccountStateAtBoundary\(\);\s*if\(!u\) return;/.test(reading));
  check('Typing reset in-memory SRS เมื่อ owner เปลี่ยน', /tgResetAccountStateAtBoundary\(\);\s*if\(!u\) return;/.test(typing));
  check('Word Order reset in-memory SRS เมื่อ owner เปลี่ยน', /woResetAccountStateAtBoundary\(\);\s*if\(!u\) return;/.test(wordOrder));
  check('我的單字 ใช้ได้หลังมี account owner เท่านั้น', /function _accountReady\(\)[\s\S]*return !!\(_sb && _uid\)/.test(wordVault) && /if \(!_accountReady\(\)\) \{ _requireLogin\(\); return false; \}/.test(wordVault));
  check('WordVault sync ผูก Phase 1 boundary ก่อนอ่านหรืออัปโหลด', /PHASE1_ACCOUNT_BOUNDARY\.bind\(nextUid \? \{ id: nextUid \} : null\)/.test(wordVault));
  check('SentenceVault sync ผูก Phase 1 boundary ก่อนอ่านหรืออัปโหลด', /PHASE1_ACCOUNT_BOUNDARY\.bind\(nextUid \? \{ id: nextUid \} : null\)/.test(sentenceVault));
  check('LegoVault sync ใช้ account owner และ tombstone', /vault_key: VAULT_KEY/.test(legoVault) && /deleted_at: new Date\(\)\.toISOString\(\)/.test(legoVault));
  check('auth ส่ง owner transition ให้คลังคำ/ประโยคทุกระบบ', /WordVault\.sync\(sb, uid\)/.test(readingAuth) && /SentenceVault\.sync\(sb, uid\)/.test(readingAuth) && /LegoVault\.sync\(sb, uid\)/.test(readingAuth));
}

if (failures.length) {
  console.error('\n❌ Phase 1 account boundary ไม่ผ่าน ' + failures.length + ' ข้อ:');
  failures.forEach((failure) => console.error('- ' + failure));
  process.exit(1);
}

console.log('\n✅ Phase 1 account boundary ผ่านครบ ' + passes + ' ข้อ');
