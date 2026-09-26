-- 004_create_surveys.sql
-- Survey records, plus app_settings (runtime configuration such as the GPS
-- duplicate radius) and the helpers the surveys table depends on.

------------------------------------------------------------------------------
-- Runtime configuration (single source of truth; editable by admins)
------------------------------------------------------------------------------
create table public.app_settings (
  key         text primary key,
  value       jsonb not null,
  description text,
  updated_at  timestamptz not null default now()
);

create trigger app_settings_set_updated_at
  before update on public.app_settings
  for each row execute function private.set_updated_at();

insert into public.app_settings (key, value, description) values
  ('duplicate_radius_meters', '100', 'Surveys with the same survey number within this radius (meters) are flagged as possible duplicates.'),
  ('report_timezone', '"Asia/Kolkata"', 'Timezone used to compute "today" in reports.')
on conflict (key) do nothing;

-- Numeric setting reader with a fallback default.
create or replace function private.setting_numeric(p_key text, p_default numeric)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select case when jsonb_typeof(value) = 'number' then (value #>> '{}')::numeric end
       from public.app_settings where key = p_key),
    p_default
  );
$$;

create or replace function private.setting_text(p_key text, p_default text)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select value #>> '{}' from public.app_settings where key = p_key), p_default);
$$;

-- The configured duplicate radius, clamped to a sane range.
create or replace function private.duplicate_radius_meters()
returns numeric
language sql
stable
set search_path = ''
as $$
  select least(greatest(private.setting_numeric('duplicate_radius_meters', 100), 1), 10000);
$$;

------------------------------------------------------------------------------
-- Helpers
------------------------------------------------------------------------------

-- Canonical form of survey number / sub-division used for duplicate matching:
-- trimmed, upper-cased, all whitespace removed ("12 a " -> "12A").
create or replace function private.normalize_code(p_value text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select upper(regexp_replace(coalesce(p_value, ''), '\s+', '', 'g'));
$$;

-- Human-readable survey code: SV-000001, SV-000002, ... (grows past 6 digits).
create sequence public.survey_code_seq;

create or replace function private.next_survey_code()
returns text
language plpgsql
volatile
set search_path = ''
as $$
declare
  n bigint := nextval('public.survey_code_seq');
begin
  return 'SV-' || lpad(n::text, greatest(6, length(n::text)), '0');
end;
$$;

------------------------------------------------------------------------------
-- surveys
------------------------------------------------------------------------------
create table public.surveys (
  -- Client-generated UUID. Doubles as the idempotency key for offline retries.
  id                     uuid primary key default gen_random_uuid(),
  survey_id              text not null unique default private.next_survey_code(),

  farmer_id              uuid not null references public.farmers (id) on delete restrict,
  crop_id                uuid not null references public.crops (id) on delete restrict,

  area                   numeric(12, 4) not null check (area > 0),
  area_unit              text not null
                         check (area_unit in ('acre', 'hectare', 'guntha', 'cent', 'bigha', 'sq_m')),

  survey_number          text not null check (char_length(btrim(survey_number)) between 1 and 50),
  sub_division           text check (sub_division is null or char_length(btrim(sub_division)) between 1 and 50),
  survey_number_norm     text generated always as (private.normalize_code(survey_number)) stored,
  sub_division_norm      text generated always as (private.normalize_code(sub_division)) stored,

  visit_date             date not null,
  collected_by           uuid not null references public.profiles (id) on delete restrict,

  latitude               numeric(10, 7) not null check (latitude between -90 and 90),
  longitude              numeric(10, 7) not null check (longitude between -180 and 180),
  gps_accuracy           numeric(8, 2) not null check (gps_accuracy >= 0),
  location               extensions.geography(point, 4326)
                         generated always as (
                           extensions.st_setsrid(
                             extensions.st_makepoint(longitude::float8, latitude::float8), 4326
                           )::extensions.geography
                         ) stored,

  -- Storage object path inside the field-photos bucket: {user_id}/{survey uuid}/{file}
  -- Must live under this survey's own folder.
  photo_path             text,

  duplicate_status       text not null default 'unique' check (duplicate_status in (
                           'unique',               -- no match found
                           'duplicate',            -- same survey number + sub-division, awaiting review
                           'possible_duplicate',   -- same survey number nearby, awaiting review
                           'needs_verification',   -- reviewer asked for field verification
                           'confirmed_duplicate',  -- reviewer confirmed
                           'not_duplicate'         -- reviewer cleared all matches
                         )),
  submission_status      text not null default 'pending'
                         check (submission_status in ('pending', 'approved', 'rejected')),

  duplicate_reason       text check (duplicate_reason is null or duplicate_reason in (
                           'different_farmer',
                           'different_portion_of_land',
                           'previous_data_incorrect',
                           'previous_survey_unavailable',
                           'other'
                         )),
  duplicate_reason_notes text check (duplicate_reason_notes is null or char_length(duplicate_reason_notes) <= 1000),
  notes                  text check (notes is null or char_length(notes) <= 2000),

  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),

  constraint surveys_visit_date_range check (visit_date >= date '2000-01-01'),
  constraint surveys_photo_path_folder check (
    photo_path is null
    or (photo_path like collected_by::text || '/' || id::text || '/%'
        and photo_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/[A-Za-z0-9._-]{1,100}$')
  ),
  constraint surveys_other_reason_notes check (
    duplicate_reason is distinct from 'other' or duplicate_reason_notes is not null
  )
);

comment on table public.surveys is 'Field survey records. Inserted only through the create-survey Edge Function.';
comment on column public.surveys.id is 'Client-generated UUID; idempotency key for offline/retried submissions.';
comment on column public.surveys.survey_id is 'Human-readable identifier, e.g. SV-001245.';
comment on column public.surveys.duplicate_reason is 'Why the surveyor submitted despite a duplicate warning.';

create trigger surveys_set_updated_at
  before update on public.surveys
  for each row execute function private.set_updated_at();
