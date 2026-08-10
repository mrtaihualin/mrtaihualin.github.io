#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const MAX_TEXT_FILE_BYTES = 2 * 1024 * 1024;
const TEXT_EXTENSIONS = new Set([
  '.bash', '.cjs', '.conf', '.config', '.css', '.env', '.html', '.ini', '.js', '.json',
  '.jsx', '.log', '.md', '.mjs', '.sh', '.sql', '.toml', '.ts', '.tsx', '.txt', '.xml',
  '.yaml', '.yml', '.zsh'
]);

// ใช้กับการตรวจ syntax/ลิงก์ของเว็บ (listRepositoryFiles → check-site.js) เท่านั้น —
// โฟลเดอร์เหล่านี้ไม่ใช่ไฟล์เว็บที่ deploy จริง ตรวจลิงก์/syntax ของไฟล์ร่าง/ทดสอบข้างในจะได้แค่ noise
// ⚠️ ห้ามใช้ชุดนี้กับตัวกันค่าลับ (scanProject) — ดู SECRET_SCAN_SKIP_DIRECTORY_NAMES ด้านล่าง
const SITE_VALIDATION_SKIP_DIRECTORY_NAMES = new Set([
  '.git',
  'node_modules',
  '_dev',
  '_แผนงาน',
  '_บทความ-เตรียมเขียน',
  '_archive',
  '_to_delete'
]);

// ตัวกันค่าลับต้องสแกนทุกไฟล์เอกสารจริงใน working tree รวม _dev/_แผนงาน/_บทความ-เตรียมเขียน/_archive/_to_delete
// ด้วยเสมอ — ข้ามเฉพาะโฟลเดอร์ระบบ/dependency ที่ไม่มีทางมีเอกสารของ Lin (2026-08-07 แก้ fail-open:
// เดิมข้ามทั้งโฟลเดอร์ ไฟล์ข้างในไม่เคยถูกสแกนเลย ทั้งที่ .gitignore กันได้แค่ git add ไม่ได้กันไม่ให้ค่าลับ
// นอนอยู่ในไฟล์เงียบๆ ถ้ามีคน git add -f หรือแก้ .gitignore ทีหลังก็หลุดได้ทันทีโดยไม่มีด่านตรวจ)
const SECRET_SCAN_SKIP_DIRECTORY_NAMES = new Set([
  '.git',
  'node_modules'
]);

const PUBLIC_CONTEXTS = Object.freeze({
  supabaseAnon: new Set([
    'classroom/index.html',
    'classroom/liff-open.html',
    'classroom/line-link.html',
    'data/game-content-tester.html',
    'js/core/shared.js',
    'js/core/shared.min.js',
    'js/core/supabase-config.js',
    'js/games/game-content-client.js',
    'pricing.html',
    // 2026-08-10: 3 ไฟล์นี้ถูกย้ายเข้าโฟลเดอร์ "เลิกใช้แล้ว_ห้ามรัน/" แล้ว (ไฟล์เก่าไม่ได้รันจริง)
    // แก้ path ให้ตรงตำแหน่งปัจจุบัน — เนื้อหา/anon key เดิมไม่เปลี่ยน แค่ที่อยู่ไฟล์เปลี่ยน
    'supabase/sql/เลิกใช้แล้ว_ห้ามรัน/2026-07-17_pg_cron_calendar_schedule_sync.sql',
    'supabase/sql/เลิกใช้แล้ว_ห้ามรัน/2026-07-18_pg_cron_low_quota_daily.sql',
    'supabase/sql/เลิกใช้แล้ว_ห้ามรัน/2026-07-30_shorten_calendar_schedule_sync_interval.sql'
  ]),
  youtube: new Set([
    'index.html',
    'resources.html',
    'js/core/shared.js',
    'js/core/shared.min.js',
    'js/acquisition/index-content-modals.js'
  ]),
  web3forms: new Set([
    'classroom/pay.html',
    'community.html',
    'js/classroom/student-requests.js',
    'js/classroom/teacher-request-admin.js',
    'js/core/shared.js',
    'js/core/shared.min.js',
    'js/games/reading-game-app.js',
    'js/games/reading-game-app.min.js',
    'js/games/tone-finder-game.js',
    'js/games/tone-finder-game.min.js',
    'js/games/typing-game-app.js',
    'js/games/typing-game-app.min.js',
    'js/games/word-order-app.js',
    'js/games/word-order-app.min.js',
    'page-services.html',
    'tone-finder.html'
  ])
});

const SECRET_CONFIG_NAMES = [
  'SUPABASE_SERVICE_ROLE_KEY',
  'LINE_CHANNEL_ACCESS_TOKEN',
  'LINE_CHANNEL_SECRET',
  'GOOGLE_CLIENT_SECRET',
  'GOOGLE_CALENDAR_REFRESH_TOKEN',
  'GOOGLE_SERVICE_ACCOUNT_KEY',
  'GAME_REWARD_ADMIN_KEY'
];

const GENERIC_SECRET_NAMES = [
  'access_key',
  'access_token',
  'admin_key',
  'api_key',
  'channel_secret',
  'client_secret',
  'password',
  'private_key',
  'refresh_token',
  'service_role_key'
];

function normalizeRelative(file) {
  return file.split(path.sep).join('/').replace(/^\.\//, '');
}

function shouldSkipDirectory(name, relative, skipNames) {
  if (skipNames.has(name)) return true;
  if (name.startsWith('_backup_')) return true;
  return normalizeRelative(relative) === 'supabase/.temp';
}

function isIgnoredProjectFile(relative) {
  const file = normalizeRelative(relative);
  const base = path.posix.basename(file);
  if (forbiddenFilenameType(file)) return true;
  if (file === 'lead-magnet-tones.html') return true;
  if (file === 'CLAUDE.md') return true;
  if (file === 'assets/testimonials/IMG_C989003FFDD6-1.jpeg') return true;
  if (base === '.DS_Store' || base.startsWith('.fuse_hidden')) return true;
  if (base.startsWith('check_old_tmp')) return true;
  return /\.docx$/i.test(base) || /\.min\.js\.bak$/i.test(base);
}

function walkFiles(scanRoot, skipNames) {
  const result = [];
  const stack = [''];
  while (stack.length) {
    const relativeDir = stack.pop();
    const absoluteDir = path.join(scanRoot, relativeDir);
    let entries;
    try {
      entries = fs.readdirSync(absoluteDir, { withFileTypes: true });
    } catch (_) {
      continue;
    }
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      const relative = path.join(relativeDir, entry.name);
      if (entry.isDirectory()) {
        if (!shouldSkipDirectory(entry.name, relative, skipNames)) stack.push(relative);
      } else if (entry.isFile()) {
        result.push(normalizeRelative(relative));
      }
    }
  }
  return result.sort();
}

function listRepositoryFiles(scanRoot) {
  return walkFiles(scanRoot, SITE_VALIDATION_SKIP_DIRECTORY_NAMES).filter((file) => !isIgnoredProjectFile(file));
}

function safeEnvironmentExample(relative) {
  const base = path.posix.basename(relative);
  return base === '.env.example' || base === '.env.template';
}

function isTextCandidate(relative) {
  const base = path.posix.basename(relative);
  if (['.env', '.netrc', '.npmrc', '.pypirc', 'Dockerfile'].includes(base)) return true;
  return TEXT_EXTENSIONS.has(path.posix.extname(base).toLowerCase());
}

function forbiddenFilenameType(relative) {
  const base = path.posix.basename(relative);
  if ((base === '.env' || base.startsWith('.env.')) && !safeEnvironmentExample(relative)) {
    return 'ไฟล์ environment ที่อาจมีค่าลับ';
  }
  if (/\.(?:pem|key|p12|pfx)$/i.test(base) || /^(?:id_rsa|id_ed25519)$/i.test(base)) {
    return 'ไฟล์ private key';
  }
  if (/service[-_]?account.*\.json$/i.test(base) || /^credentials.*\.json$/i.test(base)) {
    return 'ไฟล์ service-account/credential JSON';
  }
  if (/^(?:\.npmrc|\.pypirc|\.netrc)$/i.test(base)) {
    return 'ไฟล์ credential configuration';
  }
  return null;
}

function lineNumberAt(text, index) {
  let line = 1;
  for (let i = 0; i < index; i++) {
    if (text.charCodeAt(i) === 10) line++;
  }
  return line;
}

function addFinding(findings, seen, type, file, line) {
  const normalizedLine = Number.isInteger(line) && line > 0 ? line : null;
  const key = `${type}\0${file}\0${normalizedLine || ''}`;
  if (seen.has(key)) return;
  seen.add(key);
  findings.push({ type, file: normalizeRelative(file), line: normalizedLine });
}

function decodeJwtPayload(token) {
  try {
    const payload = token.split('.')[1];
    const padded = payload.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - payload.length % 4) % 4);
    return JSON.parse(Buffer.from(padded, 'base64').toString('utf8'));
  } catch (_) {
    return null;
  }
}

function isPlaceholder(value) {
  const clean = String(value || '').trim();
  const normalized = clean.replace(/\\[nrt].*$/s, '').replace(/[);,]+$/g, '').trim();
  if (!clean) return true;
  if (/^\$\([^)]+\)$/.test(clean)) return true;
  if (/^<[^>]+>$/.test(normalized)) return true;
  if (/^\$\{\{[^}]+\}\}$/.test(normalized)) return true;
  if (/\$\{[^}]+\}/.test(normalized)) return true;
  if (/^(?:Deno|process|import\.meta)\.env\b/i.test(normalized)) return true;
  if (/^(?:example|placeholder|redacted|changeme|not[-_ ]?set)$/i.test(normalized)) return true;
  if (/^(?:\.{3,}|x{4,})$/i.test(normalized)) return true;
  if (/^[([]/.test(normalized)) return true;
  // ค่าลับจริง (JWT/hex/base64/token) เป็นตัวอักษรละตินเสมอ ไม่มีทางมีตัวอักษรไทย
  // ข้อความคำแนะนำในคอมเมนต์ เช่น "ใส่ค่าที่ได้จาก Google Cloud" จึงไม่ใช่ค่าลับจริงแน่นอน
  if (/[฀-๿]/.test(clean)) return true;
  return /^(?:YOUR|REPLACE|INSERT|EXAMPLE|PLACEHOLDER)[-_ A-Z0-9]+$/i.test(normalized);
}

function publicContextAllowed(kind, relative, text) {
  const file = normalizeRelative(relative);
  if (kind === 'supabase-anon') return PUBLIC_CONTEXTS.supabaseAnon.has(file);
  if (kind === 'youtube') {
    return PUBLIC_CONTEXTS.youtube.has(file) && /youtube|googleapis\.com\/youtube/i.test(text);
  }
  if (kind === 'web3forms') {
    return PUBLIC_CONTEXTS.web3forms.has(file) && /web3forms/i.test(text);
  }
  return false;
}

function scanJsonStructure(relative, text, findings, seen) {
  if (!relative.toLowerCase().endsWith('.json')) return;
  let value;
  try {
    value = JSON.parse(text);
  } catch (_) {
    return;
  }
  if (!value || Array.isArray(value) || typeof value !== 'object') return;
  if (value.type === 'service_account' && value.private_key && value.private_key_id && value.client_email) {
    const marker = text.indexOf('"type"');
    addFinding(findings, seen, 'Google service-account JSON', relative, lineNumberAt(text, Math.max(0, marker)));
  }
}

function scanTokens(relative, text, findings, seen) {
  const privateKey = /-----BEGIN (?:[A-Z0-9 ]+ )?PRIVATE KEY-----(?:\r?\n|\\n)/g;
  for (const match of text.matchAll(privateKey)) {
    addFinding(findings, seen, 'private key', relative, lineNumberAt(text, match.index));
  }

  const providerPatterns = [
    ['GitHub token', /\b(?:gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})\b/g],
    ['Stripe secret key', /\bsk_(?:live|test)_[A-Za-z0-9]{16,}\b/g],
    ['Slack token', /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g],
    ['AWS access key', /\bAKIA[0-9A-Z]{16}\b/g],
    ['Supabase server secret', /\bsb_secret_[A-Za-z0-9_-]{20,}\b/g],
    ['Google OAuth client secret', /\bGOCSPX-[A-Za-z0-9_-]{20,}\b/g]
  ];
  for (const [type, regex] of providerPatterns) {
    for (const match of text.matchAll(regex)) {
      addFinding(findings, seen, type, relative, lineNumberAt(text, match.index));
    }
  }

  const jwtPattern = /\beyJ[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{5,}\.[A-Za-z0-9_-]{8,}\b/g;
  for (const match of text.matchAll(jwtPattern)) {
    const payload = decodeJwtPayload(match[0]);
    const role = payload && payload.role;
    if (role === 'anon' && publicContextAllowed('supabase-anon', relative, text)) continue;
    const type = role === 'service_role' ? 'Supabase service-role JWT' : 'JWT/token';
    addFinding(findings, seen, type, relative, lineNumberAt(text, match.index));
  }

  const googleKeyPattern = /\bAIza[0-9A-Za-z_-]{35}\b/g;
  for (const match of text.matchAll(googleKeyPattern)) {
    if (publicContextAllowed('youtube', relative, text)) continue;
    addFinding(findings, seen, 'Google API key นอกบริบท browser ที่อนุญาต', relative, lineNumberAt(text, match.index));
  }

  const supabasePublishablePattern = /\bsb_publishable_[A-Za-z0-9_-]{20,}\b/g;
  for (const match of text.matchAll(supabasePublishablePattern)) {
    if (publicContextAllowed('supabase-anon', relative, text)) continue;
    addFinding(findings, seen, 'Supabase publishable key นอกบริบทที่อนุญาต', relative, lineNumberAt(text, match.index));
  }

  const web3formsPattern = /\baccess_key\b[\s\S]{0,120}?\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi;
  for (const match of text.matchAll(web3formsPattern)) {
    if (publicContextAllowed('web3forms', relative, text)) continue;
    addFinding(findings, seen, 'Web3Forms access key นอกบริบท browser ที่อนุญาต', relative, lineNumberAt(text, match.index));
  }
}

function assignmentMatches(text, names, includeUnquoted = true) {
  const escaped = names.map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
  const quoted = new RegExp(`["']?\\b(${escaped})\\b["']?\\s*(?:=|:)\\s*(["'\\x60])([^"'\\x60\\r\\n]*)\\2`, 'gi');
  const unquoted = new RegExp(`\\b(${escaped})\\b\\s*(?:=|:)\\s*([^\\s#;,"'\\x60]+)`, 'gi');
  const matches = [...text.matchAll(quoted)].map((match) => ({ match, quoted: true }));
  if (includeUnquoted) matches.push(...[...text.matchAll(unquoted)].map((match) => ({ match, quoted: false })));
  return matches
    .map(({ match, quoted: isQuoted }) => ({
      name: match[1],
      value: match[3] === undefined ? match[2] : match[3],
      index: match.index,
      quoted: isQuoted
    }))
    .sort((a, b) => a.index - b.index);
}

function supportsUnquotedSecrets(relative) {
  const base = path.posix.basename(relative).toLowerCase();
  if (['.env', '.netrc', '.npmrc', '.pypirc'].includes(base)) return true;
  return /\.(?:conf|config|env|ini|log|md|toml|txt|ya?ml)$/i.test(base);
}

function scanAssignments(relative, text, findings, seen) {
  for (const match of assignmentMatches(text, SECRET_CONFIG_NAMES)) {
    if (isPlaceholder(match.value)) continue;
    if (!match.quoted && !/^[A-Za-z0-9._~+/=-]{12,}$/.test(match.value)) continue;
    addFinding(findings, seen, `ค่าฝังของ ${match.name.toUpperCase()}`, relative, lineNumberAt(text, match.index));
  }

  for (const match of assignmentMatches(text, GENERIC_SECRET_NAMES, supportsUnquotedSecrets(relative))) {
    const name = match.name.toLowerCase();
    const value = String(match.value || '').trim();
    if (isPlaceholder(value) || value.length < 8) continue;
    if (!match.quoted && !/^[^\s]{8,}$/.test(value)) continue;
    if (name === 'api_key' && /^AIza[0-9A-Za-z_-]{35}$/.test(value) && publicContextAllowed('youtube', relative, text)) continue;
    if (name === 'access_key' && /^[0-9a-f-]{24,}$/i.test(value) && publicContextAllowed('web3forms', relative, text)) continue;
    addFinding(findings, seen, `ค่า ${name} ที่ฝังในไฟล์`, relative, lineNumberAt(text, match.index));
  }

  const bearer = /\bAuthorization\b\s*[:=,]?\s*["']?Bearer\s+([A-Za-z0-9._~-]{16,})/gi;
  for (const match of text.matchAll(bearer)) {
    if (isPlaceholder(match[1])) continue;
    addFinding(findings, seen, 'Bearer token ที่ฝังในไฟล์', relative, lineNumberAt(text, match.index));
  }
}

function scanText(relative, text, findings, seen) {
  scanJsonStructure(relative, text, findings, seen);
  scanTokens(relative, text, findings, seen);
  scanAssignments(relative, text, findings, seen);
}

function scanProject(scanRoot) {
  const root = path.resolve(scanRoot);
  const allFiles = walkFiles(root, SECRET_SCAN_SKIP_DIRECTORY_NAMES);
  const findings = [];
  const seen = new Set();
  const skippedLargeFiles = [];

  for (const relative of allFiles) {
    const filenameType = forbiddenFilenameType(relative);
    if (filenameType) addFinding(findings, seen, filenameType, relative, null);
  }

  for (const relative of allFiles) {
    if (isIgnoredProjectFile(relative)) continue;
    const absolute = path.join(root, relative);
    let stat;
    try {
      stat = fs.statSync(absolute);
    } catch (_) {
      continue;
    }
    if (stat.size > MAX_TEXT_FILE_BYTES) {
      if (isTextCandidate(relative)) skippedLargeFiles.push(relative);
      continue;
    }
    let buffer;
    try {
      buffer = fs.readFileSync(absolute);
    } catch (_) {
      continue;
    }
    if (buffer.includes(0)) continue;
    scanText(relative, buffer.toString('utf8'), findings, seen);
  }

  findings.sort((a, b) => a.file.localeCompare(b.file) || (a.line || 0) - (b.line || 0) || a.type.localeCompare(b.type));
  return { findings, scannedFiles: allFiles.length, skippedLargeFiles };
}

function formatFinding(finding) {
  return `${finding.type}: ${finding.file}${finding.line ? `:${finding.line}` : ''}`;
}

function runCli() {
  const scanRoot = process.argv[2] ? path.resolve(process.argv[2]) : path.resolve(__dirname, '..');
  const result = scanProject(scanRoot);
  if (result.findings.length) {
    console.error(`ไม่ผ่านตัวตรวจค่าลับ ${result.findings.length} รายการ:`);
    for (const finding of result.findings) console.error(`- ${formatFinding(finding)}`);
    process.exitCode = 1;
  } else {
    console.log(`✓ secret scan ${result.scannedFiles} ไฟล์ (ไม่แสดงค่าที่ตรวจ)`);
  }
  if (result.skippedLargeFiles.length) {
    // fail-closed (2026-08-07): ไฟล์ข้อความ >2MB ไม่เคยถูกอ่านเพื่อสแกนหาค่าลับเลย
    // เดิมแค่ warn แล้วปล่อยผ่าน (exit 0 ได้) — ถือว่า "ยังไม่ได้ตรวจ" ต้องนับเป็นไม่ผ่าน ห้ามเงียบ
    console.error(`ไม่ผ่าน: มีไฟล์ข้อความขนาดใหญ่เกิน 2MB ที่ไม่เคยถูกสแกนหาค่าลับ ${result.skippedLargeFiles.length} ไฟล์:`);
    for (const file of result.skippedLargeFiles) console.error(`- ${file}`);
    process.exitCode = 1;
  }
}

if (require.main === module) runCli();

module.exports = {
  PUBLIC_CONTEXTS,
  formatFinding,
  listRepositoryFiles,
  scanProject
};
