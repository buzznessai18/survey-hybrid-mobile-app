-- supabase/demo/remove_demo_records.sql
-- Removes the demo farmer service records created by seed_demo_records.sql
-- (records entered by the three demo staff accounts) and their audit rows.
-- Records entered by real users are untouched.
-- Run (cloud):  supabase db query --linked -f supabase/demo/remove_demo_records.sql

create temporary table demo_record_ids as
  select r.id
    from public.service_records r
    join auth.users u on u.id = r.created_by
   where u.email in ('pratik.naik@fieldsurvey.app', 'sneha.kamat@fieldsurvey.app', 'rohan.fernandes@fieldsurvey.app');

delete from public.service_records where id in (select id from demo_record_ids);

delete from public.audit_logs
 where entity_type = 'record' and entity_id in (select id from demo_record_ids);

drop table demo_record_ids;
