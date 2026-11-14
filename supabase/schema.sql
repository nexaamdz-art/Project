-- AstraMind — run ONCE in Supabase > SQL Editor.
-- Only edit the admin email in is_admin() below (one place), then press Run.

create or replace function public.is_admin() returns boolean language sql stable as
$$ select coalesce(lower(auth.jwt() ->> 'email') = lower('nexa.am.dz@gmail.com'), false) $$;

-- ============ 1) Membership requests ============
create table if not exists public.requests (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 80),
  email text not null check (char_length(email) <= 120 and email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  dept text not null default '' check (char_length(dept) <= 80),
  area text not null default '' check (char_length(area) <= 40),
  msg text not null default '' check (char_length(msg) <= 1000),
  consent boolean not null check (consent),
  lang text not null default 'en' check (lang in ('en','ar')),
  status text not null default 'new' check (status in ('new','accepted','rejected')),
  notified_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index if not exists requests_email_uq on public.requests (lower(email));   -- one request per email

alter table public.requests enable row level security;
revoke all on public.requests from anon, authenticated;
grant insert (name, email, dept, area, msg, consent, lang) on public.requests to anon;    -- visitors: submit only
grant select, delete on public.requests to authenticated;
grant update (status, notified_at) on public.requests to authenticated;

drop policy if exists "visitors can submit" on public.requests;
drop policy if exists "admin read" on public.requests;
drop policy if exists "admin update" on public.requests;
drop policy if exists "admin delete" on public.requests;
create policy "visitors can submit" on public.requests for insert to anon with check (consent = true);
create policy "admin read" on public.requests for select to authenticated using (public.is_admin());
create policy "admin update" on public.requests for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admin delete" on public.requests for delete to authenticated using (public.is_admin());

-- ============ 2) Live site content (events, announcement, gallery, contact) ============
create table if not exists public.site_content (
  id int primary key check (id = 1),
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.site_content enable row level security;
revoke all on public.site_content from anon, authenticated;
grant select on public.site_content to anon, authenticated;       -- the public site reads it
grant insert, update on public.site_content to authenticated;
drop policy if exists "public read content" on public.site_content;
drop policy if exists "admin insert content" on public.site_content;
drop policy if exists "admin update content" on public.site_content;
create policy "public read content" on public.site_content for select to anon, authenticated using (true);
create policy "admin insert content" on public.site_content for insert to authenticated with check (public.is_admin());
create policy "admin update content" on public.site_content for update to authenticated using (public.is_admin()) with check (public.is_admin());
insert into public.site_content (id, data) values (1, '{}'::jsonb) on conflict (id) do nothing;

-- ============ 3) Photos bucket (public read, admin write) ============
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('media', 'media', true, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;
drop policy if exists "media public read" on storage.objects;
drop policy if exists "media admin insert" on storage.objects;
drop policy if exists "media admin update" on storage.objects;
drop policy if exists "media admin delete" on storage.objects;
create policy "media public read" on storage.objects for select using (bucket_id = 'media');
create policy "media admin insert" on storage.objects for insert to authenticated with check (bucket_id = 'media' and public.is_admin());
create policy "media admin update" on storage.objects for update to authenticated using (bucket_id = 'media' and public.is_admin());
create policy "media admin delete" on storage.objects for delete to authenticated using (bucket_id = 'media' and public.is_admin());

-- ============ 4) Live notifications for new requests ============
do $$ begin
  alter publication supabase_realtime add table public.requests;
exception when duplicate_object then null; end $$;
