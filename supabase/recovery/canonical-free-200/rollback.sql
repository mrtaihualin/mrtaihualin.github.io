-- Emergency rollback only: restore the exact pre-cutover game_words payload preserved in history_record.
-- Requires separate Lin authorization.
begin;
lock table public.game_words in share row exclusive mode;
do $learning_rollback_precheck$
begin
  if exists(
    select 1
    from public.learning_item_key_history h
    join public.learning_items li on li.item_id=h.item_id and li.content_key=h.new_content_key
    join public.learning_items collision on collision.content_source=li.content_source
      and collision.owner_user_id is not distinct from li.owner_user_id
      and collision.content_key=h.old_content_key and collision.item_id<>li.item_id
    where h.note='Lin-approved canonical Free 200 key; item identity preserved'
  ) then
    raise exception 'learning identity rollback collision requires manual reconciliation';
  end if;
end
$learning_rollback_precheck$;
update public.learning_items li
set content_key=h.old_content_key,updated_at=now()
from public.learning_item_key_history h
where h.item_id=li.item_id and li.content_key=h.new_content_key
  and h.note='Lin-approved canonical Free 200 key; item identity preserved';
update public.game_words set
  word=history_record->>'word',en=history_record->>'en',zh=history_record->>'zh',level=history_record->>'level',
  category=history_record->>'category',syls=history_record->'syls',reading_th=history_record->>'reading_th',
  read_syls=history_record->'read_syls',rank=history_rank,content_key=(history_record->>'word')||'@'||(history_record->>'level'),
  status='active',access_tier=null,catalog_version='legacy-pre-free-200',canonical_record=null,record_hash=null,updated_at=now()
where history_record is not null;
notify pgrst,'reload schema';
commit;
