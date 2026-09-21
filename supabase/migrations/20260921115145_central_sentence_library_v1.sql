-- Central sentence library v1.
-- SOURCE ONLY: applying this migration to Production is HIGH risk and requires Lin's exact approval.
-- Additive cutover preparation only: no sentence, Learning Item, user save, score, or history row is deleted.
-- Existing games keep their current response contract until a separately verified compatibility cutover.

begin;

lock table public.game_sentences in share row exclusive mode;

do $precheck$
begin
  if pg_catalog.to_regclass('public.game_sentences') is null then
    raise exception 'CENTRAL_SENTENCE_LIBRARY_TABLE_MISSING';
  end if;
  if not exists (select 1 from public.game_sentences) then
    raise exception 'CENTRAL_SENTENCE_LIBRARY_EMPTY';
  end if;
  if exists (
    select 1 from public.game_sentences
    group by rank having count(*) <> 1
  ) then
    raise exception 'CENTRAL_SENTENCE_LIBRARY_RANK_NOT_UNIQUE';
  end if;
  if exists (
    select 1 from public.game_sentences
    where pg_catalog.btrim(th) = ''
       or pg_catalog.btrim(coalesce(zh, '')) = ''
       or pg_catalog.jsonb_typeof(words) is distinct from 'array'
       or pg_catalog.jsonb_array_length(words) = 0
       or pg_catalog.jsonb_array_length(words) > 16
  ) then
    raise exception 'CENTRAL_SENTENCE_LIBRARY_BASE_CONTENT_INVALID';
  end if;
  if exists (
    select 1
    from public.game_sentences s
    where (
      select pg_catalog.string_agg(part.value->>'th', '' order by part.ordinality)
      from pg_catalog.jsonb_array_elements(s.words) with ordinality as part(value, ordinality)
    ) is distinct from s.th
  ) then
    raise exception 'CENTRAL_SENTENCE_LIBRARY_WORD_SEQUENCE_MISMATCH';
  end if;
end
$precheck$;

-- Keep the established game_sentences table as the one physical sentence catalog.
-- The old columns remain compatibility projections while canonical_record becomes the future authority.
alter table public.game_sentences
  add column if not exists content_key text,
  add column if not exists level text,
  add column if not exists status text,
  add column if not exists access_tier text,
  add column if not exists catalog_version text,
  add column if not exists record_hash text,
  add column if not exists canonical_record jsonb,
  add column if not exists surfaces text[],
  add column if not exists readiness jsonb,
  add column if not exists legacy_content_keys text[];

update public.game_sentences
set content_key = coalesce(content_key, 'sentence-high-' || pg_catalog.lpad(rank::text, 3, '0')),
    level = coalesce(level, '高'),
    status = coalesce(status, 'active'),
    access_tier = coalesce(access_tier, case when rank <= 20 then 'guest' else 'login' end),
    catalog_version = coalesce(catalog_version, 'sentence-v1'),
    surfaces = coalesce(surfaces, array['word_order']::text[]),
    readiness = coalesce(readiness, pg_catalog.jsonb_build_object(
      'word_order', 'ready',
      'typing', 'incomplete',
      'tone', 'pending_contract',
      'reading', 'pending_contract',
      'listening', 'pending_contract'
    )),
    legacy_content_keys = case
      when legacy_content_keys is null then array[th]::text[]
      when th = any(legacy_content_keys) then legacy_content_keys
      else pg_catalog.array_append(legacy_content_keys, th)
    end;

do $identity_precheck$
begin
  if exists (
    select 1 from public.game_sentences
    group by content_key having count(*) <> 1
  ) then
    raise exception 'CENTRAL_SENTENCE_LIBRARY_CONTENT_KEY_COLLISION';
  end if;
end
$identity_precheck$;

-- Copy only exact stored content. No Thai-language value is inferred or corrected here.
update public.game_sentences s
set canonical_record = pg_catalog.jsonb_build_object(
      'schemaVersion', 'sentence-canonical-v1',
      'contentKey', s.content_key,
      'reviewSet', null,
      'level', '高',
      'status', s.status,
      'accessTier', s.access_tier,
      'catalogVersion', s.catalog_version,
      'surfaces', pg_catalog.to_jsonb(s.surfaces),
      'sentenceTH', s.th,
      'spellingTH', s.th,
      'zhTW', s.zh,
      'readingTH', s.reading_th,
      -- A whole-sentence Roman field is deliberately left incomplete until explicit reviewed content exists.
      'roman', null,
      'type', 'ประโยค',
      'category', null,
      'audioStatus', null,
      'approvalRefs', '[]'::jsonb,
      'syllableCount', s.wc,
      'wordCount', pg_catalog.jsonb_array_length(s.words),
      'politeF', s.polite_f,
      -- Typing-specific policy values stay null until Lin-reviewed content supplies them.
      'spacingPolicy', null,
      'punctuationPolicy', null,
      'politeEndingPolicy', null,
      'words', s.words,
      'wordOccurrences', (
        select pg_catalog.jsonb_agg(
          pg_catalog.jsonb_build_object(
            'occurrenceId', 'w' || pg_catalog.lpad(part.ordinality::text, 2, '0'),
            'position', part.ordinality,
            -- Do not infer a vocabulary identity from spelling alone. The occurrence ID is stable inside this sentence.
            'contentKey', null,
            'reviewSet', null,
            'word', part.value->>'th',
            'spellingTH', part.value->>'th',
            'readingTH', null,
            'roman', null,
            'zhTW', part.value->>'zh',
            'level', '高',
            'type', null,
            'category', null,
            'audioStatus', null,
            'approvalRefs', '[]'::jsonb,
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
        from pg_catalog.jsonb_array_elements(s.words) with ordinality as part(value, ordinality)
      ),
      'wordOrderAnswers', pg_catalog.jsonb_build_array((
        select pg_catalog.jsonb_agg(
          'w' || pg_catalog.lpad(part.ordinality::text, 2, '0') order by part.ordinality
        )
        from pg_catalog.jsonb_array_elements(s.words) with ordinality as part(value, ordinality)
      )),
      'gameReadiness', s.readiness
    )
where s.canonical_record is null;

update public.game_sentences
set record_hash = pg_catalog.md5(canonical_record::text)
where record_hash is null;

create unique index if not exists uq_game_sentences_content_key
  on public.game_sentences(content_key);
create index if not exists idx_game_sentences_active_tier_rank
  on public.game_sentences(access_tier, rank)
  where status = 'active';
create index if not exists idx_game_sentences_surfaces_gin
  on public.game_sentences using gin(surfaces);

do $constraints$
begin
  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conrelid = 'public.game_sentences'::regclass
      and conname = 'game_sentences_level_check'
  ) then
    alter table public.game_sentences
      add constraint game_sentences_level_check check (level = '高');
  end if;
  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conrelid = 'public.game_sentences'::regclass
      and conname = 'game_sentences_status_check'
  ) then
    alter table public.game_sentences
      add constraint game_sentences_status_check check (status in ('draft', 'active', 'history'));
  end if;
  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conrelid = 'public.game_sentences'::regclass
      and conname = 'game_sentences_access_tier_check'
  ) then
    alter table public.game_sentences
      add constraint game_sentences_access_tier_check check (access_tier in ('guest', 'login', 'paid'));
  end if;
  if not exists (
    select 1 from pg_catalog.pg_constraint
    where conrelid = 'public.game_sentences'::regclass
      and conname = 'game_sentences_surfaces_check'
  ) then
    alter table public.game_sentences
      add constraint game_sentences_surfaces_check check (
        surfaces <@ array['tone', 'reading', 'typing', 'word_order', 'listening']::text[]
      );
  end if;
end
$constraints$;

alter table public.game_sentences
  alter column content_key set not null,
  alter column level set default '高',
  alter column level set not null,
  alter column status set default 'draft',
  alter column status set not null,
  alter column access_tier set not null,
  alter column catalog_version set not null,
  alter column record_hash set not null,
  alter column canonical_record set not null,
  alter column surfaces set default array[]::text[],
  alter column surfaces set not null,
  alter column readiness set default '{}'::jsonb,
  alter column readiness set not null,
  alter column legacy_content_keys set default array[]::text[],
  alter column legacy_content_keys set not null;

-- Stable identity aliases bridge the old sentence-text key without changing any Learning Item yet.
create table if not exists public.game_sentence_key_aliases (
  alias_key text primary key,
  sentence_content_key text not null references public.game_sentences(content_key)
    on update restrict on delete restrict,
  alias_kind text not null default 'legacy_sentence_text'
    check (alias_kind in ('legacy_sentence_text', 'prior_sentence_text')),
  created_at timestamptz not null default now()
);

do $alias_precheck$
begin
  if exists (
    select aliases.alias_key
    from public.game_sentences s
    cross join lateral pg_catalog.unnest(s.legacy_content_keys) as aliases(alias_key)
    group by aliases.alias_key
    having count(distinct s.content_key) > 1
  ) then
    raise exception 'CENTRAL_SENTENCE_ALIAS_COLLISION';
  end if;
end
$alias_precheck$;

insert into public.game_sentence_key_aliases(alias_key, sentence_content_key, alias_kind)
select aliases.alias_key, s.content_key,
       case when aliases.alias_key = s.th then 'legacy_sentence_text' else 'prior_sentence_text' end
from public.game_sentences s
cross join lateral pg_catalog.unnest(s.legacy_content_keys) as aliases(alias_key)
on conflict (alias_key) do nothing;

create index if not exists idx_game_sentence_key_aliases_content_key
  on public.game_sentence_key_aliases(sentence_content_key);

create or replace function public.game_sentence_word_order_ready(
  p_th text,
  p_zh text,
  p_words jsonb
) returns boolean
language sql
immutable
security invoker
set search_path = ''
as $function$
  select
    pg_catalog.btrim(coalesce(p_th, '')) <> ''
    and pg_catalog.btrim(coalesce(p_zh, '')) <> ''
    and pg_catalog.jsonb_typeof(p_words) = 'array'
    and pg_catalog.jsonb_array_length(p_words) between 1 and 16
    and not exists (
      select 1
      from pg_catalog.jsonb_array_elements(p_words) as part(value)
      where pg_catalog.btrim(coalesce(part.value->>'th', '')) = ''
         or pg_catalog.btrim(coalesce(part.value->>'zh', '')) = ''
    )
    and (
      select pg_catalog.string_agg(part.value->>'th', '' order by part.ordinality)
      from pg_catalog.jsonb_array_elements(p_words) with ordinality as part(value, ordinality)
    ) = p_th;
$function$;

create or replace function public.validate_central_game_sentence()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $function$
begin
  if tg_op = 'UPDATE' and new.content_key is distinct from old.content_key then
    raise exception 'CENTRAL_SENTENCE_CONTENT_KEY_IMMUTABLE';
  end if;
  if new.level is distinct from '高' then
    raise exception 'CENTRAL_SENTENCE_LEVEL_MUST_BE_HIGH';
  end if;
  if pg_catalog.jsonb_typeof(new.canonical_record) is distinct from 'object'
     or new.canonical_record->>'contentKey' is distinct from new.content_key
     or new.canonical_record->>'level' is distinct from new.level
     or new.canonical_record->>'status' is distinct from new.status
     or new.canonical_record->>'accessTier' is distinct from new.access_tier
     or new.canonical_record->>'catalogVersion' is distinct from new.catalog_version
     or new.canonical_record->'surfaces' is distinct from pg_catalog.to_jsonb(new.surfaces)
     or new.canonical_record->>'sentenceTH' is distinct from new.th
     or new.canonical_record->>'spellingTH' is distinct from new.th
     or new.canonical_record->>'zhTW' is distinct from new.zh
     or new.canonical_record->>'readingTH' is distinct from new.reading_th
     or (new.canonical_record->>'syllableCount')::integer is distinct from new.wc
     or (new.canonical_record->>'wordCount')::integer is distinct from pg_catalog.jsonb_array_length(new.words)
     or new.canonical_record->'politeF' is distinct from coalesce(pg_catalog.to_jsonb(new.polite_f), 'null'::jsonb)
     or new.canonical_record->'words' is distinct from new.words
     or new.canonical_record->'gameReadiness' is distinct from new.readiness then
    raise exception 'CENTRAL_SENTENCE_CANONICAL_RECORD_MISMATCH';
  end if;
  if new.record_hash is distinct from pg_catalog.md5(new.canonical_record::text) then
    raise exception 'CENTRAL_SENTENCE_RECORD_HASH_MISMATCH';
  end if;
  if 'word_order' = any(new.surfaces) and (
    not public.game_sentence_word_order_ready(new.th, new.zh, new.words)
    or new.readiness->>'word_order' is distinct from 'ready'
    or pg_catalog.jsonb_typeof(new.canonical_record->'wordOrderAnswers') is distinct from 'array'
    or pg_catalog.jsonb_array_length(new.canonical_record->'wordOrderAnswers') = 0
  ) then
    raise exception 'CENTRAL_SENTENCE_WORD_ORDER_NOT_READY';
  end if;
  if new.surfaces && array['typing', 'tone', 'reading', 'listening']::text[] then
    raise exception 'CENTRAL_SENTENCE_SURFACE_CONTRACT_NOT_INSTALLED';
  end if;
  if tg_op = 'UPDATE' and new.th is distinct from old.th
     and not (old.th = any(new.legacy_content_keys)) then
    raise exception 'CENTRAL_SENTENCE_PRIOR_TEXT_ALIAS_REQUIRED';
  end if;
  return new;
end
$function$;

create or replace function public.sync_game_sentence_key_aliases()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_alias text;
  v_existing text;
begin
  foreach v_alias in array pg_catalog.array_append(new.legacy_content_keys, new.th)
  loop
    select a.sentence_content_key into v_existing
    from public.game_sentence_key_aliases a
    where a.alias_key = v_alias;
    if v_existing is not null and v_existing <> new.content_key then
      raise exception 'CENTRAL_SENTENCE_ALIAS_COLLISION';
    end if;
    insert into public.game_sentence_key_aliases(alias_key, sentence_content_key, alias_kind)
    values (
      v_alias,
      new.content_key,
      case when v_alias = new.th then 'legacy_sentence_text' else 'prior_sentence_text' end
    )
    on conflict (alias_key) do nothing;
  end loop;
  return new;
end
$function$;

create or replace function public.resolve_game_sentence_content_key(p_key text)
returns text
language sql
stable
security invoker
set search_path = ''
as $function$
  select coalesce(
    (select s.content_key from public.game_sentences s where s.content_key = p_key),
    (select a.sentence_content_key from public.game_sentence_key_aliases a where a.alias_key = p_key)
  );
$function$;

revoke all on function public.game_sentence_word_order_ready(text, text, jsonb)
  from public, anon, authenticated;
revoke all on function public.validate_central_game_sentence()
  from public, anon, authenticated;
revoke all on function public.sync_game_sentence_key_aliases()
  from public, anon, authenticated;
revoke all on function public.resolve_game_sentence_content_key(text)
  from public, anon, authenticated;
grant execute on function public.game_sentence_word_order_ready(text, text, jsonb) to service_role;
grant execute on function public.resolve_game_sentence_content_key(text) to service_role;

drop trigger if exists trg_validate_central_game_sentence on public.game_sentences;
create trigger trg_validate_central_game_sentence
before insert or update of content_key, level, status, access_tier, catalog_version, record_hash,
  canonical_record, surfaces, readiness, legacy_content_keys, th, zh, reading_th, wc, polite_f, words
on public.game_sentences
for each row execute function public.validate_central_game_sentence();

drop trigger if exists trg_sync_game_sentence_key_aliases on public.game_sentences;
create trigger trg_sync_game_sentence_key_aliases
after insert or update of th, legacy_content_keys
on public.game_sentences
for each row execute function public.sync_game_sentence_key_aliases();

-- Keep both catalog tables server-gated. Browser roles receive content only through the Edge gate.
alter table public.game_sentences enable row level security;
revoke all on table public.game_sentences from public, anon, authenticated;
grant select on table public.game_sentences to service_role;

alter table public.game_sentence_key_aliases enable row level security;
revoke all on table public.game_sentence_key_aliases from public, anon, authenticated;
grant select on table public.game_sentence_key_aliases to service_role;

do $postcheck$
begin
  if exists (
    select 1 from public.game_sentences
    where content_key is null
       or level <> '高'
       or status <> 'active'
       or catalog_version <> 'sentence-v1'
       or canonical_record->>'contentKey' is distinct from content_key
       or canonical_record->>'sentenceTH' is distinct from th
       or canonical_record->>'zhTW' is distinct from zh
       or canonical_record->>'readingTH' is distinct from reading_th
       or record_hash is distinct from pg_catalog.md5(canonical_record::text)
       or not ('word_order' = any(surfaces))
       or readiness->>'word_order' is distinct from 'ready'
       or readiness->>'typing' is distinct from 'incomplete'
       or not public.game_sentence_word_order_ready(th, zh, words)
  ) then
    raise exception 'CENTRAL_SENTENCE_LIBRARY_POSTCHECK_FAILED';
  end if;
  if (select count(*) from public.game_sentence_key_aliases)
     < (select count(*) from public.game_sentences) then
    raise exception 'CENTRAL_SENTENCE_LIBRARY_ALIAS_BACKFILL_FAILED';
  end if;
  if exists (
    select 1 from public.game_sentences s
    where public.resolve_game_sentence_content_key(s.th) is distinct from s.content_key
       or public.resolve_game_sentence_content_key(s.content_key) is distinct from s.content_key
  ) then
    raise exception 'CENTRAL_SENTENCE_LIBRARY_ALIAS_RESOLUTION_FAILED';
  end if;
  if exists (
    select 1
    from public.game_sentences s
    cross join lateral pg_catalog.unnest(s.legacy_content_keys) as aliases(alias_key)
    left join public.game_sentence_key_aliases a on a.alias_key = aliases.alias_key
    where a.sentence_content_key is distinct from s.content_key
  ) then
    raise exception 'CENTRAL_SENTENCE_LIBRARY_ALIAS_MAPPING_FAILED';
  end if;
  if has_table_privilege('anon', 'public.game_sentences', 'select')
     or has_table_privilege('authenticated', 'public.game_sentences', 'select')
     or has_table_privilege('anon', 'public.game_sentence_key_aliases', 'select')
     or has_table_privilege('authenticated', 'public.game_sentence_key_aliases', 'select') then
    raise exception 'CENTRAL_SENTENCE_LIBRARY_BROWSER_ACCESS_LEAK';
  end if;
  if not has_table_privilege('service_role', 'public.game_sentences', 'select')
     or not has_table_privilege('service_role', 'public.game_sentence_key_aliases', 'select') then
    raise exception 'CENTRAL_SENTENCE_LIBRARY_SERVICE_ROLE_ACCESS_MISSING';
  end if;
end
$postcheck$;

notify pgrst, 'reload schema';
commit;

-- Rollback is intentionally not automatic: the additive identity/alias columns preserve future history.
-- Before Production apply, capture schema/data counts and a database backup. If runtime rollout later fails,
-- keep these additive objects and restore only the prior Edge/static contract. Deleting identity is destructive.
