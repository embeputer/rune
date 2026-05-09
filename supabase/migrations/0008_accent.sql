-- Per-user accent color preference (stored as a preset key like "plum",
-- "blue", "mint", etc — see apps/web/lib/accents.ts for the canonical list).
-- We deliberately store the key, not the oklch literal, so the palette can
-- evolve without stranding values.

alter table public.user_settings
  add column if not exists accent_color text;

alter table public.user_settings
  drop constraint if exists user_settings_accent_color_format_chk;
alter table public.user_settings
  add constraint user_settings_accent_color_format_chk
  check (accent_color is null or accent_color ~ '^[a-z]{2,16}$');
