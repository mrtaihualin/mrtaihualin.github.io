-- 🛑🛑🛑 ห้ามรันไฟล์นี้กับฐานข้อมูลจริงโดยไม่จำเป็น 🛑🛑🛑
--
-- ไฟล์นี้คือ "แบบแปลนย้อนหลัง" ของฐานข้อมูล ณ วันที่ 2026-08-07
-- สร้างโดยให้ฐานข้อมูลจริงพ่นโครงสร้างตัวเองออกมา (อ่านอย่างเดียว) แล้วจัดเป็นไฟล์
-- ที่มา: งาน P2-05 · รายงาน `Bussiness Idea/ระบบเว็บไซต์/20_ผลตรวจ_P2_database_rls.md`
--
-- ทำไมต้องมี: ตรวจแล้วพบว่า 21 จาก 37 ตาราง และ 34 จาก 41 ด่าน RLS
-- ไม่มีไฟล์ต้นฉบับใน repo เลย รวมถึง classroom_students และ classroom_payments
-- = ฐานข้อมูลหายแล้วสร้างโครงคืนไม่ได้
--
-- ใช้ตอนไหน:
--   ✅ สร้างฐานข้อมูลใหม่จากศูนย์ (staging / sandbox / กู้คืนหลังภัยพิบัติ)
--   ✅ อ่านเทียบว่าโครงสร้างปัจจุบันเปลี่ยนไปจากวันนี้หรือยัง
--   ❌ ห้ามรันกับฐานข้อมูล production ที่ใช้งานอยู่ (ไม่ได้ตั้งใจให้ใช้แบบนั้น)
--
-- ทุกคำสั่งเขียนให้รันซ้ำได้ (if not exists / ดักข้อผิดพลาดของซ้ำ) แต่ก็ยังไม่ควรรันกับของจริง
--

-- ⚠️ ข้อจำกัดที่ต้องรู้ (ยังไม่ครบ 100%)
--   · ไม่รวม trigger (ตรวจแล้วไม่มี trigger ใน public เลย)
--   · ไม่รวม grant/revoke สิทธิ์ระดับตาราง — ดูหัวข้อ 99 ท้ายไฟล์
--   · ไม่รวมข้อมูลข้างในตาราง (ไฟล์นี้สร้างได้แค่ "ตู้เปล่า" ต้องมีระบบสำรองข้อมูลแยก)
--   · ไม่รวมฟังก์ชัน/RPC — อยู่ในไฟล์อื่นใน supabase/sql/
--
-- ✅ อุดช่องโหว่แล้ว 2026-08-07 (บ่าย): ตัวนับเลขอัตโนมัติของ 9 ตาราง และคอลัมน์คำนวณ
--    ของ game_reward_events.event_date ถูกเติมครบแล้ว (ยืนยันจาก pg_attribute.attidentity
--    และ attgenerated ของฐานข้อมูลจริง) — รอบแรกจับไม่ได้เพราะดูแต่ default แบบ nextval
--
-- ============================================================
-- [10] ตัวนับเลขอัตโนมัติ (sequence) — ต้องสร้างก่อนตาราง
-- ============================================================

create sequence if not exists public.anon_game_events_id_seq;
create sequence if not exists public.classroom_recurring_days_id_seq;
create sequence if not exists public.slink_fail_log_id_seq;


-- ============================================================
-- [20] ตาราง 37 ตาราง
-- ============================================================

-- ── _backup_game_accounts_20260711 ──
create table if not exists public._backup_game_accounts_20260711 (
  user_id uuid,
  stars integer,
  streak integer,
  last_play text,
  updated_at timestamp with time zone,
  hard_words_by_level jsonb
);

-- ── anon_game_events ──
create table if not exists public.anon_game_events (
  id bigint not null default nextval('anon_game_events_id_seq'::regclass),
  anon_id text not null,
  user_id uuid,
  event_type text not null,
  game text not null,
  category text not null default 'game'::text,
  meta jsonb,
  created_at timestamp with time zone not null default now()
);

-- ── audio_assets ──
create table if not exists public.audio_assets (
  id uuid not null default gen_random_uuid(),
  content_type text not null,
  content_id text not null,
  text_th text not null,
  text_hash text not null,
  voice_engine text not null,
  voice_id text not null,
  source text not null default 'ai'::text,
  file_path text not null,
  status text not null default 'pending'::text,
  duration_ms integer,
  loudness_lufs numeric,
  reviewed_by text,
  reviewed_at timestamp with time zone,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

-- ── classroom_attendance ──
create table if not exists public.classroom_attendance (
  id uuid not null default gen_random_uuid(),
  token text,
  student_name text not null,
  lesson_date date not null default CURRENT_DATE,
  note text,
  created_at timestamp with time zone default now(),
  lessons integer not null default 1
);

-- ── classroom_calendar_backups ──
create table if not exists public.classroom_calendar_backups (
  id uuid not null default gen_random_uuid(),
  request_id uuid,
  token text not null,
  action text not null,
  old_event_id text not null,
  new_event_id text,
  old_event_json jsonb not null,
  old_start timestamp with time zone not null,
  new_start timestamp with time zone,
  reverted boolean not null default false,
  reverted_at timestamp with time zone,
  created_at timestamp with time zone not null default now()
);

-- ── classroom_feedback ──
create table if not exists public.classroom_feedback (
  id uuid not null default gen_random_uuid(),
  token text not null,
  content text not null,
  approved boolean default false,
  display_name text default ''::text,
  created_at timestamp with time zone default now(),
  category text
);

-- ── classroom_game_links ──
create table if not exists public.classroom_game_links (
  token text not null,
  user_id uuid not null,
  linked_at timestamp with time zone not null default now()
);

-- ── classroom_payments ──
create table if not exists public.classroom_payments (
  id uuid not null default gen_random_uuid(),
  token text,
  student_name text not null,
  course_id text not null,
  course_label text not null,
  lessons integer not null,
  bonus_lessons integer default 0,
  price_per integer not null,
  currency text default 'THB'::text,
  total_amount integer not null,
  start_note text,
  note text,
  receipt_no text,
  status text default 'pending'::text,
  created_at timestamp with time zone default now(),
  slip_data text,
  submitted_by text default 'teacher'::text,
  submitted_at timestamp with time zone,
  start_date date,
  low_quota_notified boolean not null default false
);

-- ── classroom_recording_issues ──
create table if not exists public.classroom_recording_issues (
  id bigint generated always as identity not null,
  token text,
  event_type text not null,
  detail text,
  mime text,
  part integer,
  browser_info text,
  created_at timestamp with time zone not null default now()
);

-- ── classroom_recordings ──
create table if not exists public.classroom_recordings (
  id bigint generated always as identity not null,
  token text not null,
  name text,
  file_id text,
  url text,
  size_mb text,
  part integer,
  created_at timestamp with time zone default now()
);

-- ── classroom_recurring_days ──
create table if not exists public.classroom_recurring_days (
  id bigint not null default nextval('classroom_recurring_days_id_seq'::regclass),
  token text not null,
  weekday smallint not null,
  start_time text not null,
  end_time text,
  calendar_event_id text,
  created_at timestamp with time zone default now()
);

-- ── classroom_requests ──
create table if not exists public.classroom_requests (
  id uuid not null default gen_random_uuid(),
  token text not null,
  student_name text not null,
  request_type text not null,
  original_date date,
  requested_date date,
  requested_time text,
  note text,
  status text not null default 'pending'::text,
  created_at timestamp with time zone not null default now(),
  initiated_by text not null default 'student'::text,
  offer_status text,
  offer_created_at timestamp with time zone,
  sla_reminder_sent boolean not null default false,
  calendar_event_id text,
  teacher_cancel_ack_at timestamp with time zone,
  proposed_options jsonb,
  offer_accepted_at timestamp with time zone,
  original_time text,
  teacher_add_ack_at timestamp with time zone,
  proposed_end_time text,
  proposed_recurring boolean,
  proposed_until date,
  proposed_weekday smallint,
  processing_started_at timestamp with time zone,
  sla_reminder_last_sent_at timestamp with time zone
);

-- ── classroom_schedule ──
create table if not exists public.classroom_schedule (
  id uuid not null default gen_random_uuid(),
  token text not null,
  lesson_date date not null,
  start_time text,
  end_time text,
  title text,
  created_at timestamp with time zone not null default now(),
  line_reminder_sent boolean not null default false,
  line_followup_sent boolean not null default false,
  calendar_event_id text,
  line_reminder24h_sent boolean not null default false
);

-- ── classroom_students ──
create table if not exists public.classroom_students (
  token text not null,
  name text not null,
  meet text,
  created_at timestamp with time zone default now(),
  folder_url text,
  line_user_id text,
  lesson_progress text,
  setup_status text default 'confirmed'::text,
  pending_course_id text,
  pending_lessons integer,
  pending_start_date date,
  pending_class_time text,
  pending_student_tz text,
  pending_recurring boolean default false,
  archived_at timestamp with time zone,
  pending_bonus_lessons integer,
  welcome_msg_sent_at timestamp with time zone
);

-- ── cron_state ──
create table if not exists public.cron_state (
  key text not null,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamp with time zone not null default now()
);

-- ── game_accounts ──
create table if not exists public.game_accounts (
  user_id uuid not null,
  stars integer not null default 0,
  streak integer not null default 0,
  last_play text,
  updated_at timestamp with time zone not null default now(),
  hard_words_by_level jsonb default '{}'::jsonb
);

-- ── game_content_rl ──
create table if not exists public.game_content_rl (
  rl_key text not null,
  window_start timestamp with time zone not null,
  cnt integer not null default 0
);

-- ── game_reward_events ──
create table if not exists public.game_reward_events (
  id uuid not null default gen_random_uuid(),
  user_id uuid not null,
  game text not null,
  type text not null,
  content text not null,
  status text not null default 'pending'::text,
  points_awarded integer not null default 0,
  admin_note text,
  created_at timestamp with time zone not null default now(),
  reviewed_at timestamp with time zone,
  event_date date generated always as ((created_at AT TIME ZONE 'Asia/Taipei'::text)::date) stored
);

-- ── game_reward_points ──
create table if not exists public.game_reward_points (
  user_id uuid not null,
  points integer not null default 0,
  lifetime_points integer not null default 0,
  updated_at timestamp with time zone not null default now()
);

-- ── game_sentences ──
create table if not exists public.game_sentences (
  id bigint generated always as identity not null,
  th text not null,
  zh text,
  reading_th text,
  wc integer,
  polite_f text,
  words jsonb not null,
  rank integer not null,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

-- ── game_words ──
create table if not exists public.game_words (
  id bigint generated always as identity not null,
  word text not null,
  en text,
  zh text,
  level text not null,
  category text,
  syls jsonb not null,
  reading_th text,
  read_syls jsonb,
  rank integer not null,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

-- ── leads ──
create table if not exists public.leads (
  id uuid not null default gen_random_uuid(),
  email text not null,
  name text,
  source text,
  created_at timestamp with time zone not null default now()
);

-- ── lego_daily_limits ──
create table if not exists public.lego_daily_limits (
  identity_key text not null,
  day date not null,
  count integer not null default 0,
  updated_at timestamp with time zone not null default now()
);

-- ── line_identities ──
create table if not exists public.line_identities (
  line_user_id text not null,
  user_id uuid not null,
  created_at timestamp with time zone not null default now()
);

-- ── line_pending_reply ──
create table if not exists public.line_pending_reply (
  id smallint not null,
  student_token text,
  student_name text,
  set_at timestamp with time zone
);

-- ── login_events ──
create table if not exists public.login_events (
  id bigint generated always as identity not null,
  user_id uuid not null,
  email text,
  ip text,
  fingerprint text,
  user_agent text,
  event text,
  created_at timestamp with time zone not null default now()
);

-- ── payout_ledger ──
create table if not exists public.payout_ledger (
  id bigint generated always as identity not null,
  user_id uuid not null,
  stars_redeemed integer not null,
  amount numeric(10,2) not null,
  currency text not null default 'THB'::text,
  status text not null default 'pending'::text,
  precheck_ok boolean not null,
  approved_by text,
  note text,
  created_at timestamp with time zone not null default now(),
  approved_at timestamp with time zone,
  paid_at timestamp with time zone
);

-- ── profiles ──
create table if not exists public.profiles (
  user_id uuid not null,
  nickname text not null,
  updated_at timestamp with time zone default now(),
  avatar text,
  badge_id text
);

-- ── reading_sessions ──
create table if not exists public.reading_sessions (
  id bigint generated always as identity not null,
  user_id uuid not null,
  score integer not null default 0,
  games integer not null default 1,
  created_at timestamp with time zone not null default now(),
  wrong_items jsonb default '[]'::jsonb,
  game text
);

-- ── rl_counters ──
create table if not exists public.rl_counters (
  user_id uuid not null,
  fn text not null,
  window_start timestamp with time zone not null,
  cnt integer not null
);

-- ── slink_fail_log ──
create table if not exists public.slink_fail_log (
  id bigint not null default nextval('slink_fail_log_id_seq'::regclass),
  ip text not null,
  fn text not null,
  token_head text,
  at timestamp with time zone not null default now()
);

-- ── slink_rl ──
create table if not exists public.slink_rl (
  ip text not null,
  fn text not null,
  window_start timestamp with time zone not null,
  cnt integer not null default 0
);

-- ── star_fraud_alerts ──
create table if not exists public.star_fraud_alerts (
  id bigint generated always as identity not null,
  checked_at timestamp with time zone not null default now(),
  user_id uuid,
  stars_now integer,
  baseline integer,
  ledger_confirmed integer,
  unexplained integer
);

-- ── star_ledger ──
create table if not exists public.star_ledger (
  id bigint generated always as identity not null,
  user_id uuid not null,
  word text not null,
  level smallint not null,
  stars smallint not null,
  reason text not null,
  clean boolean,
  created_at timestamp with time zone not null default now(),
  game text not null default 'tone'::text
);

-- ── tone_progress ──
create table if not exists public.tone_progress (
  user_id uuid not null,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamp with time zone not null default now()
);

-- ── tone_sessions ──
create table if not exists public.tone_sessions (
  id uuid not null default gen_random_uuid(),
  user_id uuid not null,
  created_at timestamp with time zone not null default now(),
  mode text,
  score integer,
  total integer,
  wrong_words jsonb default '[]'::jsonb
);

-- ── tone_srs_state ──
create table if not exists public.tone_srs_state (
  user_id uuid not null,
  level smallint not null,
  word text not null,
  stage smallint not null default 0,
  due_date text not null default ''::text,
  ever_failed boolean not null default false,
  mastered boolean not null default false,
  updated_at timestamp with time zone not null default now(),
  game text not null default 'tone'::text
);


-- ============================================================
-- [30] ผูกตัวนับเลขเข้ากับคอลัมน์ (ต้องทำหลังสร้างตาราง)
-- ============================================================

alter sequence public.anon_game_events_id_seq owned by public.anon_game_events.id;
alter sequence public.classroom_recurring_days_id_seq owned by public.classroom_recurring_days.id;
alter sequence public.slink_fail_log_id_seq owned by public.slink_fail_log.id;


-- ============================================================
-- [40] เปิดระบบล็อก RLS — 37 ตาราง (ครบทุกตาราง)
-- ============================================================

alter table public._backup_game_accounts_20260711 enable row level security;
alter table public.anon_game_events enable row level security;
alter table public.audio_assets enable row level security;
alter table public.classroom_attendance enable row level security;
alter table public.classroom_calendar_backups enable row level security;
alter table public.classroom_feedback enable row level security;
alter table public.classroom_game_links enable row level security;
alter table public.classroom_payments enable row level security;
alter table public.classroom_recording_issues enable row level security;
alter table public.classroom_recordings enable row level security;
alter table public.classroom_recurring_days enable row level security;
alter table public.classroom_requests enable row level security;
alter table public.classroom_schedule enable row level security;
alter table public.classroom_students enable row level security;
alter table public.cron_state enable row level security;
alter table public.game_accounts enable row level security;
alter table public.game_content_rl enable row level security;
alter table public.game_reward_events enable row level security;
alter table public.game_reward_points enable row level security;
alter table public.game_sentences enable row level security;
alter table public.game_words enable row level security;
alter table public.leads enable row level security;
alter table public.lego_daily_limits enable row level security;
alter table public.line_identities enable row level security;
alter table public.line_pending_reply enable row level security;
alter table public.login_events enable row level security;
alter table public.payout_ledger enable row level security;
alter table public.profiles enable row level security;
alter table public.reading_sessions enable row level security;
alter table public.rl_counters enable row level security;
alter table public.slink_fail_log enable row level security;
alter table public.slink_rl enable row level security;
alter table public.star_fraud_alerts enable row level security;
alter table public.star_ledger enable row level security;
alter table public.tone_progress enable row level security;
alter table public.tone_sessions enable row level security;
alter table public.tone_srs_state enable row level security;


-- ============================================================
-- [50] กฎประจำตาราง — 83 ข้อ (กุญแจหลัก / ความสัมพันธ์ / ห้ามซ้ำ / ค่าที่ยอมรับ)
-- ============================================================

do $do$ begin
  execute 'alter table public.anon_game_events add constraint anon_game_events_pkey PRIMARY KEY (id)';
exception when duplicate_object or duplicate_table then null;
end $do$;
do $do$ begin
  execute 'alter table public.anon_game_events add constraint anon_game_events_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)';
exception when duplicate_object or duplicate_table then null;
end $do$;
do $do$ begin
  execute 'alter table public.audio_assets add constraint audio_assets_content_type_check CHECK ((content_type = ANY (ARRAY[''word''::text, ''sentence''::text, ''dialogue_line''::text, ''exercise''::text])))';
exception when duplicate_object or duplicate_table then null;
end $do$;
do $do$ begin
  execute 'alter table public.audio_assets add constraint audio_assets_pkey PRIMARY KEY (id)';
exception when duplicate_object or duplicate_table then null;
end $do$;
do $do$ begin
  execute 'alter table public.audio_assets add constraint audio_assets_source_check CHECK ((source = ANY (ARRAY[''ai''::text, ''manual''::text])))';
exception when duplicate_object or duplicate_table then null;
end $do$;
do $do$ begin
  execute 'alter table public.audio_assets add constraint audio_assets_status_check CHECK ((status = ANY (ARRAY[''pending''::text, ''generated''::text, ''needs_fix''::text, ''approved''::text])))';
exception when duplicate_object or duplicate_table then null;
end $do$;
do $do$ begin
  execute 'alter table public.classroom_attendance add constraint classroom_attendance_pkey PRIMARY KEY (id)';
exception when duplicate_object or duplicate_table then null;
end $do$;
do $do$ begin
  execute 'alter table public.classroom_attendance add constraint classroom_attendance_token_fkey FOREIGN KEY (token) REFERENCES classroom_students(token) ON DELETE SET NULL';
exception when duplicate_object or duplicate_table then null;
end $do$;
do $do$ begin
  execute 'alter table public.classroom_attendance add constraint classroom_attendance_token_lesson_date_key UNIQUE (token, lesson_date)';
exception when duplicate_object or duplicate_table then null;
end $do$;
do $do$ begin
  execute 'alter table public.classroom_calendar_backups add constraint classroom_calendar_backups_action_check CHECK ((action = ANY (ARRAY[''move''::text, ''delete''::text, ''permanent_change''::text, ''archive_student''::text, ''create''::text])))';
exception when duplicate_object or duplicate_table then null;
end $do$;
do $do$ begin
  execute 'alter table public.classroom_calendar_backups add constraint classroom_calendar_backups_pkey PRIMARY KEY (id)';
exception when duplicate_object or duplicate_table then null;
end $do$;
do $do$ begin
  execute 'alter table public.classroom_calendar_backups add constraint classroom_calendar_backups_request_id_fkey FOREIGN KEY (request_id) REFERENCES classroom_requests(id) ON DELETE SET NULL';
exception when duplicate_object or duplicate_table then null;
end $do$;
do $do$ begin
  execute 'alter table public.classroom_feedback add constraint classroom_feedback_pkey PRIMARY KEY (id)';
exception when duplicate_object or duplicate_table then null;
end $do$;
do $do$ begin
  execute 'alter table public.classroom_game_links add constraint classroom_game_links_pkey PRIMARY KEY (token)';
exception when duplicate_object or duplicate_table then null;
end $do$;
do $do$ begin
  execute 'alter table public.classroom_game_links add constraint classroom_game_links_token_fkey FOREIGN KEY (token) REFERENCES classroom_students(token) ON DELETE CASCADE';
exception when duplicate_object or duplicate_table then null;
end $do$;
do $do$ begin
  execute 'alter table public.classroom_game_links add constraint classroom_game_links_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE';
exception when duplicate_object or duplicate_table then null;
end $do$;
do $do$ begin
  execute 'alter table public.classroom_payments add constraint classroom_payments_pkey PRIMARY KEY (id)';
exception when duplicate_object or duplicate_table then null;
end $do$;
do $do$ begin
  execute 'alter table public.classroom_payments add constraint classroom_payments_token_fkey FOREIGN KEY (token) REFERENCES classroom_students(token) ON DELETE SET NULL';
exception when duplicate_object or duplicate_table then null;
end $do$;
do $do$ begin
  execute 'alter table public.classroom_recording_issues add constraint classroom_recording_issues_pkey PRIMARY KEY (id)';
exception when duplicate_object or duplicate_table then null;
end $do$;
do $do$ begin
  execute 'alter table public.classroom_recordings add constraint classroom_recordings_pkey PRIMARY KEY (id)';
exception when duplicate_object or duplicate_table then null;
end $do$;
do $do$ begin
  execute 'alter table public.classroom_recurring_days add constraint classroom_recurring_days_pkey PRIMARY KEY (id)';
exception when duplicate_object or duplicate_table then null;
end $do$;
do $do$ begin
  execute 'alter table public.classroom_recurring_days add constraint classroom_recurring_days_token_fkey FOREIGN KEY (token) REFERENCES classroom_students(token) ON DELETE CASCADE';
exception when duplicate_object or duplicate_table then null;
end $do$;
do $do$ begin
  execute 'alter table public.classroom_recurring_days add constraint classroom_recurring_days_token_weekday_start_key UNIQUE (token, weekday, start_time)';
exception when duplicate_object or duplicate_table then null;
end $do$;
do $do$ begin
  execute 'alter table public.classroom_requests add constraint classroom_requests_initiated_by_check CHECK ((initiated_by = ANY (ARRAY[''student''::text, ''teacher''::text])))';
exception when duplicate_object or duplicate_table then null;
end $do$;
do $do$ begin
  execute 'alter table public.classroom_requests add constraint classroom_requests_offer_status_check CHECK (((offer_status IS NULL) OR (offer_status = ANY (ARRAY[''proposed''::text, ''accepted''::text, ''declined''::text]))))';
exception when duplicate_object or duplicate_table then null;
end $do$;
do $do$ begin
  execute 'alter table public.classroom_requests add constraint classroom_requests_pkey PRIMARY KEY (id)';
exception when duplicate_object or duplicate_table then null;
end $do$;
do $do$ begin
  execute 'alter table public.classroom_requests add constraint classroom_requests_request_type_check CHECK ((request_type = ANY (ARRAY[''cancel''::text, ''reschedule''::text, ''add_class''::text])))';
exception when duplicate_object or duplicate_table then null;
end $do$;
do $do$ begin
  execute 'alter table public.classroom_requests add constraint classroom_requests_status_check CHECK ((status = ANY (ARRAY[''pending''::text, ''acknowledged''::text])))';
exception when duplicate_object or duplicate_table then null;
end $do$;
do $do$ begin
  execute 'alter table public.classroom_requests add constraint proposed_options_max_3 CHECK (((proposed_options IS NULL) OR ((jsonb_typeof(proposed_options) = ''array''::text) AND (jsonb_array_length(proposed_options) <= 3))))';
exception when duplicate_object or duplicate_table then null;
end $do$;
do $do$ begin
  execute 'alter table public.classroom_schedule add constraint classroom_schedule_pkey PRIMARY KEY (id)';
exception when duplicate_object or duplicate_table then null;
end $do$;
do $do$ begin
  execute 'alter table public.classroom_schedule add constraint classroom_schedule_token_date_time_unique UNIQUE (token, lesson_date, start_time)';
exception when duplicate_object or duplicate_table then null;
end $do$;
do $do$ begin
  execute 'alter table public.classroom_students add constraint classroom_students_pkey PRIMARY KEY (token)';
exception when duplicate_object or duplicate_table then null;
end $do$;
do $do$ begin
  execute 'alter table public.cron_state add constraint cron_state_pkey PRIMARY KEY (key)';
exception when duplicate_object or duplicate_table then null;
end $do$;
do $do$ begin
  execute 'alter table public.game_accounts add constraint game_accounts_pkey PRIMARY KEY (user_id)';
exception when duplicate_object or duplicate_table then null;
end $do$;
do $do$ begin
  execute 'alter table public.game_accounts add constraint game_accounts_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE';
exception when duplicate_object or duplicate_table then null;
end $do$;
do $do$ begin
  execute 'alter table public.game_content_rl add constraint game_content_rl_pkey PRIMARY KEY (rl_key, window_start)';
exception when duplicate_object or duplicate_table then null;
end $do$;
do $do$ begin
  execute 'alter table public.game_reward_events add constraint game_reward_events_content_check CHECK (((char_length(content) >= 1) AND (char_length(content) <= 2000)))';
exception when duplicate_object or duplicate_table then null;
end $do$;
do $do$ begin
  execute 'alter table public.game_reward_events add constraint game_reward_events_game_check CHECK ((game = ANY (ARRAY[''typing''::text, ''reading''::text, ''lego''::text, ''word_order''::text, ''tone_finder''::text, ''challenge''::text])))';
exception when duplicate_object or duplicate_table then null;
end $do$;
do $do$ begin
  execute 'alter table public.game_reward_events add constraint game_reward_events_pkey PRIMARY KEY (id)';
exception when duplicate_object or duplicate_table then null;
end $do$;
do $do$ begin
  execute 'alter table public.game_reward_events add constraint game_reward_events_points_awarded_check CHECK ((points_awarded >= 0))';
exception when duplicate_object or duplicate_table then null;
end $do$;
do $do$ begin
  execute 'alter table public.game_reward_events add constraint game_reward_events_status_check CHECK ((status = ANY (ARRAY[''pending''::text, ''approved''::text, ''rejected''::text])))';
exception when duplicate_object or duplicate_table then null;
end $do$;
do $do$ begin
  execute 'alter table public.game_reward_events add constraint game_reward_events_type_check CHECK ((type = ANY (ARRAY[''bug_report''::text, ''review''::text])))';
exception when duplicate_object or duplicate_table then null;
end $do$;
do $do$ begin
  execute 'alter table public.game_reward_events add constraint game_reward_events_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)';
exception when duplicate_object or duplicate_table then null;
end $do$;
do $do$ begin
  execute 'alter table public.game_reward_points add constraint game_reward_points_lifetime_points_check CHECK ((lifetime_points >= 0))';
exception when duplicate_object or duplicate_table then null;
end $do$;
do $do$ begin
  execute 'alter table public.game_reward_points add constraint game_reward_points_pkey PRIMARY KEY (user_id)';
exception when duplicate_object or duplicate_table then null;
end $do$;
do $do$ begin
  execute 'alter table public.game_reward_points add constraint game_reward_points_points_check CHECK (((points >= 0) AND (points <= 300)))';
exception when duplicate_object or duplicate_table then null;
end $do$;
do $do$ begin
  execute 'alter table public.game_reward_points add constraint game_reward_points_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)';
exception when duplicate_object or duplicate_table then null;
end $do$;
do $do$ begin
  execute 'alter table public.game_sentences add constraint game_sentences_pkey PRIMARY KEY (id)';
exception when duplicate_object or duplicate_table then null;
end $do$;
do $do$ begin
  execute 'alter table public.game_words add constraint game_words_level_check CHECK ((level = ANY (ARRAY[''初''::text, ''中''::text])))';
exception when duplicate_object or duplicate_table then null;
end $do$;
do $do$ begin
  execute 'alter table public.game_words add constraint game_words_pkey PRIMARY KEY (id)';
exception when duplicate_object or duplicate_table then null;
end $do$;
do $do$ begin
  execute 'alter table public.leads add constraint leads_email_fmt CHECK ((email ~* ''^[^@\s]+@[^@\s]+\.[^@\s]+$''::text))';
exception when duplicate_object or duplicate_table then null;
end $do$;
do $do$ begin
  execute 'alter table public.leads add constraint leads_email_len CHECK ((char_length(email) <= 254))';
exception when duplicate_object or duplicate_table then null;
end $do$;
do $do$ begin
  execute 'alter table public.leads add constraint leads_pkey PRIMARY KEY (id)';
exception when duplicate_object or duplicate_table then null;
end $do$;
do $do$ begin
  execute 'alter table public.leads add constraint leads_source_len CHECK (((source IS NULL) OR (char_length(source) <= 60)))';
exception when duplicate_object or duplicate_table then null;
end $do$;
do $do$ begin
  execute 'alter table public.lego_daily_limits add constraint lego_daily_limits_pkey PRIMARY KEY (identity_key, day)';
exception when duplicate_object or duplicate_table then null;
end $do$;
do $do$ begin
  execute 'alter table public.line_identities add constraint line_identities_pkey PRIMARY KEY (line_user_id)';
exception when duplicate_object or duplicate_table then null;
end $do$;
do $do$ begin
  execute 'alter table public.line_identities add constraint line_identities_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE';
exception when duplicate_object or duplicate_table then null;
end $do$;
do $do$ begin
  execute 'alter table public.line_pending_reply add constraint line_pending_reply_pkey PRIMARY KEY (id)';
exception when duplicate_object or duplicate_table then null;
end $do$;
do $do$ begin
  execute 'alter table public.line_pending_reply add constraint line_pending_reply_single_row CHECK ((id = 1))';
exception when duplicate_object or duplicate_table then null;
end $do$;
do $do$ begin
  execute 'alter table public.login_events add constraint login_events_pkey PRIMARY KEY (id)';
exception when duplicate_object or duplicate_table then null;
end $do$;
do $do$ begin
  execute 'alter table public.payout_ledger add constraint payout_ledger_amount_check CHECK ((amount > (0)::numeric))';
exception when duplicate_object or duplicate_table then null;
end $do$;
do $do$ begin
  execute 'alter table public.payout_ledger add constraint payout_ledger_pkey PRIMARY KEY (id)';
exception when duplicate_object or duplicate_table then null;
end $do$;
do $do$ begin
  execute 'alter table public.payout_ledger add constraint payout_ledger_stars_redeemed_check CHECK ((stars_redeemed > 0))';
exception when duplicate_object or duplicate_table then null;
end $do$;
do $do$ begin
  execute 'alter table public.payout_ledger add constraint payout_ledger_status_check CHECK ((status = ANY (ARRAY[''pending''::text, ''approved''::text, ''paid''::text, ''rejected''::text])))';
exception when duplicate_object or duplicate_table then null;
end $do$;
do $do$ begin
  execute 'alter table public.profiles add constraint profiles_nickname_check CHECK (((char_length(nickname) >= 1) AND (char_length(nickname) <= 20)))';
exception when duplicate_object or duplicate_table then null;
end $do$;
do $do$ begin
  execute 'alter table public.profiles add constraint profiles_pkey PRIMARY KEY (user_id)';
exception when duplicate_object or duplicate_table then null;
end $do$;
do $do$ begin
  execute 'alter table public.profiles add constraint profiles_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE';
exception when duplicate_object or duplicate_table then null;
end $do$;
do $do$ begin
  execute 'alter table public.reading_sessions add constraint reading_sessions_pkey PRIMARY KEY (id)';
exception when duplicate_object or duplicate_table then null;
end $do$;
do $do$ begin
  execute 'alter table public.reading_sessions add constraint reading_sessions_score_sane CHECK (((score >= 0) AND (score <= 5000)))';
exception when duplicate_object or duplicate_table then null;
end $do$;
do $do$ begin
  execute 'alter table public.reading_sessions add constraint reading_sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE';
exception when duplicate_object or duplicate_table then null;
end $do$;
do $do$ begin
  execute 'alter table public.rl_counters add constraint rl_counters_pkey PRIMARY KEY (user_id, fn)';
exception when duplicate_object or duplicate_table then null;
end $do$;
do $do$ begin
  execute 'alter table public.slink_fail_log add constraint slink_fail_log_pkey PRIMARY KEY (id)';
exception when duplicate_object or duplicate_table then null;
end $do$;
do $do$ begin
  execute 'alter table public.slink_rl add constraint slink_rl_pkey PRIMARY KEY (ip, fn, window_start)';
exception when duplicate_object or duplicate_table then null;
end $do$;
do $do$ begin
  execute 'alter table public.star_fraud_alerts add constraint star_fraud_alerts_pkey PRIMARY KEY (id)';
exception when duplicate_object or duplicate_table then null;
end $do$;
do $do$ begin
  execute 'alter table public.star_ledger add constraint star_ledger_pkey PRIMARY KEY (id)';
exception when duplicate_object or duplicate_table then null;
end $do$;
do $do$ begin
  execute 'alter table public.tone_progress add constraint tone_progress_pkey PRIMARY KEY (user_id)';
exception when duplicate_object or duplicate_table then null;
end $do$;
do $do$ begin
  execute 'alter table public.tone_progress add constraint tone_progress_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE';
exception when duplicate_object or duplicate_table then null;
end $do$;
do $do$ begin
  execute 'alter table public.tone_sessions add constraint tone_sessions_pkey PRIMARY KEY (id)';
exception when duplicate_object or duplicate_table then null;
end $do$;
do $do$ begin
  execute 'alter table public.tone_sessions add constraint tone_sessions_score_sane CHECK (((score >= 0) AND (score <= 500000)))';
exception when duplicate_object or duplicate_table then null;
end $do$;
do $do$ begin
  execute 'alter table public.tone_sessions add constraint tone_sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE';
exception when duplicate_object or duplicate_table then null;
end $do$;
do $do$ begin
  execute 'alter table public.tone_srs_state add constraint tone_srs_state_level_check CHECK ((level = ANY (ARRAY[1, 2, 3])))';
exception when duplicate_object or duplicate_table then null;
end $do$;
do $do$ begin
  execute 'alter table public.tone_srs_state add constraint tone_srs_state_pkey PRIMARY KEY (user_id, game, level, word)';
exception when duplicate_object or duplicate_table then null;
end $do$;
do $do$ begin
  execute 'alter table public.tone_srs_state add constraint tone_srs_state_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE';
exception when duplicate_object or duplicate_table then null;
end $do$;


-- ============================================================
-- [60] index เพิ่มเติม — 20 ตัว (ไม่รวม index ที่มาพร้อมกฎด้านบน)
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_audio_assets_content ON public.audio_assets USING btree (content_type, content_id);
CREATE INDEX IF NOT EXISTS idx_audio_assets_status ON public.audio_assets USING btree (status);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_audio_assets_hash_voice ON public.audio_assets USING btree (text_hash, voice_id);
CREATE INDEX IF NOT EXISTS idx_recordings_token ON public.classroom_recordings USING btree (token);
CREATE INDEX IF NOT EXISTS idx_classroom_requests_processing_started_at ON public.classroom_requests USING btree (processing_started_at) WHERE (processing_started_at IS NOT NULL);
CREATE INDEX IF NOT EXISTS classroom_schedule_reminder_idx ON public.classroom_schedule USING btree (lesson_date, line_reminder_sent, line_followup_sent);
CREATE INDEX IF NOT EXISTS idx_gre_status ON public.game_reward_events USING btree (status, type);
CREATE INDEX IF NOT EXISTS idx_gre_user ON public.game_reward_events USING btree (user_id);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_daily_review ON public.game_reward_events USING btree (user_id, game, event_date) WHERE (type = 'review'::text);
CREATE INDEX IF NOT EXISTS idx_game_sentences_rank ON public.game_sentences USING btree (rank);
CREATE UNIQUE INDEX IF NOT EXISTS uq_game_sentences_th ON public.game_sentences USING btree (th);
CREATE INDEX IF NOT EXISTS idx_game_words_level_rank ON public.game_words USING btree (level, rank);
CREATE UNIQUE INDEX IF NOT EXISTS uq_game_words_word_level ON public.game_words USING btree (word, level);
CREATE INDEX IF NOT EXISTS idx_login_events_fp ON public.login_events USING btree (fingerprint);
CREATE INDEX IF NOT EXISTS idx_login_events_ip ON public.login_events USING btree (ip);
CREATE INDEX IF NOT EXISTS idx_login_events_user ON public.login_events USING btree (user_id);
CREATE INDEX IF NOT EXISTS idx_payout_ledger_user ON public.payout_ledger USING btree (user_id);
CREATE UNIQUE INDEX IF NOT EXISTS uq_payout_open_per_user ON public.payout_ledger USING btree (user_id) WHERE (status = ANY (ARRAY['pending'::text, 'approved'::text]));
CREATE INDEX IF NOT EXISTS slink_fail_log_at_idx ON public.slink_fail_log USING btree (at DESC);
CREATE INDEX IF NOT EXISTS tone_sessions_user_idx ON public.tone_sessions USING btree (user_id, created_at DESC);


-- ============================================================
-- [99] สิทธิ์ระดับตาราง — จดไว้เป็นบันทึก ไม่ใช่คำสั่งครบชุด
-- ============================================================
-- Supabase ตั้งค่าเริ่มต้นให้ anon/authenticated มีสิทธิ์กว้างทุกตาราง
-- ตัวที่กันจริงคือ RLS ในหัวข้อ [40] ไม่ใช่สิทธิ์ชั้นนี้
--
-- ยกเว้น 3 ตารางที่ "ตัดสิทธิ์ชั้นนอกทิ้งด้วย" = ล็อก 2 ชั้น (ยืนยันจากของจริง 2026-08-07):
--   game_words · game_sentences · cron_state
-- ถ้าสร้างฐานข้อมูลใหม่ ต้องรันคำสั่งนี้ด้วย ไม่งั้นจะได้ล็อกแค่ชั้นเดียว:
--
--   revoke all on public.game_words     from anon, authenticated;
--   revoke all on public.game_sentences from anon, authenticated;
--   revoke all on public.cron_state     from anon, authenticated;
--
-- (ต้นฉบับของ game_words/game_sentences อยู่ที่ sql/2026-08-02_game_content_schema.sql)

