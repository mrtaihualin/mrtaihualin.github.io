// Phase 1 public Leaderboard nickname policy shared by all five boards.
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.NICKNAME_SAFETY = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  var FALLBACK = '玩家';
  var INVISIBLE_OR_CONTROL = /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u202a-\u202e\u2060\u2066-\u2069\ufeff]/g;
  var ALLOWED = /^[\p{L}\p{M}\p{N} ._-]+$/u;
  var CONTACT_SERVICE = /(?:line|ไลน์|wechat|微信|telegram|whatsapp|instagram|facebook|discord)[\s._:-]*(?:id|帳號|帐号|ไอดี|@|:|：)/iu;
  var CONTACT_SERVICE_REVERSED = /(?:id|add|加|แอด)[\s._:-]*(?:line|ไลน์|wechat|微信|telegram|whatsapp|instagram|facebook|discord)/iu;
  var EMAIL_OR_URL = /(?:[\p{L}\p{N}._%+-]+@[\p{L}\p{N}.-]+\.[\p{L}]{2,}|https?:\/\/|www\.|(?:^|\s)[\p{L}\p{N}-]+\.(?:com|net|org|co|io|me|th|tw)(?:\s|$|\/))/iu;
  var BLOCKED_TERMS = [
    'fuck', 'shit', 'bitch', 'cunt', 'dick', 'pussy', 'porn',
    'ควย', 'เหี้ย', 'เย็ด', 'หี', 'แตด',
    '幹你', '干你', '操你', '雞巴', '鸡巴', '屌', '婊子', '色情'
  ];

  function normalize(value) {
    var text = String(value == null ? '' : value);
    try { text = text.normalize('NFKC'); } catch (_) {}
    return text.replace(INVISIBLE_OR_CONTROL, '').replace(/\s+/gu, ' ').trim();
  }

  function safetyKey(value) {
    var text = normalize(value).toLowerCase();
    try { text = text.normalize('NFKD').replace(/\p{M}/gu, ''); } catch (_) {}
    text = text.replace(/[013457@$!]/g, function (char) {
      return { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '@': 'a', '$': 's', '!': 'i' }[char];
    });
    return text.replace(/[\s._-]+/gu, '').replace(/(.)\1{2,}/gu, '$1$1');
  }

  var BLOCKED_KEYS = BLOCKED_TERMS.map(safetyKey);

  function violation(value) {
    var nickname = normalize(value);
    var length = Array.from(nickname).length;
    if (!nickname) return 'empty';
    if (length > 20) return 'too_long';
    if (!ALLOWED.test(nickname) || !/[\p{L}\p{N}]/u.test(nickname)) return 'invalid_characters';
    if (EMAIL_OR_URL.test(nickname) || CONTACT_SERVICE.test(nickname) || CONTACT_SERVICE_REVERSED.test(nickname)) return 'contact_data';
    if ((nickname.match(/[0-9０-９]/g) || []).length >= 7) return 'contact_data';
    var key = safetyKey(nickname);
    if (BLOCKED_KEYS.some(function (term) { return term && key.indexOf(term) !== -1; })) return 'inappropriate';
    return null;
  }

  function messageFor(code) {
    return {
      empty: '暱稱不能空白',
      too_long: '暱稱最多 20 字',
      invalid_characters: '請只使用泰文、中文、英文、數字、空格或 . _ -',
      contact_data: '暱稱不能包含聯絡方式、電話、電子郵件或網址',
      inappropriate: '這個暱稱無法使用，請換一個'
    }[code] || '這個暱稱無法使用';
  }

  function validate(value) {
    var nickname = normalize(value);
    var code = violation(nickname);
    return { ok: !code, value: nickname, code: code, message: code ? messageFor(code) : '' };
  }

  function publicDisplayName(value) {
    var checked = validate(value);
    return checked.ok ? checked.value : FALLBACK;
  }

  return {
    FALLBACK: FALLBACK,
    normalize: normalize,
    safetyKey: safetyKey,
    violation: violation,
    validate: validate,
    messageFor: messageFor,
    publicDisplayName: publicDisplayName
  };
});
