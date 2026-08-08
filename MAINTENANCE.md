# ประวัติงานดูแลเว็บ

## 2026-08-08 (P5-A รอบ 3 — แก้แคชเก่าค้าง) — ปุ่มแชร์บทความ blog/ ยังขึ้น popup ซ้อน 2 กล่องหลัง push แล้ว

สถานะ: **แก้แล้ว รอ Lin hard refresh + ทดสอบซ้ำ 3 จุดแล้ว push**

ปัญหา: หลัง push commit รอบ 2 (แก้ให้คอมทุกเบราว์เซอร์ไป popup ตรงๆ ไม่ผ่าน `navigator.share`) แล้ว Lin ทดสอบซ้ำบนคอม (บทความใน `blog/`) ยังเจออาการเดิม — ขึ้น popup ซ้อนกัน 2 กล่อง

ตรวจโค้ดจริงแล้วพบว่า: `js/core/shared.js` (source) และ `js/core/shared.min.js` (minified) ในเครื่องมีโค้ดแก้รอบ 2 ถูกต้องครบแล้วจริง (มี `isMobileDevice` guard, ตรวจว่าเป็นมือถือก่อนถึงจะเรียก `navigator.share`) และเป็น commit ล่าสุดในเครื่อง (`e6c96de`) ตรงกับที่ Lin ยืนยันว่า push แล้ว — โค้ดฝั่งไฟล์ไม่มีปัญหา

สาเหตุที่แท้จริง: commit รอบ 2 **ไม่ได้ขยับเลข cache-buster `?v=` ของ `shared.min.js`** (ยังเป็น `v=17` เท่าเดิมกับก่อนแก้) — เบราว์เซอร์ของ Lin ที่เคยโหลดหน้าเว็บมาก่อนหน้านี้แล้ว จะแคชไฟล์ `shared.min.js?v=17` (เวอร์ชันเก่าก่อนแก้รอบ 2) ไว้ที่ URL เดิม ต่อให้เนื้อหาไฟล์บน GitHub เปลี่ยนไปแล้ว เบราว์เซอร์ก็ไม่รู้ว่าต้องโหลดใหม่เพราะ URL (รวม query string) เหมือนเดิมทุกตัวอักษร เลยยังรันโค้ดเก่าที่เช็คแค่ "มี `navigator.share` ไหม" อยู่ — ตรงกับอาการที่ Lin เจอเป๊ะ (คอมมี `navigator.share` เลยขึ้นเมนูเครื่องก่อน กดปิดแล้ว `.catch()` เด้ง popup ตามมาซ้อนอีกกล่อง)

ตรวจเพิ่มเติมเพื่อตัดสาเหตุอื่นออก: หน้าบทความใน `blog/` ไม่มีปุ่ม/handler แชร์ซ้ำซ้อนกันเอง (มีจุดเรียกเดียวจาก `shared.min.js` เท่านั้น) และ `openSharePopup()` เองก็ไม่มีการเรียก `navigator.share` ซ้อนอยู่ข้างในเลย — ยืนยันว่าไม่ใช่บั๊กจากตรรกะโค้ด แต่เป็นแคชเก่าค้างล้วนๆ

วิธีแก้: ขยับเลข cache-buster ของ `shared.min.js` จาก `?v=17` → `?v=18` ให้ครบทุกหน้าที่โหลดไฟล์นี้ (76 ไฟล์ — ตรวจด้วย grep ว่าไม่มี `v=17` เหลือค้างแล้ว) ไม่ได้แก้เนื้อหา `shared.js`/`shared.min.js` เพิ่มเติม เพราะโค้ดถูกอยู่แล้ว แค่ต้องบังคับให้เบราว์เซอร์โหลดไฟล์ใหม่

ไฟล์ที่แก้: ไฟล์ `.html` ทั้ง 76 ไฟล์ที่มี `<script src="...shared.min.js?v=17">` (bump เป็น `v=18` เท่านั้น ไม่แตะเนื้อหาอื่น)

ผลตรวจ: `node scripts/check-site.js` ผ่านทั้งหมด (819 ไฟล์)

**สิ่งที่ Lin ต้องทำเอง:** push ผ่าน GitHub Desktop แล้ว **hard refresh** (Cmd+Shift+R บน Mac หรือปิด-เปิดแท็บใหม่) ก่อนทดสอบซ้ำ 3 จุด: iPhone Safari (ต้องขึ้นเมนูเครื่อง) / คอม Safari (ต้องเป็น popup ตรงๆ ไม่มีเมนูเครื่องมาก่อน) / คอม Chrome (แบบเดียวกัน) — ถ้ายังเจอปัญหาเดิมหลัง hard refresh แปลว่าไม่ใช่แคชแล้ว ต้องแจ้งกลับพร้อมบอกว่า hard refresh แล้วจริงหรือยัง

## 2026-08-08 (P5-A ปรับตามผลทดสอบ Lin) — ปุ่มแชร์บทความ: คอมทุกเบราว์เซอร์ให้ไปกล่อง popup ตรงๆ

สถานะ: **โค้ดแก้เสร็จแล้ว รอ Lin ทดสอบซ้ำ (iPhone Safari + คอม Safari + คอม Chrome) แล้ว push**

ปัญหาที่ Lin ทดสอบเจอ: `shareBlogArticle()` เดิมเช็คแค่ "เบราว์เซอร์มี `navigator.share` ไหม" — คอมเดสก์ท็อปรุ่นใหม่ (Safari/Chrome) ก็มี `navigator.share` เหมือนกัน ไม่ใช่แค่มือถือ เลยขึ้นเมนูแชร์ของเครื่อง (native share sheet) ก่อนบนคอมด้วย ถ้า Lin กดปิดเมนูนั้น (ไม่ได้เลือกช่องทางไหน) `navigator.share().catch()` จับ error ทุกแบบรวมถึง "คนกดยกเลิก" เลยเด้งกล่อง popup (FB/LINE) ตามมาซ้อนอีกกล่อง = ได้ 2 กล่องซ้อนกัน

การตัดสินใจของ Lin: คอมทุกเบราว์เซอร์ (Safari/Chrome/Firefox) ให้ใช้กล่อง popup (FB/LINE) เสมอ ไม่ผ่าน `navigator.share` เลย ส่วนมือถือให้คงเดิม (ขึ้นเมนูเครื่องก่อน — ทดสอบผ่านแล้วบน iPhone Safari)

วิธีแก้: เปลี่ยนเงื่อนไขจาก "มี `navigator.share` ไหม" เป็น "เป็นมือถือไหม (`/Android|iPhone|iPad|iPod/i` ตรวจ user agent) และมี `navigator.share`" — เป็นมือถือถึงจะเรียก `navigator.share()` เดสก์ท็อปทุกเบราว์เซอร์ไป `openSharePopup()` ตรงๆ

ไฟล์ที่แก้: `js/core/shared.js` (หัวข้อ `[03.6] BLOG ARTICLE SHARE BUTTON`) → รัน `scripts/build-minjs.sh` แล้ว → `shared.min.js` อัปเดตแล้ว

ผลตรวจ: `node scripts/check-site.js` ผ่านทั้งหมด (819 ไฟล์)

**สิ่งที่ Lin ต้องทำเอง:** ทดสอบซ้ำ 3 จุดก่อน push — iPhone Safari (ต้องขึ้นเมนูเครื่องเหมือนเดิม) + คอม Safari (ต้องขึ้นกล่อง popup FB/LINE ทันที ไม่มีเมนูเครื่องมาก่อน) + คอม Chrome (แบบเดียวกัน) ผ่านครบแล้ว push ผ่าน GitHub Desktop (client-side ล้วน ไม่ต้อง deploy อะไรเพิ่ม)

## 2026-08-08 (บั๊กจริง #2 รอบ 3) — Lin push+รอแล้ว ยังขึ้น error เดิมบนมือถือ → เจอสาเหตุจริง: ลืม bump cache-buster

สถานะ: **โค้ดแก้เสร็จแล้ว รอ Lin push แล้วทดสอบซ้ำอีกครั้ง (บนมือถือ ตามที่เพิ่งพัง)**

ปัญหา: Lin push commit ของรอบ 2 (sessionStorage→localStorage) แล้ว รอสักครู่ค่อยทดสอบเชื่อม LINE บนมือถือ แต่ยังขึ้น error เดิม "這個連結可能已經用過"

ตรวจโค้ดจริงแล้ว: เนื้อหาไฟล์ `js/games/reading-auth.js` และ `js/games/line-callback.js` เปลี่ยนเป็น `localStorage` ครบถ้วนถูกต้องแล้วจริง (ไม่ใช่บั๊กใหม่ในโค้ด) — แต่พบว่ารอบแก้ 2 **ลืม bump เลขเวอร์ชัน cache-buster** ที่ต่อท้าย URL ตอนโหลดไฟล์ (เช่น `reading-auth.js?v=11`) ทั้งที่เว็บนี้มีธรรมเนียมต้อง bump ทุกครั้งที่แก้เนื้อหาไฟล์ (เคยทำมาก่อนกับ `shared.js` bump `v=16→17`) — เลขเวอร์ชันคงเดิมทำให้เบราว์เซอร์/CDN อาจยังเสิร์ฟไฟล์เก่า (มี sessionStorage) ซ้ำภายใต้ URL เดียวกัน แม้ push โค้ดใหม่ไปแล้วจริงก็ตาม ตรงกับอาการที่ Lin เจอ (error เดิมซ้ำแม้รอแล้วค่อยทดสอบ)

วิธีแก้: bump เลขเวอร์ชันใน 8 หน้า — `reading-auth.js?v=11→12` (vault.html, reading-game.html, tone-finder.html, games-challenge.html, lego.html, typing-game.html, word-order.html) + `line-callback.js?v=3→4` (line-callback.html) — ไม่แตะเนื้อหาไฟล์ JS เอง (ถูกอยู่แล้วจากรอบ 2)

ไฟล์ที่แก้: `vault.html`, `reading-game.html`, `tone-finder.html`, `games-challenge.html`, `lego.html`, `typing-game.html`, `word-order.html`, `line-callback.html` (แก้แค่เลข `?v=` ในแท็ก `<script>`)

ผลตรวจ: `node scripts/check-site.js` ผ่านทั้งหมด (819 ไฟล์)

**สิ่งที่ Lin ต้องทำเอง:** push ผ่าน GitHub Desktop (client-side ล้วน ไม่ต้อง deploy Edge Function) รอเว็บอัปเดตแล้วทดสอบเชื่อม LINE บนมือถืออีกครั้ง (เบราว์เซอร์เดิมที่เพิ่งพัง) — ถ้ายังไม่หายอีก ให้ส่งภาพหน้าจอ error จริง + บอกว่าเปิดจากในแอป LINE หรือเปิดจาก Safari/Chrome บนมือถือ

## 2026-08-08 (บั๊กจริง #2) — เชื่อม LINE ในซาฟารีพัง "連結可能已經用過" (ใช้ได้ปกติในแอป LINE)

สถานะ: **โค้ดแก้เสร็จแล้ว รอ Lin push แล้วทดสอบซ้ำในซาฟารี**

ปัญหา: หลังแก้บั๊ก invalid_client เสร็จ Lin ทดสอบเชื่อม LINE ในแอป LINE (in-app browser) สำเร็จ แต่ในซาฟารีบน Mac (เครื่องที่ลงแอป LINE เดสก์ท็อปไว้ด้วย) พังด้วย error "這個連結可能已經用過" ทุกครั้งแม้กดปุ่มสดๆ ไม่ได้เปิดลิงก์เก่าซ้ำ

สาเหตุที่แท้จริง: `line_login_state`/`nonce`/`return_to`/`link` เดิมเก็บด้วย `sessionStorage` ซึ่งผูกกับ**แท็บเดิม**เท่านั้น — ซาฟารีบนเครื่องที่มีแอป LINE เดสก์ท็อปติดตั้งอยู่ ส่งต่อการล็อกอินไปให้แอป LINE จัดการแทน แล้วเปิดหน้า redirect กลับมาเป็น**แท็บ/หน้าต่างใหม่** ไม่ใช่แท็บที่กดปุ่มไว้ตอนแรก → sessionStorage ของแท็บเดิมเข้าไม่ถึง ทำให้เช็ค state ใน `line-callback.js` พังทุกครั้ง (ไม่เกิดในแอป LINE เพราะไม่มีการสลับแท็บแบบนี้)

วิธีแก้: เปลี่ยนทั้ง 4 คีย์จาก `sessionStorage` → `localStorage` (ผูกกับ origin ไม่ใช่แท็บ ใช้ร่วมกันได้ทุกแท็บ/หน้าต่างของเบราว์เซอร์เดียวกัน) ยังลบทิ้งทันทีหลังใช้ครั้งเดียวเหมือนเดิม (กัน replay)

ไฟล์ที่แก้: `js/games/reading-auth.js`, `js/games/line-callback.js` (ไม่มี `.min.js` คู่กัน ไม่ต้อง rebuild)

ผลตรวจ: `node scripts/check-site.js` ผ่านทั้งหมด (819 ไฟล์)

**สิ่งที่ Lin ต้องทำเอง:** push ผ่าน GitHub Desktop (client-side ล้วน ไม่ต้อง deploy Edge Function) รอเว็บอัปเดตแล้วทดสอบเชื่อม LINE ในซาฟารีอีกครั้ง

## 2026-08-08 (บั๊กจริง) — เชื่อม LINE พังทันที "invalid_client / invalid client_secret"

สถานะ: **โค้ดแก้เสร็จแล้ว รอ Lin ตั้ง secret ชื่อใหม่ใน Supabase + deploy `line-login` ใหม่**

ปัญหา: Lin ทดสอบเชื่อม LINE หลัง deploy ก้อน 2 (audit log) แล้วพังทันทีด้วย `{"error":"invalid_client","error_description":"invalid client_secret"}` — ข้อความนี้มาจาก LINE เองตรงๆ (ไม่ใช่โค้ดเรา) ตอนแลก code เป็น token

สาเหตุที่แท้จริง (ตรวจโค้ดแล้ว ไม่ใช่บั๊กจาก audit log): `line-login/index.ts` และ `line-webhook/index.ts` อ่าน secret ชื่อเดียวกันคือ `LINE_CHANNEL_SECRET` ทั้งคู่ แต่เป็นคนละ LINE channel กัน (line-login = channel "LINE Login" · line-webhook = channel "Messaging API" ของบอท) — Supabase Edge Function secrets เป็นของกลางทั้งโปรเจกต์ ไม่แยกตามฟังก์ชัน ใครก็ตามที่เคยตั้ง `LINE_CHANNEL_SECRET` ใหม่เพื่อแก้ line-webhook (มีบันทึกไว้จริงตอน 2026-08-01) จะเขียนทับค่าที่ line-login ต้องใช้แบบไม่รู้ตัว

วิธีแก้: เปลี่ยนชื่อ env var ที่ `line-login/index.ts` อ่าน จาก `LINE_CHANNEL_SECRET` → `LINE_LOGIN_CHANNEL_SECRET` กันชนกันถาวร (ไม่แตะ `line-webhook` เลย ยังใช้ชื่อเดิม)

ไฟล์ที่แก้: `supabase/functions/line-login/index.ts`

**สิ่งที่ Lin ต้องทำเอง:** ดูขั้นตอนเต็มใน `Bussiness Idea/ระบบเว็บไซต์/52_คำสั่งเปิดแชทสอง_...md` เรื่องที่ 6 (ตั้ง secret ชื่อใหม่จาก channel "LINE Login" + deploy ใหม่)

## 2026-08-08 (P6-09~12 ก้อน 2) — Account audit log + ต่อสายเข้า Link LINE/Facebook

สถานะ: **โค้ดพร้อมแล้ว รอ Lin รัน SQL ใน Supabase ก่อนถึงจะทำงานได้จริง + deploy `line-login` ใหม่**

ปัญหา: ระบบบัญชีผู้เล่นไม่มีตาราง audit/history เลยแม้แต่แถวเดียว — ถ้ามีปัญหาบัญชี Lin ตรวจย้อนหลังไม่ได้ว่าเกิดอะไรขึ้น (สเปกข้อ 14 ที่ Lin ให้มาบังคับว่าต้องมี)

วิธีแก้: สร้างตาราง `public.account_audit_log` (`user_id`, `event_type` — CHECK จำกัด 8 ค่าตามสเปก, `provider`, `before_state`/`after_state` jsonb, `actor_type`/`actor_id`, `created_at`) เปิด RLS แบบไม่มี policy ตั้งใจ (fail-closed) เขียนได้ทางเดียวผ่านฟังก์ชัน `log_account_audit()` (SECURITY DEFINER) ต่อสายเข้ากับจุด "เชื่อมบัญชีสำเร็จ" ที่มีอยู่แล้วจริง 2 จุด: LINE (บันทึกฝั่ง server ใน Edge Function น่าเชื่อถือกว่า) และ Facebook (บันทึกฝั่ง client เพราะไม่มี Edge Function คั่นกลาง — มีข้อจำกัด: ปิดแท็บ/เน็ตหลุดตอน redirect กลับจาก Facebook จะไม่มี log แม้เชื่อมสำเร็จจริง เป็นข้อจำกัดของสถาปัตยกรรมเดิม ไม่ใช่บั๊กใหม่)

ไฟล์ที่แก้/สร้าง: 🆕 `supabase/sql/2026-08-08_account_audit_log.sql`, `supabase/functions/line-login/index.ts`, `js/core/auth-widget.js`, `supabase/sql/00_ฟังก์ชันไหนอยู่ไฟล์ไหน.md`

ผลตรวจ: `node scripts/check-site.js` ผ่านทั้งหมด (ไม่มี `.min.js` คู่กันสำหรับ 3 ไฟล์นี้)

**สิ่งที่ Lin ต้องทำเอง (ดูขั้นตอนเต็มที่ `Bussiness Idea/ระบบเว็บไซต์/52_คำสั่งเปิดแชทสอง_...md`):** รัน SQL ไฟล์นี้ใน Supabase SQL Editor ก่อน แล้ว deploy `line-login` ใหม่อีกรอบ — ถ้ายังไม่ทำ ปุ่มเชื่อม LINE/Facebook ยังใช้งานได้ปกติเหมือนเดิมทุกอย่าง แค่ยังไม่มี log บันทึก (ห่อด้วย try/catch ไม่ทำให้พัง)

**ยังไม่ครอบคลุม:** Unlink (ยังไม่สร้างฟีเจอร์ รอ Lin ตัดสินใจก่อน) และ event อื่นในสเปก (เปลี่ยนอีเมล/admin correction ฯลฯ — ยังไม่มีฟีเจอร์พวกนั้นให้ log)

## 2026-08-08 (P6-09~12 ก้อน 1 บางส่วน) — เคลียร์ localStorage cache ตอน logout

สถานะ: **โค้ดแก้เสร็จแล้ว รอ Lin push** (คนละ commit จากงานอื่นวันนี้)

ปัญหา: `doLogout()` ใน `js/core/auth-widget.js` เดิมเรียกแค่ `sb.auth.signOut()` ซึ่งลบแค่ session token ของ Supabase เอง ไม่ลบ localStorage cache อื่นที่แอปเขียนเอง (`tf_avatar`, `tf_pinned_badge`, `sa_nick_prompted`, `tf_logsess_at`, `rg_last_login_provider`) — บนเครื่องสาธารณะ/ใช้ร่วมกัน คนถัดไปที่เปิดเว็บก่อนล็อกอินจะยังเห็น avatar/badge/hint "上次登入方式" ของคนก่อนหน้าค้างอยู่ (ไม่ใช่ข้อมูลลับ แต่ไม่ควรค้าง) — พบระหว่างตรวจสเปกระบบบัญชีผู้เล่นที่ Lin ส่งมา (ดู `Bussiness Idea/ระบบเว็บไซต์/49_P6-09to12_...md`)

วิธีแก้: เพิ่ม `localStorage.removeItem(...)` ทั้ง 5 คีย์เข้าไปใน `doLogout()` (4 คีย์แรกประกาศอยู่ในไฟล์เดียวกันอยู่แล้ว ส่วน `rg_last_login_provider` เป็นคีย์ของ `js/games/reading-auth.js` — เขียน literal string ตรงๆ แทนเพราะ localStorage เป็นที่เก็บกลางของเบราว์เซอร์ ไม่ต้องพึ่งฟังก์ชันไฟล์นั้น)

ไฟล์ที่แก้: `js/core/auth-widget.js` (ไม่มี `.min.js` คู่กัน ไม่ต้อง rebuild)

ผลตรวจ: `node --check js/core/auth-widget.js` ผ่าน · `node scripts/check-site.js` ผ่านทั้งหมด (818 ไฟล์)

**ยังไม่ได้ทดสอบ (ต้องให้ Lin เปิดเบราว์เศร์จริง):** ล็อกอิน → ตั้ง avatar/badge → logout → เปิด DevTools (F12) → Application → Local Storage → เช็คว่า 5 คีย์ข้างต้นหายไปจริง

**หมายเหตุ:** นี่คือแค่ส่วน "เคลียร์ cache" ของ P6-09~12 ก้อน 1 เท่านั้น — ส่วนปุ่ม "ยกเลิกการเชื่อมบัญชี" (Unlink) ยังไม่ได้ทำ เพราะมีคำถามออกแบบที่ต้องรอ Lin ตัดสินใจก่อน (ดู `52_คำสั่งเปิดแชทสอง_...md` เรื่องที่ 4)

## 2026-08-08 (SEO) — เพิ่มปุ่มแชร์บทความให้ 44 บทความใน `blog/`

สถานะ: **โค้ดแก้เสร็จแล้ว รอ Lin ทดสอบมือถือจริง + push**

Lin อนุมัติดีไซน์แบบรวม: ปุ่มเดียว "🔗 分享這篇文章" ท้ายบทความ → เบราว์เซอร์ที่รองรับ Web Share API เด้งเมนูแชร์ของเครื่องเลย → ไม่รองรับ/ถูกยกเลิก ตกไปที่กล่อง popup เดิม (ที่เพิ่งซ่อมบั๊กด้านล่าง) ซึ่งเพิ่มไอคอน Facebook/LINE ให้กดแชร์ตรงไปแต่ละช่องทางได้เลย

วิธีทำให้ครบ 44 บทความโดยไม่ต้องแก้ทีละไฟล์: เพิ่ม `autoInjectBlogShareButton()` ใน `js/core/shared.js` ทำงานเฉพาะหน้าที่ path มี `/blog/` อ่าน title/description/canonical URL ของหน้านั้นเองมาแทรกปุ่มอัตโนมัติหน้า `.related-articles`

ไฟล์ที่แก้: `js/core/shared.js` (+ regenerate `shared.min.js`), bump cache-buster `?v=16→17` ใน 76 หน้าที่โหลดไฟล์นี้ (ไม่ได้แก้เนื้อหาไฟล์บทความเองเลย)

ผลตรวจ: `node scripts/check-site.js` ผ่านทั้งหมด · ยืนยัน `openSharePopup()` ที่เพิ่ม parameter `url` แล้ว ยัง backward compatible กับจุดเรียกเดิม (`shareFBPost()`/`shareSSArticle()` ที่ยังไม่ส่ง url มา)

**ยังไม่ได้ทดสอบ (ต้องให้ Lin ทำบนมือถือ+คอมจริง):** ดูหัวข้อ "เรื่องที่ 1ข" ใน `Bussiness Idea/ระบบเว็บไซต์/52_คำสั่งเปิดแชทสอง_...md`

## 2026-08-08 (แก้บั๊กปุ่มแชร์) — ปุ่ม 🔗 分享本文 error บนเกือบทุกหน้า

สถานะ: **โค้ดแก้เสร็จแล้ว รอ Lin push**

ปัญหา: กดปุ่ม "🔗 分享本文" (แชร์โพสต์) แล้ว error `TypeError: null is not an object` บนเกือบทุกหน้าของเว็บ — ใช้ได้แค่ 4 หน้า (`index.html`, `resources.html`, `pricing.html`, `faq.html`)

สาเหตุ: กล่อง popup แชร์ (`share-bg` / `share-popup` / `share-text-area` / `share-copy-btn`) เป็น static HTML ที่ก็อปวางตรงๆ ไว้แค่ 4 หน้าเดิม ไม่ได้อยู่ในระบบแทรก modal อัตโนมัติ `injectSharedModals()` เหมือนกล่องอื่น (`modal-contact`, `modal-fbposts` ฯลฯ) — ปุ่ม "🔗 分享本文" เองถูกสร้างจากโค้ดกลางใน `shared.js` (ใช้ร่วมทุกหน้า) ดังนั้นหน้าไหนก็กดปุ่มนี้ได้ แต่พอ `openSharePopup()` ไปหา `document.getElementById('share-text-area')` ในหน้าที่ไม่มีกล่อง static ก็ได้ `null` ทันที

วิธีแก้: ย้าย HTML ของกล่องแชร์เข้าไปเป็นส่วนหนึ่งของ `injectSharedModals()` ใน `js/core/shared.js` (คัดลอกมาจากเวอร์ชันของ `index.html` เป๊ะ พร้อม guard `if (!document.getElementById('share-bg'))` แบบเดียวกับกล่องอื่น) แล้วลบ static HTML ของกล่องนี้ออกจาก 4 หน้าเดิมที่เคยมี (กัน id ซ้ำ) — ตอนนี้ทั้ง 76 หน้าที่โหลด `shared.js`/`shared.min.js` จะได้กล่องแชร์จากจุดเดียวกันหมด ไม่มีหน้าไหนขาด

ไฟล์ที่แก้: `js/core/shared.js` (+ regenerate `js/core/shared.min.js` ด้วย `scripts/build-minjs.sh`), `index.html`, `resources.html`, `pricing.html`, `faq.html` (ลบ static HTML กล่องแชร์ออก)

ผลตรวจ: `node scripts/check-site.js` ผ่านทั้งหมด (818 ไฟล์ ไม่มีค่าลับหลุด) · ตรวจด้วยตาว่า HTML ของกล่องแชร์ที่ย้ายเข้า `shared.js` ตรงกับต้นฉบับ `index.html` ทุกตัวอักษร (สี/ปุ่ม/hover ใช้ตัวแปรธีม `--gold` เดิม) · ยืนยันด้วย grep ว่าไม่มี `share-bg` static เหลือค้างซ้ำในไฟล์ไหนแล้ว
**ยังไม่ได้ทดสอบ (ต้องให้ Lin เปิดเบราว์เซอร์จริง):** กดปุ่ม "🔗 分享本文" บนหน้าที่เคยพัง เช่น `blog.html`, `games.html`, `tone-finder.html` แล้วดูว่ากล่องแชร์เปิดขึ้นมาไม่ error + ปุ่ม "一鍵複製" คัดลอกได้จริง

## 2026-08-08 (รอบดึกสุด) — "กลุ่ม 2": จำกัด CORS / แยก inline script index.html / เพิ่ม GA4+meta / ต่อ GA4 event เจอเพดาน

สถานะ: **✅ Lin push ขึ้น GitHub แล้ว + deploy CORS ครบ 6/6 ตัวแล้ว 2026-08-08** (ยืนยันจาก log จริง ทุกตัว "Deployed Functions on project qzkxlhpcputsvbqmtqfi") — เหลือ 1 อย่างที่ Lin ต้องทำเอง: เปิด mrtaihualin.com เช็คด้วยตาว่า modal วิดีโอ/FB/self-study ยังทำงานปกติ (AI ตรวจด้วยเบราว์เซอร์ไม่ได้รอบนี้)

Lin อนุมัติ "กลุ่ม 2" ทั้งชุดพร้อมกัน ("ทำเลย ทีเดียวให้หมด") สั่งทำคู่ขนาน 4 แชท (ไฟล์ไม่ชนกัน):

1. **CORS Edge Function:** จำกัดจาก `*` เหลือเฉพาะโดเมนเว็บ 6 ตัว (`lego-daily-limit`, `restore-line-student`, `unlink-line-student`, `sync-line-menu`, `notify-line`, `line-login`) ตรวจโค้ดแล้วว่าไม่มีตัวไหนรันในบริบท LIFF · ตั้งใจ**ไม่แตะ** `link-line`/`find-line-student` เพราะรันใน LIFF จริง เสี่ยงพัง LINE ถ้าจำกัด Origin ผิด — **⚠️ ยังไม่ live ต้องรัน `supabase functions deploy <ชื่อ>` ทีละตัวทั้ง 6:**
   ```
   supabase functions deploy lego-daily-limit
   supabase functions deploy restore-line-student
   supabase functions deploy unlink-line-student
   supabase functions deploy sync-line-menu
   supabase functions deploy notify-line
   supabase functions deploy line-login
   ```
   หลักฐาน `Bussiness Idea/ระบบเว็บไซต์/44_ผลลัพธ์_P7-03_จำกัดCORS.md`

2. **แยก inline script `index.html`:** ย้าย ~406 บรรทัดออกเป็น `js/acquisition/index-content-modals.js` (modal วิดีโอ/FB/self-study/share) + `js/acquisition/index-analytics.js` (GA4 tracking เฉพาะหน้า) วางตำแหน่ง `<script src>` เป๊ะจุดเดิม ไม่เปลี่ยนพฤติกรรม — **⚠️ เครื่องมือเบราว์เซอร์ใช้ไม่ได้ในรอบนี้ ตรวจได้แค่อ่านโค้ดซ้ำ ยังไม่ได้กดทดสอบจริง ขอ Lin เปิดหน้าแรกลองกด modal วิดีโอ/FB เช็ค console error สัก 1 นาทีก่อนหรือหลัง push** หลักฐาน `Bussiness Idea/ระบบเว็บไซต์/45_ผลลัพธ์_P5-A_แยกinlineScript.md`

3. **เพิ่ม GA4 + meta:** เพิ่ม GA4 ให้ 12 หน้าที่ไม่เคยมีเลย (`en/*` ทั้ง 7 หน้า, `links.html`, `vocab-cheatsheet.html`, `privacy.html`, `terms.html`, `404.html`) ใช้ Measurement ID จริงตัวเดียวที่ใช้ทั้งเว็บ · แก้หมวด GA4 ของบทความจาก `course` เป็น `article` ครบ 44/44 ไฟล์ · เพิ่ม meta description/og ให้ `vocab-cheatsheet.html` ตามเนื้อหาจริง หลักฐาน `Bussiness Idea/ระบบเว็บไซต์/46_ผลลัพธ์_P5-A_GA4และmeta.md`

4. **ต่อ GA4 event `game_content_cap_hit`:** ใน `js/games/game-content-client.js` ใช้ field `capped` ที่ deploy ไปแล้วก่อนหน้า ยิง event เมื่อผู้เล่นเจอเพดานเนื้อหาฟรี ครั้งเดียวต่อระดับต่อ session (กันสแปม ใช้ `sessionStorage`) ใช้กลไก `gtag()` แบบเดียวกับเกมอื่น หลักฐาน `Bussiness Idea/ระบบเว็บไซต์/47_ผลลัพธ์_P6-08_GA4event_capHit.md`

ผลตรวจ: `node scripts/check-site.js` ผ่านทั้ง 4 งาน (818 ไฟล์) ไม่มีค่าลับหลุด

Commit message แนะนำ (Lin เลือกรวม/แยกเอง แล้ว push ผ่าน GitHub Desktop):
```
จำกัด CORS ของ Edge Function 6 ตัวให้เหลือเฉพาะโดเมนเว็บ (เว้น 2 ตัวที่รันใน LIFF ไว้ตามเดิม) — ยังไม่ deploy

refactor(index): ย้าย inline script 2 บล็อก (YT/FB/self-study/share modal + GA4 event tracking) ออกจาก index.html ไป js/acquisition/ ตำแหน่งเดิมเป๊ะ ไม่เปลี่ยนพฤติกรรม

เพิ่ม GA4 ให้ 12 หน้าที่ไม่เคยมี + แก้หมวดบทความจาก course เป็น article ครบ 44 ไฟล์ + เพิ่ม meta ให้ vocab-cheatsheet.html

เพิ่ม GA4 event game_content_cap_hit ยิงตอนผู้เล่นชนเพดานเนื้อหาฟรี (1 ครั้ง/ระดับ/session)
```

## 2026-08-08 (รอบดึก) — P6-17 + P7-03 + P6-08: แก้หน้า error เกม / ล็อกเวอร์ชัน backup / เพิ่มจุดวัดเจอเพดาน

สถานะ: **โค้ดเสร็จแล้วรอ Lin push** (ยกเว้นข้อ D ที่ต้อง deploy Edge Function เพิ่มอีกขั้นหลัง push)

Lin อนุมัติ 4 งานย่อยแบบแยกเรื่อง (A/B/C/D) พร้อมกัน สั่งทำแบบคู่ขนาน 3 แชท (ไฟล์ไม่ชนกัน):

1. **A+B — แก้หน้า error เกม (`js/games/game-content-client.js` ไฟล์เดียว โหลดทั้ง 6 หน้าเกม):** เปลี่ยนสีแถบโหลด/error จากฟ้า/แดงทั่วไปเป็นชุดสีทองตาม CLAUDE.md · แปล error ดิบ (เช่น `game-content HTTP 500`) เป็นภาษาไทยง่ายๆ ให้ผู้เล่นเห็น (ข้อความดิบยังอยู่ใน `console.error` เพื่อ debug) · เพิ่มปุ่ม "🔙 กลับหน้าเกมทั้งหมด" + "💬 ทัก LINE ครู" (ใช้ลิงก์ LINE เดิมที่มีอยู่แล้วใน `js/core/shared.js`) · เพิ่ม global crash handler (`window.onerror`/`unhandledrejection`) ที่ไม่เคยมีมาก่อนบนหน้าเกมเลยสักหน้า ใช้แถบ error เดียวกับข้อ A · ไม่มี `.min.js` คู่กัน ไม่ต้อง build · หลักฐาน `Bussiness Idea/ระบบเว็บไซต์/41_ผลลัพธ์_P6-17_แก้หน้าerror.md`
2. **C — ล็อกเวอร์ชัน dependency ตัวสำรองข้อมูล:** สร้าง `scripts/backup/package-lock.json` จริงจาก `npm install` (ไม่ได้เขียนมือ, ตรึง `googleapis@144.0.0`) + เปลี่ยน `.github/workflows/backup-database-to-drive.yml` จาก `npm install --no-save` เป็น `npm ci` กันดึงเวอร์ชันแปลกปลอมตอน cron รันตี 3 ที่มี secret Google/LINE อยู่ในเครื่อง · พบเพิ่ม (ไม่ได้แก้ นอกขอบเขต): `npm audit` เจอ 4 moderate vulnerability จาก `uuid` ที่ลึกอยู่ใน `googleapis` ต้องอัป major version ถึงจะหาย — บันทึกรอ Lin ตัดสินใจ หลักฐาน `Bussiness Idea/ระบบเว็บไซต์/42_ผลลัพธ์_P7-03_backup-lockfile.md`
3. **D — เพิ่มจุดวัด "เจอเพดานแล้ว" ใน `supabase/functions/game-content/index.ts`:** เพิ่ม field `capped: {初, 中, sentences}` ใน response (additive ไม่ลบ/ไม่เปลี่ยนชื่อ field เดิม, ไม่แตะ CAPS/tier-detection logic) ตรวจแล้วว่า client (`game-content-client.js`) ไม่พังจากการเพิ่ม field นี้ — **✅ Lin deploy แล้ว 2026-08-08 (`supabase functions deploy game-content` สำเร็จ, project `qzkxlhpcputsvbqmtqfi`) live จริงแล้ว** หลักฐาน `Bussiness Idea/ระบบเว็บไซต์/43_ผลลัพธ์_P6-08_เพิ่มจุดวัดเจอเพดาน.md`

ผลตรวจ: `node scripts/check-site.js` ผ่านทั้ง 3 งาน (816 ไฟล์) ไม่มีค่าลับใหม่หลุด

Commit message แนะนำ (3 ข้อความแยกกัน หรือรวม commit เดียวก็ได้ — Lin เลือกเอง แล้ว push เองผ่าน GitHub Desktop):
```
แก้หน้าแจ้งข้อผิดพลาดเกม: เปลี่ยนสีให้ตรงธีมทอง แปล error เป็นภาษาคน เพิ่มปุ่มกลับ games.html/LINE และเพิ่มระบบดัก JS พังกลางเกมทั้ง 6 หน้า (P6-17)

fix(backup): เพิ่ม package-lock.json ให้ scripts/backup + เปลี่ยน npm install เป็น npm ci กัน supply-chain attack ตอนรัน cron ทุกคืน

เพิ่ม field capped ใน game-content response บอกว่าเจอเพดานฟรีแล้วหรือยัง (ยังไม่ deploy)
```

## 2026-08-08 (รอบเย็น) — P4-04: แยก `data/` ที่ปนกัน (ตัวตรวจ+รายงาน → `data/tools/`, `data/reports/`)

สถานะ: **✅ เสร็จแล้ว + Lin push ขึ้น GitHub แล้ว** — Lin อนุมัติเปิดหลายแชทได้ แต่พบว่างานนี้ทำในแชทเดียวได้ปลอดภัยกว่า (ไฟล์ที่แก้ทับกันหมด) เลยทำตรงนี้เอง

ย้าย 7 ไฟล์ออกจาก `data/` (คงเหลือแค่ข้อมูลจริง: `words-data.js`/`adv-sentences.js`/`tone-engine.js`/`audio-*.js` + หน้าแอดมิน 2 หน้าที่ยังไม่ย้าย รอ Lin ตอบคำถามเข้าถึงยังไง):
- → `data/tools/`: `tests-tone-engine.js`, `tests-check-data-health.js`, `check-duplicate-words.js`, `check-data-health.js`, `regression-check-tone.js`
- → `data/reports/`: `tone-regression-report.json`, `game-behavioral-checklist-manual.md`

แก้ path ในไฟล์ที่อ้างอิงครบ (เจอมากกว่าที่แผนเดิมคาดไว้ — เจอ `scripts/migrate-game-content.js` และ `CLAUDE.md` เองก็อ้างอิง path เดิมด้วย): `scripts/check-site.js` (4 บรรทัด runTest), `scripts/tests-game-behavioral.js` (คอมเมนต์), `data/review-tool.html` (fetch path หา report), `CLAUDE.md` (2 บรรทัดกฎถาวร), requires ภายในไฟล์ที่ย้าย (`./words-data.js` → `../words-data.js` ฯลฯ), `data/tools/regression-check-tone.js` เขียนไฟล์ output ไปที่ `../reports/` แทน · **ยังไม่ได้แก้:** สคริปต์ scheduled task รายสัปดาห์ `weekly-full-audit-product-security-games-schedule` (CHECK 3B อ้าง path เดิม `node data/regression-check-tone.js`) — ไฟล์นั้นอยู่นอก repo (`/Users/taihualin/Documents/Claude/Scheduled/`) AI เข้าไม่ถึงโดยตรง ต้องแก้ผ่านเครื่องมือจัดการ scheduled task ต่างหาก (งานตอนนี้ปิดอยู่ ไม่ได้รันอัตโนมัติ ไม่เร่งด่วน)

ผลตรวจ: `node scripts/check-site.js` ผ่านทั้งหมด + รัน `node data/tools/regression-check-tone.js` ด้วยมือ 1 ครั้งยืนยันเขียนไฟล์ไปที่ `data/reports/tone-regression-report.json` ถูกจุดจริง

## 2026-08-08 — P4-01: เริ่มจัดโฟลเดอร์ (เปลี่ยนชื่อ js/content → js/acquisition + เก็บไฟล์สารบัญซ้ำเข้ากรุ)

สถานะ: **✅ เสร็จ 2 จุดที่ Lin อนุมัติแล้ว — เหลืออีกหลายจุดรอ Lin ตัดสินใจ (ดู `27_แผน_P4-P5_จัดโฟลเดอร์.md`)**

ทำ 2 อย่างตามที่ Lin อนุมัติ: (1) เปลี่ยนชื่อโฟลเดอร์ `js/content/` → `js/acquisition/` ให้ตรงชื่อเป้าหมายในแผนหลัก P4 (โค้ดเดิมไม่เปลี่ยน แค่ย้ายที่ + แก้ `src=` ใน 6 หน้า: `blog.html`, `faq.html`, `index.html`, `pricing.html`, `resources.html`, `tone-finder.html` + คอมเมนต์ในตัวไฟล์ + `README.md`) (2) ย้ายไฟล์สารบัญที่ซ้ำกัน `00_ฟังก์ชันไหนอยู่ไฟล์ไหน.md` ฉบับ root (เก่ากว่า ข้อมูลไม่ตรงของจริง) เข้า `_archive/` (กันไว้ ไม่ push ขึ้น GitHub) เหลือฉบับจริงที่ `supabase/sql/00_ฟังก์ชันไหนอยู่ไฟล์ไหน.md` ที่เดียว

ผลตรวจ: `node scripts/check-site.js` ผ่านทั้งหมด (816 ไฟล์ ไม่มี error/failure) รันหลังย้ายไฟล์เสร็จ

## 2026-08-07 — เพิ่มปุ่ม 補登上課 (บันทึกเข้าเรียนย้อนหลัง)

สถานะ: **✅ เสร็จแล้ว — Lin push แล้วและยืนยันใช้งานได้จริงบนเว็บ**

ปัญหาที่แก้: ปุ่ม "✅ 今日上課" ผูกกับวันนี้ตายตัว ถ้าครูลืมกดวันนั้นไม่มีทางย้อนกลับไปบันทึกได้เลย

วิธีแก้: เพิ่มปุ่ม "➕ 補登上課" ในกล่อง "📅 上課記錄" ของนักเรียนแต่ละคน (อยู่บนสุดของกล่องที่กางออกมา) กดแล้วเลือกวันที่ย้อนหลังได้เอง (ค่าเริ่มต้น = เมื่อวาน, กันไม่ให้เลือกวันอนาคต) ใช้ RPC เดิม `record_attendance_increment` ไม่ต้องแก้ฐานข้อมูล/ไม่ต้องรัน SQL — ถ้าวันนั้นมีบันทึกอยู่แล้วจะเด้งเตือนก่อนว่าจะเพิ่มเป็นกี่ชั่วโมง กันกดพลาดซ้ำ

ไฟล์ที่แก้: `js/classroom/attendance-auth.js` (เพิ่มฟังก์ชัน `toggleBackfillPicker` + `submitBackfillAttendance`, ไม่แตะฟังก์ชันเดิม) — ไม่อยู่ในกลุ่ม 5 ไฟล์ที่ต้องรัน `build-minjs.sh`

ผลตรวจ: `node --check` ผ่าน (syntax ไม่พัง) · Lin ทดสอบใช้งานจริงบนเว็บแล้วยืนยันว่าใช้ได้

## 2026-08-07 — P3-A: regenerate .min.js ที่ล้าหลัง 5 คู่ไฟล์

สถานะ: **✅ เสร็จแล้ว**

ปัญหาที่แก้: `.min.js` ของเกม 5 ไฟล์ล้าหลังต้นฉบับ `.js` 1-8 วัน (เจอจากรายงาน P3 `24f_ผลลัพธ์_P3_min-js-sync.md`) ผู้เล่นทุกคนโหลดแต่ `.min.js` เท่านั้น แปลว่าเห็นโค้ดเก่ากว่าที่แก้ไว้จริง

วิธีแก้: ติดตั้ง `terser` ผ่าน `npx --yes terser` (ไม่แก้ `package.json` — repo นี้ไม่เคยมี `package.json`/`node_modules` มาก่อน การเพิ่มเข้าไปจะเปลี่ยนโครงสร้าง repo เกินขอบเขตงานนี้ และ `npx` ใช้ได้ตรงๆ โดยไม่ต้องติดตั้งถาวร) รัน `terser <ไฟล์>.js --compress --mangle -o <ไฟล์>.min.js` ทับของเดิมทั้ง 5 คู่

**สิ่งที่น่าสนใจที่พบระหว่างตรวจ:** ไฟล์ `js/core/shared.min.js` และ `js/games/tone-finder-game.min.js` ที่ regenerate ใหม่ **ตรงกับของเดิมทุกไบต์ (md5 เหมือนกัน)** ทั้งที่ต้นฉบับ `.js` ถูกแก้หลังสุด (mtime ใหม่กว่า) — ตรวจซ้ำด้วยการรัน terser แยกต่างหากยืนยันผลเดิม แปลว่าการแก้ต้นฉบับช่วงนั้นเป็นแค่ comment/formatting ที่ไม่กระทบ logic จริง (terser ตัดคอมเมนต์ออกอยู่แล้ว) ไม่ใช่บั๊กของกระบวนการ — อีก 3 ไฟล์ (reading-game-app, typing-game-app, word-order-app) ได้ไฟล์ใหม่ที่ต่างจากเดิมจริง ขนาดใกล้เคียงเดิม (ต่าง <1%)

ผลตรวจ:
- `node --check` ผ่านทุกไฟล์ (syntax ไม่พัง)
- ขนาดไฟล์ใหม่เทียบเดิมสมเหตุสมผล ไม่มีไฟล์ไหนต่างเกิน 2-3 เท่า
- `node scripts/check-site.js` ผ่านทั้งหมด (817 ไฟล์)
- `node scripts/check-minified-sync.js` ยืนยัน `.min.js` ใหม่กว่า `.js` แล้วทุกคู่ (MISMATCH ยังขึ้นตามปกติ เพราะวิธีเทียบแบบ exact-match ใช้ยืนยัน "เหมือนกันจริง" ไม่ได้อยู่แล้ว — ดูคอมเมนต์ในสคริปต์)

งานที่ทำ:
- Regenerate `js/core/shared.min.js`, `js/games/reading-game-app.min.js`, `js/games/typing-game-app.min.js`, `js/games/word-order-app.min.js`, `js/games/tone-finder-game.min.js`
- เพิ่ม `scripts/build-minjs.sh` — รัน terser กับทั้ง 5 คู่ไฟล์ในคำสั่งเดียว (`bash scripts/build-minjs.sh`) ใช้ซ้ำได้ทุกครั้งที่แก้ต้นฉบับ

**⚠️ กฎใหม่ — แก้ไฟล์ `.js` ต้นฉบับ 5 ไฟล์นี้แล้ว ต้องรัน `bash scripts/build-minjs.sh` ก่อน push ทุกครั้ง:**
`js/core/shared.js`, `js/games/reading-game-app.js`, `js/games/typing-game-app.js`, `js/games/word-order-app.js`, `js/games/tone-finder-game.js`
(เว็บทุกหน้าโหลดแต่ `.min.js` เท่านั้น ไม่มีหน้าไหนโหลด `.js` ตัวเต็มเลย — ไม่รันตามนี้ = ผู้เล่นเห็นโค้ดเก่า)

รายงานเต็ม: `Bussiness Idea/ระบบเว็บไซต์/25a_ผลลัพธ์_regenerate-minjs.md`

## 2026-08-07 — P3 รวมผล: ตัวทดสอบคุ้มกันพฤติกรรมเดิม (6 แชทคู่ขนาน)

สถานะ: **ทำแล้วบางส่วน** (P3-01/02/03/05/06/08 มีของแล้ว · P3-04 integration tests ของจริงยังไม่มี ต้องมือ · P3-07 ย้ายแค่ 1 ไฟล์ ยังไม่ปรับโครงสร้างเต็ม)

รายละเอียดเต็ม: `Bussiness Idea/ระบบเว็บไซต์/24_แผน_P3_behavioral_guards_สรุปรวม.md`

งานที่ทำ:

- เพิ่มสคริปต์ทดสอบใหม่ 4 ตัว รวมเข้า `scripts/check-site.js` แล้ว (รันอัตโนมัติทุกครั้งที่รัน `node scripts/check-site.js`): `scripts/tests-marketing-behavioral.js`, `scripts/tests-game-behavioral.js`, `scripts/check-mobile-accessibility.js` (warning-only), `data/reports/game-behavioral-checklist-manual.md` (checklist มือคู่กัน — ย้ายจาก `data/` เข้า `data/reports/` แล้ว 2026-08-08)
- `scripts/check-minified-sync.js` สร้างแล้วแต่**ตั้งใจไม่รวม**เข้า `check-site.js` เพราะวิธี exact-match จะ MISMATCH เสมอกับไฟล์ที่ผ่าน minifier จริง (ไม่ใช่ด่านที่บล็อก push ได้ — รันแยกด้วยมือ)
- สร้าง `supabase/tests/` ตามข้อเสนอ P2-06 · ย้ายเฉพาะไฟล์ที่ยังใช้งานจริง `2026-08-02_reschedule_lock_guard_TEST.sql` เข้ามา (อัปเดต path ใน `CLAUDE.md` และ `supabase/sql/00_ฟังก์ชันไหนอยู่ไฟล์ไหน.md` แล้ว) — ไฟล์ `_TEST.sql` อีก 2 ไฟล์ที่อยู่ใน `archive/` (เลิกใช้แล้ว) ไม่ย้าย เพราะเป็นของเก่าที่ถูกแทนที่แล้ว ไม่ใช่ตัวทดสอบที่ยังใช้งาน
- สร้าง `_dev/2026-08-07_behavioral-guard-cancel-addclass.html` และ `_dev/ตัวทดสอบระบบเลื่อนคาบ_P3_2026-08-07.html` (เปิดเบราว์เซอร์รันเอง — ไม่ผูกกับ `check-site.js`)

⚠️ พบเรื่องสำคัญที่ไม่ใช่ของ P3 โดยตรง แต่ต้องแจ้ง Lin:

1. **`.min.js` ล้าหลัง `.js` ต้นฉบับทั้ง 5 คู่ไฟล์เกม** (ห่างกัน 1–8 วัน) — เว็บทุกหน้าโหลดแต่ `.min.js` เท่านั้น แปลว่าผู้เล่นเห็นโค้ดเก่ากว่าที่แก้ไว้ล่าสุดจริง ต้อง regenerate `.min.js` ทั้ง 5 ไฟล์ก่อน push รอบถัดไป (ไม่ได้แก้ในรอบนี้ นอกขอบเขต P3)
2. `node scripts/check-site.js` ยัง**ไม่ผ่าน 100%** — ติด secret scan 2 จุดที่ `_dev/2026-08-07_ขอ_google_drive_refresh_token.js:19,22` ตรวจแล้วเป็น **false positive** (เป็นข้อความบอกให้ Lin ใส่ค่าเอง `"ใส่ค่าที่ได้จาก Google Cloud"` ไม่ใช่ค่าลับจริง) — ไฟล์นี้อยู่ใน `_dev/` ที่ `.gitignore` กันไว้แล้ว ไม่หลุดขึ้น GitHub แต่ตัวสแกนยังฟ้องผิดอยู่ ควรให้ Lin ตัดสินใจว่าจะปรับ regex ตัวสแกนหรือปล่อยไว้ (ไม่ได้แก้ในรอบนี้ เพราะแก้ตัวสแกนความปลอดภัยนอกขอบเขตงาน P3)

## 2026-08-07 — P1-06 ย้ายค่าลับออกจากคำสั่ง cron ไปเก็บใน Supabase Vault

สถานะ: **✅ เสร็จครบแล้ว — cron ทุกงานย้ายเข้า Vault และพิสูจน์ด้วย HTTP 2xx จริงแล้ว**

ปัญหาที่แก้: `pg_cron` เก็บคำสั่งเป็นข้อความในตาราง `cron.job` ใครเปิด Dashboard → Database → Cron เห็น token ที่ฝังใน header ทั้งก้อน — ยืนยันจากของจริงแล้วว่า job 5 (`class-reminder-every-5-min`) และ job 9 (`low-quota-daily`) ฝัง **service_role JWT** เต็มๆ อ่านได้จากหน้าจอ

วิธีแก้: เก็บ token ใน **Supabase Vault** (เข้ารหัสด้วย pgsodium) แล้วให้ cron เรียกฟังก์ชัน `private.call_*_cron()` แทน → คำสั่งใน `cron.job` เหลือแค่ `select private.call_xxx();`

ผลตรวจจากระบบจริง (2026-08-07 · อ่านอย่างเดียวก่อนแก้):

- job 5, 9 = `service_role` (อ่านจาก JWT payload — **ขัดกับไฟล์ `2026-07-18_pg_cron_low_quota_daily.sql` ที่เขียนว่า `anon`** ไฟล์ในเครื่องเป็นข้อมูลเก่า/ผิด)
- job 8 `request-sla-reminder` = **placeholder ไม่ใช่ JWT จริง** → ตัวเตือนครู 48 ชม. **ไม่เคยทำงานเลยสักครั้ง** ตั้งแต่ตั้ง cron มา (บั๊กที่กระทบงานสอนจริง ไม่ใช่แค่เรื่องความปลอดภัย)
- job 12 `low-quota-cron-daily` = header มีแค่ `Content-Type` ไม่มี Authorization เลย + ปลายทางเปิด Verify JWT → **ไม่เคยเรียกสำเร็จ** เป็นงานซ้ำที่ตายแล้ว (ตัวจริงคือ job 9) ควร `unschedule` ทิ้ง
- job 10 สลับเป็น Vault แล้ว ทดสอบด้วยการเร่ง schedule เป็นทุกนาทีชั่วคราว → `cron.job_run_details` ยืนยัน `succeeded` ที่ 02:55 และคืน schedule เดิมแล้ว

งานที่ทำ:

- เพิ่ม `supabase/sql/2026-08-07_p1-06_cron_vault.sql` เป็นต้นฉบับเดียวของงานนี้ (schema `private`, ตาราง `private.cron_http_log`, ฟังก์ชัน `private.call_*_cron()` 5 ตัว, คำสั่งสลับ cron ทีละงาน, คำสั่งตรวจ, คำสั่ง rollback) — **ไม่มีค่าลับในไฟล์** ค่าเข้า Vault ด้วยคำสั่งที่ดึงจาก `cron.job` โดยตรง
- เพิ่มตาราง `private.cron_http_log` เก็บ `request_id` ที่ `net.http_post` คืนมา → join กับ `net._http_response` ได้ตรงๆ **แก้ปัญหาที่เดิมต้องเดาว่าแถว HTTP ไหนมาจาก cron ตัวไหน** (`net._http_response` ไม่มีคอลัมน์บอกที่มา)
- เปิด RLS ให้ `private.cron_http_log` โดยไม่มี policy (fail-closed) + trigger ลบ log เก่ากว่า 30 วันอัตโนมัติ
- ฟังก์ชันทุกตัวใช้ `security definer` + `set search_path = ''` และ **หยุดทำงานพร้อม error ถ้าหาค่าใน Vault ไม่เจอ** (ไม่ยิง request ด้วย header ว่าง)
- เพิ่มกฎถาวรใน `CLAUDE.md`: SQL ทุกคำสั่งที่เปลี่ยนระบบต้องมีไฟล์ต้นฉบับใน `supabase/sql/` ห้ามพิมพ์ใน Dashboard ตรงๆ
- อัปเดตสารบัญ `supabase/sql/00_ฟังก์ชันไหนอยู่ไฟล์ไหน.md` ในคอมมิตเดียวกันตามกฎเดิม

ผลตรวจ:

- `node scripts/check-site.js` ผ่านทั้งหมด — ตรวจค่าลับ 846 ไฟล์ (เพิ่มจาก 845 คือไฟล์ SQL ใหม่), JavaScript 71 ไฟล์, HTML 108 ไฟล์, CSS 7 ไฟล์, ไฟล์โปรเจกต์ 794 ไฟล์
- ตัวกันค่าลับ P1-08 สแกนไฟล์ SQL ใหม่แล้วไม่พบค่าลับ

ผลสุดท้าย — cron ทุกงานพิสูจน์ด้วย HTTP จริงแล้ว (ไม่ใช่แค่ `succeeded` ของ pg_cron):

| job | ชื่อ | หลักฐาน |
|---|---|---|
| 5 | `class-reminder-every-5-min` | 200 (req 12917, 12920 — รอบอัตโนมัติ) |
| 8 | `request-sla-reminder` | 200 (req 12916 — รอบอัตโนมัติ) |
| 9 | `low-quota-daily` | 200 (req 12923 — เรียกด้วยมือ) |
| 10 | `welcome-retry-cron-hourly` | 200 (req 12889 + รอบอัตโนมัติ 02:55) |
| 13 | `star-fraud-daily` | ไม่เกี่ยว — SQL ล้วน ไม่เรียก Edge Function |
| 14 | `calendar-schedule-sync-cron` | 200 (req 12922) |

🗑️ **ลบ job 12 `low-quota-cron-daily` ทิ้งแล้ว** — พิสูจน์ตรงก่อนลบด้วยการยิงคำสั่งเดียวกับมันเป๊ะๆ (ไม่มี auth header) ได้ req 12926 → 401 = ไม่เคยทำงานจริงตั้งแต่ตั้งมา เป็นงานซ้ำของ job 9

บั๊ก 2 จุดที่เจอระหว่างทำ (ทั้งคู่เกิดจากเดาแทนที่จะเปิดของจริงดูก่อน — บันทึกไว้กันซ้ำ):

1. **ฟังก์ชัน `call_calendar_sync_cron` ส่ง header ไม่ครบ → 401 ทุกรอบ ทุก 5 นาที** — ต้นฉบับ `2026-07-17_pg_cron_calendar_schedule_sync.sql:21-25` ส่ง anon key ทั้งใน `apikey` **และ** `Authorization` แต่ตอนเขียนดูจากหน้าจอที่ค่าถูกปิดบังไว้ เห็นแค่ `apikey` เลยเขียนตกไปหนึ่งตัว · แก้แล้ว
2. **ค่าใน Vault ถูกเขียนทับด้วย placeholder** — สั่ง `vault.update_secret` ทั้งที่ค่าเดิมถูกอยู่แล้ว (regex ดึงมาถูกตั้งแต่แรก) แล้ววาง `__ANON_KEY__` ลงไปจริง (`length = 12`) · แก้โดยก็อปค่าจาก `cron_welcome_retry_key` ที่เป็น anon key ตัวเดียวกันและพิสูจน์แล้วว่าใช้ได้

ข้อจำกัดที่ยังเหลือ:

- job 9 ยืนยันด้วยการเรียกด้วยมือ ยังไม่เห็นรอบอัตโนมัติ (รันวันละครั้งตี 2)
- `calendar-schedule-sync-cron` และ `welcome-retry-cron` ยังปิด Verify JWT และไม่มีด่านตรวจผู้เรียกในฟังก์ชันเอง — **การย้ายเข้า Vault ไม่ได้ปิดช่องนี้** เป็นงานแยกที่ต้องขออนุมัติต่างหาก
- ยังไม่ได้ rotate ค่าใดทั้งสิ้น (`P1-07`) ค่าเดิมทั้งหมดยังใช้งานได้ตามปกติ

## 2026-08-07 — อุดช่องว่าง fail-open ของตัวกันค่าลับ P1-08 (แชท A ในชุดงานคู่ขนาน)

สถานะ: **แก้และทดสอบในเครื่องแล้ว รอแชทผู้สั่งการตรวจซ้ำก่อนปิดงาน P1-08 — ยังไม่ประกาศว่า P1-08 เสร็จ**

ตรวจโค้ดจริงพบ 3 จุดที่ตัวกันค่าลับ (ติดตั้ง 2026-08-06) ยัง "fail-open" คือปล่อยผ่านแทนที่จะเตือน:

1. `scripts/secret-scanner.js` เดิมข้าม (ไม่สแกนเลย) ทั้งโฟลเดอร์ `_dev`, `_แผนงาน`, `_บทความ-เตรียมเขียน`, `_archive`, `_to_delete` — ยืนยันแล้วว่า `_dev`/`_แผนงาน` มีไฟล์เอกสารจริงของ Lin อยู่ (เช่น `_แผนงาน/ทำต่อในอนาคต.md`) ถ้ามีค่าลับหลุดไปแปะในไฟล์พวกนี้ระหว่างทำงาน จะไม่มีวันถูกตรวจพบ — พึ่ง `.gitignore` อย่างเดียวไม่พอ เพราะกันได้แค่ `git add` ไม่ได้กันไม่ให้ค่าลับนอนอยู่ในไฟล์เงียบๆ
   **แก้:** แยกเป็น 2 ชุดโฟลเดอร์ที่ข้าม — `SITE_VALIDATION_SKIP_DIRECTORY_NAMES` (ใช้กับตรวจ syntax/ลิงก์เว็บใน `check-site.js` เท่านั้น ยังข้าม 5 โฟลเดอร์นี้เหมือนเดิม เพราะไม่ใช่ไฟล์เว็บที่ deploy จริง) กับ `SECRET_SCAN_SKIP_DIRECTORY_NAMES` (ใช้กับตัวกันค่าลับ ข้ามแค่ `.git`/`node_modules`) — ตอนนี้ตัวกันค่าลับสแกนทุกไฟล์เอกสารจริงใน 5 โฟลเดอร์นั้นด้วยแล้ว (845 ไฟล์ จากเดิม 810)
2. ไฟล์ข้อความ >2MB ถูกข้าม (ไม่อ่านเนื้อหาเลย) แล้วโชว์แค่ "คำเตือน" — `check-site.js` เอาไปใส่ `warnings` ไม่ใช่ `failures` ทำให้ `exit 0` ได้ทั้งที่มีไฟล์ที่ไม่เคยถูกสแกนหาค่าลับจริง
   **แก้:** เปลี่ยนเป็น fail-closed ทั้ง `check-site.js` (ย้ายไป `failures`) และ CLI ตรง `node scripts/secret-scanner.js` (ย้ายจาก `console.warn` เป็น `console.error` + `process.exitCode = 1`) — ไฟล์ >2MB ที่ไม่เคยถูกสแกน = นับเป็น "ไม่ผ่าน" เสมอ ไม่ใช่แค่เตือน (ตอนนี้ในเครื่องยังไม่มีไฟล์ข้อความไหนเกิน 2MB จริง จึงยังไม่กระทบผลตรวจปัจจุบัน)
3. `scripts/tests-secret-scanner.js` เดิมมีแค่ 2 เทสต์ ไม่มีเทสต์คุ้มกัน 2 ช่องว่างข้างบนเลย
   **แก้:** เพิ่ม 2 เทสต์ใหม่ (ใช้ fixture ในโฟลเดอร์ temp เหมือนเทสต์เดิม ไม่มีค่าลับจริง) — เทสต์ที่ 3 ยืนยันว่าค่าลับปลอมในไฟล์ใต้ `_dev`/`_แผนงาน`/`_บทความ-เตรียมเขียน` ถูกตรวจพบ, เทสต์ที่ 4 สร้างไฟล์ปลอม >2MB ที่มีค่าลับปลอม ยืนยันว่าถูกข้ามจริง (ไม่ถูกอ่าน) และ CLI ต้อง exit ไม่เป็น 0 เพราะ fail-closed

ไฟล์ที่แก้: `scripts/secret-scanner.js`, `scripts/check-site.js`, `scripts/tests-secret-scanner.js` — ไม่แก้ `.gitignore` (ตรวจแล้วไม่มีช่องว่างเพิ่มเติมนอกจาก 2 ข้อบนที่แก้ในตัวสแกน)

ผลตรวจ:

- `node scripts/tests-secret-scanner.js` ผ่าน (รวม 2 เทสต์ใหม่ ใช้เวลา ~0.15 วินาที ไม่ค้าง)
- `node scripts/check-site.js` ผ่านทั้งหมด — ตรวจค่าลับ 845 ไฟล์ (เพิ่มจาก 810 เพราะสแกน `_dev`/`_แผนงาน`/`_บทความ-เตรียมเขียน`/`_archive`/`_to_delete` แล้ว), JavaScript 71 ไฟล์, HTML 108 ไฟล์, CSS 7 ไฟล์, ไฟล์โปรเจกต์สำหรับตรวจ syntax/ลิงก์เว็บยังเป็น 793 ไฟล์เท่าเดิม (ไม่กระทบ เพราะแยกชุด skip แล้ว)
- ไม่พบค่าลับจริงในรอบสแกนที่ขยายไปถึง `_dev`/`_แผนงาน`/`_บทความ-เตรียมเขียน`

สิ่งที่ยังยืนยันไม่ได้: ยังไม่มีการสแกนไฟล์ข้อความจริงที่ขนาด >2MB (ยังไม่มีไฟล์แบบนั้นในเครื่อง) ว่า fail-closed จะไม่รบกวนงานจริงในอนาคตแค่ไหน — ถ้าเกิดขึ้นจริงต้องตัดสินใจว่าจะเพิ่มเพดานหรือหาวิธีสแกนไฟล์ใหญ่แบบปลอดภัย

## 2026-08-06 — ติดตั้งตัวกันค่าลับ P1-08

สถานะ: **ติดตั้งและทดสอบในเครื่องแล้ว รอ Lin ตรวจและ push**

งานที่ทำ:

- เพิ่มกฎ `.gitignore` กัน `.env`, private key, service-account/credential JSON และไฟล์ credential มาตรฐาน พร้อมยกเว้น `.env.example` กับ `.env.template`
- เพิ่ม `scripts/secret-scanner.js` ตรวจชื่อไฟล์และรูปแบบค่าลับใน source, config, SQL, เอกสาร และ log โดยรายงานเฉพาะชนิด ไฟล์ และบรรทัด
- แยกกุญแจฝั่ง browser ที่เปิดเผยตามหน้าที่ด้วย allowlist แบบชนิด + บริบท + path ไม่เก็บค่าจริงหรือ digest
- เพิ่ม `scripts/tests-secret-scanner.js` ใช้ค่าปลอม ทดสอบการตรวจพบ การปิดบังค่า ชื่อไฟล์ต้องห้าม path ที่มีช่องว่าง และค่าฝั่ง browser ที่อนุญาต
- เปลี่ยน `scripts/check-site.js` ให้รวบรวมไฟล์จากระบบไฟล์โดยตรง ไม่เรียก Git และรวม secret scan + tests ไว้ในคำสั่งกลาง
- ไม่แก้หน้าเว็บ พฤติกรรมเว็บไซต์ ระบบภายนอก หรือ deploy

ผลตรวจ:

- `node scripts/tests-secret-scanner.js` ผ่าน
- `node scripts/secret-scanner.js` ผ่าน 810 ไฟล์ โดยไม่แสดงค่าที่ตรวจ
- `node scripts/check-site.js` ผ่าน: JavaScript 71 ไฟล์, HTML 108 ไฟล์, CSS 7 ไฟล์ และไฟล์โปรเจกต์ 793 ไฟล์
- ตรวจคำสั่งกลางและคำสั่งย่อยแล้วไม่พบการเรียก Git ก่อนรัน

ข้อจำกัด:

- ตัวตรวจจับค่าที่มีรูปแบบ ชื่อ หรือโครงสร้างสำคัญได้ แต่ไม่สามารถรับประกันการจับสตริงสุ่มที่ไม่มีบริบททุกชนิด
- ไฟล์ข้อความเกิน 2 MB จะถูกข้ามพร้อมคำเตือน และ binary ไม่ถูกอ่านเนื้อหา
- การผ่านตัวตรวจไม่ยืนยัน RLS, referrer restriction, อายุของ key หรือค่าบนระบบ production

## 2026-08-06 — รวมสเปกสมาชิกเกมเข้ากับแผนกลาง

สถานะ: **เอกสารและกฎส่งต่องานอัปเดตแล้ว รอ Lin push**

งานที่ทำ:

- อ่านไฟล์สมาชิกเกม 5 ไฟล์และแยกทิศทางผลิตภัณฑ์ออกจากสถานะที่ต้องตรวจโค้ดจริง
- สร้าง `04_สเปกสมาชิกเกม_CURRENT.md` เป็นแหล่งกลางของสิทธิ์ guest, free และ paid
- ปรับ P6 ให้เริ่มจาก audit แบบอ่านอย่างเดียว ก่อนทำ entitlement และ payment
- เพิ่มกฎให้ Codex อ่านสเปกกลางเมื่อทำงานสมาชิกเกม
- ไม่แก้โค้ดเกม ฐานข้อมูล ระบบภายนอก หรือ deploy

ผลตรวจ:

- `node scripts/check-site.js` ผ่านทั้งหมด 791 ไฟล์

## 2026-08-06 — เพิ่มแผนงานกลางและกฎส่งต่องานข้ามแชท

สถานะ: **เตรียมเอกสารและกฎเสร็จแล้ว รอ Lin push**

งานที่ทำ:

- เพิ่ม `AGENTS.md` ให้ Codex อ่านกฎ ศูนย์บัญชาการ และแผนงานหลักก่อนเริ่ม
- กำหนดให้ Codex และ Claude อัปเดตสถานะ หลักฐาน และงานถัดไปก่อนจบแชทที่มีงานจริง
- สร้างแผนงานหลัก P0–P7 จากจัดระบบเดิมไปถึง beta และเปิดขายเกม
- เชื่อมศูนย์บัญชาการให้ชี้มาที่แผนหลักฉบับเดียว

ผลตรวจ:

- `node scripts/check-site.js` ผ่านทั้งหมด 791 ไฟล์
- ไม่ได้ย้ายโค้ด ไม่ได้เปลี่ยนระบบภายนอก และไม่ได้ deploy

## 2026-08-06 — จัดระบบโค้ดและโครงสร้างทั้งเว็บ

สถานะ: **ทำเสร็จและ push แล้วโดย Lin**

งานที่ทำ:

- จัดหมวดและเพิ่มแผนที่ไฟล์ให้ JavaScript ส่วน core, classroom, content, games, score และ textbook
- เริ่มจัดจาก `js/core/shared.js` แล้วตรวจต่อทั้งชุด
- ลบโค้ดตายของระบบเชื่อมบัญชีเกมและรายการไฟล์นักเรียนแบบเก่าที่ไม่มีจุดเรียก
- ลบ placeholder ว่าง ไฟล์ทดสอบขยะ ไฟล์สำรอง `.min.js.bak` และ metadata ชั่วคราวของ Supabase
- เพิ่มกฎ `.gitignore` ป้องกันไฟล์ชั่วคราวกลับเข้า Git
- เพิ่ม `README.md` อธิบายโครงสร้างและกติกาความปลอดภัยของโปรเจกต์
- เพิ่ม `scripts/check-site.js` สำหรับตรวจเว็บแบบรวมด้วยคำสั่งเดียว

ผลตรวจหลังทำ:

- JavaScript syntax ผ่าน 69 ไฟล์
- HTML และ inline JavaScript ผ่าน 108 หน้า
- CSS และลิงก์ไฟล์ภายในผ่าน 7 ไฟล์
- ชุดทดสอบ tone engine ผ่าน 24/24
- ชุดทดสอบ data health ผ่าน 11/11
- คลังข้อมูล 735 คำและ 30 ประโยคผ่าน
- ไม่พบคำซ้ำในคลัง 735 คำ
- เปิดผ่าน local server ครบ 108 หน้า ได้ HTTP 200 ทุกหน้า
- ทดสอบหน้าแรก เกมหลัก ห้องเรียน และหน้าความคืบหน้าในเบราว์เซอร์ ไม่พบ JavaScript error

ข้อจำกัดที่ตั้งใจรักษาไว้:

- ไม่ย้ายหน้า HTML เพื่อป้องกัน URL สาธารณะเสีย
- ไม่ลบ public/compatibility API ที่ยังอาจมีผู้เรียกภายนอก
- ไม่แก้ข้อมูลจริง ไม่ส่งรหัสล็อกอิน และไม่ deploy ระหว่างการจัดระบบ

คำสั่งตรวจรอบต่อไป:

```bash
node scripts/check-site.js
```
