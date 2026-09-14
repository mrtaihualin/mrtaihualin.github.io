-- Source-only candidate: apply Lin's exact correction for the queued Paid record หมื่น.
-- This file does not authorize or perform a Production mutation by being committed.

begin;

lock table public.game_words in share row exclusive mode;

do $correct_muen_vowel$
declare
  affected integer;
begin
  if (select count(*) from public.game_words where status='active') <> 200
     or (select count(*) from public.game_words where status='queued' and access_tier='paid') <> 189 then
    raise exception 'Current 389 vocabulary boundary changed; หมื่น correction stopped';
  end if;

  if (select count(*) from public.game_words
      where content_key='หมื่น@初#numeral'
        and status='queued'
        and access_tier='paid'
        and catalog_version='paid-queue-189-v1'
        and record_hash='4a4771833b1c3c8b7584e59b72e5b9f4a0548cce8f2de6b50d48787c2d19c441'
        and syls #>> '{0,vowel}'='อือ'
        and canonical_record #>> '{syllables,0,vowel}'='อือ') <> 1 then
    raise exception 'Exact queued หมื่น source does not match the reviewed precondition';
  end if;

  update public.game_words
  set syls=jsonb_set(syls,'{0,vowel}',to_jsonb('อื'::text),false),
      canonical_record=jsonb_set(canonical_record,'{syllables,0,vowel}',to_jsonb('อื'::text),false),
      record_hash='dba54c6b1fc876b5dd94a13d28484fcff6ffb102e06e828d4472227ce1e34164',
      updated_at=now()
  where content_key='หมื่น@初#numeral'
    and status='queued'
    and access_tier='paid'
    and catalog_version='paid-queue-189-v1'
    and record_hash='4a4771833b1c3c8b7584e59b72e5b9f4a0548cce8f2de6b50d48787c2d19c441';

  get diagnostics affected = row_count;
  if affected <> 1 then
    raise exception 'Expected exactly one queued หมื่น correction, got %', affected;
  end if;
end
$correct_muen_vowel$;

do $verify_muen_vowel$
begin
  if (select count(*) from public.game_words where status='active') <> 200
     or (select count(*) from public.game_words where status='queued' and access_tier='paid') <> 189
     or (select count(*) from public.game_words
         where content_key='หมื่น@初#numeral'
           and status='queued'
           and access_tier='paid'
           and catalog_version='paid-queue-189-v1'
           and record_hash='dba54c6b1fc876b5dd94a13d28484fcff6ffb102e06e828d4472227ce1e34164'
           and syls #>> '{0,vowel}'='อื'
           and canonical_record #>> '{syllables,0,vowel}'='อื') <> 1
     or exists(select 1 from public.game_words
       where status in ('active','queued')
         and jsonb_path_exists(canonical_record,'$.syllables[*] ? (@.vowel == "อือ")')) then
    raise exception 'Current 389 postcheck failed after หมื่น correction';
  end if;
end
$verify_muen_vowel$;

commit;
