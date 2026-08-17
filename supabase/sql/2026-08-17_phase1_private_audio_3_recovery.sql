-- PRIVATE_AUDIO_3 RECOVERY — SOURCE ONLY / HIGH-RISK PRODUCTION ACTION.
-- Do not apply without Lin's exact Production authorization.
-- Scope is fixed at six existing public.audio_assets rows. This file never
-- changes the private bucket, RLS/policies, or storage metadata. After this
-- transaction passes, delete only the three replacement objects through:
--   node scripts/phase1-private-audio-3-recovery.js --apply-storage-delete --confirm=PRIVATE_AUDIO_3
-- Supabase requires object deletion through the Storage API, never raw SQL.

begin;

set local lock_timeout = '3s';
set local statement_timeout = '15s';

do $$
declare
  legacy_count integer;
  replacement_count integer;
begin
  perform 1
  from public.audio_assets
  where voice_id = 'th-TH-Chirp3-HD-Leda'
    and text_hash in (
      '133e3ff63a47df9060618d6d28be8e1760389910531041b23313016333fa3883',
      '86c510f76a50f1fc21b1bd4c2db9073c955d0decff0055c6d673b7cae89d6cba',
      '814f261e277d95b2029ac97f69e64d820c4a2ca1bff9bfc3c08bcc1f168d89ca',
      'b10b6562a52cb21557cee22a77c1088ec13bb793634985c7ea8dc8819cbecdb5',
      '6fb9042903b141f32e29772be134ecbce2ec8a8d72045f2e7f74f426c3caa172',
      'bec9003ffc07c92952f1ab7fbcd909cb1bec529cf4b56d0f8be61a69851be263'
    )
  order by text_hash
  for update;

  select count(*) into legacy_count
  from public.audio_assets
  where voice_id = 'th-TH-Chirp3-HD-Leda'
    and text_hash in (
      'b10b6562a52cb21557cee22a77c1088ec13bb793634985c7ea8dc8819cbecdb5',
      '6fb9042903b141f32e29772be134ecbce2ec8a8d72045f2e7f74f426c3caa172',
      'bec9003ffc07c92952f1ab7fbcd909cb1bec529cf4b56d0f8be61a69851be263'
    );
  if legacy_count <> 3 then
    raise exception 'PRIVATE_AUDIO_3 recovery blocked: expected 3 existing legacy metadata rows, found %', legacy_count;
  end if;

  if exists (
    select 1
    from public.audio_assets as asset
    join (values
      ('sent-18', 'ขอบคุณมากครับ', 'b10b6562a52cb21557cee22a77c1088ec13bb793634985c7ea8dc8819cbecdb5',
       'assets/sentence-audio/th/google-chirp3hd/b1/b10b6562a52cb21557cee22a77c1088ec13bb793634985c7ea8dc8819cbecdb5.mp3', 1224),
      ('sent-21', 'ขอเมนูหน่อยครับ', '6fb9042903b141f32e29772be134ecbce2ec8a8d72045f2e7f74f426c3caa172',
       'assets/sentence-audio/th/google-chirp3hd/6f/6fb9042903b141f32e29772be134ecbce2ec8a8d72045f2e7f74f426c3caa172.mp3', 1536),
      ('sent-25', 'เก็บเงินด้วยครับ', 'bec9003ffc07c92952f1ab7fbcd909cb1bec529cf4b56d0f8be61a69851be263',
       'assets/sentence-audio/th/google-chirp3hd/be/bec9003ffc07c92952f1ab7fbcd909cb1bec529cf4b56d0f8be61a69851be263.mp3', 1536)
    ) as expected(content_id, text_th, text_hash, file_path, duration_ms)
      on asset.text_hash = expected.text_hash
     and asset.voice_id = 'th-TH-Chirp3-HD-Leda'
    where asset.content_type <> 'sentence'
       or asset.content_id <> expected.content_id
       or asset.text_th <> expected.text_th
       or asset.voice_engine <> 'google-chirp3hd'
       or asset.source <> 'ai'
       or asset.file_path <> expected.file_path
       or asset.duration_ms is distinct from expected.duration_ms
  ) then
    raise exception 'PRIVATE_AUDIO_3 recovery blocked: legacy metadata differs from authoritative source';
  end if;

  select count(*) into replacement_count
  from public.audio_assets
  where voice_id = 'th-TH-Chirp3-HD-Leda'
    and text_hash in (
      '133e3ff63a47df9060618d6d28be8e1760389910531041b23313016333fa3883',
      '86c510f76a50f1fc21b1bd4c2db9073c955d0decff0055c6d673b7cae89d6cba',
      '814f261e277d95b2029ac97f69e64d820c4a2ca1bff9bfc3c08bcc1f168d89ca'
    );
  if replacement_count > 3 then
    raise exception 'PRIVATE_AUDIO_3 recovery blocked: replacement metadata scope exceeds 3 rows';
  end if;

  if exists (
    select 1
    from public.audio_assets as asset
    join (values
      ('sent-18', 'ขอบคุณมาก', '133e3ff63a47df9060618d6d28be8e1760389910531041b23313016333fa3883',
       'assets/sentence-audio/th/google-chirp3hd/13/133e3ff63a47df9060618d6d28be8e1760389910531041b23313016333fa3883.mp3',
       'sentences/th/google-chirp3hd/13/133e3ff63a47df9060618d6d28be8e1760389910531041b23313016333fa3883.mp3', 1248),
      ('sent-21', 'ขอเมนูหน่อย', '86c510f76a50f1fc21b1bd4c2db9073c955d0decff0055c6d673b7cae89d6cba',
       'assets/sentence-audio/th/google-chirp3hd/86/86c510f76a50f1fc21b1bd4c2db9073c955d0decff0055c6d673b7cae89d6cba.mp3',
       'sentences/th/google-chirp3hd/86/86c510f76a50f1fc21b1bd4c2db9073c955d0decff0055c6d673b7cae89d6cba.mp3', 1368),
      ('sent-25', 'เก็บเงินด้วย', '814f261e277d95b2029ac97f69e64d820c4a2ca1bff9bfc3c08bcc1f168d89ca',
       'assets/sentence-audio/th/google-chirp3hd/81/814f261e277d95b2029ac97f69e64d820c4a2ca1bff9bfc3c08bcc1f168d89ca.mp3',
       'sentences/th/google-chirp3hd/81/814f261e277d95b2029ac97f69e64d820c4a2ca1bff9bfc3c08bcc1f168d89ca.mp3', 1416)
    ) as expected(content_id, text_th, text_hash, file_path, storage_path, duration_ms)
      on asset.text_hash = expected.text_hash
     and asset.voice_id = 'th-TH-Chirp3-HD-Leda'
    where asset.content_type <> 'sentence'
       or asset.content_id <> expected.content_id
       or asset.text_th <> expected.text_th
       or asset.voice_engine <> 'google-chirp3hd'
       or asset.source <> 'ai'
       or asset.file_path <> expected.file_path
       or asset.storage_path <> expected.storage_path
       or asset.duration_ms is distinct from expected.duration_ms
  ) then
    raise exception 'PRIVATE_AUDIO_3 recovery blocked: replacement metadata differs from forward authority';
  end if;
end $$;

update public.audio_assets as asset
set status = 'generated',
    storage_path = expected.storage_path,
    updated_at = now()
from (values
  ('b10b6562a52cb21557cee22a77c1088ec13bb793634985c7ea8dc8819cbecdb5',
   'sentences/th/google-chirp3hd/b1/b10b6562a52cb21557cee22a77c1088ec13bb793634985c7ea8dc8819cbecdb5.mp3'),
  ('6fb9042903b141f32e29772be134ecbce2ec8a8d72045f2e7f74f426c3caa172',
   'sentences/th/google-chirp3hd/6f/6fb9042903b141f32e29772be134ecbce2ec8a8d72045f2e7f74f426c3caa172.mp3'),
  ('bec9003ffc07c92952f1ab7fbcd909cb1bec529cf4b56d0f8be61a69851be263',
   'sentences/th/google-chirp3hd/be/bec9003ffc07c92952f1ab7fbcd909cb1bec529cf4b56d0f8be61a69851be263.mp3')
) as expected(text_hash, storage_path)
where asset.text_hash = expected.text_hash
  and asset.voice_id = 'th-TH-Chirp3-HD-Leda';

delete from public.audio_assets
where voice_id = 'th-TH-Chirp3-HD-Leda'
  and text_hash in (
    '133e3ff63a47df9060618d6d28be8e1760389910531041b23313016333fa3883',
    '86c510f76a50f1fc21b1bd4c2db9073c955d0decff0055c6d673b7cae89d6cba',
    '814f261e277d95b2029ac97f69e64d820c4a2ca1bff9bfc3c08bcc1f168d89ca'
  );

do $$
begin
  if (
    select count(*)
    from public.audio_assets
    where voice_id = 'th-TH-Chirp3-HD-Leda'
      and status = 'generated'
      and storage_path in (
        'sentences/th/google-chirp3hd/b1/b10b6562a52cb21557cee22a77c1088ec13bb793634985c7ea8dc8819cbecdb5.mp3',
        'sentences/th/google-chirp3hd/6f/6fb9042903b141f32e29772be134ecbce2ec8a8d72045f2e7f74f426c3caa172.mp3',
        'sentences/th/google-chirp3hd/be/bec9003ffc07c92952f1ab7fbcd909cb1bec529cf4b56d0f8be61a69851be263.mp3'
      )
  ) <> 3 then
    raise exception 'PRIVATE_AUDIO_3 recovery failed: legacy metadata postcheck';
  end if;

  if exists (
    select 1
    from public.audio_assets
    where voice_id = 'th-TH-Chirp3-HD-Leda'
      and text_hash in (
        '133e3ff63a47df9060618d6d28be8e1760389910531041b23313016333fa3883',
        '86c510f76a50f1fc21b1bd4c2db9073c955d0decff0055c6d673b7cae89d6cba',
        '814f261e277d95b2029ac97f69e64d820c4a2ca1bff9bfc3c08bcc1f168d89ca'
      )
  ) then
    raise exception 'PRIVATE_AUDIO_3 recovery failed: replacement metadata remains';
  end if;
end $$;

commit;

select text_hash, status, storage_path
from public.audio_assets
where voice_id = 'th-TH-Chirp3-HD-Leda'
  and text_hash in (
    'b10b6562a52cb21557cee22a77c1088ec13bb793634985c7ea8dc8819cbecdb5',
    '6fb9042903b141f32e29772be134ecbce2ec8a8d72045f2e7f74f426c3caa172',
    'bec9003ffc07c92952f1ab7fbcd909cb1bec529cf4b56d0f8be61a69851be263'
  )
order by text_hash;
