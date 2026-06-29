/**
 * word-vault.js — คลังคำร่วม (Shared Word Vault)
 * ใช้ร่วมกันทุกเกม: tone-finder, reading-game, lego-game (อนาคต)
 * เก็บข้อมูลใน localStorage ภายใต้ key "linvault_v1"
 */

(function(global) {
  'use strict';

  var STORAGE_KEY = 'linvault_v1';

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
    list.push({
      th: th,
      zh: (meta && meta.zh) || '',
      en: (meta && meta.en) || '',
      source: (meta && meta.source) || '',   // 'tone-finder' | 'reading-game' | ...
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
    btn.title = 'บันทึกคำนี้ลงคลัง';
    _updateBtnState(btn, has(th));

    btn.addEventListener('click', function(e) {
      e.stopPropagation();
      if (has(th)) {
        removeWord(th);
        _updateBtnState(btn, false);
        _notifyBadges();
        if (opts.onRemove) opts.onRemove(th);
      } else {
        addWord(th, meta);
        _updateBtnState(btn, true);
        _notifyBadges();
        if (opts.onSave) opts.onSave(th);
        _showToast('บันทึก "' + th + '" แล้ว');
      }
    });
    return btn;
  }

  function _updateBtnState(btn, saved) {
    btn.setAttribute('data-saved', saved ? '1' : '0');
    btn.textContent = saved ? '🔖' : '🔖';
    btn.style.opacity = saved ? '1' : '0.4';
    btn.setAttribute('aria-label', saved ? 'ลบออกจากคลัง' : 'บันทึกลงคลัง');
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
      badge.title = 'ไปยังคลังคำของฉัน';
      el.appendChild(badge);
    }
    _refreshBadge(badge);
  }

  function _refreshBadge(badge) {
    var n = count();
    badge.textContent = n > 0 ? '🔖 คลัง ' + n + ' คำ' : '🔖 คลัง';
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
      '.vault-save-btn{background:none;border:none;cursor:pointer;font-size:20px;',
        'padding:2px 6px;border-radius:8px;line-height:1;vertical-align:middle;',
        'transition:opacity .2s,transform .15s;}',
      '.vault-save-btn:hover{transform:scale(1.2);}',
      '.vault-badge{display:inline-flex;align-items:center;gap:4px;',
        'font-size:12px;font-family:Sarabun,sans-serif;color:#8B6310;',
        'background:rgba(139,99,16,0.1);border:1px solid rgba(139,99,16,0.25);',
        'border-radius:16px;padding:3px 10px;text-decoration:none;',
        'white-space:nowrap;transition:background .2s;}',
      '.vault-badge:hover{background:rgba(139,99,16,0.2);}'
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
    setTag: setTag,
    filterByTag: filterByTag,
    clear: clear,
    createSaveBtn: createSaveBtn,
    mountBadge: mountBadge,
    injectStyles: injectStyles
  };

})(window);
