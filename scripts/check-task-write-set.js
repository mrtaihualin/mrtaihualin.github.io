#!/usr/bin/env node
'use strict';

const fs = require('fs');
const https = require('https');
const path = require('path');
const cp = require('child_process');

const root = path.resolve(__dirname, '..');

function normalizeRepositoryPath(value, label = 'path') {
  const normalized = String(value || '').trim().replace(/\\/g, '/').replace(/^\.\//, '');
  if (!normalized || normalized.startsWith('/') || normalized === '..' || normalized.startsWith('../') || normalized.includes('/../')) {
    throw new Error(`${label} ไม่ใช่ repository-relative path ที่ปลอดภัย: ${JSON.stringify(value)}`);
  }
  return normalized;
}

function normalizePattern(value) {
  const pattern = normalizeRepositoryPath(value, 'write-set');
  if (pattern === '*' || pattern === '**' || pattern === '/**' || pattern === './**') {
    throw new Error(`write-set กว้างทั้ง repository จึงไม่อนุญาต: ${pattern}`);
  }
  const wildcard = pattern.indexOf('*');
  if (wildcard === -1) return pattern;
  if (!pattern.endsWith('/**') || wildcard !== pattern.length - 2) {
    throw new Error(`write-set รองรับเฉพาะ exact path หรือ directory/**: ${pattern}`);
  }
  return pattern;
}

function isAllowed(file, patterns) {
  const candidate = normalizeRepositoryPath(file);
  return patterns.some((raw) => {
    const pattern = normalizePattern(raw);
    if (!pattern.endsWith('/**')) return candidate === pattern;
    const directory = pattern.slice(0, -3);
    return candidate === directory || candidate.startsWith(`${directory}/`);
  });
}

function validateTaskContract(taskId, rawPatterns, files) {
  const id = String(taskId || '').trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9._/-]{1,79}$/.test(id)) {
    throw new Error('Task-ID ขาดหายหรือรูปแบบไม่ถูกต้อง');
  }
  const patterns = rawPatterns.map(normalizePattern);
  if (patterns.length === 0) throw new Error('Write-Set ต้องมีอย่างน้อย 1 path');
  const duplicates = patterns.filter((item, index) => patterns.indexOf(item) !== index);
  if (duplicates.length) throw new Error(`Write-Set มี path ซ้ำ: ${[...new Set(duplicates)].join(', ')}`);
  const outside = files.map((file) => normalizeRepositoryPath(file)).filter((file) => !isAllowed(file, patterns));
  if (outside.length) throw new Error(`พบไฟล์นอก Write-Set ของ ${id}:\n- ${outside.join('\n- ')}`);
  return { taskId: id, patterns, files: files.length };
}

function parsePullRequestBody(body) {
  const lines = String(body || '').split(/\r?\n/);
  let taskId = '';
  let collecting = false;
  const writeSet = [];
  for (const line of lines) {
    const taskMatch = line.match(/^\s*(?:[-*]\s*)?(?:TASK_ID|Task-ID)\s*:\s*(.+?)\s*$/i);
    if (taskMatch) {
      taskId = taskMatch[1].replace(/^`|`$/g, '').trim();
      collecting = false;
      continue;
    }
    const writeMatch = line.match(/^\s*(?:[-*]\s*)?(?:WRITE_SET|Write-Set)\s*:\s*(.*?)\s*$/i);
    if (writeMatch) {
      collecting = true;
      if (writeMatch[1]) writeSet.push(...writeMatch[1].split(',').map((item) => item.trim()).filter(Boolean));
      continue;
    }
    if (!collecting) continue;
    const item = line.match(/^\s*[-*]\s+(.+?)\s*$/);
    if (item) {
      writeSet.push(item[1].replace(/^`|`$/g, '').trim());
      continue;
    }
    if (line.trim() && !line.trim().startsWith('<!--')) collecting = false;
  }
  return { taskId, writeSet };
}

function readLocalContract(file) {
  const contract = JSON.parse(fs.readFileSync(file, 'utf8'));
  return { taskId: contract.taskId, writeSet: Array.isArray(contract.writeSet) ? contract.writeSet : [] };
}

function stagedFiles() {
  const result = cp.spawnSync('git', ['diff', '--cached', '--name-only', '--diff-filter=ACMRDTUXB', '-z'], {
    cwd: root,
    encoding: 'utf8',
  });
  if (result.status !== 0) throw new Error(`อ่าน staged files ไม่สำเร็จ: ${result.stderr.trim()}`);
  return result.stdout.split('\0').filter(Boolean);
}

function githubJson(url, token) {
  return new Promise((resolve, reject) => {
    const request = https.get(url, {
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'User-Agent': 'mrtaihualin-write-set-enforcement',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    }, (response) => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => { body += chunk; });
      response.on('end', () => {
        if (response.statusCode < 200 || response.statusCode >= 300) {
          reject(new Error(`GitHub API ${response.statusCode}: ${body.slice(0, 300)}`));
          return;
        }
        try { resolve(JSON.parse(body)); }
        catch (error) { reject(new Error(`GitHub API ตอบ JSON ไม่ถูกต้อง: ${error.message}`)); }
      });
    });
    request.on('error', reject);
  });
}

async function pullRequestFiles(repository, number, token) {
  const files = [];
  for (let page = 1; ; page++) {
    const url = `https://api.github.com/repos/${repository}/pulls/${number}/files?per_page=100&page=${page}`;
    const batch = await githubJson(url, token);
    files.push(...batch.map((item) => item.filename));
    if (batch.length < 100) return files;
  }
}

async function runEvent(eventFile) {
  const event = JSON.parse(fs.readFileSync(eventFile, 'utf8'));
  if (!event.pull_request) {
    console.log('✓ Write-Set check: event นี้ไม่มี Pull Request จึงไม่มี Task contract ให้ตรวจ');
    return;
  }
  const token = process.env.GITHUB_TOKEN;
  const repository = process.env.GITHUB_REPOSITORY;
  if (!token || !repository) throw new Error('ขาด GITHUB_TOKEN หรือ GITHUB_REPOSITORY');
  const contract = parsePullRequestBody(event.pull_request.body);
  const files = await pullRequestFiles(repository, event.pull_request.number, token);
  const result = validateTaskContract(contract.taskId, contract.writeSet, files);
  console.log(`✓ Write-Set check: ${result.taskId} ครอบ ${result.files} ไฟล์`);
}

async function main() {
  const eventIndex = process.argv.indexOf('--event');
  if (eventIndex !== -1) {
    if (!process.argv[eventIndex + 1]) throw new Error('--event ต้องตามด้วย path');
    await runEvent(process.argv[eventIndex + 1]);
    return;
  }

  const stagedIndex = process.argv.indexOf('--staged');
  if (stagedIndex !== -1) {
    const contractFile = path.resolve(root, process.env.TASK_WRITE_SET_FILE || '.task-write-set.json');
    if (!fs.existsSync(contractFile)) throw new Error(`ไม่พบ ${path.relative(root, contractFile)} — คัดลอกจาก .task-write-set.example.json แล้วกำหนด Task/write-set ก่อน commit`);
    const contract = readLocalContract(contractFile);
    const files = stagedFiles();
    const result = validateTaskContract(contract.taskId, contract.writeSet, files);
    console.log(`✓ staged Write-Set: ${result.taskId} ครอบ ${result.files} ไฟล์`);
    return;
  }

  throw new Error('ใช้ --staged หรือ --event <github-event.json>');
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`✗ Write-Set enforcement: ${error.message}`);
    process.exit(1);
  });
}

module.exports = { isAllowed, normalizePattern, parsePullRequestBody, validateTaskContract };
