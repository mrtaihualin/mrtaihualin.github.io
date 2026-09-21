-- Emergency rollback for 20260921155846_normalize_central_sentence_roman_v1.sql.
-- This restores only the nine prior Roman values in eight exact sentences.
-- Applying this rollback to Production is HIGH risk and requires Lin's exact approval.

begin;

lock table public.game_sentences in share row exclusive mode;

do $precheck$
begin
  if (select count(*) from public.game_sentences) <> 30
     or (select count(*)
         from public.game_sentences s
         cross join lateral pg_catalog.jsonb_array_elements(s.words) as word(value)
         cross join lateral pg_catalog.jsonb_array_elements(word.value->'syls') as syllable(value)
         where syllable.value->>'th'='ผม' and syllable.value->>'en'='phǒm') <> 8
     or (select count(*)
         from public.game_sentences s
         cross join lateral pg_catalog.jsonb_array_elements(s.words) as word(value)
         cross join lateral pg_catalog.jsonb_array_elements(word.value->'syls') as syllable(value)
         where syllable.value->>'th'='ทำ' and syllable.value->>'en'='tham') <> 3
     or (select count(*)
         from public.game_sentences s
         cross join lateral pg_catalog.jsonb_array_elements(s.words) as word(value)
         cross join lateral pg_catalog.jsonb_array_elements(word.value->'syls') as syllable(value)
         where syllable.value->>'th'='ชอบ' and syllable.value->>'en'='chôp') <> 2
     or (select count(*)
         from public.game_sentences s
         cross join lateral pg_catalog.jsonb_array_elements(s.words) as word(value)
         cross join lateral pg_catalog.jsonb_array_elements(word.value->'syls') as syllable(value)
         where syllable.value->>'th'='ทุก' and syllable.value->>'en'='thúk') <> 2 then
    raise exception 'CENTRAL_SENTENCE_ROMAN_ROLLBACK_PRECONDITION_FAILED';
  end if;
end
$precheck$;

create temporary table _central_sentence_roman_rollback_updated on commit drop as
with transformed_words as (
  select
    s.content_key,
    (
      select pg_catalog.jsonb_agg(
        pg_catalog.jsonb_set(
          word.value,
          '{syls}',
          (
            select pg_catalog.jsonb_agg(
              case
                when syllable.value->>'th'='ผม' and s.th=any(array[
                  'ผมกินข้าวอยู่ที่บ้าน',
                  'ผมอยากเรียนภาษาไทย',
                  'ผมไม่รู้จะทำยังไง',
                  'ผมไม่ชอบกินผัก',
                  'ผมอยากพักผ่อน',
                  'ผมเอาข้าวผัดกุ้ง'
                ]::text[])
                  then pg_catalog.jsonb_set(syllable.value, '{en}', pg_catalog.to_jsonb('phǎm'::text), false)
                when syllable.value->>'th'='ทำ' and s.th='วันนี้ผมทำงานที่บ้าน'
                  then pg_catalog.jsonb_set(syllable.value, '{en}', pg_catalog.to_jsonb('tam'::text), false)
                when syllable.value->>'th'='ชอบ' and s.th='ผมไม่ชอบกินผัก'
                  then pg_catalog.jsonb_set(syllable.value, '{en}', pg_catalog.to_jsonb('châop'::text), false)
                when syllable.value->>'th'='ทุก' and s.th='เราดื่มกาแฟทุกเช้า'
                  then pg_catalog.jsonb_set(syllable.value, '{en}', pg_catalog.to_jsonb('túk'::text), false)
                else syllable.value
              end
              order by syllable.ordinality
            )
            from pg_catalog.jsonb_array_elements(word.value->'syls')
              with ordinality as syllable(value, ordinality)
          ),
          false
        )
        order by word.ordinality
      )
      from pg_catalog.jsonb_array_elements(s.words) with ordinality as word(value, ordinality)
    ) as old_words
  from public.game_sentences s
), transformed_canonical as (
  select
    s.content_key,
    t.old_words,
    pg_catalog.jsonb_set(
      pg_catalog.jsonb_set(s.canonical_record, '{words}', t.old_words, false),
      '{wordOccurrences}',
      (
        select pg_catalog.jsonb_agg(
          pg_catalog.jsonb_set(
            pg_catalog.jsonb_set(
              occurrence.value,
              '{syllables}',
              (
                select pg_catalog.jsonb_agg(
                  pg_catalog.jsonb_set(
                    stored_syllable.value,
                    '{roman}',
                    pg_catalog.to_jsonb(source_syllable.value->>'en'),
                    false
                  )
                  order by stored_syllable.ordinality
                )
                from pg_catalog.jsonb_array_elements(occurrence.value->'syllables')
                  with ordinality as stored_syllable(value, ordinality)
                join pg_catalog.jsonb_array_elements(
                  t.old_words -> (occurrence.ordinality::integer - 1) -> 'syls'
                ) with ordinality as source_syllable(value, ordinality)
                  on source_syllable.ordinality=stored_syllable.ordinality
              ),
              false
            ),
            '{spellingSyllables}',
            (
              select pg_catalog.jsonb_agg(
                pg_catalog.jsonb_set(
                  stored_syllable.value,
                  '{en}',
                  pg_catalog.to_jsonb(source_syllable.value->>'en'),
                  false
                )
                order by stored_syllable.ordinality
              )
              from pg_catalog.jsonb_array_elements(occurrence.value->'spellingSyllables')
                with ordinality as stored_syllable(value, ordinality)
              join pg_catalog.jsonb_array_elements(
                t.old_words -> (occurrence.ordinality::integer - 1) -> 'syls'
              ) with ordinality as source_syllable(value, ordinality)
                on source_syllable.ordinality=stored_syllable.ordinality
            ),
            false
          )
          order by occurrence.ordinality
        )
        from pg_catalog.jsonb_array_elements(s.canonical_record->'wordOccurrences')
          with ordinality as occurrence(value, ordinality)
      ),
      false
    ) as old_canonical_record
  from public.game_sentences s
  join transformed_words t using (content_key)
), updated as (
  update public.game_sentences s
  set words=t.old_words,
      canonical_record=t.old_canonical_record,
      record_hash=pg_catalog.md5(t.old_canonical_record::text),
      updated_at=pg_catalog.now()
  from transformed_canonical t
  where s.content_key=t.content_key
    and s.words is distinct from t.old_words
  returning s.content_key
)
select content_key from updated;

do $postcheck$
begin
  if (select count(*) from _central_sentence_roman_rollback_updated) <> 8
     or (select count(*)
         from public.game_sentences s
         cross join lateral pg_catalog.jsonb_array_elements(s.words) as word(value)
         cross join lateral pg_catalog.jsonb_array_elements(word.value->'syls') as syllable(value)
         where syllable.value->>'th'='ผม' and syllable.value->>'en'='phǎm') <> 6
     or (select count(*)
         from public.game_sentences s
         cross join lateral pg_catalog.jsonb_array_elements(s.words) as word(value)
         cross join lateral pg_catalog.jsonb_array_elements(word.value->'syls') as syllable(value)
         where syllable.value->>'th'='ทำ' and syllable.value->>'en'='tam') <> 1
     or (select count(*)
         from public.game_sentences s
         cross join lateral pg_catalog.jsonb_array_elements(s.words) as word(value)
         cross join lateral pg_catalog.jsonb_array_elements(word.value->'syls') as syllable(value)
         where syllable.value->>'th'='ชอบ' and syllable.value->>'en'='châop') <> 1
     or (select count(*)
         from public.game_sentences s
         cross join lateral pg_catalog.jsonb_array_elements(s.words) as word(value)
         cross join lateral pg_catalog.jsonb_array_elements(word.value->'syls') as syllable(value)
         where syllable.value->>'th'='ทุก' and syllable.value->>'en'='túk') <> 1
     or exists (
       select 1 from public.game_sentences s
       where s.canonical_record->'words' is distinct from s.words
          or s.record_hash is distinct from pg_catalog.md5(s.canonical_record::text)
     ) then
    raise exception 'CENTRAL_SENTENCE_ROMAN_ROLLBACK_POSTCHECK_FAILED';
  end if;
end
$postcheck$;

notify pgrst, 'reload schema';
commit;
