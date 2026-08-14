-- S13 private audio architecture — SOURCE ONLY, do not run without Lin's production authorization.
-- Run before uploading files and before deploying game-content/game-audio.

alter table public.audio_assets add column if not exists storage_path text;
create index if not exists idx_audio_assets_storage_path
  on public.audio_assets(storage_path) where storage_path is not null;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('game-audio-private', 'game-audio-private', false, 10485760, array['audio/mpeg', 'audio/mp4', 'audio/x-m4a'])
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

-- No storage.objects SELECT policy is created. Browsers receive only signed URLs from game-audio.
revoke all on table public.audio_assets from anon, authenticated;

-- Pre-deploy verification (must show public=false and no public policies for this bucket):
select id, public, file_size_limit, allowed_mime_types
from storage.buckets where id = 'game-audio-private';
select policyname, roles, cmd from pg_policies
where schemaname = 'storage' and tablename = 'objects'
  and (qual ilike '%game-audio-private%' or with_check ilike '%game-audio-private%');
select count(*) as assets_missing_private_path
from public.audio_assets
where status in ('generated', 'approved') and storage_path is null;
