-- Emergency rollback for the inactive Paid queue classification.
-- It preserves every row and leaves the Free 200 untouched.

begin;

lock table public.game_words in share row exclusive mode;

update public.game_words
set status='history', access_tier=null, catalog_version='legacy-pre-free-200', updated_at=now()
where status='queued' and access_tier='paid' and catalog_version='paid-queue-189-v1';

do $check$
begin
  if exists(select 1 from public.game_words where status='queued' and access_tier='paid' and catalog_version='paid-queue-189-v1')
     or (select count(*) from public.game_words where status='active') <> 200 then
    raise exception 'Paid queue rollback verification failed';
  end if;
end
$check$;

commit;
