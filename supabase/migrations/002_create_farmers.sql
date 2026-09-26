-- 002_create_farmers.sql
-- Farmers are identified by mobile number + name. A family often shares one
-- phone, so mobile alone is not unique; the same farmer can own many fields.

create table public.farmers (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (char_length(btrim(name)) between 1 and 150),
  -- Stored normalised (digits only, national format), e.g. 9876543210.
  mobile     text not null check (mobile ~ '^[0-9]{7,15}$'),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.farmers is 'Farmers surveyed in the field. Created/reused by the create-survey Edge Function.';

-- One farmer record per (mobile, case-insensitive name).
create unique index farmers_mobile_name_key on public.farmers (mobile, lower(name));

create trigger farmers_set_updated_at
  before update on public.farmers
  for each row execute function private.set_updated_at();
