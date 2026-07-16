/**
 * adv-sentences.js — ประโยค 高級 ใช้ร่วมกันทุกเกม (Lin 2026-07-02, ขยายสคีมา 2026-07-11)
 * ใช้ใน: typing-game.html (เกมพิมพ์) · reading-game.html (เกมอ่าน) · tone-finder.html (เกมเสียง) · word-order.html (เกมลำดับคำ)
 *
 * ⚠️ 2026-07-11: ก่อนหน้านี้ reading-game.html และ typing-game.html แยกไป copy ข้อมูล 10 ประโยคนี้เก็บเองในไฟล์ (ไม่ sync กับไฟล์นี้)
 *    ตอนนี้รวมกลับมาไว้ที่เดียว — ห้ามแยก copy ออกไปอีก ถ้าจะเพิ่ม/แก้ประโยค高級 แก้ที่ไฟล์นี้ไฟล์เดียวพอ
 *
 * โครงสร้างแต่ละประโยค (ปรับ 2026-07-16 ตามที่ Lin สั่ง — เก็บเหมือนไฟล์คำ words-data.js):
 *   th        = ประโยคเต็ม (ไทย, ตัวเขียนจริง)
 *   zh        = คำแปลจีน
 *   readingTH = คำอ่านจริงทั้งประโยค คั่นพยางค์ด้วย '-' (เช่น 'ผม-อยาก-เรียน-พา-สา-ไทย')
 *               จำนวนพยางค์ (นับจากตัด '-') ต้องเท่ากับผลรวม syls ทุกคำเสมอ — ทุกเกมดึงคำอ่านจากช่องนี้ช่องเดียว
 *   wc        = จำนวน "พยางค์" ทั้งประโยค (= ผลรวม syls ทุกคำ) → โควต้าผิด 高級 = wc ÷ 2 ปัดขึ้น (Lin 2026-07-02)
 *   words     = รายละเอียดรายคำ: { th, zh, syls }
 *               - syls = ตัวเขียนจริงแยกพยางค์ + แยกพยัญชนะ/สระ/วรรณยุกต์ (object[])
 *                        เกมอ่าน/เกมพิมพ์ใช้ทำกล่องพยางค์+ตรวจการพิมพ์ (ผ่าน buildSentencesForPhonicsGames ท้ายไฟล์)
 *               (ช่อง syl รายคำ ถูกถอดออก 2026-07-16 — คำอ่านย้ายไปรวมที่ readingTH ระดับประโยคแทน)
 *
 * ⚠️ ห้ามแก้ wc มั่ว — ต้องเท่ากับผลรวมจำนวนพยางค์ (syls) ของทุกคำเสมอ
 * ⚠️ tone_name/cons/vowel/final ใน syls มาจากการแตกตัวสะกดที่ Lin ให้มา — Lin ควรสุ่มตรวจก่อนใช้งานจริง
 * ⚠️ ห้าม AI เพิ่ม/ลบ/แก้ประโยคในไฟล์นี้เอง — วัตถุดิบทุกประโยคต้องมาจาก Lin เท่านั้น (กฎเกมปิด ข้อ 16)
 */
(function (global) {
  'use strict';

  var ADV_SENTENCES = [
    {
      th: 'ผมกินข้าวอยู่ที่บ้าน', zh: '我在家吃飯', readingTH: 'ผม-กิน-ข้าว-อยู่-ที่-บ้าน', wc: 6,
      words: [
      { th: 'ผม', zh: '我', syls: [{cons:'ผ', vowel:'โอะ', final:'ม', tone_name:'จัตวา', th:'ผม', en:'phǎm'}] },
      { th: 'กิน', zh: '吃', syls: [{cons:'ก', vowel:'อิ', final:'น', tone_name:'สามัญ', th:'กิน', en:'gin'}] },
      { th: 'ข้าว', zh: '飯', syls: [{cons:'ข', vowel:'อา', tone:'้', final:'ว', tone_name:'โท', th:'ข้าว', en:'khâao'}] },
      { th: 'อยู่', zh: '在（進行）', syls: [{cons:'ย', lead:'อ', vowel:'อู', tone:'่', tone_name:'เอก', th:'อยู่', en:'yùu'}] },
      { th: 'ที่', zh: '在（地點）', syls: [{cons:'ท', vowel:'อี', tone:'่', tone_name:'โท', th:'ที่', en:'thîi'}] },
      { th: 'บ้าน', zh: '家', syls: [{cons:'บ', vowel:'อา', tone:'้', final:'น', tone_name:'โท', th:'บ้าน', en:'bâan'}] }
      ]
    },
    {
      th: 'เขาไม่ค่อยกินผักเลย', zh: '他不太吃蔬菜', readingTH: 'เขา-ไม่-ค่อย-กิน-ผัก-เลย', wc: 6,
      words: [
      { th: 'เขา', zh: '他', syls: [{cons:'ข', vowel:'เอา', tone_name:'จัตวา', th:'เขา', en:'khǎo'}] },
      { th: 'ไม่', zh: '不', syls: [{cons:'ม', vowel:'ไอ', tone:'่', tone_name:'โท', th:'ไม่', en:'mâi'}] },
      { th: 'ค่อย', zh: '太／怎麼', syls: [{cons:'ค', vowel:'ออ', tone:'่', final:'ย', tone_name:'โท', th:'ค่อย', en:'khôy'}] },
      { th: 'กิน', zh: '吃', syls: [{cons:'ก', vowel:'อิ', final:'น', tone_name:'สามัญ', th:'กิน', en:'gin'}] },
      { th: 'ผัก', zh: '蔬菜', syls: [{cons:'ผ', vowel:'อะ', final:'ก', tone_name:'เอก', th:'ผัก', en:'phàk'}] },
      { th: 'เลย', zh: '（強調）', syls: [{cons:'ล', vowel:'เออ', final:'ย', tone_name:'สามัญ', th:'เลย', en:'loei'}] }
      ]
    },
    {
      th: 'คุณไปไหนมา', zh: '你去哪裡了？', readingTH: 'คุน-ไป-ไหน-มา', wc: 4,
      words: [
      { th: 'คุณ', zh: '你', syls: [{cons:'ค', vowel:'อุ', final:'ณ', tone_name:'สามัญ', th:'คุณ', en:'khun'}] },
      { th: 'ไป', zh: '去', syls: [{cons:'ป', vowel:'ไอ', tone_name:'สามัญ', th:'ไป', en:'bpai'}] },
      { th: 'ไหน', zh: '哪裡', syls: [{cons:'น', lead:'ห', vowel:'ไอ', tone_name:'จัตวา', th:'ไหน', en:'nǎi'}] },
      { th: 'มา', zh: '來（了）', syls: [{cons:'ม', vowel:'อา', tone_name:'สามัญ', th:'มา', en:'maa'}] }
      ]
    },
    {
      th: 'ผมอยากเรียนภาษาไทย', zh: '我想學泰語', readingTH: 'ผม-อยาก-เรียน-พา-สา-ไทย', wc: 6,
      words: [
      { th: 'ผม', zh: '我', syls: [{cons:'ผ', vowel:'โอะ', final:'ม', tone_name:'จัตวา', th:'ผม', en:'phǎm'}] },
      { th: 'อยาก', zh: '想', syls: [{cons:'ย', lead:'อ', vowel:'อา', final:'ก', tone_name:'เอก', th:'อยาก', en:'yàak'}] },
      { th: 'เรียน', zh: '學', syls: [{cons:'ร', vowel:'เอีย', final:'น', tone_name:'สามัญ', th:'เรียน', en:'rian'}] },
      { th: 'ภาษาไทย', zh: '泰語', syls: [{cons:'ภ', vowel:'อา', tone_name:'สามัญ', th:'ภา', en:'phaa'}, {cons:'ษ', vowel:'อา', tone_name:'จัตวา', th:'ษา', en:'sǎa'}, {cons:'ท', vowel:'ไอ', final:'ย', tone_name:'สามัญ', th:'ไทย', en:'thai'}] }
      ]
    },
    {
      th: 'วันนี้อากาศร้อนมากเลย', zh: '今天天氣很熱', readingTH: 'วัน-นี้-อา-กาด-ร้อน-มาก-เลย', wc: 7,
      words: [
      { th: 'วันนี้', zh: '今天', syls: [{cons:'ว', vowel:'อะ', final:'น', tone_name:'สามัญ', th:'วัน', en:'wan'}, {cons:'น', vowel:'อี', tone:'้', tone_name:'ตรี', th:'นี้', en:'níi'}] },
      { th: 'อากาศ', zh: '天氣', syls: [{cons:'อ', vowel:'อา', tone_name:'สามัญ', th:'อา', en:'aa'}, {cons:'ก', vowel:'อา', final:'ศ', tone_name:'เอก', th:'กาศ', en:'gàat'}] },
      { th: 'ร้อน', zh: '熱', syls: [{cons:'ร', vowel:'ออ', tone:'้', final:'น', tone_name:'ตรี', th:'ร้อน', en:'rón'}] },
      { th: 'มาก', zh: '很', syls: [{cons:'ม', vowel:'อา', final:'ก', tone_name:'โท', th:'มาก', en:'mâak'}] },
      { th: 'เลย', zh: '（強調）', syls: [{cons:'ล', vowel:'เออ', final:'ย', tone_name:'สามัญ', th:'เลย', en:'loei'}] }
      ]
    },
    {
      th: 'เขาพูดภาษาไทยได้', zh: '他會說泰語', readingTH: 'เขา-พูด-พา-สา-ไทย-ด้าย', wc: 6,
      words: [
      { th: 'เขา', zh: '他', syls: [{cons:'ข', vowel:'เอา', tone_name:'จัตวา', th:'เขา', en:'khǎo'}] },
      { th: 'พูด', zh: '說', syls: [{cons:'พ', vowel:'อู', final:'ด', tone_name:'โท', th:'พูด', en:'phûut'}] },
      { th: 'ภาษาไทย', zh: '泰語', syls: [{cons:'ภ', vowel:'อา', tone_name:'สามัญ', th:'ภา', en:'phaa'}, {cons:'ษ', vowel:'อา', tone_name:'จัตวา', th:'ษา', en:'sǎa'}, {cons:'ท', vowel:'ไอ', final:'ย', tone_name:'สามัญ', th:'ไทย', en:'thai'}] },
      { th: 'ได้', zh: '會／能', syls: [{cons:'ด', vowel:'ไอ', tone:'้', tone_name:'โท', th:'ได้', en:'dâi'}] }
      ]
    },
    {
      th: 'ผมไม่รู้จะทำยังไง', zh: '我不知道該怎麼辦', readingTH: 'ผม-ไม่-รู้-จะ-ทำ-ยัง-ไง', wc: 7,
      words: [
      { th: 'ผม', zh: '我', syls: [{cons:'ผ', vowel:'โอะ', final:'ม', tone_name:'จัตวา', th:'ผม', en:'phǎm'}] },
      { th: 'ไม่', zh: '不', syls: [{cons:'ม', vowel:'ไอ', tone:'่', tone_name:'โท', th:'ไม่', en:'mâi'}] },
      { th: 'รู้', zh: '知道', syls: [{cons:'ร', vowel:'อู', tone:'้', tone_name:'ตรี', th:'รู้', en:'rúu'}] },
      { th: 'จะ', zh: '將／該', syls: [{cons:'จ', vowel:'อะ', tone_name:'เอก', th:'จะ', en:'jà'}] },
      { th: 'ทำ', zh: '做', syls: [{cons:'ท', vowel:'อำ', tone_name:'สามัญ', th:'ทำ', en:'tham'}] },
      { th: 'ยังไง', zh: '怎麼', syls: [{cons:'ย', vowel:'อะ', final:'ง', tone_name:'สามัญ', th:'ยัง', en:'yang'}, {cons:'ง', vowel:'ไอ', tone_name:'สามัญ', th:'ไง', en:'ngai'}] }
      ]
    },
    {
      th: 'พรุ่งนี้เราไปด้วยกันนะ', zh: '明天我們一起去喔', readingTH: 'พรุ่ง-นี้-เรา-ไป-ด้วย-กัน-นะ', wc: 7,
      words: [
      { th: 'พรุ่งนี้', zh: '明天', syls: [{cons:'พ', cluster:'ร', vowel:'อุ', tone:'่', final:'ง', tone_name:'โท', th:'พรุ่ง', en:'phrûng'}, {cons:'น', vowel:'อี', tone:'้', tone_name:'ตรี', th:'นี้', en:'níi'}] },
      { th: 'เรา', zh: '我們', syls: [{cons:'ร', vowel:'เอา', tone_name:'สามัญ', th:'เรา', en:'rao'}] },
      { th: 'ไป', zh: '去', syls: [{cons:'ป', vowel:'ไอ', tone_name:'สามัญ', th:'ไป', en:'bpai'}] },
      { th: 'ด้วยกัน', zh: '一起', syls: [{cons:'ด', vowel:'อัว', tone:'้', final:'ย', tone_name:'โท', th:'ด้วย', en:'dûay'}, {cons:'ก', vowel:'อะ', final:'น', tone_name:'สามัญ', th:'กัน', en:'gan'}] },
      { th: 'นะ', zh: '喔', syls: [{cons:'น', vowel:'อะ', tone_name:'ตรี', th:'นะ', en:'ná'}] }
      ]
    },
    {
      th: 'แกกำลังทำอะไรอยู่', zh: '你在做什麼？', readingTH: 'แก-กำ-ลัง-ทำ-อะ-ไร-อยู่', wc: 7,
      words: [
      { th: 'แก', zh: '你（口語）', syls: [{cons:'ก', vowel:'แอ', tone_name:'สามัญ', th:'แก', en:'gae'}] },
      { th: 'กำลัง', zh: '正在', syls: [{cons:'ก', vowel:'อำ', tone_name:'สามัญ', th:'กำ', en:'gam'}, {cons:'ล', vowel:'อะ', final:'ง', tone_name:'สามัญ', th:'ลัง', en:'lang'}] },
      { th: 'ทำ', zh: '做', syls: [{cons:'ท', vowel:'อำ', tone_name:'สามัญ', th:'ทำ', en:'tham'}] },
      { th: 'อะไร', zh: '什麼', syls: [{cons:'อ', vowel:'อะ', tone_name:'เอก', th:'อะ', en:'à'}, {cons:'ร', vowel:'ไอ', tone_name:'สามัญ', th:'ไร', en:'rai'}] },
      { th: 'อยู่', zh: '（進行）', syls: [{cons:'ย', lead:'อ', vowel:'อู', tone:'่', tone_name:'เอก', th:'อยู่', en:'yùu'}] }
      ]
    },
    {
      th: 'เธอยังไม่กลับบ้านเหรอ', zh: '你還沒回家喔？', readingTH: 'เทอ-ยัง-ไม่-กลับ-บ้าน-เหรอ', wc: 6,
      words: [
      { th: 'เธอ', zh: '你', syls: [{cons:'ธ', vowel:'เออ', tone_name:'สามัญ', th:'เธอ', en:'thoe'}] },
      { th: 'ยัง', zh: '還', syls: [{cons:'ย', vowel:'อะ', final:'ง', tone_name:'สามัญ', th:'ยัง', en:'yang'}] },
      { th: 'ไม่', zh: '沒', syls: [{cons:'ม', vowel:'ไอ', tone:'่', tone_name:'โท', th:'ไม่', en:'mâi'}] },
      { th: 'กลับ', zh: '回', syls: [{cons:'ก', cluster:'ล', vowel:'อะ', final:'บ', tone_name:'เอก', th:'กลับ', en:'glàp'}] },
      { th: 'บ้าน', zh: '家', syls: [{cons:'บ', vowel:'อา', tone:'้', final:'น', tone_name:'โท', th:'บ้าน', en:'bâan'}] },
      { th: 'เหรอ', zh: '喔？', syls: [{cons:'ร', lead:'ห', vowel:'เออ', tone_name:'จัตวา', th:'เหรอ', en:'rǒe'}] }
      ]
    },
    {
      th: 'ผมไม่ชอบกินผัก', zh: '我不喜歡吃菜', readingTH: 'ผม-ไม่-ชอบ-กิน-ผัก', wc: 5,
      words: [
      { th: 'ผม', zh: '我', syls: [{cons:'ผ', vowel:'โอะ', final:'ม', tone_name:'จัตวา', th:'ผม', en:'phǎm'}] },
      { th: 'ไม่', zh: '不', syls: [{cons:'ม', vowel:'ไอ', tone:'่', tone_name:'โท', th:'ไม่', en:'mâi'}] },
      { th: 'ชอบ', zh: '喜歡', syls: [{cons:'ช', vowel:'ออ', final:'บ', tone_name:'โท', th:'ชอบ', en:'châop'}] },
      { th: 'กิน', zh: '吃', syls: [{cons:'ก', vowel:'อิ', final:'น', tone_name:'สามัญ', th:'กิน', en:'gin'}] },
      { th: 'ผัก', zh: '菜', syls: [{cons:'ผ', vowel:'อะ', final:'ก', tone_name:'เอก', th:'ผัก', en:'phàk'}] }
      ]
    },
    {
      th: 'เขาไปตลาดทุกวัน', zh: '他每天去市場', readingTH: 'เขา-ไป-ตะ-หลาด-ทุก-วัน', wc: 6,
      words: [
      { th: 'เขา', zh: '他', syls: [{cons:'ข', vowel:'เอา', tone_name:'จัตวา', th:'เขา', en:'khǎo'}] },
      { th: 'ไป', zh: '去', syls: [{cons:'ป', vowel:'ไอ', tone_name:'สามัญ', th:'ไป', en:'bpai'}] },
      { th: 'ตลาด', zh: '市場', syls: [{cons:'ต', vowel:'อะ', tone_name:'เอก', th:'ต', en:'dtà'}, {cons:'ล', lead:'ห', vowel:'อา', final:'ด', tone_name:'เอก', th:'ลาด', en:'làat'}] },
      { th: 'ทุกวัน', zh: '每天', syls: [{cons:'ท', vowel:'อุ', final:'ก', tone_name:'ตรี', th:'ทุก', en:'thúk'}, {cons:'ว', vowel:'อะ', final:'น', tone_name:'สามัญ', th:'วัน', en:'wan'}] }
      ]
    },
    {
      th: 'วันนี้ฝนตกหนักมาก', zh: '今天雨下很大', readingTH: 'วัน-นี้-ฝน-ตก-หนัก-มาก', wc: 6,
      words: [
      { th: 'วันนี้', zh: '今天', syls: [{cons:'ว', vowel:'อะ', final:'น', tone_name:'สามัญ', th:'วัน', en:'wan'}, {cons:'น', vowel:'อี', tone:'้', tone_name:'ตรี', th:'นี้', en:'níi'}] },
      { th: 'ฝน', zh: '雨', syls: [{cons:'ฝ', vowel:'โอะ', final:'น', tone_name:'จัตวา', th:'ฝน', en:'fǒn'}] },
      { th: 'ตก', zh: '下（雨）', syls: [{cons:'ต', vowel:'โอะ', final:'ก', tone_name:'เอก', th:'ตก', en:'dtòk'}] },
      { th: 'หนัก', zh: '大', syls: [{cons:'น', lead:'ห', vowel:'อะ', final:'ก', tone_name:'เอก', th:'หนัก', en:'nàk'}] },
      { th: 'มาก', zh: '很/多', syls: [{cons:'ม', vowel:'อา', final:'ก', tone_name:'โท', th:'มาก', en:'mâak'}] }
      ]
    },
    {
      th: 'คุณอยู่ที่ไหน', zh: '你在哪裡', readingTH: 'คุน-อยู่-ที่-ไหน', wc: 4,
      words: [
      { th: 'คุณ', zh: '你', syls: [{cons:'ค', vowel:'อุ', final:'ณ', tone_name:'สามัญ', th:'คุณ', en:'khun'}] },
      { th: 'อยู่', zh: '在', syls: [{cons:'ย', lead:'อ', vowel:'อู', tone:'่', tone_name:'เอก', th:'อยู่', en:'yùu'}] },
      { th: 'ที่', zh: '地方', syls: [{cons:'ท', vowel:'อี', tone:'่', tone_name:'โท', th:'ที่', en:'thîi'}] },
      { th: 'ไหน', zh: '哪裡', syls: [{cons:'น', lead:'ห', vowel:'ไอ', tone_name:'จัตวา', th:'ไหน', en:'nǎi'}] }
      ]
    },
    {
      th: 'เราหิวแล้ว', zh: '我餓了', readingTH: 'เรา-หิว-แล้ว', wc: 3,
      words: [
      { th: 'เรา', zh: '我', syls: [{cons:'ร', vowel:'เอา', tone_name:'สามัญ', th:'เรา', en:'rao'}] },
      { th: 'หิว', zh: '餓', syls: [{cons:'ห', vowel:'อิ', final:'ว', tone_name:'จัตวา', th:'หิว', en:'hǐw'}] },
      { th: 'แล้ว', zh: '了', syls: [{cons:'ล', vowel:'แอ', tone:'้', final:'ว', tone_name:'ตรี', th:'แล้ว', en:'láew'}] }
      ]
    },
    {
      th: 'เขาไม่มีเวลา', zh: '他沒有時間', readingTH: 'เขา-ไม่-มี-เว-ลา', wc: 5,
      words: [
      { th: 'เขา', zh: '他', syls: [{cons:'ข', vowel:'เอา', tone_name:'จัตวา', th:'เขา', en:'khǎo'}] },
      { th: 'ไม่', zh: '不/沒', syls: [{cons:'ม', vowel:'ไอ', tone:'่', tone_name:'โท', th:'ไม่', en:'mâi'}] },
      { th: 'มี', zh: '有', syls: [{cons:'ม', vowel:'อี', tone_name:'สามัญ', th:'มี', en:'mii'}] },
      { th: 'เวลา', zh: '時間', syls: [{cons:'ว', vowel:'เอ', tone_name:'สามัญ', th:'เว', en:'wee'}, {cons:'ล', vowel:'อา', tone_name:'สามัญ', th:'ลา', en:'laa'}] }
      ]
    },
    {
      th: 'วันนี้อากาศดีมาก', zh: '今天天氣很好', readingTH: 'วัน-นี้-อา-กาด-ดี-มาก', wc: 6,
      words: [
      { th: 'วันนี้', zh: '今天', syls: [{cons:'ว', vowel:'อะ', final:'น', tone_name:'สามัญ', th:'วัน', en:'wan'}, {cons:'น', vowel:'อี', tone:'้', tone_name:'ตรี', th:'นี้', en:'níi'}] },
      { th: 'อากาศ', zh: '天氣', syls: [{cons:'อ', vowel:'อา', tone_name:'สามัญ', th:'อา', en:'aa'}, {cons:'ก', vowel:'อา', final:'ศ', tone_name:'เอก', th:'กาศ', en:'gàat'}] },
      { th: 'ดี', zh: '好', syls: [{cons:'ด', vowel:'อี', tone_name:'สามัญ', th:'ดี', en:'dii'}] },
      { th: 'มาก', zh: '很/多', syls: [{cons:'ม', vowel:'อา', final:'ก', tone_name:'โท', th:'มาก', en:'mâak'}] }
      ]
    },
    {
      th: 'ขอบคุณมากครับ', zh: '非常謝謝', readingTH: 'ขอบ-คุน-มาก-ครับ', wc: 4,
      words: [
      { th: 'ขอบคุณ', zh: '謝謝', syls: [{cons:'ข', vowel:'ออ', final:'บ', tone_name:'เอก', th:'ขอบ', en:'khòp'}, {cons:'ค', vowel:'อุ', final:'ณ', tone_name:'สามัญ', th:'คุณ', en:'khun'}] },
      { th: 'มาก', zh: '很/非常', syls: [{cons:'ม', vowel:'อา', final:'ก', tone_name:'โท', th:'มาก', en:'mâak'}] },
      { th: 'ครับ', zh: '（男性禮貌詞）', syls: [{cons:'ค', cluster:'ร', vowel:'อะ', final:'บ', tone_name:'ตรี', th:'ครับ', en:'kráp'}] }
      ]
    },
    {
      th: 'ร้านนี้อร่อยมาก', zh: '這家餐廳很好吃', readingTH: 'ร้าน-นี้-อะ-ร่อย-มาก', wc: 5,
      words: [
      { th: 'ร้าน', zh: '店', syls: [{cons:'ร', vowel:'อา', tone:'้', final:'น', tone_name:'ตรี', th:'ร้าน', en:'ráan'}] },
      { th: 'นี้', zh: '這', syls: [{cons:'น', vowel:'อี', tone:'้', tone_name:'ตรี', th:'นี้', en:'níi'}] },
      { th: 'อร่อย', zh: '好吃', syls: [{cons:'อ', vowel:'อะ', tone_name:'เอก', th:'อ', en:'à'}, {cons:'ร', vowel:'ออ', tone:'่', final:'ย', tone_name:'โท', th:'ร่อย', en:'ròi'}] },
      { th: 'มาก', zh: '很/非常', syls: [{cons:'ม', vowel:'อา', final:'ก', tone_name:'โท', th:'มาก', en:'mâak'}] }
      ]
    },
    {
      th: 'ผมอยากพักผ่อน', zh: '我想休息', readingTH: 'ผม-อยาก-พัก-ผ่อน', wc: 4,
      words: [
      { th: 'ผม', zh: '我', syls: [{cons:'ผ', vowel:'โอะ', final:'ม', tone_name:'จัตวา', th:'ผม', en:'phǎm'}] },
      { th: 'อยาก', zh: '想', syls: [{cons:'ย', lead:'อ', vowel:'อา', final:'ก', tone_name:'เอก', th:'อยาก', en:'yàak'}] },
      { th: 'พักผ่อน', zh: '休息', syls: [{cons:'พ', vowel:'อะ', final:'ก', tone_name:'ตรี', th:'พัก', en:'phák'}, {cons:'ผ', vowel:'ออ', tone:'่', final:'น', tone_name:'เอก', th:'ผ่อน', en:'phòn'}] }
      ]
    },
    {
      th: 'ขอเมนูหน่อยครับ', zh: '麻煩給我看一下菜單', readingTH: 'ขอ-เม-นู-หน่อย-ครับ', wc: 5,
      words: [
      { th: 'ขอ', zh: '請／想要', syls: [{cons:'ข', vowel:'ออ', tone_name:'จัตวา', th:'ขอ', en:'khɔ̌ɔ'}] },
      { th: 'เมนู', zh: '菜單', syls: [{cons:'ม', vowel:'เอ', tone_name:'สามัญ', th:'เม', en:'mee'}, {cons:'น', vowel:'อู', tone_name:'สามัญ', th:'นู', en:'nuu'}] },
      { th: 'หน่อย', zh: '一下（軟化語氣）', syls: [{cons:'น', lead:'ห', vowel:'ออ', tone:'่', final:'ย', tone_name:'เอก', th:'หน่อย', en:'nɔ̀i'}] },
      { th: 'ครับ', zh: '（男性禮貌詞）', syls: [{cons:'ค', cluster:'ร', vowel:'อะ', final:'บ', tone_name:'ตรี', th:'ครับ', en:'khráp'}] }
      ]
    },
    {
      th: 'อาหารจานนี้เผ็ดไหม', zh: '這道菜辣嗎？', readingTH: 'อา-หาร-จาน-นี้-เผ็ด-ไหม', wc: 6,
      words: [
      { th: 'อาหาร', zh: '食物／餐點', syls: [{cons:'อ', vowel:'อา', tone_name:'สามัญ', th:'อา', en:'aa'}, {cons:'ห', vowel:'อา', final:'ร', tone_name:'จัตวา', th:'หาร', en:'hǎan'}] },
      { th: 'จานนี้', zh: '這盤／這道', syls: [{cons:'จ', vowel:'อา', final:'น', tone_name:'สามัญ', th:'จาน', en:'jaan'}, {cons:'น', vowel:'อี', tone:'้', tone_name:'ตรี', th:'นี้', en:'níi'}] },
      { th: 'เผ็ด', zh: '辣', syls: [{cons:'ผ', vowel:'เอะ', final:'ด', tone_name:'เอก', th:'เผ็ด', en:'phèt'}] },
      { th: 'ไหม', zh: '嗎（疑問）', syls: [{cons:'ม', lead:'ห', vowel:'ไอ', tone_name:'จัตวา', th:'ไหม', en:'mǎi'}] }
      ]
    },
    {
      th: 'ผมเอาข้าวผัดกุ้ง', zh: '我要蝦炒飯', readingTH: 'ผม-เอา-ข้าว-ผัด-กุ้ง', wc: 5,
      words: [
      { th: 'ผม', zh: '我', syls: [{cons:'ผ', vowel:'โอะ', final:'ม', tone_name:'จัตวา', th:'ผม', en:'phǎm'}] },
      { th: 'เอา', zh: '要（拿／取）', syls: [{cons:'อ', vowel:'เอา', tone_name:'สามัญ', th:'เอา', en:'ao'}] },
      { th: 'ข้าวผัด', zh: '炒飯', syls: [{cons:'ข', vowel:'อา', tone:'้', final:'ว', tone_name:'โท', th:'ข้าว', en:'khâao'}, {cons:'ผ', vowel:'อะ', final:'ด', tone_name:'เอก', th:'ผัด', en:'phàt'}] },
      { th: 'กุ้ง', zh: '蝦', syls: [{cons:'ก', vowel:'อุ', tone:'้', final:'ง', tone_name:'โท', th:'กุ้ง', en:'gûng'}] }
      ]
    },
    {
      th: 'ไม่ใส่ผักชีนะ', zh: '不要放香菜喔', readingTH: 'ไม่-ใส่-ผัก-ชี-นะ', wc: 5,
      words: [
      { th: 'ไม่', zh: '不要', syls: [{cons:'ม', vowel:'ไอ', tone:'่', tone_name:'โท', th:'ไม่', en:'mâi'}] },
      { th: 'ใส่', zh: '放／加', syls: [{cons:'ส', vowel:'ใอ', tone:'่', tone_name:'เอก', th:'ใส่', en:'sài'}] },
      { th: 'ผักชี', zh: '香菜', syls: [{cons:'ผ', vowel:'อะ', final:'ก', tone_name:'เอก', th:'ผัก', en:'phàk'}, {cons:'ช', vowel:'อี', tone_name:'สามัญ', th:'ชี', en:'chii'}] },
      { th: 'นะ', zh: '喔（語氣詞）', syls: [{cons:'น', vowel:'อะ', tone_name:'ตรี', th:'นะ', en:'ná'}] }
      ]
    },
    {
      th: 'เก็บเงินด้วยครับ', zh: '麻煩結帳', readingTH: 'เก็บ-เงิน-ด้วย-ครับ', wc: 4,
      words: [
      { th: 'เก็บ', zh: '收（款）', syls: [{cons:'ก', vowel:'เอะ', final:'บ', tone_name:'เอก', th:'เก็บ', en:'gèp'}] },
      { th: 'เงิน', zh: '錢', syls: [{cons:'ง', vowel:'เออ', final:'น', tone_name:'สามัญ', th:'เงิน', en:'ngəən'}] },
      { th: 'ด้วย', zh: '也／請', syls: [{cons:'ด', vowel:'อัว', tone:'้', final:'ย', tone_name:'โท', th:'ด้วย', en:'dûay'}] },
      { th: 'ครับ', zh: '（男性禮貌詞）', syls: [{cons:'ค', cluster:'ร', vowel:'อะ', final:'บ', tone_name:'ตรี', th:'ครับ', en:'khráp'}] }
      ]
    },
    {
      th: 'ผมตื่นนอนตอนหกโมงเช้า', zh: '我早上六點起床', readingTH: 'ผม-ตื่น-นอน-ตอน-หก-โมง-เช้า', wc: 7,
      words: [
      { th: 'ผม', zh: '我（男性自稱）', syls: [{cons:'ผ', vowel:'โอะ', final:'ม', tone_name:'จัตวา', th:'ผม', en:'phǒm'}] },
      { th: 'ตื่นนอน', zh: '起床', syls: [{cons:'ต', vowel:'อื', tone:'่', final:'น', tone_name:'เอก', th:'ตื่น', en:'dtùuen'}, {cons:'น', vowel:'ออ', final:'น', tone_name:'สามัญ', th:'นอน', en:'norn'}] },
      { th: 'ตอน', zh: '在（時段）', syls: [{cons:'ต', vowel:'ออ', final:'น', tone_name:'สามัญ', th:'ตอน', en:'dtorn'}] },
      { th: 'หก', zh: '六', syls: [{cons:'ห', vowel:'โอะ', final:'ก', tone_name:'เอก', th:'หก', en:'hòk'}] },
      { th: 'โมง', zh: '點（鐘點）', syls: [{cons:'ม', vowel:'โอ', final:'ง', tone_name:'สามัญ', th:'โมง', en:'moong'}] },
      { th: 'เช้า', zh: '早上', syls: [{cons:'ช', vowel:'เอา', tone:'้', tone_name:'ตรี', th:'เช้า', en:'cháo'}] }
      ]
    },
    {
      th: 'เขาชอบอาบน้ำก่อนนอน', zh: '他喜歡睡前洗澡', readingTH: 'เขา-ชอบ-อาบ-น้ำ-ก่อน-นอน', wc: 6,
      words: [
      { th: 'เขา', zh: '他', syls: [{cons:'ข', vowel:'เอา', tone_name:'จัตวา', th:'เขา', en:'khǎo'}] },
      { th: 'ชอบ', zh: '喜歡', syls: [{cons:'ช', vowel:'ออ', final:'บ', tone_name:'โท', th:'ชอบ', en:'chôp'}] },
      { th: 'อาบน้ำ', zh: '洗澡', syls: [{cons:'อ', vowel:'อา', final:'บ', tone_name:'เอก', th:'อาบ', en:'àap'}, {cons:'น', vowel:'อำ', tone:'้', tone_name:'ตรี', th:'น้ำ', en:'náam'}] },
      { th: 'ก่อน', zh: '之前', syls: [{cons:'ก', vowel:'ออ', tone:'่', final:'น', tone_name:'เอก', th:'ก่อน', en:'gòn'}] },
      { th: 'นอน', zh: '睡覺', syls: [{cons:'น', vowel:'ออ', final:'น', tone_name:'สามัญ', th:'นอน', en:'norn'}] }
      ]
    },
    {
      th: 'เราดื่มกาแฟทุกเช้า', zh: '我們每天早上喝咖啡', readingTH: 'เรา-ดื่ม-กา-แฟ-ทุก-เช้า', wc: 6,
      words: [
      { th: 'เรา', zh: '我們', syls: [{cons:'ร', vowel:'เอา', tone_name:'สามัญ', th:'เรา', en:'rao'}] },
      { th: 'ดื่ม', zh: '喝', syls: [{cons:'ด', vowel:'อื', tone:'่', final:'ม', tone_name:'เอก', th:'ดื่ม', en:'dèum'}] },
      { th: 'กาแฟ', zh: '咖啡', syls: [{cons:'ก', vowel:'อา', tone_name:'สามัญ', th:'กา', en:'gaa'}, {cons:'ฟ', vowel:'แอ', tone_name:'สามัญ', th:'แฟ', en:'fae'}] },
      { th: 'ทุก', zh: '每', syls: [{cons:'ท', vowel:'อุ', final:'ก', tone_name:'ตรี', th:'ทุก', en:'túk'}] },
      { th: 'เช้า', zh: '早上', syls: [{cons:'ช', vowel:'เอา', tone:'้', tone_name:'ตรี', th:'เช้า', en:'cháo'}] }
      ]
    },
    {
      th: 'วันนี้ผมทำงานที่บ้าน', zh: '今天我在家工作', readingTH: 'วัน-นี้-ผม-ทำ-งาน-ที่-บ้าน', wc: 7,
      words: [
      { th: 'วันนี้', zh: '今天', syls: [{cons:'ว', vowel:'อะ', final:'น', tone_name:'สามัญ', th:'วัน', en:'wan'}, {cons:'น', vowel:'อี', tone:'้', tone_name:'ตรี', th:'นี้', en:'níi'}] },
      { th: 'ผม', zh: '我（男性自稱）', syls: [{cons:'ผ', vowel:'โอะ', final:'ม', tone_name:'จัตวา', th:'ผม', en:'phǒm'}] },
      { th: 'ทำงาน', zh: '工作', syls: [{cons:'ท', vowel:'อำ', tone_name:'สามัญ', th:'ทำ', en:'tam'}, {cons:'ง', vowel:'อา', final:'น', tone_name:'สามัญ', th:'งาน', en:'ngaan'}] },
      { th: 'ที่', zh: '在（地點）', syls: [{cons:'ท', vowel:'อี', tone:'่', tone_name:'โท', th:'ที่', en:'thîi'}] },
      { th: 'บ้าน', zh: '家', syls: [{cons:'บ', vowel:'อา', tone:'้', final:'น', tone_name:'โท', th:'บ้าน', en:'bâan'}] }
      ]
    },
    {
      th: 'เย็นนี้เรากินข้าวด้วยกันไหม', zh: '今晚我們一起吃飯嗎', readingTH: 'เย็น-นี้-เรา-กิน-ข้าว-ด้วย-กัน-ไหม', wc: 8,
      words: [
      { th: 'เย็นนี้', zh: '今晚', syls: [{cons:'ย', vowel:'เอะ', final:'น', tone_name:'สามัญ', th:'เย็น', en:'yen'}, {cons:'น', vowel:'อี', tone:'้', tone_name:'ตรี', th:'นี้', en:'níi'}] },
      { th: 'เรา', zh: '我們', syls: [{cons:'ร', vowel:'เอา', tone_name:'สามัญ', th:'เรา', en:'rao'}] },
      { th: 'กิน', zh: '吃', syls: [{cons:'ก', vowel:'อิ', final:'น', tone_name:'สามัญ', th:'กิน', en:'gin'}] },
      { th: 'ข้าว', zh: '飯', syls: [{cons:'ข', vowel:'อา', tone:'้', final:'ว', tone_name:'โท', th:'ข้าว', en:'khâao'}] },
      { th: 'ด้วยกัน', zh: '一起', syls: [{cons:'ด', vowel:'อัว', tone:'้', final:'ย', tone_name:'โท', th:'ด้วย', en:'dûay'}, {cons:'ก', vowel:'อะ', final:'น', tone_name:'สามัญ', th:'กัน', en:'gan'}] },
      { th: 'ไหม', zh: '嗎（疑問）', syls: [{cons:'ม', lead:'ห', vowel:'ไอ', tone_name:'จัตวา', th:'ไหม', en:'mǎi'}] }
      ]
    }
  ];

  global.ADV_SENTENCES = ADV_SENTENCES;

  // ════════════════════════════════════════════════════════════
  // ADAPTER — สำหรับเกมอ่าน/เกมพิมพ์ ที่ต้องการ WORDS_HIGH แบบแบน (syls รวมทั้งประโยค ไม่แยกกลุ่มตามคำ)
  // ════════════════════════════════════════════════════════════
  global.buildSentencesForPhonicsGames = function (sentences) {
    return sentences.map(function (s) {
      var flatSyls = [];
      s.words.forEach(function (w) { flatSyls = flatSyls.concat(w.syls); });
      var en = flatSyls.map(function (sy) { return sy.en; }).join('-'); // คำอ่านโรมันทั้งประโยค (เดิม typing-game.html เก็บแยกไว้ต่างหาก ตอนนี้คำนวณสดจาก syls แทน)
      // Lin 2026-07-12: เก็บ "รายคำ + คำแปล" ไว้ด้วย → เกมพิมพ์ 高 / เกมเรียงคำ ใช้โชว์คำอธิบายว่าแต่ละคำแปลว่าอะไร
      var wordMeanings = s.words.map(function (w) { return { th: w.th, zh: w.zh }; });
      // Lin 2026-07-16: ส่ง readingTH (คำอ่านจริงทั้งประโยค) ให้เกมอ่าน/เกมพิมพ์ด้วย — กล่อง讀音ต้องโชว์คำอ่าน ไม่ใช่ตัวเขียน (ห้าม fallback เป็น syls[].th)
      return { th: s.th, zh: s.zh, en: en, readingTH: s.readingTH, level: '高', syls: flatSyls, words: wordMeanings };
    });
  };
})(window);
