-- 011_views_and_reports.sql
-- Read models used by the Edge Functions. Everything here is SECURITY
-- INVOKER, so results are automatically scoped by RLS to what the caller may
-- see (surveyor: own; supervisor: team; admin: all).

------------------------------------------------------------------------------
-- survey_details: survey joined with farmer, crop and collector
------------------------------------------------------------------------------
create or replace view public.survey_details
with (security_invoker = true)
as
select
  s.id,
  s.survey_id,
  s.survey_number,
  s.sub_division,
  s.survey_number_norm,
  s.sub_division_norm,
  s.farmer_id,
  f.name        as farmer_name,
  f.mobile      as farmer_mobile,
  s.crop_id,
  c.name        as crop_name,
  s.area,
  s.area_unit,
  s.visit_date,
  s.collected_by,
  p.full_name   as collected_by_name,
  s.latitude,
  s.longitude,
  s.gps_accuracy,
  s.photo_path,
  s.duplicate_status,
  s.submission_status,
  s.duplicate_reason,
  s.duplicate_reason_notes,
  s.notes,
  s.created_at,
  s.updated_at
from public.surveys s
left join public.farmers  f on f.id = s.farmer_id
left join public.crops    c on c.id = s.crop_id
left join public.profiles p on p.id = s.collected_by;

revoke all on public.survey_details from anon;
grant select on public.survey_details to authenticated, service_role;

------------------------------------------------------------------------------
-- Map points inside a bounding box (lightweight rows only)
------------------------------------------------------------------------------
create or replace function public.get_survey_map_points(
  p_min_lat          numeric,
  p_min_lng          numeric,
  p_max_lat          numeric,
  p_max_lng          numeric,
  p_duplicate_status text[]  default null,
  p_crop_id          uuid    default null,
  p_collected_by     uuid    default null,
  p_from             date    default null,
  p_to               date    default null,
  p_limit            integer default 500
)
returns table (
  id               uuid,
  survey_id        text,
  survey_number    text,
  sub_division     text,
  farmer_name      text,
  latitude         numeric,
  longitude        numeric,
  duplicate_status text,
  crop             text
)
language sql
stable
security invoker
set search_path = ''
as $$
  select s.id, s.survey_id, s.survey_number, s.sub_division, f.name,
         s.latitude, s.longitude, s.duplicate_status, c.name
    from public.surveys s
    left join public.farmers f on f.id = s.farmer_id
    left join public.crops   c on c.id = s.crop_id
   where s.location operator(extensions.&&)
         extensions.st_makeenvelope(p_min_lng::float8, p_min_lat::float8,
                                    p_max_lng::float8, p_max_lat::float8, 4326)::extensions.geography
     and s.latitude  between p_min_lat and p_max_lat
     and s.longitude between p_min_lng and p_max_lng
     and (p_duplicate_status is null or s.duplicate_status = any (p_duplicate_status))
     and (p_crop_id      is null or s.crop_id = p_crop_id)
     and (p_collected_by is null or s.collected_by = p_collected_by)
     and (p_from         is null or s.visit_date >= p_from)
     and (p_to           is null or s.visit_date <= p_to)
   order by s.created_at desc
   limit greatest(1, least(coalesce(p_limit, 500), 5001));
$$;

revoke execute on function public.get_survey_map_points(numeric, numeric, numeric, numeric, text[], uuid, uuid, date, date, integer) from public, anon;
grant execute on function public.get_survey_map_points(numeric, numeric, numeric, numeric, text[], uuid, uuid, date, date, integer) to authenticated, service_role;

------------------------------------------------------------------------------
-- Report aggregates
------------------------------------------------------------------------------
create or replace function public.get_survey_report(
  p_from         date default null,
  p_to           date default null,
  p_collected_by uuid default null,
  p_crop_id      uuid default null
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with tz as (
    select private.setting_text('report_timezone', 'UTC') as name
  ),
  base as (
    select s.*
      from public.surveys s
     where (p_from         is null or s.visit_date >= p_from)
       and (p_to           is null or s.visit_date <= p_to)
       and (p_collected_by is null or s.collected_by = p_collected_by)
       and (p_crop_id      is null or s.crop_id = p_crop_id)
  )
  select jsonb_build_object(
    'total_surveys', (select count(*) from base),
    'today_surveys', (
      select count(*) from base, tz
       where (base.created_at at time zone tz.name)::date = (now() at time zone tz.name)::date
    ),
    'duplicate_count', (
      select count(*) from base
       where duplicate_status in ('duplicate', 'possible_duplicate', 'needs_verification', 'confirmed_duplicate')
    ),
    'pending_duplicate_reviews', (
      select count(*) from public.duplicate_matches m
      join base on base.id = m.survey_id
       where m.status = 'pending'
    ),
    'by_submission_status', (
      select coalesce(jsonb_object_agg(submission_status, n), '{}'::jsonb)
        from (select submission_status, count(*) n from base group by 1) x
    ),
    'by_duplicate_status', (
      select coalesce(jsonb_object_agg(duplicate_status, n), '{}'::jsonb)
        from (select duplicate_status, count(*) n from base group by 1) x
    ),
    'by_crop', (
      select coalesce(jsonb_agg(jsonb_build_object('crop_id', crop_id, 'crop', name, 'count', n) order by n desc), '[]'::jsonb)
        from (select b.crop_id, c.name, count(*) n
                from base b left join public.crops c on c.id = b.crop_id
               group by 1, 2) x
    ),
    'by_surveyor', (
      select coalesce(jsonb_agg(jsonb_build_object('surveyor_id', collected_by, 'surveyor', full_name, 'count', n) order by n desc), '[]'::jsonb)
        from (select b.collected_by, p.full_name, count(*) n
                from base b left join public.profiles p on p.id = b.collected_by
               group by 1, 2) x
    ),
    'by_date', (
      select coalesce(jsonb_agg(jsonb_build_object('date', visit_date, 'count', n) order by visit_date desc), '[]'::jsonb)
        from (select visit_date, count(*) n from base group by 1 order by 1 desc limit 366) x
    )
  );
$$;

revoke execute on function public.get_survey_report(date, date, uuid, uuid) from public, anon;
grant execute on function public.get_survey_report(date, date, uuid, uuid) to authenticated, service_role;
grant execute on function private.setting_text(text, text) to authenticated;

------------------------------------------------------------------------------
-- Final hardening: nothing in private is executable by PUBLIC/anon unless it
-- was explicitly granted above.
------------------------------------------------------------------------------
revoke execute on all functions in schema private from public, anon;
grant execute on all functions in schema private to service_role;
alter default privileges in schema private revoke execute on functions from public;
