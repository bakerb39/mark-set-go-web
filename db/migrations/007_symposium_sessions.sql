-- Symposium v1: durable, resumable cloud sessions and ordered transcript turns.
create table if not exists symposium_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app_users(id) on delete cascade,
  client_session_id text,
  title text not null,
  topic text not null default '',
  mode text not null default 'debate',
  context_text text not null default '',
  context_label text,
  output_mode text not null default 'write',
  participants jsonb not null default '[]'::jsonb,
  source_context jsonb not null default '{}'::jsonb,
  status text not null default 'active',
  next_speaker_index integer not null default 0,
  next_turn_index integer not null default 0,
  started_at timestamptz,
  last_opened_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, client_session_id),
  check (status in ('active', 'completed', 'archived'))
);

create index if not exists symposium_sessions_user_updated_idx
  on symposium_sessions(user_id, updated_at desc);

create table if not exists symposium_turns (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app_users(id) on delete cascade,
  session_id uuid not null references symposium_sessions(id) on delete cascade,
  client_turn_id text not null,
  turn_index integer not null,
  speaker_name text not null,
  speaker_monogram text,
  speaker_field text,
  turn_kind text not null default 'participant',
  body text not null,
  source_label text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(session_id, turn_index),
  unique(session_id, client_turn_id)
);

create index if not exists symposium_turns_session_order_idx
  on symposium_turns(session_id, turn_index);
create index if not exists symposium_turns_user_created_idx
  on symposium_turns(user_id, created_at desc);
