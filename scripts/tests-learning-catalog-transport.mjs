#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { catalogBatches, learningReadFailure, readPublicLearningItems } from '../supabase/functions/score-submit/learning-catalog.mjs';

const keys = Array.from({length:100}, (_, i) => 'synthetic-' + '測'.repeat(9) + '-' + i);
const rows = keys.map((content_key, i) => ({item_id:'synthetic-item-' + i,content_source:'game_words',content_key}));
const encode = value => encodeURIComponent(value).replace(/[!'()*]/g,c=>'%' + c.charCodeAt(0).toString(16).toUpperCase());
const filterKey = key => /[,()]/.test(key) ? '"' + key + '"' : key;
function client(options = {}) {
  const calls = [];
  return { calls, from(table) {
    const call = {table}; calls.push(call);
    const q = {
      select(value) {call.select=value;return q;}, is(column,value){call.owner=[column,value];return q;},
      eq(column,value){call.source=[column,value];return q;}, in(column,value){call.filter=[column,value];return q;},
      limit(value){call.limit=value;return q;},retry(value){call.retry=value;return q;},abortSignal(value){call.signal=value;return q;},
      then(resolve,reject) {
        return Promise.resolve().then(()=>{
          const bytes=encode('in.(' + call.filter[1].map(filterKey).join(',') + ')').length;
          if(bytes>4000) return {error:{code:'',message:'synthetic long-request transport failure'},status:0};
          if(options.reject) throw new Error('synthetic-private-detail');
          if(options.fail) return {error:{code:'PGRST000',details:'synthetic-private-detail'},status:503};
          return {data: rows.filter(row=>call.filter[1].includes(row.content_key)),error:null,status:200};
        }).then(resolve,reject);
      }
    }; return q;
  }};
}
let passed=0;
async function check(name, fn) {await fn();passed++;console.log('PASS '+name);}
await check('long full filter fails fixture but bounded connector returns every identity',async()=>{
  const raw=client(); const failed=await raw.from('learning_items').in('content_key',keys);
  assert.ok(failed.error);
  const bounded=client(); assert.deepEqual(await readPublicLearningItems(bounded,'game_words',keys),rows);
  assert.ok(bounded.calls.length>1);
  for(const call of bounded.calls) {
    assert.deepEqual(call.owner,['owner_user_id',null]);assert.deepEqual(call.source,['content_source','game_words']);
    assert.equal(call.select,'item_id,content_source,content_key');assert.equal(call.retry,false);
    assert.equal(call.signal.aborted,false);assert.equal(call.limit,2000);
  }
});
await check('deduplication and reserved punctuation retain exact full keys',()=>{
  const special=['synthetic,a','synthetic(b)','synthetic@初#variant'];
  const batches=catalogBatches([...special,...special,...keys]);
  assert.deepEqual(batches.flat(),[...special,...keys]);
  for(const batch of batches) assert.ok(encode('in.('+batch.map(filterKey).join(',')+')').length<=1800);
});
await check('single oversized key fails closed without any upstream request',async()=>{
  const c=client();await assert.rejects(readPublicLearningItems(c,'game_words',['測'.repeat(300)]),{code:'catalog_key_too_long'});
  assert.equal(c.calls.length,0);
});
const previousError=console.error;
const logs=[];console.error=(...args)=>logs.push(JSON.stringify(args));
try {
  await check('upstream error and rejected transport become retryable 503 without partial rows',async()=>{
    for(const options of [{fail:true},{reject:true}]) await assert.rejects(readPublicLearningItems(client(options),'game_words',keys),{code:'learning_queue_unavailable',status:503});
    assert.ok(logs.every(line=>!line.includes('synthetic-private-detail')&&!line.includes('synthetic-item-')));
  });
  await check('diagnostic log allowlists code and never includes upstream message or detail',()=>{
    const e=learningReadFailure('review_snapshot',{status:503,error:{code:'synthetic-private-code?',message:'synthetic-private-detail',details:'synthetic-private-detail'}});
    assert.equal(e.status,503);assert.equal(e.code,'learning_queue_unavailable');
    assert.ok(logs.at(-1).includes('transport_or_unknown'));assert.ok(!logs.at(-1).includes('synthetic-private-detail'));
  });
} finally {console.error=previousError;}
await check('real catalog function preserves fail-closed missing and duplicate identity checks',async()=>{
  const source=fs.readFileSync(new URL('../supabase/functions/score-submit/index.ts',import.meta.url),'utf8');
  const start=source.indexOf('async function learningCatalog('),end=source.indexOf('\nasync function currentLearningSnapshot(',start);
  const fn=source.slice(start,end).replace(/: any\[\]|: any|: number/g,'').replace('as Record<number, string>','').replace('new Map<string, any[]>()','new Map()');
  for(const connectorRows of [[],[rows[0],{...rows[0],item_id:'synthetic-duplicate'}]]) {
    const context={readPublicLearningItems:async()=>connectorRows,learningReadFailure};vm.createContext(context);vm.runInContext(fn,context);
    const admin={from:()=>({select(){return this;},eq(){return this;},in(){return this;},limit:async()=>({data:[{content_key:keys[0]}],error:null})})};
    await assert.rejects(context.learningCatalog(admin,{verifier:'typing'},2),{code:'content_ref_not_unique'});
  }
  assert.ok(source.includes("error?.status === 503 ? 503 : 400"));
});
console.log(passed + '/' + passed + ' catalog transport checks PASS');
