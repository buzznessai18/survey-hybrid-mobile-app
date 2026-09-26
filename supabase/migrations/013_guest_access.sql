-- 013_guest_access.sql
-- Public browsing without an account: the mobile app signs visitors in with
-- Supabase *anonymous* auth. Anonymous users automatically get the read-only
-- `user` role (migration 012), so every existing RLS rule and Edge Function
-- check applies unchanged: guests can search/view/map, never write.
-- Only admins sign in with credentials.

alter table public.profiles
  add column if not exists is_guest boolean not null default false;

comment on column public.profiles.is_guest is 'True for anonymous (no-login) app visitors.';

create index if not exists profiles_is_guest_idx on public.profiles (is_guest);

create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_mobile text := nullif(regexp_replace(coalesce(new.phone, new.raw_user_meta_data ->> 'mobile', ''), '[^0-9+]', '', 'g'), '');
begin
  -- Anonymous visitors: read-only, active immediately.
  if coalesce(new.is_anonymous, false) then
    insert into public.profiles (id, full_name, role, status, is_guest)
    values (new.id, 'Guest', 'user', 'active', true)
    on conflict (id) do nothing;
    return new;
  end if;

  if v_mobile is not null and v_mobile !~ '^\+?[0-9]{7,15}$' then
    v_mobile := null;
  end if;

  -- SECURITY: role is NEVER read from user metadata (it is client-controlled).
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

-- Guests must never become anything but read-only users.
create or replace function private.guard_guest_profile()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.is_guest and (new.role is distinct from 'user' or new.is_guest is distinct from true) then
    raise exception 'Guest profiles are read-only' using errcode = '42501';
  end if;
  if not old.is_guest and new.is_guest then
    raise exception 'Accounts cannot be turned into guests' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_guard_guest on public.profiles;
create trigger profiles_guard_guest
  before update on public.profiles
  for each row execute function private.guard_guest_profile();

revoke execute on function private.guard_guest_profile() from public, anon;
