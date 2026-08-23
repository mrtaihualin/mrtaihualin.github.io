// js/games/study-plan-core.js
(function(root,factory){
  if(typeof module==='object'&&module.exports) module.exports=factory();
  else root.StudyPlanCore=factory();
})(typeof self!=='undefined'?self:this,function(){
  'use strict';

  var GAME_ORDER=['tone','reading','listening','typing','word_order','lego'];
  var SCORE_GAMES=['tone','reading','listening','typing','word_order'];
  var URLS={
    tone:'/tone-finder.html',
    reading:'/reading-game.html',
    listening:'/listening-game.html',
    typing:'/typing-game.html',
    word_order:'/word-order.html',
    lego:'/lego.html'
  };
  var GAME_TITLES={
    tone:'聲調',reading:'拼讀',listening:'聽力',typing:'打字',word_order:'語序',lego:'造句'
  };
  var LEVEL_MATRIX={
    tone:[{value:1,label:'初級'},{value:2,label:'中級'},{value:3,label:'高級'}],
    reading:[{value:'初',label:'初級'},{value:'中',label:'中級'},{value:'高',label:'高級'}],
    listening:[{value:'初',label:'初級'},{value:'中',label:'中級'}],
    typing:[{value:'初',label:'初級'},{value:'中',label:'中級'},{value:'高',label:'高級'}],
    word_order:[{value:'高',label:'高級（此遊戲目前只有高級）'}],
    lego:[{value:'lv1',label:'第一級'}]
  };

  function num(v,f){v=Number(v);return isFinite(v)?v:(f||0);}
  function clamp10(v){return Math.max(0,Math.min(10,num(v,0)));}

  function normalizeGameType(value){
    value=String(value||'').toLowerCase().replace(/-/g,'_');
    if(value==='tone_finder') return 'tone';
    if(value==='reading_game') return 'reading';
    if(value==='wordorder') return 'word_order';
    return GAME_ORDER.indexOf(value)>=0?value:null;
  }

  function normalizeReport(report){
    var out=[];
    if(!report||!Array.isArray(report.items)) return out;
    var game=normalizeGameType(report.game_type);
    if(!game||game==='lego') return out;

    report.items.forEach(function(item){
      if(game==='listening'){
        var ling=item&&item.linguistic||{};
        var mode=String(ling.answer_mode||'mc');
        var listening=num(ling.listening_score,0);
        // Locked Product: Listening MC is base 5; normalize to base 10.
        // Typed Listening primary is already base 10.
        var listening10=mode==='mc'?clamp10(listening*2):clamp10(listening);
        out.push({game:'listening',score10:listening10,source:'listening'});
        // Locked Product: typed Listening's typing component belongs to Typing,
        // never to Listening. It is already base 10.
        if(mode==='type'){
          out.push({game:'typing',score10:clamp10(ling.typing_score),source:'listening-typed'});
        }
        return;
      }

      var score=item&&item.item_score;
      if(score==null||!isFinite(Number(score))) score=item&&item.is_correct?10:0;
      out.push({game:game,score10:clamp10(score),source:game});
    });
    return out;
  }

  function emptyPerf(){
    var p={};
    SCORE_GAMES.forEach(function(g){p[g]={count:0,totalScore:0,averageScore:null};});
    return p;
  }

  function applyContributions(perf,rows){
    perf=perf||emptyPerf();
    SCORE_GAMES.forEach(function(g){
      if(!perf[g]) perf[g]={count:0,totalScore:0,averageScore:null};
    });
    (rows||[]).forEach(function(row){
      if(!row||SCORE_GAMES.indexOf(row.game)<0) return;
      var p=perf[row.game];
      p.count=Math.max(0,num(p.count,0))+1;
      p.totalScore=Math.max(0,num(p.totalScore,0))+clamp10(row.score10);
      p.averageScore=p.count?p.totalScore/p.count:null;
    });
    return perf;
  }

  function hasAnyStats(perf){
    return SCORE_GAMES.some(function(g){return perf&&perf[g]&&num(perf[g].count,0)>0;});
  }

  function buildCycle(perf,useWeakness){
    if(!useWeakness||!hasAnyStats(perf)) return GAME_ORDER.slice();

    var selected=[], remaining=SCORE_GAMES.slice();
    for(var slot=0;slot<5;slot++){
      var criterion=(slot%2===0)?'averageScore':'totalScore';
      var candidates=remaining.filter(function(g){
        return perf&&perf[g]&&num(perf[g].count,0)>0&&perf[g][criterion]!=null;
      });
      var pick=null;
      if(candidates.length){
        candidates.sort(function(a,b){
          var av=num(perf[a][criterion],Infinity), bv=num(perf[b][criterion],Infinity);
          if(av!==bv) return av-bv;
          return SCORE_GAMES.indexOf(a)-SCORE_GAMES.indexOf(b);
        });
        pick=candidates[0];
      }else{
        pick=remaining.slice().sort(function(a,b){
          return SCORE_GAMES.indexOf(a)-SCORE_GAMES.indexOf(b);
        })[0];
      }
      selected.push(pick);
      remaining=remaining.filter(function(g){return g!==pick;});
    }
    selected.push('lego');
    return selected;
  }

  function validateMinutes(minutes,loggedIn){
    minutes=Math.floor(num(minutes,0));
    var min=5,max=loggedIn?20:10;
    return {ok:minutes>=min&&minutes<=max,minutes:minutes,min:min,max:max};
  }

  function levelOptions(game){
    return (LEVEL_MATRIX[game]||[]).map(function(option){
      return {value:option.value,label:option.label};
    });
  }

  function normalizeLevel(game,value){
    if(game==='tone'&&value!==''&&value!=null)value=Number(value);
    var options=LEVEL_MATRIX[game]||[];
    for(var i=0;i<options.length;i++)if(options[i].value===value)return value;
    return null;
  }

  function defaultLevel(game){
    var options=LEVEL_MATRIX[game]||[];
    return options.length?options[0].value:null;
  }

  function validateSelectedGames(items){
    if(!Array.isArray(items)||!items.length)return {ok:false,reason:'selection'};
    var seen={},normalized=[];
    for(var i=0;i<items.length;i++){
      var item=items[i]||{},game=normalizeGameType(item.game),level=normalizeLevel(game,item.level);
      if(!game||seen[game]||level==null)return {ok:false,reason:'selection'};
      seen[game]=true;normalized.push({game:game,level:level});
    }
    return {ok:true,items:normalized};
  }

  function nextFromRotation(rotation,perf,useWeakness){
    rotation=rotation||{};
    var order=Array.isArray(rotation.order)&&rotation.order.length===6?rotation.order.slice():buildCycle(perf,useWeakness);
    var index=Math.max(0,Math.min(5,Math.floor(num(rotation.nextIndex,0))));
    var game=order[index];
    index+=1;
    if(index>=6){
      order=buildCycle(perf,useWeakness);
      index=0;
    }
    return {game:game,rotation:{order:order,nextIndex:index}};
  }

  function formatSeconds(seconds){
    seconds=Math.max(0,Math.floor(num(seconds,0)));
    var m=Math.floor(seconds/60),s=seconds%60;
    return String(m).padStart(2,'0')+':'+String(s).padStart(2,'0');
  }

  return {
    GAME_ORDER:GAME_ORDER,
    SCORE_GAMES:SCORE_GAMES,
    URLS:URLS,
    GAME_TITLES:GAME_TITLES,
    LEVEL_MATRIX:LEVEL_MATRIX,
    normalizeGameType:normalizeGameType,
    normalizeReport:normalizeReport,
    emptyPerf:emptyPerf,
    applyContributions:applyContributions,
    buildCycle:buildCycle,
    validateMinutes:validateMinutes,
    levelOptions:levelOptions,
    normalizeLevel:normalizeLevel,
    defaultLevel:defaultLevel,
    validateSelectedGames:validateSelectedGames,
    nextFromRotation:nextFromRotation,
    formatSeconds:formatSeconds
  };
});
