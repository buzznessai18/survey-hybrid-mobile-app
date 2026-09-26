-- 001_create_profiles.sql
-- Extensions, private helper schema, and the profiles table (one row per auth user).

create extension if not exists postgis with schema extensions;
create extension if not exists pg_trgm with schema extensions;

-- "private" is NOT exposed through the Data API (PostgREST). Internal helpers
-- and SECURITY DEFINER functions live here so clients cannot call them directly.
create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated, service_role;

-- Generic updated_at trigger used by every table.
create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create table public.profiles (
  id            uuid primary key references auth.users (id) on delete cascade,
  full_name     text not null check (char_length(btrim(full_name)) between 1 and 150),
  mobile        text check (mobile ~ '^\+?[0-9]{7,15}$'),
  role          text not null default 'field_surveyor'
                check (role in ('field_surveyor', 'supervisor', 'admin')),
  status        text not null default 'pending'
                check (status in ('pending', 'active', 'inactive')),
  -- Supervisor responsible for this field surveyor (null for supervisors/admins).
  supervisor_id uuid references public.profiles (id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint profiles_supervisor_not_self check (supervisor_id is null or supervisor_id <> id)
);

comment on table public.profiles is 'Application profile and role for each auth user.';
comment on column public.profiles.status is 'pending = self-registered, awaiting admin activation. Only active users can use the API.';
comment on column public.profiles.supervisor_id is 'Supervisor assigned to a field surveyor.';

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function private.set_updated_at();

-- Create a profile automatically for every new auth user.
-- SECURITY: role is NEVER read from user metadata (it is client-controlled).
-- New users are field_surveyor + pending until an admin activates them.
create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_mobile text := nullif(regexp_replace(coalesce(new.phone, new.raw_user_meta_data ->> 'mobile', ''), '[^0-9+]', '', 'g'), '');
begin
  if v_mobile is not null and v_mobile !~ '^\+?[0-9]{7,15}$' then
    v_mobile := null;
  end if;

  insert into public.profiles (id, full_name, mobile)
  values (
    new.id,
    coalesce(
      nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''),
      nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
      'New user'
    ),
    v_mobile
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();
