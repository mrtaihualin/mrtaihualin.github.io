-- Add the exact Lin-authored LG001-LG012 sentence set to the Advanced game catalog.
-- Production application is authorized by Lin on 2026-09-22 together with the Login/Paid cap increase to 42.
-- Additive only: no existing sentence, learning state, score, save, or history row is deleted.

begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

lock table public.game_sentences in share row exclusive mode;

do $precheck$
declare
  v_count integer;
begin
  if pg_catalog.to_regclass('public.game_sentences') is null
     or pg_catalog.to_regclass('public.learning_items') is null then
    raise exception 'LG_ADVANCED_REQUIRED_TABLE_MISSING';
  end if;

  select pg_catalog.count(*) into v_count from public.game_sentences;
  if v_count <> 30 then
    raise exception 'LG_ADVANCED_BASE_COUNT_MISMATCH:%', v_count;
  end if;

  if exists (
    select 1
    from public.game_sentences
    where rank between 31 and 42
       or content_key between 'sentence-high-031' and 'sentence-high-042'
       or th = any(array[
         'ผมอยากกินผัดไทย',
         'พรุ่งนี้เช้าอยากไปเซเว่น',
         'หนูอยากไปกินข้าวกับเพื่อน',
         'พรุ่งนี้พี่อยากไปเที่ยวกับเพื่อน',
         'วันนี้เราอยากนอนอยู่โรงแรม',
         'ตอนเช้าอยากกินกาแฟ',
         'เย็นนี้ผมอยากดูหนังกับเพื่อน',
         'พี่อยากกลับบ้านแล้วเหรอ',
         'ตอนนี้เราอยากไปเที่ยวแล้ว',
         'อยากนอนแล้วเหรอ',
         'อยากกลับบ้านแล้วหรือยัง',
         'อยากไปซื้อของหรือเปล่า'
       ]::text[])
  ) then
    raise exception 'LG_ADVANCED_TARGET_COLLISION';
  end if;
end
$precheck$;

with source as (
  select *
  from pg_catalog.jsonb_to_recordset($lg$[{"rank":31,"content_key":"sentence-high-031","review_set":"LG001-LG012","approval_ref":"LIN:2026-09-22:LG001","th":"ผมอยากกินผัดไทย","zh":"我想吃泰式炒河粉","reading_th":"ผม-อยาก-กิน-ผัด-ไทย","wc":5,"polite_f":null,"words":[{"th":"ผม","zh":"我","syls":[{"cons":"ผ","vowel":"โอะ","final":"ม","tone_name":"จัตวา","th":"ผม","en":"phǒm"}]},{"th":"อยาก","zh":"想要","syls":[{"cons":"ย","lead":"อ","vowel":"อา","final":"ก","tone_name":"เอก","th":"อยาก","en":"yàak"}]},{"th":"กิน","zh":"吃","syls":[{"cons":"ก","vowel":"อิ","final":"น","tone_name":"สามัญ","th":"กิน","en":"gin"}]},{"th":"ผัดไทย","zh":"泰式炒河粉","syls":[{"cons":"ผ","vowel":"อะ","final":"ด","tone_name":"เอก","th":"ผัด","en":"phàt"},{"cons":"ท","vowel":"ไอ","final":"ย","tone_name":"สามัญ","th":"ไทย","en":"thai"}]}]},{"rank":32,"content_key":"sentence-high-032","review_set":"LG001-LG012","approval_ref":"LIN:2026-09-22:LG002","th":"พรุ่งนี้เช้าอยากไปเซเว่น","zh":"明天早上想去7-11","reading_th":"พรุ่ง-นี้-เช้า-อยาก-ไป-เซ-เว่น","wc":7,"polite_f":"ค่ะ","words":[{"th":"พรุ่งนี้เช้า","zh":"明天早上","syls":[{"cons":"พ","cluster":"ร","vowel":"อุ","tone":"่","final":"ง","tone_name":"โท","th":"พรุ่ง","en":"phrûng"},{"cons":"น","vowel":"อี","tone":"้","tone_name":"ตรี","th":"นี้","en":"níi"},{"cons":"ช","vowel":"เอา","tone":"้","tone_name":"ตรี","th":"เช้า","en":"cháo"}]},{"th":"อยาก","zh":"想要","syls":[{"cons":"ย","lead":"อ","vowel":"อา","final":"ก","tone_name":"เอก","th":"อยาก","en":"yàak"}]},{"th":"ไป","zh":"去","syls":[{"cons":"ป","vowel":"ไอ","tone_name":"สามัญ","th":"ไป","en":"bpai"}]},{"th":"เซเว่น","zh":"7-11便利商店","syls":[{"cons":"ซ","vowel":"เอ","tone_name":"สามัญ","th":"เซ","en":"see"},{"cons":"ว","vowel":"เอะ","tone":"่","final":"น","tone_name":"โท","th":"เว่น","en":"wên"}]}]},{"rank":33,"content_key":"sentence-high-033","review_set":"LG001-LG012","approval_ref":"LIN:2026-09-22:LG003","th":"หนูอยากไปกินข้าวกับเพื่อน","zh":"我想跟朋友去吃飯","reading_th":"หนู-อยาก-ไป-กิน-ข้าว-กับ-เพื่อน","wc":7,"polite_f":"ค่ะ","words":[{"th":"หนู","zh":"我（女生對長輩自稱）","syls":[{"cons":"น","lead":"ห","vowel":"อู","tone_name":"จัตวา","th":"หนู","en":"nǔu"}]},{"th":"อยาก","zh":"想要","syls":[{"cons":"ย","lead":"อ","vowel":"อา","final":"ก","tone_name":"เอก","th":"อยาก","en":"yàak"}]},{"th":"ไป","zh":"去","syls":[{"cons":"ป","vowel":"ไอ","tone_name":"สามัญ","th":"ไป","en":"bpai"}]},{"th":"กินข้าว","zh":"吃飯","syls":[{"cons":"ก","vowel":"อิ","final":"น","tone_name":"สามัญ","th":"กิน","en":"gin"},{"cons":"ข","vowel":"อา","tone":"้","final":"ว","tone_name":"โท","th":"ข้าว","en":"khâao"}]},{"th":"กับ","zh":"和／跟","syls":[{"cons":"ก","vowel":"อะ","final":"บ","tone_name":"เอก","th":"กับ","en":"gàp"}]},{"th":"เพื่อน","zh":"朋友","syls":[{"cons":"พ","vowel":"เอือ","tone":"่","final":"น","tone_name":"โท","th":"เพื่อน","en":"phûean"}]}]},{"rank":34,"content_key":"sentence-high-034","review_set":"LG001-LG012","approval_ref":"LIN:2026-09-22:LG004","th":"พรุ่งนี้พี่อยากไปเที่ยวกับเพื่อน","zh":"明天我想跟朋友去玩","reading_th":"พรุ่ง-นี้-พี่-อยาก-ไป-เที่ยว-กับ-เพื่อน","wc":8,"polite_f":"ค่ะ","words":[{"th":"พรุ่งนี้","zh":"明天","syls":[{"cons":"พ","cluster":"ร","vowel":"อุ","tone":"่","final":"ง","tone_name":"โท","th":"พรุ่ง","en":"phrûng"},{"cons":"น","vowel":"อี","tone":"้","tone_name":"ตรี","th":"นี้","en":"níi"}]},{"th":"พี่","zh":"我（對晚輩自稱）","syls":[{"cons":"พ","vowel":"อี","tone":"่","tone_name":"โท","th":"พี่","en":"phîi"}]},{"th":"อยาก","zh":"想要","syls":[{"cons":"ย","lead":"อ","vowel":"อา","final":"ก","tone_name":"เอก","th":"อยาก","en":"yàak"}]},{"th":"ไปเที่ยว","zh":"去玩／去旅行","syls":[{"cons":"ป","vowel":"ไอ","tone_name":"สามัญ","th":"ไป","en":"bpai"},{"cons":"ท","vowel":"เอีย","tone":"่","final":"ว","tone_name":"โท","th":"เที่ยว","en":"thîao"}]},{"th":"กับ","zh":"和／跟","syls":[{"cons":"ก","vowel":"อะ","final":"บ","tone_name":"เอก","th":"กับ","en":"gàp"}]},{"th":"เพื่อน","zh":"朋友","syls":[{"cons":"พ","vowel":"เอือ","tone":"่","final":"น","tone_name":"โท","th":"เพื่อน","en":"phûean"}]}]},{"rank":35,"content_key":"sentence-high-035","review_set":"LG001-LG012","approval_ref":"LIN:2026-09-22:LG005","th":"วันนี้เราอยากนอนอยู่โรงแรม","zh":"今天我想待在飯店休息","reading_th":"วัน-นี้-เรา-อยาก-นอน-อยู่-โรง-แรม","wc":8,"polite_f":"ค่ะ","words":[{"th":"วันนี้","zh":"今天","syls":[{"cons":"ว","vowel":"อะ","final":"น","tone_name":"สามัญ","th":"วัน","en":"wan"},{"cons":"น","vowel":"อี","tone":"้","tone_name":"ตรี","th":"นี้","en":"níi"}]},{"th":"เรา","zh":"我（同輩口語）","syls":[{"cons":"ร","vowel":"เอา","tone_name":"สามัญ","th":"เรา","en":"rao"}]},{"th":"อยาก","zh":"想要","syls":[{"cons":"ย","lead":"อ","vowel":"อา","final":"ก","tone_name":"เอก","th":"อยาก","en":"yàak"}]},{"th":"นอน","zh":"睡覺／休息","syls":[{"cons":"น","vowel":"ออ","final":"น","tone_name":"สามัญ","th":"นอน","en":"norn"}]},{"th":"อยู่","zh":"待在／位於","syls":[{"cons":"ย","lead":"อ","vowel":"อู","tone":"่","tone_name":"เอก","th":"อยู่","en":"yùu"}]},{"th":"โรงแรม","zh":"飯店","syls":[{"cons":"ร","vowel":"โอ","final":"ง","tone_name":"สามัญ","th":"โรง","en":"roong"},{"cons":"ร","vowel":"แอ","final":"ม","tone_name":"สามัญ","th":"แรม","en":"raem"}]}]},{"rank":36,"content_key":"sentence-high-036","review_set":"LG001-LG012","approval_ref":"LIN:2026-09-22:LG006","th":"ตอนเช้าอยากกินกาแฟ","zh":"早上想喝咖啡","reading_th":"ตอน-เช้า-อยาก-กิน-กา-แฟ","wc":6,"polite_f":"ค่ะ","words":[{"th":"ตอนเช้า","zh":"早上","syls":[{"cons":"ต","vowel":"ออ","final":"น","tone_name":"สามัญ","th":"ตอน","en":"dton"},{"cons":"ช","vowel":"เอา","tone":"้","tone_name":"ตรี","th":"เช้า","en":"cháo"}]},{"th":"อยาก","zh":"想要","syls":[{"cons":"ย","lead":"อ","vowel":"อา","final":"ก","tone_name":"เอก","th":"อยาก","en":"yàak"}]},{"th":"กิน","zh":"喝（口語搭配咖啡）","syls":[{"cons":"ก","vowel":"อิ","final":"น","tone_name":"สามัญ","th":"กิน","en":"gin"}]},{"th":"กาแฟ","zh":"咖啡","syls":[{"cons":"ก","vowel":"อา","tone_name":"สามัญ","th":"กา","en":"gaa"},{"cons":"ฟ","vowel":"แอ","tone_name":"สามัญ","th":"แฟ","en":"fae"}]}]},{"rank":37,"content_key":"sentence-high-037","review_set":"LG001-LG012","approval_ref":"LIN:2026-09-22:LG007","th":"เย็นนี้ผมอยากดูหนังกับเพื่อน","zh":"今天下午我想跟朋友去看電影","reading_th":"เย็น-นี้-ผม-อยาก-ดู-หนัง-กับ-เพื่อน","wc":8,"polite_f":null,"words":[{"th":"เย็นนี้","zh":"今天傍晚／今晚","syls":[{"cons":"ย","vowel":"เอะ","final":"น","tone_name":"สามัญ","th":"เย็น","en":"yen"},{"cons":"น","vowel":"อี","tone":"้","tone_name":"ตรี","th":"นี้","en":"níi"}]},{"th":"ผม","zh":"我","syls":[{"cons":"ผ","vowel":"โอะ","final":"ม","tone_name":"จัตวา","th":"ผม","en":"phǒm"}]},{"th":"อยาก","zh":"想要","syls":[{"cons":"ย","lead":"อ","vowel":"อา","final":"ก","tone_name":"เอก","th":"อยาก","en":"yàak"}]},{"th":"ดูหนัง","zh":"看電影","syls":[{"cons":"ด","vowel":"อู","tone_name":"สามัญ","th":"ดู","en":"duu"},{"cons":"น","lead":"ห","vowel":"อะ","final":"ง","tone_name":"จัตวา","th":"หนัง","en":"nǎng"}]},{"th":"กับ","zh":"和／跟","syls":[{"cons":"ก","vowel":"อะ","final":"บ","tone_name":"เอก","th":"กับ","en":"gàp"}]},{"th":"เพื่อน","zh":"朋友","syls":[{"cons":"พ","vowel":"เอือ","tone":"่","final":"น","tone_name":"โท","th":"เพื่อน","en":"phûean"}]}]},{"rank":38,"content_key":"sentence-high-038","review_set":"LG001-LG012","approval_ref":"LIN:2026-09-22:LG008","th":"พี่อยากกลับบ้านแล้วเหรอ","zh":"你想回家了嗎","reading_th":"พี่-อยาก-กลับ-บ้าน-แล้ว-เหรอ","wc":6,"polite_f":"คะ","words":[{"th":"พี่","zh":"你（稱呼年長者）","syls":[{"cons":"พ","vowel":"อี","tone":"่","tone_name":"โท","th":"พี่","en":"phîi"}]},{"th":"อยาก","zh":"想要","syls":[{"cons":"ย","lead":"อ","vowel":"อา","final":"ก","tone_name":"เอก","th":"อยาก","en":"yàak"}]},{"th":"กลับบ้าน","zh":"回家","syls":[{"cons":"ก","cluster":"ล","vowel":"อะ","final":"บ","tone_name":"เอก","th":"กลับ","en":"glàp"},{"cons":"บ","vowel":"อา","tone":"้","final":"น","tone_name":"โท","th":"บ้าน","en":"bâan"}]},{"th":"แล้ว","zh":"了","syls":[{"cons":"ล","vowel":"แอ","tone":"้","final":"ว","tone_name":"ตรี","th":"แล้ว","en":"láew"}]},{"th":"เหรอ","zh":"嗎／是嗎","syls":[{"cons":"ร","lead":"ห","vowel":"เออ","tone_name":"จัตวา","th":"เหรอ","en":"rǒe"}]}]},{"rank":39,"content_key":"sentence-high-039","review_set":"LG001-LG012","approval_ref":"LIN:2026-09-22:LG009","th":"ตอนนี้เราอยากไปเที่ยวแล้ว","zh":"我現在想去玩了","reading_th":"ตอน-นี้-เรา-อยาก-ไป-เที่ยว-แล้ว","wc":7,"polite_f":"ค่ะ","words":[{"th":"ตอนนี้","zh":"現在","syls":[{"cons":"ต","vowel":"ออ","final":"น","tone_name":"สามัญ","th":"ตอน","en":"dton"},{"cons":"น","vowel":"อี","tone":"้","tone_name":"ตรี","th":"นี้","en":"níi"}]},{"th":"เรา","zh":"我（同輩口語）","syls":[{"cons":"ร","vowel":"เอา","tone_name":"สามัญ","th":"เรา","en":"rao"}]},{"th":"อยาก","zh":"想要","syls":[{"cons":"ย","lead":"อ","vowel":"อา","final":"ก","tone_name":"เอก","th":"อยาก","en":"yàak"}]},{"th":"ไปเที่ยว","zh":"去玩／去旅行","syls":[{"cons":"ป","vowel":"ไอ","tone_name":"สามัญ","th":"ไป","en":"bpai"},{"cons":"ท","vowel":"เอีย","tone":"่","final":"ว","tone_name":"โท","th":"เที่ยว","en":"thîao"}]},{"th":"แล้ว","zh":"了","syls":[{"cons":"ล","vowel":"แอ","tone":"้","final":"ว","tone_name":"ตรี","th":"แล้ว","en":"láew"}]}]},{"rank":40,"content_key":"sentence-high-040","review_set":"LG001-LG012","approval_ref":"LIN:2026-09-22:LG010","th":"อยากนอนแล้วเหรอ","zh":"想睡覺了嗎","reading_th":"อยาก-นอน-แล้ว-เหรอ","wc":4,"polite_f":"คะ","words":[{"th":"อยาก","zh":"想要","syls":[{"cons":"ย","lead":"อ","vowel":"อา","final":"ก","tone_name":"เอก","th":"อยาก","en":"yàak"}]},{"th":"นอน","zh":"睡覺","syls":[{"cons":"น","vowel":"ออ","final":"น","tone_name":"สามัญ","th":"นอน","en":"norn"}]},{"th":"แล้ว","zh":"了","syls":[{"cons":"ล","vowel":"แอ","tone":"้","final":"ว","tone_name":"ตรี","th":"แล้ว","en":"láew"}]},{"th":"เหรอ","zh":"嗎／是嗎","syls":[{"cons":"ร","lead":"ห","vowel":"เออ","tone_name":"จัตวา","th":"เหรอ","en":"rǒe"}]}]},{"rank":41,"content_key":"sentence-high-041","review_set":"LG001-LG012","approval_ref":"LIN:2026-09-22:LG011","th":"อยากกลับบ้านแล้วหรือยัง","zh":"想回家了嗎","reading_th":"อยาก-กลับ-บ้าน-แล้ว-หรือ-ยัง","wc":6,"polite_f":"คะ","words":[{"th":"อยาก","zh":"想要","syls":[{"cons":"ย","lead":"อ","vowel":"อา","final":"ก","tone_name":"เอก","th":"อยาก","en":"yàak"}]},{"th":"กลับบ้าน","zh":"回家","syls":[{"cons":"ก","cluster":"ล","vowel":"อะ","final":"บ","tone_name":"เอก","th":"กลับ","en":"glàp"},{"cons":"บ","vowel":"อา","tone":"้","final":"น","tone_name":"โท","th":"บ้าน","en":"bâan"}]},{"th":"แล้ว","zh":"了","syls":[{"cons":"ล","vowel":"แอ","tone":"้","final":"ว","tone_name":"ตรี","th":"แล้ว","en":"láew"}]},{"th":"หรือยัง","zh":"了嗎／還沒","syls":[{"cons":"ร","lead":"ห","vowel":"อื","tone_name":"จัตวา","th":"หรือ","en":"rǔue"},{"cons":"ย","vowel":"อะ","final":"ง","tone_name":"สามัญ","th":"ยัง","en":"yang"}]}]},{"rank":42,"content_key":"sentence-high-042","review_set":"LG001-LG012","approval_ref":"LIN:2026-09-22:LG012","th":"อยากไปซื้อของหรือเปล่า","zh":"想去買東西嗎","reading_th":"อยาก-ไป-ซื้อ-ของ-หรือ-เปล่า","wc":6,"polite_f":"คะ","words":[{"th":"อยาก","zh":"想要","syls":[{"cons":"ย","lead":"อ","vowel":"อา","final":"ก","tone_name":"เอก","th":"อยาก","en":"yàak"}]},{"th":"ไป","zh":"去","syls":[{"cons":"ป","vowel":"ไอ","tone_name":"สามัญ","th":"ไป","en":"bpai"}]},{"th":"ซื้อของ","zh":"買東西","syls":[{"cons":"ซ","vowel":"อื","tone":"้","tone_name":"ตรี","th":"ซื้อ","en":"súe"},{"cons":"ข","vowel":"ออ","final":"ง","tone_name":"จัตวา","th":"ของ","en":"khǒng"}]},{"th":"หรือเปล่า","zh":"嗎／是不是","syls":[{"cons":"ร","lead":"ห","vowel":"อื","tone_name":"จัตวา","th":"หรือ","en":"rǔue"},{"cons":"ป","cluster":"ล","vowel":"เอา","tone":"่","tone_name":"เอก","th":"เปล่า","en":"plào"}]}]}]$lg$::jsonb) as row(
    rank integer,
    content_key text,
    review_set text,
    approval_ref text,
    th text,
    zh text,
    reading_th text,
    wc integer,
    polite_f text,
    words jsonb
  )
),
canonical as (
  select
    source.*,
    array['word_order']::text[] as surfaces,
    pg_catalog.jsonb_build_object(
      'word_order', 'ready',
      'typing', 'incomplete',
      'tone', 'pending_contract',
      'reading', 'pending_contract',
      'listening', 'pending_contract'
    ) as readiness,
    pg_catalog.jsonb_build_object(
      'schemaVersion', 'sentence-canonical-v1',
      'contentKey', source.content_key,
      'reviewSet', source.review_set,
      'level', '高',
      'status', 'active',
      'accessTier', 'login',
      'catalogVersion', 'sentence-v1',
      'surfaces', pg_catalog.to_jsonb(array['word_order']::text[]),
      'sentenceTH', source.th,
      'spellingTH', source.th,
      'zhTW', source.zh,
      'readingTH', source.reading_th,
      'roman', null,
      'type', 'ประโยค',
      'category', null,
      'audioStatus', null,
      'approvalRefs', pg_catalog.jsonb_build_array(source.approval_ref),
      'syllableCount', source.wc,
      'wordCount', pg_catalog.jsonb_array_length(source.words),
      'politeF', source.polite_f,
      'spacingPolicy', null,
      'punctuationPolicy', null,
      'politeEndingPolicy', null,
      'words', source.words,
      'wordOccurrences', (
        select pg_catalog.jsonb_agg(
          pg_catalog.jsonb_build_object(
            'occurrenceId', 'w' || pg_catalog.lpad(part.ordinality::text, 2, '0'),
            'position', part.ordinality,
            'contentKey', null,
            'reviewSet', source.review_set,
            'word', part.value->>'th',
            'spellingTH', part.value->>'th',
            'readingTH', null,
            'roman', null,
            'zhTW', part.value->>'zh',
            'level', '高',
            'type', null,
            'category', null,
            'audioStatus', null,
            'approvalRefs', pg_catalog.jsonb_build_array(source.approval_ref),
            'syllables', (
              select pg_catalog.jsonb_agg(
                pg_catalog.jsonb_build_object(
                  'roman', syllable.value->>'en',
                  'lead', syllable.value->>'lead',
                  'consonant', syllable.value->>'cons',
                  'cluster', syllable.value->>'cluster',
                  'vowel', syllable.value->>'vowel',
                  'writtenFinal', syllable.value->>'final',
                  'toneMark', syllable.value->>'tone',
                  'toneNumber', syllable.value->'toneNumber',
                  'toneName', syllable.value->>'tone_name',
                  'liveDead', syllable.value->>'liveDead',
                  'consonantReadDifference', syllable.value->>'consonantReadDifference',
                  'finalReadDifference', syllable.value->>'finalReadDifference',
                  'silent', syllable.value->>'silent'
                ) order by syllable.ordinality
              )
              from pg_catalog.jsonb_array_elements(part.value->'syls')
                with ordinality as syllable(value, ordinality)
            ),
            'spellingSyllables', (
              select pg_catalog.jsonb_agg(
                pg_catalog.jsonb_build_object(
                  'cons', syllable.value->>'cons',
                  'vowel', syllable.value->>'vowel',
                  'tone_name', syllable.value->>'tone_name',
                  'th', syllable.value->>'th',
                  'en', syllable.value->>'en',
                  'final', syllable.value->>'final',
                  'finalRead', syllable.value->>'finalRead'
                ) order by syllable.ordinality
              )
              from pg_catalog.jsonb_array_elements(part.value->'syls')
                with ordinality as syllable(value, ordinality)
            )
          ) order by part.ordinality
        )
        from pg_catalog.jsonb_array_elements(source.words)
          with ordinality as part(value, ordinality)
      ),
      'wordOrderAnswers', pg_catalog.jsonb_build_array((
        select pg_catalog.jsonb_agg(
          'w' || pg_catalog.lpad(part.ordinality::text, 2, '0')
          order by part.ordinality
        )
        from pg_catalog.jsonb_array_elements(source.words)
          with ordinality as part(value, ordinality)
      )),
      'gameReadiness', pg_catalog.jsonb_build_object(
        'word_order', 'ready',
        'typing', 'incomplete',
        'tone', 'pending_contract',
        'reading', 'pending_contract',
        'listening', 'pending_contract'
      )
    ) as canonical_record
  from source
),
prepared as (
  select
    content_key,
    '高'::text as level,
    'active'::text as status,
    'login'::text as access_tier,
    'sentence-v1'::text as catalog_version,
    pg_catalog.md5(canonical_record::text) as record_hash,
    canonical_record,
    surfaces,
    readiness,
    array[th]::text[] as legacy_content_keys,
    th,
    zh,
    reading_th,
    wc,
    polite_f,
    words,
    rank
  from canonical
)
insert into public.game_sentences(
  content_key, level, status, access_tier, catalog_version, record_hash,
  canonical_record, surfaces, readiness, legacy_content_keys,
  th, zh, reading_th, wc, polite_f, words, rank
)
select
  content_key, level, status, access_tier, catalog_version, record_hash,
  canonical_record, surfaces, readiness, legacy_content_keys,
  th, zh, reading_th, wc, polite_f, words, rank
from prepared
order by rank;

insert into public.learning_items(
  item_type, status, difficulty, owner_user_id, content_source, content_key, payload
)
select 'sentence', 'active', '高', null, 'game_sentences', sentence.th, null
from public.game_sentences sentence
where sentence.rank between 31 and 42
on conflict do nothing;

insert into public.learning_item_audit(item_id, action, actor, detail)
select
  item.item_id,
  'created',
  'migration:20260922103701_add_lg001_lg012_advanced_sentences.sql',
  pg_catalog.jsonb_build_object(
    'content_source', item.content_source,
    'content_key', item.content_key,
    'review_set', 'LG001-LG012'
  )
from public.learning_items item
where item.owner_user_id is null
  and item.content_source = 'game_sentences'
  and item.content_key in (
    select sentence.th
    from public.game_sentences sentence
    where sentence.rank between 31 and 42
  )
  and not exists (
    select 1
    from public.learning_item_audit audit
    where audit.item_id = item.item_id
      and audit.action = 'created'
  );

do $postcheck$
begin
  if (select pg_catalog.count(*) from public.game_sentences) <> 42 then
    raise exception 'LG_ADVANCED_TOTAL_COUNT_FAILED';
  end if;

  if (
    select pg_catalog.count(*)
    from public.game_sentences sentence
    where sentence.rank between 31 and 42
      and sentence.level = '高'
      and sentence.status = 'active'
      and sentence.access_tier = 'login'
      and sentence.catalog_version = 'sentence-v1'
      and sentence.canonical_record->>'contentKey' = sentence.content_key
      and sentence.canonical_record->>'sentenceTH' = sentence.th
      and sentence.canonical_record->>'zhTW' = sentence.zh
      and sentence.canonical_record->>'readingTH' = sentence.reading_th
      and sentence.record_hash = pg_catalog.md5(sentence.canonical_record::text)
      and public.resolve_game_sentence_content_key(sentence.th) = sentence.content_key
  ) <> 12 then
    raise exception 'LG_ADVANCED_CANONICAL_POSTCHECK_FAILED';
  end if;

  if (
    select pg_catalog.count(*)
    from public.learning_items item
    where item.owner_user_id is null
      and item.item_type = 'sentence'
      and item.status = 'active'
      and item.difficulty = '高'
      and item.content_source = 'game_sentences'
      and item.content_key in (
        select sentence.th
        from public.game_sentences sentence
        where sentence.rank between 31 and 42
      )
  ) <> 12 then
    raise exception 'LG_ADVANCED_LEARNING_ITEMS_POSTCHECK_FAILED';
  end if;

  if has_table_privilege('anon', 'public.game_sentences', 'select')
     or has_table_privilege('authenticated', 'public.game_sentences', 'select') then
    raise exception 'LG_ADVANCED_BROWSER_ACCESS_LEAK';
  end if;
end
$postcheck$;

notify pgrst, 'reload schema';
commit;

-- Recovery: before any learner evidence references these rows, this migration may be rolled back
-- only with a separately reviewed migration. After learner use begins, preserve the rows and IDs;
-- recover by restoring the prior Edge Function caps while retaining historical data.
