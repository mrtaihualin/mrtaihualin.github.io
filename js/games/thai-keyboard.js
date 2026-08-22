/* Shared Kedmanee keyboard source for Typing and Listening Typed. */
(function (window, document) {
  'use strict';

  if (window.GSHThaiKeyboard) return;

  var codeRows = [
    ['Backquote','Digit1','Digit2','Digit3','Digit4','Digit5','Digit6','Digit7','Digit8','Digit9','Digit0','Minus','Equal'],
    ['KeyQ','KeyW','KeyE','KeyR','KeyT','KeyY','KeyU','KeyI','KeyO','KeyP','BracketLeft','BracketRight'],
    ['KeyA','KeyS','KeyD','KeyF','KeyG','KeyH','KeyJ','KeyK','KeyL','Semicolon','Quote','Backslash'],
    ['KeyZ','KeyX','KeyC','KeyV','KeyB','KeyN','KeyM','Comma','Period','Slash']
  ];
  var baseMap = {
    Backquote:'_',Digit1:'ๅ',Digit2:'/',Digit3:'-',Digit4:'ภ',Digit5:'ถ',Digit6:'ุ',Digit7:'ึ',Digit8:'ค',Digit9:'ต',Digit0:'จ',Minus:'ข',Equal:'ช',
    KeyQ:'ๆ',KeyW:'ไ',KeyE:'ำ',KeyR:'พ',KeyT:'ะ',KeyY:'ั',KeyU:'ี',KeyI:'ร',KeyO:'น',KeyP:'ย',BracketLeft:'บ',BracketRight:'ล',
    KeyA:'ฟ',KeyS:'ห',KeyD:'ก',KeyF:'ด',KeyG:'เ',KeyH:'้',KeyJ:'่',KeyK:'า',KeyL:'ส',Semicolon:'ว',Quote:'ง',Backslash:'ฃ',
    KeyZ:'ผ',KeyX:'ป',KeyC:'แ',KeyV:'อ',KeyB:'ิ',KeyN:'ื',KeyM:'ท',Comma:'ม',Period:'ใ',Slash:'ฝ'
  };
  var shiftMap = {
    Backquote:'%',Digit1:'+',Digit2:'๑',Digit3:'๒',Digit4:'๓',Digit5:'๔',Digit6:'ู',Digit7:'฿',Digit8:'๕',Digit9:'๖',Digit0:'๗',Minus:'๘',Equal:'๙',
    KeyQ:'๐',KeyW:'"',KeyE:'ฎ',KeyR:'ฑ',KeyT:'ธ',KeyY:'ํ',KeyU:'๊',KeyI:'ณ',KeyO:'ฯ',KeyP:'ญ',BracketLeft:'ฐ',BracketRight:',',
    KeyA:'ฤ',KeyS:'ฆ',KeyD:'ฏ',KeyF:'โ',KeyG:'ฌ',KeyH:'็',KeyJ:'๋',KeyK:'ษ',KeyL:'ศ',Semicolon:'ซ',Quote:'.',Backslash:'ฅ',
    KeyZ:'(',KeyX:')',KeyC:'ฉ',KeyV:'ฮ',KeyB:'ฺ',KeyN:'์',KeyM:'?',Comma:'ฒ',Period:'ฬ',Slash:'ฦ'
  };

  function makeKey(code, options) {
    var key = document.createElement('button');
    key.type = 'button';
    key.className = 'tk-key gsh-kbd-key';
    key.dataset.code = code;
    key.setAttribute('aria-label', baseMap[code] || shiftMap[code] || code);
    key.innerHTML = '<span class="tk-shift">' + (shiftMap[code] || '') + '</span>' +
      '<span class="tk-base">' + (baseMap[code] || '') + '</span>';
    key.addEventListener('pointerdown', function (event) {
      event.preventDefault();
    });
    key.addEventListener('click', function () {
      if (typeof options.onCode === 'function') options.onCode(code);
    });
    return key;
  }

  function render(options) {
    options = options || {};
    var root = options.root;
    if (!root) throw new Error('Thai keyboard root is required');
    var split = !!options.split;
    root.replaceChildren();
    root.classList.toggle('gsh-split-thai-keyboard', split);

    codeRows.forEach(function (codes) {
      var row = document.createElement('div');
      row.className = split ? 'tk-row gsh-split-kbd-row' : 'tk-row';
      if (split) {
        var midpoint = Math.ceil(codes.length / 2);
        var left = document.createElement('div');
        var right = document.createElement('div');
        left.className = 'gsh-split-kbd-half';
        right.className = 'gsh-split-kbd-half';
        left.dataset.gshSide = 'left';
        right.dataset.gshSide = 'right';
        codes.forEach(function (code, index) {
          (index < midpoint ? left : right).appendChild(makeKey(code, options));
        });
        row.append(left, right);
      } else {
        codes.forEach(function (code) { row.appendChild(makeKey(code, options)); });
      }
      root.appendChild(row);
    });

    var functions = document.createElement('div');
    functions.className = split ? 'tk-row gsh-split-kbd-row gsh-split-kbd-functions' : 'tk-row';
    var shift = document.createElement('button');
    shift.type = 'button';
    shift.id = options.shiftId || '';
    shift.className = 'tk-key tk-wide gsh-kbd-key gsh-kbd-function';
    shift.textContent = '⇧ Shift';
    shift.setAttribute('aria-pressed', String(!!options.shifted));
    if (split) shift.dataset.gshSide = 'left';
    shift.addEventListener('pointerdown', function (event) {
      event.preventDefault();
    });
    shift.addEventListener('click', function () {
      if (typeof options.onShift === 'function') options.onShift();
    });

    var backspace = document.createElement('button');
    backspace.type = 'button';
    backspace.className = 'tk-key tk-wide gsh-kbd-key gsh-kbd-function';
    backspace.textContent = '⌫ 退格';
    backspace.setAttribute('aria-label', 'Backspace');
    if (split) backspace.dataset.gshSide = 'right';
    backspace.addEventListener('pointerdown', function (event) {
      event.preventDefault();
    });
    backspace.addEventListener('click', function () {
      if (typeof options.onBackspace === 'function') options.onBackspace();
    });

    if (split) {
      var leftFunctions = document.createElement('div');
      var rightFunctions = document.createElement('div');
      leftFunctions.className = 'gsh-split-kbd-half';
      rightFunctions.className = 'gsh-split-kbd-half';
      leftFunctions.dataset.gshSide = 'left';
      rightFunctions.dataset.gshSide = 'right';
      leftFunctions.appendChild(shift);
      rightFunctions.appendChild(backspace);
      functions.append(leftFunctions, rightFunctions);
    } else {
      var space = document.createElement('div');
      space.className = 'tk-key tk-space';
      space.textContent = '空白鍵';
      space.style.opacity = '.45';
      functions.append(shift, space, backspace);
    }
    root.appendChild(functions);
    return root;
  }

  window.GSHThaiKeyboard = {
    codeRows: codeRows,
    baseMap: baseMap,
    shiftMap: shiftMap,
    render: render
  };
})(window, document);
