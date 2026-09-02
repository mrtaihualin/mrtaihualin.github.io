#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { buildBannerBlock } = require('./apply-cookie-consent.js');

const root = path.resolve(__dirname, '..');
const excludedDirs = new Set([
  '.git', 'node_modules', '_archive', '_to_delete', 'เลิกใช้แล้ว_ห้ามรัน', '_dev',
  '_แผนงาน', '_บทความ-เตรียมเขียน', 'scripts', 'supabase', 'data'
]);

function walkPublicHtml(dir, out) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!excludedDirs.has(entry.name)) walkPublicHtml(path.join(dir, entry.name), out);
    } else if (entry.isFile() && entry.name.endsWith('.html')) {
      out.push(path.join(dir, entry.name));
    }
  }
  return out;
}

const htmlFiles = walkPublicHtml(root, []).sort();
assert.ok(htmlFiles.length > 100, 'public HTML inventory must include the complete site');

for (const file of htmlFiles) {
  const rel = path.relative(root, file).split(path.sep).join('/');
  const html = fs.readFileSync(file, 'utf8');
  assert.match(html, /id="cookieConsentBanner"[^>]+role="dialog"/, rel + ': consent banner exists');
  assert.match(html, /class="ccb-inner"/, rel + ': compact layout exists');
  assert.match(html, /@media \(max-width:767px\), \(max-width:900px\) and \(max-height:500px\)/, rel + ': portrait and short-landscape compact breakpoints exist');
  assert.match(html, /font-size:11px;line-height:1\.35/, rel + ': mobile copy is compact');
  assert.match(html, /min-height:34px;padding:5px 9px;font-size:12px/, rel + ': compact mobile controls exist');
  assert.match(html, /onclick="window\.__cookieConsentDecide\(false\)"/, rel + ': Reject remains available');
  assert.match(html, /onclick="window\.__cookieConsentDecide\(true\)"/, rel + ': Accept remains available');
  assert.match(html, rel.startsWith('en/') ? /href="\/en\/privacy\.html"/ : /href="\/privacy\.html"/, rel + ': privacy link is locale-correct');
}

function bannerScript(isEnglish) {
  const block = buildBannerBlock(isEnglish);
  const scripts = [...block.matchAll(/<script>([\s\S]*?)<\/script>/g)];
  assert.strictEqual(scripts.length, 1, 'canonical banner contains one runtime script');
  return scripts[0][1];
}

function createCookieDocument(sharedJar, banner, cookiesAvailable = true) {
  const doc = { getElementById(id) { return id === 'cookieConsentBanner' ? banner : null; } };
  Object.defineProperty(doc, 'cookie', {
    get() {
      if (!cookiesAvailable) throw new Error('cookies unavailable');
      return Object.entries(sharedJar).map(([key, value]) => key + '=' + value).join('; ');
    },
    set(serialized) {
      if (!cookiesAvailable) throw new Error('cookies unavailable');
      const first = String(serialized).split(';')[0];
      const splitAt = first.indexOf('=');
      const key = first.slice(0, splitAt);
      const value = first.slice(splitAt + 1);
      if (/Max-Age=0/i.test(serialized)) delete sharedJar[key];
      else sharedJar[key] = value;
    }
  });
  return doc;
}

function runPage({ storageValues, cookieJar, storageAvailable = true, cookiesAvailable = true }) {
  const banner = { style: { display: 'none' } };
  const document = createCookieDocument(cookieJar, banner, cookiesAvailable);
  const localStorage = {
    getItem(key) {
      if (!storageAvailable) throw new Error('storage unavailable');
      return Object.prototype.hasOwnProperty.call(storageValues, key) ? storageValues[key] : null;
    },
    setItem(key, value) {
      if (!storageAvailable) throw new Error('storage unavailable');
      storageValues[key] = value;
    }
  };
  const calls = [];
  const window = {
    document,
    localStorage,
    location: { hostname: 'mrtaihualin.com', protocol: 'https:' },
    setTimeout(fn) { fn(); },
    clarity(...args) { calls.push(['clarity', ...args]); }
  };
  const context = { window, document, gtag(...args) { calls.push(['gtag', ...args]); } };
  vm.runInNewContext(bannerScript(false), context);
  return { banner, calls, window };
}

for (const granted of [true, false]) {
  const storageValues = {};
  const cookieJar = {};
  const first = runPage({ storageValues, cookieJar });
  assert.strictEqual(first.banner.style.display, 'block', 'unset choice is shown');
  first.window.__cookieConsentDecide(granted);
  assert.strictEqual(first.banner.style.display, 'none', 'choice hides immediately');
  assert.strictEqual(storageValues.cookieConsent, granted ? 'granted' : 'denied', 'choice persists in localStorage');
  assert.strictEqual(cookieJar.mrtCookieConsent, granted ? 'granted' : 'denied', 'choice persists in first-party fallback cookie');
  const nextPage = runPage({ storageValues, cookieJar });
  assert.strictEqual(nextPage.banner.style.display, 'none', 'stored choice stays hidden across page/reload');
}

{
  const cookieJar = {};
  const first = runPage({ storageValues: {}, cookieJar, storageAvailable: false });
  assert.strictEqual(first.banner.style.display, 'block', 'storage-unavailable first visit is shown');
  first.window.__cookieConsentDecide(false);
  assert.strictEqual(first.banner.style.display, 'none', 'storage-unavailable rejection hides immediately');
  assert.strictEqual(cookieJar.mrtCookieConsent, 'denied', 'cookie fallback stores rejection');
  const nextPage = runPage({ storageValues: {}, cookieJar, storageAvailable: false });
  assert.strictEqual(nextPage.banner.style.display, 'none', 'cookie fallback persists across page/reload');
}

{
  const first = runPage({ storageValues: {}, cookieJar: {}, storageAvailable: false, cookiesAvailable: false });
  assert.strictEqual(first.banner.style.display, 'block', 'complete storage failure fails closed by asking');
  first.window.__cookieConsentDecide(true);
  assert.strictEqual(first.banner.style.display, 'none', 'complete storage failure still hides for the current page');
}

console.log('✅ Cookie consent compact/persistence passed: ' + htmlFiles.length + ' public HTML pages');
