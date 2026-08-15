// ════════════════════════════════════════════════════════════
// line-callback.js — หน้ารับกลับจาก LINE Login (line-callback.html)
// อ่าน ?code=&state= จาก URL → เช็ค state ตรงกับที่ส่งไปไหม (กัน CSRF) →
// ส่ง code ให้ Edge Function line-login ตรวจสอบ → ได้ hashed_token กลับมา →
// verifyOtp() ได้ session จริง → เด้งกลับไปหน้าที่มาจาก
//
// LIN 2026-07-26: Custom OIDC Provider ของ Supabase ใช้กับ LINE ไม่ได้จริง (LINE เซ็น
// id_token แบบ HS256 ตอน web login แต่ Supabase custom provider คาด ES256) ต้องเชื่อมเอง
// ผ่าน Edge Function แทน (ดู supabase/functions/line-login/index.ts)
//
// เริ่มต้น flow ที่ reading-auth.js (ฟังก์ชัน startLineLogin) — หน้านั้นเป็นคนสร้าง
// state/nonce/return_to เก็บใน sessionStorage ก่อน redirect ไป LINE
// FILE MAP: [01] safe output/return URL → [02] callback validation → [03] token exchange + redirect
// ════════════════════════════════════════════════════════════
(function () {
  'use strict';
  var boxEl = document.getElementById('line-cb-box');
  var CALLBACK_TIMEOUT_MS = 12000;

  function withCallbackTimeout(promise, label, uncertain) {
    return new Promise(function (resolve, reject) {
      var settled = false;
      var timer = setTimeout(function () {
        if (settled) return;
        settled = true;
        var error = new Error(label + '逾時');
        error.uncertain = !!uncertain;
        reject(error);
      }, CALLBACK_TIMEOUT_MS);
      Promise.resolve(promise).then(function (value) {
        if (settled) return;
        settled = true; clearTimeout(timer); resolve(value);
      }, function (error) {
        if (settled) return;
        settled = true; clearTimeout(timer);
        if (uncertain && error && typeof error === 'object' && error.uncertain == null) error.uncertain = true;
        reject(error);
      });
    });
  }

  function esc(s) { return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

  function returnTo() {
    var t = '';
    // 2026-08-08: localStorage แทน sessionStorage (ดูเหตุผลเต็มที่ reading-auth.js ตรง startLineLogin)
    try { t = localStorage.getItem('line_login_return_to') || ''; } catch (e) {}
    // กัน open-redirect: ต้องเป็น path ในเว็บเราเอง (ขึ้นต้นด้วย / หรือเป็นชื่อไฟล์ .html เท่านั้น) ไม่ใช่ URL เต็มไปเว็บอื่น
    if (!t || /^https?:\/\//i.test(t) || t.indexOf('//') === 0) return 'games.html';
    return t;
  }

  function showError(msg) {
    if (!boxEl) return;
    boxEl.innerHTML =
      '<div style="font-size:34px;margin-bottom:10px;">😥</div>' +
      '<h1 style="font-family:\'Noto Serif TC\',serif;font-size:17px;margin:0 0 8px;color:#C0392B;">登入失敗</h1>' +
      '<p>' + esc(msg) + '</p>' +
      '<a class="btn" href="' + esc(returnTo()) + '">返回上一頁</a>';
  }

  function showUncertain(msg) {
    if (!boxEl) return;
    boxEl.innerHTML =
      '<div style="font-size:34px;margin-bottom:10px;">⏳</div>' +
      '<h1 style="font-family:\'Noto Serif TC\',serif;font-size:17px;margin:0 0 8px;color:#8B6310;">尚未確認完成</h1>' +
      '<p>' + esc(msg) + '</p>' +
      '<a class="btn" href="' + esc(returnTo()) + '">返回並檢查狀態</a>';
  }

  function run() {
    var cfg = window.SUPABASE_CONFIG || {};
    var ready = cfg.url && cfg.anonKey && window.supabase && window.supabase.createClient;
    if (!ready) { showError('網頁載入不完整，請重新整理再試一次'); return; }
    var sb = window.getSupabaseClient ? window.getSupabaseClient() : window.supabase.createClient(cfg.url, cfg.anonKey);

    var qs = new URLSearchParams(location.search || '');
    var lineErr = qs.get('error');
    if (lineErr) {
      // LINE เองปฏิเสธ/ผู้เล่นกดยกเลิกที่หน้ายินยอม (ไม่ใช่ error จาก Edge Function ของเรา)
      // รายละเอียด error code: https://developers.line.biz/en/docs/line-login/integrate-line-login/#error-codes
      showError(lineErr === 'ACCESS_DENIED' ? '你取消了 LINE 登入' : ('LINE 拒絕登入請求（' + lineErr + '）'));
      return;
    }

    var code = qs.get('code');
    var state = qs.get('state');
    var savedState = '', nonce = '', linkMode = false;
    try {
      savedState = localStorage.getItem('line_login_state') || '';
      nonce = localStorage.getItem('line_login_nonce') || '';
      linkMode = localStorage.getItem('line_login_link') === '1';
    } catch (e) {}

    if (!code || !state || !savedState || state !== savedState) {
      showError('這個連結可能已經用過，或不是從登入按鈕開啟的。請回上一頁重新點擊 LINE 登入');
      return;
    }
    // state/nonce/link flag ใช้ครั้งเดียว — ลบทิ้งทันทีกันเอาไปใช้ซ้ำ (replay)
    try {
      localStorage.removeItem('line_login_state');
      localStorage.removeItem('line_login_nonce');
      localStorage.removeItem('line_login_link');
    } catch (e) {}

    var redirectUri = location.origin + location.pathname; // ต้องตรงเป๊ะกับตอนขอ code (ไม่มี query/hash)

    function callEdgeFn(extraBody, extraHeaders) {
      var body = { code: code, redirect_uri: redirectUri, nonce: nonce };
      for (var k in extraBody) { if (extraBody.hasOwnProperty(k)) body[k] = extraBody[k]; }
      var invocation = Promise.resolve(sb.functions.invoke('line-login', { body: body, headers: extraHeaders || {} })).then(function (res) {
        if (res.error || !res.data || !res.data.ok) {
          if (res.error && res.error.context && typeof res.error.context.json === 'function') {
            return res.error.context.json().then(function (body2) {
              throw new Error((body2 && (body2.detail || body2.error)) || res.error.message || '未知錯誤');
            });
          }
          var invokeError = new Error((res.data && (res.data.detail || res.data.error)) || (res.error && res.error.message) || '未知錯誤');
          // A client/network invocation error has no authoritative remote result.
          if (res.error && !res.error.context) invokeError.uncertain = true;
          throw invokeError;
        }
        return res.data;
      });
      return withCallbackTimeout(invocation, '等待 LINE 伺服器回應', true);
    }

    if (linkMode) {
      // v16 (LIN 2026-07-26): โหมดผูก LINE เข้ากับบัญชีที่ล็อกอินอยู่แล้ว (ไม่ใช่ล็อกอินใหม่)
      // ต้องส่ง access token ของบัญชีปัจจุบันไปให้ Edge Function ยืนยันตัวจริงฝั่งเซิร์ฟเวอร์
      withCallbackTimeout(sb.auth.getSession(), '確認目前登入狀態', false).then(function (sres) {
        var token = sres && sres.data && sres.data.session && sres.data.session.access_token;
        if (!token) throw new Error('請先登入才能連接 LINE 帳號');
        return callEdgeFn({ link: true }, { Authorization: 'Bearer ' + token });
      }).then(function () {
        // v17 (LIN 2026-07-26): แก้บั๊กจริง — เจอจาก Lin ทดสอบ ขึ้น "連接成功" แต่เช็คแล้วไม่ได้ผูกจริง
        // สาเหตุ: Edge Function อัปเดต app_metadata.line_linked ที่ฝั่ง Supabase เสร็จแล้วก็จริง (ตาราง
        // line_identities มีแถวถูกต้อง) แต่ access token/JWT ที่เบราว์เซอร์ถืออยู่ ณ ตอนนั้น "เก่ากว่า" การอัปเดต
        // (JWT ฝัง app_metadata ไว้ตอนออกบัตรครั้งก่อน ไม่รู้จักการเปลี่ยนแปลงจนกว่าจะรีเฟรช token เอง) ผลคือ
        // หน้าเว็บอ่านค่า "已連接" จาก JWT เก่ายังเห็นเป็นยังไม่ผูก ทั้งที่หลังบ้านผูกสำเร็จแล้วจริง —
        // แก้โดยสั่ง refreshSession() ให้ออก JWT ใบใหม่ทันทีหลังผูกสำเร็จ ก่อนเด้งกลับหน้าเดิม
        // (best-effort — ถ้า refresh พลาดก็ไม่เป็นไร ข้อมูลผูกจริงในฐานข้อมูลถูกต้องอยู่แล้ว แค่ badge จะช้าไปรอบเดียว)
        return withCallbackTimeout(sb.auth.refreshSession(), '更新登入狀態', false).catch(function () {});
      }).then(function () {
        if (boxEl) {
          boxEl.innerHTML =
            '<div style="font-size:34px;margin-bottom:10px;">🎉</div>' +
            '<h1 style="font-family:\'Noto Serif TC\',serif;font-size:17px;margin:0 0 8px;color:#2d6a4f;">連接成功！</h1>' +
            '<p>下次可以直接用 LINE 登入這個帳號了</p>' +
            '<a class="btn" href="' + esc(returnTo()) + '">返回上一頁</a>';
        }
        setTimeout(function () { location.replace(returnTo()); }, 1500);
      }).catch(function (e) {
        var msg = (e && e.message) || String(e);
        if (msg === 'already_linked_to_other_account') msg = '這個 LINE 帳號已經連接過別的帳號了';
        if (e && e.uncertain) {
          showUncertain('無法確認 LINE 是否已連接。請返回上一頁檢查帳號狀態；確認前請勿連續重複連接。');
        } else {
          showError('連接失敗（' + esc(msg).slice(0, 120) + '）');
        }
      });
      return;
    }

    callEdgeFn({})
      .then(function (data) {
        if (!data.hashed_token) throw new Error('伺服器沒有回傳登入憑證');
        return withCallbackTimeout(
          sb.auth.verifyOtp({ token_hash: data.hashed_token, type: 'email' }),
          '確認 LINE 登入狀態', true
        ).then(function (r2) {
          if (r2.error) throw new Error(r2.error.message);
          // ให้ reading-auth.js รู้ว่าเพิ่งล็อกอินสำเร็จด้วย LINE จริงๆ (ยิง GA4 login_success ให้ครบ)
          try { sessionStorage.setItem('rg_login_pending', 'line'); } catch (e) {}
          location.replace(returnTo());
        });
      })
      .catch(function (e) {
        if (e && e.uncertain) {
          showUncertain('無法確認 LINE 登入是否完成。請返回上一頁檢查是否已登入；若仍未登入，再重新開始一次 LINE 登入。');
        } else {
          showError('連接 LINE 時發生問題（' + esc((e && e.message) || String(e)).slice(0, 120) + '）請改用 Email 驗證碼登入');
        }
      });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run); else run();
})();
