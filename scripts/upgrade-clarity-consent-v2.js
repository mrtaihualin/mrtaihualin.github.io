#!/usr/bin/env node
'use strict';

// One-time mechanical upgrade for pages already stamped by apply-cookie-consent.js.
const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');
const excluded = new Set(['node_modules','_archive','_to_delete','เลิกใช้แล้ว_ห้ามรัน','.git','_dev']);
function walk(dir, out) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) { if (!excluded.has(entry.name)) walk(path.join(dir, entry.name), out); }
    else if (entry.isFile() && entry.name.endsWith('.html')) out.push(path.join(dir, entry.name));
  }
  return out;
}
const oldDefault = "if (localStorage.getItem('cookieConsent') !== 'granted') { window.clarity('consent', false); }";
const newDefault = "var claritySavedConsent = localStorage.getItem('cookieConsent');\n    window.clarity('consentv2', { ad_Storage: 'denied', analytics_Storage: claritySavedConsent === 'granted' ? 'granted' : 'denied' });";
const oldDecision = "window.clarity('consent', granted);";
const newDecision = "window.clarity('consentv2', { ad_Storage: 'denied', analytics_Storage: granted ? 'granted' : 'denied' });\n      if (!granted) window.clarity('consent', false); // erase any cookies from an earlier grant";
let changed = 0;
for (const file of walk(root, [])) {
  let html = fs.readFileSync(file, 'utf8');
  if (!html.includes('cookieConsentBanner') || !html.includes('clarity.ms')) continue;
  const before = html;
  html = html.split(oldDefault).join(newDefault).split(oldDecision).join(newDecision);
  if (html !== before) { fs.writeFileSync(file, html); changed++; }
}
console.log('Clarity consent V2 upgraded: ' + changed + ' HTML files');
