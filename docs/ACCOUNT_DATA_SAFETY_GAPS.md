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

## 3) Account Deletion — ⚠️ PARTIAL (cooldown 7 วัน — โค้ดพร้อมแล้ว รอ Mandatory Pre-Deploy Test)

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
- 🆕 `supabase/sql/2026-08-08_account_deletion_cooldown.sql` — DRAFT ยังไม่ได้รัน — ตาราง
  `account_deletion_requests` + ขยาย CHECK ของ `account_audit_log` + [C] ตั้ง pg_cron (Vault-based)
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

**🚫 ยังเหลือรอ Lin ก่อน deploy จริง:**
1. **เลือก email provider** (Resend/Postmark/SendGrid) แล้วสมัคร/verify โดเมน/ตั้ง secret เอง — AI ห้ามทำ
2. **ทำ Mandatory Pre-Deploy Test ให้ครบ** ตาม `docs/ACCOUNT_DELETION_PRE_DEPLOY_CHECKLIST.md` (9 ขั้นตอน
   ด้วยบัญชีทดสอบเท่านั้น — ห้ามข้าม ห้ามใช้บัญชีจริง)
3. B.5a (LINE-only synthetic email) — query แรกที่รันไปยังไม่ตอบคำถามได้ (ดูหัวข้อ Unlink ด้านล่าง) รอ Lin
   ทดสอบสมัคร LINE-only จริงแล้ว query ซ้ำ

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

**โค้ดสร้างเสร็จแล้ว รอ Lin ตรวจ+deploy (ยังไม่ deploy สักตัว):**
- `supabase/functions/account-delete/index.ts` — ยื่นคำขอลบบัญชี (cooldown 7 วัน — ไม่ลบทันทีอีกต่อไป ดูข้อ 3)
- 🆕 `supabase/functions/account-delete-cron/index.ts` — ลบถาวรจริงเมื่อครบกำหนด (รันทุกวัน)
- 🆕 `supabase/functions/send-transactional-email/index.ts` — ส่งอีเมล 3 จุดของ flow ลบบัญชี (รอเลือก provider)
- `supabase/functions/account-export/index.ts` — export ข้อมูลตัวเอง
- `supabase/functions/account-unlink/index.ts` — ถอดช่องทางล็อกอิน (กันเหลือ 0 ช่องทาง)
- ต่อ UI ครบแล้วใน `js/core/auth-widget.js` (ปุ่มอยู่ในหน้าต่าง "帳號管理" ใหม่) — logout ทุกอุปกรณ์ใช้งานได้ทันทีที่ push (ไม่ต้อง deploy) ส่วนปุ่มอื่นต้อง deploy Edge Function ก่อน

**SQL draft 4 ไฟล์ (ยังไม่ได้รันสักไฟล์ รอ Lin สั่ง):**
- `supabase/sql/2026-08-08_anon_spam_protection.sql` — กันสแปม `anon_game_events`/`leads` — กระทบ 0% (ไม่มีโค้ดฝั่งเว็บเขียนเข้า 2 ตารางนี้เลยตอนนี้)
- `supabase/sql/2026-08-08_drop_duplicate_tone_sessions_policy.sql` — ลบ policy ซ้ำของ `tone_sessions` — กระทบ 0% ⚠️ ต้องสำรอง DB ก่อนรันตามที่ Lin ขอ
- `supabase/sql/2026-08-08_leaderboard_score_bounds.sql` — อุดช่องโหว่คะแนนปลอมกระดานผู้นำ — **กระทบจริง** (เกมเขียนคะแนนเข้า 2 ตารางนี้ทุกวัน) **สถานะ: รอ Lin รัน `[PRECHECK]` (read-only 3 query) เองก่อน** ยังไม่อนุมัติให้รันส่วนที่แก้จริง
- 🆕 `supabase/sql/2026-08-08_account_deletion_cooldown.sql` — ตาราง `account_deletion_requests` + ขยาย CHECK ของ `account_audit_log` + ตั้ง pg_cron — **กระทบเมื่อ deploy** (ฟีเจอร์ใหม่ ยังไม่มีใครใช้อยู่ก่อน ไม่กระทบของเดิม) รอ Mandatory Pre-Deploy Test ก่อน (ดู `docs/ACCOUNT_DELETION_PRE_DEPLOY_CHECKLIST.md`)

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
3. **ตรวจโค้ด 5 Edge Function แล้ว deploy** (account-delete/account-delete-cron/send-transactional-email/account-export/account-unlink) — 🔴 account-delete* ต้องทำ Mandatory Pre-Deploy Test ให้ครบก่อน (ดู `docs/ACCOUNT_DELETION_PRE_DEPLOY_CHECKLIST.md`)
4. **เลือก email provider** (Resend/Postmark/SendGrid) — AI ห้ามเลือก/สมัคร/ตั้ง secret เอง (ตารางเทียบอยู่ท้าย `send-transactional-email/index.ts`)
5. **account-unlink:** ยังเหลือ 2 จุด 🔴 ที่โค้ดยอมรับเองว่ายังไม่เคยทดสอบกับของจริง — (ก) query B.5a ที่ Lin รันไปแล้วยังไม่ตอบคำถามได้ (แถวเดียวที่เจอไม่ใช่ LINE-only จริง) ต้องทดสอบสมัคร LINE-only ใหม่แล้ว query ซ้ำ (ข) ยังไม่เคยยิง GoTrue REST endpoint จริงทดสอบเลย ต้องทดสอบกับบัญชีทดสอบก่อน deploy — ✅ **fresh JWT เพิ่มไปแล้วจริงในโค้ด (ไม่ใช่คำถามเปิดอีกต่อไป)**
6. Cookie consent banner — ยังไม่ทำตามที่ Lin สั่ง รอผลตรวจ (ส่งไปแล้วรอบก่อน — GA4 87 หน้า/Clarity 79 หน้า/พบวิดีโอ YouTube โหมดตั้งคุกกี้ 4 จุดเพิ่ม)
7. ตัวเลือกเสริม (ไม่เร่งด่วน): ตั้งอายุ JWT/refresh token ให้สั้นลง, แจ้งเตือน LINE ทุกวันที่ backup สำเร็จ, เพิ่มกฎ staging/peer-review ให้ migration, ย้าย 3 ไฟล์ cron ที่ยืนยันว่าเลิกใช้เข้าโฟลเดอร์ห้ามรัน

**🚫 นอกขอบเขตงานนี้โดยตั้งใจ (ไม่แตะ):** Payment/billing setup, อัตราค่าธรรมเนียม ECPay/NewebPay, ภาษีส่งออกฮ่องกง, `payout_ledger`
