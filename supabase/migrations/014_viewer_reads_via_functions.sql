-- 014_viewer_reads_via_functions.sql
-- Read-only viewers (`user` role) and no-login guests no longer read tables
-- directly. All their reads go through the search-surveys / get-survey /
-- get-survey-map-data / get-reports Edge Functions, which return only the
-- intended fields and mask farmer mobile numbers.
--
-- This replaces the direct-read policies from 012: with them, a viewer could
-- query the REST API (e.g. survey_details) and read unmasked mobiles.
--
-- Guests use the app's public anon key only (no auth user), so anonymous
-- sign-ins stay disabled and public signup remains closed. The anonymous
-- branch added to handle_new_user in 013 is dormant.

drop policy if exists surveys_select_users on public.surveys;
drop policy if exists profiles_select_admins on public.profiles;
