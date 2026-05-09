-- Chat mode for runes: a per-rune toggle between markdown-doc prompts and
-- turn-based chat threads. Chat turns live in `rune_messages`; the existing
-- task pipeline stays the source of truth for execution but flushes streamed
-- output onto `rune_messages.content` when a task is bound to a message.

-- runes.mode -------------------------------------------------------------
alter table public.runes
  add column if not exists mode text not null default 'doc'
    check (mode in ('doc', 'chat'));

-- rune_messages ----------------------------------------------------------
create table if not exists public.rune_messages (
  id uuid primary key default gen_random_uuid(),
  rune_id uuid not null references public.runes(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null default '',
  status text not null default 'pending'
    check (status in ('pending', 'streaming', 'done', 'error')),
  runtime text
    check (runtime is null or runtime in ('cursor-agent','claude-code','codex','droid','cursor-cloud')),
  task_id uuid,
  error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists rune_messages_rune_id_idx on public.rune_messages (rune_id, created_at);
create index if not exists rune_messages_user_id_idx on public.rune_messages (user_id);

drop trigger if exists rune_messages_set_updated_at on public.rune_messages;
create trigger rune_messages_set_updated_at before update on public.rune_messages
  for each row execute function public.set_updated_at();

-- tasks.message_id -------------------------------------------------------
alter table public.tasks
  add column if not exists message_id uuid references public.rune_messages(id) on delete set null;
create index if not exists tasks_message_id_idx on public.tasks (message_id);

-- And now that rune_messages exists, attach the FK from rune_messages.task_id
-- back to tasks (deferred until after both tables are present).
alter table public.rune_messages
  drop constraint if exists rune_messages_task_id_fkey;
alter table public.rune_messages
  add constraint rune_messages_task_id_fkey
    foreign key (task_id) references public.tasks(id) on delete set null;

-- RLS --------------------------------------------------------------------
alter table public.rune_messages enable row level security;

drop policy if exists "rune_messages: own rows" on public.rune_messages;
create policy "rune_messages: own rows" on public.rune_messages
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Realtime ---------------------------------------------------------------
do $$
begin
  perform 1 from pg_publication where pubname = 'supabase_realtime';
  if found then
    alter publication supabase_realtime add table public.rune_messages;
  end if;
exception when duplicate_object then
  null;
end $$;

alter table public.rune_messages replica identity full;
