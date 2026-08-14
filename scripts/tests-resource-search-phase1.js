#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'resources.html'), 'utf8');
const ResourceSearch = require(path.join(root, 'js/acquisition/resource-search.js'));
let passed = 0;

function test(label, fn) {
  try { fn(); passed++; console.log(`✓ ${label}`); }
  catch (error) { console.error(`✗ ${label}: ${error.message}`); process.exitCode = 1; }
}

test('resources.html has a labeled public Search control', () => {
  assert.match(html, /<label[^>]+for="resource-search-input"/);
  assert.match(html, /id="resource-search-input"[^>]+type="search"/);
  assert.match(html, /id="resource-search-button"[^>]+type="button"/);
});

test('results use an aria-live status container', () => {
  assert.match(html, /id="resource-search-results"[^>]+role="status"[^>]+aria-live="polite"/);
});

test('Resource Search script is loaded once', () => {
  assert.strictEqual((html.match(/js\/acquisition\/resource-search\.js/g) || []).length, 1);
});

test('empty query returns no guessed result', () => {
  assert.deepStrictEqual(ResourceSearch.searchCatalog('', ResourceSearch.BASE), []);
});

test('category terms map to Songs, Videos and Playlists', () => {
  assert.strictEqual(ResourceSearch.searchCatalog('歌曲', ResourceSearch.BASE)[0].id, 'songs');
  assert.strictEqual(ResourceSearch.searchCatalog('教學影片', ResourceSearch.BASE)[0].id, 'videos');
  assert.strictEqual(ResourceSearch.searchCatalog('播放清單', ResourceSearch.BASE)[0].id, 'playlists');
});

test('English matching is case and whitespace tolerant', () => {
  assert.strictEqual(ResourceSearch.searchCatalog('  YouTube ', ResourceSearch.BASE)[0].id, 'videos');
  assert.strictEqual(ResourceSearch.searchCatalog('PLAYLIST', ResourceSearch.BASE)[0].id, 'playlists');
});

test('unknown query returns the explicit no-result branch', () => {
  assert.deepStrictEqual(ResourceSearch.searchCatalog('zzz-no-resource-match', ResourceSearch.BASE), []);
});

test('result rendering avoids query-driven innerHTML', () => {
  const source = fs.readFileSync(path.join(root, 'js/acquisition/resource-search.js'), 'utf8');
  assert.doesNotMatch(source, /innerHTML\s*=/);
  assert.match(source, /textContent\s*=/);
});

if (!process.exitCode) console.log(`\n✅ Phase 1 Resource Search passed (${passed} checks)`);
