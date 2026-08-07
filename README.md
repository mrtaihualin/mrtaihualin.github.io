# mrtaihualin.com

เว็บไซต์แบบ static ของ **泰華眼裡的泰語教學** เผยแพร่ผ่าน GitHub Pages ที่ `mrtaihualin.com`

ประวัติงานจัดระบบและผลตรวจล่าสุดอยู่ใน [MAINTENANCE.md](MAINTENANCE.md)

กฎสำหรับ Codex อยู่ใน [AGENTS.md](AGENTS.md) และแผนงานหลักจากจัดระบบถึงเปิดขายเกมอยู่ที่ `/Users/taihualin/Documents/Claude/Projects/Bussiness Idea/ระบบเว็บไซต์/03_แผนงานหลัก_จากจัดระบบถึงเปิดขายเกม_CURRENT.md`

## โครงสร้างหลัก

| ตำแหน่ง | หน้าที่ |
| --- | --- |
| `*.html` | หน้าเว็บที่ URL ระดับหลักใช้งานโดยตรง ห้ามย้ายโดยไม่ทำ redirect |
| `assets/` | รูป ไอคอน PDF และเสียง |
| `blog/`, `en/` | หน้าบทความและหน้าภาษาอังกฤษ |
| `classroom/` | หน้าระบบห้องเรียนและ CSS เฉพาะระบบ |
| `css/` | CSS ส่วนกลางของเว็บ |
| `data/` | คลังคำ ประโยค และตัวตรวจข้อมูล |
| `js/core/` | ระบบกลาง เช่น auth, shared UI และ Supabase |
| `js/classroom/` | logic ระบบห้องเรียน |
| `js/content/` | ข้อมูลเนื้อหาที่แสดงบนหน้าเว็บ |
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

## กติกาความปลอดภัย

- ห้ามใส่ secret, service-role key, token หรือข้อมูลนักเรียนใน repository
- ไฟล์ใน `supabase/.temp/` เป็น metadata เฉพาะเครื่องและห้าม commit
- แก้ไฟล์ source ก่อน ส่วนไฟล์ `.min.js` ต้องสร้างด้วย workflow เดิมและทดสอบคู่กัน
- รักษาชื่อและตำแหน่งหน้า HTML เพราะเป็น URL สาธารณะ
- ตรวจ `node scripts/check-site.js` ให้ผ่านก่อนเตรียม commit
- การ deploy และ push เป็นขั้นตอนแยก ไม่เกิดจากคำสั่งตรวจนี้
