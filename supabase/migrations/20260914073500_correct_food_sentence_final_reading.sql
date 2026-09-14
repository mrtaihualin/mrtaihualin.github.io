-- SOURCE ONLY: sync Lin's approved หาร final-reading correction ร > น into game_sentences.
-- This file does not authorize or perform a Production mutation by being committed.

begin;

lock table public.game_sentences in share row exclusive mode;

do $correct_food_sentence_final$
declare
  affected integer;
begin
  if (select count(*) from public.game_sentences) <> 30 then
    raise exception 'Current 30-sentence boundary changed; อาหารจานนี้เผ็ดไหม correction stopped';
  end if;

  if (select count(*) from public.game_sentences
      where th='อาหารจานนี้เผ็ดไหม'
        and reading_th='อา-หาร-จาน-นี้-เผ็ด-ไหม'
        and wc=6
        and polite_f='คะ'
        and words #>> '{0,th}'='อาหาร'
        and words #>> '{0,syls,1,th}'='หาร'
        and words #>> '{0,syls,1,final}'='ร'
        and not ((words #> '{0,syls,1}') ? 'finalRead')) <> 1 then
    raise exception 'Exact อาหารจานนี้เผ็ดไหม source does not match the reviewed precondition';
  end if;

  update public.game_sentences
  set words=jsonb_set(words,'{0,syls,1,finalRead}',to_jsonb('น'::text),true),
      updated_at=now()
  where th='อาหารจานนี้เผ็ดไหม'
    and reading_th='อา-หาร-จาน-นี้-เผ็ด-ไหม'
    and wc=6
    and polite_f='คะ'
    and words #>> '{0,th}'='อาหาร'
    and words #>> '{0,syls,1,th}'='หาร'
    and words #>> '{0,syls,1,final}'='ร'
    and not ((words #> '{0,syls,1}') ? 'finalRead');

  get diagnostics affected = row_count;
  if affected <> 1 then
    raise exception 'Expected exactly one sentence correction, got %', affected;
  end if;
end
$correct_food_sentence_final$;

do $verify_food_sentence_final$
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
    raise exception 'Current 30-sentence postcheck failed after อาหารจานนี้เผ็ดไหม correction';
  end if;
end
$verify_food_sentence_final$;

commit;
