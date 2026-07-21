/**
 * lego-vault.js — คลังคำเฉพาะเกมเลโก้ (Lego Word Vault)
 * แยกจาก word-vault.js (linvault_v1) โดยตั้งใจ — คนละ key คนละเพดาน
 * ใช้ได้เฉพาะใน lego.html เท่านั้น · ต้องล็อกอินก่อนถึงจะเซฟได้ (เช็คที่ฝั่ง lego.html)
 * เก็บข้อมูลใน localStorage ภายใต้ key "lego_vault_v1" เพดานสูงสุด 15 คำ
 */

(function(global) {
  'use strict';

  var STORAGE_KEY = 'lego_vault_v1';
  var MAX_WORDS = 15;

  function load() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); }
    catch(e) { return []; }
  }
  function save(list) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(list)); } catch(e) {}
  }

  /** เซฟคำ — ถ้ามีอยู่แล้วไม่เพิ่มซ้ำ
   * @param {string} th  — คำภาษาไทย (key หลัก)
   * @param {object} meta — { zh } (optional)
   * @returns {boolean} true = เพิ่งเซฟใหม่, false = มีอยู่แล้ว/เต็ม
   */
  function addWord(th, meta) {
    var list = load();
    if (list.some(function(w){ return w.th === th; })) return false;
    if (list.length >= MAX_WORDS) return false; // เต็ม 15/15 — บล็อก ห้าม auto-delete
    list.push({
      th: th,
      zh: (meta && meta.zh) || '',
      source: 'lego',
      saved_at: Date.now()
    });
    save(list);
    return true;
  }

  function removeWord(th) {
    save(load().filter(function(w){ return w.th !== th; }));
  }

  function getAll() { return load(); }
  function has(th) { return load().some(function(w){ return w.th === th; }); }
  function count() { return load().length; }
  function isFull() { return load().length >= MAX_WORDS; }
  function clear() { save([]); }

  global.LegoVault = {
    MAX_WORDS: MAX_WORDS,
    addWord: addWord,
    removeWord: removeWord,
    getAll: getAll,
    has: has,
    count: count,
    isFull: isFull,
    clear: clear
  };

})(window);
