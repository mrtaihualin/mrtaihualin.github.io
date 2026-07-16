/**
 * words-data.js — คลังคำเดี่ยวกลาง ใช้ร่วมกันทุกเกม (Lin 2026-07-11)
 * ใช้ใน: tone-finder.html (เกมเสียง) · reading-game.html (เกมอ่าน) · typing-game.html (เกมพิมพ์)
 *
 * รวมมาจาก WORD_LIST (tone-finder.html เดิม) + WORDS (reading-game.html เดิม) — ตรวจแล้วเป็นคำชุดเดียวกันครบ 288 คำ
 * ⚠️ ก่อนรวม เจอ 10 คำที่ level (初/中) ไม่ตรงกันระหว่าง 2 เกมเดิม — แก้ตามกฎที่ Lin ยืนยัน 2026-07-11:
 *    "คำพยางค์เดียว = 初級 เสมอ, 中級 ต้องเป็นคำ 2 พยางค์ขึ้นไป" (ใช้ค่าจากเกมอ่านเดิม ตรงกับกฎนี้ 100% อยู่แล้ว)
 *
 * โครงสร้างแต่ละคำ:
 *   word      = คำไทย (ตัวสะกดจริง, ใช้เป็น key หลัก)
 *   readingTH = คำอ่านแบบไทย = "เสียงจริง" (ใส่เฉพาะตอนอ่านต่างจาก word, อยู่ระดับคำเสมอ ไม่ผูกกับ syls)
 *               กฎการแปลง (ยืนยันจาก Lin 2026-07-15, ดู Projects/MD/2026-07-15_คำอ่าน-กฎอ้างอิงกลาง.md):
 *               ตัวสะกดท้ายพยางค์ที่ไม่ใช่ตัวแทนหลักของแม่ ให้เปลี่ยนเป็นตัวแทนหลัก (แม่กก→ก, กด→ด, กบ→บ)
 *               + ตัดตัวอักษรที่ไม่ออกเสียง (เช่น ร ใน จริง) + โชว์ ห/อ นำที่ซ่อนอยู่ (เช่น ตลาด→หลาด)
 *               ข้อยกเว้น: อยู่/อย่าง/อย่า/อยาก เขียนเหมือนตัวสะกดจริงเสมอ ห้ามแปลงเป็น หยู่/หย่าง ฯลฯ
 *   (spellingTH ถูกลบออกแล้ว 2026-07-16 — ซ้ำกับ syls[].th 100% ไม่มีเกมไหนใช้จริง เกมพิมพ์ (typing-game.html บรรทัด
 *   ~2449) ใช้ syls[].th ต่อกันเป็นตัวสะกดจริงสำหรับพิมพ์อยู่แล้ว เช่น อดีต: readingTH='อะ-ดีด' (เสียงจริง)
 *   แต่ syls[].th ต่อกัน='อ-ดีต' (ตัวสะกดจริง) — ถ้าต้องการ string ตัวสะกดรวม คำนวณสดจาก syls.map(s=>s.th).join('-'))
 *   en        = คำอ่านโรมัน
 *   zh        = คำแปลจีน
 *   level     = '初' / '中' (ตัวอักษรไทย ตามที่ Lin เลือก 2026-07-11)
 *   category  = หมวดคำ (ใช้ในเกมเสียงเท่านั้น)
 *   syls      = อาร์เรย์แยกพยางค์ {cons,lead,cluster,vowel,tone,final,tone_name,th} ทุกคำ ไม่ว่าพยางค์เดียวหรือหลายพยางค์
 *               (คำพยางค์เดียว = อาร์เรย์ยาว 1 เสมอ — รวม schema 2026-07-15 กันบั๊ก level-detection ที่เดิมใช้
 *               "มี/ไม่มี syls" เป็นตัวเช็คว่าเป็นคำกี่พยางค์ ดู reading-game.html/typing-game.html การ์ด inLevel())
 *
 * ⚠️ tone_name/cons/vowel/final เป็นฟิลด์ที่แตกจากตัวสะกดที่ Lin ให้มา — Lin ควรสุ่มตรวจก่อนใช้งานจริง (ย้ายมาจากคอมเมนต์เดิมในเกมอ่าน)
 * ⚠️ ห้าม AI เพิ่ม/ลบ/แก้คำในไฟล์นี้เอง — วัตถุดิบคำทุกคำต้องมาจาก Lin เท่านั้น (กฎเกมปิด ข้อ 16)
 */
(function (global) {
  'use strict';

  var WORDS_MASTER = [
  {word:'หนึ่ง', en:'nèung', zh:'一', level:'初', category:'ตัวเลข', syls:[{cons:'น', lead:'ห', vowel:'อึ', tone:'่', final:'ง', tone_name:'เอก', th:'หนึ่ง'}]},
  {word:'สอง', en:'sǒong', zh:'二', level:'初', category:'ตัวเลข', syls:[{cons:'ส', vowel:'ออ', final:'ง', tone_name:'จัตวา', th:'สอง'}]},
  {word:'สาม', en:'sǎam', zh:'三', level:'初', category:'ตัวเลข', syls:[{cons:'ส', vowel:'อา', final:'ม', tone_name:'จัตวา', th:'สาม'}]},
  {word:'สี่', en:'sìi', zh:'四', level:'初', category:'ตัวเลข', syls:[{cons:'ส', vowel:'อี', tone:'่', tone_name:'เอก', th:'สี่'}]},
  {word:'ห้า', en:'hâa', zh:'五', level:'初', category:'ตัวเลข', syls:[{cons:'ห', vowel:'อา', tone:'้', tone_name:'โท', th:'ห้า'}]},
  {word:'ห้าง', en:'hâang', zh:'百貨公司', level:'初', category:'ช้อปปิ้ง', syls:[{cons:'ห', vowel:'อา', tone:'้', final:'ง', tone_name:'โท', th:'ห้าง'}]},
  {word:'หก', en:'hòk', zh:'六', level:'初', category:'ตัวเลข', syls:[{cons:'ห', vowel:'โอะ', final:'ก', tone_name:'เอก', th:'หก'}]},
  {word:'เจ็ด', en:'jèt', zh:'七', level:'初', category:'ตัวเลข', syls:[{cons:'จ', vowel:'เอะ', final:'ด', tone_name:'เอก', th:'เจ็ด'}]},
  {word:'แปด', en:'bpàet', zh:'八', level:'初', category:'ตัวเลข', syls:[{cons:'ป', vowel:'แอ', final:'ด', tone_name:'เอก', th:'แปด'}]},
  {word:'เก้า', en:'gâo', zh:'九', level:'初', category:'ตัวเลข', syls:[{cons:'ก', vowel:'เอา', tone:'้', tone_name:'โท', th:'เก้า'}]},
  {word:'สิบ', en:'sìp', zh:'十', level:'初', category:'ตัวเลข', syls:[{cons:'ส', vowel:'อิ', final:'บ', tone_name:'เอก', th:'สิบ'}]},
  {word:'ดำ', en:'dam', zh:'黑', level:'初', category:'สี', syls:[{cons:'ด', vowel:'อำ', tone_name:'สามัญ', th:'ดำ'}]},
  {word:'ขาว', en:'khǎao', zh:'白', level:'初', category:'สี', syls:[{cons:'ข', vowel:'อา', final:'ว', tone_name:'จัตวา', th:'ขาว'}]},
  {word:'แดง', en:'daeng', zh:'紅', level:'初', category:'สี', syls:[{cons:'ด', vowel:'แอ', final:'ง', tone_name:'สามัญ', th:'แดง'}]},
  {word:'เหลือง', en:'lʉ̌ang', zh:'黃', level:'初', category:'สี', syls:[{cons:'ล', lead:'ห', vowel:'เอือ', final:'ง', tone_name:'จัตวา', th:'เหลือง'}]},
  {word:'ฟ้า', en:'fáa', zh:'藍', level:'初', category:'สี', syls:[{cons:'ฟ', vowel:'อา', tone:'้', tone_name:'ตรี', th:'ฟ้า'}]},
  {word:'กิน', en:'gin', zh:'吃', level:'初', category:'กริยา', syls:[{cons:'ก', vowel:'อิ', final:'น', tone_name:'สามัญ', th:'กิน'}]},
  {word:'ดื่ม', en:'dèum', zh:'喝', level:'初', category:'กริยา', syls:[{cons:'ด', vowel:'อื', tone:'่', final:'ม', tone_name:'เอก', th:'ดื่ม'}]},
  {word:'ไป', en:'bpai', zh:'去', level:'初', category:'กริยา', syls:[{cons:'ป', vowel:'ไอ', tone_name:'สามัญ', th:'ไป'}]},
  {word:'มา', en:'maa', zh:'來', level:'初', category:'กริยา', syls:[{cons:'ม', vowel:'อา', tone_name:'สามัญ', th:'มา'}]},
  {word:'ซื้อ', en:'séu', zh:'買', level:'初', category:'กริยา', syls:[{cons:'ซ', vowel:'อื', tone:'้', tone_name:'ตรี', th:'ซื้อ'}]},
  {word:'ดี', en:'dii', zh:'好', level:'初', category:'คำขยาย', syls:[{cons:'ด', vowel:'อี', tone_name:'สามัญ', th:'ดี'}]},
  {word:'ใหญ่', en:'yài', zh:'大', level:'初', category:'คำขยาย', syls:[{cons:'ญ', lead:'ห', vowel:'ใอ', tone:'่', tone_name:'เอก', th:'ใหญ่'}]},
  {word:'เล็ก', en:'lék', zh:'小', level:'初', category:'คำขยาย', syls:[{cons:'ล', vowel:'เอะ', final:'ก', tone_name:'ตรี', th:'เล็ก'}]},
  {word:'ร้อน', en:'róon', zh:'熱/燙', level:'初', category:'คำขยาย', syls:[{cons:'ร', vowel:'ออ', tone:'้', final:'น', tone_name:'ตรี', th:'ร้อน'}]},
  {word:'แพง', en:'phaeng', zh:'貴', level:'初', category:'คำขยาย', syls:[{cons:'พ', vowel:'แอ', final:'ง', tone_name:'สามัญ', th:'แพง'}]},
  {word:'หมอน', en:'mǒon', zh:'枕頭', level:'初', category:'โรงแรม', syls:[{cons:'ม', lead:'ห', vowel:'ออ', final:'น', tone_name:'จัตวา', th:'หมอน'}]},
  {word:'หู', en:'hǔu', zh:'耳朵', level:'初', category:'นามร่างกาย', syls:[{cons:'ห', vowel:'อู', tone_name:'จัตวา', th:'หู'}]},
  {word:'ปาก', en:'bpàak', zh:'嘴', level:'初', category:'นามร่างกาย', syls:[{cons:'ป', vowel:'อา', final:'ก', tone_name:'เอก', th:'ปาก'}]},
  {word:'ฟัน', en:'fan', zh:'牙齒', level:'初', category:'นามร่างกาย', syls:[{cons:'ฟ', vowel:'อะ', final:'น', tone_name:'สามัญ', th:'ฟัน'}]},
  {word:'ลิ้น', en:'lín', zh:'舌頭', level:'初', category:'นามร่างกาย', syls:[{cons:'ล', vowel:'อิ', tone:'้', final:'น', tone_name:'ตรี', th:'ลิ้น'}]},
  {word:'หน้า', en:'nâa', zh:'臉', level:'初', category:'นามร่างกาย', syls:[{cons:'น', lead:'ห', vowel:'อา', tone:'้', tone_name:'โท', th:'หน้า'}]},
  {word:'ผม', en:'phǒm', zh:'頭髮', level:'初', category:'นามร่างกาย', syls:[{cons:'ผ', vowel:'โอะ', final:'ม', tone_name:'จัตวา', th:'ผม'}]},
  {word:'คอ', en:'khoo', zh:'脖子', level:'初', category:'นามร่างกาย', syls:[{cons:'ค', vowel:'ออ', tone_name:'สามัญ', th:'คอ'}]},
  {word:'เล็บ', en:'lép', zh:'指甲', level:'初', category:'นามร่างกาย', syls:[{cons:'ล', vowel:'เอะ', final:'บ', tone_name:'ตรี', th:'เล็บ'}]},
  {word:'ใจ', en:'jai', zh:'心', level:'初', category:'นามร่างกาย', syls:[{cons:'จ', vowel:'ใอ', tone_name:'สามัญ', th:'ใจ'}]},
  {word:'แขน', en:'khǎen', zh:'手臂', level:'初', category:'นามร่างกาย', syls:[{cons:'ข', vowel:'แอ', final:'น', tone_name:'จัตวา', th:'แขน'}]},
  {word:'นิ้ว', en:'níu', zh:'手指', level:'初', category:'นามร่างกาย', syls:[{cons:'น', vowel:'อิ', tone:'้', final:'ว', tone_name:'ตรี', th:'นิ้ว'}]},
  {word:'อก', en:'òk', zh:'胸', level:'初', category:'นามร่างกาย', syls:[{cons:'อ', vowel:'โอะ', final:'ก', tone_name:'เอก', th:'อก'}]},
  {word:'เลือด', en:'lʉ̂at', zh:'血', level:'初', category:'นามร่างกาย', syls:[{cons:'ล', vowel:'เอือ', final:'ด', tone_name:'โท', th:'เลือด'}]},
  {word:'ขา', en:'khǎa', zh:'腿', level:'初', category:'นามร่างกาย', syls:[{cons:'ข', vowel:'อา', tone_name:'จัตวา', th:'ขา'}]},
  {word:'เท้า', en:'tháo', zh:'腳', level:'初', category:'นามร่างกาย', syls:[{cons:'ท', vowel:'เอา', tone:'้', tone_name:'ตรี', th:'เท้า'}]},
  {word:'ท้อง', en:'thóong', zh:'肚子', level:'初', category:'นามร่างกาย', syls:[{cons:'ท', vowel:'ออ', tone:'้', final:'ง', tone_name:'ตรี', th:'ท้อง'}]},
  {word:'เข่า', en:'khào', zh:'膝蓋', level:'初', category:'นามร่างกาย', syls:[{cons:'ข', vowel:'เอา', tone:'่', tone_name:'เอก', th:'เข่า'}]},
  {word:'ลูก', en:'lûuk', zh:'孩子', level:'初', category:'นามคน', syls:[{cons:'ล', vowel:'อู', final:'ก', tone_name:'โท', th:'ลูก'}]},
  {word:'พี่', en:'phîi', zh:'哥/姊', level:'初', category:'นามคน', syls:[{cons:'พ', vowel:'อี', tone:'่', tone_name:'โท', th:'พี่'}]},
  {word:'น้อง', en:'nóong', zh:'弟/妹', level:'初', category:'นามคน', syls:[{cons:'น', vowel:'ออ', tone:'้', final:'ง', tone_name:'ตรี', th:'น้อง'}]},
  {word:'ปู่', en:'bpùu', zh:'爺爺', level:'初', category:'นามคน', syls:[{cons:'ป', vowel:'อู', tone:'่', tone_name:'เอก', th:'ปู่'}]},
  {word:'ย่า', en:'yâa', zh:'奶奶', level:'初', category:'นามคน', syls:[{cons:'ย', vowel:'อา', tone:'่', tone_name:'โท', th:'ย่า'}]},
  {word:'ยาย', en:'yaai', zh:'外婆', level:'初', category:'นามคน', syls:[{cons:'ย', vowel:'อา', final:'ย', tone_name:'สามัญ', th:'ยาย'}]},
  {word:'หลาน', en:'lǎan', zh:'孫子', level:'初', category:'นามคน', syls:[{cons:'ล', lead:'ห', vowel:'อา', final:'น', tone_name:'จัตวา', th:'หลาน'}]},
  {word:'ญาติ', readingTH:'ยาด', en:'yâat', zh:'親戚', level:'初', category:'นามคน', syls:[{cons:'ญ', vowel:'อา', final:'ติ', tone_name:'โท', th:'ญาติ'}]},
  {word:'หมอ', en:'mǒo', zh:'醫生', level:'初', category:'นามคน', syls:[{cons:'ม', lead:'ห', vowel:'ออ', tone_name:'จัตวา', th:'หมอ'}]},
  {word:'นาย', en:'naai', zh:'先生', level:'初', category:'นามคน', syls:[{cons:'น', vowel:'อา', final:'ย', tone_name:'สามัญ', th:'นาย'}]},
  {word:'ชาย', en:'chaai', zh:'男人', level:'初', category:'นามคน', syls:[{cons:'ช', vowel:'อา', final:'ย', tone_name:'สามัญ', th:'ชาย'}]},
  {word:'เด็ก', en:'dèk', zh:'小孩', level:'初', category:'นามคน', syls:[{cons:'ด', vowel:'เอะ', final:'ก', tone_name:'เอก', th:'เด็ก'}]},
  {word:'แขก', en:'khàek', zh:'客人', level:'初', category:'นามคน', syls:[{cons:'ข', vowel:'แอ', final:'ก', tone_name:'เอก', th:'แขก'}]},
  {word:'ผัว', en:'phǔa', zh:'老公', level:'初', category:'นามคน', syls:[{cons:'ผ', vowel:'อัว', tone_name:'จัตวา', th:'ผัว'}]},
  {word:'เมีย', en:'mia', zh:'老婆', level:'初', category:'นามคน', syls:[{cons:'ม', vowel:'เอีย', tone_name:'สามัญ', th:'เมีย'}]},
  {word:'ไข่', en:'khài', zh:'蛋', level:'初', category:'นามอาหาร', syls:[{cons:'ข', vowel:'ไอ', tone:'่', tone_name:'เอก', th:'ไข่'}]},
  {word:'นม', en:'nom', zh:'牛奶', level:'初', category:'นามอาหาร', syls:[{cons:'น', vowel:'โอะ', final:'ม', tone_name:'สามัญ', th:'นม'}]},
  {word:'ชา', en:'chaa', zh:'茶', level:'初', category:'นามอาหาร', syls:[{cons:'ช', vowel:'อา', tone_name:'สามัญ', th:'ชา'}]},
  {word:'กุ้ง', en:'gûng', zh:'蝦', level:'初', category:'นามอาหาร', syls:[{cons:'ก', vowel:'อุ', tone:'้', final:'ง', tone_name:'โท', th:'กุ้ง'}]},
  {word:'ปู', en:'bpuu', zh:'螃蟹', level:'初', category:'นามอาหาร', syls:[{cons:'ป', vowel:'อู', tone_name:'สามัญ', th:'ปู'}]},
  {word:'เนื้อ', en:'nʉ́a', zh:'肉', level:'初', category:'นามอาหาร', syls:[{cons:'น', vowel:'เอือ', tone:'้', tone_name:'ตรี', th:'เนื้อ'}]},
  {word:'ผัก', en:'phàk', zh:'蔬菜', level:'初', category:'นามอาหาร', syls:[{cons:'ผ', vowel:'อะ', final:'ก', tone_name:'เอก', th:'ผัก'}]},
  {word:'พริก', en:'phrík', zh:'辣椒', level:'初', category:'นามอาหาร', syls:[{cons:'พ', cluster:'ร', vowel:'อิ', final:'ก', tone_name:'ตรี', th:'พริก'}]},
  {word:'เกลือ', en:'glʉa', zh:'鹽', level:'初', category:'นามอาหาร', syls:[{cons:'ก', cluster:'ล', vowel:'เอือ', tone_name:'สามัญ', th:'เกลือ'}]},
  {word:'ขิง', en:'khǐng', zh:'薑', level:'初', category:'นามอาหาร', syls:[{cons:'ข', vowel:'อิ', final:'ง', tone_name:'จัตวา', th:'ขิง'}]},
  {word:'เส้น', en:'sên', zh:'麵條', level:'初', category:'นามอาหาร', syls:[{cons:'ส', vowel:'เอ', tone:'้', final:'น', tone_name:'โท', th:'เส้น'}]},
  {word:'ซุป', readingTH:'ซุบ', en:'súp', zh:'湯', level:'初', category:'นามอาหาร', syls:[{cons:'ซ', vowel:'อุ', final:'ป', tone_name:'ตรี', th:'ซุป'}]},
  {word:'แกง', en:'gaeng', zh:'湯', level:'初', category:'นามอาหาร', syls:[{cons:'ก', vowel:'แอ', final:'ง', tone_name:'สามัญ', th:'แกง'}]},
  {word:'โจ๊ก', en:'jóok', zh:'粥', level:'初', category:'นามอาหาร', syls:[{cons:'จ', vowel:'โอ', tone:'๊', final:'ก', tone_name:'ตรี', th:'โจ๊ก'}]},
  {word:'กล้วย', en:'glûay', zh:'香蕉', level:'初', category:'นามอาหาร', syls:[{cons:'ก', cluster:'ล', vowel:'อัว', tone:'้', final:'ย', tone_name:'โท', th:'กล้วย'}]},
  {word:'ร้าน', en:'ráan', zh:'店', level:'初', category:'นามของใช้', syls:[{cons:'ร', vowel:'อา', tone:'้', final:'น', tone_name:'ตรี', th:'ร้าน'}]},
  {word:'วัด', en:'wát', zh:'寺廟', level:'初', category:'นามของใช้', syls:[{cons:'ว', vowel:'อะ', final:'ด', tone_name:'ตรี', th:'วัด'}]},
  {word:'เมือง', en:'mʉang', zh:'城市', level:'初', category:'นามของใช้', syls:[{cons:'ม', vowel:'เอือ', final:'ง', tone_name:'สามัญ', th:'เมือง'}]},
  {word:'นา', en:'naa', zh:'田', level:'初', category:'นามของใช้', syls:[{cons:'น', vowel:'อา', tone_name:'สามัญ', th:'นา'}]},
  {word:'สวน', en:'sǔan', zh:'花園', level:'初', category:'นามของใช้', syls:[{cons:'ส', vowel:'อัว', final:'น', tone_name:'จัตวา', th:'สวน'}]},
  {word:'ไร่', en:'râi', zh:'農場', level:'初', category:'นามของใช้', syls:[{cons:'ร', vowel:'ไอ', tone:'่', tone_name:'โท', th:'ไร่'}]},
  {word:'เขา', en:'khǎo', zh:'山', level:'初', category:'นามของใช้', syls:[{cons:'ข', vowel:'เอา', tone_name:'จัตวา', th:'เขา'}]},
  {word:'เกาะ', en:'gò', zh:'島', level:'初', category:'นามของใช้', syls:[{cons:'ก', vowel:'เอาะ', tone_name:'เอก', th:'เกาะ'}]},
  {word:'ถุง', en:'thǔng', zh:'袋子', level:'初', category:'นามของใช้', syls:[{cons:'ถ', vowel:'อุ', final:'ง', tone_name:'จัตวา', th:'ถุง'}]},
  {word:'โต๊ะ', en:'tó', zh:'桌子', level:'初', category:'นามของใช้', syls:[{cons:'ต', vowel:'โอะ', tone:'๊', tone_name:'ตรี', th:'โต๊ะ'}]},
  {word:'เตียง', en:'tiang', zh:'床', level:'初', category:'นามของใช้', syls:[{cons:'ต', vowel:'เอีย', final:'ง', tone_name:'สามัญ', th:'เตียง'}]},
  {word:'แก้ว', en:'gâeo', zh:'杯子', level:'初', category:'นามของใช้', syls:[{cons:'ก', vowel:'แอ', tone:'้', final:'ว', tone_name:'โท', th:'แก้ว'}]},
  {word:'ช้อน', en:'chóon', zh:'湯匙', level:'初', category:'นามของใช้', syls:[{cons:'ช', vowel:'ออ', tone:'้', final:'น', tone_name:'ตรี', th:'ช้อน'}]},
  {word:'ส้อม', en:'sôom', zh:'叉子', level:'初', category:'นามของใช้', syls:[{cons:'ส', vowel:'ออ', tone:'้', final:'ม', tone_name:'โท', th:'ส้อม'}]},
  {word:'มีด', en:'mîit', zh:'刀子', level:'初', category:'นามของใช้', syls:[{cons:'ม', vowel:'อี', final:'ด', tone_name:'โท', th:'มีด'}]},
  {word:'หม้อ', en:'môo', zh:'鍋子', level:'初', category:'นามของใช้', syls:[{cons:'ม', lead:'ห', vowel:'ออ', tone:'้', tone_name:'โท', th:'หม้อ'}]},
  {word:'พัด', en:'phát', zh:'扇子', level:'初', category:'นามของใช้', syls:[{cons:'พ', vowel:'อะ', final:'ด', tone_name:'ตรี', th:'พัด'}]},
  {word:'ทำ', en:'tam', zh:'做', level:'初', category:'กริยา', syls:[{cons:'ท', vowel:'อำ', tone_name:'สามัญ', th:'ทำ'}]},
  {word:'พูด', en:'phûut', zh:'說', level:'初', category:'กริยา', syls:[{cons:'พ', vowel:'อู', final:'ด', tone_name:'โท', th:'พูด'}]},
  {word:'ดู', en:'duu', zh:'看', level:'初', category:'กริยา', syls:[{cons:'ด', vowel:'อู', tone_name:'สามัญ', th:'ดู'}]},
  {word:'ฟัง', en:'fang', zh:'聽', level:'初', category:'กริยา', syls:[{cons:'ฟ', vowel:'อะ', final:'ง', tone_name:'สามัญ', th:'ฟัง'}]},
  {word:'อ่าน', en:'àan', zh:'讀', level:'初', category:'กริยา', syls:[{cons:'อ', vowel:'อา', tone:'่', final:'น', tone_name:'เอก', th:'อ่าน'}]},
  {word:'เขียน', en:'khǐan', zh:'寫', level:'初', category:'กริยา', syls:[{cons:'ข', vowel:'เอีย', final:'น', tone_name:'จัตวา', th:'เขียน'}]},
  {word:'รัก', en:'rák', zh:'愛', level:'初', category:'กริยา', syls:[{cons:'ร', vowel:'อะ', final:'ก', tone_name:'ตรี', th:'รัก'}]},
  {word:'สูง', en:'sǔung', zh:'高', level:'初', category:'คำขยาย', syls:[{cons:'ส', vowel:'อู', final:'ง', tone_name:'จัตวา', th:'สูง'}]},
  {word:'ใหม่', en:'mài', zh:'新', level:'初', category:'คำขยาย', syls:[{cons:'ม', lead:'ห', vowel:'ใอ', tone:'่', tone_name:'เอก', th:'ใหม่'}]},
  {word:'น้ำ', en:'náam', zh:'水', level:'初', category:'นามอาหาร', syls:[{cons:'น', vowel:'อำ', tone:'้', tone_name:'ตรี', th:'น้ำ'}]},
  {word:'ข้าว', en:'khâao', zh:'飯', level:'初', category:'นามอาหาร', syls:[{cons:'ข', vowel:'อา', tone:'้', final:'ว', tone_name:'โท', th:'ข้าว'}]},
  {word:'หมา', en:'mǎa', zh:'狗', level:'初', category:'สัตว์/ธรรมชาติ', syls:[{cons:'ม', lead:'ห', vowel:'อา', tone_name:'จัตวา', th:'หมา'}]},
  {word:'แมว', en:'maeo', zh:'貓', level:'初', category:'สัตว์/ธรรมชาติ', syls:[{cons:'ม', vowel:'แอ', final:'ว', tone_name:'สามัญ', th:'แมว'}]},
  {word:'บ้าน', en:'bâan', zh:'家', level:'初', category:'นามของใช้', syls:[{cons:'บ', vowel:'อา', tone:'้', final:'น', tone_name:'โท', th:'บ้าน'}]},
  {word:'รถ', readingTH:'รด', en:'rót', zh:'車', level:'初', category:'นามของใช้', syls:[{cons:'ร', vowel:'โอะ', final:'ถ', tone_name:'ตรี', th:'รถ'}]},
  {word:'พ่อ', en:'phôo', zh:'爸爸', level:'初', category:'นามคน', syls:[{cons:'พ', vowel:'ออ', tone:'่', tone_name:'โท', th:'พ่อ'}]},
  {word:'แม่', en:'mâe', zh:'媽媽', level:'初', category:'นามคน', syls:[{cons:'ม', vowel:'แอ', tone:'่', tone_name:'โท', th:'แม่'}]},
  {word:'ครู', en:'khruu', zh:'老師', level:'初', category:'นามคน', syls:[{cons:'ค', cluster:'ร', vowel:'อู', tone_name:'สามัญ', th:'ครู'}]},
  {word:'เงิน', en:'ngern', zh:'錢', level:'初', category:'นามของใช้', syls:[{cons:'ง', vowel:'เออ', final:'น', tone_name:'สามัญ', th:'เงิน'}]},
  {word:'ฝน', en:'fǒn', zh:'雨', level:'初', category:'สัตว์/ธรรมชาติ', syls:[{cons:'ฝ', vowel:'โอะ', final:'น', tone_name:'จัตวา', th:'ฝน'}]},
  {word:'ลม', en:'lom', zh:'風', level:'初', category:'สัตว์/ธรรมชาติ', syls:[{cons:'ล', vowel:'โอะ', final:'ม', tone_name:'สามัญ', th:'ลม'}]},
  {word:'ไฟ', en:'fai', zh:'火', level:'初', category:'สัตว์/ธรรมชาติ', syls:[{cons:'ฟ', vowel:'ไอ', tone_name:'สามัญ', th:'ไฟ'}]},
  {word:'ปลา', en:'plaa', zh:'魚', level:'初', category:'นามอาหาร', syls:[{cons:'ป', cluster:'ล', vowel:'อา', tone_name:'สามัญ', th:'ปลา'}]},
  {word:'ไก่', en:'gài', zh:'雞', level:'初', category:'นามอาหาร', syls:[{cons:'ก', vowel:'ไอ', tone:'่', tone_name:'เอก', th:'ไก่'}]},
  {word:'หมู', en:'mǔu', zh:'豬', level:'初', category:'นามอาหาร', syls:[{cons:'ม', lead:'ห', vowel:'อู', tone_name:'จัตวา', th:'หมู'}]},
  {word:'นก', en:'nók', zh:'鳥', level:'初', category:'สัตว์/ธรรมชาติ', syls:[{cons:'น', vowel:'โอะ', final:'ก', tone_name:'ตรี', th:'นก'}]},
  {word:'ตา', en:'taa', zh:'眼睛', level:'初', category:'นามร่างกาย', syls:[{cons:'ต', vowel:'อา', tone_name:'สามัญ', th:'ตา'}]},
  {word:'มือ', en:'mʉʉ', zh:'手', level:'初', category:'นามร่างกาย', syls:[{cons:'ม', vowel:'อื', tone_name:'สามัญ', th:'มือ'}]},
  {word:'หัว', en:'hǔa', zh:'頭', level:'初', category:'นามร่างกาย', syls:[{cons:'ห', vowel:'อัว', tone_name:'จัตวา', th:'หัว'}]},
  {word:'ส้ม', en:'sôm', zh:'橙', level:'初', category:'สี', syls:[{cons:'ส', vowel:'โอะ', tone:'้', final:'ม', tone_name:'โท', th:'ส้ม'}]},
  {word:'เขียว', en:'khǐao', zh:'綠', level:'初', category:'สี', syls:[{cons:'ข', vowel:'เอีย', final:'ว', tone_name:'จัตวา', th:'เขียว'}]},
  {word:'ม่วง', en:'mûang', zh:'紫', level:'初', category:'สี', syls:[{cons:'ม', vowel:'อัว', tone:'่', final:'ง', tone_name:'โท', th:'ม่วง'}]},
  {word:'เทา', en:'thao', zh:'灰', level:'初', category:'สี', syls:[{cons:'ท', vowel:'เอา', tone_name:'สามัญ', th:'เทา'}]},
  {word:'คน', en:'khon', zh:'個/位', level:'初', category:'ลักษณนาม', syls:[{cons:'ค', vowel:'โอะ', final:'น', tone_name:'สามัญ', th:'คน'}]},
  {word:'ตัว', en:'tua', zh:'隻/條', level:'初', category:'ลักษณนาม', syls:[{cons:'ต', vowel:'อัว', tone_name:'สามัญ', th:'ตัว'}]},
  {word:'ใบ', en:'bai', zh:'張/片', level:'初', category:'ลักษณนาม', syls:[{cons:'บ', vowel:'ใอ', tone_name:'สามัญ', th:'ใบ'}]},
  {word:'อัน', en:'an', zh:'個/件', level:'初', category:'ลักษณนาม', syls:[{cons:'อ', vowel:'อะ', final:'น', tone_name:'สามัญ', th:'อัน'}]},
  {word:'ชิ้น', en:'chín', zh:'塊/片', level:'初', category:'ลักษณนาม', syls:[{cons:'ช', vowel:'อิ', tone:'้', final:'น', tone_name:'ตรี', th:'ชิ้น'}]},
  {word:'แผ่น', en:'phàen', zh:'片/張', level:'初', category:'ลักษณนาม', syls:[{cons:'ผ', vowel:'แอ', tone:'่', final:'น', tone_name:'เอก', th:'แผ่น'}]},
  {word:'เล่ม', en:'lêm', zh:'本', level:'初', category:'ลักษณนาม', syls:[{cons:'ล', vowel:'เอ', tone:'่', final:'ม', tone_name:'โท', th:'เล่ม'}]},
  {word:'ขวด', en:'khùat', zh:'瓶', level:'初', category:'ลักษณนาม', syls:[{cons:'ข', vowel:'อัว', final:'ด', tone_name:'เอก', th:'ขวด'}]},
  {word:'ก้อน', en:'gôon', zh:'塊', level:'初', category:'ลักษณนาม', syls:[{cons:'ก', vowel:'ออ', tone:'้', final:'น', tone_name:'โท', th:'ก้อน'}]},
  {word:'คัน', en:'khan', zh:'輛', level:'初', category:'ลักษณนาม', syls:[{cons:'ค', vowel:'อะ', final:'น', tone_name:'สามัญ', th:'คัน'}]},
  {word:'ลำ', en:'lam', zh:'架/艘', level:'初', category:'ลักษณนาม', syls:[{cons:'ล', vowel:'อำ', tone_name:'สามัญ', th:'ลำ'}]},
  {word:'หลัง', en:'lǎng', zh:'棟', level:'初', category:'ลักษณนาม', syls:[{cons:'ล', lead:'ห', vowel:'อะ', final:'ง', tone_name:'จัตวา', th:'หลัง'}]},
  {word:'ห้อง', en:'hôong', zh:'間', level:'初', category:'ลักษณนาม', syls:[{cons:'ห', vowel:'ออ', tone:'้', final:'ง', tone_name:'โท', th:'ห้อง'}]},
  {word:'ชั้น', en:'chán', zh:'層', level:'初', category:'ลักษณนาม', syls:[{cons:'ช', vowel:'อะ', tone:'้', final:'น', tone_name:'ตรี', th:'ชั้น'}]},
  {word:'จาน', en:'jaan', zh:'盤', level:'初', category:'ลักษณนาม', syls:[{cons:'จ', vowel:'อา', final:'น', tone_name:'สามัญ', th:'จาน'}]},
  {word:'ถ้วย', en:'thûay', zh:'碗/杯', level:'初', category:'ลักษณนาม', syls:[{cons:'ถ', vowel:'อัว', tone:'้', final:'ย', tone_name:'โท', th:'ถ้วย'}]},
  {word:'ต้น', en:'tôn', zh:'棵', level:'初', category:'ลักษณนาม', syls:[{cons:'ต', vowel:'โอะ', tone:'้', final:'น', tone_name:'โท', th:'ต้น'}]},
  {word:'ผล', readingTH:'ผน', en:'phǒn', zh:'顆/個', level:'初', category:'ลักษณนาม', syls:[{cons:'ผ', vowel:'โอะ', final:'ล', tone_name:'จัตวา', th:'ผล'}]},
  {word:'มื้อ', en:'mʉ́ʉ', zh:'餐', level:'初', category:'ลักษณนาม', syls:[{cons:'ม', vowel:'อื', tone:'้', tone_name:'ตรี', th:'มื้อ'}]},
  {word:'นอน', en:'norn', zh:'睡', level:'初', category:'กริยา', syls:[{cons:'น', vowel:'ออ', final:'น', tone_name:'สามัญ', th:'นอน'}]},
  {word:'ตื่น', en:'tʉ̀ʉn', zh:'醒', level:'初', category:'กริยา', syls:[{cons:'ต', vowel:'อื', tone:'่', final:'น', tone_name:'เอก', th:'ตื่น'}]},
  {word:'อยู่', en:'yùu', zh:'住/在', level:'初', category:'กริยา', syls:[{cons:'ย', lead:'อ', vowel:'อู', tone:'่', tone_name:'เอก', th:'อยู่'}]},
  {word:'เรียก', en:'rîak', zh:'叫', level:'初', category:'กริยา', syls:[{cons:'ร', vowel:'เอีย', final:'ก', tone_name:'โท', th:'เรียก'}]},
  {word:'ร้อง', en:'róong', zh:'唱/哭', level:'初', category:'กริยา', syls:[{cons:'ร', vowel:'ออ', tone:'้', final:'ง', tone_name:'ตรี', th:'ร้อง'}]},
  {word:'คุย', en:'khui', zh:'聊天', level:'初', category:'กริยา', syls:[{cons:'ค', vowel:'อุ', final:'ย', tone_name:'สามัญ', th:'คุย'}]},
  {word:'โกรธ', readingTH:'โกรด', en:'gròot', zh:'生氣', level:'初', category:'กริยา', syls:[{cons:'ก', cluster:'ร', vowel:'โอ', final:'ธ', tone_name:'เอก', th:'โกรธ'}]},
  {word:'เย็น', en:'yen', zh:'冷/冰', level:'初', category:'คำขยาย', syls:[{cons:'ย', vowel:'เอะ', final:'น', tone_name:'สามัญ', th:'เย็น'}]},
  {word:'อุ่น', en:'ùn', zh:'暖/溫', level:'初', category:'คำขยาย', syls:[{cons:'อ', vowel:'อุ', tone:'่', final:'น', tone_name:'เอก', th:'อุ่น'}]},
  {word:'แข็ง', en:'khǎeng', zh:'硬', level:'初', category:'คำขยาย', syls:[{cons:'ข', vowel:'แอะ', final:'ง', tone_name:'จัตวา', th:'แข็ง'}]},
  {word:'นิ่ม', en:'nîm', zh:'軟', level:'初', category:'คำขยาย', syls:[{cons:'น', vowel:'อิ', tone:'่', final:'ม', tone_name:'โท', th:'นิ่ม'}]},
  {word:'มืด', en:'mʉ̂ʉt', zh:'暗', level:'初', category:'คำขยาย', syls:[{cons:'ม', vowel:'อื', final:'ด', tone_name:'โท', th:'มืด'}]},
  {word:'ดัง', en:'dang', zh:'大聲/有名', level:'初', category:'คำขยาย', syls:[{cons:'ด', vowel:'อะ', final:'ง', tone_name:'สามัญ', th:'ดัง'}]},
  {word:'เงียบ', en:'ngîap', zh:'靜', level:'初', category:'คำขยาย', syls:[{cons:'ง', vowel:'เอีย', final:'บ', tone_name:'โท', th:'เงียบ'}]},
  {word:'เต็ม', en:'tem', zh:'滿', level:'初', category:'คำขยาย', syls:[{cons:'ต', vowel:'เอะ', final:'ม', tone_name:'สามัญ', th:'เต็ม'}]},
  {word:'ว่าง', en:'wâang', zh:'空/有空', level:'初', category:'คำขยาย', syls:[{cons:'ว', vowel:'อา', tone:'่', final:'ง', tone_name:'โท', th:'ว่าง'}]},
  {word:'ถูก', en:'thùuk', zh:'便宜/對', level:'初', category:'คำขยาย', syls:[{cons:'ถ', vowel:'อู', final:'ก', tone_name:'เอก', th:'ถูก'}]},
  {word:'อาหาร', readingTH:'อา-หาน', en:'aa-hǎan', zh:'食物/料理', level:'中', category:'ร้านอาหาร', syls:[{cons:'อ', vowel:'อา', tone_name:'สามัญ', th:'อา'}, {cons:'ห', vowel:'อา', final:'ร', tone_name:'จัตวา', th:'หาร'}]},
  {word:'ร้านอาหาร', readingTH:'ร้าน-อา-หาน', en:'ráan-aa-hǎan', zh:'餐廳', level:'中', category:'ร้านอาหาร', syls:[{cons:'ร', vowel:'อา', tone:'้', final:'น', tone_name:'ตรี', th:'ร้าน'}, {cons:'อ', vowel:'อา', tone_name:'สามัญ', th:'อา'}, {cons:'ห', vowel:'อา', final:'ร', tone_name:'จัตวา', th:'หาร'}]},
  {word:'เมนู', readingTH:'เม-นู', en:'mee-nuu', zh:'菜單', level:'初', category:'ร้านอาหาร', syls:[{cons:'ม', vowel:'เอ', tone_name:'สามัญ', th:'เม'}, {cons:'น', vowel:'อู', tone_name:'สามัญ', th:'นู'}]},
  {word:'ของหวาน', readingTH:'ของ-หวาน', en:'khǒong-wǎan', zh:'甜點', level:'初', category:'ร้านอาหาร', syls:[{cons:'ข', vowel:'ออ', final:'ง', tone_name:'จัตวา', th:'ของ'}, {cons:'ว', lead:'ห', vowel:'อา', final:'น', tone_name:'จัตวา', th:'หวาน'}]},
  {word:'น้ำแข็ง', readingTH:'น้ำ-แข็ง', en:'náam-khǎeng', zh:'冰塊', level:'初', category:'ร้านอาหาร', syls:[{cons:'น', vowel:'อำ', tone:'้', tone_name:'ตรี', th:'น้ำ'}, {cons:'ข', vowel:'แอะ', final:'ง', tone_name:'จัตวา', th:'แข็ง'}]},
  {word:'ใบเสร็จ', readingTH:'ใบ-เส็ด', en:'bai-sèt', zh:'收據/帳單', level:'中', category:'ร้านอาหาร', syls:[{cons:'บ', vowel:'ใอ', tone_name:'สามัญ', th:'ใบ'}, {cons:'ส', cluster:'ร', vowel:'เอะ', final:'จ', tone_name:'เอก', th:'เสร็จ'}]},
  {word:'สนามบิน', readingTH:'สะ-หนาม-บิน', en:'sa-nǎam-bin', zh:'機場', level:'中', category:'การเดินทาง', syls:[{cons:'ส', vowel:'อะ', tone_name:'เอก', th:'ส'}, {cons:'น', lead:'ห', vowel:'อา', final:'ม', tone_name:'จัตวา', th:'นาม'}, {cons:'บ', vowel:'อิ', final:'น', tone_name:'สามัญ', th:'บิน'}]},
  {word:'แท็กซี่', readingTH:'แท็ก-ซี่', en:'tháek-sîi', zh:'計程車', level:'初', category:'การเดินทาง', syls:[{cons:'ท', vowel:'แอะ', final:'ก', tone_name:'ตรี', th:'แท็ก'}, {cons:'ซ', vowel:'อี', tone:'่', tone_name:'โท', th:'ซี่'}]},
  {word:'รถไฟฟ้า', readingTH:'รด-ไฟ-ฟ้า', en:'rót-fai-fáa', zh:'捷運/地鐵', level:'中', category:'การเดินทาง', syls:[{cons:'ร', vowel:'โอะ', final:'ถ', tone_name:'ตรี', th:'รถ'}, {cons:'ฟ', vowel:'ไอ', tone_name:'สามัญ', th:'ไฟ'}, {cons:'ฟ', vowel:'อา', tone:'้', tone_name:'ตรี', th:'ฟ้า'}]},
  {word:'แผนที่', readingTH:'แผน-ที่', en:'phǎen-thîi', zh:'地圖', level:'初', category:'การเดินทาง', syls:[{cons:'ผ', vowel:'แอ', final:'น', tone_name:'จัตวา', th:'แผน'}, {cons:'ท', vowel:'อี', tone:'่', tone_name:'โท', th:'ที่'}]},
  {word:'ทางออก', readingTH:'ทาง-ออก', en:'thaang-òk', zh:'出口', level:'初', category:'การเดินทาง', syls:[{cons:'ท', vowel:'อา', final:'ง', tone_name:'สามัญ', th:'ทาง'}, {cons:'อ', vowel:'ออ', final:'ก', tone_name:'เอก', th:'ออก'}]},
  {word:'ห้องน้ำ', readingTH:'ห้อง-น้ำ', en:'hông-náam', zh:'洗手間', level:'初', category:'การเดินทาง', syls:[{cons:'ห', vowel:'ออ', tone:'้', final:'ง', tone_name:'โท', th:'ห้อง'}, {cons:'น', vowel:'อำ', tone:'้', tone_name:'ตรี', th:'น้ำ'}]},
  {word:'โรงแรม', readingTH:'โรง-แรม', en:'roong-raem', zh:'飯店', level:'初', category:'โรงแรม', syls:[{cons:'ร', vowel:'โอ', final:'ง', tone_name:'สามัญ', th:'โรง'}, {cons:'ร', vowel:'แอ', final:'ม', tone_name:'สามัญ', th:'แรม'}]},
  {word:'ห้องพัก', readingTH:'ห้อง-พัก', en:'hông-phák', zh:'客房', level:'初', category:'โรงแรม', syls:[{cons:'ห', vowel:'ออ', tone:'้', final:'ง', tone_name:'โท', th:'ห้อง'}, {cons:'พ', vowel:'อะ', final:'ก', tone_name:'ตรี', th:'พัก'}]},
  {word:'เช็คอิน', readingTH:'เช็ก-อิน', en:'chék-in', zh:'辦理入住', level:'中', category:'โรงแรม', syls:[{cons:'ช', vowel:'เอะ', final:'ค', tone_name:'ตรี', th:'เช็ค'}, {cons:'อ', vowel:'อิ', final:'น', tone_name:'สามัญ', th:'อิน'}]},
  {word:'เช็คเอาท์', readingTH:'เช็ค-เอาท์', en:'chék-áo', zh:'退房', level:'初', category:'โรงแรม', syls:[{cons:'ช', vowel:'เอะ', final:'ค', tone_name:'ตรี', th:'เช็ค'}, {cons:'อ', vowel:'เอา', tone_name:'ตรี', th:'เอาท์'}]},
  {word:'สระว่ายน้ำ', readingTH:'สะ-ว่าย-น้ำ', en:'sà-wâai-náam', zh:'游泳池', level:'中', category:'โรงแรม', syls:[{cons:'ส', cluster:'ร', vowel:'อะ', tone_name:'เอก', th:'สระ'}, {cons:'ว', vowel:'อา', tone:'่', final:'ย', tone_name:'โท', th:'ว่าย'}, {cons:'น', vowel:'อำ', tone:'้', tone_name:'ตรี', th:'น้ำ'}]},
  {word:'บริษัท', readingTH:'บอ-ริ-สัด', en:'bor-rí-sàt', zh:'公司', level:'中', category:'งาน', syls:[{cons:'บ', vowel:'ออ', tone_name:'สามัญ', th:'บ'}, {cons:'ร', vowel:'อิ', tone_name:'ตรี', th:'ริ'}, {cons:'ษ', vowel:'อะ', final:'ท', tone_name:'เอก', th:'ษัท'}]},
  {word:'ประชุม', readingTH:'ประ-ชุม', en:'bprà-chum', zh:'開會', level:'初', category:'งาน', syls:[{cons:'ป', cluster:'ร', vowel:'อะ', tone_name:'เอก', th:'ประ'}, {cons:'ช', vowel:'อุ', final:'ม', tone_name:'สามัญ', th:'ชุม'}]},
  {word:'ลูกค้า', readingTH:'ลูก-ค้า', en:'lûuk-kháa', zh:'客戶', level:'初', category:'งาน', syls:[{cons:'ล', vowel:'อู', final:'ก', tone_name:'โท', th:'ลูก'}, {cons:'ค', vowel:'อา', tone:'้', tone_name:'ตรี', th:'ค้า'}]},
  {word:'นัดหมาย', readingTH:'นัด-หมาย', en:'nát-mǎai', zh:'預約/約定', level:'初', category:'งาน', syls:[{cons:'น', vowel:'อะ', final:'ด', tone_name:'ตรี', th:'นัด'}, {cons:'ม', lead:'ห', vowel:'อา', final:'ย', tone_name:'จัตวา', th:'หมาย'}]},
  {word:'รายงาน', readingTH:'ราย-งาน', en:'raai-ngaan', zh:'報告', level:'初', category:'งาน', syls:[{cons:'ร', vowel:'อา', final:'ย', tone_name:'สามัญ', th:'ราย'}, {cons:'ง', vowel:'อา', final:'น', tone_name:'สามัญ', th:'งาน'}]},
  {word:'ราคา', readingTH:'รา-คา', en:'raa-khaa', zh:'價格', level:'初', category:'ช้อปปิ้ง', syls:[{cons:'ร', vowel:'อา', tone_name:'สามัญ', th:'รา'}, {cons:'ค', vowel:'อา', tone_name:'สามัญ', th:'คา'}]},
  {word:'ลดราคา', readingTH:'ลด-รา-คา', en:'lót-raa-khaa', zh:'打折', level:'中', category:'ช้อปปิ้ง', syls:[{cons:'ล', vowel:'โอะ', final:'ด', tone_name:'ตรี', th:'ลด'}, {cons:'ร', vowel:'อา', tone_name:'สามัญ', th:'รา'}, {cons:'ค', vowel:'อา', tone_name:'สามัญ', th:'คา'}]},
  {word:'ต่อรอง', readingTH:'ต่อ-รอง', en:'dtòr-rong', zh:'殺價', level:'初', category:'ช้อปปิ้ง', syls:[{cons:'ต', vowel:'ออ', tone:'่', tone_name:'เอก', th:'ต่อ'}, {cons:'ร', vowel:'ออ', final:'ง', tone_name:'สามัญ', th:'รอง'}]},
  {word:'ชำระเงิน', readingTH:'ชำ-ระ-เงิน', en:'cham-rá-ngoen', zh:'付款', level:'中', category:'ช้อปปิ้ง', syls:[{cons:'ช', vowel:'อำ', tone_name:'สามัญ', th:'ชำ'}, {cons:'ร', vowel:'อะ', tone_name:'ตรี', th:'ระ'}, {cons:'ง', vowel:'เออ', final:'น', tone_name:'สามัญ', th:'เงิน'}]},
  {word:'สวัสดี', readingTH:'สะ-หวัด-ดี', en:'sà-wàt-dii', zh:'你好/再見', level:'中', category:'ทักทาย/เวลา/แนวคิด', syls:[{cons:'ส', vowel:'อะ', tone_name:'เอก', th:'ส'}, {cons:'ว', lead:'ห', vowel:'อะ', final:'ส', tone_name:'เอก', th:'วัส'}, {cons:'ด', vowel:'อี', tone_name:'สามัญ', th:'ดี'}]},
  {word:'ขอบคุณ', readingTH:'ขอบ-คุน', en:'khòp-khun', zh:'謝謝', level:'中', category:'ทักทาย/เวลา/แนวคิด', syls:[{cons:'ข', vowel:'ออ', final:'บ', tone_name:'เอก', th:'ขอบ'}, {cons:'ค', vowel:'อุ', final:'ณ', tone_name:'สามัญ', th:'คุณ'}]},
  {word:'ขอโทษ', readingTH:'ขอ-โทด', en:'khǒr-thôot', zh:'對不起', level:'中', category:'ทักทาย/เวลา/แนวคิด', syls:[{cons:'ข', vowel:'ออ', tone_name:'จัตวา', th:'ขอ'}, {cons:'ท', vowel:'โอ', final:'ษ', tone_name:'โท', th:'โทษ'}]},
  {word:'ไม่เป็นไร', readingTH:'ไม่-เป็น-ไร', en:'mâi-bpen-rai', zh:'沒關係', level:'中', category:'ทักทาย/เวลา/แนวคิด', syls:[{cons:'ม', vowel:'ไอ', tone:'่', tone_name:'โท', th:'ไม่'}, {cons:'ป', vowel:'เอะ', final:'น', tone_name:'สามัญ', th:'เป็น'}, {cons:'ร', vowel:'ไอ', tone_name:'สามัญ', th:'ไร'}]},
  {word:'ไม่เข้าใจ', readingTH:'ไม่-เข้า-ใจ', en:'mâi-khâo-jai', zh:'我不懂', level:'中', category:'ทักทาย/เวลา/แนวคิด', syls:[{cons:'ม', vowel:'ไอ', tone:'่', tone_name:'โท', th:'ไม่'}, {cons:'ข', vowel:'เอา', tone:'้', tone_name:'โท', th:'เข้า'}, {cons:'จ', vowel:'ใอ', tone_name:'สามัญ', th:'ใจ'}]},
  {word:'ช่วยด้วย', readingTH:'ช่วย-ด้วย', en:'chûai-dûai', zh:'救命', level:'初', category:'ทักทาย/เวลา/แนวคิด', syls:[{cons:'ช', vowel:'อัว', tone:'่', final:'ย', tone_name:'โท', th:'ช่วย'}, {cons:'ด', vowel:'อัว', tone:'้', final:'ย', tone_name:'โท', th:'ด้วย'}]},
  {word:'ข้าวผัด', readingTH:'ข้าว-ผัด', en:'khâao-phàt', zh:'炒飯', level:'初', category:'ร้านอาหาร', syls:[{cons:'ข', vowel:'อา', tone:'้', final:'ว', tone_name:'โท', th:'ข้าว'}, {cons:'ผ', vowel:'อะ', final:'ด', tone_name:'เอก', th:'ผัด'}]},
  {word:'ต้มยำ', readingTH:'ต้ม-ยำ', en:'dtôm-yam', zh:'冬陰湯', level:'初', category:'ร้านอาหาร', syls:[{cons:'ต', vowel:'โอะ', tone:'้', final:'ม', tone_name:'โท', th:'ต้ม'}, {cons:'ย', vowel:'อำ', tone_name:'สามัญ', th:'ยำ'}]},
  {word:'ผัดไทย', readingTH:'ผัด-ไท', en:'phàt-thai', zh:'泰式炒麵', level:'中', category:'ร้านอาหาร', syls:[{cons:'ผ', vowel:'อะ', final:'ด', tone_name:'เอก', th:'ผัด'}, {cons:'ท', vowel:'ไอ', final:'ย', tone_name:'สามัญ', th:'ไทย'}]},
  {word:'ส้มตำ', readingTH:'ส้ม-ตำ', en:'sôm-dtam', zh:'涼拌木瓜', level:'初', category:'ร้านอาหาร', syls:[{cons:'ส', vowel:'โอะ', tone:'้', final:'ม', tone_name:'โท', th:'ส้ม'}, {cons:'ต', vowel:'อำ', tone_name:'สามัญ', th:'ตำ'}]},
  {word:'ข้าวต้ม', readingTH:'ข้าว-ต้ม', en:'khâao-dtôm', zh:'粥', level:'初', category:'ร้านอาหาร', syls:[{cons:'ข', vowel:'อา', tone:'้', final:'ว', tone_name:'โท', th:'ข้าว'}, {cons:'ต', vowel:'โอะ', tone:'้', final:'ม', tone_name:'โท', th:'ต้ม'}]},
  {word:'ไก่ทอด', readingTH:'ไก่-ทอด', en:'gài-thôot', zh:'炸雞', level:'初', category:'ร้านอาหาร', syls:[{cons:'ก', vowel:'ไอ', tone:'่', tone_name:'เอก', th:'ไก่'}, {cons:'ท', vowel:'ออ', final:'ด', tone_name:'โท', th:'ทอด'}]},
  {word:'หมูปิ้ง', readingTH:'หมู-ปิ้ง', en:'mǔu-bpîng', zh:'烤豬肉', level:'初', category:'ร้านอาหาร', syls:[{cons:'ม', lead:'ห', vowel:'อู', tone_name:'จัตวา', th:'หมู'}, {cons:'ป', vowel:'อิ', tone:'้', final:'ง', tone_name:'โท', th:'ปิ้ง'}]},
  {word:'กาแฟ', readingTH:'กา-แฟ', en:'gaa-fae', zh:'咖啡', level:'初', category:'ร้านอาหาร', syls:[{cons:'ก', vowel:'อา', tone_name:'สามัญ', th:'กา'}, {cons:'ฟ', vowel:'แอ', tone_name:'สามัญ', th:'แฟ'}]},
  {word:'น้ำชา', readingTH:'น้ำ-ชา', en:'nám-chaa', zh:'茶', level:'初', category:'ร้านอาหาร', syls:[{cons:'น', vowel:'อำ', tone:'้', tone_name:'ตรี', th:'น้ำ'}, {cons:'ช', vowel:'อา', tone_name:'สามัญ', th:'ชา'}]},
  {word:'น้ำส้ม', readingTH:'น้ำ-ส้ม', en:'nám-sôm', zh:'柳橙汁', level:'初', category:'ร้านอาหาร', syls:[{cons:'น', vowel:'อำ', tone:'้', tone_name:'ตรี', th:'น้ำ'}, {cons:'ส', vowel:'โอะ', tone:'้', final:'ม', tone_name:'โท', th:'ส้ม'}]},
  {word:'ขนมปัง', readingTH:'ขะ-หนม-ปัง', en:'khà-nǒm-bpang', zh:'麵包', level:'中', category:'ร้านอาหาร', syls:[{cons:'ข', vowel:'อะ', tone_name:'เอก', th:'ข'}, {cons:'น', lead:'ห', vowel:'โอะ', final:'ม', tone_name:'จัตวา', th:'นม'}, {cons:'ป', vowel:'อะ', final:'ง', tone_name:'สามัญ', th:'ปัง'}]},
  {word:'ช้อนส้อม', readingTH:'ช้อน-ส้อม', en:'chóon-sôom', zh:'餐具', level:'初', category:'ร้านอาหาร', syls:[{cons:'ช', vowel:'ออ', tone:'้', final:'น', tone_name:'ตรี', th:'ช้อน'}, {cons:'ส', vowel:'ออ', tone:'้', final:'ม', tone_name:'โท', th:'ส้อม'}]},
  {word:'ตะเกียบ', readingTH:'ตะ-เกียบ', en:'dta-gìap', zh:'筷子', level:'初', category:'ร้านอาหาร', syls:[{cons:'ต', vowel:'อะ', tone_name:'เอก', th:'ตะ'}, {cons:'ก', vowel:'เอีย', final:'บ', tone_name:'เอก', th:'เกียบ'}]},
  {word:'จานข้าว', readingTH:'จาน-ข้าว', en:'jaan-khâao', zh:'飯盤', level:'初', category:'ร้านอาหาร', syls:[{cons:'จ', vowel:'อา', final:'น', tone_name:'สามัญ', th:'จาน'}, {cons:'ข', vowel:'อา', tone:'้', final:'ว', tone_name:'โท', th:'ข้าว'}]},
  {word:'รถเมล์', readingTH:'รด-เม', en:'rót-mee', zh:'公車', level:'中', category:'การเดินทาง', syls:[{cons:'ร', vowel:'โอะ', final:'ถ', tone_name:'ตรี', th:'รถ'}, {cons:'ม', vowel:'เอ', tone_name:'สามัญ', th:'เมล์'}]},
  {word:'รถทัวร์', readingTH:'รด-ทัว', en:'rót-thua', zh:'遊覽車', level:'中', category:'การเดินทาง', syls:[{cons:'ร', vowel:'โอะ', final:'ถ', tone_name:'ตรี', th:'รถ'}, {cons:'ท', vowel:'อัว', tone_name:'สามัญ', th:'ทัวร์'}]},
  {word:'เครื่องบิน', readingTH:'เครื่อง-บิน', en:'khrʉ̂ang-bin', zh:'飛機', level:'中', category:'การเดินทาง', syls:[{cons:'ค', cluster:'ร', vowel:'เอือ', tone:'่', final:'ง', tone_name:'โท', th:'เครื่อง'}, {cons:'บ', vowel:'อิ', final:'น', tone_name:'สามัญ', th:'บิน'}]},
  {word:'สถานี', readingTH:'สะ-ถา-นี', en:'sà-thǎa-nii', zh:'車站', level:'中', category:'การเดินทาง', syls:[{cons:'ส', vowel:'อะ', tone_name:'เอก', th:'ส'}, {cons:'ถ', vowel:'อา', final:'น', tone_name:'จัตวา', th:'ถา'}, {cons:'น', vowel:'อี', tone_name:'สามัญ', th:'นี'}]},
  {word:'สะพาน', readingTH:'สะ-พาน', en:'sà-phaan', zh:'橋', level:'初', category:'การเดินทาง', syls:[{cons:'ส', vowel:'อะ', tone_name:'เอก', th:'สะ'}, {cons:'พ', vowel:'อา', final:'น', tone_name:'สามัญ', th:'พาน'}]},
  {word:'ถนน', readingTH:'ถะ-หนน', en:'thà-nǒn', zh:'馬路', level:'中', category:'การเดินทาง', syls:[{cons:'ถ', vowel:'อะ', tone_name:'เอก', th:'ถ'}, {cons:'น', lead:'ห', vowel:'โอะ', final:'น', tone_name:'จัตวา', th:'นน'}]},
  {word:'ทางด่วน', readingTH:'ทาง-ด่วน', en:'thaang-dùan', zh:'高速公路', level:'初', category:'การเดินทาง', syls:[{cons:'ท', vowel:'อา', final:'ง', tone_name:'สามัญ', th:'ทาง'}, {cons:'ด', vowel:'อัว', tone:'่', final:'น', tone_name:'เอก', th:'ด่วน'}]},
  {word:'น้ำมัน', readingTH:'น้ำ-มัน', en:'nám-man', zh:'油', level:'初', category:'การเดินทาง', syls:[{cons:'น', vowel:'อำ', tone:'้', tone_name:'ตรี', th:'น้ำ'}, {cons:'ม', vowel:'อะ', final:'น', tone_name:'สามัญ', th:'มัน'}]},
  {word:'กระเป๋า', readingTH:'กระ-เป๋า', en:'grà-bpǎo', zh:'包包', level:'初', category:'การเดินทาง', syls:[{cons:'ก', cluster:'ร', vowel:'อะ', tone_name:'เอก', th:'กระ'}, {cons:'ป', vowel:'เอา', tone:'๋', tone_name:'จัตวา', th:'เป๋า'}]},
  {word:'ตำรวจ', readingTH:'ตำ-หรวด', en:'dtam-rùat', zh:'警察', level:'中', category:'การเดินทาง', syls:[{cons:'ต', vowel:'อำ', tone_name:'สามัญ', th:'ตำ'}, {cons:'ร', lead:'ห', vowel:'อัว', final:'จ', tone_name:'เอก', th:'รวจ'}]},
  {word:'ที่จอดรถ', readingTH:'ที่-จอด-รด', en:'thîi-jòot-rót', zh:'停車場', level:'中', category:'การเดินทาง', syls:[{cons:'ท', vowel:'อี', tone:'่', tone_name:'โท', th:'ที่'}, {cons:'จ', vowel:'ออ', final:'ด', tone_name:'เอก', th:'จอด'}, {cons:'ร', vowel:'โอะ', final:'ถ', tone_name:'ตรี', th:'รถ'}]},
  {word:'ทางม้าลาย', readingTH:'ทาง-ม้า-ลาย', en:'thaang-máa-laai', zh:'斑馬線', level:'中', category:'การเดินทาง', syls:[{cons:'ท', vowel:'อา', final:'ง', tone_name:'สามัญ', th:'ทาง'}, {cons:'ม', vowel:'อา', tone:'้', tone_name:'ตรี', th:'ม้า'}, {cons:'ล', vowel:'อา', final:'ย', tone_name:'สามัญ', th:'ลาย'}]},
  {word:'ระยะทาง', readingTH:'ระ-ยะ-ทาง', en:'rá-yá-thaang', zh:'距離', level:'中', category:'การเดินทาง', syls:[{cons:'ร', vowel:'อะ', tone_name:'ตรี', th:'ระ'}, {cons:'ย', vowel:'อะ', tone_name:'ตรี', th:'ยะ'}, {cons:'ท', vowel:'อา', final:'ง', tone_name:'สามัญ', th:'ทาง'}]},
  {word:'ป้ายรถเมล์', readingTH:'ป้าย-รด-เม', en:'bpâai-rót-mee', zh:'站牌', level:'中', category:'การเดินทาง', syls:[{cons:'ป', vowel:'อา', tone:'้', final:'ย', tone_name:'โท', th:'ป้าย'}, {cons:'ร', vowel:'โอะ', final:'ถ', tone_name:'ตรี', th:'รถ'}, {cons:'ม', vowel:'เอ', tone_name:'สามัญ', th:'เมล์'}]},
  {word:'พนักงาน', readingTH:'พะ-นัก-งาน', en:'phá-nák-ngaan', zh:'員工', level:'中', category:'โรงแรม', syls:[{cons:'พ', vowel:'อะ', tone_name:'ตรี', th:'พ'}, {cons:'น', vowel:'อะ', final:'ก', tone_name:'ตรี', th:'นัก'}, {cons:'ง', vowel:'อา', final:'น', tone_name:'สามัญ', th:'งาน'}]},
  {word:'เตียงนอน', readingTH:'เตียง-นอน', en:'dtiang-noon', zh:'床', level:'初', category:'โรงแรม', syls:[{cons:'ต', vowel:'เอีย', final:'ง', tone_name:'สามัญ', th:'เตียง'}, {cons:'น', vowel:'ออ', final:'น', tone_name:'สามัญ', th:'นอน'}]},
  {word:'ผ้าเช็ดตัว', readingTH:'ผ้า-เช็ด-ตัว', en:'phâa-chét-dtua', zh:'毛巾', level:'中', category:'โรงแรม', syls:[{cons:'ผ', vowel:'อา', tone:'้', tone_name:'โท', th:'ผ้า'}, {cons:'ช', vowel:'เอะ', final:'ด', tone_name:'ตรี', th:'เช็ด'}, {cons:'ต', vowel:'อัว', tone_name:'สามัญ', th:'ตัว'}]},
  {word:'กุญแจ', readingTH:'กุน-แจ', en:'gun-jae', zh:'鑰匙', level:'中', category:'โรงแรม', syls:[{cons:'ก', vowel:'อุ', final:'ญ', tone_name:'สามัญ', th:'กุญ'}, {cons:'จ', vowel:'แอ', tone_name:'สามัญ', th:'แจ'}]},
  {word:'ระเบียง', readingTH:'ระ-เบียง', en:'rá-biang', zh:'陽台', level:'初', category:'โรงแรม', syls:[{cons:'ร', vowel:'อะ', tone_name:'ตรี', th:'ระ'}, {cons:'บ', vowel:'เอีย', final:'ง', tone_name:'สามัญ', th:'เบียง'}]},
  {word:'ห้องอาหาร', readingTH:'ห้อง-อา-หาน', en:'hôong-aa-hǎan', zh:'餐廳', level:'中', category:'โรงแรม', syls:[{cons:'ห', vowel:'ออ', tone:'้', final:'ง', tone_name:'โท', th:'ห้อง'}, {cons:'อ', vowel:'อา', tone_name:'สามัญ', th:'อา'}, {cons:'ห', vowel:'อา', final:'ร', tone_name:'จัตวา', th:'หาร'}]},
  {word:'ค่าห้อง', readingTH:'ค่า-ห้อง', en:'khâa-hôong', zh:'房費', level:'初', category:'โรงแรม', syls:[{cons:'ค', vowel:'อา', tone:'่', tone_name:'โท', th:'ค่า'}, {cons:'ห', vowel:'ออ', tone:'้', final:'ง', tone_name:'โท', th:'ห้อง'}]},
  {word:'อาหารเช้า', readingTH:'อา-หาน-เช้า', en:'aa-hǎan-cháo', zh:'早餐', level:'中', category:'โรงแรม', syls:[{cons:'อ', vowel:'อา', tone_name:'สามัญ', th:'อา'}, {cons:'ห', vowel:'อา', final:'ร', tone_name:'จัตวา', th:'หาร'}, {cons:'ช', vowel:'เอา', tone:'้', tone_name:'ตรี', th:'เช้า'}]},
  {word:'สบู่', readingTH:'สะ-บู่', en:'sà-bùu', zh:'肥皂', level:'中', category:'โรงแรม', syls:[{cons:'ส', vowel:'อะ', tone_name:'เอก', th:'ส'}, {cons:'บ', vowel:'อู', tone:'่', tone_name:'เอก', th:'บู่'}]},
  {word:'ผ้าห่ม', readingTH:'ผ้า-ห่ม', en:'phâa-hòm', zh:'棉被', level:'初', category:'โรงแรม', syls:[{cons:'ผ', vowel:'อา', tone:'้', tone_name:'โท', th:'ผ้า'}, {cons:'ห', vowel:'โอะ', tone:'่', final:'ม', tone_name:'เอก', th:'ห่ม'}]},
  {word:'ทีวี', readingTH:'ที-วี', en:'thii-wii', zh:'電視', level:'初', category:'โรงแรม', syls:[{cons:'ท', vowel:'อี', tone_name:'สามัญ', th:'ที'}, {cons:'ว', vowel:'อี', tone_name:'สามัญ', th:'วี'}]},
  {word:'น้ำอุ่น', readingTH:'น้ำ-อุ่น', en:'nám-ùn', zh:'熱水', level:'初', category:'โรงแรม', syls:[{cons:'น', vowel:'อำ', tone:'้', tone_name:'ตรี', th:'น้ำ'}, {cons:'อ', vowel:'อุ', tone:'่', final:'น', tone_name:'เอก', th:'อุ่น'}]},
  {word:'ยาสีฟัน', readingTH:'ยา-สี-ฟัน', en:'yaa-sǐi-fan', zh:'牙膏', level:'中', category:'โรงแรม', syls:[{cons:'ย', vowel:'อา', tone_name:'สามัญ', th:'ยา'}, {cons:'ส', vowel:'อี', tone_name:'จัตวา', th:'สี'}, {cons:'ฟ', vowel:'อะ', final:'น', tone_name:'สามัญ', th:'ฟัน'}]},
  {word:'ต้อนรับ', readingTH:'ต้อน-รับ', en:'dtôon-ráp', zh:'接待', level:'初', category:'โรงแรม', syls:[{cons:'ต', vowel:'ออ', tone:'้', final:'น', tone_name:'โท', th:'ต้อน'}, {cons:'ร', vowel:'อะ', final:'บ', tone_name:'ตรี', th:'รับ'}]},
  {word:'เงินเดือน', readingTH:'เงิน-เดือน', en:'ngern-dʉan', zh:'薪水', level:'初', category:'งาน', syls:[{cons:'ง', vowel:'เออ', final:'น', tone_name:'สามัญ', th:'เงิน'}, {cons:'ด', vowel:'เอือ', final:'น', tone_name:'สามัญ', th:'เดือน'}]},
  {word:'หัวหน้า', readingTH:'หัว-หน้า', en:'hǔa-nâa', zh:'主管', level:'初', category:'งาน', syls:[{cons:'ห', vowel:'อัว', tone_name:'จัตวา', th:'หัว'}, {cons:'น', lead:'ห', vowel:'อา', tone:'้', tone_name:'โท', th:'หน้า'}]},
  {word:'โทรศัพท์', readingTH:'โท-ระ-สับ', en:'thoo-rá-sàp', zh:'電話', level:'中', category:'งาน', syls:[{cons:'ท', vowel:'โอ', tone_name:'สามัญ', th:'โทร'}, {cons:'ศ', vowel:'อะ', final:'พ', tone_name:'เอก', th:'ศัพท์'}]}, // Lin 2026-07-14: ยกเลิกพยางค์แทรก — พิมพ์ต้องเป็นตัวสะกดจริงเท่านั้น (โทร+ศัพท์) คำอ่าน 3 พยางค์อยู่ที่ readingTH เท่านั้น
  {word:'เอกสาร', readingTH:'เอก-กะ-สาน', en:'èek-gà-sǎan', zh:'文件', level:'中', category:'งาน', syls:[{cons:'อ', vowel:'เอ', final:'ก', tone_name:'เอก', th:'เอก'}, {cons:'ส', vowel:'อา', final:'ร', tone_name:'จัตวา', th:'สาร'}]}, // Lin 2026-07-14: ยกเลิกพยางค์แทรก — พิมพ์ต้องเป็นตัวสะกดจริงเท่านั้น (เอก+สาร) คำอ่าน 3 พยางค์อยู่ที่ readingTH เท่านั้น
  {word:'สัมภาษณ์', readingTH:'สำ-พาด', en:'sǎm-phâat', zh:'面試', level:'中', category:'งาน', syls:[{cons:'ส', vowel:'อะ', final:'ม', tone_name:'จัตวา', th:'สัม'}, {cons:'พ', vowel:'อา', final:'ษ', tone_name:'โท', th:'ภาษณ์'}]},
  {word:'ตำแหน่ง', readingTH:'ตำ-แหน่ง', en:'dtam-nàeng', zh:'職位', level:'中', category:'งาน', syls:[{cons:'ต', vowel:'อำ', tone_name:'สามัญ', th:'ตำ'}, {cons:'น', lead:'ห', vowel:'แอ', tone:'่', final:'ง', tone_name:'เอก', th:'แหน่ง'}]},
  {word:'ออฟฟิศ', readingTH:'ออบ-ฟิด', en:'óp-fít', zh:'辦公室', level:'中', category:'งาน', syls:[{cons:'อ', vowel:'ออ', final:'ฟ', tone_name:'ตรี', th:'ออฟ'}, {cons:'ฟ', vowel:'อิ', final:'ศ', tone_name:'ตรี', th:'ฟิศ'}]},
  {word:'งานเลี้ยง', readingTH:'งาน-เลี้ยง', en:'ngaan-líang', zh:'聚會', level:'中', category:'งาน', syls:[{cons:'ง', vowel:'อา', final:'น', tone_name:'สามัญ', th:'งาน'}, {cons:'ล', vowel:'เอีย', tone:'้', final:'ง', tone_name:'ตรี', th:'เลี้ยง'}]},
  {word:'อีเมล', readingTH:'อี-เมล', en:'ii-meeo', zh:'電子郵件', level:'中', category:'งาน', syls:[{cons:'อ', vowel:'อี', tone_name:'สามัญ', th:'อี'}, {cons:'ม', vowel:'เอ', final:'ล', tone_name:'สามัญ', th:'เมล'}]},
  {word:'โต๊ะทำงาน', readingTH:'โต๊ะ-ทำ-งาน', en:'tó-tham-ngaan', zh:'辦公桌', level:'中', category:'งาน', syls:[{cons:'ต', vowel:'โอะ', tone:'๊', tone_name:'ตรี', th:'โต๊ะ'}, {cons:'ท', vowel:'อำ', tone_name:'สามัญ', th:'ทำ'}, {cons:'ง', vowel:'อา', final:'น', tone_name:'สามัญ', th:'งาน'}]},
  {word:'วันหยุด', readingTH:'วัน-หยุด', en:'wan-yùt', zh:'假日', level:'中', category:'งาน', syls:[{cons:'ว', vowel:'อะ', final:'น', tone_name:'สามัญ', th:'วัน'}, {cons:'ย', lead:'ห', vowel:'อุ', final:'ด', tone_name:'เอก', th:'หยุด'}]},
  {word:'นามบัตร', readingTH:'นาม-บัด', en:'naam-bàt', zh:'名片', level:'中', category:'งาน', syls:[{cons:'น', vowel:'อา', final:'ม', tone_name:'สามัญ', th:'นาม'}, {cons:'บ', vowel:'อะ', final:'ตร', tone_name:'เอก', th:'บัตร'}]},
  {word:'เลขา', readingTH:'เล-ขา', en:'lee-khǎa', zh:'秘書', level:'初', category:'งาน', syls:[{cons:'ล', vowel:'เอ', tone_name:'สามัญ', th:'เล'}, {cons:'ข', vowel:'อา', tone_name:'จัตวา', th:'ขา'}]},
  {word:'ประชุมงาน', readingTH:'ประ-ชุม-งาน', en:'bprà-chum-ngaan', zh:'工作會議', level:'中', category:'งาน', syls:[{cons:'ป', cluster:'ร', vowel:'อะ', tone_name:'เอก', th:'ประ'}, {cons:'ช', vowel:'อุ', final:'ม', tone_name:'สามัญ', th:'ชุม'}, {cons:'ง', vowel:'อา', final:'น', tone_name:'สามัญ', th:'งาน'}]},
  {word:'เวลางาน', readingTH:'เว-ลา-งาน', en:'wee-laa-ngaan', zh:'上班時間', level:'中', category:'งาน', syls:[{cons:'ว', vowel:'เอ', tone_name:'สามัญ', th:'เว'}, {cons:'ล', vowel:'อา', tone_name:'สามัญ', th:'ลา'}, {cons:'ง', vowel:'อา', final:'น', tone_name:'สามัญ', th:'งาน'}]},
  {word:'เสื้อผ้า', readingTH:'เสื้อ-ผ้า', en:'sʉ̂a-phâa', zh:'衣服', level:'初', category:'ช้อปปิ้ง', syls:[{cons:'ส', vowel:'เอือ', tone:'้', tone_name:'โท', th:'เสื้อ'}, {cons:'ผ', vowel:'อา', tone:'้', tone_name:'โท', th:'ผ้า'}]},
  {word:'รองเท้า', readingTH:'รอง-เท้า', en:'roong-tháo', zh:'鞋子', level:'初', category:'ช้อปปิ้ง', syls:[{cons:'ร', vowel:'ออ', final:'ง', tone_name:'สามัญ', th:'รอง'}, {cons:'ท', vowel:'เอา', tone:'้', tone_name:'ตรี', th:'เท้า'}]},
  {word:'กระเป๋าเงิน', readingTH:'กระ-เป๋า-เงิน', en:'grà-bpǎo-ngern', zh:'錢包', level:'中', category:'ช้อปปิ้ง', syls:[{cons:'ก', cluster:'ร', vowel:'อะ', tone_name:'เอก', th:'กระ'}, {cons:'ป', vowel:'เอา', tone:'๋', tone_name:'จัตวา', th:'เป๋า'}, {cons:'ง', vowel:'เออ', final:'น', tone_name:'สามัญ', th:'เงิน'}]},
  {word:'ของขวัญ', readingTH:'ของ-ขวัน', en:'khǒong-khwǎn', zh:'禮物', level:'中', category:'ช้อปปิ้ง', syls:[{cons:'ข', vowel:'ออ', final:'ง', tone_name:'จัตวา', th:'ของ'}, {cons:'ข', cluster:'ว', vowel:'อะ', final:'น', tone_name:'จัตวา', th:'ขวัญ'}]},
  {word:'ตลาด', readingTH:'ตะ-หลาด', en:'dta-làat', zh:'市場', level:'中', category:'ช้อปปิ้ง', syls:[{cons:'ต', vowel:'อะ', tone_name:'เอก', th:'ต'}, {cons:'ล', lead:'ห', vowel:'อา', final:'ด', tone_name:'เอก', th:'ลาด'}]},
  {word:'ร้านค้า', readingTH:'ร้าน-ค้า', en:'ráan-kháa', zh:'商店', level:'初', category:'ช้อปปิ้ง', syls:[{cons:'ร', vowel:'อา', tone:'้', final:'น', tone_name:'ตรี', th:'ร้าน'}, {cons:'ค', vowel:'อา', tone:'้', tone_name:'ตรี', th:'ค้า'}]},
  {word:'สินค้า', readingTH:'สิน-ค้า', en:'sǐn-kháa', zh:'商品', level:'初', category:'ช้อปปิ้ง', syls:[{cons:'ส', vowel:'อิ', final:'น', tone_name:'จัตวา', th:'สิน'}, {cons:'ค', vowel:'อา', tone:'้', tone_name:'ตรี', th:'ค้า'}]},
  {word:'คุณภาพ', readingTH:'คุน-นะ-พาบ', en:'khun-ná-phâap', zh:'品質', level:'中', category:'ช้อปปิ้ง', syls:[{cons:'ค', vowel:'อุ', final:'ณ', tone_name:'สามัญ', th:'คุณ'}, {cons:'ภ', vowel:'อา', final:'พ', tone_name:'โท', th:'ภาพ'}]}, // Lin 2026-07-14: ยกเลิกพยางค์แทรก — พิมพ์ต้องเป็นตัวสะกดจริงเท่านั้น (คุณ+ภาพ) คำอ่าน 3 พยางค์อยู่ที่ readingTH เท่านั้น
  {word:'ส่วนลด', readingTH:'ส่วน-ลด', en:'sùan-lót', zh:'折扣', level:'初', category:'ช้อปปิ้ง', syls:[{cons:'ส', vowel:'อัว', tone:'่', final:'น', tone_name:'เอก', th:'ส่วน'}, {cons:'ล', vowel:'โอะ', final:'ด', tone_name:'ตรี', th:'ลด'}]},
  {word:'เงินสด', readingTH:'เงิน-สด', en:'ngern-sòt', zh:'現金', level:'初', category:'ช้อปปิ้ง', syls:[{cons:'ง', vowel:'เออ', final:'น', tone_name:'สามัญ', th:'เงิน'}, {cons:'ส', vowel:'โอะ', final:'ด', tone_name:'เอก', th:'สด'}]},
  {word:'เงินทอน', readingTH:'เงิน-ทอน', en:'ngern-thoon', zh:'找零', level:'初', category:'ช้อปปิ้ง', syls:[{cons:'ง', vowel:'เออ', final:'น', tone_name:'สามัญ', th:'เงิน'}, {cons:'ท', vowel:'ออ', final:'น', tone_name:'สามัญ', th:'ทอน'}]},
  {word:'ขนาด', readingTH:'ขะ-หนาด', en:'khà-nàat', zh:'尺寸', level:'中', category:'ช้อปปิ้ง', syls:[{cons:'ข', vowel:'อะ', tone_name:'เอก', th:'ข'}, {cons:'น', lead:'ห', vowel:'อา', final:'ด', tone_name:'เอก', th:'นาด'}]},
  {word:'รองเท้าแตะ', readingTH:'รอง-เท้า-แตะ', en:'roong-tháo-dtàe', zh:'拖鞋', level:'中', category:'ช้อปปิ้ง', syls:[{cons:'ร', vowel:'ออ', final:'ง', tone_name:'สามัญ', th:'รอง'}, {cons:'ท', vowel:'เอา', tone:'้', tone_name:'ตรี', th:'เท้า'}, {cons:'ต', vowel:'แอะ', tone_name:'เอก', th:'แตะ'}]},
  {word:'เครื่องสำอาง', readingTH:'เครื่อง-สำ-อาง', en:'khrʉ̂ang-sǎm-aang', zh:'化妝品', level:'中', category:'ช้อปปิ้ง', syls:[{cons:'ค', cluster:'ร', vowel:'เอือ', tone:'่', final:'ง', tone_name:'โท', th:'เครื่อง'}, {cons:'ส', vowel:'อะ', final:'ม', tone_name:'จัตวา', th:'สำ'}, {cons:'อ', vowel:'อา', final:'ง', tone_name:'สามัญ', th:'อาง'}]},
  {word:'แว่นตา', readingTH:'แว่น-ตา', en:'wâen-dtaa', zh:'眼鏡', level:'初', category:'ช้อปปิ้ง', syls:[{cons:'ว', vowel:'แอ', tone:'่', final:'น', tone_name:'โท', th:'แว่น'}, {cons:'ต', vowel:'อา', tone_name:'สามัญ', th:'ตา'}]},
  {word:'เวลา', readingTH:'เว-ลา', en:'wee-laa', zh:'時間', level:'初', category:'เวลา', syls:[{cons:'ว', vowel:'เอ', tone_name:'สามัญ', th:'เว'}, {cons:'ล', vowel:'อา', tone_name:'สามัญ', th:'ลา'}]},
  {word:'นาฬิกา', readingTH:'นา-ลิ-กา', en:'naa-lí-gaa', zh:'時鐘', level:'中', category:'เวลา', syls:[{cons:'น', vowel:'อา', tone_name:'สามัญ', th:'นา'}, {cons:'ล', vowel:'อิ', tone_name:'ตรี', th:'ฬิ'}, {cons:'ก', vowel:'อา', tone_name:'สามัญ', th:'กา'}]},
  {word:'อากาศ', readingTH:'อา-กาด', en:'aa-gàat', zh:'天氣', level:'中', category:'ทักทาย/เวลา/แนวคิด', syls:[{cons:'อ', vowel:'อา', tone_name:'สามัญ', th:'อา'}, {cons:'ก', vowel:'อา', final:'ศ', tone_name:'เอก', th:'กาศ'}]},
  {word:'ครอบครัว', readingTH:'ครอบ-ครัว', en:'khrôop-khrua', zh:'家庭', level:'中', category:'ทักทาย/เวลา/แนวคิด', syls:[{cons:'ค', cluster:'ร', vowel:'ออ', final:'บ', tone_name:'โท', th:'ครอบ'}, {cons:'ค', cluster:'ร', vowel:'อัว', tone_name:'สามัญ', th:'ครัว'}]},
  {word:'ภาษา', readingTH:'พา-สา', en:'phaa-sǎa', zh:'語言', level:'中', category:'ทักทาย/เวลา/แนวคิด', syls:[{cons:'พ', vowel:'อา', tone_name:'สามัญ', th:'ภา'}, {cons:'ส', vowel:'อา', tone_name:'จัตวา', th:'ษา'}]},
  {word:'ประเทศ', readingTH:'ประ-เทด', en:'bprà-thêet', zh:'國家', level:'中', category:'ทักทาย/เวลา/แนวคิด', syls:[{cons:'ป', cluster:'ร', vowel:'อะ', tone_name:'เอก', th:'ประ'}, {cons:'ท', vowel:'เอ', final:'ศ', tone_name:'โท', th:'เทศ'}]},
  {word:'เมืองไทย', readingTH:'เมือง-ไท', en:'mʉang-thai', zh:'泰國', level:'中', category:'แนวคิด', syls:[{cons:'ม', vowel:'เอือ', final:'ง', tone_name:'สามัญ', th:'เมือง'}, {cons:'ท', vowel:'ไอ', final:'ย', tone_name:'สามัญ', th:'ไทย'}]},
  {word:'วันนี้', readingTH:'วัน-นี้', en:'wan-níi', zh:'今天', level:'初', category:'ทักทาย/เวลา/แนวคิด', syls:[{cons:'ว', vowel:'อะ', final:'น', tone_name:'สามัญ', th:'วัน'}, {cons:'น', vowel:'อี', tone:'้', tone_name:'ตรี', th:'นี้'}]},
  {word:'พรุ่งนี้', readingTH:'พรุ่ง-นี้', en:'phrûng-níi', zh:'明天', level:'初', category:'ทักทาย/เวลา/แนวคิด', syls:[{cons:'พ', cluster:'ร', vowel:'อุ', tone:'่', final:'ง', tone_name:'โท', th:'พรุ่ง'}, {cons:'น', vowel:'อี', tone:'้', tone_name:'ตรี', th:'นี้'}]},
  {word:'เมื่อวาน', readingTH:'เมื่อ-วาน', en:'mʉ̂a-waan', zh:'昨天', level:'初', category:'ทักทาย/เวลา/แนวคิด', syls:[{cons:'ม', vowel:'เอือ', tone:'่', tone_name:'โท', th:'เมื่อ'}, {cons:'ว', vowel:'อา', final:'น', tone_name:'สามัญ', th:'วาน'}]},
  {word:'ปัจจุบัน', readingTH:'ปัด-จุ-บัน', en:'bpàt-jù-ban', zh:'現在', level:'中', category:'เวลา', syls:[{cons:'ป', vowel:'อะ', final:'จ', tone_name:'เอก', th:'ปัจ'}, {cons:'จ', vowel:'อุ', tone_name:'เอก', th:'จุ'}, {cons:'บ', vowel:'อะ', final:'น', tone_name:'สามัญ', th:'บัน'}]},
  {word:'อนาคต', readingTH:'อะ-นา-คด', en:'à-naa-khót', zh:'未來', level:'中', category:'เวลา', syls:[{cons:'อ', vowel:'อะ', tone_name:'เอก', th:'อ'}, {cons:'น', vowel:'อา', tone_name:'สามัญ', th:'นา'}, {cons:'ค', vowel:'โอะ', final:'ต', tone_name:'ตรี', th:'คต'}]},
  {word:'ดนตรี', readingTH:'ดน-ตรี', en:'don-dtrii', zh:'音樂', level:'初', category:'ทักทาย/เวลา/แนวคิด', syls:[{cons:'ด', vowel:'โอะ', final:'น', tone_name:'สามัญ', th:'ดน'}, {cons:'ต', cluster:'ร', vowel:'อี', tone_name:'สามัญ', th:'ตรี'}]},
  {word:'อาชีพ', readingTH:'อา-ชีบ', en:'aa-chîip', zh:'職業', level:'中', category:'ทักทาย/เวลา/แนวคิด', syls:[{cons:'อ', vowel:'อา', tone_name:'สามัญ', th:'อา'}, {cons:'ช', vowel:'อี', final:'พ', tone_name:'โท', th:'ชีพ'}]},
  {word:'น้ำเงิน', readingTH:'น้ำ-เงิน', en:'nám-ngern', zh:'深藍', level:'初', category:'สี', syls:[{cons:'น', vowel:'อำ', tone:'้', tone_name:'ตรี', th:'น้ำ'}, {cons:'ง', vowel:'เออ', final:'น', tone_name:'สามัญ', th:'เงิน'}]},
  {word:'ชมพู', readingTH:'ชม-พู', en:'chom-phuu', zh:'粉紅', level:'初', category:'สี', syls:[{cons:'ช', vowel:'โอะ', final:'ม', tone_name:'สามัญ', th:'ชม'}, {cons:'พ', vowel:'อู', tone_name:'สามัญ', th:'พู'}]},
  {word:'น้ำตาล', readingTH:'น้ำ-ตาน', en:'nám-taan', zh:'咖啡色', level:'初', category:'สี', syls:[{cons:'น', vowel:'อำ', tone:'้', tone_name:'ตรี', th:'น้ำ'}, {cons:'ต', vowel:'อา', final:'ล', tone_name:'สามัญ', th:'ตาล'}]},
  {word:'ฉบับ', readingTH:'ฉะ-บับ', en:'chà-bàp', zh:'份/冊', level:'中', category:'ลักษณนาม', syls:[{cons:'ฉ', vowel:'อะ', tone_name:'เอก', th:'ฉ'}, {cons:'บ', vowel:'อะ', final:'บ', tone_name:'เอก', th:'บับ'}]},
  {word:'หัวเราะ', readingTH:'หัว-เราะ', en:'hǔa-ró', zh:'笑', level:'初', category:'กริยา', syls:[{cons:'ห', vowel:'อัว', tone_name:'จัตวา', th:'หัว'}, {cons:'ร', vowel:'เอาะ', tone_name:'ตรี', th:'เราะ'}]},
  {word:'สว่าง', readingTH:'สะ-หว่าง', en:'sà-wàang', zh:'亮', level:'中', category:'คำขยาย', syls:[{cons:'ส', vowel:'อะ', tone_name:'เอก', th:'ส'}, {cons:'ว', lead:'ห', vowel:'อา', tone:'่', final:'ง', tone_name:'เอก', th:'ว่าง'}]},
  {word:'สะอาด', readingTH:'สะ-อาด', en:'sà-àat', zh:'乾淨', level:'初', category:'คำขยาย', syls:[{cons:'ส', vowel:'อะ', tone_name:'เอก', th:'สะ'}, {cons:'อ', vowel:'อา', final:'ด', tone_name:'เอก', th:'อาด'}]},
  {word:'สกปรก', readingTH:'สก-กะ-ปรก', en:'sòk-gà-pròk', zh:'髒', level:'中', category:'คำขยาย', syls:[{cons:'ส', vowel:'โอะ', final:'ก', tone_name:'เอก', th:'สก'}, {cons:'ป', cluster:'ร', vowel:'โอะ', final:'ก', tone_name:'เอก', th:'ปรก'}]}, // Lin 2026-07-14: ยกเลิกพยางค์แทรก — พิมพ์ต้องเป็นตัวสะกดจริงเท่านั้น (สก+ปรก) คำอ่าน 3 พยางค์อยู่ที่ readingTH เท่านั้น

  // 2026-07-15: ชุดทดสอบแรกจาก System 2 (AI ร่าง + เช็ค 4 ชั้น: Claude x2 + tone-engine.js + Gemini ตรงกันหมด) — Lin approve แล้ว
  // เติมหมวดเดิม สัตว์/ธรรมชาติ (บางที่สุดในคลัง):
  {word:'ต้นไม้', readingTH:'ต้น-ไม้', en:'dtôn-máai', zh:'樹', level:'初', category:'สัตว์/ธรรมชาติ', syls:[{cons:'ต', vowel:'โอะ', tone:'้', final:'น', tone_name:'โท', th:'ต้น'}, {cons:'ม', vowel:'ไอ', tone:'้', tone_name:'ตรี', th:'ไม้'}]},
  {word:'ภูเขา', readingTH:'ภู-เขา', en:'phuu-khǎo', zh:'山', level:'初', category:'สัตว์/ธรรมชาติ', syls:[{cons:'ภ', vowel:'อู', tone_name:'สามัญ', th:'ภู'}, {cons:'ข', vowel:'เอา', tone_name:'จัตวา', th:'เขา'}]},
  {word:'ทะเล', readingTH:'ทะ-เล', en:'thá-lay', zh:'海', level:'初', category:'สัตว์/ธรรมชาติ', syls:[{cons:'ท', vowel:'อะ', tone_name:'ตรี', th:'ทะ'}, {cons:'ล', vowel:'เอ', tone_name:'สามัญ', th:'เล'}]},
  {word:'ดาว', en:'daao', zh:'星星', level:'初', category:'สัตว์/ธรรมชาติ', syls:[{cons:'ด', vowel:'อา', final:'ว', tone_name:'สามัญ', th:'ดาว'}]},
  {word:'เมฆ', en:'mêek', zh:'雲', level:'初', category:'สัตว์/ธรรมชาติ', syls:[{cons:'ม', vowel:'เอ', final:'ฆ', tone_name:'โท', th:'เมฆ'}]},
  // เปิดหมวดใหม่ ทิศทาง (ยังไม่เคยมีในคลัง):
  {word:'ซ้าย', en:'sáai', zh:'左', level:'初', category:'ทิศทาง', syls:[{cons:'ซ', vowel:'อา', tone:'้', final:'ย', tone_name:'ตรี', th:'ซ้าย'}]},
  {word:'ขวา', en:'khwǎa', zh:'右', level:'初', category:'ทิศทาง', syls:[{cons:'ข', cluster:'ว', vowel:'อา', tone_name:'จัตวา', th:'ขวา'}]},
  {word:'เหนือ', en:'něua', zh:'北', level:'初', category:'ทิศทาง', syls:[{cons:'น', lead:'ห', vowel:'เอือ', tone_name:'จัตวา', th:'เหนือ'}]},
  {word:'ใต้', en:'tâi', zh:'南', level:'初', category:'ทิศทาง', syls:[{cons:'ต', vowel:'ใอ', tone:'้', tone_name:'โท', th:'ใต้'}]},
  {word:'ตรงไป', readingTH:'ตรง-ไป', en:'dtrong-bpai', zh:'直走', level:'初', category:'ทิศทาง', syls:[{cons:'ต', cluster:'ร', vowel:'โอะ', final:'ง', tone_name:'สามัญ', th:'ตรง'}, {cons:'ป', vowel:'ไอ', tone_name:'สามัญ', th:'ไป'}]},

  // 2026-07-15 รอบ 2: ชุด 36 คำจาก System 2 (AI ร่าง + เช็ค 4 ชั้น: Claude x2 + tone-engine.js + Gemini) + Lin แก้/ยืนยันเองหลายจุด — Lin approve แล้ว ("เอาขึ้นเกมเลย")
  // อ้างอิงกฎ readingTH/spellingTH ทั้งหมด + log การแก้ทุกจุด: Projects/MD/2026-07-15_คำอ่าน-กฎอ้างอิงกลาง.md
  // เติมหมวดเดิม ทิศทาง / เวลา / สัตว์-ธรรมชาติ + เปิดหมวดใหม่ แนวคิด (คำนามธรรม):
  {word:'ใกล้', en:'glâi', zh:'近', level:'初', category:'ทิศทาง', syls:[{cons:'ก', cluster:'ล', vowel:'ใอ', tone:'้', tone_name:'โท', th:'ใกล้'}]},
  {word:'ไกล', en:'glai', zh:'遠', level:'初', category:'ทิศทาง', syls:[{cons:'ก', cluster:'ล', vowel:'ไอ', tone_name:'สามัญ', th:'ไกล'}]},
  {word:'เช้า', en:'cháo', zh:'早上', level:'初', category:'เวลา', syls:[{cons:'ช', vowel:'เอา', tone:'้', tone_name:'ตรี', th:'เช้า'}]},
  {word:'สาย', en:'sǎai', zh:'遲/晚一點', level:'初', category:'เวลา', syls:[{cons:'ส', vowel:'อา', final:'ย', tone_name:'จัตวา', th:'สาย'}]},
  {word:'บ่าย', en:'bàai', zh:'下午', level:'初', category:'เวลา', syls:[{cons:'บ', vowel:'อา', tone:'่', final:'ย', tone_name:'เอก', th:'บ่าย'}]},
  {word:'ค่ำ', en:'khâm', zh:'傍晚', level:'初', category:'เวลา', syls:[{cons:'ค', vowel:'อำ', tone:'่', tone_name:'โท', th:'ค่ำ'}]},
  {word:'ดึก', en:'dèuk', zh:'深夜', level:'初', category:'เวลา', syls:[{cons:'ด', vowel:'อึ', final:'ก', tone_name:'เอก', th:'ดึก'}]},
  {word:'ครั้ง', en:'kráng', zh:'次', level:'初', category:'เวลา', syls:[{cons:'ค', cluster:'ร', vowel:'อะ', tone:'้', final:'ง', tone_name:'ตรี', th:'ครั้ง'}]},
  {word:'วัว', en:'wua', zh:'牛', level:'初', category:'สัตว์/ธรรมชาติ', syls:[{cons:'ว', vowel:'อัว', tone_name:'สามัญ', th:'วัว'}]},
  {word:'เป็ด', en:'bpèt', zh:'鴨', level:'初', category:'สัตว์/ธรรมชาติ', syls:[{cons:'ป', vowel:'เอะ', final:'ด', tone_name:'เอก', th:'เป็ด'}]},
  {word:'งู', en:'nguu', zh:'蛇', level:'初', category:'สัตว์/ธรรมชาติ', syls:[{cons:'ง', vowel:'อู', tone_name:'สามัญ', th:'งู'}]},
  {word:'มด', en:'mót', zh:'螞蟻', level:'初', category:'สัตว์/ธรรมชาติ', syls:[{cons:'ม', vowel:'โอะ', final:'ด', tone_name:'ตรี', th:'มด'}]},
  {word:'หนู', en:'nǔu', zh:'老鼠', level:'初', category:'สัตว์/ธรรมชาติ', syls:[{cons:'น', lead:'ห', vowel:'อู', tone_name:'จัตวา', th:'หนู'}]},
  {word:'กบ', en:'gòp', zh:'青蛙', level:'初', category:'สัตว์/ธรรมชาติ', syls:[{cons:'ก', vowel:'โอะ', final:'บ', tone_name:'เอก', th:'กบ'}]},
  {word:'กลางวัน', readingTH:'กลาง-วัน', en:'glaang-wan', zh:'白天', level:'初', category:'เวลา', syls:[{cons:'ก', cluster:'ล', vowel:'อา', final:'ง', tone_name:'สามัญ', th:'กลาง'}, {cons:'ว', vowel:'อะ', final:'น', tone_name:'สามัญ', th:'วัน'}]}, // ระดับยืนยันจาก Lin 2026-07-15: เป็น 初 (คำง่ายใช้บ่อย)
  {word:'กลางคืน', readingTH:'กลาง-คืน', en:'glaang-kheun', zh:'夜晚', level:'初', category:'เวลา', syls:[{cons:'ก', cluster:'ล', vowel:'อา', final:'ง', tone_name:'สามัญ', th:'กลาง'}, {cons:'ค', vowel:'อื', final:'น', tone_name:'สามัญ', th:'คืน'}]}, // ระดับยืนยันจาก Lin 2026-07-15: เป็น 初
  {word:'อดีต', readingTH:'อะ-ดีด', en:'à-dìit', zh:'過去', level:'中', category:'เวลา', syls:[{cons:'อ', vowel:'อะ', tone_name:'เอก', th:'อ'}, {cons:'ด', vowel:'อี', final:'ต', tone_name:'เอก', th:'ดีต'}]}, // readingTH=เสียงจริง(อะ-ดีด) / ตัวสะกดจริงสำหรับพิมพ์ = syls[].th ต่อกัน(อ-ดีต)
  {word:'ทุกวัน', readingTH:'ทุก-วัน', en:'thúk-wan', zh:'每天', level:'初', category:'เวลา', syls:[{cons:'ท', vowel:'อุ', final:'ก', tone_name:'ตรี', th:'ทุก'}, {cons:'ว', vowel:'อะ', final:'น', tone_name:'สามัญ', th:'วัน'}]}, // ระดับยืนยันจาก Lin 2026-07-15: เป็น 初
  {word:'นาที', readingTH:'นา-ที', en:'naa-thii', zh:'分鐘', level:'中', category:'เวลา', syls:[{cons:'น', vowel:'อา', tone_name:'สามัญ', th:'นา'}, {cons:'ท', vowel:'อี', tone_name:'สามัญ', th:'ที'}]},
  {word:'ชั่วโมง', readingTH:'ชั่ว-โมง', en:'chûa-moong', zh:'小時', level:'中', category:'เวลา', syls:[{cons:'ช', vowel:'อัว', tone:'่', tone_name:'โท', th:'ชั่ว'}, {cons:'ม', vowel:'โอ', final:'ง', tone_name:'สามัญ', th:'โมง'}]},
  {word:'เมื่อกี้', readingTH:'เมื่อ-กี้', en:'mʉ̂a-gîi', zh:'剛才', level:'中', category:'เวลา', syls:[{cons:'ม', vowel:'เอือ', tone:'่', tone_name:'โท', th:'เมื่อ'}, {cons:'ก', vowel:'อี', tone:'้', tone_name:'ตรี', th:'กี้'}]}, // ⚠️ กี้ ยืนยันจาก Lin 2026-07-15 ว่าเป็น ตรี(4) — แต่เครื่องคิดจริง (tone-engine.js: อักษรกลาง+ไม้โท=โท เสมอ) + subagent อิสระ + Gemini ตอบตรงกันหมดว่าเป็น โท(3) ถ้าเอาคำนี้เข้า words-data.js จริง ตัวเช็ก mismatch อัตโนมัติ (regression-check-tone.js) จะขึ้น flag คำนี้ทุกรอบ เป็นเรื่องปกติไม่ใช่บั๊ก ให้ข้ามได้
  {word:'เดี๋ยวนี้', readingTH:'เดี๋ยว-นี้', en:'dǐao-níi', zh:'現在/馬上', level:'中', category:'เวลา', syls:[{cons:'ด', vowel:'เอีย', tone:'๋', final:'ว', tone_name:'จัตวา', th:'เดี๋ยว'}, {cons:'น', vowel:'อี', tone:'้', tone_name:'ตรี', th:'นี้'}]},
  {word:'วินาที', readingTH:'วิ-นา-ที', en:'wí-naa-thii', zh:'秒', level:'中', category:'เวลา', syls:[{cons:'ว', vowel:'อิ', tone_name:'ตรี', th:'วิ'}, {cons:'น', vowel:'อา', tone_name:'สามัญ', th:'นา'}, {cons:'ท', vowel:'อี', tone_name:'สามัญ', th:'ที'}]},
  {word:'ความรัก', readingTH:'ความ-รัก', en:'khwaam-rák', zh:'愛', level:'中', category:'แนวคิด', syls:[{cons:'ค', cluster:'ว', vowel:'อา', final:'ม', tone_name:'สามัญ', th:'ความ'}, {cons:'ร', vowel:'อะ', final:'ก', tone_name:'ตรี', th:'รัก'}]},
  {word:'ความสุข', readingTH:'ความ-สุก', en:'khwaam-sùk', zh:'幸福', level:'中', category:'แนวคิด', syls:[{cons:'ค', cluster:'ว', vowel:'อา', final:'ม', tone_name:'สามัญ', th:'ความ'}, {cons:'ส', vowel:'อุ', final:'ข', tone_name:'เอก', th:'สุข'}]}, // readingTH=ความ-สุก (ข→ก ตัวแทนแม่กก) / ตัวสะกดจริง = syls[].th ต่อกัน(ความ-สุข)
  {word:'ความฝัน', readingTH:'ความ-ฝัน', en:'khwaam-fǎn', zh:'夢想', level:'中', category:'แนวคิด', syls:[{cons:'ค', cluster:'ว', vowel:'อา', final:'ม', tone_name:'สามัญ', th:'ความ'}, {cons:'ฝ', vowel:'อะ', final:'น', tone_name:'จัตวา', th:'ฝัน'}]},
  {word:'ความจริง', readingTH:'ความ-จิง', en:'khwaam-jing', zh:'真相', level:'中', category:'แนวคิด', syls:[{cons:'ค', cluster:'ว', vowel:'อา', final:'ม', tone_name:'สามัญ', th:'ความ'}, {cons:'จ', cluster:'ร', vowel:'อิ', final:'ง', tone_name:'สามัญ', th:'จริง'}]}, // ยืนยันวรรณยุกต์ถูกต้องจาก Lin — readingTH=ความ-จิง (ร ไม่ออกเสียง) / ตัวสะกดจริง = syls[].th ต่อกัน(ความ-จริง)
  {word:'โอกาส', readingTH:'โอ-กาด', en:'oo-gàat', zh:'機會', level:'中', category:'แนวคิด', syls:[{cons:'อ', vowel:'โอ', tone_name:'สามัญ', th:'โอ'}, {cons:'ก', vowel:'อา', final:'ส', tone_name:'เอก', th:'กาส'}]}, // readingTH=โอ-กาด (ส→ด ตัวแทนแม่กด) / ตัวสะกดจริง = syls[].th ต่อกัน(โอ-กาส)
  {word:'ปัญหา', readingTH:'ปัน-หา', en:'pan-hǎa', zh:'問題', level:'中', category:'แนวคิด', syls:[{cons:'ป', vowel:'อะ', final:'ญ', tone_name:'สามัญ', th:'ปัญ'}, {cons:'ห', vowel:'อา', tone_name:'จัตวา', th:'หา'}]},
  {word:'เป้าหมาย', readingTH:'เป้า-หมาย', en:'bpâo-mǎai', zh:'目標', level:'中', category:'แนวคิด', syls:[{cons:'ป', vowel:'เอา', tone:'้', tone_name:'โท', th:'เป้า'}, {cons:'ม', lead:'ห', vowel:'อา', final:'ย', tone_name:'จัตวา', th:'หมาย'}]},
  {word:'ความคิด', readingTH:'ความ-คิด', en:'khwaam-khít', zh:'想法', level:'中', category:'แนวคิด', syls:[{cons:'ค', cluster:'ว', vowel:'อา', final:'ม', tone_name:'สามัญ', th:'ความ'}, {cons:'ค', vowel:'อิ', final:'ด', tone_name:'ตรี', th:'คิด'}]},
  {word:'แม่น้ำ', readingTH:'แม่-น้ำ', en:'mâe-náam', zh:'河', level:'中', category:'สัตว์/ธรรมชาติ', syls:[{cons:'ม', vowel:'แอ', tone:'่', tone_name:'โท', th:'แม่'}, {cons:'น', vowel:'อำ', tone:'้', tone_name:'ตรี', th:'น้ำ'}]},
  {word:'ดอกไม้', readingTH:'ดอก-ไม้', en:'dòok-máai', zh:'花', level:'中', category:'สัตว์/ธรรมชาติ', syls:[{cons:'ด', vowel:'ออ', final:'ก', tone_name:'เอก', th:'ดอก'}, {cons:'ม', vowel:'ไอ', tone:'้', tone_name:'ตรี', th:'ไม้'}]},
  {word:'สวนสัตว์', readingTH:'สวน-สัด', en:'sǔan-sàt', zh:'動物園', level:'中', category:'สัตว์/ธรรมชาติ', syls:[{cons:'ส', vowel:'อัว', final:'น', tone_name:'จัตวา', th:'สวน'}, {cons:'ส', vowel:'อะ', final:'ต', tone_name:'เอก', th:'สัตว์'}]}, // readingTH=สวน-สัด (ตว์→ด ตัวแทนแม่กด, ว์ การันต์ไม่ออกเสียง) / ตัวสะกดจริง = syls[].th ต่อกัน(สวน-สัตว์)
  {word:'ตะวันออก', readingTH:'ตะ-วัน-ออก', en:'dtà-wan-òok', zh:'東', level:'中', category:'ทิศทาง', syls:[{cons:'ต', vowel:'อะ', tone_name:'เอก', th:'ตะ'}, {cons:'ว', vowel:'อะ', final:'น', tone_name:'สามัญ', th:'วัน'}, {cons:'อ', vowel:'ออ', final:'ก', tone_name:'เอก', th:'ออก'}]},
  {word:'ตะวันตก', readingTH:'ตะ-วัน-ตก', en:'dtà-wan-dtòk', zh:'西', level:'中', category:'ทิศทาง', syls:[{cons:'ต', vowel:'อะ', tone_name:'เอก', th:'ตะ'}, {cons:'ว', vowel:'อะ', final:'น', tone_name:'สามัญ', th:'วัน'}, {cons:'ต', vowel:'โอะ', final:'ก', tone_name:'เอก', th:'ตก'}]}
  ];

  global.WORDS_MASTER = WORDS_MASTER;
})(window);

// ════════════════════════════════════════════════════════════
// ADAPTER — แปลง WORDS_MASTER ให้เข้ากับรูปแบบเดิมที่แต่ละเกมใช้อยู่
// (กันพังของเดิม: แก้ตรงนี้ที่เดียว ไม่ต้องไปทัวร์แก้ logic ในแต่ละเกม)
// ════════════════════════════════════════════════════════════
(function (global) {
  'use strict';
  var LEVEL_TXT_TO_NUM = { '初': 1, '中': 2 };

  // เกมเสียง (tone-finder.html) ใช้: word, readingTH, readingEN, zh, level(เลข 1/2), category
  global.buildWordListForToneFinder = function (master) {
    return master.map(function (w) {
      return {
        word: w.word,
        readingTH: w.readingTH !== undefined ? w.readingTH : w.word,
        readingEN: w.en,
        zh: w.zh,
        level: LEVEL_TXT_TO_NUM[w.level],
        category: w.category
      };
    });
  };

  // เกมอ่าน (reading-game.html) / เกมพิมพ์ (typing-game.html) ใช้: th, zh, en, level(初/中), cons/lead/cluster/vowel/tone/final/tone_name, syls
  global.buildWordsForPhonicsGames = function (master) {
    return master.map(function (w) {
      var out = { th: w.word, zh: w.zh, en: w.en, level: w.level };
      ['cons', 'lead', 'cluster', 'vowel', 'tone', 'final', 'tone_name', 'syls', 'readingTH'].forEach(function (f) {
        if (w[f] !== undefined) out[f] = w[f];
      });
      return out;
    });
  };
})(window);
