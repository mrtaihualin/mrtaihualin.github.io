# ✅ Pre-Deploy Checklist — Account Deletion Cooldown (บังคับ ห้ามข้าม)

> สร้าง 2026-08-08 ตามที่ Lin สั่งชัดเจนว่า "Full deletion test ด้วย test account เป็น Mandatory
> Pre-Deploy Test" — **ห้าม deploy `account-delete` / `account-delete-cron` / `send-transactional-email`
> ขึ้น production จริง ก่อนทำครบทุกข้อในไฟล์นี้**
>
> ไฟล์ที่เกี่ยวข้อง: `supabase/functions/account-delete/index.ts`,
> `supabase/functions/account-delete-cron/index.ts`,
> `supabase/functions/send-transactional-email/index.ts`,
> `supabase/sql/2026-08-08_account_deletion_cooldown.sql`

---

## 🔴 กฎเหล็ก: ห้ามใช้บัญชีผู้เล่นจริงเด็ดขาด

ทดสอบทั้งหมดต้องใช้ **บัญชีทดสอบที่สร้างขึ้นมาเฉพาะสำหรับเทสนี้เท่านั้น** (เช่น อีเมลทดสอบของ Lin เอง
ที่ไม่ใช่บัญชีเรียนจริงของนักเรียนคนไหน) เหตุผล: ขั้นตอนที่ 5 ในเช็กลิสต์นี้ต้อง "แก้ `scheduled_delete_at`
ของแถวทดสอบด้วยมือให้ครบกำหนด" แล้ว "เรียก cron ด้วยมือ" ซึ่งจะ **ลบบัญชีนั้นถาวรจริง กู้คืนไม่ได้** —
ถ้าพลาดไปรันกับบัญชีจริงจะเป็นเหตุการณ์ร้ายแรง (ข้อมูลผู้เล่นหายถาวร)

---

## ขั้นตอนทดสอบ (ทำตามลำดับ ห้ามข้าม ห้ามสลับ)

- [ ] **1. Request** — เรียก `account-delete` action=`request` (confirm:true) ด้วยบัญชีทดสอบ →
      ตรวจว่าได้ `ok:true, requested:true, scheduled_delete_at` กลับมา + มีแถวใหม่ใน
      `account_deletion_requests` (status='pending') จริง

- [ ] **2. ตรวจ pending state / UI** — เปิดหน้าเว็บด้วยบัญชีทดสอบ → เปิด "帳號管理" → ต้องเห็น banner
      "⏳ 帳號已排定刪除" พร้อมวันที่ถูกต้อง + ปุ่ม "取消刪除帳號" (ไม่ใช่ปุ่ม "🗑️ 刪除帳號" ปกติ) —
      ตรวจด้วยว่าข้อความไม่สื่อว่าจะลบ "ตรงวินาทีนั้นเป๊ะ" (ต้องมีคำว่า "例行處理"/"每日執行一次" ปรากฏอยู่)

- [ ] **3. Cancel แล้วตรวจว่ากลับปกติ** — กดปุ่ม "取消刪除帳號" → ตรวจว่า:
      - แถวใน `account_deletion_requests` เปลี่ยนเป็น status='cancelled', cancelled_at ไม่ว่าง
      - UI กลับไปโชว์ปุ่ม "🗑️ 刪除帳號" ปกติ (ไม่ใช่ banner อีกต่อไป)
      - บัญชียังล็อกอินได้ปกติ เล่นเกมได้ปกติ ไม่มีอะไรเปลี่ยนแปลง

- [ ] **4. Request ใหม่อีกรอบ** — ยื่นคำขอลบซ้ำอีกครั้งด้วยบัญชีทดสอบเดิม → ต้องได้แถวใหม่ (หรือแถวเดิม
      ถูกใช้ซ้ำถ้ายังไม่ปิด) status='pending' อีกครั้ง — ตรวจว่าไม่มีแถว 'pending' ซ้อนกัน 2 แถวพร้อมกัน
      (unique index `uq_account_deletion_pending_per_user` ต้องกันไว้ให้)

- [ ] **5. 🔴 ปรับ `scheduled_delete_at` ด้วยมือ (เฉพาะแถวของบัญชีทดสอบเท่านั้น — ตรวจ user_id ให้ตรง
      ก่อนกด Run ทุกครั้ง)**:
      ```sql
      update public.account_deletion_requests
      set scheduled_delete_at = now() - interval '1 hour'
      where user_id = '<uuid ของบัญชีทดสอบเท่านั้น>' and status = 'pending';
      ```

- [ ] **6. Invoke cron ด้วยมือ** — เรียก `account-delete-cron` ตรงๆ 1 ครั้ง (curl/Postman ด้วย
      service_role key หรือกดปุ่ม "Invoke" ใน Supabase Dashboard) — ไม่ต้องรอ pg_cron รอบจริง

- [ ] **7. ตรวจ DB / Auth / audit log ให้ครบ**:
      - `account_deletion_requests`: แถวทดสอบต้องเป็น status='completed', completed_at ไม่ว่าง,
        `contact_email_snapshot` มีค่า (แคชไว้ก่อนลบสำเร็จ)
      - `auth.users` / Supabase Dashboard → Authentication: ต้องหาบัญชีทดสอบนี้ไม่เจอแล้ว
      - `account_audit_log`: ต้องมีแถว event_type='account_deletion_requested' (ตอนขั้น 1/4),
        'account_deletion_cancelled' (ตอนขั้น 3), และ 'account_deletion' (ตอนลบจริงสำเร็จ — actor_type
        ต้องเป็น 'system' ไม่ใช่ 'user' เพราะ cron เป็นคนลบ ไม่ใช่ผู้ใช้กดเอง)
      - ตารางที่ควรลบ/anonymize/cascade (`game_reward_points`, `login_events`, `game_accounts`,
        `profiles` ฯลฯ) — ตรวจว่าข้อมูลของบัญชีทดสอบหายไปตามที่ preview เคยบอกไว้จริง

- [ ] **8. ตรวจว่าบัญชีถูกลบจริง (end-to-end)** — ลองล็อกอินด้วยบัญชีทดสอบเดิมอีกครั้ง (เช่น กด "เข้าสู่
      ระบบด้วย Google" ด้วยอีเมลเดียวกัน) → ต้องเข้าเหมือนเป็นบัญชีใหม่ทั้งหมด (ไม่มีข้อมูลเกม/ดาว/
      ประวัติเดิมหลงเหลือ)

- [ ] **9. ตรวจ transactional email ครบ 3 ฉบับ** (ต้องตั้งค่า email provider เรียบร้อยแล้วก่อนถึงจะ
      ทดสอบข้อนี้ได้ — ดูหัวข้อ "รอ provider" ด้านล่าง):
      - อีเมล "已收到您的刪除帳號請求" ส่งถึงหลังขั้น 1/4
      - อีเมล "刪除帳號請求已取消" ส่งถึงหลังขั้น 3
      - อีเมล "帳號已永久刪除" ส่งถึงหลังขั้น 6 (ใช้ `contact_email_snapshot` ที่แคชไว้ ไม่ใช่ query
        `auth.users` ใหม่ เพราะตอนนั้นบัญชีหายไปแล้ว)
      - **ทดสอบ failure path ด้วย (ถ้าทำได้)**: ลองตั้ง `EMAIL_PROVIDER_API_KEY` เป็นค่าผิดชั่วคราว
        แล้วรัน cron อีกครั้งกับแถวทดสอบอื่น → ตรวจว่า deletion ยัง status='completed' ปกติ (ไม่ rollback)
        แต่ `completed_email_sent_at` เป็น null + `completed_email_attempts` เพิ่มขึ้น → แก้ key กลับให้
        ถูก → รัน cron รอบถัดไป → ตรวจว่า retry pass ส่งสำเร็จเองโดยไม่ต้องยื่นคำขอใหม่

---

## 🚫 รอ Lin ก่อนถึงจะเริ่มข้อ 9 ได้

Email provider (Resend/Postmark/SendGrid) **ยังไม่ได้เลือก** — AI ห้ามเลือก/สมัคร/ตั้ง secret เอง
ตามที่ Lin สั่งไว้ชัดเจน (ดูตารางเทียบ 3 ตัวเลือกท้ายไฟล์ `send-transactional-email/index.ts`)
ข้อ 1-8 ทำได้โดยไม่ต้องรอ provider (ระบบ DB/UI/cron ทำงานได้ครบแม้ยังไม่มีอีเมลจริง — แค่ `email_sent`
จะเป็น false ทุกครั้งเฉยๆ ไม่บล็อกอะไร) — ข้อ 9 ต้องรอ Lin เลือก + ตั้งค่า provider ก่อนเท่านั้น

---

## หลังทดสอบผ่านครบ

อัปเดตไฟล์นี้ (เติม ✅ วันที่/ผลลัพธ์) + อัปเดต `docs/ACCOUNT_DATA_SAFETY_GAPS.md` หัวข้อ 3 ว่าเทสผ่านแล้ว
ก่อนจะขอ Lin กด deploy จริงรอบสุดท้าย
