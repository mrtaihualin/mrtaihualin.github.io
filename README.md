# mrtaihualin.com

เว็บไซต์แบบ static ของ **泰華眼裡的泰語教學** เผยแพร่ผ่าน GitHub Pages ที่ `mrtaihualin.com`

ประวัติงานจัดระบบและผลตรวจล่าสุดอยู่ใน [MAINTENANCE.md](MAINTENANCE.md)

กฎเฉพาะ repository อยู่ใน [AGENTS.md](AGENTS.md); Product, Phase, Master Plan และ Current Checklist ให้ route จาก `/Users/taihualin/Documents/Claude/Projects/01_WEBSITE/00_ศูนย์บัญชาการ_START-HERE.md`

## โครงสร้างหลัก

| ตำแหน่ง | หน้าที่ |
| --- | --- |
| `*.html` | หน้าเว็บที่ URL ระดับหลักใช้งานโดยตรง ห้ามย้ายโดยไม่ทำ redirect |
| `assets/` | รูป ไอคอน PDF และเสียง |
| `blog/`, `en/` | หน้าบทความและหน้าภาษาอังกฤษ |
| `classroom/` | หน้าระบบห้องเรียนและ CSS เฉพาะระบบ |
| `css/` | CSS ส่วนกลางของเว็บ |
| `data/` | คลังคำ/ประโยคจริง (`words-data.js`, `adv-sentences.js`, `tone-engine.js` ฯลฯ) + หน้าแอดมิน 2 หน้า (ตั้งใจไม่ย้าย — ผูกโดเมนจริง ดู `data/game-content-tester.html`, `data/review-tool.html`) |
| `data/tools/` | ตัวตรวจ/ตัวทดสอบข้อมูลเกม (`check-data-health.js`, `tests-*.js`, `regression-check-tone.js` ฯลฯ) — ย้ายออกจาก `data/` แล้ว 2026-08-08 |
| `data/reports/` | รายงาน/เอกสารที่ตัวตรวจสร้างหรือใช้ (`tone-regression-report.json`, `game-behavioral-checklist-manual.md`) — ย้ายออกจาก `data/` แล้ว 2026-08-08 |
| `js/core/` | ระบบกลาง เช่น auth, shared UI และ Supabase |
| `js/classroom/` | logic ระบบห้องเรียน |
| `js/acquisition/` | ข้อมูลเนื้อหาที่แสดงบนหน้าเว็บ |
| `js/games/` | logic ของเกมทั้งหมด |
| `js/score/` | คะแนน ความคืบหน้า และ leaderboard |
| `js/vendor/` | library ภายนอก ห้ามจัดรูปแบบหรือแก้โดยไม่จำเป็น |
| `scripts/` | เครื่องมือดูแลและตรวจโปรเจกต์ ไม่ถูกโหลดบนหน้าเว็บ |
| `supabase/` | Edge Functions และ SQL สำหรับ backend |
| `textbook/` | หน้าและ script ของหนังสือเรียนออนไลน์ |

โฟลเดอร์ `_dev/`, `_แผนงาน/` และ `_บทความ-เตรียมเขียน/` เป็นไฟล์ภายในเครื่องและถูกกันออกจาก Git

## ตรวจในเครื่อง

ต้องมี Node.js แล้วรัน:

```bash
node scripts/check-site.js
```

คำสั่งนี้ตรวจ syntax ของ JavaScript, ลิงก์ไฟล์ภายใน HTML/CSS, ID ซ้ำ และชุดทดสอบข้อมูล โดยไม่แก้ไฟล์และไม่ deploy

## Automation enforcement

- GitHub Actions `Required checks / required-tests-and-write-set` รัน `node scripts/check-site.js` อัตโนมัติบน Pull Request, `main`, merge queue และ manual run
- Pull Request ต้องระบุ `Task-ID` และ `Write-Set` ใน template; รองรับ exact path หรือ `directory/**` และ check จะ fail หากมีไฟล์นอกขอบเขตปน
- ก่อน commit ในเครื่อง ให้คัดลอก `.task-write-set.example.json` เป็น `.task-write-set.json`, ใส่ Task/write-set จริง และเปิดใช้ tracked hook ที่ `.githooks/pre-commit`
- การบล็อก merge/direct push ต้องตั้ง GitHub ruleset ให้ `main` รับการเปลี่ยนผ่าน Pull Request เท่านั้น, ห้าม bypass และ require check ชื่อข้างต้น; source ใน repo ไม่สามารถเปิด ruleset ของ remote แทน owner ได้
- หนึ่ง Task ใช้หนึ่ง `codex/*` branch และแยก worktree เมื่อทำพร้อมกัน; independent branches เตรียม/push คู่ขนานได้ และ MAIN serialize เฉพาะ collision/integration/default-branch merge. เมื่อ exact-head required check ผ่านและเทียบกับ `main` ล่าสุดแล้ว ให้ใช้ canonical LOW/MEDIUM/HIGH gate: authorized LOW-risk merge ทำต่อและ verify ได้เอง; หยุดขอ Lin เฉพาะ exact gate ที่ Current authority กำหนด
- Rollback ใช้ revert PR/commit ผ่าน task branch ใหม่และ required check เดิม ห้าม force-push หรือ rewrite `main`

### แต่ละตัวตรวจอะไร · ไม่ผ่านแปลว่าอะไร

`check-site.js` เป็นตัวรวม — เรียกตัวตรวจย่อยด้านล่างให้ทั้งหมด (รันแยกทีละตัวก็ได้)

| ตัวตรวจ | ตรวจอะไร | ไม่ผ่าน = อะไร |
|---|---|---|
| secret scan | ค่าลับ/โทเค็นในไฟล์ที่ git ติดตาม · **fail-closed** (ไฟล์ >2MB หรือมีไบต์ NUL ที่สแกนไม่ได้ นับว่าไม่ผ่าน) | 🔴 อาจมีค่าลับหลุดขึ้น repo — หยุดแล้วตรวจก่อน push |
| JS / inline script syntax | `node --check` ทุกไฟล์ `.js` + `<script>` ในหน้า HTML | 🔴 โค้ดพัง หน้าเว็บจะเจ๊งจริง |
| ลิงก์ HTML/CSS | `href`/`src`/`url()` ที่ชี้ไปไฟล์ในเครื่อง ต้องมีไฟล์จริง | 🔴 ลิงก์เสีย/รูปไม่ขึ้นจริง |
| ID ซ้ำ | `id=` ซ้ำในหน้าเดียวกัน | ⚠️ คำเตือน (ไม่บล็อก) |
| `check-seo-sitemap.js` | SEO ของ **หน้าสาธารณะที่ให้ Google เก็บเท่านั้น** + sitemap เทียบไฟล์จริง | 🔴 ERROR = sitemap ชี้ไฟล์ที่ไม่มี · หน้า admin/noindex หลุดเข้า sitemap · URL ซ้ำ · lastmod เป็นวันในอนาคต ⚠️ WARNING = ขาด description/canonical/OG (ไม่บล็อก) |
| `check-nav-consistency.js` | เมนู/แถบประกาศ/เมนูล่างทุกหน้า ตรงกับ `data/nav-template.js` | 🔴 มีหน้าตกหล่นจาก generator |
| `check-mobile-accessibility.js` | `<img>` ไม่มี `alt` · ปุ่มไม่มีชื่อที่โปรแกรมอ่านหน้าจอเรียกได้ ฯลฯ | ⚠️ คำเตือนล้วน ไม่บล็อก |
| `tests-*-behavioral.js` | กฎที่ **เคยพังมาแล้วจริง** ของ marketing / เกม / ห้องเรียน / Search / คลังคำ | 🔴 มีคนแก้โค้ดจนกฎเดิมหาย |
| `data/tools/*` | ความถูกต้องของคลังคำ/ประโยค + เครื่องคิดวรรณยุกต์ | 🔴 ข้อมูลเกมพัง |

```bash
node scripts/check-seo-sitemap.js --full   # ดูรายการ SEO/sitemap ครบทุกบรรทัด
node scripts/audit-learning-content.js --full
node scripts/check-minified-sync.js        # ต้องรันมือ (ไม่อยู่ใน check-site.js — ดูคอมเมนต์ในไฟล์)
```

> 📌 ปัจจุบัน `check-site.js` จะรายงาน **"ไม่ผ่าน 44 รายการ" เป็นปกติ** ทั้งหมดเป็น secret scan ใน
> `_staging-build/` และ `js/core/supabase-config.staging.js` ซึ่งถูก `.gitignore` กันไม่ให้ขึ้น GitHub อยู่แล้ว
> **ตั้งใจไม่ถอดด่านนี้ออก** (fail-closed เผื่อมีคน force-add ทีหลัง) — ให้ดูว่ามี "รายการใหม่" เพิ่มมาไหมแทน

## กติกาความปลอดภัย

- ห้ามใส่ secret, service-role key, token หรือข้อมูลนักเรียนใน repository
- ไฟล์ใน `supabase/.temp/` เป็น metadata เฉพาะเครื่องและห้าม commit
- แก้ไฟล์ source ก่อน ส่วนไฟล์ `.min.js` ต้องสร้างด้วย workflow เดิมและทดสอบคู่กัน
- รักษาชื่อและตำแหน่งหน้า HTML เพราะเป็น URL สาธารณะ
- ตรวจ `node scripts/check-site.js` ให้ผ่านก่อนเตรียม commit
- การ deploy และ push เป็นขั้นตอนแยก ไม่เกิดจากคำสั่งตรวจนี้
