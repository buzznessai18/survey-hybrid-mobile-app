-- 022: farmer equipment / service records (the simplified client workflow).
--
-- One record = farmer name, gender, address, survey no. / sub-division, land
-- size + unit, and a free-text description of the equipment provided or work
-- done. The record number, timestamp and creator are always set by the
-- server, never taken from the client.
--
-- This is a new, self-contained table on purpose: surveys require a crop,
-- GPS and a farmer mobile, land_records require village/taluka, and
-- farmers.mobile is NOT NULL, none of which this form collects. Existing
-- tables, records and functions are left untouched.
--
-- Access (also enforced by the service-records Edge Function):
--   admin, user (company user)  read + create
--   admin                       delete (audited)
-- Nobody edits a saved record (receipts must match what was saved).

create sequence if not exists public.service_record_code_seq;

create or replace function private.next_service_record_code()
returns text
language plpgsql
volatile
set search_path = ''
as $$
declare
  n bigint := nextval('public.service_record_code_seq');
begin
  return 'RC-' || lpad(n::text, greatest(6, length(n::text)), '0');
end;
$$;

create table public.service_records (
  -- Client-generated UUID: idempotency key, so a retried save never duplicates.
  id                 uuid primary key default gen_random_uuid(),
  record_no          text not null unique default private.next_service_record_code(),

  farmer_name        text not null check (char_length(btrim(farmer_name)) between 1 and 150),
  gender             text check (gender is null or gender in ('male', 'female', 'other')),
  address            text check (address is null or char_length(address) <= 500),

  survey_number      text not null check (char_length(btrim(survey_number)) between 1 and 50),
  sub_division       text check (sub_division is null or char_length(btrim(sub_division)) between 1 and 50),
  survey_number_norm text generated always as (private.normalize_code(survey_number)) stored,
  sub_division_norm  text generated always as (private.normalize_code(sub_division)) stored,

  -- Stored exactly as entered, with its unit; never converted.
  land_size          numeric(14, 4) not null check (land_size > 0 and land_size <= 100000000),
  land_unit          text not null check (land_unit in ('acre', 'sq_m')),

  service_details    text check (service_details is null or char_length(service_details) <= 2000),

  created_by         uuid not null references public.profiles (id) on delete restrict,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

comment on table public.service_records is 'Farmer equipment / service records with printable receipts. Written through the service-records Edge Function.';
comment on column public.service_records.record_no is 'Human-readable receipt number, e.g. RC-000123.';

create trigger service_records_set_updated_at
  before update on public.service_records
  for each row execute function private.set_updated_at();

create index service_records_created_at_idx on public.service_records (created_at desc);
create index service_records_created_by_idx on public.service_records (created_by);
create index service_records_survey_idx on public.service_records (survey_number_norm, sub_division_norm);
create index service_records_farmer_name_trgm_idx
  on public.service_records using gin (lower(farmer_name) extensions.gin_trgm_ops);

------------------------------------------------------------------------------
-- RLS
------------------------------------------------------------------------------
alter table public.service_records enable row level security;

revoke all on public.service_records from anon;
grant select, insert, delete on public.service_records to authenticated;
grant select, insert, update, delete on public.service_records to service_role;
grant usage, select on sequence public.service_record_code_seq to authenticated, service_role;

create policy service_records_select on public.service_records
  for select to authenticated
  using ((select private.can_edit_records()));

-- Editors insert records as themselves only.
create policy service_records_insert on public.service_records
  for insert to authenticated
  with check ((select private.can_edit_records()) and created_by = (select auth.uid()));

create policy service_records_delete_admin on public.service_records
  for delete to authenticated
  using ((select private.is_admin()));

------------------------------------------------------------------------------
-- Audit
------------------------------------------------------------------------------
alter table public.audit_logs drop constraint if exists audit_logs_action_check;
alter table public.audit_logs add constraint audit_logs_action_check check (action in (
  'survey_created', 'survey_updated', 'survey_deleted',
  'duplicate_detected', 'duplicate_reviewed',
  'user_role_changed', 'user_updated', 'user_deleted',
  'farmer_created', 'farmer_updated', 'farmer_deleted',
  'form_created', 'form_updated', 'form_deleted',
  'scheme_created', 'scheme_updated', 'scheme_deleted',
  'application_created', 'application_updated', 'application_deleted',
  'record_created', 'record_updated', 'record_deleted'
));

create trigger service_records_audit after insert or update or delete on public.service_records
  for each row execute function private.audit_generic('record', 'record_no');

-- Same hardening as 015 for the function created here.
revoke execute on function private.next_service_record_code() from public, anon;
grant execute on function private.next_service_record_code() to authenticated, service_role;
