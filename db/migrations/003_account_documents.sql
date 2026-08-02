-- Cost-controlled cloud document storage.
-- Reader architecture remains unchanged; this table is accessed only by external adapters.

create table if not exists account_documents (
  user_id uuid not null references app_users(id) on delete cascade,
  book_id uuid not null references library_books(id) on delete cascade,
  content_gzip bytea not null,
  raw_bytes integer not null check (raw_bytes > 0),
  compressed_bytes integer not null check (compressed_bytes > 0),
  content_sha256 text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key(user_id, book_id)
);

create index if not exists account_documents_user_updated_idx
  on account_documents(user_id, updated_at desc);
