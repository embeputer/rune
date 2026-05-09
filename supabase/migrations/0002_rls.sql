-- Row Level Security policies. All rows are scoped to auth.uid().

alter table public.projects enable row level security;
alter table public.runes enable row level security;
alter table public.gateways enable row level security;
alter table public.tasks enable row level security;
alter table public.gateway_commands enable row level security;

-- projects ---------------------------------------------------------------
drop policy if exists "projects: own rows" on public.projects;
create policy "projects: own rows" on public.projects
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- runes ------------------------------------------------------------------
drop policy if exists "runes: own rows" on public.runes;
create policy "runes: own rows" on public.runes
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- gateways ---------------------------------------------------------------
drop policy if exists "gateways: own rows" on public.gateways;
create policy "gateways: own rows" on public.gateways
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- tasks ------------------------------------------------------------------
drop policy if exists "tasks: own rows" on public.tasks;
create policy "tasks: own rows" on public.tasks
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- gateway_commands -------------------------------------------------------
drop policy if exists "gateway_commands: own rows" on public.gateway_commands;
create policy "gateway_commands: own rows" on public.gateway_commands
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
