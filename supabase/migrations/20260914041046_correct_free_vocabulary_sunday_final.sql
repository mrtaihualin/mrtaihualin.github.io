-- Source-only candidate: apply Lin's exact วันอาทิตย์ final-reading correction ต > ด.
-- Committing this file does not authorize applying it to Production.

begin;

lock table public.game_words in share row exclusive mode;

do $correct_sunday_final$
declare
  affected integer;
begin
  if (select count(*) from public.game_words where status='active') <> 200
     or (select count(*) from public.game_words where status='active' and access_tier='guest') <> 100
     or (select count(*) from public.game_words where status='active' and access_tier='login') <> 100
     or (select md5(string_agg(record_hash, E'\n' order by content_key collate "C"))
         from public.game_words where status='active') <> '4be1d6442da1c2980b1e084aafc45394' then
    raise exception 'Current Free 200 boundary changed; วันอาทิตย์ correction stopped';
  end if;

  if (select count(*) from public.game_words
      where content_key='วันอาทิตย์@中#weekday'
        and status='active'
        and catalog_version='free-200-v1'
        and record_hash='ae05e924dbf8fde1798f0cd52e2871b3eec81b20da838bb9f381ac5d97b37a08'
        and syls #>> '{2,final}'='ต'
        and not (syls -> 2 ? 'finalRead')
        and canonical_record #>> '{syllables,2,writtenFinal}'='ต'
        and canonical_record #>> '{syllables,2,finalReadDifference}'='ไม่มี') <> 1 then
    raise exception 'Exact active วันอาทิตย์ source does not match the reviewed precondition';
  end if;

  update public.game_words
  set syls=jsonb_set(syls,'{2,finalRead}',to_jsonb('ด'::text),true),
      canonical_record=jsonb_set(canonical_record,'{syllables,2,finalReadDifference}',to_jsonb('ต > ด'::text),false),
      record_hash='ba2693e24ef82122865f5ea91644fd409a42079e087bc74054cebd08de103af5',
      updated_at=now()
  where content_key='วันอาทิตย์@中#weekday'
    and status='active'
    and catalog_version='free-200-v1'
    and record_hash='ae05e924dbf8fde1798f0cd52e2871b3eec81b20da838bb9f381ac5d97b37a08';

  get diagnostics affected = row_count;
  if affected <> 1 then
    raise exception 'Expected exactly one active วันอาทิตย์ correction, got %', affected;
  end if;
end
$correct_sunday_final$;

do $verify_sunday_final$
begin
  if (select count(*) from public.game_words where status='active') <> 200
     or (select count(*) from public.game_words where status='active' and access_tier='guest') <> 100
     or (select count(*) from public.game_words where status='active' and access_tier='login') <> 100
     or (select count(*) from public.game_words
         where content_key='วันอาทิตย์@中#weekday'
           and status='active'
           and catalog_version='free-200-v1'
           and record_hash='ba2693e24ef82122865f5ea91644fd409a42079e087bc74054cebd08de103af5'
           and syls #>> '{2,final}'='ต'
           and syls #>> '{2,finalRead}'='ด'
           and canonical_record #>> '{syllables,2,writtenFinal}'='ต'
           and canonical_record #>> '{syllables,2,finalReadDifference}'='ต > ด') <> 1
     or (select md5(string_agg(record_hash, E'\n' order by content_key collate "C"))
         from public.game_words where status='active') <> 'a4f1e08f18ca5ff86a358945452d1486' then
    raise exception 'Current Free 200 postcheck failed after วันอาทิตย์ correction';
  end if;
end
$verify_sunday_final$;

commit;
