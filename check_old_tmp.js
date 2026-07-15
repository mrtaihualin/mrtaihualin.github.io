global.window = global;
require('/sessions/pensive-charming-wozniak/mnt/mrtaihualin.github.io/data/tone-engine.js');
require('/sessions/pensive-charming-wozniak/mnt/mrtaihualin.github.io/data/words-data.js');
['ญาติ','เช็คเอาท์','บริษัท','ออฟฟิศ','นามบัตร'].forEach(function(word){
  var w = global.WORDS_MASTER.find(function(x){return x.word===word;});
  console.log(word, JSON.stringify(w));
});
