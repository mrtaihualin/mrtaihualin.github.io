-- Phase 1 SOURCE ONLY — atomic authoritative score + private history mirror commit.
-- Production execution is locked until Lin separately authorizes SQL + Edge deployment.

begin;

create or replace function public.phase1_score_submit_commit(
  p_submission_id uuid,
  p_user_id uuid,
  p_game text,
  p_difficulty text,
  p_score integer,
  p_total integer,
  p_evidence_hash text,
  p_mirror_items jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_existing public.game_score_submissions%rowtype;
  v_rows integer;
begin
  if p_submission_id is null or p_user_id is null or p_game is null or p_difficulty is null
     or p_score is null or p_total is null or p_evidence_hash is null or p_mirror_items is null
     or p_game not in ('tone', 'reading', 'listening', 'typing', 'word_order')
     or p_difficulty not in ('初', '中', '高', 'mixed')
     or p_score not between 0 and 5000
     or p_total not between 1 and 100
     or p_evidence_hash !~ '^[0-9a-f]{64}$'
     or jsonb_typeof(p_mirror_items) <> 'array' then
    raise exception 'invalid_score_submit_commit';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('phase1-score:' || p_submission_id::text, 0));

  select * into v_existing
  from public.game_score_submissions
  where submission_id = p_submission_id
  for update;

  if found then
    if v_existing.user_id is distinct from p_user_id
       or v_existing.game is distinct from p_game
       or v_existing.difficulty is distinct from p_difficulty
       or v_existing.score is distinct from p_score
       or v_existing.total is distinct from p_total
       or v_existing.evidence_hash is distinct from p_evidence_hash then
      return jsonb_build_object('ok', false, 'reason', 'replay_conflict');
    end if;

    -- Old s29-v1 rows with a null marker are ambiguous: the legacy insert may already exist.
    -- Never guess or create a possible duplicate; reconciliation is a separate controlled action.
    if v_existing.legacy_mirrored_at is null then
      return jsonb_build_object(
        'ok', false,
        'reason', case when v_existing.score_version = 's29-v2-atomic'
          then 'atomic_mirror_incomplete' else 'legacy_mirror_ambiguous' end
      );
    end if;

    return jsonb_build_object(
      'ok', true,
      'idempotent', true,
      'score', v_existing.score,
      'total', v_existing.total
    );
  end if;

  insert into public.game_score_submissions
    (submission_id, user_id, game, difficulty, score, total, evidence_hash,
     score_version, legacy_mirrored_at)
  values
    (p_submission_id, p_user_id, p_game, p_difficulty, p_score, p_total,
     p_evidence_hash, 's29-v2-atomic', null);

  if p_game = 'tone' then
    insert into public.tone_sessions (user_id, mode, score, total, wrong_words)
    values (p_user_id, p_difficulty, p_score, p_total, p_mirror_items);
  else
    insert into public.reading_sessions (user_id, score, games, game, wrong_items)
    values (p_user_id, p_score, 1, p_game, p_mirror_items);
  end if;

  update public.game_score_submissions
  set legacy_mirrored_at = now()
  where submission_id = p_submission_id and legacy_mirrored_at is null;
  get diagnostics v_rows = row_count;
  if v_rows <> 1 then raise exception 'score_mirror_marker_failed'; end if;

  return jsonb_build_object(
    'ok', true,
    'idempotent', false,
    'score', p_score,
    'total', p_total
  );
end;
$$;

revoke all on function public.phase1_score_submit_commit(
  uuid, uuid, text, text, integer, integer, text, jsonb
) from public, anon, authenticated;
grant execute on function public.phase1_score_submit_commit(
  uuid, uuid, text, text, integer, integer, text, jsonb
) to service_role;

commit;
