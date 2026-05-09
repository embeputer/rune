-- Per-user secrets / preferences. Plaintext storage, protected by RLS.
-- The threat model is the same as Supabase service role env vars: anyone with
-- service-role access can read everything; regular users can only read their
-- own row.

create table if not exists public.user_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  cursor_api_key text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.user_settings enable row level security;

drop policy if exists "user_settings: own row" on public.user_settings;
create policy "user_settings: own row" on public.user_settings
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop trigger if exists user_settings_set_updated_at on public.user_settings;
create trigger user_settings_set_updated_at before update on public.user_settings
  for each row execute function public.set_updated_at();

-- Realtime so the gateway sees key changes without a restart.
do $$
begin
  perform 1 from pg_publication where pubname = 'supabase_realtime';
  if found then
    alter publication supabase_realtime add table public.user_settings;
  end if;
exception when duplicate_object then null;
end $$;

alter table public.user_settings replica identity full;
