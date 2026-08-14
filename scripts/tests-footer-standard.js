#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const ROOT_PAGES = [
  'all-board.html', 'blog.html', 'community.html', 'content.html', 'faq.html',
  'games-challenge.html', 'games-practice.html', 'games.html', 'index.html', 'leaderboard.html',
  'lego-board.html', 'lego.html', 'listening-game.html', 'mix-board.html',
  'my-progress.html', 'new-student.html', 'page-services.html', 'pricing.html',
  'privacy.html', 'reading-board.html', 'reading-game.html', 'resources.html', 'sns.html',
  'terms.html', 'thank-you.html', 'tone-finder.html', 'trial.html',
  'typing-board.html', 'typing-game.html', 'vault.html', 'vocab-thank-you.html',
  'word-order-board.html', 'word-order.html'
];

const blogPages = fs.readdirSync(path.join(ROOT, 'blog'))
  .filter((file) => file.endsWith('.html'))
  .filter((file) => fs.readFileSync(path.join(ROOT, 'blog', file), 'utf8').includes('<nav class="site-nav"'))
  .map((file) => path.join('blog', file))
  .sort();

const scope = ROOT_PAGES.concat(blogPages, ['vocab-cheatsheet.html']);
const failures = [];

function count(text, pattern) {
  return (text.match(pattern) || []).length;
}

for (const relative of scope) {
  const file = path.join(ROOT, relative);
  if (!fs.existsSync(file)) {
    failures.push(`${relative}: file missing`);
    continue;
  }

  const html = fs.readFileSync(file, 'utf8');
  const footers = html.match(/<footer\b[^>]*>[\s\S]*?<\/footer>/gi) || [];
  if (footers.length !== 1) {
    failures.push(`${relative}: expected exactly one semantic footer, found ${footers.length}`);
    continue;
  }

  const footer = footers[0];
  if (count(footer, /使用條款與著作權聲明/g) !== 1) failures.push(`${relative}: Terms label must appear once`);
  if (count(footer, /隱私權政策/g) !== 1) failures.push(`${relative}: Privacy label must appear once`);
  if (count(footer, /© 2026 mrtaihualin\.com/g) !== 1) failures.push(`${relative}: copyright must appear once`);
  if (/facebook|instagram|youtube|tiktok|threads|lin\.ee|mailto:|聯絡我們/i.test(footer)) {
    failures.push(`${relative}: Contact/Social must not be in the footer`);
  }

  const termsLinks = [...footer.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>\s*使用條款與著作權聲明\s*<\/a>/gi)];
  const privacyLinks = [...footer.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>\s*隱私權政策\s*<\/a>/gi)];

  if (relative === 'terms.html') {
    if (termsLinks.length !== 0 || !/<span\b[^>]*aria-current=["']page["'][^>]*>\s*使用條款與著作權聲明\s*<\/span>/i.test(footer)) {
      failures.push('terms.html: current Terms item must be non-clickable and marked aria-current="page"');
    }
  } else if (termsLinks.length !== 1 || termsLinks[0][1] !== '/terms.html') {
    failures.push(`${relative}: Terms link must be /terms.html`);
  }

  if (relative === 'privacy.html') {
    if (privacyLinks.length !== 0 || !/<span\b[^>]*aria-current=["']page["'][^>]*>\s*隱私權政策\s*<\/span>/i.test(footer)) {
      failures.push('privacy.html: current Privacy item must be non-clickable and marked aria-current="page"');
    }
  } else if (privacyLinks.length !== 1 || privacyLinks[0][1] !== '/privacy.html') {
    failures.push(`${relative}: Privacy link must be /privacy.html`);
  }
}

if (failures.length) {
  console.error(`Footer standard failed (${failures.length})`);
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log(`Footer standard PASS (${scope.length} public pages)`);
