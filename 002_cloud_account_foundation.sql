create extension if not exists pgcrypto;

create table if not exists schema_migrations (
  version text primary key,
  applied_at timestamptz not null default now()
);

create table if not exists app_users (
  id uuid primary key default gen_random_uuid(),
  auth_provider text not null default 'clerk',
  auth_subject text not null unique,
  email text,
  display_name text,
  plan_code text not null default 'free',
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_seen_at timestamptz
);

create table if not exists user_preferences (
  user_id uuid primary key references app_users(id) on delete cascade,
  preferences jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists library_books (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app_users(id) on delete cascade,
  client_record_id text,
  title text not null,
  author text,
  source_type text,
  source_id text,
  source_url text,
  cover_url text,
  metadata jsonb not null default '{}'::jsonb,
  added_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, client_record_id)
);
create index if not exists library_books_user_updated_idx on library_books(user_id, updated_at desc);

create table if not exists reading_positions (
  user_id uuid not null references app_users(id) on delete cascade,
  book_id uuid not null references library_books(id) on delete cascade,
  mode text,
  word_index integer not null default 0,
  scroll_ratio numeric(9,8) not null default 0,
  page_number integer,
  position_data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key(user_id, book_id)
);

create table if not exists reader_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app_users(id) on delete cascade,
  book_id uuid references library_books(id) on delete set null,
  client_record_id text,
  title text,
  body text not null,
  context text,
  note_type text not null default 'reader_note',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique(user_id, client_record_id)
);
create index if not exists reader_notes_user_updated_idx on reader_notes(user_id, updated_at desc);

create table if not exists notebook_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app_users(id) on delete cascade,
  book_id uuid references library_books(id) on delete set null,
  client_record_id text,
  entry_type text not null default 'note',
  title text,
  body text not null,
  source_context jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique(user_id, client_record_id)
);
create index if not exists notebook_entries_user_updated_idx on notebook_entries(user_id, updated_at desc);

create table if not exists actions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app_users(id) on delete cascade,
  client_record_id text,
  action_type text not null default 'task',
  title text not null,
  notes text,
  status text not null default 'active',
  priority text,
  due_at timestamptz,
  recurrence jsonb not null default '{}'::jsonb,
  reminder_code text,
  source_context jsonb not null default '{}'::jsonb,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique(user_id, client_record_id)
);
create index if not exists actions_user_due_idx on actions(user_id, status, due_at);

create table if not exists email_preferences (
  user_id uuid primary key references app_users(id) on delete cascade,
  email text,
  newsletter_enabled boolean not null default false,
  reminders_enabled boolean not null default false,
  notes_enabled boolean not null default false,
  notes_frequency text not null default 'weekly',
  timezone text not null default 'America/New_York',
  active boolean not null default true,
  consented_at timestamptz,
  unsubscribed_at timestamptz,
  updated_at timestamptz not null default now()
);

create table if not exists reading_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app_users(id) on delete cascade,
  book_id uuid references library_books(id) on delete set null,
  started_at timestamptz not null,
  ended_at timestamptz,
  words_read integer not null default 0,
  average_wpm integer,
  comprehension_score numeric(5,2),
  session_data jsonb not null default '{}'::jsonb
);
create index if not exists reading_sessions_user_started_idx on reading_sessions(user_id, started_at desc);

create table if not exists achievements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app_users(id) on delete cascade,
  achievement_code text not null,
  earned_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  unique(user_id, achievement_code)
);

create table if not exists subscriptions (
  user_id uuid primary key references app_users(id) on delete cascade,
  provider text not null default 'stripe',
  provider_customer_id text,
  provider_subscription_id text,
  plan_code text not null default 'free',
  status text not null default 'inactive',
  trial_ends_at timestamptz,
  current_period_ends_at timestamptz,
  cancel_at_period_end boolean not null default false,
  updated_at timestamptz not null default now()
);
