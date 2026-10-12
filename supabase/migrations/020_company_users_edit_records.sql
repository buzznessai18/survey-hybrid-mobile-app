-- 020: company users ("user" role) work with records like admins.
-- They add and edit 1/14 forms + field surveys, farmers, benefit applications
-- and benefit/scheme types, verify or reject forms and review duplicates.
-- Still admin-only: user management, dashboard/analytics, reports/exports and
-- audit history (profiles, audit_logs, app_settings and crops keep their
-- admin-only policies). The legacy field_surveyor role stays read-only.

------------------------------------------------------------------------------
-- Who may change records: active admins and company users.
------------------------------------------------------------------------------
create or replace function private.can_edit_records()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(private.current_user_role() in ('admin', 'user'), false);
$$;

revoke execute on function private.can_edit_records() from public, anon;
grant execute on function private.can_edit_records() to authenticated, service_role;

------------------------------------------------------------------------------
-- Record tables: editors get the same direct access admins have.
------------------------------------------------------------------------------
drop policy if exists farmers_editors_all on public.farmers;
create policy farmers_editors_all on public.farmers
  for all to authenticated
  using ((select private.can_edit_records()))
  with check ((select private.can_edit_records()));

drop policy if exists land_records_editors_all on public.land_records;
create policy land_records_editors_all on public.land_records
  for all to authenticated
  using ((select private.can_edit_records()))
  with check ((select private.can_edit_records()));

drop policy if exists surveys_editors_all on public.surveys;
create policy surveys_editors_all on public.surveys
  for all to authenticated
  using ((select private.can_edit_records()))
  with check ((select private.can_edit_records()));

drop policy if exists duplicate_matches_editors_all on public.duplicate_matches;
create policy duplicate_matches_editors_all on public.duplicate_matches
  for all to authenticated
  using ((select private.can_edit_records()))
  with check ((select private.can_edit_records()));

drop policy if exists subsidy_schemes_editors_all on public.subsidy_schemes;
create policy subsidy_schemes_editors_all on public.subsidy_schemes
  for all to authenticated
  using ((select private.can_edit_records()))
  with check ((select private.can_edit_records()));

drop policy if exists subsidy_applications_editors_all on public.subsidy_applications;
create policy subsidy_applications_editors_all on public.subsidy_applications
  for all to authenticated
  using ((select private.can_edit_records()))
  with check ((select private.can_edit_records()));

------------------------------------------------------------------------------
-- Field photos: editors upload to their own folder.
------------------------------------------------------------------------------
drop policy if exists field_photos_insert_own on storage.objects;
drop policy if exists field_photos_update_own on storage.objects;

create policy field_photos_insert_own on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'field-photos'
    and private.is_own_photo_path(name)
    and (select private.can_edit_records())
  );

create policy field_photos_update_own on storage.objects
  for update to authenticated
  using (
    bucket_id = 'field-photos'
    and private.is_own_photo_path(name)
    and (select private.can_edit_records())
  )
  with check (bucket_id = 'field-photos' and private.is_own_photo_path(name));

------------------------------------------------------------------------------
-- Protected-column guards: editors may change what admins may.
------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION private.guard_duplicate_matches_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  if private.is_privileged_session() or private.can_edit_records() then
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
$function$;

CREATE OR REPLACE FUNCTION private.guard_land_records_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  if private.is_privileged_session() or private.can_edit_records() then
    return new;
  end if;
  if new.id is distinct from old.id or new.form_id is distinct from old.form_id
     or new.created_by is distinct from old.created_by or new.status is distinct from old.status
     or new.farmer_id is distinct from old.farmer_id or new.created_at is distinct from old.created_at then
    raise exception 'These form fields can only be changed through the app' using errcode = '42501';
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION private.guard_surveys_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  if private.is_privileged_session() or private.can_edit_records() then
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
$function$;

------------------------------------------------------------------------------
-- Create / update functions (called by Edge Functions with the service role).
------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_survey(p_actor uuid, p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
     where id = p_actor and role in ('admin', 'user') and status = 'active'
  ) then
    raise exception 'Your account cannot create surveys' using errcode = 'SV403';
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
$function$;

CREATE OR REPLACE FUNCTION public.submit_land_form(p_actor uuid, p_payload jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
     where id = p_actor and role in ('admin', 'user') and status = 'active'
  ) then
    raise exception 'Your account cannot add 1/14 forms' using errcode = 'SV403';
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
$function$;

CREATE OR REPLACE FUNCTION public.update_survey(p_actor uuid, p_survey_id uuid, p_patch jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_role   text;
  v_old    public.surveys%rowtype;
  v_new    public.surveys%rowtype;
  v_farmer uuid;
begin
  select role into v_role from public.profiles where id = p_actor and status = 'active';
  if v_role is null or v_role not in ('field_surveyor', 'admin', 'user') then
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
$function$;
