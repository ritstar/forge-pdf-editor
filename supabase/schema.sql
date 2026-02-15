-- Enable required extension
create extension if not exists "pgcrypto";

-- Profiles mirror auth users
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  file_path text not null,
  file_size bigint,
  mime_type text default 'application/pdf',
  status text not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.document_drafts (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null unique references public.documents(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  editor_state jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.signatures (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text,
  image_path text not null,
  mime_type text default 'image/png',
  is_default boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.handle_auth_user_created()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    coalesce(new.raw_user_meta_data ->> 'avatar_url', '')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row
execute function public.handle_auth_user_created();

alter table public.profiles enable row level security;
alter table public.documents enable row level security;
alter table public.document_drafts enable row level security;
alter table public.signatures enable row level security;

create policy "profiles_select_own" on public.profiles
for select using (auth.uid() = id);

create policy "profiles_update_own" on public.profiles
for update using (auth.uid() = id);

create policy "documents_rw_own" on public.documents
for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "drafts_rw_own" on public.document_drafts
for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "signatures_rw_own" on public.signatures
for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Storage buckets (run in SQL editor)
insert into storage.buckets (id, name, public)
values
  ('documents', 'documents', false),
  ('draft_assets', 'draft_assets', false),
  ('signatures', 'signatures', false)
on conflict (id) do nothing;

create policy "documents_bucket_rw_own" on storage.objects
for all
using (bucket_id = 'documents' and auth.uid()::text = (storage.foldername(name))[1])
with check (bucket_id = 'documents' and auth.uid()::text = (storage.foldername(name))[1]);

create policy "draft_assets_bucket_rw_own" on storage.objects
for all
using (bucket_id = 'draft_assets' and auth.uid()::text = (storage.foldername(name))[1])
with check (bucket_id = 'draft_assets' and auth.uid()::text = (storage.foldername(name))[1]);

create policy "signatures_bucket_rw_own" on storage.objects
for all
using (bucket_id = 'signatures' and auth.uid()::text = (storage.foldername(name))[1])
with check (bucket_id = 'signatures' and auth.uid()::text = (storage.foldername(name))[1]);
