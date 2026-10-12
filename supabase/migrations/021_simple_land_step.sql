-- 021: the 1/14 land step only asks for village, taluka, survey number,
-- sub-division and remarks. Occupant name(s), area and land class become
-- optional (existing forms keep their values). land-records fills area_sq_m
-- from the field survey's area when the form has none, so total land and the
-- land-size eligibility rules keep working.

alter table public.land_records alter column occupant_names drop not null;
alter table public.land_records alter column area_sq_m drop not null;
alter table public.land_records alter column land_class drop not null;
