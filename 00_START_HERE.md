# Repo Start Here — mrtaihualin.com

> สถานะ: Current pointer index · **REPO CLEANUP = CLOSED**
> อัปเดต: 2026-08-15 09:11 P1-F-05/F-06 Production pre-consent cookie FAIL; GA bootstrap hotfix local PASS, manual fresh-local cookie verify requiredก่อน deploy
> หน้าที่: บอกทางไปข้อมูลปัจจุบันเท่านั้น ห้ามคัดลอกสถานะยาวมาเก็บซ้ำในไฟล์นี้

## Current Source of Truth

- จุดเริ่มต้นรวมทุกโปรเจกต์: Codex global router → Projects canonical router (local-only resolution)
- Shared Rules canonical + Startup Gate สำหรับ Claude/Codex: Projects canonical global workflow authority ซึ่ง Codex global router resolve ให้
- Executing agent สำหรับงานต่อของ `mrtaihualin.com`: **Codex เท่านั้น**; Claude คง routing compatibility แต่ไม่รับ implementation task
- สถานะและงาน Active ของเว็บไซต์: Projects canonical router → Website canonical router
- Product Decision ปัจจุบัน: Website canonical router → Current Product Source
- แผนงานหลัก: Website canonical router → Website roadmap
- Phase 1 Guest Free + Login Free: Website canonical router ต้อง resolve ทั้ง Current Master Plan และ Current Checklist; ห้าม hardcode local absolute path ใน tracked repo
- กฎการทำงานใน repo: `AGENTS.md`
- หลักฐานการเปลี่ยนโค้ด/โครงสร้างล่าสุด: `MAINTENANCE.md`

## Active Work

- อ่านรายการ Active ล่าสุดจากศูนย์บัญชาการและแผนงานหลักด้านบน ห้ามใช้ Handoff หรือ Backup แทน Current Source.
- งานที่พักไว้หรือทำภายหลังอยู่ที่ `_แผนงาน/ทำต่อในอนาคต.md` เพียงที่เดียว.
- `GAME_REWARD_AUTH` เป็น `PARKED / PAID FUTURE / NOT PHASE 1`; ไม่ใช่ Phase 1 blocker. ใช้ Website canonical router เพื่อ resolve Paid/Future plan เมื่อ Lin เปิด phase.

## Closed / Historical

- สถานะ `CLOSED` ล่าสุด resolve ผ่าน Projects canonical router และหลักฐานงานเว็บดูที่ `MAINTENANCE.md`.
- ตำแหน่งสุดท้ายของ Closed History / One-Time ยัง `NEED LIN DECISION`; ให้ตาม Projects canonical global workflow authority และห้ามย้าย/เปลี่ยน policy เอง.
- Repo Cleanup closeout: resolve exact evidence pointer ผ่าน Website canonical router; ห้าม hardcode local path ใน tracked repo.

## ห้ามแตะโดยไม่มีคำสั่งเฉพาะจาก Lin

- ใช้ข้อห้ามและ Safety Rules ใน `AGENTS.md` เป็นหลัก โดยเฉพาะ runtime, secret, SQL/migration, production และ deploy; Git handoff route ผ่าน Projects canonical global workflow authority.
- รายการ SQL หรือไฟล์ path-sensitive ที่ถูกพัก/ล็อกไว้ ให้ตรวจ Decision ใน `_แผนงาน/ทำต่อในอนาคต.md` ก่อนเสมอ ห้ามย้าย ลบ rename หรือรันจากชื่อไฟล์เพียงอย่างเดียว.

## Intentionally Deferred — ไม่ใช่ Cleanup blocker

- `supabase/sql/เลิกใช้แล้ว_ห้ามรัน/`: 13 ไฟล์ = `KEEP IN PLACE FOR NOW`; 3 TEST = `REVIEW_LATER` — ห้ามย้าย ลบ rename รัน หรือสร้างงานแก้ references ใหม่.
- `_staging-build/`, `.fuse_hidden*`, `.DS_Store` และโฟลเดอร์ว่าง: คง Decision เดิม ไม่เปิดเป็น Cleanup item ใหม่.
- งาน Product/Feature/Performance และ `P7-02` ที่พักไว้ ให้ตาม Current sources/`_แผนงาน/ทำต่อในอนาคต.md`; ไม่ใช่งาน Repo Cleanup.

## Next Action

- `P1-F-05/F-06` local GA bootstrap hotfixผ่าน static/fresh-origin orderแล้ว. งานถัดไปคือ manual fresh-local `_ga*`=0; ห้าม deployจนกว่าจะผ่าน แล้วจึง reverify Productionก่อน `P1-G-01`.
- Document Placement Phase 1 = `CLOSED / PASS` เมื่อ 2026-08-14; Phase 2 Repo Cleanup และ move candidates ทั้งหมดเป็นงานแยกที่ยัง `PARKED / NOT AUTHORIZED`.
- Latest game closeout: resolve exact evidence pointer ผ่าน Website canonical router (`PASS_LOCAL / PRODUCTION_VERIFY_NEEDED`; Lego deferred).
