-- 005_create_duplicate_matches.sql
-- One row per (new survey -> existing survey) match found at submission time.

create table public.duplicate_matches (
  id                uuid primary key default gen_random_uuid(),
  -- The newly submitted survey that triggered the warning.
  survey_id         uuid not null references public.surveys (id) on delete cascade,
  -- The pre-existing survey it matched.
  matched_survey_id uuid not null references public.surveys (id) on delete cascade,
  match_type        text not null check (match_type in (
                      'exact',                -- same survey number + sub-division
                      'proximity',            -- same survey number, within the GPS radius
                      'exact_and_proximity'   -- both
                    )),
  distance_meters   numeric(12, 1) check (distance_meters is null or distance_meters >= 0),
  status            text not null default 'pending' check (status in (
                      'pending', 'confirmed_duplicate', 'not_duplicate', 'needs_verification'
                    )),
  reviewed_by       uuid references public.profiles (id) on delete set null,
  reviewed_at       timestamptz,
  notes             text check (notes is null or char_length(notes) <= 2000),
  created_at        timestamptz not null default now(),
  constraint duplicate_matches_not_self check (survey_id <> matched_survey_id),
  constraint duplicate_matches_pair_key unique (survey_id, matched_survey_id)
);

comment on table public.duplicate_matches is 'Duplicate candidates detected by create-survey; reviewed by supervisors/admins.';
