-- 019: admins can permanently delete users who have entered no records
-- (admin-users "delete"). Surveys and 1/14 forms keep who entered them
-- (on delete restrict), so those users are deactivated instead. The deletion
-- is written to the audit history as 'user_deleted'.

alter table public.audit_logs drop constraint if exists audit_logs_action_check;
alter table public.audit_logs add constraint audit_logs_action_check check (action in (
  'survey_created', 'survey_updated', 'survey_deleted',
  'duplicate_detected', 'duplicate_reviewed',
  'user_role_changed', 'user_updated', 'user_deleted',
  'farmer_created', 'farmer_updated', 'farmer_deleted',
  'form_created', 'form_updated', 'form_deleted',
  'scheme_created', 'scheme_updated', 'scheme_deleted',
  'application_created', 'application_updated', 'application_deleted'
));

-- Is this sign-in email / phone already used by another account? Supabase Auth
-- only answers "Error updating user", so admin-users checks first to say which
-- field clashes. Service role only (called after the admin check).
create or replace function public.admin_sign_in_taken(p_user_id uuid, p_email text, p_phone text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'email', p_email is not null and exists (
      select 1 from auth.users u where lower(u.email) = lower(btrim(p_email)) and u.id <> p_user_id),
    'phone', p_phone is not null and exists (
      select 1 from auth.users u where u.phone = regexp_replace(p_phone, '^\+', '') and u.id <> p_user_id)
  );
$$;

revoke execute on function public.admin_sign_in_taken(uuid, text, text) from public, anon, authenticated;
grant execute on function public.admin_sign_in_taken(uuid, text, text) to service_role;
