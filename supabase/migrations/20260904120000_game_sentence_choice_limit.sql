-- SOURCE ONLY — Production apply is HIGH risk and requires Lin's exact approval.
-- Every INSERT, and every UPDATE that changes a sentence or its words, must report and stop
-- when Word Order would receive more than 16 choices.

begin;

do $precheck$
declare
  v_violations integer;
  v_max_count integer;
begin
  if to_regclass('public.game_sentences') is null then
    raise exception 'GAME_SENTENCE_CHOICE_LIMIT_TABLE_MISSING';
  end if;

  select
    count(*) filter (
      where case
        when jsonb_typeof(words) = 'array' then jsonb_array_length(words) > 16
        else true
      end
    ),
    max(case when jsonb_typeof(words) = 'array' then jsonb_array_length(words) end)
  into v_violations, v_max_count
  from public.game_sentences;

  if v_violations <> 0 then
    raise exception using
      errcode = '23514',
      message = 'GAME_SENTENCE_CHOICE_LIMIT_EXISTING_VIOLATION',
      detail = format('พบ %s ประโยคที่ words ไม่ใช่รายการหรือมีเกิน 16 ตัวเลือก (จำนวนสูงสุดปัจจุบัน %s)', v_violations, coalesce(v_max_count, 0)),
      hint = 'แก้ข้อมูลเดิมและตรวจใหม่ก่อนติดตั้งด่าน';
  end if;
end
$precheck$;

create or replace function public.enforce_game_sentence_choice_limit()
returns trigger
language plpgsql
set search_path = ''
as $function$
declare
  v_choice_count integer;
begin
  if jsonb_typeof(new.words) is distinct from 'array' then
    raise exception using
      errcode = '23514',
      message = 'GAME_SENTENCE_WORDS_NOT_ARRAY',
      detail = format('ประโยค "%s" ต้องมี words เป็นรายการ', left(coalesce(new.th, '(ไม่มีข้อความ)'), 120)),
      hint = 'แก้ words ให้เป็นรายการก่อนใส่ประโยค';
  end if;

  v_choice_count := jsonb_array_length(new.words);
  if v_choice_count > 16 then
    raise exception using
      errcode = '23514',
      message = 'GAME_SENTENCE_CHOICE_LIMIT_EXCEEDED',
      detail = format('ประโยค "%s" มี %s ตัวเลือก; ระบบรองรับสูงสุด 16', left(coalesce(new.th, '(ไม่มีข้อความ)'), 120), v_choice_count),
      hint = 'ลด words เหลือไม่เกิน 16 ก่อนใส่ประโยค';
  end if;

  return new;
end
$function$;

revoke all on function public.enforce_game_sentence_choice_limit() from public, anon, authenticated;

drop trigger if exists trg_game_sentence_choice_limit on public.game_sentences;
create trigger trg_game_sentence_choice_limit
before insert or update of th, words on public.game_sentences
for each row execute function public.enforce_game_sentence_choice_limit();

do $postcheck$
declare
  v_trigger_count integer;
begin
  select count(*)
  into v_trigger_count
  from pg_trigger
  where tgrelid = 'public.game_sentences'::regclass
    and tgname = 'trg_game_sentence_choice_limit'
    and not tgisinternal
    and tgenabled = 'O';

  if v_trigger_count <> 1 then
    raise exception 'GAME_SENTENCE_CHOICE_LIMIT_POSTCHECK_FAILED: %', v_trigger_count;
  end if;
end
$postcheck$;

commit;

-- ROLLBACK (run separately only with exact authorization):
-- begin;
-- drop trigger if exists trg_game_sentence_choice_limit on public.game_sentences;
-- drop function if exists public.enforce_game_sentence_choice_limit();
-- commit;
