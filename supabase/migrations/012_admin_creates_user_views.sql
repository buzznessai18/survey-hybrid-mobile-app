-- 012_admin_creates_user_views.sql
-- Role model change:
--   * admin : the only role that creates surveys (and manages accounts)
--   * user  : NEW read-only role — can search / view / map ALL surveys
--   * field_surveyor / supervisor are kept for compatibility but surveyors
--     can no longer create surveys.

------------------------------------------------------------------------------
-- New role
------------------------------------------------------------------------------
alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles
  add constraint profiles_role_check check (role in ('field_surveyor', 'supervisor', 'admin', 'user'));

------------------------------------------------------------------------------
-- Read access for users: every survey (and, through the existing
-- "via surveys" policies, the related farmers and duplicate matches).
------------------------------------------------------------------------------
create policy surveys_select_users on public.surveys
  for select to authenticated
  using ((select private.current_user_role()) = 'user');

-- Everyone signed in may see admins' profiles, so "Added by" names resolve.
create policy profiles_select_admins on public.profiles
  for select to authenticated
  using (role = 'admin' and (select private.current_user_role()) is not null);

------------------------------------------------------------------------------
-- Photo uploads: admins only (they are the ones creating surveys)
------------------------------------------------------------------------------
drop policy if exists field_photos_insert_own on storage.objects;
drop policy if exists field_photos_update_own on storage.objects;

create policy field_photos_insert_own on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'field-photos'
    and private.is_own_photo_path(name)
    and (select private.current_user_role()) = 'admin'
  );

create policy field_photos_update_own on storage.objects
  for update to authenticated
  using (
    bucket_id = 'field-photos'
    and private.is_own_photo_path(name)
    and (select private.current_user_role()) = 'admin'
  )
  with check (
    bucket_id = 'field-photos'
    and private.is_own_photo_path(name)
  );

------------------------------------------------------------------------------
-- create_survey: only active admins may create surveys.
-- (Same body as 009 except the role check.)
------------------------------------------------------------------------------
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
     where id = p_actor and role = 'admin' and status = 'active'
  ) then
    raise exception 'Only active admins can create surveys' using errcode = 'SV403';
  end if;

  perform set_config('app.actor_id', p_actor::text, true);

  perform pg_advisory_xact_lock(hashtextextended('survey-number:' || private.normalize_code(v_sn), 0));

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

revoke execute on function public.create_survey(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.create_survey(uuid, jsonb) to service_role;

------------------------------------------------------------------------------
-- Editing: the update-survey Edge Function now admits admins only, and
-- surveyors lose their direct-edit policy (they no longer own surveys).
------------------------------------------------------------------------------
drop policy if exists surveys_update_own_pending on public.surveys;
