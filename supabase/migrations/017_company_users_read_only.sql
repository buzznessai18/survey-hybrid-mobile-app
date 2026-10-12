-- 017_company_users_read_only.sql
-- Company-operated model: farmers are not app users. App users are
--   * admin         — full access: farmers, surveys, 1/14 forms, benefits, duplicates, users, reports.
--   * user          — "Company User": READ-ONLY. Searches and views records through Edge Functions
--                     (service role after authorization, as in 014); no table write access at all.
-- field_surveyor accounts become company users; the role value is kept only for compatibility.
-- Also: benefit categories on schemes (tractor, equipment, cylinder, services, ...).

------------------------------------------------------------------------------
-- Roles
------------------------------------------------------------------------------
update public.profiles set role = 'user' where role = 'field_surveyor';
alter table public.profiles alter column role set default 'user';

------------------------------------------------------------------------------
-- Writes are admin-only (database level, not just the UI)
------------------------------------------------------------------------------
drop policy if exists land_records_update_own_pending on public.land_records;
drop policy if exists land_records_select_own on public.land_records;
drop policy if exists surveys_update_own_pending on public.surveys;

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
  with check (bucket_id = 'field-photos' and private.is_own_photo_path(name));

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
  v_land      uuid := nullif(p_payload ->> 'land_record_id', '')::uuid;
  v_owner     uuid;
  v_farmer_id uuid;
  v_matches   jsonb;
  v_status    text;
begin
  if not exists (
    select 1 from public.profiles
     where id = p_actor and role = 'admin' and status = 'active'
  ) then
    raise exception 'Only admins can create surveys' using errcode = 'SV403';
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
  if v_land is not null and not exists (select 1 from public.land_records where id = v_land) then
    raise exception 'land_record_id not found' using errcode = 'SV422';
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
    duplicate_status, duplicate_reason, duplicate_reason_notes, notes, land_record_id
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
    nullif(btrim(p_payload ->> 'notes'), ''),
    v_land
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

create or replace function public.submit_land_form(p_actor uuid, p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_form    jsonb := p_payload -> 'form';
  v_survey  jsonb := p_payload -> 'survey';
  v_id      uuid := coalesce(nullif(v_form ->> 'id', '')::uuid, gen_random_uuid());
  v_owner   uuid;
  v_farmer  uuid;
  v_created boolean := true;
  v_survey_result jsonb := null;
begin
  if not exists (
    select 1 from public.profiles
     where id = p_actor and role = 'admin' and status = 'active'
  ) then
    raise exception 'Only admins can add 1/14 forms' using errcode = 'SV403';
  end if;
  perform set_config('app.actor_id', p_actor::text, true);
  perform pg_advisory_xact_lock(hashtextextended('land-form:' || v_id::text, 0));

  select created_by into v_owner from public.land_records where id = v_id;
  if found then
    if v_owner <> p_actor then
      raise exception 'This form id is already in use' using errcode = 'SV409';
    end if;
    v_created := false;
  else
    v_farmer := private.resolve_farmer(p_actor, p_payload -> 'farmer');
    insert into public.land_records (
      id, farmer_id, village, taluka, survey_number, sub_division, occupant_names, tenant_name,
      area_sq_m, land_class, assessment_rs, kharif_crop_id, rabi_crop_id, irrigation_source,
      mutation_number, remarks, created_by
    ) values (
      v_id, v_farmer,
      btrim(v_form ->> 'village'), v_form ->> 'taluka',
      btrim(v_form ->> 'survey_number'), nullif(btrim(coalesce(v_form ->> 'sub_division', '')), ''),
      btrim(v_form ->> 'occupant_names'), nullif(btrim(coalesce(v_form ->> 'tenant_name', '')), ''),
      (v_form ->> 'area_sq_m')::numeric, v_form ->> 'land_class',
      nullif(v_form ->> 'assessment_rs', '')::numeric,
      nullif(v_form ->> 'kharif_crop_id', '')::uuid, nullif(v_form ->> 'rabi_crop_id', '')::uuid,
      coalesce(nullif(v_form ->> 'irrigation_source', ''), 'rainfed'),
      nullif(btrim(coalesce(v_form ->> 'mutation_number', '')), ''),
      nullif(btrim(coalesce(v_form ->> 'remarks', '')), ''),
      p_actor
    );
  end if;

  -- The field survey of the same plot (GPS + photo + crop), if captured.
  if v_survey is not null and jsonb_typeof(v_survey) = 'object' then
    select farmer_id into v_farmer from public.land_records where id = v_id;
    v_survey_result := public.create_survey(
      p_actor,
      v_survey || jsonb_build_object(
        'land_record_id', v_id,
        'farmer', jsonb_build_object('id', v_farmer),
        'survey_number', (select survey_number from public.land_records where id = v_id),
        'sub_division', (select sub_division from public.land_records where id = v_id)
      )
    );
  end if;

  return jsonb_build_object('id', v_id, 'created', v_created, 'survey', v_survey_result);
end;
$$;

revoke execute on function public.submit_land_form(uuid, jsonb) from public, anon, authenticated;
revoke execute on function public.create_survey(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.submit_land_form(uuid, jsonb) to service_role;
grant execute on function public.create_survey(uuid, jsonb) to service_role;

------------------------------------------------------------------------------
-- Benefit / service categories (existing schemes + applications model)
--   application status: applied / under_review / approved = pending,
--                       disbursed = received, rejected.
------------------------------------------------------------------------------
alter table public.subsidy_schemes
  add column if not exists category text not null default 'subsidy'
    check (category in ('subsidy', 'tractor', 'equipment', 'cylinder', 'government_scheme', 'service', 'other'));

create index if not exists subsidy_schemes_category_idx on public.subsidy_schemes (category);
