/**
 * adv-sentences.js — ประโยค 高級 ใช้ร่วมกันทุกเกม (Lin 2026-07-02, ขยายสคีมา 2026-07-11)
 * ใช้ใน: typing-game.html (เกมพิมพ์) · reading-game.html (เกมอ่าน) · tone-finder.html (เกมเสียง) · word-order.html (เกมลำดับคำ)
 *
 * ⚠️ 2026-07-11: ก่อนหน้านี้ reading-game.html และ typing-game.html แยกไป copy ข้อมูล 10 ประโยคนี้เก็บเองในไฟล์ (ไม่ sync กับไฟล์นี้)
 *    ตอนนี้รวมกลับมาไว้ที่เดียว — ห้ามแยก copy ออกไปอีก ถ้าจะเพิ่ม/แก้ประโยค高級 แก้ที่ไฟล์นี้ไฟล์เดียวพอ
 *
 * โครงสร้างแต่ละประโยค:
 *   th    = ประโยคเต็ม (ไทย)
 *   zh    = คำแปลจีน
 *   wc    = จำนวน "พยางค์" ทั้งประโยค (= ผลรวม syl ทุกคำ) → โควต้าผิด 高級 = wc ÷ 2 ปัดขึ้น (Lin 2026-07-02)
 *   words = รายละเอียดรายคำ: { th, zh, syl, syls }
 *           - syl  = คำอ่านแยกพยางค์ (string[], ของเดิม) — เกมเสียงใช้ต่อเป็น readingTH เช่น "พา-สา-ไท"
 *           - syls = แยกพยัญชนะ/สระ/วรรณยุกต์ต่อพยางค์ (object[], เพิ่มมา 2026-07-11 จาก reading-game/typing-game เดิม)
 *                    เกมอ่าน/เกมพิมพ์ใช้ syls ต่อ (ผ่าน buildSentencesForPhonicsGames ท้ายไฟล์)
 *
 * ⚠️ ห้ามแก้ wc มั่ว — ต้องเท่ากับผลรวมจำนวนพยางค์ (syl) ของทุกคำเสมอ
 * ⚠️ tone_name/cons/vowel/final ใน syls มาจากการแตกตัวสะกดที่ Lin ให้มา — Lin ควรสุ่มตรวจก่อนใช้งานจริง
 * ⚠️ ห้าม AI เพิ่ม/ลบ/แก้ประโยคในไฟล์นี้เอง — วัตถุดิบทุกประโยคต้องมาจาก Lin เท่านั้น (กฎเกมปิด ข้อ 16)
 */
(function (global) {
  'use strict';

  var ADV_SENTENCES = [
    {
      th: 'ผมกินข้าวอยู่ที่บ้าน', zh: '我在家吃飯', wc: 6,
      words: [
      { th: 'ผม', zh: '我', syl: ['ผม'], syls: [{cons:'ผ', vowel:'โอะ', final:'ม', tone_name:'จัตวา', th:'ผม', en:'phǎm'}] },
      { th: 'กิน', zh: '吃', syl: ['กิน'], syls: [{cons:'ก', vowel:'อิ', final:'น', tone_name:'สามัญ', th:'กิน', en:'gin'}] },
      { th: 'ข้าว', zh: '飯', syl: ['ข้าว'], syls: [{cons:'ข', vowel:'อา', tone:'้', final:'ว', tone_name:'โท', th:'ข้าว', en:'khâao'}] },
      { th: 'อยู่', zh: '在（進行）', syl: ['หยู่'], syls: [{cons:'ย', lead:'อ', vowel:'อู', tone:'่', tone_name:'เอก', th:'อยู่', en:'yùu'}] },
      { th: 'ที่', zh: '在（地點）', syl: ['ที่'], syls: [{cons:'ท', vowel:'อี', tone:'่', tone_name:'โท', th:'ที่', en:'thîi'}] },
      { th: 'บ้าน', zh: '家', syl: ['บ้าน'], syls: [{cons:'บ', vowel:'อา', tone:'้', final:'น', tone_name:'โท', th:'บ้าน', en:'bâan'}] }
      ]
    },
    {
      th: 'เขาไม่ค่อยกินผักเลย', zh: '他不太吃蔬菜', wc: 6,
      words: [
      { th: 'เขา', zh: '他', syl: ['เขา'], syls: [{cons:'ข', vowel:'เอา', tone_name:'จัตวา', th:'เขา', en:'khǎo'}] },
      { th: 'ไม่', zh: '不', syl: ['ไม่'], syls: [{cons:'ม', vowel:'ไอ', tone:'่', tone_name:'โท', th:'ไม่', en:'mâi'}] },
      { th: 'ค่อย', zh: '太／怎麼', syl: ['ค่อย'], syls: [{cons:'ค', vowel:'ออ', tone:'่', final:'ย', tone_name:'โท', th:'ค่อย', en:'khôy'}] },
      { th: 'กิน', zh: '吃', syl: ['กิน'], syls: [{cons:'ก', vowel:'อิ', final:'น', tone_name:'สามัญ', th:'กิน', en:'gin'}] },
      { th: 'ผัก', zh: '蔬菜', syl: ['ผัก'], syls: [{cons:'ผ', vowel:'อะ', final:'ก', tone_name:'เอก', th:'ผัก', en:'phàk'}] },
      { th: 'เลย', zh: '（強調）', syl: ['เลย'], syls: [{cons:'ล', vowel:'เออ', final:'ย', tone_name:'สามัญ', th:'เลย', en:'loei'}] }
      ]
    },
    {
      th: 'คุณไปไหนมา', zh: '你去哪裡了？', wc: 4,
      words: [
      { th: 'คุณ', zh: '你', syl: ['คุน'], syls: [{cons:'ค', vowel:'อุ', final:'ณ', tone_name:'สามัญ', th:'คุณ', en:'khun'}] },
      { th: 'ไป', zh: '去', syl: ['ไป'], syls: [{cons:'ป', vowel:'ไอ', tone_name:'สามัญ', th:'ไป', en:'bpai'}] },
      { th: 'ไหน', zh: '哪裡', syl: ['ไหน'], syls: [{cons:'น', lead:'ห', vowel:'ไอ', tone_name:'จัตวา', th:'ไหน', en:'nǎi'}] },
      { th: 'มา', zh: '來（了）', syl: ['มา'], syls: [{cons:'ม', vowel:'อา', tone_name:'สามัญ', th:'มา', en:'maa'}] }
      ]
    },
    {
      th: 'ผมอยากเรียนภาษาไทย', zh: '我想學泰語', wc: 6,
      words: [
      { th: 'ผม', zh: '我', syl: ['ผม'], syls: [{cons:'ผ', vowel:'โอะ', final:'ม', tone_name:'จัตวา', th:'ผม', en:'phǎm'}] },
      { th: 'อยาก', zh: '想', syl: ['หยาก'], syls: [{cons:'ย', lead:'อ', vowel:'อา', final:'ก', tone_name:'เอก', th:'อยาก', en:'yàak'}] },
      { th: 'เรียน', zh: '學', syl: ['เรียน'], syls: [{cons:'ร', vowel:'เอีย', final:'น', tone_name:'สามัญ', th:'เรียน', en:'rian'}] },
      { th: 'ภาษาไทย', zh: '泰語', syl: ['พา', 'สา', 'ไท'], syls: [{cons:'ภ', vowel:'อา', tone_name:'สามัญ', th:'ภา', en:'phaa'}, {cons:'ษ', vowel:'อา', tone_name:'จัตวา', th:'ษา', en:'sǎa'}, {cons:'ท', vowel:'ไอ', final:'ย', tone_name:'สามัญ', th:'ไทย', en:'thai'}] }
      ]
    },
    {
      th: 'วันนี้อากาศร้อนมากเลย', zh: '今天天氣很熱', wc: 7,
      words: [
      { th: 'วันนี้', zh: '今天', syl: ['วัน', 'นี้'], syls: [{cons:'ว', vowel:'อะ', final:'น', tone_name:'สามัญ', th:'วัน', en:'wan'}, {cons:'น', vowel:'อี', tone:'้', tone_name:'ตรี', th:'นี้', en:'níi'}] },
      { th: 'อากาศ', zh: '天氣', syl: ['อา', 'กาด'], syls: [{cons:'อ', vowel:'อา', tone_name:'สามัญ', th:'อา', en:'aa'}, {cons:'ก', vowel:'อา', final:'ศ', tone_name:'เอก', th:'กาศ', en:'gàat'}] },
      { th: 'ร้อน', zh: '熱', syl: ['ร้อน'], syls: [{cons:'ร', vowel:'ออ', tone:'้', final:'น', tone_name:'ตรี', th:'ร้อน', en:'rón'}] },
      { th: 'มาก', zh: '很', syl: ['มาก'], syls: [{cons:'ม', vowel:'อา', final:'ก', tone_name:'โท', th:'มาก', en:'mâak'}] },
      { th: 'เลย', zh: '（強調）', syl: ['เลย'], syls: [{cons:'ล', vowel:'เออ', final:'ย', tone_name:'สามัญ', th:'เลย', en:'loei'}] }
      ]
    },
    {
      th: 'เขาพูดภาษาไทยได้', zh: '他會說泰語', wc: 6,
      words: [
      { th: 'เขา', zh: '他', syl: ['เขา'], syls: [{cons:'ข', vowel:'เอา', tone_name:'จัตวา', th:'เขา', en:'khǎo'}] },
      { th: 'พูด', zh: '說', syl: ['พูด'], syls: [{cons:'พ', vowel:'อู', final:'ด', tone_name:'โท', th:'พูด', en:'phûut'}] },
      { th: 'ภาษาไทย', zh: '泰語', syl: ['พา', 'สา', 'ไท'], syls: [{cons:'ภ', vowel:'อา', tone_name:'สามัญ', th:'ภา', en:'phaa'}, {cons:'ษ', vowel:'อา', tone_name:'จัตวา', th:'ษา', en:'sǎa'}, {cons:'ท', vowel:'ไอ', final:'ย', tone_name:'สามัญ', th:'ไทย', en:'thai'}] },
      { th: 'ได้', zh: '會／能', syl: ['ด้าย'], syls: [{cons:'ด', vowel:'ไอ', tone:'้', tone_name:'โท', th:'ได้', en:'dâi'}] }
      ]
    },
    {
      th: 'ผมไม่รู้จะทำยังไง', zh: '我不知道該怎麼辦', wc: 7,
      words: [
      { th: 'ผม', zh: '我', syl: ['ผม'], syls: [{cons:'ผ', vowel:'โอะ', final:'ม', tone_name:'จัตวา', th:'ผม', en:'phǎm'}] },
      { th: 'ไม่', zh: '不', syl: ['ไม่'], syls: [{cons:'ม', vowel:'ไอ', tone:'่', tone_name:'โท', th:'ไม่', en:'mâi'}] },
      { th: 'รู้', zh: '知道', syl: ['รู้'], syls: [{cons:'ร', vowel:'อู', tone:'้', tone_name:'ตรี', th:'รู้', en:'rúu'}] },
      { th: 'จะ', zh: '將／該', syl: ['จะ'], syls: [{cons:'จ', vowel:'อะ', tone_name:'เอก', th:'จะ', en:'jà'}] },
      { th: 'ทำ', zh: '做', syl: ['ทำ'], syls: [{cons:'ท', vowel:'อำ', tone_name:'สามัญ', th:'ทำ', en:'tham'}] },
      { th: 'ยังไง', zh: '怎麼', syl: ['ยัง', 'ไง'], syls: [{cons:'ย', vowel:'อะ', final:'ง', tone_name:'สามัญ', th:'ยัง', en:'yang'}, {cons:'ง', vowel:'ไอ', tone_name:'สามัญ', th:'ไง', en:'ngai'}] }
      ]
    },
    {
      th: 'พรุ่งนี้เราไปด้วยกันนะ', zh: '明天我們一起去吧', wc: 7,
      words: [
      { th: 'พรุ่งนี้', zh: '明天', syl: ['พรุ่ง', 'นี้'], syls: [{cons:'พ', cluster:'ร', vowel:'อุ', tone:'่', final:'ง', tone_name:'โท', th:'พรุ่ง', en:'phrûng'}, {cons:'น', vowel:'อี', tone:'้', tone_name:'ตรี', th:'นี้', en:'níi'}] },
      { th: 'เรา', zh: '我們', syl: ['เรา'], syls: [{cons:'ร', vowel:'เอา', tone_name:'สามัญ', th:'เรา', en:'rao'}] },
      { th: 'ไป', zh: '去', syl: ['ไป'], syls: [{cons:'ป', vowel:'ไอ', tone_name:'สามัญ', th:'ไป', en:'bpai'}] },
      { th: 'ด้วยกัน', zh: '一起', syl: ['ด้วย', 'กัน'], syls: [{cons:'ด', vowel:'อัว', tone:'้', final:'ย', tone_name:'โท', th:'ด้วย', en:'dûay'}, {cons:'ก', vowel:'อะ', final:'น', tone_name:'สามัญ', th:'กัน', en:'gan'}] },
      { th: 'นะ', zh: '吧', syl: ['นะ'], syls: [{cons:'น', vowel:'อะ', tone_name:'ตรี', th:'นะ', en:'ná'}] }
      ]
    },
    {
      th: 'แกกำลังทำอะไรอยู่', zh: '你在做什麼？', wc: 7,
      words: [
      { th: 'แก', zh: '你（口語）', syl: ['แก'], syls: [{cons:'ก', vowel:'แอ', tone_name:'สามัญ', th:'แก', en:'gae'}] },
      { th: 'กำลัง', zh: '正在', syl: ['กำ', 'ลัง'], syls: [{cons:'ก', vowel:'อำ', tone_name:'สามัญ', th:'กำ', en:'gam'}, {cons:'ล', vowel:'อะ', final:'ง', tone_name:'สามัญ', th:'ลัง', en:'lang'}] },
      { th: 'ทำ', zh: '做', syl: ['ทำ'], syls: [{cons:'ท', vowel:'อำ', tone_name:'สามัญ', th:'ทำ', en:'tham'}] },
      { th: 'อะไร', zh: '什麼', syl: ['อะ', 'ไร'], syls: [{cons:'อ', vowel:'อะ', tone_name:'เอก', th:'อะ', en:'à'}, {cons:'ร', vowel:'ไอ', tone_name:'สามัญ', th:'ไร', en:'rai'}] },
      { th: 'อยู่', zh: '（進行）', syl: ['หยู่'], syls: [{cons:'ย', lead:'อ', vowel:'อู', tone:'่', tone_name:'เอก', th:'อยู่', en:'yùu'}] }
      ]
    },
    {
      th: 'เธอยังไม่กลับบ้านเลยหรอ', zh: '她還沒回家嗎？', wc: 7,
      words: [
      { th: 'เธอ', zh: '她', syl: ['เทอ'], syls: [{cons:'ธ', vowel:'เออ', tone_name:'สามัญ', th:'เธอ', en:'thoe'}] },
      { th: 'ยัง', zh: '還', syl: ['ยัง'], syls: [{cons:'ย', vowel:'อะ', final:'ง', tone_name:'สามัญ', th:'ยัง', en:'yang'}] },
      { th: 'ไม่', zh: '沒', syl: ['ไม่'], syls: [{cons:'ม', vowel:'ไอ', tone:'่', tone_name:'โท', th:'ไม่', en:'mâi'}] },
      { th: 'กลับ', zh: '回', syl: ['กลับ'], syls: [{cons:'ก', cluster:'ล', vowel:'อะ', final:'บ', tone_name:'เอก', th:'กลับ', en:'glàp'}] },
      { th: 'บ้าน', zh: '家', syl: ['บ้าน'], syls: [{cons:'บ', vowel:'อา', tone:'้', final:'น', tone_name:'โท', th:'บ้าน', en:'bâan'}] },
      { th: 'เลย', zh: '（強調）', syl: ['เลย'], syls: [{cons:'ล', vowel:'เออ', final:'ย', tone_name:'สามัญ', th:'เลย', en:'loei'}] },
      { th: 'หรอ', zh: '嗎', syl: ['หรอ'], syls: [{cons:'ร', lead:'ห', vowel:'ออ', tone_name:'จัตวา', th:'หรอ', en:'rǒ'}] }
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
      return { th: s.th, zh: s.zh, en: en, level: '高', syls: flatSyls, words: wordMeanings };
    });
  };
})(window);
