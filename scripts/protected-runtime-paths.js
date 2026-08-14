'use strict';

// Source/migration inputs that must never be present in a public runtime artifact.
const EXACT = new Set([
  'data/words-data.js',
  'data/adv-sentences.js',
  'data/audio-manifest.js',
  'data/audio-disabled.js',
]);
const PREFIXES = ['assets/word-audio/', 'assets/sentence-audio/'];

function normalize(relativePath) { return String(relativePath || '').replace(/\\/g, '/').replace(/^\.\//, ''); }
function isProtectedRuntimePath(relativePath) {
  const value = normalize(relativePath);
  return EXACT.has(value) || PREFIXES.some((prefix) => value === prefix.slice(0, -1) || value.startsWith(prefix));
}

module.exports = { EXACT, PREFIXES, isProtectedRuntimePath };
