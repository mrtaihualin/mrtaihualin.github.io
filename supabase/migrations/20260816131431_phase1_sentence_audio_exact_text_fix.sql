-- SOURCE ONLY. Do not apply until the three matching private audio objects have been
-- uploaded and Lin has separately approved the Production mutation.
begin;

insert into public.audio_assets
  (content_type, content_id, text_th, text_hash, voice_engine, voice_id, source,
   file_path, storage_path, status, duration_ms)
values
  ('sentence', 'sent-18', 'ขอบคุณมาก',
   '133e3ff63a47df9060618d6d28be8e1760389910531041b23313016333fa3883',
   'google-chirp3hd', 'th-TH-Chirp3-HD-Leda', 'ai',
   'assets/sentence-audio/th/google-chirp3hd/13/133e3ff63a47df9060618d6d28be8e1760389910531041b23313016333fa3883.mp3',
   'sentences/th/google-chirp3hd/13/133e3ff63a47df9060618d6d28be8e1760389910531041b23313016333fa3883.mp3',
   'generated', 1248),
  ('sentence', 'sent-21', 'ขอเมนูหน่อย',
   '86c510f76a50f1fc21b1bd4c2db9073c955d0decff0055c6d673b7cae89d6cba',
   'google-chirp3hd', 'th-TH-Chirp3-HD-Leda', 'ai',
   'assets/sentence-audio/th/google-chirp3hd/86/86c510f76a50f1fc21b1bd4c2db9073c955d0decff0055c6d673b7cae89d6cba.mp3',
   'sentences/th/google-chirp3hd/86/86c510f76a50f1fc21b1bd4c2db9073c955d0decff0055c6d673b7cae89d6cba.mp3',
   'generated', 1368),
  ('sentence', 'sent-25', 'เก็บเงินด้วย',
   '814f261e277d95b2029ac97f69e64d820c4a2ca1bff9bfc3c08bcc1f168d89ca',
   'google-chirp3hd', 'th-TH-Chirp3-HD-Leda', 'ai',
   'assets/sentence-audio/th/google-chirp3hd/81/814f261e277d95b2029ac97f69e64d820c4a2ca1bff9bfc3c08bcc1f168d89ca.mp3',
   'sentences/th/google-chirp3hd/81/814f261e277d95b2029ac97f69e64d820c4a2ca1bff9bfc3c08bcc1f168d89ca.mp3',
   'generated', 1416)
on conflict (text_hash, voice_id) do update
set content_type = excluded.content_type,
    content_id = excluded.content_id,
    text_th = excluded.text_th,
    voice_engine = excluded.voice_engine,
    source = excluded.source,
    file_path = excluded.file_path,
    storage_path = excluded.storage_path,
    status = excluded.status,
    duration_ms = excluded.duration_ms,
    updated_at = now();

update public.audio_assets
set status = 'needs_fix',
    storage_path = null,
    updated_at = now()
where voice_id = 'th-TH-Chirp3-HD-Leda'
  and text_th in ('ขอบคุณมากครับ', 'ขอเมนูหน่อยครับ', 'เก็บเงินด้วยครับ');

commit;

select text_th, status, storage_path
from public.audio_assets
where voice_id = 'th-TH-Chirp3-HD-Leda'
  and text_th in (
    'ขอบคุณมาก', 'ขอเมนูหน่อย', 'เก็บเงินด้วย',
    'ขอบคุณมากครับ', 'ขอเมนูหน่อยครับ', 'เก็บเงินด้วยครับ'
  )
order by text_th;
