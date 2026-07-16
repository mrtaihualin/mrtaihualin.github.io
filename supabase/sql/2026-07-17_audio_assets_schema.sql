-- ════════════════════════════════════════════════════════════
-- ตาราง audio_assets — metadata เสียง TTS คำศัพท์ไทย (ระบบเสียงคำศัพท์)
-- ตามสถาปัตยกรรม _แผนงาน/สถาปัตยกรรมเสียง-TTS_2026-07-12.docx หัวข้อ 5.2
-- รันไฟล์นี้ใน Supabase Dashboard → SQL Editor (รันครั้งเดียว)
-- สร้าง 2026-07-17
--
-- หมายเหตุ: ตารางนี้เป็นตาราง "หลังบ้าน" ล้วนๆ — เว็บไซต์จริงไม่ได้ query
-- ตารางนี้ตอนรันเวลา (เว็บอ่านจาก data/audio-manifest.js แทน เร็วกว่า)
-- ตารางนี้มีไว้เป็น "ต้นทางความจริง" ของ pipeline generate เสียง +
-- ให้ Lin/นักพากย์ track สถานะ (pending/generated/needs_fix/approved)
-- เพราะไม่มีใครนอกทีมงานต้องเห็นตารางนี้ เลย "ล็อกไม่ให้ public เข้าถึงเลย"
-- ทั้ง 4 policy (คิดครบตามบทเรียน 2026-07-15) — read/write ทำผ่าน
-- Supabase Dashboard (SQL Editor) หรือ service_role เท่านั้น ทั้งสองทาง
-- bypass RLS อยู่แล้วโดยดีไซน์ของ Supabase ไม่ต้องเปิดให้ anon/authenticated
-- ════════════════════════════════════════════════════════════

create table if not exists audio_assets (
  id uuid primary key default gen_random_uuid(),
  content_type text not null check (content_type in ('word','sentence','dialogue_line','exercise')),
  content_id text not null,                    -- อ้างอิงกลับคำ/ประโยคต้นทาง (เช่น key ใน WORDS_MASTER)
  text_th text not null,                        -- ข้อความไทยตัวเป๊ะที่สังเคราะห์เสียง (ต้นทางของ hash)
  text_hash text not null,                      -- sha256(text_th + voice_id) — กัน generate ซ้ำ + ใช้เป็นชื่อไฟล์
  voice_engine text not null,                   -- เช่น 'google-chirp3hd'
  voice_id text not null,                       -- เช่น 'th-TH-Chirp3-HD-Leda'
  source text not null default 'ai' check (source in ('ai','manual')),
  file_path text not null,                      -- path ไฟล์เสียงจริง (เช่น assets/word-audio/ab/ab12cd34....mp3)
  status text not null default 'pending' check (status in ('pending','generated','needs_fix','approved')),
  duration_ms int,
  loudness_lufs numeric,
  reviewed_by text,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 1 ข้อความ + 1 เสียง ต้องมีแค่แถวเดียว (กัน generate ซ้ำ)
create unique index if not exists uniq_audio_assets_hash_voice
  on audio_assets(text_hash, voice_id);

create index if not exists idx_audio_assets_content on audio_assets(content_type, content_id);
create index if not exists idx_audio_assets_status on audio_assets(status);

alter table audio_assets enable row level security;

-- ครบ 4 policy ตามบทเรียน RLS 2026-07-15 (SELECT+INSERT+UPDATE+DELETE)
-- ตั้งใจ "ปิดหมด" ให้ anon/authenticated เพราะตารางนี้ไม่มี use case
-- ที่ต้องให้ client (นักเรียน/หน้าเว็บ) เข้าถึงตรงๆ เลย — อ่าน/เขียนทำผ่าน
-- Supabase Dashboard หรือ service_role เท่านั้น (ทั้งคู่ bypass RLS อยู่แล้ว)
drop policy if exists "no public select" on audio_assets;
create policy "no public select" on audio_assets
  for select using (false);

drop policy if exists "no public insert" on audio_assets;
create policy "no public insert" on audio_assets
  for insert with check (false);

drop policy if exists "no public update" on audio_assets;
create policy "no public update" on audio_assets
  for update using (false);

drop policy if exists "no public delete" on audio_assets;
create policy "no public delete" on audio_assets
  for delete using (false);

-- ถ้าอนาคตอยากทำหน้า admin ให้ Lin ดูสถานะเสียงผ่านเว็บ (ไม่ผ่าน SQL Editor)
-- ค่อยเพิ่ม policy select ใหม่ผูกกับ auth.uid() ของ Lin โดยเฉพาะทีหลัง
