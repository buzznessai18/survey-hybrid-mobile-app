-- 003_create_crops.sql

create table public.crops (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (char_length(btrim(name)) between 1 and 100),
  status     text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.crops is 'Crop master list managed by admins. Only active crops can be used in new surveys.';

create unique index crops_name_key on public.crops (lower(name));

create trigger crops_set_updated_at
  before update on public.crops
  for each row execute function private.set_updated_at();
