-- SOURCE ONLY: normalize the four Lin-approved Roman spellings in the central sentence library.
-- Applying this migration to Production is HIGH risk and requires Lin's exact approval.
-- No sentence text, Thai reading, translation, structure, readiness, entitlement, or user data is changed.

begin;

lock table public.game_sentences in share row exclusive mode;

do $precheck$
begin
  if (select count(*) from public.game_sentences) <> 30 then
    raise exception 'CENTRAL_SENTENCE_ROMAN_BOUNDARY_CHANGED';
  end if;

  if exists (
    select 1
    from public.game_sentences s
    where s.canonical_record->'words' is distinct from s.words
       or pg_catalog.jsonb_array_length(s.canonical_record->'wordOccurrences')
          is distinct from pg_catalog.jsonb_array_length(s.words)
  ) then
    raise exception 'CENTRAL_SENTENCE_ROMAN_CANONICAL_PRECONDITION_FAILED';
  end if;

  if (select count(*)
      from public.game_sentences s
      cross join lateral pg_catalog.jsonb_array_elements(s.words) as word(value)
      cross join lateral pg_catalog.jsonb_array_elements(word.value->'syls') as syllable(value)
      where syllable.value->>'th'='ผม' and syllable.value->>'en'='phǎm') <> 6
     or (select count(*)
         from public.game_sentences s
         cross join lateral pg_catalog.jsonb_array_elements(s.words) as word(value)
         cross join lateral pg_catalog.jsonb_array_elements(word.value->'syls') as syllable(value)
         where syllable.value->>'th'='ผม' and syllable.value->>'en'='phǒm') <> 2
     or (select count(*)
         from public.game_sentences s
         cross join lateral pg_catalog.jsonb_array_elements(s.words) as word(value)
         cross join lateral pg_catalog.jsonb_array_elements(word.value->'syls') as syllable(value)
         where syllable.value->>'th'='ทำ' and syllable.value->>'en'='tam') <> 1
     or (select count(*)
         from public.game_sentences s
         cross join lateral pg_catalog.jsonb_array_elements(s.words) as word(value)
         cross join lateral pg_catalog.jsonb_array_elements(word.value->'syls') as syllable(value)
         where syllable.value->>'th'='ทำ' and syllable.value->>'en'='tham') <> 2
     or (select count(*)
         from public.game_sentences s
         cross join lateral pg_catalog.jsonb_array_elements(s.words) as word(value)
         cross join lateral pg_catalog.jsonb_array_elements(word.value->'syls') as syllable(value)
         where syllable.value->>'th'='ชอบ' and syllable.value->>'en'='châop') <> 1
     or (select count(*)
         from public.game_sentences s
         cross join lateral pg_catalog.jsonb_array_elements(s.words) as word(value)
         cross join lateral pg_catalog.jsonb_array_elements(word.value->'syls') as syllable(value)
         where syllable.value->>'th'='ชอบ' and syllable.value->>'en'='chôp') <> 1
     or (select count(*)
         from public.game_sentences s
         cross join lateral pg_catalog.jsonb_array_elements(s.words) as word(value)
         cross join lateral pg_catalog.jsonb_array_elements(word.value->'syls') as syllable(value)
         where syllable.value->>'th'='ทุก' and syllable.value->>'en'='túk') <> 1
     or (select count(*)
         from public.game_sentences s
         cross join lateral pg_catalog.jsonb_array_elements(s.words) as word(value)
         cross join lateral pg_catalog.jsonb_array_elements(word.value->'syls') as syllable(value)
         where syllable.value->>'th'='ทุก' and syllable.value->>'en'='thúk') <> 1 then
    raise exception 'CENTRAL_SENTENCE_ROMAN_REVIEWED_SOURCE_MISMATCH';
  end if;

  if exists (
    select 1
    from public.game_sentences s
    cross join lateral pg_catalog.jsonb_array_elements(s.words) as word(value)
    cross join lateral pg_catalog.jsonb_array_elements(word.value->'syls') as syllable(value)
    where (syllable.value->>'th'='ผม' and syllable.value->>'en' not in ('phǎm','phǒm'))
       or (syllable.value->>'th'='ทำ' and syllable.value->>'en' not in ('tam','tham'))
       or (syllable.value->>'th'='ชอบ' and syllable.value->>'en' not in ('châop','chôp'))
       or (syllable.value->>'th'='ทุก' and syllable.value->>'en' not in ('túk','thúk'))
  ) then
    raise exception 'CENTRAL_SENTENCE_ROMAN_UNREVIEWED_VARIANT_FOUND';
  end if;
end
$precheck$;

create temporary table _central_sentence_roman_updated on commit drop as
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
              case syllable.value->>'th'
                when 'ผม' then pg_catalog.jsonb_set(syllable.value, '{en}', pg_catalog.to_jsonb('phǒm'::text), false)
                when 'ทำ' then pg_catalog.jsonb_set(syllable.value, '{en}', pg_catalog.to_jsonb('tham'::text), false)
                when 'ชอบ' then pg_catalog.jsonb_set(syllable.value, '{en}', pg_catalog.to_jsonb('chôp'::text), false)
                when 'ทุก' then pg_catalog.jsonb_set(syllable.value, '{en}', pg_catalog.to_jsonb('thúk'::text), false)
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
    ) as new_words
  from public.game_sentences s
), transformed_canonical as (
  select
    s.content_key,
    t.new_words,
    pg_catalog.jsonb_set(
      pg_catalog.jsonb_set(s.canonical_record, '{words}', t.new_words, false),
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
                  t.new_words -> (occurrence.ordinality::integer - 1) -> 'syls'
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
                t.new_words -> (occurrence.ordinality::integer - 1) -> 'syls'
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
    ) as new_canonical_record
  from public.game_sentences s
  join transformed_words t using (content_key)
), updated as (
  update public.game_sentences s
  set words=t.new_words,
      canonical_record=t.new_canonical_record,
      record_hash=pg_catalog.md5(t.new_canonical_record::text),
      updated_at=pg_catalog.now()
  from transformed_canonical t
  where s.content_key=t.content_key
    and s.words is distinct from t.new_words
  returning s.content_key
)
select content_key from updated;

do $affected_check$
begin
  if (select count(*) from _central_sentence_roman_updated) <> 8 then
    raise exception 'CENTRAL_SENTENCE_ROMAN_AFFECTED_COUNT_MISMATCH';
  end if;
end
$affected_check$;

do $postcheck$
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
         where syllable.value->>'th'='ทุก' and syllable.value->>'en'='thúk') <> 2
     or exists (
       select 1
       from public.game_sentences s
       cross join lateral pg_catalog.jsonb_array_elements(s.words) as word(value)
       cross join lateral pg_catalog.jsonb_array_elements(word.value->'syls') as syllable(value)
       where (syllable.value->>'th'='ผม' and syllable.value->>'en'<>'phǒm')
          or (syllable.value->>'th'='ทำ' and syllable.value->>'en'<>'tham')
          or (syllable.value->>'th'='ชอบ' and syllable.value->>'en'<>'chôp')
          or (syllable.value->>'th'='ทุก' and syllable.value->>'en'<>'thúk')
     ) then
    raise exception 'CENTRAL_SENTENCE_ROMAN_POSTCHECK_FAILED';
  end if;

  if exists (
    select 1
    from public.game_sentences s
    where s.canonical_record->'words' is distinct from s.words
       or s.record_hash is distinct from pg_catalog.md5(s.canonical_record::text)
  ) or exists (
    select 1
    from public.game_sentences s
    cross join lateral pg_catalog.jsonb_array_elements(s.canonical_record->'wordOccurrences')
      with ordinality as occurrence(value, ordinality)
    cross join lateral pg_catalog.jsonb_array_elements(occurrence.value->'syllables')
      with ordinality as stored_syllable(value, syllable_ordinality)
    join lateral pg_catalog.jsonb_array_elements(
      s.words -> (occurrence.ordinality::integer - 1) -> 'syls'
    ) with ordinality as source_syllable(value, syllable_ordinality)
      on source_syllable.syllable_ordinality=stored_syllable.syllable_ordinality
    where stored_syllable.value->>'roman' is distinct from source_syllable.value->>'en'
       or occurrence.value->'spellingSyllables'->(stored_syllable.syllable_ordinality::integer - 1)->>'en'
          is distinct from source_syllable.value->>'en'
  ) then
    raise exception 'CENTRAL_SENTENCE_ROMAN_CANONICAL_SYNC_FAILED';
  end if;
end
$postcheck$;

notify pgrst, 'reload schema';
commit;
