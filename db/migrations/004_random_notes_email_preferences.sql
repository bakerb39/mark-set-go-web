create table if not exists random_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app_users(id) on delete cascade,
  title varchar(240) not null default 'Untitled note',
  content_html text not null default '',
  content_text text not null default '',
  tags jsonb not null default '[]'::jsonb,
  pinned boolean not null default false,
  favorite boolean not null default false,
  related_book_ids jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists random_notes_user_updated_idx on random_notes(user_id, updated_at desc);

create table if not exists user_email_preferences (
  user_id uuid primary key references app_users(id) on delete cascade,
  email varchar(320) not null,
  reminders boolean not null default false,
  newsletter boolean not null default false,
  notes boolean not null default false,
  notes_frequency varchar(20) not null default 'weekly',
  timezone varchar(80) not null default 'America/New_York',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
