// ════════════════════════════════════════════════════════════════════════════
// Supabase Edge Function: account-unlink
// ────────────────────────────────────────────────────────────────────────────
// สถานะไฟล์นี้: "ร่างเท่านั้น" (DRAFT — ยังไม่ deploy, ยังไม่ผูกกับ UI ใดๆ)
// ห้าม deploy เองก่อน Lin ตรวจ + อนุมัติ (ตามกฎเว็บ CLAUDE.md ข้อ "เว็บต้องผ่าน Lin ก่อนเสมอ")
// สร้างตาม design ที่ Lin เคยตอบไว้ใน docs/ACCOUNT_DATA_SAFETY_GAPS.md หัวข้อ "Unlink provider"
// (ข้อ 10 ใน checklist กลาง) — เพิ่งได้รับอนุมัติให้เริ่มสร้างจริง 2026-08-08
//
// หน้าที่: ให้ผู้เล่นที่ล็อกอินอยู่ "ถอด" ช่องทางล็อกอินหนึ่งช่องทางออกจากบัญชีตัวเอง
//   (Google / Facebook / Email OTP / LINE) — ทีละช่องทางต่อ 1 คำขอ
//
// 🔒 กฎเหล็กข้อเดียวที่ Lin ย้ำ (ห้ามผ่อนปรนเด็ดขาด — เป็นเหตุผลที่ต้องมีฟังก์ชันนี้แยกจาก client
//   เรียก supabase.auth.unlinkIdentity() ตรงๆ):
//   "ห้ามถอดช่องทางล็อกอินถ้าถอดแล้วผู้ใช้จะไม่เหลือช่องทางล็อกอินที่ใช้งานได้จริงเลยแม้แต่ช่องทางเดียว"
//
// ── ทำไม Supabase native unlinkIdentity() เชื่อใจอย่างเดียวไม่พอ ──────────────────────
//   Supabase มีด่านในตัวอยู่แล้ว: "ต้องมี identity อย่างน้อย 2 ชิ้นถึงจะ unlink ได้" (ยืนยันจาก
//   Supabase JS docs — https://supabase.com/docs/reference/javascript/auth-unlinkidentity : "The user
//   must have at least 2 identities in order to unlink an identity") แต่ด่านนี้ "ไม่รู้จัก LINE เลย"
//   เพราะ LINE ในเว็บนี้ผูกผ่านตาราง custom public.line_identities (ดู
//   supabase/sql/2026-07-26_line_identities.sql) ไม่ใช่ native identity ของ Supabase Auth
//   → ถ้าปล่อยให้ client เรียก unlinkIdentity() ตรงๆ ผู้ใช้ที่มี [Email(synthetic) + LINE] จะเจอว่า
//   Supabase มองเห็นแค่ 1 native identity (email) เท่านั้น จึง "ปฏิเสธ" การ unlink ไปเองอยู่แล้วในเคสนี้
//   (ปลอดภัยเผอิญ) — แต่เคสที่อันตรายจริงคือผู้ใช้ที่มี [Email(synthetic) + Google + LINE]: Supabase
//   เห็น 2 native identities (email+google) เลยยอมให้ unlink google ผ่านได้ ทั้งที่หลัง unlink จะเหลือ
//   แค่ email synthetic (ที่ผู้ใช้ไม่รู้จัก ไม่มีรหัสผ่าน ล็อกอินเองไม่ได้) — ต้องมีฟังก์ชันนี้มานับใหม่เอง
//   ให้ถูกต้องก่อนอนุญาต
//
// ── สถาปัตยกรรม "ช่องทางล็อกอิน" ในเว็บนี้ (ยืนยันจากโค้ดจริง ไม่ใช่เดา) ──────────────────
//   1. Google OAuth   → native Supabase identity (provider='google')   ผูกผ่าน sb.auth.linkIdentity()
//   2. Facebook OAuth → native Supabase identity (provider='facebook') ผูกผ่าน sb.auth.linkIdentity()
//      (ดู js/core/auth-widget.js บรรทัด ~239-287)
//   3. Email OTP      → native Supabase identity (provider='email')   ล็อกอินปกติผ่านอีเมลจริงของผู้ใช้
//   4. LINE Login     → **ไม่ใช่ native identity** — เก็บใน public.line_identities (line_user_id ↔ user_id)
//      จัดการโดย supabase/functions/line-login/index.ts (สร้าง/หา user) และ link-line/index.ts (ผูกให้
//      นักเรียนในระบบห้องเรียน — คนละตารางกับที่นี่ ดูหมายเหตุด้านล่าง)
//
// 🔴 จุดที่ต้องระวังที่สุด — "email identity ปลอม" ของผู้ใช้ที่สมัครผ่าน LINE เป็นคนแรก:
//   ตรวจโค้ด supabase/functions/line-login/index.ts บรรทัด 257-267 (ฟังก์ชัน syntheticEmail() บรรทัด
//   78-83) ยืนยันได้ 100% จากการอ่านโค้ดตรงๆ ว่า: ผู้ใช้ LINE คนใหม่ (ไม่เคยมีบัญชี Supabase มาก่อน) จะถูก
//   สร้างด้วย supabase.auth.admin.createUser({ email: 'line-<line_user_id>@users.line.invalid',
//   email_confirm: true, ... }) — พฤติกรรมมาตรฐานของ Supabase/GoTrue คือ "สร้าง user ด้วย email พารามิเตอร์
//   = สร้าง native identity ให้อัตโนมัติด้วย provider='email'" ดังนั้นผู้ใช้กลุ่มนี้ **น่าจะ** มี native
//   identity ตัวหนึ่งที่ provider='email' ชี้ไปที่อีเมลปลอมโดเมน .invalid ที่ผู้ใช้ไม่เคยเห็น/ไม่มีรหัสผ่าน/
//   ล็อกอินเองไม่ได้เลย (ใช้แค่เป็น key ภายในให้ magic link เท่านั้น)
//   ⚠️ **จุดนี้ "ยืนยันจากโค้ดเท่านั้น" — ยังไม่เคยตรวจกับฐานข้อมูลจริง** (ไม่มีสิทธิ์รัน
//   `select * from auth.identities where user_id = '<line-only test user>'` ในเซสชันนี้) เป็นพฤติกรรม
//   มาตรฐานที่ทีม Supabase เอกสารไว้ (admin.createUser พร้อม email → auto-create email identity) แต่
//   **ยังไม่เคยเห็นแถวจริงในตาราง auth.identities ของผู้ใช้ LINE-only สักคนเดียว** — 🚫 **Lin ควรขอให้ใคร
//   สักคนที่เข้าถึง Supabase Dashboard ได้ รัน SQL ด้านบนกับผู้ใช้ทดสอบที่สมัครผ่าน LINE ล้วนๆ (ไม่เคยผูก
//   Google/Facebook/Email เลย) เพื่อยืนยันแถวจริงก่อน deploy ฟังก์ชันนี้จริง** ถ้าพฤติกรรมจริงต่างจากที่
//   คาด (เช่น Supabase เปลี่ยนพฤติกรรมในเวอร์ชันใหม่ ไม่ auto-create identity ให้แล้ว) ตรรกะนับด้านล่าง
//   ยังปลอดภัยอยู่ดี (จะแค่ไม่มี identity ปลอมให้กรองออก ไม่กระทบทิศทางความปลอดภัย) — แต่ควรยืนยันให้ชัวร์
//
//   วิธีตรวจจับ "email identity ปลอมของ LINE" ในไฟล์นี้ (ดูฟังก์ชัน isSyntheticLineEmail() ด้านล่าง):
//     สัญญาณหลัก (เชื่อถือได้เอง อิสระจากตารางอื่น): อีเมลตรงรูปแบบ /^line-.+@users\.line\.invalid$/
//     — โดเมน .invalid เป็นโดเมนที่สงวนไว้ตาม RFC 2606 ข้อ 2 (ห้ามใช้งานจริงทั่วโลก) ไม่มีทางที่ผู้ใช้จะ
//     ยืนยันตัวตนผ่าน Email OTP จริงด้วยอีเมลโดเมนนี้ได้เลย (ระบบส่ง OTP ไปที่อีเมลจริงเท่านั้น) ดังนั้น
//     เจอรูปแบบนี้ = ปลอมแน่นอน ไม่ต้องพึ่งสัญญาณอื่นเลยก็ยังปลอดภัย
//     สัญญาณเสริม (defense-in-depth เฉยๆ ไม่ใช่ตัวตัดสินหลัก): เช็คว่ามีแถวใน line_identities ของผู้ใช้
//     คนนี้จริงไหม — ถ้าสัญญาณหลักตรงแต่หาไม่เจอแถว LINE (ข้อมูลไม่ตรงกันผิดปกติ) จะ console.warn ดังๆ
//     แต่ "ยังคงถือว่าปลอม" อยู่ดี (ทิศทางปลอดภัยกว่า — เผลอนับอีเมลปลอมเป็นของจริงอันตรายกว่าเผลอนับของจริง
//     เป็นของปลอม เพราะทิศแรกเสี่ยงทำให้ผู้ใช้ล็อกอินไม่ได้เลยทั้งที่ระบบคิดว่ายังมีทางเข้าอยู่)
//
// ── ตาราง line_identities: เข้าถึงได้เฉพาะ service_role เท่านั้น (ยืนยันจาก
//   supabase/sql/2026-07-26_line_identities.sql บรรทัด 24-28 — เปิด RLS แต่ "ตั้งใจไม่ใส่ policy เลย"
//   fail-closed สนิท เหมือน account_audit_log) — ฟังก์ชันนี้จึงต้องใช้ client แบบ service_role อ่าน/เขียน
//   ตารางนี้เสมอ พร้อมแปะ .eq('user_id', callerUid) เองด้วยมือทุกครั้ง (callerUid มาจาก auth.getUser()
//   ที่ยืนยันแล้วเท่านั้น ไม่ใช่จาก body ที่ client ส่งมา — แพทเทิร์นเดียวกับ account-export/account-delete)
//
// ⚠️ unlink-line-student (supabase/functions/unlink-line-student/index.ts) เป็นคนละระบบโดยสิ้นเชิง —
//   ฟังก์ชันนั้นแก้ classroom_students.line_user_id (LINE ของ "นักเรียนในห้องเรียนของครู Lin" ผูกกับ
//   ระบบจัดการห้องเรียน) ไม่เกี่ยวกับ public.line_identities (LINE ที่ผูกกับ "บัญชีผู้เล่นเกม") ที่ไฟล์นี้
//   จัดการเลย — ตรวจโค้ดแล้วยืนยันว่าคนละตาราง คนละจุดประสงค์ ไม่ได้อ้างอิงกันเลย ไม่ได้เอามาก็อปที่นี่
//
// ── วิธี "ถอด" จริงของแต่ละ provider ──────────────────────────────────────────────
//   google / facebook / email (native identity ที่ไม่ใช่อีเมลปลอม):
//     🔴 เจตนาออกแบบที่ต้องบันทึกไว้ชัดๆ: Supabase JS SDK's unlinkIdentity() เป็นเมธอดที่ผูกกับ
//     "session ที่ client ตัวเองถืออยู่จริง" (เรียก this.getSession() ภายใน ไม่ใช่แค่รับ jwt เป็น
//     พารามิเตอร์ตรงๆ แบบ auth.getUser(jwt)) — client ที่สร้างด้วย createClient(url, anonKey,
//     {global:{headers:{Authorization}}}) แบบที่ไฟล์นี้/account-export/account-delete ใช้กันทั้งหมด
//     ไม่เคยเรียก setSession()/signIn ใดๆ จึง "ไม่แน่ใจ 100%" ว่า client.auth.unlinkIdentity() จะเห็น
//     session จริงหรือไม่ (พฤติกรรมนี้ไม่ได้ตรวจกับของจริงได้ในเซสชันนี้ เพราะไม่มีสิทธิ์รัน Deno/browser
//     จริง) — เพื่อความชัวร์ที่สุด (RELIABILITY FIRST) ไฟล์นี้เลย "ไม่พึ่ง SDK method ตัวนี้" แต่เรียก
//     GoTrue REST endpoint ตรงๆ ด้วย fetch() แทน: `DELETE {SUPABASE_URL}/auth/v1/user/identities/{identity_id}`
//     พร้อม header Authorization: Bearer <access token ของผู้ใช้เอง> + apikey: <anon key> — endpoint นี้
//     คือ endpoint เดียวกับที่ SDK ทุกภาษา (JS/Kotlin/Swift/Dart) เรียกใต้ฝากระโปรงเวลาเรียก unlinkIdentity()
//     (ยืนยันจาก Supabase docs หลายภาษาอธิบายพฤติกรรมเดียวกันทุกคำ: "user must have ≥2 identities",
//     "identity must belong to the user" — ตรงกับ handler ฝั่ง GoTrue เซิร์ฟเวอร์ตัวเดียว) แต่ 🚫 **ไม่เคย
//     ยิง request จริงทดสอบ endpoint นี้ในเซสชันนี้ได้เลย (ไม่มีสิทธิ์เข้าถึงเครือข่ายจริง/Supabase project
//     จริงของ Lin) — ก่อน deploy จริง ควรทดสอบเรียกฟังก์ชันนี้กับบัญชีทดสอบที่มี ≥2 ช่องทางจริงก่อนอย่างน้อย
//     1 ครั้ง แล้วดูว่า field `identity_id` ที่ได้จาก user.identities ตรงกับที่ endpoint ต้องการจริงไหม**
//     ชื่อ field ที่ใช้ในตัว URL: ลองอ่านทั้ง `identity.identity_id` และ `identity.id` (บาง SDK/บาง
//     เวอร์ชันของ supabase-js ใช้ชื่อคอลัมน์ต่างกัน) เลือกอันที่มีค่าจริงมาใช้ ถ้าไม่มีทั้งคู่จะ error
//     ชัดเจนทันที ไม่เดา/ไม่ส่ง request ที่รู้อยู่แล้วว่าต้องพัง
//   line:
//     ลบแถวใน public.line_identities ที่ user_id ตรงกับผู้เรียก (ตรวจ schema แล้ว — ตารางนี้ไม่มีคอลัมน์
//     สถานะ/deactivated ใดๆ เลย มีแค่ line_user_id (PK) / user_id / created_at เท่านั้น และไม่มีที่ไหนใน
//     ทั้ง repo ที่คาดหวัง "soft-delete flag" ของตารางนี้ — จุดเดียวที่อ่านตารางนี้คือ line-login/index.ts
//     (หา user ตอนล็อกอิน/ผูกใหม่) และ account-export/index.ts (export ข้อมูลผู้ใช้เอง) ทั้งสองจุด query
//     ตรงๆ ไม่มีเงื่อนไข "status='active'" ใดๆ เลย → **hard DELETE ปลอดภัย ไม่ทำลายฟีเจอร์อื่น** และยังเป็น
//     พฤติกรรมที่ถูกต้องตามเจตนา "unlink" ด้วย: ถ้าไม่ลบแถวจริง ครั้งหน้าที่ LINE เดิมพยายามล็อกอิน
//     line-login จะยังเจอ mapping เก่าแล้วพาไปเข้าบัญชีเดิมที่เพิ่งถูก "ถอด" ไป ซึ่งขัดกับสิ่งที่ผู้ใช้ตั้งใจ
//     ทำ (เขาต้องการให้ LINE นี้เป็นอิสระจากบัญชีนี้แล้ว — ครั้งหน้าถ้าล็อกอิน LINE นี้ใหม่ควรสร้าง/ผูกบัญชี
//     ใหม่ได้ ไม่ใช่ถูกดึงกลับเข้าบัญชีเดิมที่เพิ่งตัดขาดไป)
//     ⚠️ ตาราง line_identities ไม่มี unique constraint บนคอลัมน์ user_id เดี่ยวๆ (PK คือ line_user_id
//     เท่านั้น) แปลว่าทางทฤษฎี "1 บัญชีผู้เล่น อาจผูก LINE ไว้มากกว่า 1 ไอดี" ได้ (ไม่เคยเจอเคสจริงในระบบ
//     แต่ schema ไม่ได้ห้ามไว้) — ไฟล์นี้เลือกลบ "ทุกแถว" ที่ user_id ตรงกับผู้เรียกเวลา provider='line'
//     (ให้ตรงความหมาย "ถอดช่องทาง LINE ทั้งหมดออกจากบัญชี" แบบเดียวกับ google/facebook ที่มีแค่ 1 identity
//     ต่อ provider เสมอ) — 🚫 **Lin ควรยืนยันว่าพฤติกรรมนี้ถูกต้องตามที่ต้องการ ถ้ามีเคสที่อยากให้เลือกถอด
//     LINE ทีละไอดีได้ ต้องแก้ request contract เพิ่ม (ตอนนี้ยังไม่รองรับ ยังไม่มี UI ที่ต้องใช้ด้วย)**
//
// ── การนับ "ช่องทางล็อกอินจริงที่ใช้งานได้" (หัวใจของด่านที่ Lin สั่งมา) ────────────────────
//   realCount = (native identities ทั้งหมดที่ไม่ใช่อีเมลปลอมของ LINE)  +  (1 ถ้ามีแถว line_identities
//   ของผู้ใช้นี้อย่างน้อย 1 แถว ไม่ว่าจะกี่แถวก็นับเป็น "มีช่องทาง LINE" แค่ 1 หน่วย)
//   — จงใจนับ native identity "ทุกตัว" ที่ไม่ตรงรูปแบบอีเมลปลอม ไม่จำกัดแค่ google/facebook/email ที่รู้จัก
//   วันนี้ เผื่ออนาคต Lin เปิด provider เพิ่ม (เช่น Apple Sign-In) โค้ดนี้จะยังนับถูกต้องโดยไม่ต้องแก้ไฟล์
//   ก่อนจะถอดช่องทางไหน คำนวณ "เหลือกี่ช่องทางหลังถอด" (realCount - 1 ถ้าช่องทางที่จะถอดนับเป็นของจริง)
//   ถ้าผลลัพธ์ < 1 → ปฏิเสธทันที ไม่แตะข้อมูลใดๆ เลย พร้อมข้อความภาษาไทยบอกเหตุผลชัดเจน
//
// ── Request/Response contract (ไว้ให้ทีมต่อ UI) ──────────────────────────────────
//   Method: POST (ท่าเดียวกับฟังก์ชันอื่นในโปรเจกต์)
//   Headers: Authorization: Bearer <access_token ของผู้เล่นที่ล็อกอินอยู่>  (บังคับ — ไม่มี = 401)
//   Body: { "provider": "google" | "facebook" | "email" | "line" }  (ค่าอื่นนอกจากนี้ = 400)
//     ถ้า client แนบ "user_id" มาด้วยจะถูกเพิกเฉยเสมอ (เหมือน account-export/account-delete) —
//     ผู้เรียกคือใครมาจาก JWT เท่านั้น
//   Response 200: {
//     ok: true, provider, unlinked: true,
//     remaining_real_methods: <ตัวเลข>,               // เหลือกี่ช่องทางจริงหลังถอด (ควร ≥ 1 เสมอ)
//     remaining_providers: [ "google", "line", ... ],  // รายชื่อช่องทางที่ยังเหลือ (native + "line")
//     audit_logged: true|false,                        // false = บันทึกประวัติพลาด (ไม่ critical แต่บอกตรงๆ)
//     message: "..."
//   }
//   Response 400: { error: 'invalid_provider' | 'not_linked' | 'missing_provider' | ... }
//   Response 401: { error: '...' }  — ไม่มี/หมดอายุ token, หรือ token เก่าเกิน 5 นาที (stale_session —
//     เพิ่ม 2026-08-08 ตามที่ Lin สั่ง: ต้อง refresh session/ล็อกอินใหม่ให้ได้ JWT สดก่อนถอดช่องทางล็อกอิน
//     เหมือนกับ account-delete ทุกประการ — ฝั่ง client ต้องเรียก sb.auth.refreshSession() ก่อนยิงมาที่นี่)
//   Response 409: {                                    // ← ด่านหลักที่ Lin สั่งมา
//     error: 'would_leave_zero_login_methods',
//     current_real_method_count, providers_currently_linked,
//     message: '不能移除這個登入方式，移除後您將完全無法登入帳號。請先連接其他登入方式再試一次。' (+ ไทยกำกับ)
//   }
//   Response 429: { error: 'rate_limited — 請稍後再試' }
//   Response 500: { error: '...', detail, completed: false }  — ถอดไม่สำเร็จ/ตรวจไม่ผ่าน ไม่มีวันตอบ 200
//     ถ้ายังตรวจไม่ผ่านว่าถอดสำเร็จจริง (กฎ RELIABILITY FIRST — ห้ามขึ้นสำเร็จถ้ายังไม่ตรวจว่าสำเร็จจริง)
//
// วิธี deploy (สำหรับ Lin ทำเองภายหลัง — AI ไม่มีสิทธิ์และไม่รันเอง):
//   1. ไม่ต้องรัน SQL ใหม่ — ใช้ตาราง/ฟังก์ชันที่มีอยู่แล้วทั้งหมด (line_identities, account_audit_log,
//      log_account_audit, rl_check) ไม่มีไฟล์ SQL แนบมาด้วยรอบนี้
//   2. supabase functions deploy account-unlink   (ไม่ต้องใส่ --no-verify-jwt — เรียกจาก supabase-js
//      ในเบราว์เซอร์เสมอ มี apikey/JWT แนบอัตโนมัติ เหมือน account-export/account-delete/game-content)
//   3. ไม่ต้องตั้ง secret เพิ่ม — ใช้ SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY ที่
//      Supabase ใส่ให้ทุก Edge Function อยู่แล้วอัตโนมัติ
//   4. 🚫 ก่อน deploy จริง (ดูหัวข้อสีแดงด้านบนทั้งสองจุด): (ก) ยืนยันด้วย SQL จริงว่าผู้ใช้ LINE-only มี
//      email identity ปลอมจริงตามที่คาด (ข) ทดสอบเรียกฟังก์ชันนี้กับบัญชีทดสอบจริงที่มี ≥2 ช่องทาง
//      ก่อนปล่อยให้ผู้เล่นจริงใช้
// ════════════════════════════════════════════════════════════════════════════

// deno-lint-ignore-file
// @ts-nocheck  (Supabase Edge Function รันบน Deno ไม่ใช่ Node — IDE อาจฟ้อง type error ปกติ ไม่กระทบตอน deploy จริง)

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// ช่องทางที่ฟังก์ชันนี้ยอมรับให้ "เลือกถอด" ได้ (ตรงกับ 4 ช่องทางล็อกอินที่เว็บนี้มีจริงตอนนี้ — ดู
// หัวข้ออธิบายสถาปัตยกรรมด้านบน) ถ้า Lin เปิด provider ใหม่ในอนาคต ต้องมาเพิ่มชื่อในลิสต์นี้ด้วยมือ
// (การนับ "จริง" ด้านล่างนับ provider แปลกใหม่ให้อัตโนมัติอยู่แล้ว แต่การ "เลือกถอด" ต้องรู้จักชื่อก่อนเสมอ
// กันพิมพ์ชื่อมั่ว/พยายามยิง provider ที่ไม่รองรับเข้ามา)
const UNLINKABLE_PROVIDERS = ['google', 'facebook', 'email', 'line'];
const AUDITABLE_LINK_PROVIDERS = ['facebook'];

// รูปแบบอีเมลปลอมที่ line-login/index.ts สร้างให้ผู้ใช้ LINE คนใหม่เสมอ (ดูฟังก์ชัน syntheticEmail()
// ในไฟล์นั้น บรรทัด 78-83: 'line-' + lineUserId + '@users.line.invalid') โดเมน .invalid สงวนไว้ตาม
// RFC 2606 ข้อ 2 — ไม่มีทางมีใครยืนยันตัวตนผ่าน Email OTP จริงด้วยโดเมนนี้ได้ เจอรูปแบบนี้ = ปลอมแน่นอน
const SYNTHETIC_LINE_EMAIL_RE = /^line-.+@users\.line\.invalid$/i;

const ALLOWED_ORIGINS = [
  'https://mrtaihualin.com',
  'https://www.mrtaihualin.com',
  'https://mrtaihualin.github.io',
  // 2026-08-10 (P7-02 staging): หน้าทดสอบ staging บน Netlify
  'https://gentle-moxie-bf64ad.netlify.app',
];

// ── บังคับ JWT สดใหม่ก่อนถอดช่องทางล็อกอิน (เพิ่ม 2026-08-08 ตามที่ Lin สั่ง — เดิมไฟล์นี้ไม่มีด่านนี้
// ต่างจาก account-delete ที่มีอยู่แล้ว) ────────────────────────────────────────────────────────
// เหตุผลที่ต้องมี: การถอดช่องทางล็อกอินเป็นการกระทำที่กระทบความปลอดภัยบัญชีโดยตรง (ลดจำนวนทางเข้าที่
// เจ้าของบัญชีใช้ได้) — ถ้าไม่บังคับ fresh JWT ใครก็ตามที่มีสิทธิ์เข้าถึง session ที่ล็อกอินค้างอยู่ (เช่น
// เครื่องสาธารณะ/แชร์กัน หรือ token หลุด) จะถอดช่องทางออกได้ทันทีโดยไม่ต้องพิสูจน์ตัวตนซ้ำเลย — ใช้ค่า/
// ตรรกะเดียวกันเป๊ะกับ account-delete/index.ts (คัดลอกมาตรงๆ ไม่ได้คิดใหม่ กันพลาดไม่ตรงกัน)
const FRESH_JWT_MAX_AGE_SECONDS = 300;

function decodeJwtPayloadUnsafe(jwt) {
  try {
    const parts = String(jwt || '').split('.');
    if (parts.length !== 3) return null;
    const b64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
    return JSON.parse(atob(padded));
  } catch (e) {
    return null;
  }
}

function corsHeadersFor(origin) {
  const allowOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Vary': 'Origin',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
}

// ตรวจว่าอีเมลนี้คือ "อีเมลปลอมของ LINE" ไหม — สัญญาณหลักคือรูปแบบโดเมน (เชื่อถือได้เองอิสระจากตารางอื่น)
function isSyntheticLineEmail(email) {
  return !!email && SYNTHETIC_LINE_EMAIL_RE.test(String(email).trim());
}

serve(async (req) => {
  const origin = req.headers.get('Origin') || '';
  const cors = corsHeadersFor(origin);
  function json(body, status) {
    return new Response(JSON.stringify(body), { status: status || 200, headers: { 'Content-Type': 'application/json', ...cors } });
  }

  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed', message: 'ใช้ POST เท่านั้น' }, 405);

  let body;
  try {
    body = await req.json();
  } catch (e) {
    return json({ error: 'invalid_json_body', message: 'รูปแบบข้อมูลที่ส่งมาไม่ถูกต้อง กรุณาลองใหม่' }, 400);
  }

  // 🔒 กฎเหล็ก: ห้ามเชื่อ user_id ที่ client ส่งมาทางไหนก็ตาม — เพิกเฉยเสมอ แค่เตือนไว้ในล็อก
  if (body && body.user_id) {
    console.warn('[account-unlink] client ส่ง user_id มาใน body (' + String(body.user_id) + ') — เพิกเฉยเสมอ ใช้แค่ user id จาก JWT ที่ยืนยันแล้วเท่านั้น');
  }

  const requestedAction = body && body.action;
  const action = requestedAction === 'status' || requestedAction === 'audit_link'
    ? requestedAction
    : 'unlink';
  const provider = body && body.provider;
  if (requestedAction && requestedAction !== 'status' && requestedAction !== 'audit_link') {
    return json({ error: 'invalid_action', message: 'ไม่รองรับ action นี้' }, 400);
  }
  if (action === 'unlink' && !provider) return json({ error: 'missing_provider', message: 'ต้องระบุ provider ที่จะถอด' }, 400);
  if (action === 'unlink' && !UNLINKABLE_PROVIDERS.includes(provider)) {
    return json({ error: 'invalid_provider', message: 'ช่องทางล็อกอินนี้ไม่รองรับการถอด', allowed: UNLINKABLE_PROVIDERS }, 400);
  }
  if (action === 'audit_link' && !AUDITABLE_LINK_PROVIDERS.includes(provider)) {
    return json({ error: 'invalid_audit_provider', message: 'ไม่รองรับ provider นี้สำหรับ link audit', allowed: AUDITABLE_LINK_PROVIDERS }, 400);
  }

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
  const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY');
  const admin = createClient(SUPABASE_URL, SERVICE_KEY); // bypass RLS — ใช้เฉพาะจุดที่ไม่มี policy ให้ authenticated อ่าน/เขียนเองได้

  try {
    // ── ยืนยันตัวตนจาก JWT จริง (ไม่เชื่อ user_id ใดๆ ที่ client ส่งมา) ─────────────────────
    const authHeader = req.headers.get('Authorization') || '';
    const jwt = authHeader.replace(/^Bearer\s+/i, '');
    if (!jwt) return json({ error: 'missing_auth_token', message: '請先登入' }, 401);

    const asUser = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } } });
    const { data: userData, error: userErr } = await asUser.auth.getUser(jwt);
    if (userErr || !userData?.user) return json({ error: 'invalid_session', message: '請重新登入' }, 401);
    const user = userData.user;
    const userId = user.id; // ← ตัวแปรเดียวที่ใช้กำหนดว่า "บัญชีของใคร" ทั้งไฟล์นี้ ไม่รับค่าจากที่อื่น

    if (action === 'unlink') {
      // ── เช็คว่า JWT "เพิ่งออกใหม่จริง" (re-auth) เฉพาะ mutation ───────────────────────────
      // status เป็น read-only และใช้ JWT ที่ตรวจด้วย getUser() แล้ว จึงไม่บังคับ refresh ทุกครั้งที่เปิดโปรไฟล์
      const claims = decodeJwtPayloadUnsafe(jwt);
      const iat = claims?.iat;
      if (!iat || typeof iat !== 'number') {
        return json({ error: 'cannot_verify_session_freshness', message: 'token ไม่มี iat อ่านไม่ได้ กรุณาล็อกอินใหม่' }, 401);
      }
      const ageSeconds = Math.floor(Date.now() / 1000) - iat;
      if (ageSeconds > FRESH_JWT_MAX_AGE_SECONDS || ageSeconds < -30) {
        return json({
          error: 'stale_session',
          message: 'session เก่าเกินไป กรุณาออกจากระบบแล้วล็อกอินใหม่ก่อนถอดช่องทางล็อกอิน',
          jwt_age_seconds: ageSeconds,
          max_allowed_seconds: FRESH_JWT_MAX_AGE_SECONDS,
        }, 401);
      }

      // ── rate limit เกราะเสริม (fail-open — ถ้า rl_check พังไม่บล็อกงาน) ──────────────────
      const { data: rlOk, error: rlErr } = await admin.rpc('rl_check', {
        p_user: userId, p_fn: 'account-unlink', p_limit: 10, p_window: 600,
      });
      if (!rlErr && rlOk === false) return json({ error: 'rate_limited', message: '請稍後再試' }, 429);
    }

    // ── ดึงแถว line_identities ของผู้ใช้นี้ (service_role เท่านั้นที่อ่านตารางนี้ได้ — ดูหัวข้ออธิบาย
    // ด้านบนไฟล์) ── ไม่ maybeSingle() เพราะทางทฤษฎีมีได้มากกว่า 1 แถว (ดูหมายเหตุด้านบน)
    const { data: lineRows, error: lineErr } = await admin
      .from('line_identities')
      .select('line_user_id')
      .eq('user_id', userId);
    if (lineErr) return json({ error: 'db_lookup_failed', message: 'ตรวจสอบช่องทางล็อกอินไม่สำเร็จ กรุณาลองใหม่อีกครั้ง', detail: lineErr.message }, 500);
    const lineLinked = (lineRows || []).length > 0;

    // แหล่งจริงของ LINE คือ line_identities ไม่ใช่ app_metadata ใน JWT ซึ่งค้างได้หลัง unlink/ข้อมูลเก่า
    if (action === 'status') {
      return json({ ok: true, action: 'status', line_linked: lineLinked });
    }

    if (action === 'audit_link') {
      // Browser state is evidence for UX only, never authorization or audit payload.
      // Derive the current provider set from the freshly verified Auth user and the
      // server-only LINE mapping. Synthetic LINE support email is not a login method.
      const providersAfter = Array.from(new Set((user.identities || [])
        .filter((idn) => {
          const identityEmail = (idn.identity_data && idn.identity_data.email) || (idn.provider === 'email' ? user.email : null);
          return !(idn.provider === 'email' && isSyntheticLineEmail(identityEmail));
        })
        .map((idn) => idn.provider)
        .concat(lineLinked ? ['line'] : [])));
      if (!providersAfter.includes(provider)) {
        return json({
          error: 'provider_not_linked',
          provider,
          audit_logged: false,
          message: 'ยังยืนยันไม่ได้ว่าช่องทางนี้เชื่อมกับบัญชีปัจจุบันแล้ว',
        }, 409);
      }

      // Fail closed on the abuse guard: an authenticated caller must not be able to
      // manufacture an unbounded stream of privileged audit rows for their account.
      const { data: auditRlOk, error: auditRlErr } = await admin.rpc('rl_check', {
        p_user: userId, p_fn: 'account-audit-link', p_limit: 5, p_window: 600,
      });
      if (auditRlErr) {
        return json({ error: 'audit_guard_unavailable', audit_logged: false, message: 'บันทึกประวัติยังไม่สำเร็จ กรุณาลองใหม่อีกครั้ง' }, 503);
      }
      if (auditRlOk === false) {
        return json({ error: 'rate_limited', audit_logged: false, message: '請稍後再試' }, 429);
      }

      const providersBefore = providersAfter.filter((name) => name !== provider);
      const { error: auditErr } = await admin.rpc('log_account_audit', {
        p_user_id: userId,
        p_event_type: 'link',
        p_provider: provider,
        p_before_state: { providers: providersBefore },
        p_after_state: { providers: providersAfter },
        p_actor_type: 'user',
        p_actor_id: userId,
      });
      if (auditErr) {
        console.error('[account-unlink] log_account_audit failed for verified link', auditErr);
        return json({ error: 'audit_log_failed', audit_logged: false, message: 'บันทึกประวัติยังไม่สำเร็จ กรุณาลองใหม่อีกครั้ง' }, 500);
      }
      return json({ ok: true, action: 'audit_link', provider, audit_logged: true });
    }

    // ── นับช่องทางล็อกอิน "จริง" ทั้งหมด (native identities ที่ไม่ใช่อีเมลปลอมของ LINE + LINE ถ้ามี) ──
    const nativeIdentities = user.identities || [];
    const annotatedNative = nativeIdentities.map((idn) => {
      const idnEmail = (idn.identity_data && idn.identity_data.email) || (idn.provider === 'email' ? user.email : null);
      const synthetic = idn.provider === 'email' && isSyntheticLineEmail(idnEmail);
      if (synthetic && !lineLinked) {
        // สัญญาณหลัก (รูปแบบโดเมน) บอกว่าปลอม แต่หาแถว line_identities ของผู้ใช้นี้ไม่เจอ — ข้อมูลไม่ตรงกัน
        // ผิดปกติ (เช่น เคยถอด LINE ไปแล้วแต่ email synthetic ยังค้างอยู่) ยังคงถือว่า "ปลอม" อยู่ดี
        // (ทิศทางปลอดภัยกว่า) แต่ต้องโวยดังๆ ให้ Lin ไปตรวจข้อมูลจริง ไม่ใช่ปล่อยเงียบ
        console.warn('[account-unlink] user ' + userId + ' มี email identity รูปแบบ LINE synthetic (' + idnEmail + ') แต่ไม่มีแถวใน line_identities — ข้อมูลไม่ตรงกัน ควรตรวจมือ');
      }
      return { ...idn, _synthetic_line_email: synthetic };
    });
    const realNative = annotatedNative.filter((idn) => !idn._synthetic_line_email);
    const totalRealBefore = realNative.length + (lineLinked ? 1 : 0);
    const providersCurrentlyLinked = realNative.map((idn) => idn.provider).concat(lineLinked ? ['line'] : []);

    // ── หาช่องทางที่ขอถอด + คำนวณว่าถอดแล้วจะยัง "นับเป็นของจริง" อยู่ไหม ────────────────────
    let targetIdentity = null; // สำหรับ google/facebook/email เท่านั้น
    let removingCountsAsReal = false;
    if (provider === 'line') {
      if (!lineLinked) return json({ error: 'not_linked', message: 'บัญชีนี้ยังไม่ได้ผูก LINE ไว้', provider }, 400);
      removingCountsAsReal = true;
    } else {
      targetIdentity = nativeIdentities.find((idn) => idn.provider === provider) || null;
      if (!targetIdentity) return json({ error: 'not_linked', message: 'บัญชีนี้ยังไม่ได้ผูกช่องทางล็อกอินนี้ไว้', provider }, 400);
      const isSynthetic = provider === 'email' && isSyntheticLineEmail(
        (targetIdentity.identity_data && targetIdentity.identity_data.email) || user.email
      );
      if (isSynthetic) {
        // ช่องทางนี้ไม่ใช่ของจริงตั้งแต่แรก (เป็นอีเมลภายในที่ผูกไว้ให้ LINE ใช้ส่ง magic link) — ห้ามให้ถอด
        // เด็ดขาดไม่ว่ากรณีใด เพราะ (1) ไม่ได้ช่วยอะไรผู้ใช้เลยแม้จะถอดสำเร็จ (2) ถ้าถอดจริง จะทำให้
        // line-login/index.ts เรียก generateLink({email: linkEmail}) ครั้งถัดไปพัง เพราะ Supabase หา
        // identity email นี้ไม่เจอแล้ว — ผู้ใช้จะล็อกอิน LINE ไม่ได้อีกเลยทั้งที่ยังผูก LINE อยู่
        return json({
          error: 'cannot_unlink_synthetic_email',
          message: '這個「電子郵件」不是您自己設定的登入方式，是系統內部用來支援 LINE 登入的技術欄位，無法移除。如果您想停用 LINE 登入，請改為選擇「移除 LINE」。 (นี่ไม่ใช่อีเมลที่คุณตั้งเอง เป็นช่องทางภายในที่ระบบใช้รองรับการล็อกอินด้วย LINE ถอดไม่ได้ — ถ้าต้องการเลิกใช้ LINE ให้เลือก "ถอด LINE" แทน)',
        }, 400);
      }
      removingCountsAsReal = true;
    }

    const remainingAfter = totalRealBefore - (removingCountsAsReal ? 1 : 0);
    if (remainingAfter < 1) {
      // ═══ ด่านหลักที่ Lin สั่งมา — ปฏิเสธทันที ไม่แตะข้อมูลใดๆ เลย ═══
      return json({
        error: 'would_leave_zero_login_methods',
        current_real_method_count: totalRealBefore,
        providers_currently_linked: providersCurrentlyLinked,
        message: '無法移除這個登入方式，移除後您將完全無法登入帳號。請先連接其他登入方式（Google、Facebook、Email 或 LINE）之後再試一次。（不能取消最後一個登入方式，不然帳號會登不進去）',
      }, 409);
    }

    // ══════════════════════════════════════════════════════════════════════
    // ผ่านด่านครบแล้ว — ลงมือถอดจริง
    // ══════════════════════════════════════════════════════════════════════
    let removedDetail = null;

    if (provider === 'line') {
      // ── ถอด LINE: hard delete ทุกแถวของผู้ใช้นี้ใน line_identities (ดูเหตุผล hard-delete ในหัวไฟล์) ──
      const removedLineUserIds = (lineRows || []).map((r) => r.line_user_id);
      const { error: delLineErr } = await admin.from('line_identities').delete().eq('user_id', userId);
      if (delLineErr) {
        return json({
          error: 'unlink_failed', provider, detail: delLineErr.message, completed: false,
          message: 'ถอดช่องทาง LINE ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง',
        }, 500);
      }
      // ตรวจกลับว่าลบสำเร็จจริง — ห้ามเชื่อว่า error=null แปลว่าสำเร็จเฉยๆ (กฎ RELIABILITY FIRST)
      const { data: verifyRows, error: verifyErr } = await admin.from('line_identities').select('line_user_id').eq('user_id', userId);
      if (verifyErr || (verifyRows && verifyRows.length > 0)) {
        return json({
          error: 'unlink_unverified', provider, remaining_rows: verifyRows ? verifyRows.length : null, detail: verifyErr && verifyErr.message,
          completed: false,
          message: 'ถอดช่องทาง LINE ยังไม่สำเร็จแน่ชัด กรุณาอย่าปิดหน้านี้ แล้วแจ้งครูให้ตรวจสอบให้',
        }, 500);
      }
      // app_metadata เป็น cache เพื่อความเข้ากันได้เท่านั้น; ล้าง best-effort หลัง source of truth ถูกลบแล้ว
      // UI รุ่นใหม่จะไม่เชื่อค่านี้เพื่อแสดงสถานะเชื่อมต่ออีกต่อไป
      try {
        const { error: metaErr } = await admin.auth.admin.updateUserById(userId, {
          app_metadata: { ...(user.app_metadata || {}), line_linked: false, line_user_id: null },
        });
        if (metaErr) console.warn('[account-unlink] LINE mapping removed but app_metadata cleanup failed:', metaErr.message);
      } catch (e) {
        console.warn('[account-unlink] LINE mapping removed but app_metadata cleanup threw:', String((e && e.message) || e));
      }
      removedDetail = { line_user_ids: removedLineUserIds };
    } else {
      // ── ถอด native identity (google/facebook/email จริง): เรียก GoTrue REST ตรงๆ ด้วยเหตุผลที่อธิบาย
      // ไว้ในหัวไฟล์ (ไม่พึ่ง client.auth.unlinkIdentity() เพราะไม่ชัวร์เรื่อง session state) ──
      const identityId = targetIdentity.identity_id || targetIdentity.id;
      if (!identityId) {
        return json({
          error: 'missing_identity_id', provider, completed: false,
          message: 'เกิดข้อผิดพลาดของระบบ กรุณาแจ้งครู (ไม่พบรหัสอ้างอิงของช่องทางล็อกอินนี้)',
          detail: 'identity object จาก getUser() ไม่มีทั้ง identity_id และ id — โครงสร้างข้อมูลไม่ตรงกับที่คาดไว้ ต้องตรวจมือก่อนไปต่อ (ดูหมายเหตุ 🔴 ในหัวไฟล์)',
        }, 500);
      }
      const delRes = await fetch(`${SUPABASE_URL}/auth/v1/user/identities/${identityId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${jwt}`, apikey: ANON_KEY, 'Content-Type': 'application/json' },
      });
      if (!delRes.ok) {
        const detailText = await delRes.text().catch(() => '');
        return json({
          error: 'unlink_failed', provider, status: delRes.status, detail: detailText.slice(0, 500), completed: false,
          message: 'ถอดช่องทางล็อกอินนี้ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง',
        }, 500);
      }
      // ตรวจกลับว่าถอดสำเร็จจริง — เรียก getUser() ซ้ำด้วย jwt เดิม (unlink ไม่ทำให้ access token
      // ปัจจุบันหมดอายุทันที) แล้วเช็คว่า provider นี้หายไปจากรายชื่อ identities จริง
      const { data: recheckData, error: recheckErr } = await asUser.auth.getUser(jwt);
      const stillThere = !recheckErr && recheckData?.user?.identities?.some((idn) => idn.provider === provider);
      if (recheckErr || stillThere) {
        return json({
          error: 'unlink_unverified', provider, detail: recheckErr && recheckErr.message, completed: false,
          message: 'ถอดช่องทางล็อกอินนี้ยังไม่สำเร็จแน่ชัด กรุณาอย่าปิดหน้านี้ แล้วแจ้งครูให้ตรวจสอบให้',
        }, 500);
      }
      removedDetail = { identity_id: identityId };
    }

    // ── เขียน audit log "หลังจาก" ตรวจยืนยันว่าถอดสำเร็จจริงแล้วเท่านั้น (ต่างจาก account-delete ที่เขียน
    // ก่อนลบ — เหตุผลต่างกัน: บัญชีนี้ "ยังอยู่" ต่อหลัง unlink ไม่ได้หายไปเหมือนตอนลบบัญชี จึงเขียน log
    // ให้ตรงกับสถานะจริงหลังยืนยันแล้วดีกว่า ไม่ใช่เขียนล่วงหน้าเผื่อพัง) — ไม่ critical ถ้าพลาด (การถอด
    // จริงสำเร็จ+ยืนยันแล้วตั้งแต่ขั้นบน) แต่ log ไว้เสมอ ไม่ปล่อยเงียบ (แพทเทิร์นเดียวกับ line-login) ──
    let auditLogged = false;
    try {
      const { error: auditErr } = await admin.rpc('log_account_audit', {
        p_user_id: userId,
        p_event_type: 'unlink',
        p_provider: provider,
        p_before_state: { real_method_count: totalRealBefore, providers_linked: providersCurrentlyLinked },
        p_after_state: { real_method_count: remainingAfter, removed: removedDetail },
        p_actor_type: 'user',
        p_actor_id: userId,
      });
      if (auditErr) console.error('[account-unlink] log_account_audit failed', auditErr);
      else auditLogged = true;
    } catch (e) {
      console.error('[account-unlink] log_account_audit threw', e);
    }

    const remainingProviders = providersCurrentlyLinked.filter((p) => p !== provider);
    return json({
      ok: true,
      provider,
      unlinked: true,
      remaining_real_methods: remainingAfter,
      remaining_providers: remainingProviders,
      audit_logged: auditLogged,
      message: '已成功移除登入方式（已確認生效）。',
    });
  } catch (e) {
    // เกิด error ที่ไม่คาดคิด (เช่น network พังกลางทาง) — ตอบ 500 ชัดเจน ไม่ปั๊ม ok:true เด็ดขาด
    // 🆕 2026-08-08: แยก error (code คงที่) ออกจาก message (ข้อความคนอ่านได้) เหมือน account-delete/account-export
    return json({
      error: 'unexpected_error',
      message: 'เกิดข้อผิดพลาดที่ไม่คาดคิด กรุณาลองใหม่อีกครั้ง ถ้ายังไม่หายกรุณาแจ้งครู',
      detail: String((e && e.message) || e),
    }, 500);
  }
});

// ════════════════════════════════════════════════════════════════════════════
// สิ่งที่ยังต้องให้ Lin ตัดสินใจ/ยืนยันก่อน deploy จริง (ยังไม่ได้ทำในไฟล์นี้ — ตั้งใจเว้นไว้)
// ════════════════════════════════════════════════════════════════════════════
// 1. 🔴 ยังไม่เคยตรวจกับฐานข้อมูลจริงว่าผู้ใช้ LINE-only มี native email identity ปลอมจริงตามที่โค้ด
//    line-login/index.ts บ่งชี้ (ยืนยันจากการอ่านโค้ดเท่านั้น) — ควรรัน
//    `select provider, identity_data->>'email' from auth.identities where user_id = '<line-only test user>'`
//    กับผู้ใช้ทดสอบจริงก่อน deploy อย่างน้อย 1 ครั้ง
// 2. 🔴 ยังไม่เคยยิง request จริงทดสอบ GoTrue REST endpoint `/auth/v1/user/identities/{identity_id}`
//    ในเซสชันนี้เลย (ไม่มีสิทธิ์เข้าถึงเครือข่าย/โปรเจกต์จริงของ Lin) — endpoint path และชื่อ field
//    (identity_id vs id) มาจากการอ่านเอกสาร/พฤติกรรม SDK เท่านั้น ไม่ใช่การทดสอบจริง ควรทดสอบกับบัญชี
//    ทดสอบที่มี ≥2 ช่องทางจริงก่อนปล่อยให้ผู้เล่นจริงใช้
// 3. line_identities ไม่มี unique constraint บน user_id เดี่ยวๆ — ไฟล์นี้เลือก "ลบทุกแถว LINE ของ
//    ผู้ใช้นั้นพร้อมกัน" เวลา provider='line' (ไม่รองรับเลือกถอดทีละไอดี) Lin ควรยืนยันว่าพฤติกรรมนี้
//    ถูกต้องตามที่ต้องการ
// 4. ยังไม่มีการแจ้งเตือน (LINE/อีเมล) ยืนยันว่าถอดช่องทางสำเร็จแล้ว — ถ้าอยากให้มี ต้องเพิ่มทีหลัง
//    (คนละงานกับด่านความปลอดภัยหลักที่ขอมารอบนี้)
// 5. rate limit 10 ครั้ง/10 นาที เป็นค่าที่ AI ประเมินเอง ไม่ใช่ตัวเลขที่ Lin กำหนดมาตรงๆ — ปรับได้ที่
//    ค่าคงที่ในโค้ดด้านบน (ใน .rpc('rl_check', ...))
// 6. ฝั่ง client (ปุ่ม/หน้ายืนยันถอดช่องทาง, ข้อความเตือนก่อนกด) เป็นงานแยกที่คนอื่นทำ — ไฟล์นี้ไม่ได้
//    แตะ UI ใดๆ เลยตามขอบเขตงานที่ได้รับมอบหมาย
// ════════════════════════════════════════════════════════════════════════════
