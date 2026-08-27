import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  HIDDEN_REVIEW_SCORE_DEFAULT_ENABLED,
  LEARNING_SCORE_VERIFIER_VERSION,
  verifyLearningScore,
  verifyRoundLearningScores,
} from '../supabase/functions/score-submit/learning-score-verifier.mjs';

let passed = 0;
function check(name, fn) {
  fn();
  passed += 1;
  process.stdout.write('PASS ' + name + '\n');
}

function rejects(code, fn) {
  assert.throws(fn, (error) => error && error.code === code);
}

const word = { word: 'กา', level: '初', syls: [{ th: 'กา' }], read_syls: null, reading_th: 'กา' };
const longWord = { word: 'มหาวิทยาลัย', level: '中', syls: new Array(6).fill({}), read_syls: null, reading_th: 'มะ-หา-วิด-ทะ-ยา-ไล' };
const sentence = { th: 'ฉัน เรียน ภาษา ไทย', wc: 8, reading_th: 'ฉัน-เรียน-พา-สา-ไท-ทุก-วัน-เลย', words: [] };

check('hidden verifier is default OFF and versioned', () => {
  assert.equal(HIDDEN_REVIEW_SCORE_DEFAULT_ENABLED, false);
  assert.equal(LEARNING_SCORE_VERIFIER_VERSION, 'phase1-learning-score-v1');
});

check('Tone uses the raw 10/7/4/1/0 ladder before every bonus', () => {
  const out = verifyLearningScore({ game: 'tone', difficulty: '初', item: { key: 'กา', wrong: 1 }, canonicalRows: [word] });
  assert.deepEqual(out, { serverVerified: true, verifiedBy: 'edge:tone:v1', score: 7, contentRef: { source: 'game_words', key: 'กา@1' } });
  assert.equal(verifyLearningScore({ game: 'tone', difficulty: '初', item: { key: 'กา', wrong: 0, guide: true }, canonicalRows: [word] }).score, 0);
});

check('Tone component evidence averages raw component scores without combo or golden values', () => {
  const out = verifyLearningScore({ game: 'tone', difficulty: '初', item: { key: 'กา', wrong: 3, learningEvidence: { componentWrongCounts: [0, 2] } }, canonicalRows: [word] });
  assert.equal(out.score, 7);
});

check('Reading verifies first-check syllable evidence against canonical units and excludes long-item bonus', () => {
  const out = verifyLearningScore({ game: 'reading', difficulty: '高', item: { key: sentence.th, wrong: 3, learningEvidence: { firstCheckSyllableWrongCounts: [0, 0, 0, 0, 0, 0, 0, 4] } }, canonicalRows: [sentence] });
  assert.equal(out.score, 10);
  assert.deepEqual(out.contentRef, { source: 'game_sentences', key: sentence.th });
});

check('Reading fails closed on missing or mismatched first-check evidence', () => {
  rejects('missing_reading_first_check_evidence', () => verifyLearningScore({ game: 'reading', difficulty: '初', item: { key: 'กา', wrong: 0 }, canonicalRows: [word] }));
  rejects('reading_unit_count_mismatch', () => verifyLearningScore({ game: 'reading', difficulty: '初', item: { key: 'กา', wrong: 0, learningEvidence: { firstCheckSyllableWrongCounts: [0, 0] } }, canonicalRows: [word] }));
});

check('Typing derives quota from protected canonical units and never trusts item points', () => {
  const out = verifyLearningScore({ game: 'typing', difficulty: '中', item: { key: longWord.word, wrong: 2, points: 999 }, canonicalRows: [longWord] });
  assert.equal(out.score, 7);
  assert.deepEqual(out.contentRef, { source: 'game_words', key: longWord.word + '@2' });
});

check('Listening returns only primary listening score and excludes typing bonus', () => {
  const typed = verifyLearningScore({ game: 'listening', difficulty: 'mixed', item: { key: 'กา', contentRef: { source: 'game_words', key: 'กา@1' }, wrong: 0, correct: true, mode: 'type', listens: 3, typingWrong: 0, points: 17 }, canonicalRows: [word] });
  const mc = verifyLearningScore({ game: 'listening', difficulty: 'mixed', item: { key: 'กา', contentRef: { source: 'game_words', key: 'กา@1' }, wrong: 0, correct: true, mode: 'mc', listens: 1, points: 5 }, canonicalRows: [word] });
  assert.equal(typed.score, 7);
  assert.equal(mc.score, 5);
});

check('Word Order verifies wrong and hint primitives before combo/golden/level bonuses', () => {
  const out = verifyLearningScore({ game: 'word_order', difficulty: '高', item: { key: sentence.th, wrong: 1, guide: true, failed: false, points: 99, learningEvidence: { hintCount: 1 } }, canonicalRows: [sentence] });
  assert.equal(out.score, 5);
});

check('Word Order fails closed when hint or failure evidence conflicts', () => {
  rejects('hint_evidence_mismatch', () => verifyLearningScore({ game: 'word_order', difficulty: '高', item: { key: sentence.th, wrong: 0, guide: false, failed: false, learningEvidence: { hintCount: 1 } }, canonicalRows: [sentence] }));
  rejects('word_order_failure_mismatch', () => verifyLearningScore({ game: 'word_order', difficulty: '高', item: { key: sentence.th, wrong: 1, guide: false, failed: true, learningEvidence: { hintCount: 0 } }, canonicalRows: [sentence] }));
});

check('Client-computed learning scores are rejected, not compared or copied', () => {
  rejects('client_learning_score_forbidden', () => verifyLearningScore({ game: 'tone', difficulty: '初', item: { key: 'กา', wrong: 0, learning_score: 10 }, canonicalRows: [word] }));
});

check('Missing and duplicate canonical content both fail closed', () => {
  rejects('content_ref_not_unique', () => verifyLearningScore({ game: 'tone', difficulty: '初', item: { key: 'กา', wrong: 0 }, canonicalRows: [] }));
  rejects('content_ref_not_unique', () => verifyLearningScore({ game: 'tone', difficulty: '初', item: { key: 'กา', wrong: 0 }, canonicalRows: [word, { ...word }] }));
});

check('Listening stable level suffix disambiguates the same word across levels', () => {
  const otherLevel = { ...word, level: '中' };
  const out = verifyLearningScore({ game: 'listening', difficulty: 'mixed', item: { key: 'กา', contentRef: { source: 'game_words', key: 'กา@2' }, wrong: 0, correct: true, mode: 'type', listens: 1 }, canonicalRows: [word, otherLevel] });
  assert.equal(out.score, 10);
  assert.deepEqual(out.contentRef, { source: 'game_words', key: 'กา@2' });
});

check('One round cannot emit the same stable item twice', () => {
  rejects('duplicate_stable_item_in_round', () => verifyRoundLearningScores({ game: 'tone', difficulty: '初', items: [{ key: 'กา', wrong: 0 }, { key: 'กา', wrong: 1 }], canonicalRows: [word] }));
});

check('Tone sentence components aggregate once for one stable sentence item', () => {
  const toneSentence = { ...sentence, words: [{ th: 'ฉัน' }, { th: 'เรียน' }] };
  const out = verifyRoundLearningScores({
    game: 'tone', difficulty: '高', requireExplicitContentRef: true,
    items: [
      { key: 'ฉัน', contentRef: { source: 'game_sentences', key: sentence.th }, wrong: 0 },
      { key: 'เรียน', contentRef: { source: 'game_sentences', key: sentence.th }, wrong: 2 },
    ],
    canonicalRows: [toneSentence],
  });
  assert.equal(out.length, 1);
  assert.equal(out[0].score, 7);
  assert.deepEqual(out[0].contentRef, { source: 'game_sentences', key: sentence.th });
});

check('real five-game source supplies explicit stable refs and required primitive evidence', () => {
  const root = new URL('../', import.meta.url);
  const sources = {
    tone: fs.readFileSync(new URL('js/games/tone-finder-game.js', root), 'utf8'),
    reading: fs.readFileSync(new URL('js/games/reading-game-app.js', root), 'utf8'),
    listening: fs.readFileSync(new URL('js/games/listening-game-app.js', root), 'utf8'),
    typing: fs.readFileSync(new URL('js/games/typing-game-app.js', root), 'utf8'),
    wordOrder: fs.readFileSync(new URL('js/games/word-order-app.js', root), 'utf8'),
  };
  Object.values(sources).forEach((source) => assert.match(source, /contentRef:/));
  assert.match(sources.tone, /componentWrongCounts/);
  assert.match(sources.reading, /firstCheckSyllableWrongCounts/);
  assert.match(sources.wordOrder, /hintCount/);
  assert.match(sources.listening, /mode: entry\.mode, listens: entry\.listens, correct: entry\.correct/);
  assert.match(sources.typing, /wrong:Number\(w\.wrong\)/);
});

process.stdout.write('LEARNING_SCORE_VERIFIER_PASS ' + passed + '\n');
