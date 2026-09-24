// ════════════════════════════════════════════════════════════
// Supabase Edge Function: game-content
// หน้าที่: จุดเดียวที่เกมคำศัพท์ (reading/tone-finder/typing/word-order/listening/lego)
//   ดึงคำ/ประโยคมาใช้ — แทนที่การโหลด data/words-data.js, data/adv-sentences.js ตรงๆ
//   (ของเดิมเป็นไฟล์ public เปิด URL ตรงๆ เห็นครบทุกคำ/ทุกประโยคเสมอ ไม่ว่าจะล็อกอินหรือไม่
//   — เพดานเดิมเป็นแค่ JS ตัดอาร์เรย์ฝั่ง browser ไม่ใช่ด่านความปลอดภัยจริง)
//
// ด่านความปลอดภัยจริงอยู่ 2 ชั้น:
//   1) ตาราง game_words/game_sentences ไม่มี grant ให้ anon/authenticated เลย (ดู
//      supabase/sql/2026-08-02_game_content_schema.sql) — client เรียก PostgREST ตรงๆ
//      อ่านไม่ได้เด็ดขาด ต้องผ่านฟังก์ชันนี้ (service_role) เท่านั้น
//   2) ฟังก์ชันนี้ตัดสิน "tier" (anon/login) จาก JWT ที่ auth.getUser() ยืนยันจริงฝั่งเซิร์ฟเวอร์
//      เท่านั้น — ไม่เชื่อ tier/isLoggedIn ที่ client ส่งมาใน body เด็ดขาด (เผื่อมีคนปลอม
//      body มาหลอกว่า "ฉันล็อกอินแล้ว" เพื่อขอโควตาที่มากกว่า — ฟังก์ชันนี้ไม่อ่านค่านั้นเลย)
//
// เพดานเนื้อหา (Lin ยืนยัน 2026-08-02 — แทนที่เพดานปลอมเดิมทั้งหมด):
//   ระดับ    ไม่ล็อกอิน   ล็อกอินแล้ว(ยังไม่จ่ายเงิน)
//   初        50 คำ        100 คำ
//   中        50 คำ        100 คำ
//   高(ประโยค) 20 ประโยค    42 ประโยค
//   Paid owner runtime: เกมทั้ง 6 ใช้ Free 200 + Paid ทั้งสอง batch ในคลังกลางเดียวกัน
//   รวม 582 semantic records (初 469 / 中 113); คำเขียนเหมือนกันแต่คนละความหมาย
//   คงเป็นคนละ record ด้วย contentKey ที่ต่างกัน
//   เมื่อบัญชีมี owner_all_access; Guest/Login Free ยังคงใช้ Free 200 เดิม
//
// วิธี deploy: ใช้ migration ปัจจุบันที่บันทึก canonical_record ที่ Lin ตรวจแล้วเท่านั้น
// แล้ว deploy Edge Function นี้ ห้ามใช้ตัวนำเข้าที่สร้าง/คำนวณช่องภาษาใหม่
//      ⚠️ ไม่ใส่ --no-verify-jwt (ต่างจาก line-webhook) — ฟังก์ชันนี้ถูกเรียกจาก Supabase
//      client ในเบราว์เซอร์เสมอ (แนบ apikey/anon JWT อัตโนมัติ แม้ยังไม่ได้ล็อกอิน) จึงใช้
//      ค่า default (verify_jwt เปิด) ได้เหมือน game-reward/tone-round — เกตเวย์เช็คแค่ว่า
//      "เป็น JWT ของโปรเจกต์นี้จริง" (anon JWT ก็ผ่าน) ส่วน "ใครคือคนที่ล็อกอินอยู่จริง" ฟังก์ชัน
//      นี้เช็คซ้ำเองอีกชั้นด้วย auth.getUser() ข้างล่าง (ไม่เชื่อแค่เกตเวย์อย่างเดียว)
// ════════════════════════════════════════════════════════════

// deno-lint-ignore-file
// @ts-nocheck  (Supabase Edge Function รันบน Deno ไม่ใช่ Node — เวลาแก้ไฟล์นี้ในเครื่องอาจมี type error ของ IDE ปกติ ไม่กระทบตอน deploy จริง)

import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'npm:@supabase/supabase-js@2.112.3';
import { OWNER_CATALOG_SPECS, matchesExactCatalogSlice } from './catalog-integrity.mjs';

// เพดานเนื้อหา — ปรับตัวเลขได้ตรงนี้ที่เดียว ไม่ต้องแก้โค้ดฝั่งเว็บ (ดูตารางที่คอมเมนต์หัวไฟล์)
const CAPS = {
  anon:  { '初': 50,  '中': 50,  sentences: 20 },
  login: { '初': 100, '中': 100, sentences: 42 },
  paid:  { '初': 469, '中': 113, sentences: 42 },
};
const FREE_RUNTIME_CATALOG_VERSION = 'free-200-v1';
const GAME_SURFACES = new Set(['tone', 'reading', 'typing', 'word_order', 'listening', 'lego']);
const REQUIRED_CATALOG_STRING_FIELDS = [
  'contentKey', 'reviewSet', 'word', 'spellingTH', 'readingTH', 'roman', 'zhTW',
  'level', 'type', 'category', 'audioStatus',
];
const REQUIRED_SYLLABLE_STRING_FIELDS = [
  'roman', 'lead', 'consonant', 'cluster', 'vowel', 'writtenFinal', 'toneMark',
  'toneName', 'liveDead', 'consonantReadDifference', 'finalReadDifference', 'silent',
];
const isExactNonblank = (value) => (
  typeof value === 'string' && value.length > 0 && value.trim() === value
);
const hasExactStringBoundaries = (value) => {
  if (typeof value === 'string') return value.trim() === value;
  if (Array.isArray(value)) return value.every(hasExactStringBoundaries);
  if (value && typeof value === 'object') return Object.values(value).every(hasExactStringBoundaries);
  return true;
};
const exactWrittenSegments = (record) => {
  if (!record || !Array.isArray(record.syllables) || !record.syllables.length) return null;
  if (Array.isArray(record.spellingSyllables)) {
    if (record.spellingSyllables.length !== record.syllables.length ||
        !record.spellingSyllables.every((syllable) => syllable && isExactNonblank(syllable.th)) ||
        record.spellingSyllables.map((syllable) => syllable.th).join('') !== record.word) return null;
    return record.spellingSyllables;
  }
  // The Paid 189 queue predates spellingSyllables, but spellingTH already stores Lin's
  // exact reviewed written-syllable boundaries. Project those explicit segments only;
  // never infer a boundary from Thai spelling or pronunciation.
  if (Object.prototype.hasOwnProperty.call(record, 'spellingSyllables') || !isExactNonblank(record.spellingTH)) return null;
  const parts = record.spellingTH.split('-');
  if (parts.length !== record.syllables.length || parts.some((part) => !isExactNonblank(part)) ||
      parts.join('') !== record.word) return null;
  return parts.map((th) => ({ th }));
};

// โดเมนจริงของเว็บ (ตรงกับ allowedHosts ใน line-login/index.ts) — www เผื่อไว้แม้ CNAME ปัจจุบันไม่ใช้
const ALLOWED_ORIGINS = [
  'https://mrtaihualin.com',
  'https://www.mrtaihualin.com',
  'https://mrtaihualin.github.io',
  // 2026-09-04: independent AWS CloudFront backup; game-content CORS only
  'https://d1dqva9smlfgk0.cloudfront.net',
  // 2026-08-10 (P7-02 staging): หน้าทดสอบ staging บน Netlify
  'https://gentle-moxie-bf64ad.netlify.app',
  'https://mrtaihualin-release-7c823713.mrtaihualin.workers.dev',
  'https://1fd7118d-mrtaihualin-release-7c823713.mrtaihualin.workers.dev',
  'https://mrtaihualin-preview-learning-e4ea92c.mrtaihualin.workers.dev',
];

function corsHeaders(origin) {
  const allowOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Vary': 'Origin',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
}
function json(body, status, origin) {
  return new Response(JSON.stringify(body), { status: status || 200, headers: { 'Content-Type': 'application/json', ...corsHeaders(origin) } });
}

// PostgREST occasionally rejected one request from the concurrent service-role batch with 401
// while the sibling requests using the same key succeeded. Retry only idempotent reads, with a
// short bounded delay. The rate-limit RPC is intentionally excluded so a retry cannot count twice.
const TRANSIENT_READ_AUTH_RETRY_DELAYS_MS = [120, 360];
async function readWithTransientAuthRetry(queryFactory) {
  let result = await queryFactory();
  for (const delayMs of TRANSIENT_READ_AUTH_RETRY_DELAYS_MS) {
    if (!result?.error || result.status !== 401) return result;
    await new Promise((resolve) => setTimeout(resolve, delayMs));
    result = await queryFactory();
  }
  return result;
}

serve(async (req) => {
  const origin = req.headers.get('Origin') || '';
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(origin) });
  if (req.method !== 'POST') return json({ error: 'method not allowed' }, 405, origin);

  try {
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY');
    const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    let requestBody = {};
    try { requestBody = await req.json(); } catch (_) { return json({ error: 'bad json' }, 400, origin); }
    if (requestBody?.contract !== 'canonical-v1') {
      return json({ error: 'content_contract_upgrade_required' }, 409, origin);
    }
    const requestedGame = typeof requestBody?.game === 'string' ? requestBody.game : '';
    if (requestedGame && !GAME_SURFACES.has(requestedGame)) return json({ error: 'bad game surface' }, 400, origin);
    // ── หา tier จาก JWT จริงฝั่งเซิร์ฟเวอร์เท่านั้น (ไม่อ่าน/ไม่เชื่อ body ใดๆ ที่ client ส่งมาเรื่อง tier) ──
    const authHeader = req.headers.get('Authorization') || '';
    const userClient = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } } });
    const { data: userData } = await userClient.auth.getUser();
    const admin = createClient(SUPABASE_URL, SERVICE_KEY); // service_role — ข้าม RLS ได้ ใช้อ่านตารางล็อกเท่านั้น
    const user = userData?.user || null;
    // The already-established owner entitlement receives Free 200 plus the exact union of
    // both reviewed Paid batches on every protected game surface. The browser cannot select
    // a tier or batch, and same-written/different-meaning records remain distinct by contentKey.
    let paidAccess = false;
    if (user && requestedGame && GAME_SURFACES.has(requestedGame)) {
      const entitlement = await readWithTransientAuthRetry(() => admin.from('phase1_product_entitlements')
        .select('entitlement').eq('user_id', user.id).eq('entitlement', 'owner_all_access').limit(2));
      if (entitlement.error) return json({ error: 'entitlement_unavailable' }, 503, origin);
      paidAccess = entitlement.data?.length === 1;
    }
    const tier = paidAccess ? 'paid' : (user ? 'login' : 'anon');
    const caps = CAPS[tier];
    const selectWords = (level, statuses, tiers, catalogVersions, limit) => {
      let query = admin.from('game_words')
        .select('catalog:canonical_record')
        .eq('level', level).in('status', statuses)
        .in('access_tier', tiers);
      query = catalogVersions.length === 1
        ? query.eq('catalog_version', catalogVersions[0])
        : query.in('catalog_version', catalogVersions);
      return query.order('rank', { ascending: true }).limit(limit);
    };
    const wordQuery = async (level) => {
      if (!paidAccess) {
        const freeTiers = tier === 'login' ? ['guest', 'login'] : ['guest'];
        return selectWords(level, ['active'], freeTiers, [FREE_RUNTIME_CATALOG_VERSION], caps[level]);
      }
      const catalogResults = await Promise.all(OWNER_CATALOG_SPECS.map((spec) => {
        const expected = spec.levels[level];
        // Read one beyond the reviewed count so an overfilled catalog cannot be hidden by truncation.
        return selectWords(level, spec.statuses, spec.tiers, [spec.catalogVersion], expected.count + 1);
      }));
      const failed = catalogResults.find((result) => result.error);
      if (failed) return failed;
      for (let index = 0; index < OWNER_CATALOG_SPECS.length; index += 1) {
        const expected = OWNER_CATALOG_SPECS[index].levels[level];
        if (!await matchesExactCatalogSlice(catalogResults[index].data, expected)) {
          return { data: null, error: { message: 'owner_catalog_mismatch' }, status: 500 };
        }
      }
      return { data: catalogResults.flatMap((result) => result.data), error: null, status: 200 };
    };

    // ── rate limit เกราะเสริมแบบ fail-closed — ถ้าด่านตรวจล่ม ห้ามปล่อยข้อมูลออก ──
    // คนล็อกอิน → คีย์ตาม user id (ปลอมไม่ได้) · คนไม่ล็อกอิน → คีย์ตาม IP (x-forwarded-for)
    const xff = req.headers.get('x-forwarded-for') || '';
    const ip = (xff.split(',')[0] || '').trim() || 'unknown';
    const rlKey = user ? ('user:' + user.id) : ('ip:' + ip);

    // ── ดึงคำ 初/中 + ประโยค高 ตามเพดานของ tier นี้ (order by rank = ลำดับความสำคัญที่ล็อกไว้แล้ว) ──
    // 2026-08-07: เดิม rate-limit RPC รอจบก่อนค่อยเริ่ม query คำ/ประโยค (2 รอบไปกลับ Supabase เรียงกัน)
    // วัดจริงจาก Network tab (Chrome MCP) พบว่า game-content ทั้งก้อนกินเวลา 700ms-2900ms ต่อครั้ง สุ่มมาก
    // ไม่ผูกกับเกมไหนเกมหนึ่ง (เกมเสียง/เกมอ่านเจอพอกัน เพราะเรียก Edge Function ตัวเดียวกัน) → ยิง
    // rate-limit RPC พร้อมกับ query ข้อมูลไปเลย (ไม่รอให้ rate-limit ผ่านก่อน) ตัดไปได้ 1 รอบไปกลับ ยังเช็ค
    // ผล rate-limit ก่อน "ส่งข้อมูลออกไป" เหมือนเดิม (ถ้าโดน rate limit ข้อมูลที่ query มาจะถูกทิ้ง ไม่ส่งกลับ
    // ไม่กระทบความปลอดภัย แค่กิน DB เกินจำเป็นเล็กน้อยเฉพาะตอนโดนบล็อกเท่านั้น)
    const [rl, w1, w2, sent] = await Promise.all([
      admin.rpc('game_content_rl_check', { p_key: rlKey, p_limit: 60, p_window: 60 }),
      readWithTransientAuthRetry(() => wordQuery('初')),
      readWithTransientAuthRetry(() => wordQuery('中')),
      readWithTransientAuthRetry(() => admin.from('game_sentences')
        .select('th,zh,reading_th,wc,polite_f,words')
        .order('rank', { ascending: true }).limit(caps.sentences)),
    ]);
    if (rl.error) return json({ error: 'rate_limit_unavailable — 請稍後再試' }, 503, origin);
    if (rl.data !== true) return json({ error: 'rate_limited — 請稍後再試' }, 429, origin);
    if (w1.error) throw w1.error;
    if (w2.error) throw w2.error;
    if (sent.error) throw sent.error;

    // Vocabulary authority is the exact Lin-reviewed canonical_record. This function may
    // authenticate, apply entitlement caps and filter rows, but must never rewrite,
    // normalize, infer or recalculate a language field.
    const validateWord = (r) => {
      const record = r.catalog;
      if (!record || typeof record !== 'object' || Array.isArray(record)) {
        throw new Error('catalog_authority_missing');
      }
      if (!hasExactStringBoundaries(record) ||
          !REQUIRED_CATALOG_STRING_FIELDS.every((field) => isExactNonblank(record[field])) ||
          !Array.isArray(record.approvalRefs) || !record.approvalRefs.length ||
          !record.approvalRefs.every(isExactNonblank) ||
          !Array.isArray(record.syllables) || !record.syllables.length) {
        throw new Error('catalog_authority_incomplete:' + (record.contentKey || record.word || 'unknown'));
      }
      if (!exactWrittenSegments(record)) {
        throw new Error('catalog_display_segmentation_incomplete:' + record.contentKey);
      }
      record.syllables.forEach((syllable, index) => {
        if (!syllable || !REQUIRED_SYLLABLE_STRING_FIELDS.every((field) => isExactNonblank(syllable[field])) ||
            !Number.isInteger(syllable.toneNumber) || syllable.toneNumber < 1 || syllable.toneNumber > 5) {
          throw new Error('catalog_authority_incomplete:' + record.contentKey + ':' + index);
        }
      });
    };
    const validateSentence = (r) => {
      if (!hasExactStringBoundaries(r) ||
          !isExactNonblank(r?.th) || !isExactNonblank(r?.zh) || !isExactNonblank(r?.reading_th) ||
          !Number.isInteger(r?.wc) || !Array.isArray(r?.words) || !r.words.length) {
        throw new Error('sentence_authority_incomplete:' + (r?.th || 'unknown'));
      }
      let syllableCount = 0;
      r.words.forEach((word) => {
        if (!isExactNonblank(word?.th) || !isExactNonblank(word?.zh) || !Array.isArray(word?.syls) || !word.syls.length) {
          throw new Error('sentence_authority_incomplete:' + r.th);
        }
        word.syls.forEach((syllable) => {
          if (!isExactNonblank(syllable?.th) || !isExactNonblank(syllable?.en) ||
              !isExactNonblank(syllable?.cons) || !isExactNonblank(syllable?.vowel) ||
              !isExactNonblank(syllable?.tone_name)) {
            throw new Error('sentence_authority_incomplete:' + r.th);
          }
          syllableCount += 1;
        });
      });
      const readingParts = r.reading_th.split('-');
      if (r.words.map((word) => word.th).join('') !== r.th || r.wc !== syllableCount ||
          readingParts.length !== syllableCount || readingParts.some((part) => !isExactNonblank(part))) {
        throw new Error('sentence_authority_mismatch:' + r.th);
      }
    };
    const toSentence = (r) => ({
      th: r.th, zh: r.zh, readingTH: r.reading_th, wc: r.wc, politeF: r.polite_f, words: r.words,
    });

    const words = (w1.data || []).concat(w2.data || []);
    words.forEach(validateWord);
    (sent.data || []).forEach(validateSentence);
    const sentences = (sent.data || []).map(toSentence);
    if (!words.length || !sentences.length) {
      return json({ error: 'content_unavailable — empty required dataset' }, 503, origin);
    }

    // Audio availability is derived server-side from private metadata and filtered to this response's
    // entitled content. Never return storage paths, hashes, filenames, or a catalog-wide manifest.
    const entitledTexts = new Set(words.map((row) => row.catalog.word).concat(sentences.map((row) => row.th)));
    const { data: audioRows, error: audioError } = await readWithTransientAuthRetry(() => admin.from('audio_assets')
      .select('text_th').in('status', ['generated', 'approved']).not('storage_path', 'is', null));
    if (audioError) return json({ error: 'audio_availability_unavailable' }, 503, origin);
    const audioAvailable = Array.from(new Set((audioRows || [])
      .map((row) => row.text_th)
      .filter((text) => entitledTexts.has(text))));

    // ── สัญญาณ "ชนเพดานฟรีแล้ว" (เพิ่ม 2026-08-08 ตาม P6-08 ข้อ 1) — เป็นการประมาณต้นทุนต่ำ ──
    // ไม่ได้ query "จำนวนทั้งหมดที่มีจริงในตาราง" (ต้องยิง count เพิ่ม 1-3 ครั้งต่อ request ซึ่งไม่คุ้ม
    // สำหรับ signal ระดับนี้) แค่เช็คว่า "จำนวนแถวที่ตัดส่งกลับ = เพดานของ tier นี้พอดี" — ถ้าใช่ แปลว่า
    // อย่างน้อยมีของเหลืออีก (เท่ากับ/มากกว่า) เพดาน จึงถือว่า "น่าจะชนเพดานแล้ว" ได้แม่นยำเพียงพอ
    // (ยกเว้นกรณีขอบ: มีคำ/ประโยคพอดีเท่าเพดานเป๊ะ ไม่มีเหลือเลย — ถือว่า capped=true ก็ยังถูกต้องอยู่
    // เพราะผู้เล่นได้ครบทุกอันที่ tier นี้ "ควรได้" แล้วจริงๆ ไม่มีของเพิ่มให้ tier นี้อีก)
    // ห้าม client ใช้ field นี้แทนการเช็คสิทธิ์ใดๆ — เป็นแค่สัญญาณ UI/analytics เท่านั้น ไม่ใช่ด่านความปลอดภัย
    const capped = {
      '初': w1.data.length >= caps['初'],
      '中': w2.data.length >= caps['中'],
      sentences: sent.data.length >= caps.sentences,
    };

    let paidSrsState = [];
    if (paidAccess && requestedGame === 'tone') {
      const state = await readWithTransientAuthRetry(() => admin.from('phase2_paid_srs_states')
        .select('game,level,content_key,phase,next_checkpoint,due_on,mastered,active_challenge,ever_failed,reschedule_pending')
        .eq('user_id', user.id).eq('game', 'tone'));
      if (state.error) return json({ error: 'paid_srs_state_unavailable' }, 503, origin);
      paidSrsState = state.data || [];
    }

    return json({ tier, game: requestedGame || null, words, sentences, audioAvailable, capped,
      paidSrsState: paidAccess && requestedGame === 'tone' ? paidSrsState : undefined }, 200, origin);
  } catch (e) {
    return json({ error: String((e && e.message) || e) }, 500, origin);
  }
});
