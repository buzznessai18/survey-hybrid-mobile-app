-- 006_create_audit_logs.sql
-- Append-only audit trail, written exclusively by database triggers so it
-- cannot be skipped or forged by clients.

create table public.audit_logs (
  id          bigint generated always as identity primary key,
  user_id     uuid references public.profiles (id) on delete set null,
  action      text not null check (action in (
                'survey_created', 'survey_updated', 'survey_deleted',
                'duplicate_detected', 'duplicate_reviewed',
                'user_role_changed', 'user_updated'
              )),
  entity_type text not null,
  entity_id   uuid,
  metadata    jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

comment on table public.audit_logs is 'Append-only audit trail populated by triggers.';

-- The acting user: the JWT user for direct client requests, or the user id the
-- Edge Function passes in via set_config('app.actor_id', ...) when it runs a
-- privileged database function with the service role.
create or replace function private.current_actor()
returns uuid
language sql
stable
set search_path = ''
as $$
  select coalesce(
    auth.uid(),
    nullif(current_setting('app.actor_id', true), '')::uuid
  );
$$;

create or replace function private.write_audit(
  p_action text, p_entity_type text, p_entity_id uuid, p_metadata jsonb default '{}'::jsonb
)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.audit_logs (user_id, action, entity_type, entity_id, metadata)
  values (private.current_actor(), p_action, p_entity_type, p_entity_id, coalesce(p_metadata, '{}'::jsonb));
$$;

------------------------------------------------------------------------------
-- surveys
------------------------------------------------------------------------------
create or replace function private.audit_surveys()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_changes jsonb;
begin
  if tg_op = 'INSERT' then
    perform private.write_audit('survey_created', 'survey', new.id, jsonb_build_object(
      'survey_id', new.survey_id,
      'survey_number', new.survey_number,
      'sub_division', new.sub_division,
      'duplicate_status', new.duplicate_status
    ));
    return new;
  elsif tg_op = 'UPDATE' then
    select coalesce(jsonb_object_agg(n.key, jsonb_build_object('from', o.value, 'to', n.value)), '{}'::jsonb)
      into v_changes
      from jsonb_each(to_jsonb(new)) n
      join jsonb_each(to_jsonb(old)) o using (key)
     where n.value is distinct from o.value
       and n.key not in ('updated_at', 'location', 'survey_number_norm', 'sub_division_norm');
    if v_changes <> '{}'::jsonb then
      perform private.write_audit('survey_updated', 'survey', new.id,
        jsonb_build_object('survey_id', new.survey_id, 'changes', v_changes));
    end if;
    return new;
  else
    perform private.write_audit('survey_deleted', 'survey', old.id, jsonb_build_object(
      'survey_id', old.survey_id,
      'survey_number', old.survey_number,
      'sub_division', old.sub_division,
      'collected_by', old.collected_by
    ));
    return old;
  end if;
end;
$$;

create trigger surveys_audit
  after insert or update or delete on public.surveys
  for each row execute function private.audit_surveys();

------------------------------------------------------------------------------
-- duplicate_matches
------------------------------------------------------------------------------
create or replace function private.audit_duplicate_matches()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    perform private.write_audit('duplicate_detected', 'duplicate_match', new.id, jsonb_build_object(
      'survey_id', new.survey_id,
      'matched_survey_id', new.matched_survey_id,
      'match_type', new.match_type,
      'distance_meters', new.distance_meters
    ));
  elsif new.status is distinct from old.status or new.notes is distinct from old.notes then
    perform private.write_audit('duplicate_reviewed', 'duplicate_match', new.id, jsonb_build_object(
      'survey_id', new.survey_id,
      'matched_survey_id', new.matched_survey_id,
      'from_status', old.status,
      'to_status', new.status,
      'notes', new.notes
    ));
  end if;
  return new;
end;
$$;

create trigger duplicate_matches_audit
  after insert or update on public.duplicate_matches
  for each row execute function private.audit_duplicate_matches();

------------------------------------------------------------------------------
-- profiles
------------------------------------------------------------------------------
create or replace function private.audit_profiles()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.role is distinct from old.role then
    perform private.write_audit('user_role_changed', 'profile', new.id,
      jsonb_build_object('from', old.role, 'to', new.role));
  end if;
  if new.status is distinct from old.status or new.supervisor_id is distinct from old.supervisor_id then
    perform private.write_audit('user_updated', 'profile', new.id, jsonb_build_object(
      'status', jsonb_build_object('from', old.status, 'to', new.status),
      'supervisor_id', jsonb_build_object('from', old.supervisor_id, 'to', new.supervisor_id)
    ));
  end if;
  return new;
end;
$$;

create trigger profiles_audit
  after update on public.profiles
  for each row execute function private.audit_profiles();
