'use strict';

// Isolated browser verification: real page/app bytes, approved fixtures, no external
// requests, account/session access, persistence outside the temporary browser, or DB writes.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');
const root = path.resolve(__dirname, '../..');
const catalog = JSON.parse(fs.readFileSync(path.join(root, 'data/approved-vocabulary-catalog.json'), 'utf8'));
const fixture = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(root, 'data/adv-sentences.js'), 'utf8'), fixture);
const payload = {
  tier: 'anon', words: catalog.records.map((catalog) => ({ catalog })),
  sentences: fixture.window.ADV_SENTENCES, audioAvailable: [], capped: {}
};
const origin = 'https://answer-review.test';

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    for (const size of [{ width: 1280, height: 720 }, { width: 390, height: 844 }]) {
      const context = await browser.newContext({ viewport: size, serviceWorkers: 'block' });
      await context.route('**/*', async (route) => {
        const url = new URL(route.request().url());
        if (url.pathname === '/functions/v1/game-content') {
          return route.fulfill({ json: payload, headers: { 'access-control-allow-origin': '*' } });
        }
        if (url.origin !== origin) {
          return route.fulfill({ status: 200, body: '', contentType: 'text/plain' });
        }
        const name = decodeURIComponent(url.pathname).slice(1);
        const file = path.resolve(root, name);
        if (!file.startsWith(root + path.sep) ||
            !/^(?:js\/|css\/|assets\/|fonts\/|tone-finder\.html$|reading-game\.html$|typing-game\.html$|word-order\.html$)/.test(name) ||
            !fs.existsSync(file) || !fs.statSync(file).isFile()) {
          return route.fulfill({ status: 404, body: '' });
        }
        const type = { '.js': 'application/javascript', '.html': 'text/html', '.css': 'text/css', '.svg': 'image/svg+xml' }[path.extname(file)];
        return route.fulfill({ body: fs.readFileSync(file), contentType: type || 'application/octet-stream' });
      });
      await context.addInitScript(() => {
        localStorage.setItem('cookieConsent', 'denied');
        localStorage.setItem('games_particle_mode', 'off');
        ['tone', 'reading', 'typing', 'wordorder'].forEach((game) => {
          localStorage.setItem('howto_tour_seen_' + game, '1');
          localStorage.setItem('howto_hint_seen_' + game, '1');
        });
      });
      for (const name of ['tone-finder', 'reading-game', 'typing-game', 'word-order']) {
        const page = await context.newPage();
        const errors = [];
        page.on('pageerror', (error) => errors.push(error.message));
        await page.goto(origin + '/' + name + '.html', { waitUntil: 'load' });
        await page.waitForFunction(() => document.documentElement.classList.contains('gc-ready'), { timeout: 20000 });
        const result = await page.evaluate((name) => {
          let count = 0;
          if (name === 'tone-finder') {
            ADV_SENTENCES.forEach((sentence, index) => {
              TF.startAdvSentence(index);
              session.words.forEach((word, wi) => {
                session.index = wi;
                S.syllables = word.syls.map((sy) => sy.th);
                S.parentWord = word.word;
                word.syls.forEach((sy, si) => {
                  S.selectedSyl = si; S.word = sy.th;
                  const html = tfAnswerRowsHtml(currentAnswerSyl());
                  if (!html.includes(buildAnswerHeader(sy)) || catalogToneNumber() !== sy.toneNumber) throw Error('Tone answer mismatch');
                  count++;
                });
              });
            });
          } else if (name === 'reading-game' || name === 'typing-game') {
            const original = WORD;
            WORDS.forEach((word) => {
              WORD = word;
              sylList = buildSyls(word);
              rgPronMode = false;
              showRevealMulti();
              if (document.getElementById('rev-pron').textContent !== '') throw Error('hidden reading leaked');
              const box = document.getElementById('bonus-reason');
              if (name === 'typing-game' && word.words && word.words.length) {
                for (const wd of word.words) if (!box.textContent.includes(wd.th) || !box.textContent.includes(wd.zh)) throw Error('sentence gloss missing');
              } else {
                for (const sy of sylList) {
                  if (!box.textContent.includes(buildAnswerHeader(sy))) throw Error('written header missing');
                  for (const row of buildAnswerRows(sy)) {
                    const text = document.createElement('div'); text.innerHTML = row.text;
                    if (!box.textContent.includes(text.textContent)) throw Error('answer row missing');
                  }
                }
              }
              rgPronMode = true; showRevealMulti();
              if (document.getElementById('rev-pron').textContent !== word.readingTH) throw Error('reading toggle mismatch');
              count++;
            });
            WORD = original;
            if (name === 'typing-game') {
              const sentenceIndex = WORDS.findIndex((word) => word.level === '高' && word.politeF === 'คะ');
              if (sentenceIndex < 0) throw Error('Typing polite fixture missing');
              roundQueue = [sentenceIndex]; cur = 0; tgParticleMode = 'off'; loadWord();
              if (sylList.some((syllable) => syllable.isParticle) || RG_TYPE.target !== WORD.th) throw Error('Typing OFF particle leak');
              tgToggleParticleMode();
              if (tgParticleMode !== 'm' || !sylList[sylList.length - 1].isParticle ||
                  sylList[sylList.length - 1].th !== 'ครับ' || RG_TYPE.target !== WORD.th + 'ครับ') throw Error('Typing male target missing');
              const scoreBeforeParticleError = tgCurWordScore();
              RG_CONT_SEG = sylList.length - 1;
              RG_TYPE.pos = WORD.th.length;
              rgContChar('x');
              if (tgCurWordScore() !== scoreBeforeParticleError || wordWrongTotal !== 0) throw Error('Typing particle changed score');
              Array.from('ครับ').forEach((character) => rgContChar(character));
              if (!checked) throw Error('Typing did not require the full male particle');
              tgParticleMode = 'f'; loadWord();
              if (!sylList[sylList.length - 1].isParticle || sylList[sylList.length - 1].th !== 'คะ' ||
                  RG_TYPE.target !== WORD.th + 'คะ') throw Error('Typing female target missing');
              count += 4;
            }
          } else {
            // Word Order keeps particles outside the tile answer and reports reviewed chunks with spaces.
            const itemLog = [];
            const originalAddItem = RoundReport.addItem;
            RoundReport.addItem = function(report, item) { itemLog.push(item); return originalAddItem.call(this, report, item); };
            const orderedTiles = () => Array.from(document.querySelectorAll('#wo-bank .wo-tile')).sort((a, b) =>
              Number(a.dataset.gshOriginalIndex) - Number(b.dataset.gshOriginalIndex));
            const answerFacts = () => {
              const chunks = orderedTiles().map((tile) => tile.querySelector('.wo-word-th').textContent);
              return { chunks, sentence: chunks.join(''), spaced: chunks.join(' ') };
            };
            const place = (tiles) => tiles.forEach((tile) => tile.click());
            const assertReport = (item, facts, label) => {
              if (!item || item.question !== facts.sentence || item.content_ref.key !== facts.sentence ||
                  item.correct_answer !== facts.spaced) throw Error('Word Order ' + label + ' report mismatch');
            };

            if (!orderedTiles().length || document.getElementById('wo-particle-line').textContent) throw Error('Word Order OFF state mismatch');
            const originalTileCount = orderedTiles().length;
            woToggleParticleMode();
            let facts = answerFacts();
            if (orderedTiles().length !== originalTileCount) throw Error('Word Order male particle became a tile');
            place(orderedTiles()); woCheck();
            if (document.getElementById('wo-particle-line').textContent !== 'ครับ') throw Error('Word Order male display tail missing');
            assertReport(itemLog[itemLog.length - 1], facts, 'correct');

            woToggleParticleMode();
            facts = answerFacts();
            const sentence = ADV_SENTENCES.find((candidate) => candidate.th === facts.sentence);
            const expectedFemale = sentence.politeF || 'ครับ';
            if (orderedTiles().length !== originalTileCount) throw Error('Word Order female particle became a tile');
            place(orderedTiles()); woCheck();
            if (document.getElementById('wo-particle-line').textContent !== expectedFemale) throw Error('Word Order female display tail missing: expected=' + expectedFemale + ' actual=' + document.getElementById('wo-particle-line').textContent);

            woNext();
            facts = answerFacts();
            woSkip();
            assertReport(itemLog[itemLog.length - 1], facts, 'skip');

            facts = answerFacts();
            const wrongTiles = orderedTiles();
            if (wrongTiles.length > 1) [wrongTiles[0], wrongTiles[1]] = [wrongTiles[1], wrongTiles[0]];
            place(wrongTiles);
            for (let attempt = 0; attempt < 4; attempt++) woCheck();
            assertReport(itemLog[itemLog.length - 1], facts, 'failed');
            count = 5;
          }
          return { count, overflow: document.documentElement.scrollWidth > innerWidth };
        }, name);
        assert.deepStrictEqual(errors, [], name + ': runtime errors');
        assert.strictEqual(result.overflow, false, name + ': horizontal overflow');
        console.log(JSON.stringify({ page: name, viewport: size, ...result, status: 'PASS' }));
        await page.close();
      }
      await context.close();
    }
  } finally { await browser.close(); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
