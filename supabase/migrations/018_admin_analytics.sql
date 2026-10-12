-- 018: admin dashboard analytics for a date range (week / month / custom).
--
-- Called only by the get-analytics Edge Function after it has checked that the
-- caller is an admin, so it runs as the service role and sees every row.
-- Dates are calendar days in the report timezone (settings.report_timezone):
--   1/14 forms and farmers by created_at, field surveys by visit_date,
--   benefit applications by applied_on.
-- The comparison period is p_prev_from..p_prev_to (e.g. the same days of last
-- month); by default the same number of days immediately before p_from.

create or replace function public.get_admin_analytics(
  p_from      date,
  p_to        date,
  p_prev_from date default null,
  p_prev_to   date default null
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
  span as (
    select p_from as d_from, p_to as d_to,
           coalesce(p_prev_from, p_from - (p_to - p_from + 1)) as prev_from,
           coalesce(p_prev_to, p_from - 1) as prev_to
  ),
  forms as (
    select f.*, (f.created_at at time zone tz.name)::date as day
      from public.land_records f, tz
  ),
  farmers as (
    select fa.id, fa.taluka, (fa.created_at at time zone tz.name)::date as day
      from public.farmers fa, tz
  ),
  apps as (
    select a.*, a.applied_on as day from public.subsidy_applications a
  ),
  cur_forms   as (select forms.*   from forms,   span where day between d_from and d_to),
  cur_surveys as (select s.*       from public.surveys s, span where s.visit_date between d_from and d_to),
  cur_farmers as (select farmers.* from farmers, span where day between d_from and d_to),
  cur_apps    as (select apps.*    from apps,    span where day between d_from and d_to)
  select jsonb_build_object(
    'period', (select jsonb_build_object('from', d_from, 'to', d_to, 'prev_from', prev_from, 'prev_to', prev_to) from span),
    'totals', jsonb_build_object(
      'forms',             (select count(*) from cur_forms),
      'forms_verified',    (select count(*) from cur_forms where status = 'verified'),
      'land_sq_m',         (select coalesce(sum(area_sq_m), 0) from cur_forms),
      'surveys',           (select count(*) from cur_surveys),
      'duplicates',        (select count(*) from cur_surveys
                             where duplicate_status in ('duplicate', 'possible_duplicate', 'needs_verification', 'confirmed_duplicate')),
      'farmers',           (select count(*) from cur_farmers),
      'applications',      (select count(*) from cur_apps),
      'approved',          (select count(*) from cur_apps where status in ('approved', 'disbursed')),
      'disbursed_rs',      (select coalesce(sum(amount_rs), 0) from cur_apps where status = 'disbursed')
    ),
    'previous', jsonb_build_object(
      'forms',        (select count(*) from forms, span where day between prev_from and prev_to),
      'surveys',      (select count(*) from public.surveys s, span where s.visit_date between prev_from and prev_to),
      'farmers',      (select count(*) from farmers, span where day between prev_from and prev_to),
      'applications', (select count(*) from apps, span where day between prev_from and prev_to)
    ),
    -- One point per day in the range (zeros included); the app groups long ranges by week / month.
    'series', (
      select coalesce(jsonb_agg(jsonb_build_object(
               'date', d::date,
               'forms',   (select count(*) from cur_forms   where day = d::date),
               'surveys', (select count(*) from cur_surveys where visit_date = d::date)
             ) order by d), '[]'::jsonb)
        from span, generate_series(d_from, d_to, interval '1 day') d
    ),
    'forms_by_taluka', (
      select coalesce(jsonb_agg(jsonb_build_object('label', taluka, 'count', n) order by n desc, taluka), '[]'::jsonb)
        from (select taluka, count(*) n from cur_forms group by 1) x
    ),
    'forms_by_status', (
      select coalesce(jsonb_object_agg(status, n), '{}'::jsonb)
        from (select status, count(*) n from cur_forms group by 1) x
    ),
    'surveys_by_crop', (
      select coalesce(jsonb_agg(jsonb_build_object('label', coalesce(name, 'Unknown'), 'count', n) order by n desc, name), '[]'::jsonb)
        from (select c.name, count(*) n
                from cur_surveys s left join public.crops c on c.id = s.crop_id
               group by 1 order by 2 desc limit 8) x
    ),
    'applications_by_status', (
      select coalesce(jsonb_object_agg(status, n), '{}'::jsonb)
        from (select status, count(*) n from cur_apps group by 1) x
    ),
    'applications_by_scheme', (
      select coalesce(jsonb_agg(jsonb_build_object('label', name, 'count', n) order by n desc, name), '[]'::jsonb)
        from (select sc.name, count(*) n
                from cur_apps a join public.subsidy_schemes sc on sc.id = a.scheme_id
               group by 1 order by 2 desc limit 6) x
    ),
    -- Who entered the most 1/14 forms in the period.
    'top_users', (
      select coalesce(jsonb_agg(jsonb_build_object('label', coalesce(p.full_name, 'Unknown'), 'count', x.n) order by x.n desc, p.full_name), '[]'::jsonb)
        from (select created_by, count(*) n from cur_forms group by 1 order by 2 desc limit 5) x
        left join public.profiles p on p.id = x.created_by
    )
  );
$$;

revoke execute on function public.get_admin_analytics(date, date, date, date) from public, anon, authenticated;
grant execute on function public.get_admin_analytics(date, date, date, date) to service_role;
