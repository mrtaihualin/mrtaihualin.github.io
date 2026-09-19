#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  catalogBatches,
  learningReadFailure,
  readLearningCatalog,
  readPublicLearningItems,
  resolveRpcRows,
  rpcFallbackAllowed,
} from '../supabase/functions/score-submit/learning-catalog.mjs';

const keys = Array.from({ length: 100 }, (_, index) => 'synthetic-' + '測'.repeat(9) + '-' + index);
const rows = keys.map((content_key, index) => ({
  item_id: '00000000-0000-4000-8000-' + String(index).padStart(12, '0'),
  content_source: 'game_words',
  content_key,
}));
const rpcRows = rows.map((row) => ({ ...row, match_count: 1 }));
const encode = (value) => encodeURIComponent(value).replace(/[!'()*]/g,
  (character) => '%' + character.charCodeAt(0).toString(16).toUpperCase());
const filterKey = (key) => /[,()]/.test(key) ? '"' + key + '"' : key;

function client(options = {}) {
  const calls = [];
  const events = [];
  function query(call, resolver) {
    const q = {
      select(value) { call.select = value; return q; },
      is(column, value) { call.owner = [column, value]; return q; },
      eq(column, value) { (call.equals ||= []).push([column, value]); return q; },
      in(column, value) { (call.ins ||= []).push([column, value]); return q; },
      limit(value) { call.limit = value; return q; },
      retry(value) { call.retry = value; return q; },
      abortSignal(value) { call.signal = value; return q; },
      then(resolve, reject) {
        return Promise.resolve().then(() => {
          events.push(call.kind === 'rpc' ? 'rpc' : 'from:' + call.table);
          return resolver(call);
        }).then(resolve, reject);
      },
    };
    return q;
  }
  return {
    calls,
    events,
    from(table) {
      const call = { kind: 'from', table }; calls.push(call);
      return query(call, () => {
        if (table === 'game_words') {
          if (options.contentFail) return { error: { code: 'PGRST000' }, status: 503 };
          return { data: keys.map((content_key) => ({ content_key })), error: null, status: 200 };
        }
        if (table === 'game_sentences') {
          return { data: keys.map((th) => ({ th })), error: null, status: 200 };
        }
        const filter = call.ins?.find(([column]) => column === 'content_key')?.[1] || [];
        const bytes = encode('in.(' + filter.map(filterKey).join(',') + ')').length;
        if (bytes > 4000) return { error: { code: '', message: 'synthetic long-request transport failure' }, status: 0 };
        if (options.legacyReject) throw new Error('synthetic-private-detail');
        if (options.legacyFail) return { error: { code: 'PGRST000', details: 'synthetic-private-detail' }, status: 503 };
        return { data: rows.filter((row) => filter.includes(row.content_key)), error: null, status: 200 };
      });
    },
    rpc(name, args) {
      const call = { kind: 'rpc', name, args }; calls.push(call);
      return query(call, () => {
        if (options.rpcReject) throw Object.assign(new Error('synthetic-private-detail'), { name: options.rpcReject });
        if (options.rpcError) return { data: null, error: options.rpcError, status: options.rpcStatus || 0 };
        return { data: options.rpcRows || rpcRows, error: null, status: 200 };
      });
    },
  };
}

let passed = 0;
async function check(name, fn) {
  await fn();
  passed += 1;
  console.log('PASS ' + name);
}

await check('long full filter fails fixture but bounded connector returns every identity', async () => {
  const raw = client();
  const failed = await raw.from('learning_items').in('content_key', keys);
  assert.ok(failed.error);
  const bounded = client();
  assert.deepEqual(await readPublicLearningItems(bounded, 'game_words', keys), rows);
  const reads = bounded.calls.filter((call) => call.table === 'learning_items');
  assert.ok(reads.length > 1);
  for (const call of reads) {
    assert.deepEqual(call.owner, ['owner_user_id', null]);
    assert.ok(call.equals.some(([column, value]) => column === 'content_source' && value === 'game_words'));
    assert.equal(call.select, 'item_id,content_source,content_key');
    assert.equal(call.retry, false);
    assert.equal(call.signal.aborted, false);
    assert.equal(call.limit, 2000);
  }
});

await check('short healthy filter keeps the original single read without new timeout or retry controls', async () => {
  const shortKeys = keys.slice(0, 20);
  const unchanged = client();
  assert.deepEqual(await readPublicLearningItems(unchanged, 'game_words', shortKeys), rows.slice(0, 20));
  const call = unchanged.calls.find((entry) => entry.table === 'learning_items');
  assert.equal(call.retry, undefined);
  assert.equal(call.signal, undefined);
});

await check('deduplication, punctuation and oversized keys retain fail-closed bounds', async () => {
  const special = ['synthetic,a', 'synthetic(b)', 'synthetic@初#variant'];
  const batches = catalogBatches([...special, ...special, ...keys]);
  assert.deepEqual(batches.flat(), [...special, ...keys]);
  for (const batch of batches) {
    assert.ok(encode('in.(' + batch.map(filterKey).join(',') + ')').length <= 1800);
  }
  const c = client();
  await assert.rejects(readPublicLearningItems(c, 'game_words', ['測'.repeat(700)]), { code: 'catalog_key_too_long' });
  assert.equal(c.calls.length, 0);
});

const previousError = console.error;
const logs = [];
console.error = (...args) => logs.push(JSON.stringify(args));
try {
  await check('bounded connector errors remain privacy-safe and never return partial rows', async () => {
    for (const options of [{ legacyFail: true }, { legacyReject: true }]) {
      await assert.rejects(readPublicLearningItems(client(options), 'game_words', keys),
        { code: 'learning_queue_unavailable', status: 503 });
    }
    const error = learningReadFailure('review_snapshot', {
      status: 503,
      error: { code: 'synthetic-private-code?', message: 'synthetic-private-detail', details: 'synthetic-private-detail' },
    });
    assert.equal(error.status, 503);
    assert.ok(logs.every((line) => !line.includes('synthetic-private-detail') && !line.includes('synthetic-item-')));
  });

  await check('RPC primary sends only game and level and does not call fallback on success', async () => {
    const c = client();
    const result = await readLearningCatalog(c, 'typing', 2, 'canary');
    assert.equal(result.length, 100);
    assert.deepEqual(c.events, ['rpc']);
    assert.deepEqual(c.calls[0].args, { p_game: 'typing', p_level: 2 });
    assert.equal(c.calls[0].retry, false);
    assert.equal(c.calls[0].signal.aborted, false);
  });

  await check('default off never calls RPC and retains the current connector route', async () => {
    const c = client();
    assert.equal((await readLearningCatalog(c, 'typing', 2)).length, 100);
    assert.equal(c.events.filter((event) => event === 'rpc').length, 0);
    assert.equal(c.events[0], 'from:game_words');
  });

  await check('technical RPC timeout, 5xx and unavailable function each use legacy fallback once and sequentially', async () => {
    const fixtures = [
      { rpcReject: 'TimeoutError' },
      { rpcError: { code: 'PGRST000' }, rpcStatus: 503 },
      { rpcError: { code: 'PGRST202' }, rpcStatus: 404 },
    ];
    for (const fixture of fixtures) {
      const c = client(fixture);
      const result = await readLearningCatalog(c, 'typing', 2, 'canary');
      assert.equal(result.length, 100);
      assert.equal(c.events[0], 'rpc');
      assert.equal(c.events.filter((event) => event === 'rpc').length, 1);
      assert.ok(c.events.indexOf('from:game_words') > c.events.indexOf('rpc'));
      assert.ok(c.events.indexOf('from:learning_items') > c.events.indexOf('from:game_words'));
    }
  });

  await check('permission and logical identity failures never invoke fallback', async () => {
    const forbidden = client({ rpcError: { code: '42501' }, rpcStatus: 403 });
    await assert.rejects(readLearningCatalog(forbidden, 'typing', 2, 'canary'),
      (error) => error.code === 'learning_queue_unavailable' && error.fallbackAllowed === false);
    assert.deepEqual(forbidden.events, ['rpc']);

    for (const invalidRows of [
      [{ ...rpcRows[0], item_id: null, match_count: 0 }],
      [{ ...rpcRows[0], match_count: 2 }],
      [rpcRows[0], { ...rpcRows[0], item_id: rows[1].item_id }],
    ]) {
      const logical = client({ rpcRows: invalidRows });
      await assert.rejects(readLearningCatalog(logical, 'typing', 2, 'canary'), { code: 'content_ref_not_unique' });
      assert.deepEqual(logical.events, ['rpc']);
    }
  });

  await check('shadow compares sequentially but keeps the existing catalog as control', async () => {
    const c = client();
    const result = await readLearningCatalog(c, 'typing', 2, 'shadow');
    assert.equal(result.length, 100);
    assert.equal(c.events[0], 'rpc');
    assert.ok(c.events.indexOf('from:game_words') > 0);
    assert.ok(logs.some((line) => line.includes('"result":"match"')));
  });

  await check('shadow mismatch returns the control result and flags nonmatching identities', async () => {
    const c = client({ rpcRows: rpcRows.slice(1) });
    const result = await readLearningCatalog(c, 'typing', 2, 'shadow');
    assert.equal(result.length, 100);
    assert.equal(c.events[0], 'rpc');
    assert.ok(logs.some((line) => line.includes('"result":"mismatch"')));
  });

  await check('failed one-shot fallback stops without another RPC and emits no partial catalog', async () => {
    const c = client({ rpcError: { code: 'PGRST000' }, rpcStatus: 503, legacyFail: true });
    await assert.rejects(readLearningCatalog(c, 'typing', 2, 'canary'),
      { code: 'learning_queue_unavailable', status: 503 });
    assert.equal(c.events.filter((event) => event === 'rpc').length, 1);
  });
} finally {
  console.error = previousError;
}

await check('transport classifier permits only technical fallback classes', () => {
  assert.equal(rpcFallbackAllowed({ status: 503, error: { code: 'PGRST000' } }), true);
  assert.equal(rpcFallbackAllowed({ status: 404, error: { code: 'PGRST202' } }), true);
  assert.equal(rpcFallbackAllowed({ status: 0, error: { code: '' } }), true);
  assert.equal(rpcFallbackAllowed({ status: 403, error: { code: '42501' } }), false);
  assert.equal(rpcFallbackAllowed({ status: 409, error: { code: 'race_retry' } }), false);
  assert.equal(rpcFallbackAllowed({ error: { code: '42501' } }), false);
  assert.equal(rpcFallbackAllowed({ error: new Error('unclassified coding failure') }), false);
});

await check('RPC row validation rejects empty, missing, duplicate and wrong-source identities', () => {
  assert.throws(() => resolveRpcRows([], 'game_words'), { code: 'learning_catalog_empty' });
  assert.throws(() => resolveRpcRows([{ ...rpcRows[0], content_source: 'game_sentences' }], 'game_words'),
    { code: 'content_ref_not_unique' });
});

await check('source keeps rollout off by default and migration grants only service_role execution', () => {
  const edge = fs.readFileSync(new URL('../supabase/functions/score-submit/index.ts', import.meta.url), 'utf8');
  const migration = fs.readFileSync(new URL('../supabase/migrations/20260919013259_phase1_learning_catalog_resolve_rpc.sql', import.meta.url), 'utf8');
  assert.ok(edge.includes("Deno.env.get('LEARNING_CATALOG_RPC_MODE') || 'off'"));
  assert.ok(edge.includes("Deno.env.get('LEARNING_CATALOG_RPC_SCOPES') || ''"));
  assert.ok(edge.includes("Deno.env.get('LEARNING_CATALOG_RPC_CANARY_USER_IDS') || ''"));
  assert.ok(edge.includes('learningCatalog(admin, user, game, level)'));
  assert.match(migration, /security invoker\s+set search_path = ''/);
  assert.match(migration, /revoke all on function public\.phase1_learning_catalog_resolve\(text, smallint\)[\s\S]*from public, anon, authenticated/);
  assert.match(migration, /grant execute on function public\.phase1_learning_catalog_resolve\(text, smallint\)[\s\S]*to service_role/);
  assert.doesNotMatch(migration, /\b(update|delete from|insert into)\s+public\./i);
});

console.log(passed + '/' + passed + ' catalog transport checks PASS');
