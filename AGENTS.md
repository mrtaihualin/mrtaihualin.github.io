# AGENTS.md — Repository Rules for mrtaihualin.com

> Applies to: `/Users/taihualin/Developer/mrtaihualin.github.io/`
> Role: repository-specific safety and technical exceptions only
> Global workflow authority: `/Users/taihualin/Documents/Claude/Projects/AGENTS.md`
> Repository router: `/Users/taihualin/Developer/mrtaihualin.github.io/00_START_HERE.md`

## Authority Boundary

- Startup Gate, Minimal Read, Delta-first, ownership/collision, parallel work, Git safety, verification, central update, closeout และ Document Placement ใช้ `Projects/AGENTS.md` เท่านั้น
- ก่อนงานใน repo ให้ยืนยันว่า Context มีไฟล์นี้, repo router และ global authority แล้ว จากนั้น route ตาม repo router ไป Current task authority
- ตั้งแต่ 2026-08-14 งาน implementation ของ `mrtaihualin.com` ใช้ Codex เป็น executing agent; คง Claude routing compatibility แต่ไม่ส่ง implementation task ให้ Claude เว้นแต่ Lin เปลี่ยน global authority
- Product Decision, UX, Tier, Product Pending และ Product NEXT ต้องเข้าผ่าน Website router; Product NEXT ไม่ใช่ implementation authorization
- Main Plan เป็น roadmap-only และ Website Start Here เป็น router-only; ห้ามเขียน implementation status หรือ closeout ลงสองไฟล์นี้

## Repository Scope

เว็บไซต์มีสาม Area:

1. เว็บหานักเรียน
2. ห้องเรียนและหนังสือเรียน
3. เกมทั้งหมด

`shared` เป็น common layer ไม่ใช่ Area ที่สี่

## Repository Safety

- ก่อนย้าย ลบ หรือเปลี่ยนโครงสร้าง ต้องตรวจ dependency และพฤติกรรมเดิมที่เกี่ยวข้อง
- ห้ามใส่ secret, token, service-role key หรือข้อมูลนักเรียนใน source, docs, logs หรือรายงาน; ถ้าพบให้บอกเฉพาะชื่อและตำแหน่ง
- Migration, RLS, key rotation, deploy, Production mutation, LINE message, booking และ external-system mutation ต้องมีคำอนุมัติชัดเจนตาม action
- ห้ามใช้ Git ผ่าน terminal หรือ sandbox ใน repository นี้
- คำว่า `push` สำหรับ repo นี้หมายถึงเตรียมงานและ commit message ให้ Lin ใช้ GitHub Desktop เว้นแต่ Lin เปลี่ยนกฎ repo นี้โดยชัดเจน
- รักษา public HTML URLs และห้ามแก้ vendor files โดยไม่มี dependency ที่พิสูจน์ได้
- ข้อมูลภาษาไทยในเกมต้องมาจาก Lin และต้องให้ Lin ตรวจ 100% ก่อนใช้จริง

## Technical Standard

- ใช้ของเดิมก่อนสร้างของใหม่ และให้แต่ละ feature มีบ้าน/owner ชัดเจน
- แยก UI, logic, data และ tests เมื่อช่วยให้ดูแลง่ายโดยไม่เปลี่ยน behavior
- การย้ายหรือ refactor ที่กระทบ behavior ต้องมี regression guard ก่อน
- Verification ต้องครอบคลุมตามความเสี่ยง รวม normal/error/retry/boundary/permission/external-failure/persistence/recovery เมื่อเกี่ยวข้อง
- ก่อนส่งงานที่แก้ source เว็บไซต์ อย่างน้อยต้องรัน `node scripts/check-site.js` และรายงานสิ่งที่ยังทดสอบไม่ได้
- อ่าน `CLAUDE.md`, `README.md` หรือ `MAINTENANCE.md` เฉพาะส่วนที่ Current task ต้องใช้; ห้ามอ่านซ้ำเมื่อ verified unchanged

## Repository Documentation Boundary

- Audit, Plan, Spec, Status, Recovery และ Handoff ใช้บ้านตาม `Projects/AGENTS.md`; repo ไม่ใช่ default destination
- Technical evidence ของ code/structure ที่เปลี่ยนให้ update `MAINTENANCE.md` เฉพาะ delta
- Phase 1 implementation/verification ให้ update row เดิมใน Phase 1 Plan ที่ Website router ชี้
- งานอื่นให้ update exact Current task authority; ถ้าไม่มี pointer ให้รายงาน `ROUTING_GAP / NOT_AUTHORIZED`
- Deferred repository-dependent work ใช้ exact-path exception `/Users/taihualin/Developer/mrtaihualin.github.io/_แผนงาน/ทำต่อในอนาคต.md` เพียงจุดเดียว
- ห้ามสร้าง roadmap, status, handoff หรือ global workflow authority คู่ขนานใน repo
