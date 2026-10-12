-- 016_form_owner_policies.sql
-- Field survey users may read their own 1/14 forms and edit them while
-- pending, through their own session (so audit logs record the real user).
-- Everything else about forms goes through the land-records Edge Function.

create policy land_records_select_own on public.land_records
  for select to authenticated
  using (created_by = (select auth.uid()) and (select private.current_user_role()) = 'field_surveyor');

create policy land_records_update_own_pending on public.land_records
  for update to authenticated
  using (
    created_by = (select auth.uid()) and status = 'pending'
    and (select private.current_user_role()) = 'field_surveyor'
  )
  with check (created_by = (select auth.uid()) and status = 'pending');

-- Owners can't change the owner, the code or the review status themselves.
create or replace function private.guard_land_records_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if private.is_privileged_session() or private.is_admin() then
    return new;
  end if;
  if new.id is distinct from old.id or new.form_id is distinct from old.form_id
     or new.created_by is distinct from old.created_by or new.status is distinct from old.status
     or new.farmer_id is distinct from old.farmer_id or new.created_at is distinct from old.created_at then
    raise exception 'These form fields can only be changed by an admin' using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger land_records_guard_update
  before update on public.land_records
  for each row execute function private.guard_land_records_update();

revoke execute on function private.guard_land_records_update() from public, anon;
