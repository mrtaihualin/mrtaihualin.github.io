#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const cp = require('child_process');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const failures = [];
const warnings = [];

function trackedFiles() {
  const tracked = cp.execFileSync('git', ['ls-files', '-z'], { cwd: root }).toString();
  const newFiles = cp.execFileSync('git', ['ls-files', '--others', '--exclude-standard', '-z'], { cwd: root }).toString();
  return [...new Set((tracked + newFiles).split('\0').filter(Boolean))];
}

function existsAsWebTarget(target) {
  if (fs.existsSync(target)) return true;
  if (!path.extname(target) && fs.existsSync(target + '.html')) return true;
  return fs.existsSync(path.join(target, 'index.html'));
}

function localTarget(owner, raw) {
  let value = String(raw || '').trim();
  if (!value || /^(?:#|https?:|mailto:|tel:|data:|blob:|javascript:|\/\/)/i.test(value)) return null;
  if (/[{}]/.test(value)) return null;
  value = value.split('#')[0].split('?')[0];
  if (!value) return null;
  try { value = decodeURIComponent(value); } catch (_) {}
  return value.startsWith('/')
    ? path.join(root, value.replace(/^\/+/, ''))
    : path.resolve(path.dirname(owner), value);
}

function checkReferences(file, text, regex, kind) {
  let match;
  while ((match = regex.exec(text))) {
    const target = localTarget(file, match[1]);
    if (!target || existsAsWebTarget(target)) continue;
    failures.push(`${path.relative(root, file)}: ${kind} ไม่พบไฟล์ "${match[1]}"`);
  }
}

function runNode(file) {
  const result = cp.spawnSync(process.execPath, ['--check', file], { cwd: root, encoding: 'utf8' });
  if (result.status !== 0) failures.push(`${path.relative(root, file)}: syntax ไม่ผ่าน\n${result.stderr.trim()}`);
}

function runTest(args, label) {
  const result = cp.spawnSync(process.execPath, args, { cwd: root, encoding: 'utf8' });
  if (result.status !== 0) failures.push(`${label}: ไม่ผ่าน\n${(result.stdout + result.stderr).trim()}`);
  else console.log(`✓ ${label}`);
}

const files = trackedFiles().filter((file) => fs.existsSync(path.join(root, file)));
const jsFiles = files.filter((file) => file.endsWith('.js'));
const htmlFiles = files.filter((file) => file.endsWith('.html'));
const cssFiles = files.filter((file) => file.endsWith('.css'));

jsFiles.forEach((file) => runNode(path.join(root, file)));
console.log(`✓ JavaScript syntax ${jsFiles.length} ไฟล์`);

htmlFiles.forEach((relative) => {
  const file = path.join(root, relative);
  const text = fs.readFileSync(file, 'utf8');
  const markup = text
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(?:code|pre)\b[^>]*>[\s\S]*?<\/(?:code|pre)>/gi, '');
  checkReferences(file, markup, /\b(?:href|src)\s*=\s*["']([^"']+)["']/gi, 'ลิงก์ HTML');

  const idMarkup = markup
    .replace(/(<script\b[^>]*>)[\s\S]*?<\/script>/gi, '$1</script>')
    .replace(/(<style\b[^>]*>)[\s\S]*?<\/style>/gi, '$1</style>');
  const ids = new Map();
  for (const match of idMarkup.matchAll(/\bid\s*=\s*["']([^"']+)["']/gi)) {
    ids.set(match[1], (ids.get(match[1]) || 0) + 1);
  }
  for (const [id, count] of ids) {
    if (count > 1) warnings.push(`${relative}: id="${id}" ซ้ำ ${count} จุด`);
  }

  let inlineIndex = 0;
  for (const match of text.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    const attrs = match[1];
    const body = match[2];
    if (/\bsrc\s*=/i.test(attrs) || /\btype\s*=\s*["'](?:application\/json|application\/ld\+json|importmap)["']/i.test(attrs)) continue;
    inlineIndex++;
    try { new vm.Script(body, { filename: `${relative}#inline-${inlineIndex}` }); }
    catch (error) { failures.push(`${relative}: inline script ${inlineIndex} syntax ไม่ผ่าน\n${error.message}`); }
  }
});
console.log(`✓ ตรวจ HTML ${htmlFiles.length} ไฟล์`);

cssFiles.forEach((relative) => {
  const file = path.join(root, relative);
  const text = fs.readFileSync(file, 'utf8');
  checkReferences(file, text, /url\(\s*["']?([^"')]+)["']?\s*\)/gi, 'ลิงก์ CSS');
});
console.log(`✓ ตรวจ CSS ${cssFiles.length} ไฟล์`);

runTest(['data/tests-tone-engine.js'], 'tone engine tests');
runTest(['data/tests-check-data-health.js'], 'data-health tests');
runTest(['data/check-duplicate-words.js'], 'duplicate-word check');
runTest(['data/check-data-health.js'], 'data-health check');

if (warnings.length) {
  console.log(`\nคำเตือน ${warnings.length} รายการ:`);
  warnings.forEach((item) => console.log(`- ${item}`));
}

if (failures.length) {
  console.error(`\nไม่ผ่าน ${failures.length} รายการ:`);
  failures.forEach((item) => console.error(`- ${item}`));
  process.exit(1);
}

console.log(`\n✅ ผ่านทั้งหมด — ${files.length} ไฟล์โปรเจกต์ที่มีอยู่ในเครื่อง`);
