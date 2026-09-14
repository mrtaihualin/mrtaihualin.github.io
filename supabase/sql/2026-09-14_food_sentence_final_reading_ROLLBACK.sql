-- ROLLBACK SOURCE ONLY for migration 20260914073500_correct_food_sentence_final_reading.sql.
-- Running this file against Production requires a separate exact HIGH-risk approval.

begin;

lock table public.game_sentences in share row exclusive mode;

do $rollback_food_sentence_final$
declare
  affected integer;
begin
  if (select count(*) from public.game_sentences) <> 30
     or (select count(*) from public.game_sentences
         where th='อาหารจานนี้เผ็ดไหม'
           and reading_th='อา-หาร-จาน-นี้-เผ็ด-ไหม'
           and wc=6
           and polite_f='คะ'
           and words #>> '{0,th}'='อาหาร'
           and words #>> '{0,syls,1,th}'='หาร'
           and words #>> '{0,syls,1,final}'='ร'
           and words #>> '{0,syls,1,finalRead}'='น') <> 1 then
    raise exception 'Exact corrected sentence does not match rollback precondition';
  end if;

  update public.game_sentences
  set words=words #- '{0,syls,1,finalRead}',
      updated_at=now()
  where th='อาหารจานนี้เผ็ดไหม'
    and reading_th='อา-หาร-จาน-นี้-เผ็ด-ไหม'
    and wc=6
    and polite_f='คะ'
    and words #>> '{0,th}'='อาหาร'
    and words #>> '{0,syls,1,th}'='หาร'
    and words #>> '{0,syls,1,final}'='ร'
    and words #>> '{0,syls,1,finalRead}'='น';

  get diagnostics affected = row_count;
  if affected <> 1 then
    raise exception 'Expected exactly one sentence rollback, got %', affected;
  end if;

  if (select count(*) from public.game_sentences
      where th='อาหารจานนี้เผ็ดไหม'
        and words #>> '{0,syls,1,final}'='ร'
        and not ((words #> '{0,syls,1}') ? 'finalRead')) <> 1 then
    raise exception 'Sentence rollback postcheck failed';
  end if;
end
$rollback_food_sentence_final$;

commit;
