-- 007_enable_rls.sql
-- Row Level Security: helper functions, guard triggers and policies.
--
-- Principles
--   * RLS is enabled on every public table. anon gets nothing.
--   * Only ACTIVE profiles get any data access.
--   * Inserts into surveys/farmers/duplicate_matches happen only through the
--     Edge Functions (service role + SECURITY DEFINER database functions).
--   * Guard triggers stop non-admin users from changing protected columns
--     (role, status, duplicate status, survey keys, ...) even where a policy
--     allows them to UPDATE the row.

------------------------------------------------------------------------------
-- Helper functions (SECURITY DEFINER so policies can read profiles without
-- recursive RLS; in the private schema so they are not callable via the API)
------------------------------------------------------------------------------

-- Role of the calling user, or NULL if not logged in / not active.
create or replace function private.current_user_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select p.role from public.profiles p
   where p.id = auth.uid() and p.status = 'active';
$$;

create or replace function private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(private.current_user_role() = 'admin', false);
$$;

-- Field surveyors assigned to the calling supervisor.
create or replace function private.assigned_surveyor_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select p.id from public.profiles p
   where p.supervisor_id = auth.uid()
     and private.current_user_role() = 'supervisor';
$$;

-- True when running as service_role / postgres (Edge Functions, SECURITY
-- DEFINER functions, migrations) rather than as an end-user API request.
create or replace function private.is_privileged_session()
returns boolean
language sql
stable
set search_path = ''
as $$
  select current_user not in ('anon', 'authenticated');
$$;

-- Functions are executable by PUBLIC by default; lock private down and grant
-- only what policies, guard triggers and column defaults need at runtime.
revoke execute on all functions in schema private from public, anon;
grant execute on all functions in schema private to service_role;
grant execute on function
  private.current_user_role(),
  private.is_admin(),
  private.assigned_surveyor_ids(),
  private.is_privileged_session(),
  private.current_actor(),
  private.normalize_code(text),
  private.next_survey_code(),
  private.set_updated_at()
to authenticated;

------------------------------------------------------------------------------
-- Guard triggers
------------------------------------------------------------------------------

-- Users can never change their own role/status/supervisor through the API.
create or replace function private.guard_profiles_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if private.is_privileged_session() or private.is_admin() then
    return new;
  end if;
  if new.id is distinct from old.id
     or new.role is distinct from old.role
     or new.status is distinct from old.status
     or new.supervisor_id is distinct from old.supervisor_id
     or new.created_at is distinct from old.created_at then
    raise exception 'Only an admin can change role, status or supervisor'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger profiles_guard_update
  before update on public.profiles
  for each row execute function private.guard_profiles_update();

-- Surveyors may directly edit only descriptive fields of their own pending
-- surveys. Changing survey number / sub-division / GPS requires the
-- update-survey Edge Function, which re-runs duplicate detection.
create or replace function private.guard_surveys_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if private.is_privileged_session() or private.is_admin() then
    return new;
  end if;
  if new.id is distinct from old.id
     or new.survey_id is distinct from old.survey_id
     or new.farmer_id is distinct from old.farmer_id
     or new.collected_by is distinct from old.collected_by
     or new.survey_number is distinct from old.survey_number
     or new.sub_division is distinct from old.sub_division
     or new.latitude is distinct from old.latitude
     or new.longitude is distinct from old.longitude
     or new.gps_accuracy is distinct from old.gps_accuracy
     or new.duplicate_status is distinct from old.duplicate_status
     or new.submission_status is distinct from old.submission_status
     or new.created_at is distinct from old.created_at then
    raise exception 'These survey fields can only be changed through the update-survey function'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger surveys_guard_update
  before update on public.surveys
  for each row execute function private.guard_surveys_update();

-- Reviewers may change only status and notes of a duplicate match.
create or replace function private.guard_duplicate_matches_update()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if private.is_privileged_session() or private.is_admin() then
    return new;
  end if;
  if new.id is distinct from old.id
     or new.survey_id is distinct from old.survey_id
     or new.matched_survey_id is distinct from old.matched_survey_id
     or new.match_type is distinct from old.match_type
     or new.distance_meters is distinct from old.distance_meters
     or new.created_at is distinct from old.created_at then
    raise exception 'Only status and notes of a duplicate match can be changed'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

create trigger duplicate_matches_guard_update
  before update on public.duplicate_matches
  for each row execute function private.guard_duplicate_matches_update();

------------------------------------------------------------------------------
-- Enable RLS
------------------------------------------------------------------------------
alter table public.profiles          enable row level security;
alter table public.farmers           enable row level security;
alter table public.crops             enable row level security;
alter table public.surveys           enable row level security;
alter table public.duplicate_matches enable row level security;
alter table public.audit_logs        enable row level security;
alter table public.app_settings      enable row level security;

------------------------------------------------------------------------------
-- Table privileges. Granted explicitly (newer Supabase projects no longer
-- auto-grant DML on new tables). For `authenticated` the grants are only the
-- outer bound: RLS policies and guard triggers decide what each role can do.
------------------------------------------------------------------------------
-- The anonymous role has no business with any application table.
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;

grant select, insert, update, delete on
  public.profiles, public.farmers, public.crops, public.surveys,
  public.duplicate_matches, public.app_settings
to authenticated;
-- Audit logs are append-only and written by triggers only.
revoke all on public.audit_logs from authenticated;
grant select on public.audit_logs to authenticated;

grant select, insert, update, delete on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to authenticated, service_role;

------------------------------------------------------------------------------
-- profiles
------------------------------------------------------------------------------
create policy profiles_select_own on public.profiles
  for select to authenticated
  using (id = (select auth.uid()));

create policy profiles_select_team on public.profiles
  for select to authenticated
  using (id in (select private.assigned_surveyor_ids()));

create policy profiles_update_own on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

create policy profiles_admin_all on public.profiles
  for all to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));

------------------------------------------------------------------------------
-- crops (readable by every active user; managed by admins)
------------------------------------------------------------------------------
create policy crops_select_active_users on public.crops
  for select to authenticated
  using ((select private.current_user_role()) is not null);

create policy crops_admin_all on public.crops
  for all to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));

------------------------------------------------------------------------------
-- surveys
------------------------------------------------------------------------------
create policy surveys_select_own on public.surveys
  for select to authenticated
  using (
    collected_by = (select auth.uid())
    and (select private.current_user_role()) = 'field_surveyor'
  );

create policy surveys_select_team on public.surveys
  for select to authenticated
  using (collected_by in (select private.assigned_surveyor_ids()));

-- No INSERT policy for surveyors: surveys are created by create-survey only.

create policy surveys_update_own_pending on public.surveys
  for update to authenticated
  using (
    collected_by = (select auth.uid())
    and submission_status = 'pending'
    and (select private.current_user_role()) = 'field_surveyor'
  )
  with check (
    collected_by = (select auth.uid())
    and submission_status = 'pending'
  );

create policy surveys_admin_all on public.surveys
  for all to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));

------------------------------------------------------------------------------
-- farmers (visible when the caller can see at least one of their surveys)
------------------------------------------------------------------------------
create policy farmers_select_via_surveys on public.farmers
  for select to authenticated
  using (exists (select 1 from public.surveys s where s.farmer_id = farmers.id));

create policy farmers_admin_all on public.farmers
  for all to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));

------------------------------------------------------------------------------
-- duplicate_matches
------------------------------------------------------------------------------
-- Visible when the caller can see the survey that triggered the match
-- (surveyor: own surveys; supervisor: team surveys; admin: all).
create policy duplicate_matches_select_via_surveys on public.duplicate_matches
  for select to authenticated
  using (exists (select 1 from public.surveys s where s.id = duplicate_matches.survey_id));

create policy duplicate_matches_supervisor_review on public.duplicate_matches
  for update to authenticated
  using (
    exists (
      select 1 from public.surveys s
       where s.id = duplicate_matches.survey_id
         and s.collected_by in (select private.assigned_surveyor_ids())
    )
  )
  with check (
    exists (
      select 1 from public.surveys s
       where s.id = duplicate_matches.survey_id
         and s.collected_by in (select private.assigned_surveyor_ids())
    )
  );

create policy duplicate_matches_admin_all on public.duplicate_matches
  for all to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));

------------------------------------------------------------------------------
-- audit_logs (admins read; nobody writes directly)
------------------------------------------------------------------------------
create policy audit_logs_admin_select on public.audit_logs
  for select to authenticated
  using ((select private.is_admin()));

------------------------------------------------------------------------------
-- app_settings (active users read; admins manage)
------------------------------------------------------------------------------
create policy app_settings_select_active_users on public.app_settings
  for select to authenticated
  using ((select private.current_user_role()) is not null);

create policy app_settings_admin_all on public.app_settings
  for all to authenticated
  using ((select private.is_admin()))
  with check ((select private.is_admin()));
