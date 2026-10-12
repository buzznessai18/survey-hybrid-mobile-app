-- 015_forms_farmers_schemes.sql
-- Field-survey + land-record + subsidy platform.
--
--   * Field survey users (role field_surveyor) sign in and create 1/14 forms
--     and field surveys again; admins see and manage everything.
--   * farmers gain profile fields (village, taluka, category, ...).
--   * land_records  = Goa "Form I & XIV" (1/14 extract) per survey no./sub-div.
--   * surveys.land_record_id links a field survey (GPS/photo) to its 1/14 form.
--   * subsidy_schemes (configurable eligibility rules) + subsidy_applications.
--   * Audit coverage for all of the above.
-- Reads for non-admins go through Edge Functions (service role) as in 014.

------------------------------------------------------------------------------
-- Reference values
------------------------------------------------------------------------------
create or replace function private.goa_talukas()
returns text[]
language sql
immutable
set search_path = ''
as $$
  select array['Bardez','Bicholim','Canacona','Dharbandora','Mormugao','Pernem',
               'Ponda','Quepem','Salcete','Sanguem','Sattari','Tiswadi'];
$$;

------------------------------------------------------------------------------
-- Farmers: profile fields
------------------------------------------------------------------------------
alter table public.farmers
  add column if not exists father_name text check (father_name is null or char_length(father_name) <= 150),
  add column if not exists gender text check (gender is null or gender in ('male', 'female', 'other')),
  add column if not exists category text check (category is null or category in ('general', 'obc', 'sc', 'st')),
  add column if not exists village text check (village is null or char_length(village) <= 100),
  add column if not exists taluka text,
  add column if not exists address text check (address is null or char_length(address) <= 500),
  add column if not exists notes text check (notes is null or char_length(notes) <= 2000);

alter table public.farmers drop constraint if exists farmers_taluka_check;
alter table public.farmers add constraint farmers_taluka_check
  check (taluka is null or taluka = any (private.goa_talukas()));

create index if not exists farmers_village_idx on public.farmers (lower(village));
create index if not exists farmers_taluka_idx on public.farmers (taluka);

------------------------------------------------------------------------------
-- 1/14 forms (land records)
------------------------------------------------------------------------------
create sequence if not exists public.land_record_code_seq;

create or replace function private.next_land_record_code()
returns text
language plpgsql
volatile
set search_path = ''
as $$
declare
  n bigint := nextval('public.land_record_code_seq');
begin
  return 'LR-' || lpad(n::text, greatest(6, length(n::text)), '0');
end;
$$;

create table if not exists public.land_records (
  id                 uuid primary key default gen_random_uuid(),  -- client-generated (idempotency)
  form_id            text not null unique default private.next_land_record_code(),
  farmer_id          uuid not null references public.farmers (id) on delete restrict,
  village            text not null check (char_length(btrim(village)) between 1 and 100),
  taluka             text not null,
  survey_number      text not null check (char_length(btrim(survey_number)) between 1 and 50),
  sub_division       text check (sub_division is null or char_length(btrim(sub_division)) between 1 and 50),
  survey_number_norm text generated always as (private.normalize_code(survey_number)) stored,
  sub_division_norm  text generated always as (private.normalize_code(sub_division)) stored,
  occupant_names     text not null check (char_length(btrim(occupant_names)) between 1 and 500),
  tenant_name        text check (tenant_name is null or char_length(tenant_name) <= 200),
  area_sq_m          numeric(14, 2) not null check (area_sq_m > 0 and area_sq_m <= 100000000),
  land_class         text not null check (land_class in ('dry', 'garden', 'paddy', 'khazan', 'morad', 'forest', 'other')),
  assessment_rs      numeric(12, 2) check (assessment_rs is null or assessment_rs >= 0),
  kharif_crop_id     uuid references public.crops (id) on delete set null,
  rabi_crop_id       uuid references public.crops (id) on delete set null,
  irrigation_source  text not null default 'rainfed'
                     check (irrigation_source in ('rainfed', 'well', 'borewell', 'canal', 'river', 'tank', 'other')),
  mutation_number    text check (mutation_number is null or char_length(mutation_number) <= 50),
  remarks            text check (remarks is null or char_length(remarks) <= 2000),
  status             text not null default 'pending' check (status in ('pending', 'verified', 'rejected')),
  created_by         uuid not null references public.profiles (id) on delete restrict,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint land_records_taluka_check check (taluka = any (private.goa_talukas()))
);

comment on table public.land_records is 'Goa Form I & XIV (1/14) land records; created via the land-records Edge Function.';

create index if not exists land_records_farmer_idx on public.land_records (farmer_id);
create index if not exists land_records_survey_idx on public.land_records (survey_number_norm, sub_division_norm);
create index if not exists land_records_village_idx on public.land_records (lower(village));
create index if not exists land_records_status_idx on public.land_records (status);
create index if not exists land_records_created_by_idx on public.land_records (created_by, created_at desc);

create trigger land_records_set_updated_at
  before update on public.land_records
  for each row execute function private.set_updated_at();

-- Link field surveys to their 1/14 form.
alter table public.surveys
  add column if not exists land_record_id uuid references public.land_records (id) on delete set null;
create index if not exists surveys_land_record_idx on public.surveys (land_record_id);

------------------------------------------------------------------------------
-- Subsidy schemes & applications
------------------------------------------------------------------------------
create table if not exists public.subsidy_schemes (
  id              uuid primary key default gen_random_uuid(),
  code            text not null unique check (code ~ '^[A-Z0-9-]{2,30}$'),
  name            text not null check (char_length(btrim(name)) between 1 and 150),
  department      text check (department is null or char_length(department) <= 150),
  description     text check (description is null or char_length(description) <= 2000),
  benefit         text check (benefit is null or char_length(benefit) <= 500),
  subsidy_percent numeric(5, 2) check (subsidy_percent is null or subsidy_percent between 0 and 100),
  max_amount_rs   numeric(14, 2) check (max_amount_rs is null or max_amount_rs >= 0),
  -- Eligibility rules (all optional):
  --   min_land_sq_m, max_land_sq_m          numbers  (total land on the farmer's 1/14 forms)
  --   eligible_crop_ids                     uuid[]   (grown on any of the farmer's land)
  --   eligible_talukas                      text[]
  --   eligible_categories                   text[]   (general / obc / sc / st)
  --   cooldown_years                        number   (no approved/disbursed application of this scheme within N years)
  --   max_applications_per_farmer           number
  --   require_verified_land                 boolean  (only verified 1/14 forms count)
  rules           jsonb not null default '{}'::jsonb check (jsonb_typeof(rules) = 'object'),
  status          text not null default 'active' check (status in ('active', 'inactive')),
  valid_until     date,
  created_by      uuid references public.profiles (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create trigger subsidy_schemes_set_updated_at
  before update on public.subsidy_schemes
  for each row execute function private.set_updated_at();

create sequence if not exists public.subsidy_application_code_seq;

create or replace function private.next_application_code()
returns text
language plpgsql
volatile
set search_path = ''
as $$
declare
  n bigint := nextval('public.subsidy_application_code_seq');
begin
  return 'SA-' || lpad(n::text, greatest(6, length(n::text)), '0');
end;
$$;

create table if not exists public.subsidy_applications (
  id             uuid primary key default gen_random_uuid(),
  application_no text not null unique default private.next_application_code(),
  farmer_id      uuid not null references public.farmers (id) on delete restrict,
  scheme_id      uuid not null references public.subsidy_schemes (id) on delete restrict,
  land_record_id uuid references public.land_records (id) on delete set null,
  status         text not null default 'applied'
                 check (status in ('applied', 'under_review', 'approved', 'rejected', 'disbursed')),
  amount_rs      numeric(14, 2) check (amount_rs is null or amount_rs >= 0),
  applied_on     date not null default current_date,
  decided_at     timestamptz,
  remarks        text check (remarks is null or char_length(remarks) <= 2000),
  created_by     uuid references public.profiles (id) on delete set null,
  updated_by     uuid references public.profiles (id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists subsidy_applications_farmer_idx on public.subsidy_applications (farmer_id, applied_on desc);
create index if not exists subsidy_applications_scheme_idx on public.subsidy_applications (scheme_id, status);

create trigger subsidy_applications_set_updated_at
  before update on public.subsidy_applications
  for each row execute function private.set_updated_at();

------------------------------------------------------------------------------
-- RLS: admins manage everything directly; everyone else goes through the
-- Edge Functions (service role) which apply their own role checks.
------------------------------------------------------------------------------
alter table public.land_records enable row level security;
alter table public.subsidy_schemes enable row level security;
alter table public.subsidy_applications enable row level security;

grant select, insert, update, delete on public.land_records, public.subsidy_schemes, public.subsidy_applications to authenticated;
grant select, insert, update, delete on public.land_records, public.subsidy_schemes, public.subsidy_applications to service_role;
grant usage, select on all sequences in schema public to authenticated, service_role;
revoke all on public.land_records, public.subsidy_schemes, public.subsidy_applications from anon;

create policy land_records_admin_all on public.land_records for all to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));
create policy subsidy_schemes_admin_all on public.subsidy_schemes for all to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));
create policy subsidy_applications_admin_all on public.subsidy_applications for all to authenticated
  using ((select private.is_admin())) with check ((select private.is_admin()));

------------------------------------------------------------------------------
-- Field surveyors create surveys and photos again (reverts 012's admin-only)
------------------------------------------------------------------------------
drop policy if exists field_photos_insert_own on storage.objects;
drop policy if exists field_photos_update_own on storage.objects;

create policy field_photos_insert_own on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'field-photos'
    and private.is_own_photo_path(name)
    and (select private.current_user_role()) in ('admin', 'field_surveyor')
  );

create policy field_photos_update_own on storage.objects
  for update to authenticated
  using (
    bucket_id = 'field-photos'
    and private.is_own_photo_path(name)
    and (select private.current_user_role()) in ('admin', 'field_surveyor')
  )
  with check (bucket_id = 'field-photos' and private.is_own_photo_path(name));

------------------------------------------------------------------------------
-- Farmer resolution with profile fields
------------------------------------------------------------------------------
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
  if nullif(p_farmer ->> 'id', '') is not null then
    select f.id into v_id from public.farmers f where f.id = (p_farmer ->> 'id')::uuid;
    if v_id is null then
      raise exception 'Farmer not found' using errcode = 'SV422';
    end if;
  else
    if coalesce(v_name, '') = '' or coalesce(v_mobile, '') = '' then
      raise exception 'farmer.name and farmer.mobile are required' using errcode = 'SV422';
    end if;
    insert into public.farmers (name, mobile, created_by)
    values (v_name, v_mobile, p_actor)
    on conflict (mobile, lower(name)) do update set updated_at = now()
    returning id into v_id;
  end if;

  -- Fill profile fields that are provided and not yet known.
  update public.farmers f set
    father_name = coalesce(f.father_name, nullif(btrim(p_farmer ->> 'father_name'), '')),
    gender      = coalesce(f.gender, nullif(p_farmer ->> 'gender', '')),
    category    = coalesce(f.category, nullif(p_farmer ->> 'category', '')),
    village     = coalesce(f.village, nullif(btrim(p_farmer ->> 'village'), '')),
    taluka      = coalesce(f.taluka, nullif(p_farmer ->> 'taluka', '')),
    address     = coalesce(f.address, nullif(btrim(p_farmer ->> 'address'), ''))
  where f.id = v_id
    and (f.father_name is null or f.gender is null or f.category is null
         or f.village is null or f.taluka is null or f.address is null);

  return v_id;
end;
$$;

------------------------------------------------------------------------------
-- create_survey: field surveyors + admins; optional land_record_id link
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
  v_land      uuid := nullif(p_payload ->> 'land_record_id', '')::uuid;
  v_owner     uuid;
  v_farmer_id uuid;
  v_matches   jsonb;
  v_status    text;
begin
  if not exists (
    select 1 from public.profiles
     where id = p_actor and role in ('admin', 'field_surveyor') and status = 'active'
  ) then
    raise exception 'Only active field survey users or admins can create surveys' using errcode = 'SV403';
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

------------------------------------------------------------------------------
-- submit_land_form: 1/14 form + (optional) field survey in ONE transaction.
-- Idempotent on the client-generated form id.
------------------------------------------------------------------------------
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
     where id = p_actor and role in ('admin', 'field_surveyor') and status = 'active'
  ) then
    raise exception 'Only active field survey users or admins can submit forms' using errcode = 'SV403';
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

------------------------------------------------------------------------------
-- Scheme eligibility engine
------------------------------------------------------------------------------
create or replace function public.evaluate_scheme_eligibility(p_farmer_id uuid, p_scheme_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  s        public.subsidy_schemes%rowtype;
  f        public.farmers%rowtype;
  r        jsonb;
  checks   jsonb := '[]'::jsonb;
  land     numeric;
  crops    uuid[];
  talukas  text[];
  last_ok  date;
  n_apps   int;
  wanted   jsonb;
  passed   boolean;
begin
  select * into s from public.subsidy_schemes where id = p_scheme_id;
  select * into f from public.farmers where id = p_farmer_id;
  if s.id is null or f.id is null then
    raise exception 'Farmer or scheme not found' using errcode = 'SV404';
  end if;
  r := s.rules;

  select coalesce(sum(area_sq_m), 0) into land
    from public.land_records
   where farmer_id = f.id
     and status <> 'rejected'
     and (not coalesce((r ->> 'require_verified_land')::boolean, false) or status = 'verified');

  select array_agg(distinct c) into crops from (
    select kharif_crop_id c from public.land_records where farmer_id = f.id and status <> 'rejected'
    union select rabi_crop_id from public.land_records where farmer_id = f.id and status <> 'rejected'
    union select crop_id from public.surveys where farmer_id = f.id and submission_status <> 'rejected'
  ) x where c is not null;

  select array_agg(distinct t) into talukas from (
    select f.taluka t union select taluka from public.land_records where farmer_id = f.id
  ) x where t is not null;

  if s.status <> 'active' or (s.valid_until is not null and s.valid_until < current_date) then
    checks := checks || jsonb_build_object('rule', 'active', 'label', 'Scheme is open', 'passed', false,
      'detail', 'This scheme is not currently accepting applications');
  end if;

  if r ? 'min_land_sq_m' then
    passed := land >= (r ->> 'min_land_sq_m')::numeric;
    checks := checks || jsonb_build_object('rule', 'min_land', 'label', 'Minimum land holding', 'passed', passed,
      'detail', format('Needs at least %s sq.m; farmer has %s sq.m', r ->> 'min_land_sq_m', round(land)));
  end if;
  if r ? 'max_land_sq_m' then
    passed := land <= (r ->> 'max_land_sq_m')::numeric and land > 0;
    checks := checks || jsonb_build_object('rule', 'max_land', 'label', 'Maximum land holding', 'passed', passed,
      'detail', format('At most %s sq.m; farmer has %s sq.m', r ->> 'max_land_sq_m', round(land)));
  end if;

  wanted := r -> 'eligible_crop_ids';
  if wanted is not null and jsonb_array_length(wanted) > 0 then
    passed := exists (select 1 from jsonb_array_elements_text(wanted) w where w::uuid = any (coalesce(crops, '{}')));
    checks := checks || jsonb_build_object('rule', 'crops', 'label', 'Grows an eligible crop', 'passed', passed,
      'detail', (select 'Eligible: ' || string_agg(c.name, ', ' order by c.name)
                   from public.crops c where c.id::text in (select jsonb_array_elements_text(wanted))));
  end if;

  wanted := r -> 'eligible_talukas';
  if wanted is not null and jsonb_array_length(wanted) > 0 then
    passed := exists (select 1 from jsonb_array_elements_text(wanted) w where w = any (coalesce(talukas, '{}')));
    checks := checks || jsonb_build_object('rule', 'taluka', 'label', 'Land in an eligible taluka', 'passed', passed,
      'detail', 'Eligible: ' || (select string_agg(w, ', ') from jsonb_array_elements_text(wanted) w));
  end if;

  wanted := r -> 'eligible_categories';
  if wanted is not null and jsonb_array_length(wanted) > 0 then
    passed := f.category is not null and exists (select 1 from jsonb_array_elements_text(wanted) w where w = f.category);
    checks := checks || jsonb_build_object('rule', 'category', 'label', 'Eligible social category', 'passed', passed,
      'detail', format('Eligible: %s; farmer: %s',
        (select upper(string_agg(w, ', ')) from jsonb_array_elements_text(wanted) w), coalesce(upper(f.category), 'not recorded')));
  end if;

  if r ? 'cooldown_years' then
    select max(applied_on) into last_ok from public.subsidy_applications
     where farmer_id = f.id and scheme_id = s.id and status in ('approved', 'disbursed');
    passed := last_ok is null or last_ok < (current_date - make_interval(years => (r ->> 'cooldown_years')::int))::date;
    checks := checks || jsonb_build_object('rule', 'cooldown', 'label', 'No recent benefit under this scheme', 'passed', passed,
      'detail', case when last_ok is null then 'No previous benefit'
                     else format('Last benefit on %s (waiting period %s years)', to_char(last_ok, 'DD Mon YYYY'), r ->> 'cooldown_years') end);
  end if;

  if r ? 'max_applications_per_farmer' then
    select count(*) into n_apps from public.subsidy_applications
     where farmer_id = f.id and scheme_id = s.id and status <> 'rejected';
    passed := n_apps < (r ->> 'max_applications_per_farmer')::int;
    checks := checks || jsonb_build_object('rule', 'max_applications', 'label', 'Application limit', 'passed', passed,
      'detail', format('%s of %s allowed applications used', n_apps, r ->> 'max_applications_per_farmer'));
  end if;

  if f.id is not null and land = 0 then
    checks := checks || jsonb_build_object('rule', 'land_record', 'label', 'Has a 1/14 land record', 'passed', false,
      'detail', 'No 1/14 form recorded for this farmer');
  end if;

  return jsonb_build_object(
    'scheme_id', s.id, 'scheme_code', s.code, 'scheme_name', s.name,
    'eligible', not exists (select 1 from jsonb_array_elements(checks) c where not (c ->> 'passed')::boolean),
    'land_sq_m', land,
    'checks', checks
  );
end;
$$;

revoke execute on function public.submit_land_form(uuid, jsonb) from public, anon, authenticated;
revoke execute on function public.evaluate_scheme_eligibility(uuid, uuid) from public, anon, authenticated;
revoke execute on function public.create_survey(uuid, jsonb) from public, anon, authenticated;
grant execute on function public.submit_land_form(uuid, jsonb) to service_role;
grant execute on function public.evaluate_scheme_eligibility(uuid, uuid) to service_role;
grant execute on function public.create_survey(uuid, jsonb) to service_role;
grant execute on function private.goa_talukas() to authenticated, service_role;
grant execute on function private.next_land_record_code(), private.next_application_code() to authenticated, service_role;

------------------------------------------------------------------------------
-- Audit coverage for farmers, forms, schemes and applications
------------------------------------------------------------------------------
alter table public.audit_logs drop constraint if exists audit_logs_action_check;
alter table public.audit_logs add constraint audit_logs_action_check check (action in (
  'survey_created', 'survey_updated', 'survey_deleted',
  'duplicate_detected', 'duplicate_reviewed',
  'user_role_changed', 'user_updated',
  'farmer_created', 'farmer_updated', 'farmer_deleted',
  'form_created', 'form_updated', 'form_deleted',
  'scheme_created', 'scheme_updated', 'scheme_deleted',
  'application_created', 'application_updated', 'application_deleted'
));

create or replace function private.audit_generic()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_kind    text := tg_argv[0];           -- farmer | form | scheme | application
  v_label   text := tg_argv[1];           -- column holding a human reference
  v_changes jsonb;
  v_row     jsonb;
begin
  if tg_op = 'INSERT' then
    v_row := to_jsonb(new);
    perform private.write_audit(v_kind || '_created', v_kind, new.id, jsonb_build_object('ref', v_row ->> v_label));
    return new;
  elsif tg_op = 'UPDATE' then
    select coalesce(jsonb_object_agg(n.key, jsonb_build_object('from', o.value, 'to', n.value)), '{}'::jsonb)
      into v_changes
      from jsonb_each(to_jsonb(new)) n join jsonb_each(to_jsonb(old)) o using (key)
     where n.value is distinct from o.value
       and n.key not in ('updated_at', 'survey_number_norm', 'sub_division_norm');
    if v_changes <> '{}'::jsonb then
      perform private.write_audit(v_kind || '_updated', v_kind, new.id,
        jsonb_build_object('ref', to_jsonb(new) ->> v_label, 'changes', v_changes));
    end if;
    return new;
  else
    perform private.write_audit(v_kind || '_deleted', v_kind, old.id, jsonb_build_object('ref', to_jsonb(old) ->> v_label));
    return old;
  end if;
end;
$$;

create trigger farmers_audit after insert or update or delete on public.farmers
  for each row execute function private.audit_generic('farmer', 'name');
create trigger land_records_audit after insert or update or delete on public.land_records
  for each row execute function private.audit_generic('form', 'form_id');
create trigger subsidy_schemes_audit after insert or update or delete on public.subsidy_schemes
  for each row execute function private.audit_generic('scheme', 'code');
create trigger subsidy_applications_audit after insert or update or delete on public.subsidy_applications
  for each row execute function private.audit_generic('application', 'application_no');

------------------------------------------------------------------------------
-- survey_details: expose the linked form and farmer location
------------------------------------------------------------------------------
create or replace view public.survey_details
with (security_invoker = true)
as
select
  s.id, s.survey_id, s.survey_number, s.sub_division, s.survey_number_norm, s.sub_division_norm,
  s.farmer_id, f.name as farmer_name, f.mobile as farmer_mobile,
  s.crop_id, c.name as crop_name, s.area, s.area_unit, s.visit_date,
  s.collected_by, p.full_name as collected_by_name,
  s.latitude, s.longitude, s.gps_accuracy, s.photo_path,
  s.duplicate_status, s.submission_status, s.duplicate_reason, s.duplicate_reason_notes, s.notes,
  s.created_at, s.updated_at,
  s.land_record_id, lr.form_id, f.village as farmer_village, f.taluka as farmer_taluka
from public.surveys s
left join public.farmers      f  on f.id = s.farmer_id
left join public.crops        c  on c.id = s.crop_id
left join public.profiles     p  on p.id = s.collected_by
left join public.land_records lr on lr.id = s.land_record_id;

revoke all on public.survey_details from anon;
grant select on public.survey_details to authenticated, service_role;

-- Final hardening (same as 011) for functions created here.
revoke execute on all functions in schema private from public, anon;
grant execute on all functions in schema private to service_role;
grant execute on function
  private.current_user_role(), private.is_admin(), private.assigned_surveyor_ids(),
  private.is_privileged_session(), private.current_actor(), private.normalize_code(text),
  private.next_survey_code(), private.set_updated_at(), private.is_own_photo_path(text),
  private.setting_text(text, text), private.duplicate_matches_review_stamp(),
  private.goa_talukas(), private.next_land_record_code(), private.next_application_code()
to authenticated;
