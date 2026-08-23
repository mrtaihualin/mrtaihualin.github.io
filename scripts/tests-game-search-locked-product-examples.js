#!/usr/bin/env node
'use strict';
const path=require('path');
const root=path.resolve(__dirname,'..');
const Search=require(path.join(root,'js/games/game-problem-search.js'));
const SECONDARY={Tone:'Listening',Reading:'Typing',Listening:'Tone',Typing:'Reading','Word Order':'Lego',Lego:'Word Order'};
const sets={
  Tone:['聲調一直念錯','五個聲調分不出來','長短音分不出來','尾音常常念錯','ผันวรรณยุกต์ไม่เป็น','แยกเสียงวรรณยุกต์ไม่ได้'],
  Reading:['泰文字看不懂','看到泰文字不知道怎麼讀','子音母音不知道怎麼拼','字母都認得，但合起來不會讀','不會斷詞','泰文字全部黏在一起','อ่านประสมไม่เป็น','ไม่รู้ว่าตรงไหนเป็นคำ'],
  Listening:['泰國人講話太快','沒有字幕就聽不懂','抓不到單字','看到知道，聽到認不出來','聽起來全部黏在一起','ฟังคนไทยไม่ทัน','ฟังแล้วแยกคำไม่ออก','รู้คำนี้แต่พอได้ยินแล้วไม่รู้ว่าเป็นคำอะไร'],
  Typing:['不會打泰文','泰文鍵盤不會用','不知道字母在哪裡','會說但是不會寫','不知道這個字怎麼拼','常常拼錯','不會寫','สะกดไม่เป็น','รู้ว่าอ่านยังไงแต่เขียนไม่ถูก','พิมพ์ไทยช้ามาก'],
  'Word Order':['不知道單字怎麼排','句子順序不會','不知道哪個字要放前面','每個單字都知道，但不知道怎麼排列','照中文順序講泰文','每個字都對，但整句很奇怪','เรียงคำไม่เป็น','รู้ศัพท์แต่เรียงประโยคไม่ถูก','ไม่รู้คำไหนต้องอยู่ก่อน'],
  Lego:['背很多單字還是不會說','單字都知道，但不會組成句子','只會單字，不會講完整句子','不知道要用什麼單字','想表達但不知道泰文怎麼說','腦中先想中文再翻成泰文','รู้ศัพท์แต่พูดไม่ได้','จำศัพท์ได้แต่เอามาใช้ไม่เป็น','ไม่รู้จะเริ่มประโยคยังไง','แต่งประโยคไม่เป็น','不會造句']
};
let total=0, failures=[];
for(const [primary,queries] of Object.entries(sets)){
  for(const query of queries){
    total++;
    const a=Search.analyze(query); const recs=a.recommendations||[];
    if(!a.classification || a.classification.directRoute!==true || recs.length!==2 || recs[0].game!==primary || recs[1].game!==SECONDARY[primary]){
      failures.push({query,expected:[primary,SECONDARY[primary]],actual:recs.map(x=>x.game),classification:a.classification});
    }
  }
}
if(failures.length){console.error(JSON.stringify(failures,null,2));process.exit(1);}
console.log(`PASS ${total}/${total} locked Product mapping examples + deterministic relevant secondary pair`);
