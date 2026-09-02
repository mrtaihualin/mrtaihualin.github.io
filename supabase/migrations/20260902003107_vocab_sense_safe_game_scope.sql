-- Sense-safe vocabulary identity + per-game release scope.
-- Source preparation only: applying this migration to Production remains a separate HIGH-risk gate.

alter table public.game_words
  add column if not exists content_key text,
  add column if not exists spelling_th text,
  add column if not exists audio_status text,
  add column if not exists tone_special smallint,
  add column if not exists tone_override smallint,
  add column if not exists tone_derivation smallint,
  add column if not exists surfaces text[],
  add column if not exists review_priority boolean,
  add column if not exists status text;

update public.game_words
set content_key = word || '@' || level
where content_key is null;

update public.game_words
set surfaces = array['legacy','tone','reading','typing','word_order','listening']::text[]
where surfaces is null;

update public.game_words set review_priority = false where review_priority is null;
update public.game_words set status = 'active' where status is null;

alter table public.game_words
  alter column content_key set not null,
  alter column surfaces set default array['legacy','tone','reading','typing','word_order','listening']::text[],
  alter column surfaces set not null,
  alter column review_priority set default false,
  alter column review_priority set not null,
  alter column status set default 'active',
  alter column status set not null;

drop index if exists public.uq_game_words_word_level;
create unique index if not exists uq_game_words_content_key
  on public.game_words(content_key);
create index if not exists idx_game_words_surface_level_priority_rank
  on public.game_words(level, review_priority desc, rank)
  where status = 'active';
create index if not exists idx_game_words_surfaces_gin
  on public.game_words using gin(surfaces);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.game_words'::regclass
      and conname = 'game_words_status_check'
  ) then
    alter table public.game_words
      add constraint game_words_status_check check (status in ('active','legacy'));
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.game_words'::regclass
      and conname = 'game_words_surfaces_check'
  ) then
    alter table public.game_words
      add constraint game_words_surfaces_check
      check (surfaces <@ array['legacy','tone','reading','typing','word_order','listening']::text[]);
  end if;
end $$;

-- Lin's decision: the former combined ร้อง=唱/哭 identity remains preserved as legacy,
-- while ร้อง=唱 and ร้อง=尖叫 start as two new identities.
update public.game_words
set status = 'legacy', surfaces = array[]::text[], updated_at = now()
where content_key = 'ร้อง@初';

-- ร้องไห้ is the same semantic item with a corrected level, so preserve its identity/history.
update public.game_words old_row
set content_key = 'ร้องไห้@中', level = '中', updated_at = now()
where old_row.content_key = 'ร้องไห้@初'
  and not exists (
    select 1 from public.game_words current_row
    where current_row.content_key = 'ร้องไห้@中'
  );

do $$
declare
  v_item uuid;
begin
  if to_regclass('public.learning_items') is null then
    return;
  end if;

  update public.learning_items
  set status = 'flagged', updated_at = now()
  where content_source = 'game_words'
    and content_key = 'ร้อง@初'
  returning item_id into v_item;

  if v_item is not null and to_regclass('public.learning_item_audit') is not null then
    insert into public.learning_item_audit (item_id, action, actor, detail)
    select v_item, 'status_changed', 'migration:vocab_sense_safe_game_scope',
      jsonb_build_object('from', 'active', 'to', 'flagged', 'reason', 'legacy combined meaning preserved; new senses start clean')
    where not exists (
      select 1 from public.learning_item_audit
      where item_id = v_item
        and actor = 'migration:vocab_sense_safe_game_scope'
        and action = 'status_changed'
    );
  end if;

  select item_id into v_item
  from public.learning_items
  where content_source = 'game_words' and content_key = 'ร้องไห้@初';

  if v_item is not null
     and not exists (
       select 1 from public.learning_items
       where content_source = 'game_words' and content_key = 'ร้องไห้@中'
     ) then
    if to_regclass('public.learning_item_key_history') is not null then
      insert into public.learning_item_key_history (item_id, old_content_key, new_content_key, note)
      select v_item, 'ร้องไห้@初', 'ร้องไห้@中', 'Lin-approved level correction; semantic identity preserved'
      where not exists (
        select 1 from public.learning_item_key_history
        where item_id = v_item and old_content_key = 'ร้องไห้@初' and new_content_key = 'ร้องไห้@中'
      );
    end if;

    update public.learning_items
    set content_key = 'ร้องไห้@中', difficulty = '中', updated_at = now()
    where item_id = v_item;

    if to_regclass('public.learning_item_audit') is not null then
      insert into public.learning_item_audit (item_id, action, actor, detail)
      select v_item, 'key_changed', 'migration:vocab_sense_safe_game_scope',
        jsonb_build_object('from', 'ร้องไห้@初', 'to', 'ร้องไห้@中', 'reason', 'Lin-approved level correction')
      where not exists (
        select 1 from public.learning_item_audit
        where item_id = v_item
          and actor = 'migration:vocab_sense_safe_game_scope'
          and action = 'key_changed'
      );
    end if;
  end if;
end $$;

-- Keep the protected-table boundary unchanged after adding columns.
alter table public.game_words enable row level security;
revoke all on table public.game_words from anon, authenticated;
