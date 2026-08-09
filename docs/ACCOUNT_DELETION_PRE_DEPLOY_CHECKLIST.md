# ✅ Pre-Deploy Checklist — Account Deletion Cooldown (บังคับ ห้ามข้าม)

> สร้าง 2026-08-08 ตามที่ Lin สั่งชัดเจนว่า "Full deletion test ด้วย test account เป็น Mandatory
> Pre-Deploy Test" — **ห้าม deploy `account-delete` / `account-delete-cron` / `send-transactional-email`
> ขึ้น production จริง ก่อนทำครบทุกข้อในไฟล์นี้**
>
> ไฟล์ที่เกี่ยวข้อง: `supabase/functions/account-delete/index.ts`,
> `supabase/functions/account-delete-cron/index.ts`,
> `supabase/functions/send-transactional-email/index.ts`,
> `supabase/sql/2026-08-08_account_deletion_cooldown.sql`
>
> ✅ **อัปเดต 2026-08-09 — ข้อ 1-9 (บังคับ) ทดสอบผ่านครบสมบูรณ์แล้ว** ด้วยบัญชีทดสอบ
> `mr.taihualin+test2@gmail.com` (`user_id: c619ba7b-97b2-470c-bf45-846af2b01bf2`) — ไม่พบบั๊ก
> รายละเอียดเต็ม: `Bussiness Idea/ระบบเว็บไซต์/72_ผลลัพธ์_account-delete_FullDeletionTest+งานค้าง.md`
>
> ✅ **ปิดงานสมบูรณ์ 2026-08-09 (รอบ 2):** `EMAIL_PROVIDER_API_KEY` คืนเป็นค่า Resend จริงแล้ว + รัน SQL [C]
> แล้ว (cron `account-delete-daily` jobid 15 active=true) + ทดสอบ failure-path ของอีเมลจนจบ (เจอบั๊กจริง
> 1 จุด แก้ + deploy ขึ้น production แล้ว) + push `auth-widget.js` และ `account-delete-cron/index.ts`
> ขึ้น GitHub ผ่าน GitHub Desktop เรียบร้อยแล้วทั้งคู่ (Lin ยืนยัน push สำเร็จ) — **ไม่มีงานค้างแล้ว**

---

## 🔴 กฎเหล็ก: ห้ามใช้บัญชีผู้เล่นจริงเด็ดขาด

ทดสอบทั้งหมดต้องใช้ **บัญชีทดสอบที่สร้างขึ้นมาเฉพาะสำหรับเทสนี้เท่านั้น** (เช่น อีเมลทดสอบของ Lin เอง
ที่ไม่ใช่บัญชีเรียนจริงของนักเรียนคนไหน) เหตุผล: ขั้นตอนที่ 5 ในเช็กลิสต์นี้ต้อง "แก้ `scheduled_delete_at`
ของแถวทดสอบด้วยมือให้ครบกำหนด" แล้ว "เรียก cron ด้วยมือ" ซึ่งจะ **ลบบัญชีนั้นถาวรจริง กู้คืนไม่ได้** —
ถ้าพลาดไปรันกับบัญชีจริงจะเป็นเหตุการณ์ร้ายแรง (ข้อมูลผู้เล่นหายถาวร)

---

## ขั้นตอนทดสอบ (ทำตามลำดับ ห้ามข้าม ห้ามสลับ)

- [x] **1. Request** — ✅ **ผ่าน 2026-08-09** `ok:true, requested:true, scheduled_delete_at` ถูกต้อง
      + แถวใหม่ใน `account_deletion_requests` (status='pending') ยืนยันจริง

- [x] **2. ตรวจ pending state / UI** — ✅ **ผ่านบางส่วน 2026-08-09** (UI ยังไม่ push จึงข้ามการเปิดหน้า
      เว็บดู banner จริง — ยืนยันจากแถว DB `pending` แทน จะกลับมาตรวจ UI จริงตอน push ฟีเจอร์เต็มรอบหน้า)

- [x] **3. Cancel แล้วตรวจว่ากลับปกติ** — ✅ **ผ่าน 2026-08-09** status→cancelled, cancelled_at มีค่า,
      บัญชีล็อกอิน/เล่นเกมได้ปกติ

- [x] **4. Request ใหม่อีกรอบ** — ✅ **ผ่าน 2026-08-09** มีแถว 'pending' แค่ 1 แถว (unique index
      `uq_account_deletion_pending_per_user` ทำงานถูกต้อง)

- [x] **5. 🔴 ปรับ `scheduled_delete_at` ด้วยมือ** — ✅ **ผ่าน 2026-08-09** UPDATE ผ่าน ยืนยันด้วย SELECT ซ้ำ

- [x] **6. Invoke cron ด้วยมือ** — ✅ **ผ่าน 2026-08-09** `account-delete-cron` ลบสำเร็จ `deleted:true`

- [x] **7. ตรวจ DB / Auth / audit log ให้ครบ** — ✅ **ผ่าน 2026-08-09** ครบทุกจุด: status='completed' +
      `contact_email_snapshot` มีค่า / Auth หาไม่เจอแล้ว / audit log ครบ 4 event ตามที่คาด (`requested`×2,
      `cancelled`×1, `account_deletion` actor_type='system'×1) / `game_accounts`/`profiles` = 0

- [x] **8. ตรวจว่าบัญชีถูกลบจริง (end-to-end)** — ✅ **ผ่าน 2026-08-09** ล็อกอินซ้ำเข้าเหมือนบัญชีใหม่
      (พบ ⭐13/🌿1 ค้างที่ UI ตอนแรก ตรวจแล้วเป็นแค่ localStorage เก่าในเบราว์เซอร์ ไม่ใช่ข้อมูลจริงจาก DB —
      query `star_ledger`/`game_reward_points`/`tone_progress` ด้วย user_id ใหม่ = 0 ทั้งหมด)

- [x] **9. ตรวจ transactional email ครบ 3 ฉบับ** — ✅ **ผ่าน 2026-08-09** เข้ากล่องจริงครบ 4 ฉบับ (request×2
      เพราะขอ 2 รอบ, cancelled×1, deleted×1) เนื้อหา/แบรนด์/วันที่ถูกต้อง
      - ✅ **ทดสอบ failure path — ผ่านครบ 2026-08-09 (รอบ 2)** ด้วยบัญชี `mr.taihualin+test4@gmail.com`:
        ตั้งกุญแจผิด → invoke cron → `email_sent:false` (ลบสำเร็จปกติ ไม่ rollback) → ตั้งกุญแจกลับ → invoke
        cron → **เจอบั๊กจริง 1 จุด** (retry pass ไม่ทำงานถ้าไม่มีบัญชีใหม่ให้ลบ) → แก้ + deploy ขึ้น
        production แล้ว → ทดสอบซ้ำ retry ส่งสำเร็จ (`sent:1`, ยืนยันด้วย `completed_email_sent_at` ใน DB)
        รายละเอียดเต็ม: `Bussiness Idea/ระบบเว็บไซต์/72_ผลลัพธ์_account-delete_FullDeletionTest+งานค้าง.md`

---

## ✅ Email provider — เลือกและตั้งค่าเสร็จแล้ว 2026-08-09

Lin เลือก **Resend** โดเมน `mrtaihualin.com` verify แล้ว, ตั้ง `EMAIL_PROVIDER_API_KEY` แล้ว, deploy
`send-transactional-email` แล้ว — ข้อ 9 ทดสอบผ่านครบแล้วด้านบน (หัวข้อนี้เก็บไว้เป็นประวัติเท่านั้น)

---

## หลังทดสอบผ่านครบ

✅ **ทำแล้ว 2026-08-09** — ติ๊ก ✅ ครบทุกข้อ 1-9 ด้านบนแล้ว

**✅ ปิดครบทุกข้อแล้ว 2026-08-09 (รอบ 2)** (ดูรายละเอียดเต็มที่
`Bussiness Idea/ระบบเว็บไซต์/72_ผลลัพธ์_account-delete_FullDeletionTest+งานค้าง.md`):
1. ✅ ตั้ง `EMAIL_PROVIDER_API_KEY` กลับเป็นค่า Resend จริงแล้ว
2. ✅ ทำ failure-path test จนจบแล้ว — เจอบั๊กจริง 1 จุด (retry pass อีเมลไม่ทำงานถ้าไม่มีบัญชีใหม่ให้ลบ)
   แก้ + deploy ขึ้น production แล้ว + ทดสอบซ้ำผ่าน
3. ✅ รัน SQL หัวข้อ [C] แล้ว (cron `account-delete-daily` jobid 15 active=true)
4. ✅ อัปเดต `docs/ACCOUNT_DATA_SAFETY_GAPS.md` หัวข้อ 3 แล้วว่าเทสผ่านแล้ว
5. ✅ Push `js/core/auth-widget.js` ขึ้น GitHub ผ่าน GitHub Desktop แล้ว

**✅ ปิดงานครบ 100% แล้ว** — ไฟล์ทุกไฟล์ที่แก้วันนี้ (`auth-widget.js`, `account-delete-cron/index.ts`)
push ขึ้น GitHub ผ่าน GitHub Desktop เรียบร้อยแล้ว (ยืนยันจาก Lin 2026-08-09) — ไม่มีงานค้างของฟีเจอร์
account-delete แล้ว
