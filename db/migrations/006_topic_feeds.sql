-- Topic Feeds v2: cloud state + prepared morning articles.
create table if not exists topic_feed_accounts (
  user_id uuid primary key references app_users(id) on delete cascade,
  state jsonb not null default '{"topics":[]}'::jsonb,
  preferences jsonb not null default '{}'::jsonb,
  last_morning_refresh_date date,
  last_daily_open_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists topic_feed_prepared_articles (
  user_id uuid not null references app_users(id) on delete cascade,
  article_id text not null,
  topic_id text not null,
  source_id text not null,
  url text not null,
  title text not null,
  prepared_text text not null,
  prepared_metadata jsonb not null default '{}'::jsonb,
  prepared_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key(user_id, article_id)
);

create index if not exists topic_feed_prepared_articles_source_idx
  on topic_feed_prepared_articles(user_id, source_id, prepared_at desc);
