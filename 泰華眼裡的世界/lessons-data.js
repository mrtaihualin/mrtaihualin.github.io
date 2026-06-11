// ===== 📖 自學專區資料 =====
// เพิ่มบทเรียนใหม่ที่นี่ โดย copy รูปแบบด้านล่าง
// vocabulary[]: { thai, phonetic, meaning, note, examples[{thai,zh}] }
// conversation{}: { situation, lines[{speaker,thai,zh}] }

var SELFSTUDY_ARTICLES = [
  {
    id: 'vocab-cilantro',
    date: '2025年5月16日',
    title: '香菜就是 ผักชี！泰語餐廳必備句',
    linkedPostId: 'post-cilantro',
    vocabulary: [
      {
        thai: 'ผักชี',
        phonetic: 'phàk-chii',
        meaning: '香菜、芫荽',
        note: '泰式料理常見的配菜裝飾，但泰國人對它其實沒有特別喜愛，只是習慣放而已。',
        examples: [
          { thai: 'ไม่เอาผักชีนะครับ', zh: '不要加香菜喔（對服務生說）' },
          { thai: 'ร้านนี้ใส่ผักชีเยอะมาก', zh: '這家店放了很多香菜' }
        ]
      },
      {
        thai: 'ไม่เอา',
        phonetic: 'mâi ao',
        meaning: '不要、不加',
        note: '點餐時最實用的句型之一，後面可以接任何食材：ไม่เอา + [食材]',
        examples: [
          { thai: 'ไม่เอาเผ็ดนะครับ', zh: '我不要辣的' },
          { thai: 'ไม่เอาน้ำแข็งด้วยนะครับ', zh: '也不要加冰塊' }
        ]
      },
      {
        thai: 'อาหารไทย',
        phonetic: 'aa-hǎan thai',
        meaning: '泰式料理',
        note: '「อาหาร」是「食物/料理」，「ไทย」是「泰國/泰國的」，合在一起就是泰式料理。',
        examples: [
          { thai: 'คุณชอบอาหารไทยไหมครับ', zh: '你喜歡泰式料理嗎？' },
          { thai: 'อาหารไทยส่วนใหญ่จะเผ็ด', zh: '泰式料理大多都偏辣' }
        ]
      },
      {
        thai: 'เผ็ด',
        phonetic: 'phèt',
        meaning: '辣',
        note: '可以加「มาก」（很辣）或「นิดหน่อย」（一點點辣）來調整程度。',
        examples: [
          { thai: 'เผ็ดมากไหมครับ', zh: '很辣嗎？' },
          { thai: 'ขอเผ็ดนิดหน่อยได้ไหมครับ', zh: '可以稍微辣一點嗎？' }
        ]
      }
    ],
    conversation: {
      situation: '🍜 場景：在泰國餐廳點湯姆葉（ต้มยำ）',
      lines: [
        { speaker: '你', thai: 'ขอต้มยำกุ้งหนึ่งชามนะครับ', zh: '我要一碗蝦仁冬蔭功' },
        { speaker: '服務生', thai: 'ได้เลยครับ เผ็ดมากหรือน้อยดีครับ', zh: '好的，請問要大辣還是小辣？' },
        { speaker: '你', thai: 'เผ็ดน้อยๆ ก็ได้ครับ แล้วก็ไม่เอาผักชีด้วยนะครับ', zh: '小辣就好，然後不要加香菜喔' },
        { speaker: '服務生', thai: 'โอเคครับ รอสักครู่นะครับ', zh: '沒問題，請稍等一下' }
      ]
    }
  }
  // เพิ่มบทเรียนใหม่ได้ที่นี่...
];
