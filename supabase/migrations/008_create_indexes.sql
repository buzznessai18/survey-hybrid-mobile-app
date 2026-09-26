-- 008_create_indexes.sql

-- surveys: duplicate detection
create index surveys_survey_number_idx      on public.surveys (survey_number_norm);
create index surveys_survey_number_sub_idx  on public.surveys (survey_number_norm, sub_division_norm);
create index surveys_location_gix           on public.surveys using gist (location);

-- surveys: foreign keys, filtering and sorting
create index surveys_farmer_id_idx          on public.surveys (farmer_id);
create index surveys_crop_id_idx            on public.surveys (crop_id);
create index surveys_collected_by_idx       on public.surveys (collected_by, created_at desc);
create index surveys_visit_date_idx         on public.surveys (visit_date);
create index surveys_duplicate_status_idx   on public.surveys (duplicate_status);
create index surveys_submission_status_idx  on public.surveys (submission_status);
create index surveys_created_at_idx         on public.surveys (created_at desc);
create index surveys_updated_at_idx         on public.surveys (updated_at);

-- farmers
create index farmers_mobile_idx             on public.farmers (mobile);
create index farmers_name_trgm_idx          on public.farmers using gin (name extensions.gin_trgm_ops);

-- profiles
create index profiles_supervisor_id_idx     on public.profiles (supervisor_id);
create index profiles_role_idx              on public.profiles (role);

-- duplicate_matches
create index duplicate_matches_survey_id_idx         on public.duplicate_matches (survey_id);
create index duplicate_matches_matched_survey_id_idx on public.duplicate_matches (matched_survey_id);
create index duplicate_matches_status_idx            on public.duplicate_matches (status);

-- audit_logs
create index audit_logs_entity_idx          on public.audit_logs (entity_type, entity_id);
create index audit_logs_user_id_idx         on public.audit_logs (user_id, created_at desc);
create index audit_logs_created_at_idx      on public.audit_logs (created_at desc);
