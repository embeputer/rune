-- Gateway-issued client token used by the browser to authenticate direct
-- requests to the gateway's localhost HTTP/WebSocket surface (diffs, terminal,
-- etc). The gateway generates and persists this on first boot; existing RLS on
-- `gateways` already restricts visibility to the owner.

alter table public.gateways
  add column if not exists client_token text;
