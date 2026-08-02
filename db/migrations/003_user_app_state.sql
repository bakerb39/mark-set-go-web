-- Persist legacy browser storage records for authenticated accounts.
-- localStorage remains a synchronous browser cache; PostgreSQL is the durable copy.

create table if not exists user_app_state (
  user_id uuid not null references app_users(id) on delete cascade,
  state_key text not null,
  state_value text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, state_key),
  constraint user_app_state_key_length check (char_length(state_key) between 1 and 500),
  constraint user_app_state_value_length check (octet_length(state_value) <= 5242880)
);

create index if not exists user_app_state_user_updated_idx
  on user_app_state(user_id, updated_at desc);
