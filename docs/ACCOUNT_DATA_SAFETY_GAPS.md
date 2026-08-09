# รายงานช่องว่าง Account / Auth / Database / Backup / Privacy / Security

> ตรวจเมื่อ: 2026-08-08 · ต่อจาก `58_HANDOFF_แชทใหม่_ต่องานบัญชีผู้เล่น+cookie-consent+P2.md`
> ขอบเขต: **ไม่แตะ** Payment/billing, ภาษี, หรือการตัดสินข้อกฎหมายที่ต้องให้คนภายนอกยืนยัน
> สถานะ: ✅ DONE · ⚠️ PARTIAL · ❌ NOT DONE · 🚫 ต้องทำภายนอก/ต้องใช้คนดำเนินการ
> กฎ: ห้ามใส่เรื่องที่ทำเสร็จแล้วกลับมาเป็นงานใหม่ — รายการนี้เป็น "ของที่ยังขาด" เท่านั้น

---

## 1) Restore Test — ✅ DONE

มีขั้นตอนจริง: restore เข้า Supabase project แยก (ไม่ทับ production) → เทียบจำนวนแถวของตารางหลัก → บันทึกผล
- ขั้นตอน: `21_ระบบสำรองข้อมูล.md`
- ผลทดสอบจริง 2026-08-08: `28_ผลลัพธ์_P2-07_ทดสอบกู้คืน.md` — จำนวนแถวตรงเป๊ะทั้ง 4 ตารางหลัก (`classroom_students` 18, `classroom_payments` 23, `classroom_schedule` 310, `classroom_requests` 105) รวมถึงบันทึก root cause ของปัญหาที่เจอระหว่างทดสอบ (PGUSER/password ผิด, error `auth.*`/`cron.job` ที่ไม่กระทบ)
- Runbook สำหรับเหตุจริง: มีคำสั่ง restore (`psql ... -f roles.sql/schema.sql/data.sql`) บันทึกไว้แล้ว

**ไม่ต้องทำอะไรเพิ่ม**

---

## 2) Audit Log — ⚠️ PARTIAL (ตามที่ตั้งใจ ไม่ใช่ของค้าง)

ตาราง/schema รองรับครบ 8 event type แล้ว (`link, unlink, email_change, password_reset, account_merge, premium_transfer, admin_correction, account_deletion`) — ดู `supabase/sql/2026-08-08_account_audit_log.sql`

แต่ **มีแค่ event `link` เท่านั้นที่ถูกเขียนจริง** (LINE + Facebook) เพราะ event อื่นทั้ง 5 **ยังไม่มีฟีเจอร์ต้นทางในเว็บเลย** — ตรวจแล้วไม่พบโค้ดของทั้ง 5 เรื่องนี้แม้แต่จุดเดียว:

| Event ที่ยังไม่เกิด | เหตุผล |
|---|---|
| `email_change` | ไม่มี UI/ฟังก์ชันเปลี่ยนอีเมล |
| `password_reset` | **ระบบนี้ไม่มีรหัสผ่านเลย** — ล็อกอินผ่าน Google/Facebook OAuth, LINE (custom), หรือ Email OTP (`signInWithOtp`) เท่านั้น ไม่มี `signInWithPassword`/`resetPasswordForEmail` ในระบบ |
| `account_deletion` | ยังไม่มีฟีเจอร์ลบบัญชี (ดูข้อ 3) |
| `admin_correction` | แผงแอดมินเดียวที่มี (`admin-game-reports.html`) แก้ได้แค่คะแนนรางวัล ไม่แตะบัญชี/ข้อมูลผู้ใช้ |
| `account_merge` | ไม่มีฟีเจอร์รวมบัญชี |

**สรุป: logging เองพร้อมแล้ว รอแค่ตัวฟีเจอร์เกิดก่อนถึงจะมีอะไรให้บันทึก** — ไม่ใช่บั๊ก เป็นลำดับงานปกติ (ต้องมีฟีเจอร์ก่อนถึงจะ log ฟีเจอร์นั้นได้)

---

## 3) Account Deletion — ✅ DONE (cooldown 7 วัน — deploy+ทดสอบ+push ครบแล้ว 2026-08-09)

**🆕 อัปเดต 2026-08-08 (รอบ 3 — เปลี่ยนสถาปัตยกรรมทั้งหมด):** Lin ตัดสินใจเปลี่ยนจาก "ลบทันทีตอน confirm"
เป็น **cooldown 7 วัน** (ผ่านแชท decision queue): ยื่นคำขอ → รอ 7 วัน (login/เล่นเกมได้ปกติ, login ไม่ถือเป็น
การยกเลิก, ต้องกดยกเลิกเองเท่านั้น) → ถ้าไม่ยกเลิก → cron ลบถาวรจริงในรอบดำเนินการถัดไปหลังครบกำหนด
(cron รันวันละครั้ง 20:00 UTC / 03:00 ไทย — **ไม่ใช่ลบตรงวินาทีที่ครบกำหนดเป๊ะ** ข้อความ UI/อีเมลทุกจุด
แก้ให้สื่อแบบนี้แล้ว)

**ไฟล์ที่แก้/สร้างรอบนี้:**
- `supabase/functions/account-delete/index.ts` — เขียนใหม่ทั้งไฟล์ เหลือ 3 action: `preview` (โชว่สถานะ
  pending ด้วย) / `request` (สร้างคำขอ cooldown — ไม่ลบอะไรจริง) / `cancel` (ยกเลิกได้เอง ไม่บังคับ fresh
  JWT เพราะเป็นทิศทางปลอดภัย)
- 🆕 `supabase/functions/account-delete-cron/index.ts` — รันทุกวันผ่าน pg_cron ลบถาวรจริงเมื่อครบกำหนด
  (ย้ายขั้นตอน a-d มาจากไฟล์เดิม) มี claim-lock กันรันซ้อน + แคชอีเมลผู้ใช้ลง DB (`contact_email_snapshot`)
  ก่อนเริ่มลบเสมอ (หลังลบ auth user แล้ว query อีเมลย้อนหลังไม่ได้อีก) + มี retry pass แยกอิสระสำหรับอีเมล
  "ลบสำเร็จ" ที่เคยส่งพลาด (สูงสุด 5 ครั้ง ไม่แตะสถานะการลบเลย ไม่มีทางสั่งลบซ้ำ)
- 🆕 `supabase/functions/send-transactional-email/index.ts` — จุดกลางส่งอีเมล 3 template (ยื่นคำขอ/
  ยกเลิก/ลบสำเร็จ) **ยังไม่ได้เลือก provider** (Lin สั่งห้าม AI เลือก/สมัคร/ตั้ง secret เอง) — โค้ดตัวอย่าง
  Resend ไว้เป็น reference เท่านั้น มีตารางเทียบ Resend/Postmark/SendGrid ท้ายไฟล์รอ Lin เลือก
- `js/core/auth-widget.js` — เปิด modal ปุ๊บเช็คทันทีว่ามีคำขอค้างไหม (`renderDangerZone`) ถ้ามีโชว์
  banner แดง + วันที่ + ปุ่ม "取消刪除帳號" แทนปุ่มลบปกติ
- 🆕 `supabase/sql/2026-08-08_account_deletion_cooldown.sql` — ✅ รันครบแล้วทั้ง [A]/[B]/[C] 2026-08-09 —
  ตาราง `account_deletion_requests` + ขยาย CHECK ของ `account_audit_log` + pg_cron `account-delete-daily`
  (jobid 15, active=true, Vault-based) ยืนยันแล้วด้วย `select * from cron.job`
- 🆕 `docs/ACCOUNT_DELETION_PRE_DEPLOY_CHECKLIST.md` — เช็กลิสต์ทดสอบก่อน deploy แบบบังคับ (ใช้บัญชี
  ทดสอบเท่านั้น) ดูหัวข้อถัดไป

**สิ่งที่ตรวจแล้ว (ไม่เปลี่ยนจากรอบก่อน — สำรวจ FK จริงจาก `supabase/schema/2026-08-07_01_tables_and_constraints.sql`):**

| กลุ่มตาราง | ทำยังไงเมื่อลบบัญชี |
|---|---|
| `game_accounts`, `profiles`, `reading_sessions`, `tone_progress`, `tone_sessions`, `tone_srs_state`, `line_identities`, `classroom_game_links` | **ลบอัตโนมัติแล้ว** (มี `ON DELETE CASCADE` ผูกกับ `auth.users` อยู่แล้ว) — เรียก `auth.admin.deleteUser()` ตัวเดียวลบหมด |
| `game_reward_points`, `game_reward_events`, `anon_game_events` (กรณีมี user_id) | **มี FK แต่ไม่ cascade** (RESTRICT) → ต้องลบ/anonymize มือก่อนเรียก `deleteUser()` ไม่งั้นลบไม่ผ่าน |
| `star_ledger`, `login_events` | ไม่มี FK เลย (uuid ค้าง) → **ยืนยันแล้ว 2026-08-08: star_ledger ไม่มี PII จริง** (`reason` เป็นค่าคงที่ `'capped'`/`'mastered'` เท่านั้น — จุดเดียวที่ insert คือ `tone-round/index.ts` ตรวจโค้ดแล้วไม่ใช่ free text) จึงไม่ anonymize จริง (no-op) · `login_events` ยัง ANONYMIZE ตามเดิม |
| `account_audit_log` | ไม่มี FK โดยตั้งใจ → **RETAIN** (ประวัติ security อยู่ต่อ ไม่มี PII อื่นนอกจาก uuid ที่ตายแล้ว) |
| `payout_ledger` | **ยืนยันแล้ว 2026-08-08: ใช้พฤติกรรมเดิม** (บล็อกการยื่นคำขอถ้ามีแถว pending/approved ค้าง — ไม่แตะแถว paid/rejected เลย ปล่อยเป็น orphan ตามที่ Lin ต้องการ) |
| `leads` | ไม่ผูกกับบัญชี (แค่ email ก่อนสมัคร) — คนละเรื่อง ไม่รวมในลบบัญชี |

**✅ ตัดสินใจแล้วครบ (ปิดจบ ไม่ใช่ของค้างอีกต่อไป):**
- Cooldown 7 วัน + login ไม่ยกเลิกอัตโนมัติ + ต้องมี banner/ปุ่มยกเลิก + ต้องมีอีเมล 3 จุด — ดูรายละเอียดด้านบน
- `payout_ledger` ใช้พฤติกรรมเดิม ไม่แก้
- `star_ledger` ไม่มี PII ไม่ต้องแก้
- Email failure handling: อีเมล "ลบสำเร็จ" ส่งพลาดไม่ทำให้ deletion ถูกมองว่าล้มเหลว/ไม่ rollback/ไม่ทำให้
  cron ลบซ้ำ — log แยกจากผลการลบ + retry ได้ปลอดภัยสูงสุด 5 ครั้ง (ดู `account-delete-cron/index.ts`)

**✅ อัปเดต 2026-08-09 — Full Account Deletion Test ผ่านครบ 9 ข้อ (บังคับ) แล้ว**
ทดสอบด้วยบัญชี `mr.taihualin+test2@gmail.com` ครบทุกขั้น (request/cancel/request ซ้ำ/ปรับเวลา/invoke
cron/ลบถาวรจริง/ตรวจ DB+Auth+audit log ครบ 4 event/ล็อกอินซ้ำเป็นบัญชีใหม่/อีเมลครบ 4 ฉบับ) ไม่พบบั๊ก
รายละเอียดเต็ม: `Bussiness Idea/ระบบเว็บไซต์/72_ผลลัพธ์_account-delete_FullDeletionTest+งานค้าง.md`

**✅ อัปเดต 2026-08-09 (รอบ 2) — ปิดครบเกือบทั้งหมด:**
1. ✅ **`EMAIL_PROVIDER_API_KEY` คืนเป็นค่า Resend จริงแล้ว**
2. ✅ **รัน SQL หัวข้อ [C] แล้ว** — cron `account-delete-daily` ทำงานจริง (jobid 15, active=true)
3. ✅ **ทดสอบ failure-path ของอีเมลจนจบแล้ว** ด้วยบัญชี `mr.taihualin+test4@gmail.com` — ผลตามคาด
   (`email_sent:false` ตอนกุญแจผิด, บัญชีลบสำเร็จปกติไม่ rollback)
4. ✅ Push `js/core/auth-widget.js` ขึ้น GitHub แล้ว

**🐛 บั๊กจริงที่เจอระหว่างทดสอบ retry (แก้ + deploy ขึ้น production แล้ว 2026-08-09):**
`account-delete-cron/index.ts` เดิม return ทันทีถ้าไม่มีบัญชีใหม่ครบกำหนดลบในรอบนั้น ทำให้ retry pass ของ
อีเมลที่เคยส่งพลาด **ไม่ทำงานเลยถ้าไม่มีบัญชีใหม่ให้ลบพร้อมกัน** — ไม่กระทบข้อมูล/ความปลอดภัย กระทบแค่
อีเมลยืนยันอาจไม่ถูกส่งซ้ำ แก้แล้วโดยเอา early return ออก ทดสอบยืนยัน retry ทำงานถูกต้องแล้ว
รายละเอียดเต็ม: `Bussiness Idea/ระบบเว็บไซต์/72_ผลลัพธ์_account-delete_FullDeletionTest+งานค้าง.md`

**✅ ปิดงานสมบูรณ์แล้ว** — push `auth-widget.js` และ `account-delete-cron/index.ts` ขึ้น GitHub ผ่าน
GitHub Desktop เรียบร้อยแล้วทั้งคู่ (ยืนยันจาก Lin 2026-08-09) — ไม่มีงานค้างของหัวข้อนี้อีก
- B.5a (LINE-only synthetic email) — ✅ ปิดแล้ว ดูหัวข้อ B ด้านล่าง (ผ่านครบ 2026-08-09)

---

## 4) User Data Export — ⚠️ PARTIAL (โค้ดพร้อมแล้ว ยังไม่ deploy)

**อัปเดต 2026-08-08 (รอบอนุมัติ):** Lin อนุมัติ scope แล้ว (เงื่อนไข: จำกัดเฉพาะข้อมูลของเจ้าของบัญชีเองเท่านั้น) → สร้างโค้ดจริงแล้วที่ `supabase/functions/account-export/index.ts` ล็อกสิทธิ์ 2 ชั้น (RLS-scoped client เป็นหลัก + service_role พร้อม `.eq('user_id', callerUid)` มือสำหรับ 2 ตารางที่ไม่มี SELECT policy) + ต่อปุ่ม "📦 匯出我的資料" ใน `js/core/auth-widget.js` แล้ว (ดาวน์โหลดเป็นไฟล์ JSON) — **ยังไม่ deploy รอ Lin ตรวจ**

ตารางเดิม (สำรวจตอนออกแบบ):

- **รวม:** `profiles`, `game_accounts`, `game_reward_points`, `star_ledger`, `tone_progress`, `tone_sessions`, `tone_srs_state`, `reading_sessions`, `game_reward_events` (รีวิว/รายงานบั๊กของตัวเอง), รายชื่อ provider ที่เชื่อมบัญชี (ไม่รวม token)
- **ห้ามรวม:** อะไรจาก `auth.users` เกินกว่า email/created_at, `login_events` (ข้อมูลความปลอดภัย เช่น IP), `account_audit_log` แบบดิบ, `payout_ledger`, ค่า service_role ใดๆ
- **กลไกที่เสนอ:** Edge Function ใหม่ (ท่าเดียวกับ `game-content`/`game-reward` ที่มีอยู่แล้ว) ให้ผู้ใช้ที่ล็อกอินอยู่เรียกด้วย JWT ตัวเอง → query ผ่าน RLS จะได้เฉพาะแถวของตัวเองอัตโนมัติ → รวมเป็น JSON

**🚫 ต้องรอ Lin ตรวจโค้ดก่อน deploy:** ยังไม่เคยยืนยันกับฐานข้อมูลจริงว่า 2 ตารางที่ไม่มี SELECT policy (`line_identities`, `account_audit_log`) ใช้ service_role อ่านได้ตามที่โค้ดคาดจริง — ควรทดสอบกับบัญชีจริง 1 ครั้งก่อนปล่อยให้ผู้เล่นทุกคนกดใช้

---

## 5) Session Security — ⚠️ PARTIAL (ปิดได้ 1 ข้อ เพิ่ม 2026-08-08)

| เรื่อง | สถานะ |
|---|---|
| Logout อุปกรณ์นี้ | ✅ มี (`sb.auth.signOut()` ใน `js/core/auth-widget.js`) |
| **Logout ทุกอุปกรณ์** | ✅ **เพิ่มแล้ว 2026-08-08** — `doLogoutAllDevices()` เรียก `sb.auth.signOut({scope:'global'})` ปุ่ม "📴 登出所有裝置" ในหน้าต่าง 帳號管理 — เป็นแค่การแก้ `.js` ธรรมดา ไม่ต้อง deploy อะไรเพิ่ม พร้อมใช้งานทันทีที่ Lin push |
| Session expiration / refresh token | ⚠️ พึ่งค่า default ของ Supabase JS client ล้วนๆ ไม่มีโค้ด custom เลย — ใช้ได้แต่ยังไม่มีการตรวจ/ปรับแต่งเชิงรุก (ยังเป็นข้อเปิดอยู่ ไม่ใช่บั๊ก แค่ยังไม่ได้พิจารณาว่าควรตั้งอายุ JWT สั้นลงไหม) |
| Session เก่าหลังเปลี่ยนรหัสผ่าน | **N/A — ปิดถาวร** ระบบนี้ไม่มีรหัสผ่านให้เปลี่ยนเลย (โครงสร้างระบบ ไม่ใช่ของที่ต้องรอทำ) |
| Account recovery | ⚠️ ไม่มี flow "ลืมรหัสผ่าน" แยกต่างหาก — **Lin ตัดสินใจแล้ว (2026-08-08): ยังไม่ทำตอนนี้** ไม่ใช่ของค้างที่ต้องตอบซ้ำ |
| **🆕 OAuth CSRF (LINE custom flow)** | ✅ **ตรวจแล้ว 2026-08-08 — มีอยู่แล้ว ไม่ใช่ช่องโหว่** `js/games/line-callback.js` เช็ค `state` ที่ได้จาก LINE ตรงกับที่เก็บไว้ก่อน redirect (`line_login_state`) ก่อนเชื่อ ป้องกัน CSRF ได้ + ลบ state ทิ้งทันทีหลังใช้ 1 ครั้ง (กัน replay) |

**🚫 ต้องรอ Lin ตัดสินใจ (เหลือข้อเดียว):** ควรตั้งอายุ JWT/refresh token ให้สั้นลงจากค่า default ของ Supabase ไหม (ไม่ใช่บั๊ก แค่เป็นตัวเลือกเสริมความปลอดภัย ไม่เร่งด่วน)

---

## 6) Supabase RLS / Authorization Audit — ⚠️ PARTIAL (พบ 1 ช่องโหว่จริง)

ตรวจครบทุกตารางที่มี RLS (37 ตาราง) เทียบกับ index `00_ฟังก์ชันไหนอยู่ไฟล์ไหน.md` — **ไม่พบช่องโหว่ให้อ่าน/เขียนข้อมูลคนอื่นข้าม user** ในตารางส่วนใหญ่ (ตารางที่ตั้งใจไม่มีด่าน DELETE/UPDATE ตามรายชื่อที่ Lin ยืนยันแล้วใน CLAUDE.md ไม่ถูกนับเป็นบั๊ก)

**🔴 พบใหม่ — ไม่ได้อยู่ใน checklist เดิม แต่เป็นช่องโหว่จริงที่ควรอุด:**
`reading_sessions.score` และ `tone_sessions.score` เปิดให้ INSERT ได้แค่เช็ค `auth.uid()=user_id` **ไม่มีการเช็คขอบเขตตัวเลข (score/games/total)** — ผู้เล่นที่ล็อกอินอยู่สามารถยิง INSERT ตรงผ่าน PostgREST ใส่คะแนนสูงลิบเข้ากระดานผู้นำได้เลย (`combined_leaderboard_weekly/alltime`, `leaderboard_alltime` ดึงจาก `SUM(score)` ตรงๆ) — **ยืนยันแล้วว่าไม่กระทบ `star_ledger`/`game_reward_points`** (ตารางเหล่านั้นเขียนได้แค่ทาง service_role Edge Function เท่านั้น) จึงเป็นแค่การโกงกระดานผู้นำ ไม่ใช่การโกงแต้ม/รางวัลจริง — **แต่ยังคงเป็นบั๊กที่ควรอุด**

**พบเพิ่ม (ไม่ใช่บั๊ก แต่ควรให้ Lin ยืนยันว่าตั้งใจ):**
- `leads` มีแค่ INSERT policy (anon, `with check`) ไม่มี SELECT policy เลย — เดาว่าตั้งใจให้อ่านผ่าน Dashboard เท่านั้น แต่ไม่อยู่ในรายชื่อที่ยืนยันแล้ว ขอ Lin ยืนยันสั้นๆ
- `tone_sessions` มี SELECT policy ซ้ำ 2 อัน — ดูข้อ "Fold-in" ด้านล่าง (มีไฟล์ SQL แก้พร้อมแล้ว)

**Service role key ฝั่ง client:** ✅ ตรวจแล้วไม่พบ — ทุก key ที่เจอในโค้ดฝั่งเว็บถอดรหัส JWT แล้วเป็น `anon` role ทั้งหมด (ปลอดภัยเพราะ RLS เปิดอยู่)

**อัปเดต 2026-08-08:** Lin สั่งอุดแล้ว → ร่าง SQL เสร็จแล้วที่ `supabase/sql/2026-08-08_leaderboard_score_bounds.sql` (เพดานอ้างอิงสูตรคะแนนจริงจาก `js/games/*.js` ไม่ได้เดา) **สถานะปัจจุบัน: รอ Lin รัน `[PRECHECK]` (3 query read-only บรรทัด 97-107) เองก่อน** เพื่อดูว่ามีคะแนนเก่าที่จะโดนเพดานใหม่บล็อกไหม — ยังไม่อนุมัติให้รัน `[A][B][C]` จริงจนกว่าจะเห็นผล PRECHECK · **ตรวจซ้ำ 2026-08-08 (รอบ audit อิสระ):** ยืนยันว่า live policy ปัจจุบันยังไม่มีด่านเช็คขอบเขต (ไฟล์ยังไม่ถูกรัน) และพบเพิ่ม: `anon_game_events` INSERT policy เช็คแค่ `true` ไม่ตรวจว่า `user_id` ที่แนบมาตรงกับ `auth.uid()` จริงไหม — ผลกระทบต่ำ (ไม่มีโค้ดฝั่งเว็บเขียนเข้าตารางนี้เลยตอนนี้ ข้อมูลก็ไม่ถูกใช้ตัดสินใจอะไร) แต่บันทึกไว้เผื่ออนาคต

---

## 7) Secrets Audit — ✅ DONE (ไม่พบของหลุด)

รัน `scripts/secret-scanner.js` (879 ไฟล์) ผ่านสะอาด + ตรวจมือซ้ำ:
- `service_role` ที่เจอทั้งหมดเป็นแค่คอมเมนต์อธิบายสถาปัตยกรรม ไม่มีค่าจริงหลุด
- JWT ที่เจอในโค้ดฝั่งเว็บ (`supabase-config.js`, `shared.js`, ไฟล์ classroom ฯลฯ) ถอดแล้วเป็น **anon key เดียวกันทั้งหมด** — ปลอดภัยตามกฎ (มี RLS)
- ไม่มี `.env` หลุด, ไม่มี private key หลุด (เจอแค่ในโค้ด parse PEM ที่ถูกต้องของ `line-webhook` กับใน `node_modules` ที่ถูก gitignore อยู่แล้ว)
- ไม่พบ ECPay/NewebPay key หรือรหัสผ่านฮาร์ดโค้ด

**✅ แก้แล้ว 2026-08-08:** ไฟล์ `2026-07-17_pg_cron_calendar_schedule_sync.sql`, `2026-07-18_pg_cron_low_quota_daily.sql`, `2026-07-30_shorten_calendar_schedule_sync_interval.sql` ยังเขียนว่าใช้ `anon` key แต่ production จริงใช้ `service_role` ผ่าน Vault ไปแล้ว (`2026-08-07_p1-06_cron_vault.sql`) — ย้ายทั้ง 3 ไฟล์เข้าโฟลเดอร์ `supabase/sql/เลิกใช้แล้ว_ห้ามรัน/` แล้ว พร้อมเพิ่มหัวไฟล์อธิบายว่าอะไรมาแทน (ไม่ใช่ของหลุด แค่เอกสารล้าสมัย ย้ายไฟล์ล้วนๆ ไม่กระทบระบบจริง)

---

## 8) Monitoring Backup — ⚠️ PARTIAL

- ✅ Backup ทำงานอัตโนมัติทุกวัน (GitHub Actions, ตี 3 เวลาไทย) + รองรับกดรันมือ
- ✅ แจ้งเตือนเมื่อ **ล้มเหลว** ผ่าน LINE ทันที (พิสูจน์แล้วว่าส่งถึงจริง)
- ⚠️ แจ้งเตือนเมื่อ **สำเร็จ** มีแค่สรุปรายสัปดาห์ (ทุกวันจันทร์) — วันอื่นที่สำเร็จจะไม่มีการแจ้งอะไรเลย ต้องเข้า GitHub Actions เองถึงจะเห็น
- ❌ ไม่มีที่เดียวที่ดูได้ทันทีว่า "restore test ล่าสุดทำเมื่อไหร่" — อยู่แค่ในเอกสาร markdown ไม่โชว์ในระบบ

**🚫 ต้องรอ Lin ตัดสินใจ:** อยากได้แจ้งเตือน LINE ทุกวันที่ backup สำเร็จด้วยไหม (ไม่ใช่แค่ล้มเหลว) — ถ้าอยากได้เป็นงานเล็ก แก้ที่ workflow condition ได้เลย

---

## 9) Migration Safety — ⚠️ PARTIAL (กฎหลักมีแล้ว เหลือ 1 กฎย่อยที่ยังไม่เขียนเป็นลายลักษณ์อักษร)

- ✅ กฎ "SQL ทุกคำสั่งที่เปลี่ยนระบบต้องมีไฟล์ต้นฉบับใน repo ก่อนรันจริง" มีอยู่แล้วใน CLAUDE.md (เพิ่ม 2026-08-07 หลังเจอปัญหาจริงเรื่อง cron ไม่มีไฟล์ต้นฉบับ)
- ✅ กฎ "1 ฟังก์ชัน 1 ไฟล์" มีอยู่แล้ว (หลังเจอปัญหาจริงเรื่องฟังก์ชันซ้อนกัน 2 ไฟล์)
- ✅ SQL ทุกไฟล์อยู่ใน version control (`supabase/sql/`) มีระบบตั้งชื่อ + โฟลเดอร์ `เลิกใช้แล้ว_ห้ามรัน` แยกของเก่าออกชัดเจน
- ❌ **ยังไม่มีกฎเขียนไว้ชัดๆ ว่า "destructive migration ต้อง backup ก่อนเสมอ"** — ที่ผ่านมาทำแบบ ad hoc เป็นเคสๆ ไป (เช่นงาน tone_sessions ในรอบนี้ที่ Lin สั่งให้สำรองก่อนลบ) ไม่ใช่กฎมาตรฐานที่บังคับทุกครั้ง
- ⚠️ Rollback: มีเฉพาะบางไฟล์ที่แนบ block ย้อนกลับของตัวเองไว้ (ไม่ได้บังคับทุกไฟล์)

**🚫 ต้องรอ Lin ตัดสินใจ:** อยากให้เพิ่มกฎถาวรใน CLAUDE.md ว่า "SQL ที่เป็น DROP/DELETE/TRUNCATE ต้องมีบรรทัดเตือนให้สำรองก่อนเสมอ + ต้องแนบ rollback block" ไหม (งานเอกสารล้วนๆ ไม่กระทบระบบ ทำได้เลยถ้า Lin โอเค)

---

## 10) สรุปรวม — สถานะล่าสุด (อัปเดต 2026-08-08 หลังรอบตรวจซ้ำ)

**สถานะ deploy 3 ฟังก์ชันหลัก — ยืนยันจาก Lin แล้ว 2026-08-08 (บันทึกแยกกันชัดเจน กันเถียงซ้ำ):**

> หลักการที่ Lin ย้ำ: **ห้าม deploy feature แบบครึ่ง flow** ที่ผู้ใช้เริ่ม action ได้แต่ระบบทำให้จบไม่ได้

| ฟังก์ชัน | สถานะ | เงื่อนไขก่อน deploy จริง |
|---|---|---|
| `account-export` | ✅ **Deploy แล้ว 2026-08-09 + ทดสอบผ่านจริง** (export ได้ไฟล์ JSON ถูกต้อง มีแค่ข้อมูลตัวเอง ไม่มี service_role หลุด) | ไม่มีเงื่อนไขค้าง — ปิดงาน |
| `account-unlink` | ✅ **Deploy แล้ว 2026-08-09 + ผ่าน Mandatory Pre-Deploy Test B.5a + B.5b ครบทั้งคู่** | ไม่มีเงื่อนไขค้าง — ปิดงาน |
| `account-delete` (+ `account-delete-cron` + SQL cooldown + transactional email) | 🟡 **Deploy แล้ว + Full Account Deletion Test ผ่านครบ 9 ข้อ (2026-08-09)** ยังไม่เปิดให้ผู้เล่นจริงใช้ (UI `js/core/auth-widget.js` ยังไม่ push) | เหลือ: (1) 🔴 ตั้ง `EMAIL_PROVIDER_API_KEY` กลับเป็นค่าจริง (ตอนนี้เป็นค่าผิดจากทดสอบ failure-path ที่ค้างไว้) (2) รัน SQL [C] ตั้ง pg_cron อัตโนมัติ (3) push UI ขึ้น GitHub |

**โค้ดสร้างเสร็จแล้ว รอ Lin ตรวจ+deploy ตามตารางด้านบน:**
- `supabase/functions/account-delete/index.ts` — ยื่นคำขอลบบัญชี (cooldown 7 วัน — ไม่ลบทันทีอีกต่อไป ดูข้อ 3)
- 🆕 `supabase/functions/account-delete-cron/index.ts` — ลบถาวรจริงเมื่อครบกำหนด (รันทุกวัน)
- 🆕 `supabase/functions/send-transactional-email/index.ts` — ส่งอีเมล 3 จุดของ flow ลบบัญชี (รอเลือก provider)
- `supabase/functions/account-export/index.ts` — export ข้อมูลตัวเอง (พร้อม deploy แล้ว)
- `supabase/functions/account-unlink/index.ts` — ถอดช่องทางล็อกอิน (กันเหลือ 0 ช่องทาง)
- ต่อ UI ครบแล้วใน `js/core/auth-widget.js` (ปุ่มอยู่ในหน้าต่าง "帳號管理" ใหม่) — logout ทุกอุปกรณ์ใช้งานได้ทันทีที่ push (ไม่ต้อง deploy) ส่วนปุ่มอื่นต้อง deploy Edge Function ก่อน

**SQL draft 4 ไฟล์ (ยังไม่ได้รันสักไฟล์ รอ Lin สั่ง):**
- `supabase/sql/2026-08-08_anon_spam_protection.sql` — กันสแปม `anon_game_events`/`leads` — กระทบ 0% (ไม่มีโค้ดฝั่งเว็บเขียนเข้า 2 ตารางนี้เลยตอนนี้)
- `supabase/sql/2026-08-08_drop_duplicate_tone_sessions_policy.sql` — ลบ policy ซ้ำของ `tone_sessions` — กระทบ 0% ⚠️ ต้องสำรอง DB ก่อนรันตามที่ Lin ขอ
- `supabase/sql/2026-08-08_leaderboard_score_bounds.sql` — อุดช่องโหว่คะแนนปลอมกระดานผู้นำ — **กระทบจริง** (เกมเขียนคะแนนเข้า 2 ตารางนี้ทุกวัน) **สถานะ: รอ Lin รัน `[PRECHECK]` (read-only 3 query) เองก่อน** ยังไม่อนุมัติให้รันส่วนที่แก้จริง
- 🆕 `supabase/sql/2026-08-08_account_deletion_cooldown.sql` — ตาราง `account_deletion_requests` + ขยาย CHECK ของ `account_audit_log` + ตั้ง pg_cron — ✅ **[A]+[B] รันแล้ว 2026-08-09 (Mandatory Pre-Deploy Test ผ่านครบ)** เหลือแค่ **[C] (ตั้ง pg_cron อัตโนมัติ) ยังไม่ได้รัน** — ปลอดภัยที่จะรันได้แล้วตอนนี้ (ไม่มีแถว pending ทดสอบค้าง)

**คงเดิม ไม่ต้องทำอะไรเพิ่ม:** Restore test + monitoring พื้นฐาน (ข้อ 1), audit log สำหรับ `link` event (ข้อ 2), Secrets สะอาด (ข้อ 7), Session recovery (Lin ตัดสินใจแล้วว่ายังไม่ทำ), แจ้งเตือน backup แบบเดิม (Lin เลือกไม่เพิ่ม)

---

## 11) รอบตรวจซ้ำ 2026-08-08 (ระหว่างรอผล PRECHECK ของ leaderboard) — 5 หัวข้อที่ Lin สั่งเพิ่ม

**RLS/Authorization — ตรวจซ้ำอิสระทุกตาราง (37 ตาราง):** ยืนยันผลเดิม ไม่พบช่องโหว่ใหม่ที่ร้ายแรง นอกจาก 2 จุดเล็กที่บันทึกเพิ่ม: (1) `anon_game_events` INSERT policy ไม่เช็คว่า `user_id` ที่แนบมาตรงกับผู้เรียกจริงไหม — ผลกระทบต่ำเพราะไม่มีใครเขียนเข้าตารางนี้อยู่แล้ว (2) ยืนยัน `classroom_recording_issues` มีครบ 4 policy แล้วจริง (ของเก่าที่เคยขาด) ยืนยัน service_role key ไม่หลุดไปฝั่ง client ในทุกไฟล์รวมถึงไฟล์ใหม่ 3 ตัวด้วย — ✅ สะอาด

**Migration safety — พบช่องว่างที่ยังไม่มีใครแก้ (นอกจากกฎ backup-ก่อน-ลบที่เพิ่งเพิ่ม):**
1. **ไม่มี staging/dev project แยกจาก production เลย** — ทุกอย่างทดสอบตรงกับฐานข้อมูลจริง (ตัวทดสอบที่มีอยู่ 1 ไฟล์ `supabase/tests/2026-08-02_reschedule_lock_guard_TEST.sql` ก็ insert/delete กับตาราง production จริงแล้ว cleanup เอง) — ดริลกู้คืนที่มี (P2-07) เป็นคนละเรื่องกัน (ทดสอบว่า backup กู้คืนได้ ไม่ใช่ทดสอบ migration ใหม่ก่อนขึ้นจริง)
2. **ไม่มีคนที่สอง/ระบบที่สองตรวจโค้ด SQL ก่อนรัน** — ด่านเดียวคือ Lin อ่านแล้วอนุมัติ (และ Lin เองระบุไว้ใน `AGENTS.md` ว่าไม่ได้อ่านโค้ดออก) ไม่มี peer review หรือ AI รอบสองตรวจซ้ำเป็นมาตรฐาน
3. **ไม่มีระบบ migration history ของจริง** — `supabase/migrations/` ไม่มีอยู่เลย ทุกอย่างรันมือผ่าน SQL Editor คัดลอกจากไฟล์ — มีความพยายามแก้แล้ว (`supabase/sql/2026-08-07_migration_tracking.sql` สร้างตาราง `private.sql_run_log`) แต่เป็นตารางที่ต้องมีคนจำมาบันทึกเอง ไม่ใช่ระบบ track อัตโนมัติของ Supabase เอง
4. **Rollback block ที่เขียนไว้ในไฟล์ใหม่ๆ ยังไม่เคยถูกรันทดสอบจริงสักครั้ง** (เพราะ migration หลักเองก็ยังไม่ได้รัน) — เป็นแผน ไม่ใช่ของที่พิสูจน์แล้วว่าใช้ได้จริง

**Unlink Google/Email — วิเคราะห์เจาะจง (ยังไม่แก้โค้ดเพิ่ม):**
โค้ดที่มีอยู่ใน `account-unlink/index.ts` จัดการ Google/Email ผ่าน logic กลางเดียวกับทุก native provider (นับ identity ทุกตัวที่ไม่ใช่อีเมลปลอมของ LINE) — **ทดสอบ logic การนับด้วย Node จริงแล้ว 9 เคส ผ่านหมด** (ดูหัวข้อ 12) ยืนยันว่าถูกต้องในทางทฤษฎี ประเด็นเฉพาะที่ยังต้องคิดเพิ่มก่อน deploy:
- **Unlink ไม่มีด่าน "fresh JWT" เหมือน account-delete** — ใครก็ตามที่มีสิทธิ์เข้าถึง session ที่ล็อกอินค้างอยู่ (เช่น เครื่องสาธารณะ) สามารถถอด Google/Email ออกได้ทันทีโดยไม่ต้องยืนยันตัวตนซ้ำ ต่างจากการลบบัญชีที่บังคับ re-auth — 🚫 **Lin ควรตัดสินใจว่าการถอดช่องทางล็อกอินควรบังคับ fresh JWT เหมือนกันไหม**
- **ยังไม่ชัดว่าถอด Email (native identity) แล้ว `auth.users.email` (คอลัมน์แยก ไม่ใช่แค่ identity) จะถูกล้างไปด้วยไหม** — พฤติกรรมนี้ขึ้นกับ Supabase GoTrue เอง ยังไม่เคยทดสอบกับบัญชีจริง **ยังยืนยันไม่ได้** ต้องทดสอบกับบัญชีทดสอบก่อน deploy
- ความเสี่ยงเชิง UX (ไม่ใช่ช่องโหว่ความปลอดภัย): ผู้ใช้ที่เหลือ Google อย่างเดียวแล้วเข้า Google account เดิมไม่ได้ (ลืม/บัญชีโดนล็อก) จะไม่มีทางกู้บัญชีได้เลย — เชื่อมกับ "Account recovery" ในข้อ 5 ที่ Lin ตัดสินใจไว้แล้วว่ายังไม่ทำตอนนี้

**Session security — ปิดได้ 3 ข้อ เหลือเปิด 1 ข้อ:** ดูหัวข้อ 5 ด้านบน (อัปเดตแล้ว) — ปิด: logout ทุกอุปกรณ์ (สร้างแล้ว), session หลังเปลี่ยนรหัสผ่าน (N/A ถาวร), account recovery (Lin ตัดสินใจแล้ว) เปิดเพิ่ม 1 เรื่องที่ตรวจแล้วไม่มีปัญหา: LINE custom flow มี CSRF protection (state/nonce) อยู่แล้ว ไม่ใช่ช่องโหว่ เหลือเปิดจริงแค่เรื่องอายุ JWT/refresh token (ไม่เร่งด่วน)

---

## 12) ทดสอบ 3 Edge Functions ในเครื่อง (local) เท่าที่ทำได้ — 2026-08-08

**ข้อจำกัดสำคัญ:** sandbox นี้ไม่มี Deno runtime และต่อเน็ตไปโหลด Deno ไม่ได้ (deno.land/github.com ถูกบล็อก) — **รันฟังก์ชันจริงแบบเต็มรูปแบบไม่ได้** ทดสอบได้แค่ที่ระบุด้านล่างเท่านั้น ส่วนที่เหลือ (การเรียก Supabase API จริง, behavior ของ GoTrue) ยังต้องรอทดสอบกับบัญชีจริงหลัง deploy

สิ่งที่ทดสอบได้จริงและทำแล้ว:
- ✅ `node --check` ทั้ง 3 ไฟล์ — ไม่มี syntax error
- ✅ ทดสอบ logic ตรวจ "JWT สดใหม่" ของ `account-delete` ด้วย Node จริง 7 เคส (fresh/stale/ไม่มี iat/ขอบเขตพอดี 300 วิ/clock skew) — **ผ่านหมด**
- ✅ ทดสอบ regex ตรวจ "อีเมลปลอมของ LINE" ของ `account-unlink` ด้วย Node จริง 9 เคส รวม round-trip กับฟังก์ชันสร้างอีเมลจริงจาก `line-login/index.ts` (สร้างแล้วตรวจจับได้จริงไหม) + false-positive test (อีเมลจริงที่มีคำว่า "line" ต้องไม่โดนจับผิด) — **ผ่านหมด**
- ✅ ทดสอบ logic "นับช่องทางล็อกอินจริง" ของ `account-unlink` (หัวใจของด่านที่ Lin สั่ง) ด้วย Node จริง 9 เคส ครอบคลุม: เหลือช่องทางเดียวห้ามถอด, ถอดได้ถ้าเหลือ ≥1, LINE-only ห้ามถอด LINE, ถอดอีเมลปลอมไม่ได้เด็ดขาด, ข้อมูลไม่ตรงกันยังคงเลือกทางปลอดภัย — **ผ่านหมด**

**ยังทดสอบไม่ได้ (ต้องรอ deploy จริง + บัญชีทดสอบ):** การเรียก Supabase Admin API จริง (`deleteUser`, GoTrue unlink REST endpoint), พฤติกรรมจริงของ `auth.users.email` หลัง unlink, RLS-scoped client ของ `account-export` ดึงข้อมูลถูกต้องจริงกับบัญชีทดสอบจริง

---

## รายการที่ต้องรอ Lin ตัดสินใจ/อนุมัติ (อัปเดต 2026-08-08 รอบ 3 — ของเดิมที่ตอบแล้วถูกตัดออก)

> ⚠️ แก้รอบนี้เพราะพบว่ารายการเดิมล้าสมัย — ข้อ 4/5 เดิมถามคำถามที่ **ตัดสินใจไปแล้วจริงในโค้ด** (fresh
> JWT ของ account-unlink เพิ่มไปแล้ว 2026-08-08, cooldown ของ account-delete ตัดสินใจไปแล้ว) แต่หัวข้อนี้
> ไม่เคยถูกอัปเดตตาม — บทเรียน: ต้องแก้ list นี้ทุกครั้งที่มีการตัดสินใจปิดจบข้อไหน ไม่ใช่ปล่อยค้าง

1. **PRECHECK ของ leaderboard** — รอผลตัวเลขจาก Lin ก่อนถึงจะประเมินต่อว่าจะรัน `[A][B][C]` ได้ไหม
2. **สั่งรัน SQL ที่เหลือ** (spam protection / tone_sessions dedupe / 🆕 account_deletion_cooldown) — พร้อมรันได้ทันทีที่ Lin สั่ง (tone_sessions ต้องกด backup workflow ก่อน · account_deletion_cooldown ต้อง deploy `account-delete-cron` ให้เสร็จก่อนรันหัวข้อ [C])
3. **ตรวจโค้ด 5 Edge Function แล้ว deploy** — ✅ **Lin ตัดสินใจสถานะแต่ละตัวแล้ว 2026-08-08** (ดูตารางสถานะ deploy ในหัวข้อ 10 ด้านบน): `account-export` พร้อม deploy รอ Lin สั่งเอง · `account-unlink` รอผ่าน B.5a/B.5b ก่อน · `account-delete`+`account-delete-cron`+SQL cooldown+email ต้อง deploy พร้อมกันเป็นชุดเดียวหลังผ่าน Full Account Deletion Test เท่านั้น (ห้าม deploy ครึ่ง flow)
4. **เลือก email provider** (Resend/Postmark/SendGrid) — AI ห้ามเลือก/สมัคร/ตั้ง secret เอง (ตารางเทียบอยู่ท้าย `send-transactional-email/index.ts`)
5. **account-unlink:** ยังเหลือ 2 จุด 🔴 ที่โค้ดยอมรับเองว่ายังไม่เคยทดสอบกับของจริง — (ก) query B.5a ที่ Lin รันไปแล้วยังไม่ตอบคำถามได้ (แถวเดียวที่เจอไม่ใช่ LINE-only จริง) ต้องทดสอบสมัคร LINE-only ใหม่แล้ว query ซ้ำ (ข) ยังไม่เคยยิง GoTrue REST endpoint จริงทดสอบเลย ต้องทดสอบกับบัญชีทดสอบก่อน deploy — ✅ **fresh JWT เพิ่มไปแล้วจริงในโค้ด (ไม่ใช่คำถามเปิดอีกต่อไป)**
6. Cookie consent banner — ยังไม่ทำตามที่ Lin สั่ง รอผลตรวจ (ส่งไปแล้วรอบก่อน — GA4 87 หน้า/Clarity 79 หน้า/พบวิดีโอ YouTube โหมดตั้งคุกกี้ 4 จุดเพิ่ม)
7. ตัวเลือกเสริม (ไม่เร่งด่วน): ตั้งอายุ JWT/refresh token ให้สั้นลง, แจ้งเตือน LINE ทุกวันที่ backup สำเร็จ, เพิ่มกฎ staging/peer-review ให้ migration, ย้าย 3 ไฟล์ cron ที่ยืนยันว่าเลิกใช้เข้าโฟลเดอร์ห้ามรัน

**🚫 นอกขอบเขตงานนี้โดยตั้งใจ (ไม่แตะ):** Payment/billing setup, อัตราค่าธรรมเนียม ECPay/NewebPay, ภาษีส่งออกฮ่องกง, `payout_ledger`

---

## 13) ขั้นตอนละเอียดพร้อมใช้ — ปิดรอบ Account/Auth deploy (เพิ่ม 2026-08-08)

> ตรวจโค้ดจริงทั้ง 5 ไฟล์ + checklist ก่อนเขียนหัวข้อนี้ — ไม่มีเงื่อนไขค้างที่ AI เจอเพิ่มนอกจากที่บันทึกไว้
> ในหัวข้อ 10 อยู่แล้ว **ยกเว้นเรื่องเดียวที่ต้องแจ้งตรงๆ ก่อนเริ่ม:** repo นี้ไม่มี staging/dev project
> แยกจาก production เลย (ดูหัวข้อ 11 ข้อ 1) แปลว่าการทดสอบทั้งหมดด้านล่างต้องทำกับโปรเจกต์ Supabase จริง
> ของ Lin โดยตรง — ปลอดภัยได้เพราะ **หน้าเว็บที่มีปุ่มเรียกใช้ฟังก์ชันพวกนี้ (`js/core/auth-widget.js`)
> ยังไม่เคย push ขึ้น GitHub เลย** (อยู่ในเครื่องเท่านั้น) → นักเรียน/ผู้เล่นจริงยังเข้าไม่ถึงปุ่มพวกนี้แน่นอน
> ต่อให้ deploy ฟังก์ชันขึ้น Supabase แล้วก็ตาม **กฎสำคัญ: อย่าเพิ่ง push `js/core/auth-widget.js` และไฟล์
> เว็บที่เกี่ยวข้องขึ้น GitHub จนกว่าจะทำครบทุกข้อในหัวข้อนี้แล้ว**

### A. Deploy `account-export` (ไม่มีเงื่อนไขค้าง — ทำได้เลย)

ตรวจแล้วจาก `supabase/functions/account-export/index.ts`: โค้ดสมบูรณ์ อ่านข้อมูลอย่างเดียว (read-only)
ไม่แก้/ลบอะไร ไม่ต้องรัน SQL เพิ่ม ไม่ต้องตั้ง secret เพิ่ม

**ขั้นตอน (เปิด Terminal บนเครื่อง Mac ของ Lin เอง — ไม่ใช่ sandbox):**

1. เปิด Terminal → พิมพ์คำสั่งนี้เพื่อไปที่โฟลเดอร์เว็บ แล้ว Enter:
   ```
   cd /Users/taihualin/Developer/mrtaihualin.github.io
   ```
2. พิมพ์คำสั่งนี้แล้ว Enter (ถ้าเคย login/link โปรเจกต์ Supabase ผ่าน CLI มาก่อนแล้ว จะรันผ่านทันที ถ้าขึ้น
   error ว่ายังไม่ login ให้บอก AI แชทถัดไปเพื่อเตรียมขั้นตอน login ให้เพิ่ม):
   ```
   supabase functions deploy account-export
   ```
3. รอจนขึ้นคำว่า deploy สำเร็จ (มักมีลิงก์ Dashboard โผล่มาให้กดดู)
4. ตรวจว่าขึ้นจริงใน Dashboard: เปิด https://supabase.com/dashboard/project/qzkxlhpcputsvbqmtqfi/functions
   → ต้องเห็นชื่อ `account-export` ในลิสต์ พร้อมเวลา deploy ล่าสุด

**หลังจากนี้:** ฟังก์ชันขึ้นแล้วแต่ยังไม่มีใครเรียกใช้ได้ (ปุ่มในเว็บยังไม่ได้ push) ปลอดภัย ไม่ต้องรีบทดสอบ
ตอนนี้ก็ได้ — จะไปทดสอบพร้อมกับตอน push ปุ่ม "📦 匯出我的資料" ในรอบถัดไปก็ได้

---

### B. Mandatory Pre-Deploy Test ของ `account-unlink` — ✅ ผ่านครบแล้ว 2026-08-09 (ปิดงาน)

**ผล B.5a:** สมัครบัญชี LINE-only ใหม่ (`user_id: e656d94d-ce36-40fb-baef-03de21e0b344`) → query `auth.identities`
เจอแถว `provider='email'`, `email='line-u24d50130b387da2c95193d1eb503377a@users.line.invalid'` ตรงตามที่โค้ดคาด 100% — Supabase สร้าง synthetic email identity ให้ LINE user อัตโนมัติจริง ยืนยันแล้ว

**ผล B.5b:** deploy `account-unlink` สำเร็จ (project `qzkxlhpcputsvbqmtqfi`) → ทดสอบด้วยบัญชีทดสอบที่มี Email+Facebook (2 ช่องทางจริง):
- ถอด Facebook ตอนมี 2 ช่องทาง → `curl` ได้ **HTTP 200** `{"ok":true,"unlinked":true,"remaining_real_methods":1,"remaining_providers":["email"],"audit_logged":true}` ✅
- ถอด Email ตอนเหลือช่องทางเดียว (ทดสอบผ่านปุ่มจริงในหน้าเว็บ "帳號管理") → **ถูกปฏิเสธถูกต้อง** ขึ้นข้อความ "無法移除這個登入方式...（不能取消最後一個登入方式，不然帳號會登不進去）" ไม่ได้ถอดจริง บัญชียังล็อกอินได้ปกติ ✅
- ด่านหลัก `would_leave_zero_login_methods` ทำงานถูกต้องตามที่ออกแบบไว้ ไม่มีทางเหลือ 0 ช่องทางได้จริง

**สรุป: `account-unlink` พร้อมใช้งานจริง 100% ไม่มีเงื่อนไขค้างอีกต่อไป**

<details><summary>บันทึกเดิมก่อนทดสอบ (เก็บไว้อ้างอิง)</summary>

Mandatory Pre-Deploy Test ของ `account-unlink` — ข้อ B.5a + B.5b (ห้ามข้าม)

โค้ด `supabase/functions/account-unlink/index.ts` ยืนยันจากการอ่าน source แล้วว่าตรรกะถูกต้องครบ
(ทดสอบ logic ด้วย Node จริง 9 เคสผ่านหมด — ดูหัวข้อ 12) แต่ **2 จุดนี้ยังไม่เคยพิสูจน์กับของจริงเลย**
(ดูคอมเมนต์ท้ายไฟล์บรรทัด 452-459) — ต้องทำให้ครบก่อน deploy จริง

#### B.5a — พิสูจน์ว่า user LINE-only มี "email identity ปลอม" จริงตามที่โค้ดคาด

**เหตุผลที่ต้องทำ:** ฟังก์ชันนี้ต้อง "กรองอีเมลปลอมของ LINE ออกจากการนับช่องทางล็อกอินจริง" ถ้าพฤติกรรม
จริงของ Supabase ต่างจากที่คาด (เช่น ไม่สร้าง email identity ให้อัตโนมัติ) ต้องรู้ก่อน deploy

**ขั้นตอน:**

1. เปิดเว็บ (ไฟล์ในเครื่อง ยังไม่ต้อง push ก็ทดสอบได้ถ้าเปิดผ่าน local server หรือ mrtaihualin.github.io
   เวอร์ชันปัจจุบันที่มีปุ่ม LINE Login อยู่แล้ว) → กด "เข้าสู่ระบบด้วย LINE" ด้วย **บัญชี LINE ทดสอบที่ไม่เคย
   สมัครเว็บนี้มาก่อนเลย** (ห้ามใช้บัญชี LINE ส่วนตัวที่เคยผูก Google/Facebook/Email ไว้แล้ว — ต้องเป็นบัญชี
   ใหม่เอี่ยมที่ล็อกอินครั้งแรกด้วย LINE ล้วนๆ เท่านั้น ถึงจะทดสอบเคส "LINE-only" ได้จริง)
2. ล็อกอินสำเร็จแล้ว เปิด Supabase Dashboard → SQL Editor →
   https://supabase.com/dashboard/project/qzkxlhpcputsvbqmtqfi/sql/new
   วางคำสั่งนี้แล้วกด Run:
   ```sql
   select id as user_id, email from auth.users where email like 'line-%@users.line.invalid';
   ```
3. ต้องเจออย่างน้อย 1 แถว (คือบัญชีทดสอบที่เพิ่งสมัคร) — คัดลอก `user_id` ของแถวนั้นมาใช้ในขั้นถัดไป
4. วางคำสั่งนี้ (แทน `<user_id>` ด้วยค่าที่คัดลอกมา) แล้วกด Run:
   ```sql
   select provider, identity_data->>'email' as email
   from auth.identities
   where user_id = '<user_id>';
   ```
5. **ผลที่ต้องเห็นถึงจะถือว่าผ่าน:** มีแถว `provider = 'email'` โดย `email` ตรงรูปแบบ
   `line-<ตัวเลข>@users.line.invalid` (โดเมน `.invalid` ต้องขึ้นตรงๆ) — ถ้าเจอแบบนี้ = โค้ดคาดถูก
   ไปต่อ B.5b ได้เลย
   - **ถ้าไม่เจอแถว `provider='email'` เลย** (มีแค่ provider อื่น หรือไม่มีแถวไหนเลย) = พฤติกรรมจริงของ
     Supabase ต่างจากที่โค้ดคาดไว้ → **หยุดตรงนี้ อย่า deploy** แล้วเอาผลลัพธ์จริงที่ได้ (สกรีนช็อตหรือ
     copy ผลตาราง) ไปให้ AI แชทถัดไปดู เพื่อแก้ `account-unlink/index.ts` ให้ตรงกับพฤติกรรมจริงก่อน

#### B.5b — ทดสอบยิง GoTrue REST endpoint จริง (ตัวถอดช่องทางล็อกอินจริง)

**เหตุผลที่ต้องทำ:** ฟังก์ชันนี้เรียก `DELETE {SUPABASE_URL}/auth/v1/user/identities/{identity_id}` ตรงๆ
(ไม่ผ่าน SDK) ยังไม่เคยพิสูจน์ว่า field ชื่อ `identity_id` ที่โค้ดใช้ตรงกับของจริงไหม

**ขั้นตอนเตรียมก่อน:**

1. Deploy ฟังก์ชันก่อน (ยังไม่มีใครเรียกได้จนกว่าจะมี UI/curl มายิงเอง จึงปลอดภัย): ใน Terminal
   (ที่ `cd /Users/taihualin/Developer/mrtaihualin.github.io` แล้ว) พิมพ์:
   ```
   supabase functions deploy account-unlink
   ```
2. เตรียม **บัญชีทดสอบที่มี ≥2 ช่องทางล็อกอินจริง** (เช่น ล็อกอินด้วย Google ก่อน แล้วกดผูก LINE เพิ่มทีหลัง
   ในหน้า "帳號管理" ของเว็บ — ห้ามใช้บัญชีนักเรียนจริง)
3. หา **anon key** ของโปรเจกต์: Supabase Dashboard → Project Settings → API →
   https://supabase.com/dashboard/project/qzkxlhpcputsvbqmtqfi/settings/api → คัดลอกค่า "anon public"

**หา access token ของบัญชีทดสอบ (ทำตอนล็อกอินอยู่ในเว็บ):**

4. เปิดเว็บ ล็อกอินด้วยบัญชีทดสอบที่มี ≥2 ช่องทางแล้ว → กด F12 (เปิด Developer Tools) → แท็บ Console →
   วางคำสั่งนี้แล้ว Enter:
   ```js
   const s = await supabaseClient.auth.getSession(); console.log(s.data.session.access_token);
   ```
   (ถ้าตัวแปรไคลเอนต์ในเว็บชื่ออื่นไม่ใช่ `supabaseClient` ให้บอก AI แชทถัดไปมาช่วยหาชื่อตัวแปรที่ถูกต้องจาก
   `js/core/auth-widget.js` หรือ `shared.js` ก่อน) → คัดลอกค่าที่พิมพ์ออกมา (เป็นตัวอักษรยาวๆ ขึ้นต้น `eyJ`)

**ยิงคำขอทดสอบจริง (เปิด Terminal อีกแท็บ หรือใช้ Postman ก็ได้):**

5. แทนค่า `<access_token>` และ `<anon_key>` ด้วยค่าที่คัดลอกมา แล้วรันคำสั่งนี้:
   ```
   curl -i -X POST https://qzkxlhpcputsvbqmtqfi.supabase.co/functions/v1/account-unlink \
     -H "Authorization: Bearer <access_token>" \
     -H "apikey: <anon_key>" \
     -H "Content-Type: application/json" \
     -d '{"provider":"google"}'
   ```
   (เปลี่ยน `"provider":"google"` เป็นช่องทางอื่นที่บัญชีทดสอบมีจริงได้ เช่น `"line"` หรือ `"facebook"`)
6. **ผลที่ต้องเห็นถึงจะถือว่าผ่าน:** ได้ HTTP 200 กับ body `{"ok":true,"unlinked":true,...}` — แล้วเปิด
   Supabase Dashboard → Authentication → Users → คลิกบัญชีทดสอบนั้น → ต้องเห็นว่าช่องทางที่ถอดหายไปจริง
   (เหลือแค่ช่องทางที่เหลือ)
7. **ทดสอบด่านสำคัญด้วย (ห้ามข้าม):** ถอดจนเหลือช่องทางเดียว แล้วลองยิงคำสั่งเดิมถอดช่องทางสุดท้ายอีกครั้ง
   → ต้องได้ **HTTP 409** กับ `{"error":"would_leave_zero_login_methods",...}` (ไม่ใช่ 200) — ถ้าได้ 200
   แปลว่าด่านหลักพัง **ห้าม deploy ต่อ ห้ามปล่อยให้ผู้เล่นจริงใช้** ต้องแจ้ง AI แชทถัดไปทันที
8. ถ้าผ่านครบทั้งข้อ 6 และ 7 → `account-unlink` deploy เสร็จสมบูรณ์แล้ว (deploy ไปแล้วตั้งแต่ข้อ 1) พร้อม
   ใช้งานจริง เหลือแค่รอทีมสร้างปุ่ม UI มาต่อ (คนละงานแยกตามที่บันทึกไว้ท้ายไฟล์โค้ด)

**สรุปสิ่งที่ต้องส่งกลับให้ AI แชทถัดไป (เพื่อปิดงานในเอกสารนี้):** ผล B.5a (แถว SQL ที่ได้) + ผล B.5b
(ผ่าน/ไม่ผ่านข้อ 6 และ 7) — AI จะอัปเดตหัวข้อ 3/10/11 ของเอกสารนี้ให้เป็น "ปิดงาน" ตามผลจริง

</details>

---

### C. เลือกผู้ให้บริการอีเมล transactional (Resend / Postmark / SendGrid) — Lin ต้องตัดสินใจ + ทำเอง

ตารางเปรียบเทียบเต็มอยู่ท้ายไฟล์ `supabase/functions/send-transactional-email/index.ts` (บรรทัด 240-257)
สรุปให้เข้าใจง่าย:

| ผู้ให้บริการ | จุดเด่น | เหมาะกับเว็บนี้ไหม |
|---|---|---|
| **Resend** | ใช้ง่ายที่สุด (โค้ดตัวอย่างในไฟล์เขียนไว้ให้แล้ว ไม่ต้องแก้อะไรเพิ่มถ้าเลือกตัวนี้) มี free tier | ✅ ถ้าอยากเริ่มเร็วที่สุด ไม่อยากยุ่งกับการตั้งค่าเยอะ |
| **Postmark** | ขึ้นชื่อเรื่องอีเมลไม่ตกถังขยะ (deliverability ดีมาก) แยกโควตา transactional/marketing ให้เองในตัว ตรงกับกฎที่ Lin สั่งว่า "ห้ามมี marketing email" อยู่แล้ว | ✅ ถ้าอยากชัวร์ที่สุดว่าอีเมลลูกค้าไม่หาย |
| **SendGrid** | ผู้เล่นใหญ่/เก่าแก่สุด มี free tier แต่ตั้งค่ายุ่งกว่า 2 ตัวบน | ⚠️ เลือกได้ถ้าคุ้นเคยอยู่แล้ว ไม่ใช่ตัวแนะนำอันดับแรก |

**คำแนะนำ (ไม่ใช่การตัดสินใจแทน — Lin เลือกเองได้):** ถ้าไม่มีเหตุผลพิเศษ **Resend** เร็วสุดเพราะโค้ดพร้อม
อยู่แล้ว ถ้าอยากได้ deliverability สูงสุดสำหรับอีเมลสำคัญแบบ "แจ้งลบบัญชี" (พลาดแล้วนักเรียนไม่รู้ว่าบัญชี
กำลังจะถูกลบ) **Postmark** ปลอดภัยกว่าในระยะยาว

**ขั้นตอนที่ Lin ต้องทำเอง (AI ห้ามทำแทนตามกฎ — เลือก 1 ใน 3 แล้วทำตามนี้):**

1. สมัครบัญชีที่เว็บของผู้ให้บริการที่เลือก (resend.com / postmarkapp.com / sendgrid.com) ด้วยอีเมล
   `mr.taihualin@gmail.com`
2. Verify โดเมนส่งเมล `mrtaihualin.com` — แต่ละที่จะให้ Lin เพิ่ม DNS record (TXT/CNAME) เข้าไปที่จุด
   จัดการ DNS ของโดเมน (ที่ไหนก็ตามที่ Lin จดโดเมน mrtaihualin.com ไว้) ขั้นตอนละเอียดแต่ละที่มีคู่มือของ
   ตัวเองในหน้าเว็บหลัง login (ค้นหา "Domain verification" หรือ "Sending domain" ในเมนู)
3. สร้าง API key ในหน้าเว็บของผู้ให้บริการ (มักอยู่ในเมนู "API Keys")
4. เปิด Terminal → `cd /Users/taihualin/Developer/mrtaihualin.github.io` → ตั้งค่าลับด้วยคำสั่งนี้
   (แทน `<API_KEY>` ด้วยค่าที่คัดลอกมา — **ห้ามพิมพ์ค่านี้ไว้ในไฟล์ไหนใน repo เด็ดขาด** พิมพ์ในคำสั่ง Terminal
   เท่านั้น):
   ```
   supabase secrets set EMAIL_PROVIDER_API_KEY=<API_KEY>
   ```
5. ถ้าเลือก **Resend**: ไม่ต้องแก้โค้ดอะไรเพิ่ม (ไฟล์เขียนรองรับ Resend ไว้แล้วเป็นค่าเริ่มต้น) ข้ามไปข้อ 6
   ได้เลย
   ถ้าเลือก **Postmark หรือ SendGrid**: ต้องให้ AI แชทถัดไปแก้ฟังก์ชัน `sendViaProvider()` ใน
   `supabase/functions/send-transactional-email/index.ts` (บรรทัด 166-185) ให้ตรงกับรูปแบบ API ของ
   ผู้ให้บริการนั้นก่อน — ส่วนอื่นทั้งไฟล์ไม่ต้องแก้ (ออกแบบให้สลับ provider จุดเดียวแล้ว)
6. Deploy ฟังก์ชัน:
   ```
   supabase functions deploy send-transactional-email
   ```
7. ทดสอบส่งจริง 1 ฉบับไปหาตัวเอง — วิธีง่ายที่สุดคือรอถึงหัวข้อ D ด้านล่าง (ขั้นตอน 9 ของ Full Account
   Deletion Test จะทดสอบให้ครบทั้ง 3 ฉบับพร้อมกันอยู่แล้ว) ไม่ต้องทดสอบแยกก่อนก็ได้

**✅ เสร็จแล้ว 2026-08-09 — Lin เลือก Resend** โดเมน `mrtaihualin.com` verify แล้ว (region Tokyo) · สร้าง
API key ใหม่เฉพาะงานนี้ + ตั้ง secret `EMAIL_PROVIDER_API_KEY` แล้ว · deploy `send-transactional-email` แล้ว

**บั๊กที่เจอระหว่างทดสอบ (แก้แล้ว):** ฟังก์ชันเช็คสิทธิ์ผู้เรียกด้วยการถอดรหัส JWT (`decodeJwtPayloadUnsafe`)
แต่ Supabase เปลี่ยนรูปแบบ key ใหม่เป็น `sb_secret_...` ซึ่งไม่ใช่ JWT แล้ว → ถอดรหัสไม่ได้ ฟังก์ชันเลยตอบ
"forbidden" ทั้งที่ใช้ key ถูกต้อง · แก้โดยเพิ่ม `isServiceRoleCaller()` เทียบค่าตรงกับ `SUPABASE_SERVICE_ROLE_KEY`
ก่อน แล้วค่อย fallback ไปถอดรหัส JWT แบบเดิม (รองรับทั้ง key รูปแบบเก่า+ใหม่) — Lin อนุมัติให้แก้แล้ว (ทำเลย)

**ผลทดสอบจริง 2026-08-09:** ยิง curl ด้วย secret key ใหม่ → ได้ `HTTP 200`
`{"ok":true,"template":"account_deletion_requested","provider":"resend","provider_message_id":"aab88b15-38fe-478c-a9cf-17959991bde9"}`
อีเมลเข้ากล่องจริงที่ mr.taihualin@gmail.com เนื้อหาถูกต้องครบ (แบรนด์/วันที่ พ.ศ./ข้อความ)

---

### D. Full Account Deletion Test — นำทำทีละขั้นตามเช็กลิสต์ `docs/ACCOUNT_DELETION_PRE_DEPLOY_CHECKLIST.md`

> 🔴 **กฎเหล็กซ้ำอีกครั้ง:** ใช้บัญชีทดสอบเท่านั้น ห้ามใช้บัญชีนักเรียนจริงเด็ดขาด — ขั้นตอนด้านล่างจะ
> "ลบบัญชีทดสอบถาวรจริง กู้คืนไม่ได้" เป็นส่วนหนึ่งของการทดสอบ

**ลำดับที่ปลอดภัยที่สุด (ต่างจากลำดับดิบในไฟล์ checklist เล็กน้อย — จัดกลุ่มให้ทำเป็นชุดไม่สลับไปมา):**

#### ขั้นที่ 1 — เตรียมฐานข้อมูล + deploy ฟังก์ชัน (ทำครั้งเดียว)

1. เปิด Supabase SQL Editor → เปิดไฟล์ `supabase/sql/2026-08-08_account_deletion_cooldown.sql` ในเครื่อง
   → คัดลอกเฉพาะหัวข้อ **[A]** (สร้างตาราง) → วางรัน → ตรวจว่าไม่มี error
2. คัดลอกเฉพาะหัวข้อ **[B]** (ขยาย CHECK constraint) → วางรัน → ตรวจว่าไม่มี error
   ⚠️ **ยังไม่ต้องรันหัวข้อ [C] ตอนนี้** (ตั้ง pg_cron ให้รันอัตโนมัติทุกวัน) — รอให้ทดสอบผ่านครบก่อนค่อยรัน
   ทีหลัง กันไม่ให้ cron อัตโนมัติมาแทรกกลางการทดสอบมือ
3. Terminal → `cd /Users/taihualin/Developer/mrtaihualin.github.io` → deploy 2 ฟังก์ชัน:
   ```
   supabase functions deploy account-delete
   supabase functions deploy account-delete-cron
   ```
4. ตรวจ Dashboard → Edge Functions ว่าเห็นทั้ง 2 ชื่อขึ้นแล้ว

#### ขั้นที่ 2 — เตรียมบัญชีทดสอบ + หา access token (แบบเดียวกับหัวข้อ B.5b ด้านบน)

5. ล็อกอินเว็บด้วย **บัญชีทดสอบใหม่** (ไม่ใช่บัญชีที่ใช้ทดสอบ unlink ไปแล้วก็ได้ ใช้ซ้ำได้ถ้าสะดวก)
6. หา access token ด้วยวิธีเดียวกับหัวข้อ B.5b ข้อ 4 (เปิด F12 → Console → `getSession()`)

#### ขั้นที่ 3 — ทำตามเช็กลิสต์ข้อ 1-8 ของ `ACCOUNT_DELETION_PRE_DEPLOY_CHECKLIST.md`

7. **ข้อ 1 (Request):** ยิง curl (แทนค่า token/anon key เหมือนหัวข้อ B):
   ```
   curl -i -X POST https://qzkxlhpcputsvbqmtqfi.supabase.co/functions/v1/account-delete \
     -H "Authorization: Bearer <access_token>" \
     -H "apikey: <anon_key>" \
     -H "Content-Type: application/json" \
     -d '{"action":"request","confirm":true}'
   ```
   ตรวจว่าได้ `ok:true, requested:true, scheduled_delete_at` กลับมา + ไปดูใน SQL Editor:
   ```sql
   select * from public.account_deletion_requests order by id desc limit 5;
   ```
   ต้องเห็นแถวใหม่ `status='pending'`
8. **ข้อ 2 (ตรวจ pending state):** เว็บยังไม่มี UI ให้กด (ยังไม่ push) — ข้ามการเปิดหน้าเว็บดู banner ไปก่อน
   ได้ ถือว่าผ่านจากการเห็นแถว `pending` ในขั้นที่ 7 แล้ว (จะกลับมาตรวจ UI จริงตอน push ฟีเจอร์เต็มรอบหน้า)
9. **ข้อ 3 (Cancel):** ยิง curl action=cancel:
   ```
   curl -i -X POST https://qzkxlhpcputsvbqmtqfi.supabase.co/functions/v1/account-delete \
     -H "Authorization: Bearer <access_token>" \
     -H "apikey: <anon_key>" \
     -H "Content-Type: application/json" \
     -d '{"action":"cancel"}'
   ```
   ตรวจ SQL ว่าแถวเปลี่ยนเป็น `status='cancelled'`, `cancelled_at` ไม่ว่าง + ลองล็อกอิน/เล่นเกมด้วยบัญชี
   ทดสอบนี้ต่อ → ต้องใช้งานได้ปกติ
10. **ข้อ 4 (Request ใหม่):** ยิง curl action=request ซ้ำเหมือนข้อ 7 → ตรวจว่ามีแถว `pending` แถวเดียว
    (ไม่ซ้อนกัน 2 แถว) ด้วย:
    ```sql
    select count(*) from public.account_deletion_requests
    where user_id = '<user_id ของบัญชีทดสอบ>' and status = 'pending';
    ```
    ต้องได้ 1
11. **ข้อ 5 (ปรับเวลาด้วยมือ — 🔴 ตรวจ user_id ให้ตรงก่อนกด Run ทุกครั้ง):**
    ```sql
    update public.account_deletion_requests
    set scheduled_delete_at = now() - interval '1 hour'
    where user_id = '<uuid ของบัญชีทดสอบเท่านั้น>' and status = 'pending';
    ```
12. **ข้อ 6 (Invoke cron ด้วยมือ):** เปิด Dashboard → Edge Functions → `account-delete-cron` → กดปุ่ม
    "Invoke" (ไม่ต้องใส่ body พิเศษ ปล่อย `{}` ได้) — หรือยิง curl ด้วย service_role key ก็ได้ถ้าถนัดกว่า:
    ```
    curl -i -X POST https://qzkxlhpcputsvbqmtqfi.supabase.co/functions/v1/account-delete-cron \
      -H "Authorization: Bearer <SERVICE_ROLE_KEY>" \
      -H "Content-Type: application/json" -d '{}'
    ```
    (หา SERVICE_ROLE_KEY ที่ Dashboard → Project Settings → API → "service_role" — **เป็นค่าลับสูงสุด
    ห้ามแปะไว้ในไฟล์ไหนเลย ใช้แล้วปิดหน้าต่างทิ้ง**)
13. **ข้อ 7 (ตรวจ DB/Auth/audit log ให้ครบ):**
    - `select * from public.account_deletion_requests where user_id='<user_id>' order by id desc limit 1;`
      → ต้อง `status='completed'`, `completed_at` ไม่ว่าง, `contact_email_snapshot` มีค่า
    - Dashboard → Authentication → Users → ค้นหาอีเมล/LINE ของบัญชีทดสอบ → **ต้องหาไม่เจอแล้ว**
    - `select * from public.account_audit_log where user_id='<user_id>' order by created_at;` → ต้องเห็น
      `account_deletion_requested` (2 ครั้งจากข้อ 7+10), `account_deletion_cancelled` (จากข้อ 9),
      `account_deletion` (`actor_type='system'`)
    - ตรวจ `game_accounts`/`profiles` ของ user_id นี้ → ต้องหาไม่เจอแล้วเช่นกัน (ถูกลบไปพร้อมบัญชี)
14. **ข้อ 8 (ลองล็อกอินซ้ำ):** ลองล็อกอินด้วยบัญชีทดสอบเดิมอีกครั้ง (Google/LINE เดิม) → ต้องเข้าเหมือน
    เป็นบัญชีใหม่ทั้งหมด ไม่มีดาว/ประวัติเดิมเหลือ

#### ขั้นที่ 4 — ทดสอบอีเมล (ข้อ 9) — ทำหลังหัวข้อ C เสร็จแล้วเท่านั้น

15. ทำซ้ำขั้นที่ 3 ทั้งหมดอีกรอบด้วยบัญชีทดสอบใหม่ (เพราะบัญชีเดิมถูกลบไปแล้วในข้อ 14) — คราวนี้หลังแต่ละ
    ขั้นให้ไปเช็คอีเมลที่บัญชีทดสอบใช้สมัคร (หรืออีเมลของ Lin เองถ้าทดสอบด้วยบัญชี Google/Email ของตัวเอง)
    - หลังข้อ "request" (7/10) → ต้องได้อีเมล "已收到您的刪除帳號請求"
    - หลังข้อ "cancel" (9) → ต้องได้อีเมล "刪除帳號請求已取消"
    - หลังข้อ "invoke cron" (12) → ต้องได้อีเมล "帳號已永久刪除" (ส่งไปที่อีเมลที่แคชไว้ตอนก่อนลบ)
16. **ทดสอบ failure path (ถ้ามีเวลา ไม่บังคับ 100% แต่แนะนำให้ทำ):** ตั้ง secret เป็นค่าผิดชั่วคราว
    (`supabase secrets set EMAIL_PROVIDER_API_KEY=wrong_value_temp`) → ทำซ้ำรอบ invoke cron อีกครั้งกับ
    บัญชีทดสอบอื่น → ตรวจว่า `status` ยัง `completed` ปกติ (ไม่ rollback) แต่ `completed_email_sent_at`
    เป็น null + `completed_email_attempts` เพิ่มขึ้น → ตั้ง secret กลับเป็นค่าจริง → invoke cron รอบถัดไป
    → ตรวจว่า retry ส่งสำเร็จเอง

#### ขั้นที่ 5 — ปิดงานจริง (ทำหลังทดสอบผ่านครบทุกข้อ)

17. รัน SQL หัวข้อ **[C]** ในไฟล์ `2026-08-08_account_deletion_cooldown.sql` (ตั้ง pg_cron ให้รันอัตโนมัติ
    ทุกวัน 20:00 UTC) — ตอนนี้ค่อยปลอดภัยเพราะไม่มีแถว `pending` ทดสอบค้างอยู่แล้ว (ลบไปหมดในขั้นที่ 3-4)
18. บอก AI แชทถัดไปว่าทดสอบผ่านครบ → ให้ AI อัปเดต `ACCOUNT_DELETION_PRE_DEPLOY_CHECKLIST.md` (ติ๊ก ✅
    ทุกข้อ) + อัปเดตหัวข้อ 3/10 ของเอกสารนี้
19. ถึงตอนนี้ค่อย push `js/core/auth-widget.js` และไฟล์เว็บที่เกี่ยวข้องขึ้น GitHub ผ่าน GitHub Desktop
    (พร้อม commit message ที่ AI เตรียมให้)

**คำถามที่ต้องตอบก่อนเริ่มขั้นที่ 4:** เลือก provider อีเมลแล้วหรือยัง (ดูหัวข้อ C ด้านบน) ถ้ายัง ทำขั้นที่
1-3 (ข้อ 1-14) ก่อนได้เลย ไม่ต้องรอ ข้อ 9/15/16 เท่านั้นที่ต้องรอ provider พร้อม

---

**สรุปคำถามที่ต้องให้ Lin ตอบ/ตัดสินใจก่อนเริ่มหัวข้อนี้ทั้งหมด:**
1. เลือกผู้ให้บริการอีเมลไหน (Resend แนะนำถ้าอยากเริ่มเร็ว / Postmark ถ้าอยากได้ deliverability สูงสุด)
2. พร้อมเจียดเวลาทำ Full Account Deletion Test (ขั้นที่ 1-5 ด้านบน ใช้เวลาประมาณ 30-60 นาทีถ้าไม่ติดปัญหา)
   เมื่อไหร่ — เป็นงานที่ต้องนั่งทำต่อเนื่องเป็นชุด ไม่ควรทำครึ่งๆ กลางๆ แล้วปล่อยค้าง (มีคำขอลบทดสอบค้างใน
   ระบบระหว่างนั้น)
