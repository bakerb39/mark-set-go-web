create table if not exists beta_feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references app_users(id) on delete cascade,
  feedback_type text not null default 'bug',
  title text,
  description text not null,
  status text not null default 'new',
  priority text not null default 'normal',
  admin_notes text,
  screenshot_mime text,
  screenshot_bytes bytea,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists beta_feedback_status_created_idx
  on beta_feedback(status, created_at desc);

create index if not exists beta_feedback_user_created_idx
  on beta_feedback(user_id, created_at desc);
