# Repo Start Here — mrtaihualin.com

> สถานะ: Current pointer index · **REPO CLEANUP = CLOSED**
> อัปเดต: 2026-08-14 Document Placement Phase 1
> หน้าที่: บอกทางไปข้อมูลปัจจุบันเท่านั้น ห้ามคัดลอกสถานะยาวมาเก็บซ้ำในไฟล์นี้

## Current Source of Truth

- จุดเริ่มต้นรวมทุกโปรเจกต์: `/Users/taihualin/Documents/Claude/Projects/00_START_HERE.md`
- Shared Rules canonical + Startup Gate สำหรับ Claude/Codex: `/Users/taihualin/Documents/Claude/Projects/AGENTS.md`
- Executing agent สำหรับงานต่อของ `mrtaihualin.com`: **Codex เท่านั้น**; Claude คง routing compatibility แต่ไม่รับ implementation task
- สถานะและงาน Active ของเว็บไซต์: `/Users/taihualin/Documents/Claude/Projects/01_WEBSITE/00_ศูนย์บัญชาการ_START-HERE.md`
- แผนงานหลัก: `/Users/taihualin/Documents/Claude/Projects/01_WEBSITE/03_แผนงานหลัก_จากจัดระบบถึงเปิดขายเกม_CURRENT.md`
- กฎการทำงานใน repo: `/Users/taihualin/Developer/mrtaihualin.github.io/AGENTS.md`
- หลักฐานการเปลี่ยนโค้ด/โครงสร้างล่าสุด: `/Users/taihualin/Developer/mrtaihualin.github.io/MAINTENANCE.md`

## Active Work

- อ่านรายการ Active ล่าสุดจากศูนย์บัญชาการและแผนงานหลักด้านบน ห้ามใช้ Handoff หรือ Backup แทน Current Source.
- งานที่พักไว้หรือทำภายหลังอยู่ที่ `/Users/taihualin/Developer/mrtaihualin.github.io/_แผนงาน/ทำต่อในอนาคต.md` เพียงที่เดียว.
- `GAME_REWARD_AUTH` ยังเป็น `ACTIVE / NOT IMPLEMENTED OR VERIFIED`; operational plan อยู่ที่ `/Users/taihualin/Documents/Claude/Projects/_AI_SYSTEM/PLANS/website/2026-08-13_1857_PLAN_GAME_REWARD_AUTH_CURRENT.md`.

## Closed / Historical

- สถานะ `CLOSED` ล่าสุดดูที่ `/Users/taihualin/Documents/Claude/Projects/00_START_HERE.md` และหลักฐานงานเว็บดูที่ `MAINTENANCE.md`.
- ตำแหน่งสุดท้ายของ Closed History / One-Time ยัง `NEED LIN DECISION`; ให้ตาม policy canonical ใน `/Users/taihualin/Documents/Claude/Projects/AGENTS.md` และห้ามย้าย/เปลี่ยน policy เอง.
- Repo Cleanup closeout: `/Users/taihualin/Documents/Claude/Projects/_AI_SYSTEM/STATUS/2026-08-13_1941_REPO_CLEANUP_FINAL_CLOSEOUT.md`.

## ห้ามแตะโดยไม่มีคำสั่งเฉพาะจาก Lin

- ใช้ข้อห้ามและ Safety Rules ใน `AGENTS.md` เป็นหลัก โดยเฉพาะ runtime, secret, SQL/migration, production, deploy และ Git write operations.
- รายการ SQL หรือไฟล์ path-sensitive ที่ถูกพัก/ล็อกไว้ ให้ตรวจ Decision ใน `_แผนงาน/ทำต่อในอนาคต.md` ก่อนเสมอ ห้ามย้าย ลบ rename หรือรันจากชื่อไฟล์เพียงอย่างเดียว.

## Intentionally Deferred — ไม่ใช่ Cleanup blocker

- `supabase/sql/เลิกใช้แล้ว_ห้ามรัน/`: 13 ไฟล์ = `KEEP IN PLACE FOR NOW`; 3 TEST = `REVIEW_LATER` — ห้ามย้าย ลบ rename รัน หรือสร้างงานแก้ references ใหม่.
- `_staging-build/`, `.fuse_hidden*`, `.DS_Store` และโฟลเดอร์ว่าง: คง Decision เดิม ไม่เปิดเป็น Cleanup item ใหม่.
- งาน Product/Feature/Performance และ `P7-02` ที่พักไว้ ให้ตาม Current sources/`_แผนงาน/ทำต่อในอนาคต.md`; ไม่ใช่งาน Repo Cleanup.

## Next Action

- Document Placement Phase 1 = `CLOSED / PASS` เมื่อ 2026-08-14; Phase 2 Repo Cleanup และ move candidates ทั้งหมดเป็นงานแยกที่ยัง `PARKED / NOT AUTHORIZED`.
