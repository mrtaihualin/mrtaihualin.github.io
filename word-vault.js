/**
 * word-vault.js — คลังคำร่วม (Shared Word Vault)
 * ใช้ร่วมกันทุกเกม: tone-finder, reading-game, typing-game, lego-game (อนาคต)
 * เก็บข้อมูลใน localStorage ภายใต้ key "linvault_v1"
 */

(function(global) {
  'use strict';

  var STORAGE_KEY = 'linvault_v1';
  var MAX_WORDS = 30;

  // ── โหลด/บันทึก ──────────────────────────────────────────────
  function load() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); }
    catch(e) { return []; }
  }
  function save(list) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(list)); } catch(e) {}
  }

  // ── API หลัก ──────────────────────────────────────────────────

  /** เซฟคำ — ถ้ามีอยู่แล้วไม่เพิ่มซ้ำ
   * @param {string} th  — คำภาษาไทย (key หลัก)
   * @param {object} meta — ข้อมูลเพิ่ม: { zh, en, source }  (optional)
   * @returns {boolean} true = เพิ่งเซฟใหม่, false = มีอยู่แล้ว
   */
  function addWord(th, meta) {
    var list = load();
    if (list.some(function(w){ return w.th === th; })) return false;
    if (list.length >= MAX_WORDS) { _showFullToast(); return false; } // เต็ม 30/30 — บล็อก ห้าม auto-delete
    list.push({
      th: th,
      zh: (meta && meta.zh) || '',
      en: (meta && meta.en) || '',
      source: (meta && meta.source) || '',   // 'tone-finder' | 'reading-game' | 'typing-game' | ...
      saved_at: Date.now(),
      tags: []
    });
    save(list);
    return true;
  }

  /** ลบคำออกจากคลัง */
  function removeWord(th) {
    save(load().filter(function(w){ return w.th !== th; }));
  }

  /** คืนรายการคำทั้งหมด */
  function getAll() { return load(); }

  /** คืน true ถ้าคำนี้อยู่ในคลังแล้ว */
  function has(th) { return load().some(function(w){ return w.th === th; }); }

  /** จำนวนคำในคลัง */
  function count() { return load().length; }

  /** เต็ม 30/30 หรือยัง */
  function isFull() { return load().length >= MAX_WORDS; }

  /** เพิ่ม/ลบ tag ในคำ
   * @param {string} th
   * @param {string} tag
   * @param {boolean} [on=true]  true=เพิ่ม, false=ลบ
   */
  function setTag(th, tag, on) {
    var list = load();
    list.forEach(function(w) {
      if (w.th !== th) return;
      if (!w.tags) w.tags = [];
      var idx = w.tags.indexOf(tag);
      if (on !== false && idx === -1) w.tags.push(tag);
      if (on === false && idx !== -1) w.tags.splice(idx, 1);
    });
    save(list);
  }

  /** กรองคำตาม tag */
  function filterByTag(tag) {
    return load().filter(function(w){ return w.tags && w.tags.indexOf(tag) !== -1; });
  }

  /** ล้างคลังทั้งหมด */
  function clear() { save([]); }

  // ── UI Helper ─────────────────────────────────────────────────

  /**
   * สร้างปุ่ม 🔖 พร้อม event
   * @param {string} th
   * @param {object} meta  { zh, en, source }
   * @param {object} opts  { onSave, onRemove }  callbacks (optional)
   * @returns {HTMLButtonElement}
   */
  function createSaveBtn(th, meta, opts) {
    opts = opts || {};
    var btn = document.createElement('button');
    btn.className = 'vault-save-btn';
    btn.title = '儲存到單字庫';
    _updateBtnState(btn, has(th));

    btn.addEventListener('click', function(e) {
      e.stopPropagation();
      if (has(th)) {
        removeWord(th);
        _updateBtnState(btn, false);
        _notifyBadges();
        if (opts.onRemove) opts.onRemove(th);
        _showToast('已移除「' + th + '」');  // popup ตอนเอาออก เหมือนตอนบันทึก (Lin 2026-07-02)
      } else {
        if (isFull()) { _showFullToast(); return; } // เต็ม 30/30 — บล็อก ไม่บันทึก ไม่ auto-delete
        addWord(th, meta);
        _updateBtnState(btn, true);
        _notifyBadges();
        if (opts.onSave) opts.onSave(th);
        _showToast('已儲存「' + th + '」');
      }
    });
    return btn;
  }

  function _updateBtnState(btn, saved) {
    btn.setAttribute('data-saved', saved ? '1' : '0');
    btn.textContent = saved ? '🔖' : '🔖';
    btn.style.opacity = '1'; // ใช้สีพื้นหลัง (ดู CSS [data-saved]) แยกสถานะแทน ไม่ทำให้จางจนดูไม่ออกว่าเป็นปุ่ม
    btn.setAttribute('aria-label', saved ? '從單字庫移除' : '儲存到單字庫');
  }

  /** แสดง toast แจ้งเตือนเล็กๆ */
  function _showToast(msg) {
    var t = document.getElementById('vault-toast');
    if (!t) {
      t = document.createElement('div');
      t.id = 'vault-toast';
      t.style.cssText = [
        'position:fixed','bottom:80px','left:50%','transform:translateX(-50%)',
        'background:rgba(40,40,40,0.88)','color:#fff','padding:8px 18px',
        'border-radius:20px','font-size:14px','font-family:Sarabun,sans-serif',
        'z-index:9999','pointer-events:none','transition:opacity .3s','opacity:0'
      ].join(';');
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.style.opacity = '1';
    clearTimeout(t._timer);
    t._timer = setTimeout(function(){ t.style.opacity = '0'; }, 2000);
  }

  /** แสดง toast ตอนคลังเต็ม 30/30 — คลิกได้ ไปหน้า vault.html */
  function _showFullToast() {
    var t = document.getElementById('vault-toast-full');
    if (!t) {
      t = document.createElement('a');
      t.id = 'vault-toast-full';
      t.href = 'vault.html';
      t.style.cssText = [
        'position:fixed','bottom:80px','left:50%','transform:translateX(-50%)',
        'background:rgba(180,40,30,0.92)','color:#fff','padding:8px 18px',
        'border-radius:20px','font-size:14px','font-family:Sarabun,sans-serif',
        'z-index:9999','pointer-events:auto','transition:opacity .3s','opacity:0',
        'text-decoration:underline','cursor:pointer'
      ].join(';');
      document.body.appendChild(t);
    }
    t.textContent = '單字庫已滿（30/30）請先刪除舊單字';
    t.style.opacity = '1';
    clearTimeout(t._timer);
    t._timer = setTimeout(function(){ t.style.opacity = '0'; }, 3000);
  }

  /**
   * สร้าง/อัปเดต badge "คลัง X คำ" ที่ element ที่ระบุ
   * @param {string} containerId  id ของ element ที่จะวาง badge
   */
  function mountBadge(containerId) {
    var el = document.getElementById(containerId);
    if (!el) return;
    var badge = document.getElementById('vault-badge-' + containerId);
    if (!badge) {
      badge = document.createElement('a');
      badge.id = 'vault-badge-' + containerId;
      badge.href = 'vault.html';
      badge.className = 'vault-badge';
      badge.title = '前往我的單字庫';
      el.appendChild(badge);
    }
    _refreshBadge(badge);
  }

  function _refreshBadge(badge) {
    badge.textContent = '🔖 單字庫';
    badge.style.display = '';
  }

  /** อัปเดต badge ทั้งหมดในหน้า */
  function _notifyBadges() {
    var badges = document.querySelectorAll('.vault-badge');
    for (var i = 0; i < badges.length; i++) _refreshBadge(badges[i]);
  }

  /** inject CSS สำหรับปุ่ม + badge (เรียกครั้งเดียว) */
  function injectStyles() {
    if (document.getElementById('vault-styles')) return;
    var s = document.createElement('style');
    s.id = 'vault-styles';
    s.textContent = [
      '.vault-save-btn{background:#fff;border:1.5px solid rgba(139,99,16,0.30);cursor:pointer;font-size:18px;',
        'width:32px;height:32px;border-radius:50%;line-height:1;vertical-align:middle;',
        'display:inline-flex;align-items:center;justify-content:center;',
        'transition:opacity .2s,transform .15s,background .15s;}',
      '.vault-save-btn:hover{transform:scale(1.12);background:rgba(139,99,16,0.10);}',
      '.vault-save-btn[data-saved="1"]{background:#fff3d8;border-color:#C8973A;}',
      '.vault-badge{display:inline-flex;align-items:center;gap:4px;',
        'font-size:12.5px;font-family:"Noto Sans TC",Sarabun,sans-serif;color:#7a5510;',
        'background:#fff;border:1.5px solid rgba(139,99,16,0.30);',
        'border-radius:20px;padding:6px 14px;text-decoration:none;',
        'white-space:nowrap;transition:background .15s,border-color .15s;}',
      '.vault-badge:hover{background:rgba(139,99,16,0.10);border-color:rgba(139,99,16,0.55);}'
    ].join('');
    document.head.appendChild(s);
  }

  // ── Export ────────────────────────────────────────────────────
  global.WordVault = {
    addWord: addWord,
    removeWord: removeWord,
    getAll: getAll,
    has: has,
    count: count,
    isFull: isFull,
    notifyFull: _showFullToast,
    setTag: setTag,
    filterByTag: filterByTag,
    clear: clear,
    createSaveBtn: createSaveBtn,
    mountBadge: mountBadge,
    injectStyles: injectStyles
  };

})(window);
