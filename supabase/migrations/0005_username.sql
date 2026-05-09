-- Custom workspace username, surfaced as the sidebar header label.
--
-- Stored as a citext-friendly text column with a CHECK constraint that
-- enforces our chosen alphabet (lowercase a-z, digits, hyphen, underscore;
-- 2..32 chars). Uniqueness is global so it could later double as a public
-- handle.

alter table public.user_settings
  add column if not exists username text;

drop index if exists user_settings_username_idx;
create unique index user_settings_username_idx
  on public.user_settings (lower(username))
  where username is not null;

alter table public.user_settings
  drop constraint if exists user_settings_username_format_chk;
alter table public.user_settings
  add constraint user_settings_username_format_chk
  check (
    username is null or username ~ '^[a-z0-9_-]{2,32}$'
  );
