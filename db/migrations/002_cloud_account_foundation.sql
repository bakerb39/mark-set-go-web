-- Cloud-first account data foundation.
-- Keeps playback cursor and viewport anchor independent in persistent storage.

alter table reading_positions
  add column if not exists playback_index integer not null default 0,
  add column if not exists viewport_anchor_index integer not null default 0,
  add column if not exists viewport_offset_px integer not null default 0;

create index if not exists reading_positions_user_updated_idx
  on reading_positions(user_id, updated_at desc);

create index if not exists library_books_user_client_record_idx
  on library_books(user_id, client_record_id)
  where client_record_id is not null;
