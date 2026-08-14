#!/usr/bin/env node
'use strict';

// Builds the only artifact that is safe to publish for S13.
// It excludes master datasets, the catalog-wide audio manifest and static game audio files.
const fs = require('fs');
const path = require('path');
const { isProtectedRuntimePath } = require('./protected-runtime-paths.js');

const ROOT = path.resolve(__dirname, '..');
const OUTPUT = path.resolve(process.argv[2] || path.join(ROOT, '_pages-build'));
const EXCLUDE_NAMES = new Set([
  '.git', '.github', '.netlify', '.DS_Store', '_archive', '_to_delete', '_dev',
  '_แผนงาน', '_บทความ-เตรียมเขียน', '_staging-build', '_staging-build-verify',
  '_pages-build', 'node_modules', 'scripts', 'supabase', 'CLAUDE.md', 'AGENTS.md',
]);

function assertSafeOutput() {
  if (OUTPUT === ROOT || OUTPUT === path.parse(OUTPUT).root) throw new Error('refusing unsafe output path');
  if (ROOT.startsWith(OUTPUT + path.sep)) throw new Error('output cannot contain repository root');
}
function excluded(relative, name) {
  return EXCLUDE_NAMES.has(name) || name.startsWith('.fuse_hidden') ||
    name.startsWith('_pages-build') || isProtectedRuntimePath(relative);
}
function copyDirectory(source, destination) {
  fs.mkdirSync(destination, { recursive: true });
  for (const entry of fs.readdirSync(source, { withFileTypes: true })) {
    const sourcePath = path.join(source, entry.name);
    const relative = path.relative(ROOT, sourcePath).replace(/\\/g, '/');
    if (excluded(relative, entry.name)) continue;
    const destinationPath = path.join(destination, entry.name);
    if (entry.isDirectory()) copyDirectory(sourcePath, destinationPath);
    else if (entry.isFile()) fs.copyFileSync(sourcePath, destinationPath);
  }
}
function verify() {
  const forbidden = [
    'data/words-data.js', 'data/adv-sentences.js', 'data/audio-manifest.js',
    'data/audio-disabled.js', 'assets/word-audio', 'assets/sentence-audio',
  ].filter((relative) => fs.existsSync(path.join(OUTPUT, relative)));
  if (forbidden.length) throw new Error('protected runtime paths leaked: ' + forbidden.join(', '));
  ['tone-finder.html', 'reading-game.html', 'listening-game.html', 'typing-game.html', 'word-order.html']
    .forEach((relative) => {
      const html = fs.readFileSync(path.join(OUTPUT, relative), 'utf8');
      if (!/protected-word-audio\.js/.test(html) || /data\/audio-manifest\.js/.test(html)) {
        throw new Error('Core 5 protected audio contract missing: ' + relative);
      }
    });
}

assertSafeOutput();
fs.rmSync(OUTPUT, { recursive: true, force: true });
copyDirectory(ROOT, OUTPUT);
verify();
console.log('PASS protected Pages artifact: ' + OUTPUT);
