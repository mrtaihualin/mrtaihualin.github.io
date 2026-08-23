#!/usr/bin/env node
'use strict';
const fs=require('fs');
const path=require('path');
const root=path.resolve(__dirname,'..');
const read=(p)=>fs.readFileSync(path.join(root,p),'utf8');
const failures=[]; let pass=0;
function expect(cond,msg){if(!cond)failures.push(msg);else{pass++;console.log('✓ '+msg);}}
const ui=read('js/core/search-ui.js');
const adapter=read('js/core/global-search-game-adapter.js');
const index=read('index.html');
const quotaEdge=read('supabase/functions/problem-search-daily-limit/index.ts');
expect(ui.includes('GlobalSearchGameAdapter.analyze(query)'), 'Global UI delegates game/public composition to shared adapter');
expect(!ui.includes('SearchEngine.searchSite(query)'), 'Global UI no longer uses legacy searchSite game ranking');
expect(ui.includes("/functions/v1/problem-search-daily-limit"), 'Global Problem Search uses the same server quota endpoint as Game Search');
expect(ui.includes("body: JSON.stringify({ request_id: reqId })"), 'quota request sends only request_id payload');
expect(!/JSON\.stringify\(\{[^}]*query\s*:/.test(ui), 'quota payload does not send raw query');
expect(ui.includes("result.entry.category === 'practice'"), 'Gemini public fallback cannot bypass game entitlement');
expect(adapter.includes("entry.category !== 'practice'"), 'generic Global public pool excludes practice/game entries');
expect(quotaEdge.indexOf("service.auth.getUser(accessToken)")<quotaEdge.indexOf("const raw = await req.text()"), 'quota Edge authenticates before parsing the request payload');
expect(quotaEdge.includes("keys.length !== 1 || keys[0] !== 'request_id'"), 'quota Edge rejects raw query, user id, and every extra client field');
const scripts=['https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2','data/search-index.js?v=1','data/game-problem-corpus-v2_3.js?v=1','js/core/search-engine.js?v=3','js/games/game-problem-search.js?v=2','js/core/global-search-game-adapter.js?v=1','js/core/search-ui.js?v=4'];
let last=-1, orderOk=true;
for(const src of scripts){const i=index.indexOf(src); if(i<0||i<=last){orderOk=false;break;} last=i;}
expect(orderOk,'index.html loads auth client, corpus, shared GameProblemSearch, adapter, then Global UI in order');
if(failures.length){console.error('\nFAIL '+failures.length);failures.forEach(x=>console.error('- '+x));process.exit(1);}console.log(`PASS ${pass} static Global↔Game integration contracts`);
