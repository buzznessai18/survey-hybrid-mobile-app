-- 009_business_functions.sql
-- Transactional business logic called by the Edge Functions.
--
-- The public.* functions here are executable ONLY by service_role. Edge
-- Functions authenticate the caller, validate input, then call these via RPC
-- passing the verified user id as p_actor. Each function runs in a single
-- transaction, so a survey, its farmer and its duplicate matches are created
-- atomically.
--
-- Custom SQLSTATEs (mapped to HTTP status codes by the Edge Functions):
--   SV403 forbidden, SV404 not found, SV409 conflict, SV422 validation error

------------------------------------------------------------------------------
-- Duplicate detection
------------------------------------------------------------------------------
-- Returns existing surveys that match the given survey number:
--   exact               same survey_number + sub_division (any distance)
--   proximity           same survey_number, different sub_division, within radius
--   exact_and_proximity both of the above
-- The radius defaults to app_settings.duplicate_radius_meters.
create or replace function public.find_survey_duplicates(
  p_survey_number     text,
  p_sub_division      text,
  p_latitude          numeric default null,
  p_longitude         numeric default null,
  p_exclude_survey_id uuid default null,
  p_radius_meters     numeric default null,
  p_limit             integer default 20
)
returns table (
  matched_survey_id uuid,
  match_type        text,
  distance_meters   numeric,
  within_radius     boolean
)
language sql
stable
set search_path = ''
as $$
  with params as (
    select
      private.normalize_code(p_survey_number) as sn,
      private.normalize_code(p_sub_division)  as sd,
      case
        when p_latitude is not null and p_longitude is not null then
          extensions.st_setsrid(
            extensions.st_makepoint(p_longitude::float8, p_latitude::float8), 4326
          )::extensions.geography
      end as pt,
      coalesce(p_radius_meters, private.duplicate_radius_meters()) as radius
  ),
  candidates as (
    select
      s.id,
      s.sub_division_norm = p.sd as is_exact,
      case when p.pt is not null then extensions.st_distance(s.location, p.pt) end as dist,
      p.radius
    from public.surveys s
    cross join params p
    where s.survey_number_norm = p.sn
      and s.submission_status <> 'rejected'
      and (p_exclude_survey_id is null or s.id <> p_exclude_survey_id)
      and (
        s.sub_division_norm = p.sd
        or (p.pt is not null and extensions.st_dwithin(s.location, p.pt, p.radius))
      )
  )
  select
    c.id,
    case
      when c.is_exact and c.dist <= c.radius then 'exact_and_proximity'
      when c.is_exact then 'exact'
      else 'proximity'
    end,
    round(c.dist::numeric, 1),
    coalesce(c.dist <= c.radius, false)
  from candidates c
  order by c.is_exact desc, c.dist asc nulls last
  limit greatest(1, least(coalesce(p_limit, 20), 100));
$$;

-- Recompute surveys.duplicate_status from its duplicate_matches.
create or replace function private.refresh_survey_duplicate_status(p_survey_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
begin
  select case
           when count(*) = 0 then 'unique'
           when bool_or(m.status = 'confirmed_duplicate') then 'confirmed_duplicate'
           when bool_or(m.status = 'needs_verification') then 'needs_verification'
           when bool_or(m.status = 'pending' and m.match_type <> 'proximity') then 'duplicate'
           when bool_or(m.status = 'pending') then 'possible_duplicate'
           else 'not_duplicate'
         end
    into v_status
    from public.duplicate_matches m
   where m.survey_id = p_survey_id;

  update public.surveys
     set duplicate_status = v_status
   where id = p_survey_id
     and duplicate_status is distinct from v_status;

  return v_status;
end;
$$;

-- Stamp reviewer + time whenever a match's status/notes change, then
-- propagate the result to the survey. Applies to every update path.
create or replace function private.duplicate_matches_review_stamp()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status is distinct from old.status or new.notes is distinct from old.notes then
    new.reviewed_by := private.current_actor();
    new.reviewed_at := now();
  end if;
  return new;
end;
$$;

create trigger duplicate_matches_review_stamp
  before update on public.duplicate_matches
  for each row execute function private.duplicate_matches_review_stamp();

create or replace function private.duplicate_matches_after_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.refresh_survey_duplicate_status(new.survey_id);
  return null;
end;
$$;

create trigger duplicate_matches_refresh_status
  after update of status on public.duplicate_matches
  for each row
  when (new.status is distinct from old.status)
  execute function private.duplicate_matches_after_change();

grant execute on function private.duplicate_matches_review_stamp() to authenticated;

------------------------------------------------------------------------------
-- Farmer resolution
------------------------------------------------------------------------------
-- Reuse the farmer if (mobile, name) already exists, otherwise create it.
-- If an explicit farmer id is supplied it must belong to the same mobile.
create or replace function private.resolve_farmer(p_actor uuid, p_farmer jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id     uuid;
  v_name   text := btrim(p_farmer ->> 'name');
  v_mobile text := btrim(p_farmer ->> 'mobile');
begin
  if coalesce(v_name, '') = '' or coalesce(v_mobile, '') = '' then
    raise exception 'farmer.name and farmer.mobile are required' using errcode = 'SV422';
  end if;

  if nullif(p_farmer ->> 'id', '') is not null then
    select f.id into v_id
      from public.farmers f
     where f.id = (p_farmer ->> 'id')::uuid and f.mobile = v_mobile;
    if v_id is null then
      raise exception 'farmer.id does not match farmer.mobile' using errcode = 'SV422';
    end if;
    return v_id;
  end if;

  insert into public.farmers (name, mobile, created_by)
  values (v_name, v_mobile, p_actor)
  on conflict (mobile, lower(name)) do update set updated_at = now()
  returning id into v_id;

  return v_id;
end;
$$;

------------------------------------------------------------------------------
-- create_survey
------------------------------------------------------------------------------
-- Idempotent: the client-generated payload.id is the idempotency key. A retry
-- with the same id returns the already-created survey (created = false).
create or replace function public.create_survey(p_actor uuid, p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id        uuid := coalesce(nullif(p_payload ->> 'id', '')::uuid, gen_random_uuid());
  v_sn        text := btrim(p_payload ->> 'survey_number');
  v_sd        text := nullif(btrim(coalesce(p_payload ->> 'sub_division', '')), '');
  v_lat       numeric := (p_payload ->> 'latitude')::numeric;
  v_lng       numeric := (p_payload ->> 'longitude')::numeric;
  v_crop_id   uuid := (p_payload ->> 'crop_id')::uuid;
  v_owner     uuid;
  v_farmer_id uuid;
  v_matches   jsonb;
  v_status    text;
begin
  if not exists (
    select 1 from public.profiles
     where id = p_actor and role = 'field_surveyor' and status = 'active'
  ) then
    raise exception 'Only active field surveyors can create surveys' using errcode = 'SV403';
  end if;

  perform set_config('app.actor_id', p_actor::text, true);

  -- Serialise concurrent submissions of the same survey number so that each
  -- one sees the other during duplicate detection.
  perform pg_advisory_xact_lock(hashtextextended('survey-number:' || private.normalize_code(v_sn), 0));

  -- Idempotency check.
  select collected_by into v_owner from public.surveys where id = v_id;
  if found then
    if v_owner <> p_actor then
      raise exception 'This survey id is already in use' using errcode = 'SV409';
    end if;
    return jsonb_build_object('id', v_id, 'created', false);
  end if;

  if not exists (select 1 from public.crops where id = v_crop_id and status = 'active') then
    raise exception 'crop_id is not an active crop' using errcode = 'SV422';
  end if;

  v_farmer_id := private.resolve_farmer(p_actor, p_payload -> 'farmer');

  select coalesce(jsonb_agg(to_jsonb(d)), '[]'::jsonb)
    into v_matches
    from public.find_survey_duplicates(v_sn, v_sd, v_lat, v_lng, v_id) d;

  v_status := case
    when exists (select 1 from jsonb_array_elements(v_matches) m where m ->> 'match_type' <> 'proximity') then 'duplicate'
    when jsonb_array_length(v_matches) > 0 then 'possible_duplicate'
    else 'unique'
  end;

  insert into public.surveys (
    id, farmer_id, crop_id, area, area_unit, survey_number, sub_division,
    visit_date, collected_by, latitude, longitude, gps_accuracy, photo_path,
    duplicate_status, duplicate_reason, duplicate_reason_notes, notes
  ) values (
    v_id, v_farmer_id, v_crop_id,
    (p_payload ->> 'area')::numeric,
    p_payload ->> 'area_unit',
    v_sn, v_sd,
    (p_payload ->> 'visit_date')::date,
    p_actor, v_lat, v_lng,
    (p_payload ->> 'gps_accuracy')::numeric,
    nullif(p_payload ->> 'photo_path', ''),
    v_status,
    nullif(p_payload ->> 'duplicate_reason', ''),
    nullif(btrim(p_payload ->> 'duplicate_reason_notes'), ''),
    nullif(btrim(p_payload ->> 'notes'), '')
  )
  on conflict (id) do nothing;

  if not found then
    -- Lost a race with a concurrent retry that used a different survey number.
    select collected_by into v_owner from public.surveys where id = v_id;
    if v_owner is distinct from p_actor then
      raise exception 'This survey id is already in use' using errcode = 'SV409';
    end if;
    return jsonb_build_object('id', v_id, 'created', false);
  end if;

  insert into public.duplicate_matches (survey_id, matched_survey_id, match_type, distance_meters)
  select v_id, m.matched_survey_id, m.match_type, m.distance_meters
    from jsonb_to_recordset(v_matches)
         as m(matched_survey_id uuid, match_type text, distance_meters numeric);

  return jsonb_build_object('id', v_id, 'created', true);
end;
$$;

------------------------------------------------------------------------------
-- update_survey
------------------------------------------------------------------------------
-- Surveyors: own surveys while submission_status = 'pending'. Admins: any.
-- Only keys present in p_patch are changed. If survey number, sub-division or
-- GPS change, duplicate detection is re-run (reviewed matches are kept).
create or replace function public.update_survey(p_actor uuid, p_survey_id uuid, p_patch jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role   text;
  v_old    public.surveys%rowtype;
  v_new    public.surveys%rowtype;
  v_farmer uuid;
begin
  select role into v_role from public.profiles where id = p_actor and status = 'active';
  if v_role is null or v_role not in ('field_surveyor', 'admin') then
    raise exception 'Not allowed to update surveys' using errcode = 'SV403';
  end if;

  perform set_config('app.actor_id', p_actor::text, true);

  select * into v_old from public.surveys where id = p_survey_id for update;
  if not found then
    raise exception 'Survey not found' using errcode = 'SV404';
  end if;
  if v_role = 'field_surveyor' then
    if v_old.collected_by <> p_actor then
      raise exception 'Survey not found' using errcode = 'SV404';
    end if;
    if v_old.submission_status <> 'pending' then
      raise exception 'Only pending surveys can be edited' using errcode = 'SV409';
    end if;
    if p_patch ? 'submission_status' then
      raise exception 'submission_status cannot be changed by a field surveyor' using errcode = 'SV403';
    end if;
  end if;

  if p_patch ? 'crop_id'
     and not exists (select 1 from public.crops where id = (p_patch ->> 'crop_id')::uuid and status = 'active') then
    raise exception 'crop_id is not an active crop' using errcode = 'SV422';
  end if;

  if p_patch ? 'farmer' then
    v_farmer := private.resolve_farmer(v_old.collected_by, p_patch -> 'farmer');
  end if;

  if p_patch ? 'survey_number' then
    perform pg_advisory_xact_lock(
      hashtextextended('survey-number:' || private.normalize_code(p_patch ->> 'survey_number'), 0));
  end if;

  update public.surveys s set
    farmer_id              = coalesce(v_farmer, s.farmer_id),
    crop_id                = case when p_patch ? 'crop_id' then (p_patch ->> 'crop_id')::uuid else s.crop_id end,
    area                   = case when p_patch ? 'area' then (p_patch ->> 'area')::numeric else s.area end,
    area_unit              = case when p_patch ? 'area_unit' then p_patch ->> 'area_unit' else s.area_unit end,
    survey_number          = case when p_patch ? 'survey_number' then btrim(p_patch ->> 'survey_number') else s.survey_number end,
    sub_division           = case when p_patch ? 'sub_division' then nullif(btrim(coalesce(p_patch ->> 'sub_division', '')), '') else s.sub_division end,
    visit_date             = case when p_patch ? 'visit_date' then (p_patch ->> 'visit_date')::date else s.visit_date end,
    latitude               = case when p_patch ? 'latitude' then (p_patch ->> 'latitude')::numeric else s.latitude end,
    longitude              = case when p_patch ? 'longitude' then (p_patch ->> 'longitude')::numeric else s.longitude end,
    gps_accuracy           = case when p_patch ? 'gps_accuracy' then (p_patch ->> 'gps_accuracy')::numeric else s.gps_accuracy end,
    photo_path             = case when p_patch ? 'photo_path' then nullif(p_patch ->> 'photo_path', '') else s.photo_path end,
    duplicate_reason       = case when p_patch ? 'duplicate_reason' then nullif(p_patch ->> 'duplicate_reason', '') else s.duplicate_reason end,
    duplicate_reason_notes = case when p_patch ? 'duplicate_reason_notes' then nullif(btrim(p_patch ->> 'duplicate_reason_notes'), '') else s.duplicate_reason_notes end,
    notes                  = case when p_patch ? 'notes' then nullif(btrim(p_patch ->> 'notes'), '') else s.notes end,
    submission_status      = case when p_patch ? 'submission_status' then p_patch ->> 'submission_status' else s.submission_status end
  where s.id = p_survey_id
  returning * into v_new;

  if v_new.survey_number_norm is distinct from v_old.survey_number_norm
     or v_new.sub_division_norm is distinct from v_old.sub_division_norm
     or v_new.latitude is distinct from v_old.latitude
     or v_new.longitude is distinct from v_old.longitude then
    -- Drop unreviewed matches and detect again; keep reviewed history.
    delete from public.duplicate_matches where survey_id = p_survey_id and status = 'pending';

    insert into public.duplicate_matches (survey_id, matched_survey_id, match_type, distance_meters)
    select p_survey_id, d.matched_survey_id, d.match_type, d.distance_meters
      from public.find_survey_duplicates(
             v_new.survey_number, v_new.sub_division, v_new.latitude, v_new.longitude, p_survey_id) d
    on conflict (survey_id, matched_survey_id) do nothing;

    perform private.refresh_survey_duplicate_status(p_survey_id);
  end if;

  return jsonb_build_object('id', p_survey_id, 'updated', true);
end;
$$;

------------------------------------------------------------------------------
-- admin_update_profile
------------------------------------------------------------------------------
create or replace function public.admin_update_profile(p_actor uuid, p_user_id uuid, p_changes jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_target public.profiles%rowtype;
  v_role   text;
  v_sup    uuid;
  v_result public.profiles%rowtype;
begin
  if not exists (select 1 from public.profiles where id = p_actor and role = 'admin' and status = 'active') then
    raise exception 'Admin access required' using errcode = 'SV403';
  end if;

  perform set_config('app.actor_id', p_actor::text, true);

  select * into v_target from public.profiles where id = p_user_id for update;
  if not found then
    raise exception 'User not found' using errcode = 'SV404';
  end if;

  if p_user_id = p_actor
     and ((p_changes ? 'role' and p_changes ->> 'role' <> 'admin')
          or (p_changes ? 'status' and p_changes ->> 'status' <> 'active')) then
    raise exception 'Admins cannot demote or deactivate themselves' using errcode = 'SV409';
  end if;

  v_role := coalesce(p_changes ->> 'role', v_target.role);

  if p_changes ? 'supervisor_id' then
    v_sup := nullif(p_changes ->> 'supervisor_id', '')::uuid;
  else
    v_sup := v_target.supervisor_id;
  end if;

  if v_role <> 'field_surveyor' then
    v_sup := null;
  elsif v_sup is not null and not exists (
    select 1 from public.profiles where id = v_sup and role = 'supervisor'
  ) then
    raise exception 'supervisor_id must reference a supervisor' using errcode = 'SV422';
  end if;

  update public.profiles p set
    role          = v_role,
    status        = coalesce(p_changes ->> 'status', p.status),
    supervisor_id = v_sup,
    full_name     = coalesce(nullif(btrim(p_changes ->> 'full_name'), ''), p.full_name),
    mobile        = case when p_changes ? 'mobile' then nullif(btrim(p_changes ->> 'mobile'), '') else p.mobile end
  where p.id = p_user_id
  returning * into v_result;

  -- A supervisor who stops being a supervisor no longer owns a team.
  if v_target.role = 'supervisor' and v_role <> 'supervisor' then
    update public.profiles set supervisor_id = null where supervisor_id = p_user_id;
  end if;

  return to_jsonb(v_result);
end;
$$;

------------------------------------------------------------------------------
-- Privileges: service_role only
------------------------------------------------------------------------------
revoke execute on function public.find_survey_duplicates(text, text, numeric, numeric, uuid, numeric, integer) from public, anon, authenticated;
revoke execute on function public.create_survey(uuid, jsonb) from public, anon, authenticated;
revoke execute on function public.update_survey(uuid, uuid, jsonb) from public, anon, authenticated;
revoke execute on function public.admin_update_profile(uuid, uuid, jsonb) from public, anon, authenticated;
revoke execute on function private.refresh_survey_duplicate_status(uuid) from public, anon, authenticated;
revoke execute on function private.resolve_farmer(uuid, jsonb) from public, anon, authenticated;

grant execute on function public.find_survey_duplicates(text, text, numeric, numeric, uuid, numeric, integer) to service_role;
grant execute on function public.create_survey(uuid, jsonb) to service_role;
grant execute on function public.update_survey(uuid, uuid, jsonb) to service_role;
grant execute on function public.admin_update_profile(uuid, uuid, jsonb) to service_role;
