#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const root = path.resolve(__dirname, '..');
const excluded = new Set(['node_modules','_archive','_to_delete','เลิกใช้แล้ว_ห้ามรัน','.git','_dev']);
function walk(dir, out) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) { if (!excluded.has(entry.name)) walk(path.join(dir, entry.name), out); }
    else if (entry.isFile() && entry.name.endsWith('.html')) out.push(path.join(dir, entry.name));
  }
  return out;
}
const files = walk(root, []);
let checked = 0;
const failures = [];
function check(label, condition) { if (!condition) failures.push(label); }
for (const file of files) {
  const rel = path.relative(root, file);
  const html = fs.readFileSync(file, 'utf8');
  const hasGA = html.includes('G-DKVQE30982');
  const hasClarity = html.includes('clarity.ms');
  if (!hasGA && !hasClarity) continue;
  checked++;
  check(rel + ': analytics page has consent controls', html.includes('cookieConsentBanner'));
  if (rel !== 'vault.html') {
    check(rel + ': banner says Clarity cookies require consent', /Microsoft Clarity[\s\S]{0,180}(?:僅在您同意後使用分析 Cookie|uses analytics cookies only after you consent)/.test(html));
    check(rel + ': banner discloses limited cookieless measurement after rejection', /(?:若您拒絕|If you reject)[\s\S]{0,180}(?:Consent API V2)[\s\S]{0,80}(?:cookieless|無 Cookie)|(?:若您拒絕|If you reject)[\s\S]{0,180}(?:cookieless)[\s\S]{0,80}(?:Consent API V2)/.test(html));
    if (rel.startsWith('en/')) {
      check(rel + ': English page has English banner controls', /href="\/en\/privacy\.html"[\s\S]*?>Privacy Policy<[\s\S]*?>\s*Reject\s*<[\s\S]*?>\s*Accept\s*</.test(html));
      check(rel + ': English banner does not show Chinese controls', !/>\s*拒絕\s*</.test(html) && !/>\s*接受\s*</.test(html));
    } else {
      check(rel + ': Chinese page links the Chinese privacy policy', /href="\/privacy\.html"[\s\S]*?>隱私權政策</.test(html));
    }
  }
  if (hasGA) {
    const defaultAt = html.indexOf("gtag('consent', 'default'");
    const configMatch = /gtag\(\s*['"]config['"]/.exec(html);
    const configAt = configMatch ? configMatch.index : -1;
    check(rel + ': GA default consent is declared before config', defaultAt >= 0 && configAt > defaultAt);
    check(rel + ': GA analytics defaults denied without stored grant', /analytics_storage: savedConsent === 'granted' \? 'granted' : 'denied'/.test(html));
  }
  if (hasClarity) {
    check(rel + ': Clarity sends Consent API V2 state', /clarity\('consentv2', \{ ad_Storage: 'denied', analytics_Storage: claritySavedConsent === 'granted' \? 'granted' : 'denied' \}\)/.test(html));
    check(rel + ': consent decision updates Clarity V2', /clarity\('consentv2', \{ ad_Storage: 'denied', analytics_Storage: granted \? 'granted' : 'denied' \}\)/.test(html));
    check(rel + ': deprecated V1 is not used to grant consent', !html.includes("clarity('consent', granted)"));
  }
}
const vault = fs.readFileSync(path.join(root, 'vault.html'), 'utf8');
const vaultGate = fs.readFileSync(path.join(root, 'js/core/clarity-consent-gate.js'), 'utf8');
const chinesePrivacy = fs.readFileSync(path.join(root, 'privacy.html'), 'utf8');
const englishPrivacy = fs.readFileSync(path.join(root, 'en/privacy.html'), 'utf8');
check('Vault still uses delayed external consent gate', /clarity-consent-gate\.js\?v=1/.test(vault));
check('Vault grant sends Consent API V2', /consentv2[\s\S]*analytics_Storage: 'granted'/.test(vaultGate));
check('Vault denial sends V2 denied and erases prior cookies', /analytics_Storage: 'denied'[\s\S]*clarity\('consent', false\)/.test(vaultGate));
check('Chinese privacy says Clarity cookies require consent', chinesePrivacy.includes('Microsoft Clarity 僅在您同意後使用分析 Cookie'));
check('Chinese privacy discloses limited cookieless measurement after rejection', /拒絕[\s\S]{0,180}Consent API V2[\s\S]{0,100}無 Cookie/.test(chinesePrivacy));
check('English privacy matches current analytics tools', englishPrivacy.includes('Google Analytics 4 (GA4)') && englishPrivacy.includes('Microsoft Clarity'));
check('English privacy says Clarity cookies require consent', englishPrivacy.includes('Microsoft Clarity uses analytics cookies only after you consent'));
check('English privacy discloses limited cookieless tracking after rejection', /reject[\s\S]{0,180}cookieless[\s\S]{0,100}Consent API V2/i.test(englishPrivacy));
const generator = fs.readFileSync(path.join(root, 'scripts/apply-cookie-consent.js'), 'utf8');
check('canonical consent generator emits Clarity V2', generator.includes("window.clarity('consentv2'"));
check('canonical consent generator has one results declaration', (generator.match(/const results =/g) || []).length === 1);
if (failures.length) {
  console.error('❌ Phase 1 consent coverage failed (' + failures.length + ')');
  failures.forEach((failure) => console.error('- ' + failure));
  process.exit(1);
}
assert.ok(checked > 0);
console.log('✅ Phase 1 consent coverage passed: ' + checked + ' analytics HTML pages + Vault gate');
