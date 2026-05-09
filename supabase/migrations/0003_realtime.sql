-- Enable realtime on tables the gateway and web both subscribe to.

-- supabase_realtime publication is created by the platform; just add tables.
do $$
begin
  perform 1 from pg_publication where pubname = 'supabase_realtime';
  if found then
    alter publication supabase_realtime add table public.projects;
    alter publication supabase_realtime add table public.runes;
    alter publication supabase_realtime add table public.gateways;
    alter publication supabase_realtime add table public.tasks;
    alter publication supabase_realtime add table public.gateway_commands;
  end if;
exception when duplicate_object then
  -- tables may already be in the publication on re-runs
  null;
end $$;

-- Set REPLICA IDENTITY FULL so updates ship the full row to subscribers.
alter table public.projects replica identity full;
alter table public.runes replica identity full;
alter table public.gateways replica identity full;
alter table public.tasks replica identity full;
alter table public.gateway_commands replica identity full;
