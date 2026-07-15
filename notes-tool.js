/* ============================================================
   notes-tool.js  —  ปุ่มลอย "學習筆記" (จดโน้ตขณะดูคลิป)
   - เครื่องเขียนครบ: หัวข้อ / หนา-เอียง-ขีดเส้น / สี / ไฮไลต์ / บุลเล็ต-เลข / แทรกลิงก์คลิป
   - เซฟอัตโนมัติในเครื่อง (localStorage) แบบเชื่อถือได้ (ตรวจว่าเซฟจริง + มีสำรอง)
   - ดาวน์โหลด PDF พร้อมลายน้ำ mrtaihualin.com
   Lin 2026-07-03 · โหลดไฟล์เดียวจบ: <script defer src="notes-tool.js"></script>
   ============================================================ */
(function () {
  'use strict';
  if (window.__NOTES_LOADED__) return;
  window.__NOTES_LOADED__ = true;

  var KEY      = 'mtl_notes_html';       // เนื้อโน้ตหลัก
  var KEY_TS   = 'mtl_notes_savedAt';    // เวลาบันทึกล่าสุด
  var KEY_BAK  = 'mtl_notes_backup';     // สำรอง (กันไฟล์หลักพัง)
  var SITE     = 'mrtaihualin.com';
  var BRAND    = '泰華眼裡的泰語教學';
  // QR ของ mrtaihualin.com ฝังเป็น data URI (ไม่ต้องพึ่งเน็ต/บริการนอกตอนพิมพ์ PDF)
  var QR = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAQ4AAAEOCAIAAAD3027yAAAEx0lEQVR4nO3dMW4dNxRAUcvwTlIGyP7XEcBl1jKu3cy/Dv1Mztc5rWGJ+tIFizfkfFzX9QV45evuBcAzSAUSqUAiFUikAolUIJEKJFKBRCqQfLv/53/+/uvPrOOP+ff7f//7/+76NO7XfL+qlZ/33mf727CrQCIVSKQCiVQgkQokUoFEKpBIBRKpQPJiWn9vbhK8YmWKPDf5npttn/lbOHNVK78FuwokUoFEKpBIBRKpQCIVSKQCiVQgkQokS9P6e+83n56b5X+25wCeuGa7CiRSgUQqkEgFEqlAIhVIpAKJVCCRCiSD0/r3s+tG+pWv/H731e9iV4FEKpBIBRKpQCIVSKQCiVQgkQokUoHEtP4nuybfu86am+V3dhVIpAKJVCCRCiRSgUQqkEgFEqlAIhVIBqf1Z765fMXK5HvufPzcmf45Z67qnl0FEqlAIhVIpAKJVCCRCiRSgUQqkEgFkqVp/fudzN71Zvr3u+v+zFWtsKtAIhVIpAKJVCCRCiRSgUQqkEgFEqlA8mJa/8Qz0J/N3DMEc//3iewqkEgFEqlAIhVIpAKJVCCRCiRSgUQqkLyY1j/xlvUz1zx3ev7MU/srn/PcufyVVdlVIJEKJFKBRCqQSAUSqUAiFUikAolUIBl8b/29uUnw3AR67jmAuVXNeeL9/CvsKpBIBRKpQCIVSKQCiVQgkQokUoFEKpAMTuvn5vFPnASfueYzT97PrWrlK9tVIJEKJFKBRCqQSAUSqUAiFUikAolUIPm4rmvLN37i7e4r5n6iFWfeFnBvblWm9fAbSAUSqUAiFUikAolUIJEKJFKBRCqQLL23/t7cffVPnMfvcuY8/szP6p5dBRKpQCIVSKQCiVQgkQokUoFEKpBIBZKlm/DnZq4rX/mJzwHsml6/39sK5p5OsKtAIhVIpAKJVCCRCiRSgUQqkEgFEqlA8sj31s993zlnTvrn3gF/78y/DTfhw28gFUikAolUIJEKJFKBRCqQSAUSqUAyOK3fdV587sz3mXcJrHzlXTcNzD0lMLdmuwokUoFEKpBIBRKpQCIVSKQCiVQgkQokg9P6FWeej783t+YzT6KvOPMpgXt2FUikAolUIJEKJFKBRCqQSAUSqUAiFUg+ruvavYaDPHEuvutm+BW7vu8KuwokUoFEKpBIBRKpQCIVSKQCiVQgkQokL87WP/GM+737SfCu97ifOZ++98SJu/fWwzipQCIVSKQCiVQgkQokUoFEKpBIBZKlm/CfOJFdsesd8HM3w6944m/fTfgwTiqQSAUSqUAiFUikAolUIJEKJFKBZPC99bum5rvsujd+zpk3K6ysytl6GCcVSKQCiVQgkQokUoFEKpBIBRKpQDI4rf9sVibBZ56eXzH37MKuz8quAolUIJEKJFKBRCqQSAUSqUAiFUikAolp/S/YdV/9rvn0rjsMzvys7CqQSAUSqUAiFUikAolUIJEKJFKBRCqQDE7rz7yvfsWuefyKuTW/31MC9+wqkEgFEqlAIhVIpAKJVCCRCiRSgUQqkCxN6594Q/u9XRP39/sk5z6NXbN8uwokUoFEKpBIBRKpQCIVSKQCiVQgkQokH9d17V4DPIBdBRKpQCIVSKQCiVQgkQokUoFEKpBIBZIfJClrQnAdkIAAAAAASUVORK5CYII=';

  // ── ตัวช่วย ────────────────────────────────────────────────
  function esc(s){ return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }
  function nowStr(){
    var d = new Date(), p = function(n){ return (n<10?'0':'')+n; };
    return d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate())+' '+p(d.getHours())+':'+p(d.getMinutes());
  }

  // ── CSS (ฝังในตัว ไม่พึ่งไฟล์อื่น) ─────────────────────────
  var CSS = ''
    + '.ntbk-fab{position:fixed;right:18px;bottom:18px;z-index:9998;background:#C8973A;color:#1a1a1a;border:none;'
    +   'border-radius:999px;padding:13px 20px;font-family:"Noto Sans TC",sans-serif;font-size:15px;font-weight:900;'
    +   'letter-spacing:1px;cursor:pointer;box-shadow:0 8px 24px rgba(90,62,10,.34);transition:transform .15s,box-shadow .15s;}'
    + '.ntbk-fab:hover{transform:translateY(-2px);box-shadow:0 12px 30px rgba(90,62,10,.44);}'
    + '.ntbk-fab .dot{display:inline-block;width:8px;height:8px;border-radius:50%;background:#d85a30;margin-left:7px;vertical-align:middle;opacity:0;transition:opacity .2s;}'
    + '.ntbk-fab.has-notes .dot{opacity:1;}'
    + '@media(max-width:768px){.ntbk-fab{bottom:calc(76px + env(safe-area-inset-bottom));right:14px;padding:11px 16px;font-size:14px;}}' // ยกให้พ้นแถบดำเมนูล่าง (~60px + safe-area)
    + '.ntbk-panel{position:fixed;top:0;right:0;z-index:9999;width:420px;max-width:100vw;height:100%;background:#fffdf7;'
    +   'box-shadow:-10px 0 40px rgba(0,0,0,.22);display:flex;flex-direction:column;transform:translateX(105%);'
    +   'transition:transform .28s cubic-bezier(.4,0,.2,1);font-family:"Noto Sans TC",sans-serif;}'
    + '.ntbk-panel.open{transform:translateX(0);}'
    + '@media(max-width:480px){.ntbk-panel{width:100vw;}}'
    + '.ntbk-head{flex-shrink:0;padding:14px 16px 12px;background:#5a3e10;color:#fff;display:flex;align-items:center;gap:10px;}'
    + '.ntbk-head h3{margin:0;font-family:"Noto Serif TC",serif;font-size:17px;font-weight:900;flex:1;}'
    + '.ntbk-status{font-size:11px;font-weight:700;opacity:.9;letter-spacing:.5px;white-space:nowrap;}'
    + '.ntbk-x{background:rgba(255,255,255,.16);border:none;color:#fff;width:30px;height:30px;border-radius:8px;font-size:16px;cursor:pointer;line-height:1;}'
    + '.ntbk-x:hover{background:rgba(255,255,255,.3);}'
    + '.ntbk-tools{flex-shrink:0;display:flex;flex-wrap:wrap;gap:5px;padding:8px 10px;background:#f3ead2;border-bottom:1px solid #e0d2a8;position:relative;}'
    + '.ntbk-tools button{min-width:34px;height:34px;padding:0 9px;border:1px solid #d8c48f;background:#fff;border-radius:7px;'
    +   'font-family:"Noto Sans TC",sans-serif;font-size:14px;font-weight:700;color:#5a3e10;cursor:pointer;transition:all .12s;}'
    + '.ntbk-tools button:hover{background:#C8973A;color:#1a1a1a;border-color:#C8973A;}'
    + '.ntbk-tools .sep{width:1px;height:22px;background:#d8c48f;margin:4px 2px;align-self:center;}'
    + '.ntbk-swatch{width:22px;height:22px;border-radius:50%;border:1px solid rgba(0,0,0,.2);cursor:pointer;padding:0;min-width:0;}'
    + '.ntbk-swatch:hover{transform:scale(1.12);}'
    + '.ntbk-dd{position:relative;display:inline-block;}'
    + '.ntbk-dd-pop{position:absolute;top:calc(100% + 6px);left:0;display:none;flex-wrap:wrap;gap:6px;width:118px;'
    +   'background:#fff;border:1px solid #d8c48f;border-radius:10px;padding:8px;box-shadow:0 8px 20px rgba(0,0,0,.2);z-index:20;}'
    + '.ntbk-dd-pop.open{display:flex;}'
    + '.ntbk-editor{flex:1;overflow-y:auto;padding:18px 20px;font-size:15.5px;line-height:1.85;color:#2d2a22;outline:none;}'
    + '.ntbk-editor:empty:before{content:attr(data-ph);color:#b3a884;}'
    + '.ntbk-editor h3{font-family:"Noto Serif TC",serif;font-size:19px;font-weight:900;color:#5a3e10;margin:14px 0 6px;}'
    + '.ntbk-editor ul,.ntbk-editor ol{padding-left:24px;margin:8px 0;}'
    + '.ntbk-editor a{color:#d85a30;font-weight:700;}'
    + '.ntbk-clip{display:block;background:#fff6e9;border:1px solid #f0c89a;border-left:4px solid #C8973A;border-radius:8px;padding:9px 12px;margin:10px 0;font-size:14px;}'
    + '.ntbk-clip .t{font-weight:900;color:#5a3e10;}'
    + '.ntbk-clip .m{display:block;font-size:11.5px;color:#8b7340;margin-top:2px;}'
    + '.ntbk-foot{flex-shrink:0;display:flex;gap:8px;padding:11px 14px;background:#f3ead2;border-top:1px solid #e0d2a8;}'
    + '.ntbk-foot button{flex:1;padding:11px;border:none;border-radius:9px;font-family:"Noto Sans TC",sans-serif;font-size:14px;font-weight:900;cursor:pointer;transition:filter .12s;}'
    + '.ntbk-foot .dl{background:#5a3e10;color:#fff;}'
    + '.ntbk-foot .dl:hover{filter:brightness(1.15);}'
    + '.ntbk-foot .clr{background:transparent;color:#8b7340;border:1px solid #d8c48f !important;flex:0 0 auto;padding:11px 16px;}'
    + '.ntbk-foot .clr:hover{color:#c62828;border-color:#c62828 !important;}';

  // ── สร้าง DOM ──────────────────────────────────────────────
  var fab, panel, editor, statusEl;

  function build() {
    var style = document.createElement('style');
    style.textContent = CSS;
    document.head.appendChild(style);

    fab = document.createElement('button');
    fab.className = 'ntbk-fab';
    fab.type = 'button';
    fab.innerHTML = '📝 學習筆記<span class="dot"></span>';
    fab.addEventListener('click', open);
    document.body.appendChild(fab);

    panel = document.createElement('div');
    panel.className = 'ntbk-panel';
    panel.innerHTML =
      '<div class="ntbk-head">'
      +  '<h3>📝 我的學習筆記</h3>'
      +  '<span class="ntbk-status" id="ntbk-status"></span>'
      +  '<button class="ntbk-x" type="button" title="關閉">✕</button>'
      + '</div>'
      + '<div class="ntbk-tools" id="ntbk-tools"></div>'
      + '<div class="ntbk-editor" id="ntbk-editor" contenteditable="true" data-ph="在這裡邊看影片邊記筆記…（自動儲存）"></div>'
      + '<div class="ntbk-foot">'
      +  '<button class="dl" type="button" id="ntbk-dl">⬇ 下載 PDF</button>'
      +  '<button class="clr" type="button" id="ntbk-clr" title="清空筆記">🗑</button>'
      + '</div>';
    document.body.appendChild(panel);

    editor   = panel.querySelector('#ntbk-editor');
    statusEl = panel.querySelector('#ntbk-status');
    panel.querySelector('.ntbk-x').addEventListener('click', close);
    panel.querySelector('#ntbk-dl').addEventListener('click', downloadPDF);
    panel.querySelector('#ntbk-clr').addEventListener('click', clearAll);

    buildTools();
    restoreFontSize();
    bindShortcuts();

    // autosave: debounce ทุกครั้งที่พิมพ์
    editor.addEventListener('input', scheduleSave);
    // เซฟตอนปิดหน้า/สลับแท็บ กันหลุด
    window.addEventListener('beforeunload', saveNow);
    document.addEventListener('visibilitychange', function(){ if (document.hidden) saveNow(); });

    restore();
  }

  function cmd(c, v){ editor.focus(); try{ document.execCommand(c, false, v); }catch(e){} scheduleSave(); }

  var ntbkDDs = []; // เก็บ popover ทั้งหมดของแผงนี้ ไว้ปิดพร้อมกัน
  function buildTools() {
    var bar = panel.querySelector('#ntbk-tools');
    function btn(label, title, fn){
      var b = document.createElement('button'); b.type='button'; b.title=title; b.innerHTML=label;
      b.addEventListener('mousedown', function(e){ e.preventDefault(); }); // กัน editor เสีย focus
      b.addEventListener('click', fn); bar.appendChild(b); return b;
    }
    function sep(){ var s=document.createElement('span'); s.className='sep'; bar.appendChild(s); }
    // ปุ่มแบบ dropdown: กดแล้วค่อยกางสีให้เลือก (กันแถบเครื่องมือรก/ยาวเกินไป)
    function ddBtn(label, title){
      var wrap = document.createElement('span'); wrap.className='ntbk-dd';
      var b = document.createElement('button'); b.type='button'; b.title=title; b.innerHTML=label;
      var pop = document.createElement('div'); pop.className='ntbk-dd-pop';
      b.addEventListener('mousedown', function(e){ e.preventDefault(); });
      b.addEventListener('click', function(e){
        e.stopPropagation();
        var willOpen = !pop.classList.contains('open');
        closeAllDD();
        if (willOpen) pop.classList.add('open');
      });
      wrap.appendChild(b); wrap.appendChild(pop); bar.appendChild(wrap);
      ntbkDDs.push(pop);
      return pop;
    }
    function closeAllDD(){ ntbkDDs.forEach(function(p){ p.classList.remove('open'); }); }
    if (!ntbkDDs._bound){ document.addEventListener('click', closeAllDD); ntbkDDs._bound = true; }

    btn('<b>B</b>', '粗體 (Ctrl+B)', function(){ cmd('bold'); });
    btn('<i>I</i>', '斜體 (Ctrl+I)', function(){ cmd('italic'); });
    btn('<u>U</u>', '底線 (Ctrl+U)', function(){ cmd('underline'); });
    sep();
    // สีตัวอักษร — กดปุ่ม 🎨 ค่อยกางให้เลือก
    var colorPop = ddBtn('🎨', '文字顏色');
    ['#1a1a1a','#d85a30','#C8973A','#2e7d32','#1565c0','#c62828'].forEach(function(c){
      var b=document.createElement('button'); b.type='button'; b.className='ntbk-swatch'; b.style.background=c; b.title=c;
      b.addEventListener('mousedown', function(e){ e.preventDefault(); });
      b.addEventListener('click', function(){ cmd('foreColor', c); closeAllDD(); });
      colorPop.appendChild(b);
    });
    // ไฮไลต์ (螢光筆) — กดปุ่ม 🖍 ค่อยกางให้เลือก
    var hiPop = ddBtn('🖍', '螢光筆');
    ['#fff3a3','#ffd6a5','#b8f0c8','#cfe8ff','#ffc9de'].forEach(function(c){
      var b=document.createElement('button'); b.type='button'; b.className='ntbk-swatch'; b.title='螢光筆';
      b.style.background=c; b.style.border='1px solid rgba(0,0,0,.15)';
      b.addEventListener('mousedown', function(e){ e.preventDefault(); });
      b.addEventListener('click', function(){ hilite(c); closeAllDD(); });
      hiPop.appendChild(b);
    });
    sep();
    btn('A－', '縮小字體', function(){ stepFont(-1); });
    btn('A＋', '放大字體', function(){ stepFont(1); });
  }

  // ── 放大/縮小整個筆記本文字（給眼睛不好/想看清楚的人） ──────
  var FS_KEY = 'mtl_notes_fontsize', FS_MIN = 14, FS_MAX = 32;
  function applyFontSize(px){
    editor.style.fontSize = px + 'px';
    try{ localStorage.setItem(FS_KEY, String(px)); }catch(e){}
  }
  function stepFont(dir){
    var cur = parseFloat(editor.style.fontSize) || 15.5;
    var next = cur + dir*2;
    if (next < FS_MIN) next = FS_MIN;
    if (next > FS_MAX) next = FS_MAX;
    applyFontSize(next);
  }
  function restoreFontSize(){
    try{
      var saved = localStorage.getItem(FS_KEY);
      if (saved) editor.style.fontSize = saved + 'px';
    }catch(e){}
  }

  // ── คีย์ลัด Ctrl/Cmd+B/I/U (กัน default ของเบราว์เซอร์ชนกัน ทำเองให้ชัวร์ทุกเบราว์เซอร์) ──
  function bindShortcuts(){
    editor.addEventListener('keydown', function(e){
      var mod = e.ctrlKey || e.metaKey;
      if (!mod) return;
      var k = e.key.toLowerCase();
      if (k === 'b'){ e.preventDefault(); cmd('bold'); }
      else if (k === 'i'){ e.preventDefault(); cmd('italic'); }
      else if (k === 'u'){ e.preventDefault(); cmd('underline'); }
    });
  }
  function hilite(color){
    editor.focus();
    try{ if(!document.execCommand('hiliteColor', false, color)) document.execCommand('backColor', false, color); }
    catch(e){ try{ document.execCommand('backColor', false, color); }catch(e2){} }
    scheduleSave();
  }

  // ── เปิด/ปิด ───────────────────────────────────────────────
  function open(){ panel.classList.add('open'); setTimeout(function(){ editor.focus(); }, 300); }
  function close(){ saveNow(); panel.classList.remove('open'); }

  // ── เซฟแบบเชื่อถือได้ (RELIABILITY) ─────────────────────────
  var saveTimer = null;
  function scheduleSave(){
    setStatus('儲存中…');
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(saveNow, 500);
  }
  function saveNow(){
    if (!editor) return;
    if (saveTimer){ clearTimeout(saveTimer); saveTimer = null; }
    var html = editor.innerHTML;
    try{
      // สำรองค่าที่เคยเซฟไว้ก่อน แล้วค่อยเขียนทับตัวหลัก
      var prev = localStorage.getItem(KEY);
      if (prev != null) localStorage.setItem(KEY_BAK, prev);
      localStorage.setItem(KEY, html);
      localStorage.setItem(KEY_TS, nowStr());
      // ✅ ตรวจว่าบันทึกจริง (ห้ามขึ้น "สำเร็จ" ถ้ายังไม่ชัวร์ — กฎ RELIABILITY)
      if (localStorage.getItem(KEY) !== html) throw new Error('verify-failed');
      setStatus('已儲存 ✓ ' + (localStorage.getItem(KEY_TS) || ''));
      markHasNotes(!!editor.textContent.trim());
    }catch(err){
      // ล้มเหลวต้องเตือนดังๆ ห้ามเงียบ
      setStatus('⚠️ 儲存失敗！請先「下載 PDF」備份');
      console.error('[notes] save failed:', err);
    }
  }
  function restore(){
    try{
      var html = localStorage.getItem(KEY);
      if (html == null) html = localStorage.getItem(KEY_BAK); // กู้จากสำรองถ้าตัวหลักหาย
      if (html){ editor.innerHTML = html; markHasNotes(!!editor.textContent.trim()); }
      var ts = localStorage.getItem(KEY_TS);
      setStatus(html ? ('已儲存 ✓ ' + (ts||'')) : '');
    }catch(err){ console.error('[notes] restore failed:', err); }
  }
  function setStatus(t){ if (statusEl) statusEl.textContent = t; }
  function markHasNotes(has){ if (fab){ fab.classList.toggle('has-notes', !!has); } }

  function clearAll(){
    if (!editor.textContent.trim() && !editor.innerHTML.trim()) return;
    if (!confirm('確定要清空全部筆記嗎？（清空前會自動存一份備份）')) return;
    try{ localStorage.setItem(KEY_BAK, editor.innerHTML); }catch(e){}
    editor.innerHTML = '';
    saveNow();
    editor.focus();
  }

  // ── แทรกคลิปเข้าโน้ต (เรียกจากปุ่มในวิดีโอ) ─────────────────
  function insertClip(title, url){
    if (!panel) return;
    open();
    var block = '<div class="ntbk-clip"><span class="t">📺 ' + esc(title||'影片') + '</span>'
      + (url ? '<a href="' + esc(url) + '" target="_blank" rel="noopener">' + esc(url) + '</a>' : '')
      + '<span class="m">記於 ' + nowStr() + '</span></div><div><br></div>';
    editor.focus();
    try{ document.execCommand('insertHTML', false, block); }
    catch(e){ editor.innerHTML += block; }
    saveNow();
  }

  // ── ดาวน์โหลด PDF (มีลายน้ำ) ───────────────────────────────
  function downloadPDF(){
    saveNow();
    var body = editor.innerHTML && editor.textContent.trim()
      ? editor.innerHTML
      : '<p style="color:#999;">（尚無筆記內容）</p>';
    var ts = nowStr();
    var wm = SITE; // ลายน้ำ
    var win = window.open('', '_blank');
    if (!win){ alert('請允許彈出視窗，才能下載 PDF'); return; }
    var doc = ''
      + '<!DOCTYPE html><html lang="zh-TW"><head><meta charset="UTF-8">'
      + '<title>泰語學習筆記 ' + ts + '</title>'
      + '<link href="https://fonts.googleapis.com/css2?family=Noto+Serif+TC:wght@400;700;900&family=Noto+Sans+TC:wght@400;500;700;900&family=Sarabun:wght@400;700&display=swap" rel="stylesheet">'
      + '<style>'
      +   '*{box-sizing:border-box;}'
      +   'body{font-family:"Noto Sans TC","Sarabun",sans-serif;color:#2d2a22;line-height:1.85;font-size:15px;margin:0;padding:44px 46px 60px;position:relative;}'
      +   '.pg-head{border-bottom:2px solid #C8973A;padding-bottom:10px;margin-bottom:22px;display:flex;justify-content:space-between;align-items:flex-end;}'
      +   '.pg-head .b{font-family:"Noto Serif TC",serif;font-size:20px;font-weight:900;color:#5a3e10;}'
      +   '.pg-head .d{font-size:12px;color:#8b7340;}'
      +   'h3{font-family:"Noto Serif TC",serif;font-size:19px;font-weight:900;color:#5a3e10;margin:16px 0 6px;}'
      +   'a{color:#d85a30;font-weight:700;word-break:break-all;}'
      +   'ul,ol{padding-left:24px;}'
      +   '.ntbk-clip{background:#fff6e9;border:1px solid #f0c89a;border-left:4px solid #C8973A;border-radius:8px;padding:9px 12px;margin:10px 0;}'
      +   '.ntbk-clip .t{font-weight:900;color:#5a3e10;} .ntbk-clip .m{display:block;font-size:11.5px;color:#8b7340;margin-top:2px;}'
      +   '.wm{position:fixed;top:0;left:0;right:0;bottom:0;display:flex;align-items:center;justify-content:center;pointer-events:none;z-index:-1;}'
      +   '.wm span{font-family:"Noto Serif TC",serif;font-size:82px;font-weight:900;color:rgba(200,151,58,.13);transform:rotate(-24deg);letter-spacing:6px;white-space:nowrap;}'
      +   '.pg-ad{margin-top:30px;padding:12px 16px;background:#fff6e9;border:1px solid #f0c89a;border-radius:10px;font-size:12.5px;color:#8b6310;line-height:1.7;display:flex;align-items:center;gap:14px;text-align:left;}'
      +   '.pg-ad-txt{flex:1;}'
      +   '.pg-ad b{color:#5a3e10;}'
      +   '.pg-ad-qr{width:74px;height:74px;flex-shrink:0;border:1px solid #f0c89a;border-radius:6px;background:#fff;}'
      +   '.pg-foot{position:fixed;bottom:16px;left:46px;right:46px;border-top:1px solid #e0d2a8;padding-top:6px;'
      +     'font-size:11px;color:#8b7340;display:flex;justify-content:space-between;}'
      +   '@media print{body{padding:26px 30px 50px;} .pg-foot{position:fixed;}}'
      + '</style></head><body>'
      + '<div class="wm"><span>' + esc(wm) + '</span></div>'
      + '<div class="pg-head"><span class="b">📝 泰語學習筆記</span><span class="d">' + esc(BRAND) + ' · ' + ts + '</span></div>'
      + '<div class="pg-body">' + body + '</div>'
      + '<div class="pg-ad"><div class="pg-ad-txt">🇹🇭 想真正開口說泰語？<b>一對一中文授課・30 分鐘免費體驗課</b><br>免費學習資源與預約 → ' + esc(SITE) + '<br>掃描右方 QR 直接前往 →</div><img class="pg-ad-qr" src="' + QR + '" alt="' + esc(SITE) + ' QR"></div>'
      + '<div class="pg-foot"><span>來源：' + esc(SITE) + '</span><span>' + esc(BRAND) + '</span></div>'
      + '<scr' + 'ipt>window.onload=function(){setTimeout(function(){window.print();},400);};</scr' + 'ipt>'
      + '</body></html>';
    win.document.open(); win.document.write(doc); win.document.close();
  }

  // ── เปิดใช้งาน ─────────────────────────────────────────────
  window.NOTES = { open: open, close: close, insertClip: insertClip, save: saveNow };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', build);
  else build();
})();
