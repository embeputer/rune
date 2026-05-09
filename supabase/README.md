# Supabase Setup

## Apply migrations

Easiest path: open https://supabase.com/dashboard, pick your project, go to **SQL Editor** and run each file under `migrations/` in order:

1. `0001_init.sql` — tables + indexes + triggers
2. `0002_rls.sql` — row level security policies
3. `0003_realtime.sql` — realtime publication + replica identity

Or with the Supabase CLI:

```sh
supabase link --project-ref <ref>
supabase db push
```

## Auth providers

In **Authentication → Providers**:

- **Email** — enable, with magic link or password (your call)
- **GitHub** — enable, paste in your GitHub OAuth App's Client ID + Secret. The redirect URL Supabase shows you goes into the GitHub OAuth App.

GitHub OAuth is required for the "Link GitHub repo" action to validate repo access via the user's session token. (You can omit it and link by raw URL only — the validation step will be skipped.)
