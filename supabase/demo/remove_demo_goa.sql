-- supabase/demo/remove_demo_goa.sql
-- Removes ALL demo data created by seed_demo_goa.sql and deactivates the demo
-- field-survey accounts. Real data is untouched.
-- Run (cloud):  supabase db query --linked -f supabase/demo/remove_demo_goa.sql

create temporary table demo_officers as
  select id from auth.users
   where email in ('pratik.naik@fieldsurvey.app', 'sneha.kamat@fieldsurvey.app', 'rohan.fernandes@fieldsurvey.app');

-- Demo records of demo farmers (they all use 9000xxxxxx mobiles), whoever entered them.
delete from public.subsidy_applications where farmer_id in (select id from public.farmers where mobile like '9000%');
delete from public.surveys where farmer_id in (select id from public.farmers where mobile like '9000%');
delete from public.land_records where farmer_id in (select id from public.farmers where mobile like '9000%');

-- 1. Subsidy applications of demo farmers / demo schemes
delete from public.subsidy_applications
 where farmer_id in (select id from public.farmers where mobile like '90000%')
    or scheme_id in (select id from public.subsidy_schemes where code like 'DEMO-%');

-- 2. Field surveys (duplicate matches cascade) and 1/14 forms by the demo officers
delete from public.surveys where collected_by in (select id from demo_officers);
delete from public.land_records where created_by in (select id from demo_officers);

-- 3. Demo schemes and orphaned demo farmers
delete from public.subsidy_schemes s
 where s.code like 'DEMO-%' and not exists (select 1 from public.subsidy_applications a where a.scheme_id = s.id);
delete from public.farmers f
 where f.mobile like '9000%'
   and not exists (select 1 from public.surveys s where s.farmer_id = f.id)
   and not exists (select 1 from public.land_records l where l.farmer_id = f.id)
   and not exists (select 1 from public.subsidy_applications a where a.farmer_id = f.id);

-- 4. Audit rows that only described demo records
delete from public.audit_logs a
 where (a.entity_type = 'survey' and not exists (select 1 from public.surveys s where s.id = a.entity_id))
    or (a.entity_type = 'duplicate_match' and not exists (select 1 from public.duplicate_matches m where m.id = a.entity_id))
    or (a.entity_type = 'form' and not exists (select 1 from public.land_records l where l.id = a.entity_id))
    or (a.entity_type = 'application' and not exists (select 1 from public.subsidy_applications x where x.id = a.entity_id))
    or (a.entity_type = 'scheme' and not exists (select 1 from public.subsidy_schemes x where x.id = a.entity_id))
    or (a.entity_type = 'farmer' and not exists (select 1 from public.farmers x where x.id = a.entity_id));

-- 5. Deactivate the demo accounts
update public.profiles set role = 'user', status = 'inactive' where id in (select id from demo_officers);

select
  (select count(*) from public.surveys) as surveys_left,
  (select count(*) from public.land_records) as forms_left,
  (select count(*) from public.subsidy_applications) as applications_left,
  (select count(*) from public.farmers where mobile like '90000%') as demo_farmers_left;
