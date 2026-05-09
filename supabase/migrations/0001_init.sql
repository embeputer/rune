-- Rune v0.1 schema
-- Run this in your Supabase SQL editor (or via supabase CLI db push).

-- Extensions
create extension if not exists pgcrypto;

-- =========================================================================
-- projects
-- =========================================================================
create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  slug text not null,
  local_path text not null,
  is_external boolean not null default false,
  is_scratch boolean not null default false,
  github_repo text,
  github_branch text,
  github_default_branch text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, slug)
);
create index if not exists projects_user_id_idx on public.projects (user_id);
create index if not exists projects_user_scratch_idx on public.projects (user_id, is_scratch);

-- =========================================================================
-- runes
-- =========================================================================
create table if not exists public.runes (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  slug text not null,
  title text not null,
  body text not null default '',
  frontmatter jsonb not null default '{}'::jsonb,
  status text not null default 'idle' check (status in ('idle','queued','running','done','error')),
  runtime text not null default 'cursor-agent'
    check (runtime in ('cursor-agent','claude-code','codex','droid','cursor-cloud')),
  output text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, slug)
);
create index if not exists runes_project_id_idx on public.runes (project_id);
create index if not exists runes_user_id_idx on public.runes (user_id);

-- =========================================================================
-- gateways
-- =========================================================================
create table if not exists public.gateways (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  hostname text not null,
  workspace_root text not null,
  status text not null default 'offline' check (status in ('online','offline')),
  last_seen_at timestamptz not null default now(),
  capabilities jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists gateways_user_id_idx on public.gateways (user_id);

-- =========================================================================
-- tasks (runtime execution queue)
-- =========================================================================
create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  rune_id uuid not null references public.runes(id) on delete cascade,
  gateway_id uuid references public.gateways(id) on delete set null,
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'queued'
    check (status in ('queued','running','done','error','cancelled')),
  runtime text not null
    check (runtime in ('cursor-agent','claude-code','codex','droid','cursor-cloud')),
  payload jsonb not null,
  output text,
  error text,
  created_at timestamptz not null default now(),
  claimed_at timestamptz,
  completed_at timestamptz
);
create index if not exists tasks_user_id_idx on public.tasks (user_id);
create index if not exists tasks_gateway_status_idx on public.tasks (gateway_id, status);
create index if not exists tasks_rune_id_idx on public.tasks (rune_id);

-- =========================================================================
-- gateway_commands (filesystem ops queue)
-- =========================================================================
create table if not exists public.gateway_commands (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  gateway_id uuid not null references public.gateways(id) on delete cascade,
  kind text not null
    check (kind in ('pick-folder','import-folder','relocate-project','scan-folder')),
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'queued'
    check (status in ('queued','running','done','error')),
  result jsonb,
  error text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
create index if not exists gateway_commands_gateway_status_idx on public.gateway_commands (gateway_id, status);
create index if not exists gateway_commands_user_id_idx on public.gateway_commands (user_id);

-- =========================================================================
-- updated_at triggers
-- =========================================================================
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists projects_set_updated_at on public.projects;
create trigger projects_set_updated_at before update on public.projects
  for each row execute function public.set_updated_at();

drop trigger if exists runes_set_updated_at on public.runes;
create trigger runes_set_updated_at before update on public.runes
  for each row execute function public.set_updated_at();
