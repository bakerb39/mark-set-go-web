alter table user_email_preferences
  add column if not exists actions jsonb not null default '[]'::jsonb;

create index if not exists user_email_preferences_reminders_idx
  on user_email_preferences(active, reminders)
  where active = true and reminders = true;
