-- Allow the web app to remotely sign a gateway out by enqueueing a
-- `sign-out` command. The gateway's command runner handles it by clearing
-- the local config file (~/.rune/config.json) and shutting down.

alter table public.gateway_commands
  drop constraint if exists gateway_commands_kind_check;

alter table public.gateway_commands
  add constraint gateway_commands_kind_check
  check (kind in (
    'pick-folder',
    'import-folder',
    'relocate-project',
    'scan-folder',
    'sign-out'
  ));
