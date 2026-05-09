-- Profile pictures backed by Supabase Storage.
--
-- The bucket is *public* so any signed-in or anonymous client can `<img src=>`
-- a stored avatar URL without needing a signed URL — the writeable surface is
-- locked down to the owner via the RLS policies on `storage.objects`.

alter table public.user_settings
  add column if not exists avatar_url text;

insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do update set public = excluded.public;

-- Path convention: <user_id>/<filename>
-- The first folder segment must equal the caller's auth.uid() for any write.
drop policy if exists "avatars: read public" on storage.objects;
create policy "avatars: read public" on storage.objects
  for select using (bucket_id = 'avatars');

drop policy if exists "avatars: own insert" on storage.objects;
create policy "avatars: own insert" on storage.objects
  for insert with check (
    bucket_id = 'avatars'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "avatars: own update" on storage.objects;
create policy "avatars: own update" on storage.objects
  for update using (
    bucket_id = 'avatars'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

drop policy if exists "avatars: own delete" on storage.objects;
create policy "avatars: own delete" on storage.objects
  for delete using (
    bucket_id = 'avatars'
    and auth.uid()::text = (storage.foldername(name))[1]
  );
