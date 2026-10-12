-- supabase/demo/seed_demo_goa.sql
-- Realistic DEMO data for client reviews: field surveys across Goa, India.
--
-- * Surveys are created through public.create_survey(), so farmer matching,
--   duplicate detection (survey no. + sub-division and GPS radius), matches
--   and audit logs are produced by the real backend logic.
-- * Collected by three demo field survey users (see create_demo_accounts.sh).
-- * Every plot also gets a 1/14 form (Form I & XIV) linked to its survey;
--   farmers get profiles; demo subsidy schemes + application history are added.
--   Everything is removable with remove_demo_goa.sql.
-- * Farmer mobiles use the fake 90000xxxxx range.
--
-- Run (cloud):  supabase db query --linked -f supabase/demo/seed_demo_goa.sql

-- Goa crops (Wheat/Cotton/Soybean are not grown commercially in Goa).
insert into public.crops (name) values
  ('Cashew'), ('Coconut'), ('Arecanut'), ('Mango'), ('Kokum'), ('Black Pepper'), ('Pineapple'), ('Chilli')
on conflict do nothing;
update public.crops set status = 'inactive' where name in ('Wheat', 'Cotton', 'Soybean');

do $$
declare
  officers uuid[];
  reviewer uuid;

  -- village, taluka, lat, lng (farmland near the village centre)
  villages jsonb := '[
    ["Aldona","Bardez",15.5926,73.8741], ["Moira","Bardez",15.5960,73.8480], ["Siolim","Bardez",15.6283,73.7589],
    ["Assagao","Bardez",15.5953,73.7683], ["Pernem","Pernem",15.7219,73.7967], ["Tuem","Pernem",15.6780,73.7940],
    ["Bicholim","Bicholim",15.5889,73.9496], ["Mayem","Bicholim",15.5690,73.9290], ["Valpoi","Sattari",15.5320,74.1360],
    ["Sanquelim","Sattari",15.5620,74.0080], ["Divar","Tiswadi",15.5200,73.8950], ["Goa Velha","Tiswadi",15.4380,73.8810],
    ["Ponda","Ponda",15.4034,74.0152], ["Marcela","Ponda",15.5140,73.9640], ["Khandepar","Ponda",15.4340,74.0470],
    ["Bethora","Ponda",15.3900,74.0600], ["Loutolim","Salcete",15.3336,73.9811], ["Curtorim","Salcete",15.2930,74.0270],
    ["Chinchinim","Salcete",15.2130,73.9700], ["Raia","Salcete",15.3030,73.9850], ["Quepem","Quepem",15.2130,74.0770],
    ["Sanguem","Sanguem",15.2290,74.1510], ["Rivona","Sanguem",15.1780,74.1080], ["Chaudi","Canacona",15.0090,74.0470],
    ["Dharbandora","Dharbandora",15.4230,74.1250], ["Verna","Mormugao",15.3710,73.9330]
  ]';

  farmers jsonb := '[
    "Ramesh Naik","Suresh Gaonkar","Prakash Sawant","Mahesh Parab","Santosh Desai","Vishnu Kamat","Anant Shirodkar",
    "Dattaram Gawas","Tukaram Velip","Govind Gaude","Joaquim Fernandes","Anthony D''Souza","Francis Rodrigues",
    "Maria Pereira","Agnelo Colaco","Caetano Dias","Savio Menezes","Rosy Fernandes","Shobha Naik","Laxmi Gaonkar",
    "Sunita Parab","Vasant Harmalkar","Uday Bhembre","Krishna Kerkar","Nilesh Kunkolienkar","Shrikant Mhamal",
    "Raju Velip","Pandurang Zarapkar","Premanand Morajkar","Babli Gaude","Jose Carvalho","Pedro Afonso",
    "Ashok Salgaonkar","Umesh Gaonkar","Deepa Sawant","Xavier Pinto","Rajendra Borkar","Kamlakant Naik"
  ]';

  -- crop, weight, typical hectares (min,max), note
  crops jsonb := '[
    ["Paddy",6,0.2,1.4,"Kharif paddy, transplanted in June; khazan bund in good repair."],
    ["Cashew",5,0.5,3.0,"Cashew orchard on laterite slope, trees 12-15 years old."],
    ["Coconut",4,0.3,2.0,"Coconut garden with some mango trees along the boundary."],
    ["Arecanut",3,0.3,1.5,"Arecanut plantation with black pepper vines on the palms."],
    ["Vegetables",2,0.1,0.6,"Rabi vegetables (chilli, brinjal, okra) after paddy harvest."],
    ["Mango",2,0.4,2.0,"Mankurad mango orchard, flowering expected in January."],
    ["Banana",2,0.2,1.0,"Velchi banana under well irrigation."],
    ["Kokum",1,0.2,1.0,"Kokum trees on the hill slope, harvest April-May."],
    ["Pulses",1,0.2,0.8,"Rabi cowpea (alsando) on residual moisture."],
    ["Black Pepper",1,0.2,0.8,"Pepper trained on arecanut and silver oak standards."],
    ["Sugarcane",1,0.5,2.0,"Sugarcane supplied to the Sanjivani co-operative factory."],
    ["Pineapple",1,0.3,1.2,"Pineapple intercropped in young cashew plantation."]
  ]';

  total_weight int;
  n_main constant int := 62;
  v jsonb; c jsonb; farmer_idx int; fname text; mobile text;
  crop_id uuid; officer uuid; lat numeric; lng numeric; ha numeric; unit text; area numeric;
  sn text; sd text; sid uuid; days_ago int; created timestamptz; roll float; w int; acc int;
  res jsonb;
  main_ids uuid[] := '{}';
  dup_base uuid; b record; k int;
begin
  perform setseed(0.2026);

  select array_agg(id order by email) into officers
    from auth.users where email in ('pratik.naik@fieldsurvey.app', 'sneha.kamat@fieldsurvey.app', 'rohan.fernandes@fieldsurvey.app');
  if coalesce(array_length(officers, 1), 0) <> 3 then
    raise exception 'Create the demo accounts first (supabase/demo/create_demo_accounts.sh)';
  end if;
  -- Records are admin-only (017). The demo officers act as admins only inside this
  -- transaction (they are shown as "collected by"), and end as company users.
  update public.profiles set role = 'admin', status = 'active' where id = any (officers);
  select id into reviewer from auth.users where email = 'admin@fieldsurvey.app';
  reviewer := coalesce(reviewer, officers[1]);

  if exists (select 1 from public.surveys where collected_by = any (officers)) then
    raise exception 'Demo data already present. Run remove_demo_goa.sql first.';
  end if;

  select sum((x ->> 1)::int) into total_weight from jsonb_array_elements(crops) x;

  ---------------------------------------------------------------------------
  -- Main surveys: unique survey numbers, spread over ~60 days
  ---------------------------------------------------------------------------
  for i in 1..n_main loop
    v := villages -> ((i * 7) % jsonb_array_length(villages));
    -- ~1 in 4 farmers own more than one field
    farmer_idx := case when i % 4 = 0 then (i / 4) % 12 else (i * 5) % jsonb_array_length(farmers) end;
    fname := farmers ->> farmer_idx;
    mobile := '90000' || lpad((10001 + farmer_idx * 37)::text, 5, '0');

    roll := random() * total_weight; w := 0;
    for c in select * from jsonb_array_elements(crops) loop
      w := w + (c ->> 1)::int;
      exit when roll < w;
    end loop;
    select id into crop_id from public.crops where name = c ->> 0;

    ha := round(((c ->> 2)::numeric + random()::numeric * ((c ->> 3)::numeric - (c ->> 2)::numeric)), 2);
    if i % 5 = 0 then unit := 'sq_m'; area := round(ha * 10000 / 50) * 50;
    elsif i % 7 = 0 then unit := 'acre'; area := round(ha * 2.471, 2);
    else unit := 'hectare'; area := ha; end if;

    sn := (12 + ((i * 37) % 480))::text;
    sd := case when i % 6 = 0 then null else ((i % 5) + 1)::text || case when i % 9 = 0 then 'A' else '' end end;

    lat := round(((v ->> 2)::numeric + (random()::numeric - 0.5) * 0.008), 7);
    lng := round(((v ->> 3)::numeric + (random()::numeric - 0.5) * 0.008), 7);
    acc := 3 + floor(random() * 12)::int;

    days_ago := case when i > n_main - 4 then 0 else floor(power(random(), 1.3) * 60)::int + 1 end;
    created := date_trunc('day', now()) - make_interval(days => days_ago) + make_interval(hours => 8 + floor(random() * 9)::int, mins => floor(random() * 60)::int);
    if days_ago = 0 then created := least(created, now() - interval '20 minutes'); end if;

    officer := officers[1 + (i % 3)];
    sid := gen_random_uuid();
    perform set_config('app.actor_id', officer::text, true);
    res := public.create_survey(officer, jsonb_build_object(
      'id', sid,
      'farmer', jsonb_build_object('name', fname, 'mobile', mobile),
      'crop_id', crop_id,
      'area', area, 'area_unit', unit,
      'survey_number', sn, 'sub_division', sd,
      'visit_date', (created at time zone 'Asia/Kolkata')::date,
      'latitude', lat, 'longitude', lng, 'gps_accuracy', acc,
      'notes', (v ->> 0) || ', ' || (v ->> 1) || ' taluka. ' || (c ->> 4)
    ));

    update public.surveys set
      created_at = created, updated_at = created,
      submission_status = case
        when days_ago = 0 then 'pending'
        when days_ago <= 5 then (case when random() < 0.6 then 'pending' else 'approved' end)
        when random() < 0.05 then 'rejected'
        else 'approved' end
    where id = sid;
    main_ids := main_ids || sid;
  end loop;

  ---------------------------------------------------------------------------
  -- Duplicates: re-surveys of existing plots by another officer
  --   k 1-6 : same survey no. + sub-division, 15-60 m away  (exact + GPS)
  --   k 7-10: same survey no., different sub-division, nearby (GPS only)
  ---------------------------------------------------------------------------
  for k in 1..10 loop
    dup_base := main_ids[k * 6];
    select s.*, f.name as farmer_name, f.mobile as farmer_mobile into b
      from public.surveys s join public.farmers f on f.id = s.farmer_id where s.id = dup_base;
    officer := officers[1 + ((k + 1) % 3)];
    if officer = b.collected_by then officer := officers[1 + ((k + 2) % 3)]; end if;
    days_ago := greatest(0, floor(random() * 10)::int);
    created := least(now() - interval '10 minutes',
      greatest(b.created_at + interval '1 day', date_trunc('day', now()) - make_interval(days => days_ago) + interval '11 hours'));
    fname := case when k in (2, 5, 8) then farmers ->> ((k * 11) % jsonb_array_length(farmers)) else b.farmer_name end;
    mobile := case when k in (2, 5, 8) then '90000' || lpad((20001 + k * 13)::text, 5, '0') else b.farmer_mobile end;
    sid := gen_random_uuid();
    perform set_config('app.actor_id', officer::text, true);
    res := public.create_survey(officer, jsonb_build_object(
      'id', sid,
      'farmer', jsonb_build_object('name', fname, 'mobile', mobile),
      'crop_id', b.crop_id,
      'area', round(b.area * (0.6 + random()::numeric * 0.5), case when b.area_unit = 'sq_m' then 0 else 2 end), 'area_unit', b.area_unit,
      'survey_number', b.survey_number,
      'sub_division', case when k <= 6 then b.sub_division else coalesce(b.sub_division, '1') || 'B' end,
      'visit_date', (created at time zone 'Asia/Kolkata')::date,
      'latitude', round(b.latitude + (0.00015 + random()::numeric * 0.0003) * (case when k % 2 = 0 then 1 else -1 end), 7),
      'longitude', round(b.longitude + (0.0001 + random()::numeric * 0.0002), 7),
      'gps_accuracy', 4 + floor(random() * 8)::int,
      'duplicate_reason', case k when 1 then 'previous_data_incorrect' when 2 then 'different_farmer' when 3 then 'different_portion_of_land'
                                 when 4 then 'previous_survey_unavailable' when 5 then 'different_farmer' when 6 then 'other'
                                 when 8 then 'different_farmer' else 'different_portion_of_land' end,
      'duplicate_reason_notes', case k when 6 then 'Boundary dispute between brothers; panchayat asked for a fresh survey.'
                                       when 1 then 'Earlier area recorded in guntha by mistake.'
                                       when 3 then 'Northern half of the plot, separated by a nullah.'
                                       else null end,
      'notes', 'Re-survey. ' || coalesce(b.notes, '')
    ));
    update public.surveys set created_at = created, updated_at = created,
      submission_status = case when k in (1, 4) then 'approved' else 'pending' end
    where id = sid;

    -- Supervisor review outcomes on the detected matches
    perform set_config('app.actor_id', reviewer::text, true);
    update public.duplicate_matches set
      status = case k when 1 then 'confirmed_duplicate' when 2 then 'not_duplicate' when 3 then 'not_duplicate'
                      when 4 then 'confirmed_duplicate' when 5 then 'needs_verification' when 7 then 'not_duplicate'
                      when 8 then 'needs_verification' else status end,
      notes = case k when 1 then 'Same plot and owner; keeping the corrected record.'
                     when 2 then 'Different owner confirmed from 7/12 extract.'
                     when 3 then 'Separate portion verified on site.'
                     when 4 then 'Duplicate entry of the same visit.'
                     when 5 then 'Ownership unclear, requested field verification by the talathi.'
                     when 7 then 'Adjacent sub-division, not a duplicate.'
                     when 8 then 'Please re-check GPS point with the farmer.'
                     else notes end
    where survey_id = sid and k in (1, 2, 3, 4, 5, 7, 8);
  end loop;

  perform set_config('app.actor_id', '', true);
  update public.profiles set role = 'user' where id = any (officers);
end $$;

------------------------------------------------------------------------------
-- 1/14 forms for every demo plot, farmer profiles, schemes and applications
------------------------------------------------------------------------------
do $$
declare
  officers uuid[];
  reviewer uuid;
  r record;
  v_village text; v_taluka text; v_note text;
  v_class text; v_irr text; v_rabi uuid; v_area numeric; v_form uuid;
  female text[] := array['Maria Pereira','Rosy Fernandes','Shobha Naik','Laxmi Gaonkar','Sunita Parab','Babli Gaude','Deepa Sawant'];
  male_first text[] := array['Dattaram','Vishwanath','Shankar','Madhukar','Sadanand','Gopal','Pandurang','Joaquim','Antonio','Caetano'];
  f record;
  c_veg uuid; c_pulses uuid;
begin
  perform setseed(0.414);
  select array_agg(id order by email) into officers
    from auth.users where email in ('pratik.naik@fieldsurvey.app', 'sneha.kamat@fieldsurvey.app', 'rohan.fernandes@fieldsurvey.app');
  select id into reviewer from auth.users where email = 'admin@fieldsurvey.app';
  reviewer := coalesce(reviewer, officers[1]);
  select id into c_veg from public.crops where name = 'Vegetables';
  select id into c_pulses from public.crops where name = 'Pulses';

  -- 1/14 form per demo survey (re-surveys get their own form, so duplicates show up as forms too).
  for r in
    select s.*, c.name as crop
      from public.surveys s join public.crops c on c.id = s.crop_id
     where s.collected_by = any (officers) and s.land_record_id is null
     order by s.created_at
  loop
    v_note := regexp_replace(coalesce(r.notes, ''), '^Re-survey\. ', '');
    v_village := btrim(split_part(v_note, ',', 1));
    v_taluka := btrim(replace(split_part(split_part(v_note, ',', 2), '.', 1), ' taluka', ''));
    if not (v_taluka = any (private.goa_talukas())) then v_taluka := 'Bardez'; end if;
    if v_village = '' then v_village := 'Aldona'; end if;

    v_class := case
      when r.crop = 'Paddy' and v_taluka in ('Tiswadi', 'Salcete', 'Mormugao') then 'khazan'
      when r.crop in ('Paddy', 'Vegetables', 'Pulses') then 'paddy'
      when r.crop in ('Coconut', 'Arecanut', 'Black Pepper', 'Banana', 'Sugarcane') then 'garden'
      else 'dry' end;
    v_irr := case
      when r.crop in ('Arecanut', 'Banana', 'Black Pepper') then (array['well', 'borewell'])[1 + floor(random() * 2)::int]
      when r.crop = 'Coconut' then 'well'
      when r.crop = 'Sugarcane' then 'canal'
      when r.crop = 'Vegetables' then 'well'
      else 'rainfed' end;
    v_rabi := case when r.crop = 'Paddy' and random() < 0.5 then (case when random() < 0.5 then c_veg else c_pulses end) end;
    v_area := case r.area_unit when 'hectare' then r.area * 10000 when 'acre' then r.area * 4046.86 when 'sq_m' then r.area else r.area * 10000 end;

    v_form := gen_random_uuid();
    perform set_config('app.actor_id', r.collected_by::text, true);
    insert into public.land_records (
      id, farmer_id, village, taluka, survey_number, sub_division, occupant_names, tenant_name, area_sq_m,
      land_class, assessment_rs, kharif_crop_id, rabi_crop_id, irrigation_source, mutation_number, remarks,
      status, created_by, created_at, updated_at
    ) values (
      v_form, r.farmer_id, v_village, v_taluka, r.survey_number, r.sub_division,
      (select name from public.farmers where id = r.farmer_id),
      case when random() < 0.12 then (array['Mahadev Gawde','Lucas Fernandes','Narayan Velip'])[1 + floor(random() * 3)::int] end,
      round(v_area * (1 + (random() - 0.5) * 0.1)),
      v_class, round((v_area / 10000 * (8 + random() * 30))::numeric, 2),
      case when r.crop in ('Vegetables', 'Pulses') then (select id from public.crops where name = 'Paddy') else r.crop_id end,
      case when r.crop in ('Vegetables', 'Pulses') then r.crop_id else v_rabi end,
      v_irr,
      case when random() < 0.4 then 'M-' || (1000 + floor(random() * 8000)::int) end,
      null,
      case r.submission_status when 'approved' then 'verified' when 'rejected' then 'rejected' else 'pending' end,
      r.collected_by, r.created_at - interval '5 minutes', r.created_at
    );
    update public.surveys set land_record_id = v_form where id = r.id;
  end loop;

  -- Farmer profiles (village/taluka from their first plot).
  for f in
    select fa.id, fa.name,
           (select village from public.land_records where farmer_id = fa.id order by created_at limit 1) as village,
           (select taluka from public.land_records where farmer_id = fa.id order by created_at limit 1) as taluka
      from public.farmers fa
     where exists (select 1 from public.surveys s where s.farmer_id = fa.id and s.collected_by = any (officers))
  loop
    update public.farmers set
      village = coalesce(village, f.village),
      taluka = coalesce(taluka, f.taluka),
      gender = coalesce(gender, case when f.name = any (female) then 'female' else 'male' end),
      category = coalesce(category, (array['general','general','general','general','general','obc','obc','obc','st','sc'])[1 + floor(random() * 10)::int]),
      father_name = coalesce(father_name, male_first[1 + floor(random() * array_length(male_first, 1))::int] || ' ' || split_part(f.name, ' ', 2)),
      address = coalesce(address, 'H.No. ' || (100 + floor(random() * 800)::int) || ', ' || f.village || ', ' || f.taluka || ', Goa')
    where id = f.id;
  end loop;

  -- Demo subsidy schemes (clearly marked as demo).
  perform set_config('app.actor_id', reviewer::text, true);
  insert into public.subsidy_schemes (code, name, category, department, description, benefit, subsidy_percent, max_amount_rs, rules, created_by) values
    ('DEMO-TRACTOR', 'Subsidy on purchase of tractor (up to 45 HP)', 'tractor', 'Directorate of Agriculture, Goa (demo)',
     'Demo scheme for review. Assistance towards purchase of a new tractor by an individual farmer.', '50% of cost', 50, 300000,
     jsonb_build_object('min_land_sq_m', 10000, 'cooldown_years', 7, 'max_applications_per_farmer', 1, 'require_verified_land', true), reviewer),
    ('DEMO-POWER-TILLER', 'Power tiller / power weeder subsidy', 'equipment', 'Directorate of Agriculture, Goa (demo)',
     'Demo scheme for review. For small and marginal holdings.', '50% of cost', 50, 100000,
     jsonb_build_object('min_land_sq_m', 2000, 'max_land_sq_m', 40000, 'cooldown_years', 5), reviewer),
    ('DEMO-DRIP', 'Drip / sprinkler irrigation assistance', 'subsidy', 'Directorate of Agriculture, Goa (demo)',
     'Demo scheme for review. Micro-irrigation for horticulture and plantation crops.', '75% of cost', 75, 50000,
     jsonb_build_object('eligible_crop_ids', (select jsonb_agg(id) from public.crops where name in ('Arecanut','Coconut','Banana','Vegetables','Black Pepper','Pineapple')), 'cooldown_years', 3), reviewer),
    ('DEMO-CASHEW', 'Cashew plantation rejuvenation', 'subsidy', 'Directorate of Agriculture, Goa (demo)',
     'Demo scheme for review. Replacement of senile cashew trees with high-yielding grafts.', '₹40,000 per hectare', null, 120000,
     jsonb_build_object('eligible_crop_ids', (select jsonb_agg(id) from public.crops where name = 'Cashew'), 'min_land_sq_m', 5000,
       'eligible_talukas', jsonb_build_array('Pernem','Bicholim','Sattari','Dharbandora','Sanguem','Quepem','Canacona')), reviewer),
    ('DEMO-KHAZAN', 'Khazan bund repair assistance', 'subsidy', 'Directorate of Agriculture, Goa (demo)',
     'Demo scheme for review. Repair of sluice gates and bunds in khazan lands.', '90% of repair cost', 90, 75000,
     jsonb_build_object('eligible_crop_ids', (select jsonb_agg(id) from public.crops where name = 'Paddy'),
       'eligible_talukas', jsonb_build_array('Tiswadi','Salcete','Bardez','Mormugao','Pernem'), 'cooldown_years', 2), reviewer),
    ('DEMO-SCST-MECH', 'Farm mechanisation for SC/ST farmers', 'equipment', 'Directorate of Agriculture, Goa (demo)',
     'Demo scheme for review. Higher assistance for scheduled caste / scheduled tribe farmers.', '90% of cost', 90, 150000,
     jsonb_build_object('eligible_categories', jsonb_build_array('sc','st'), 'cooldown_years', 5), reviewer),
    -- Services / benefits without eligibility rules (a history of what was given).
    ('DEMO-LPG', 'LPG gas cylinder connection', 'cylinder', 'Civil Supplies Department, Goa (demo)',
     'Demo record type. Free LPG connection with first refill and stove.', 'Connection + first refill', null, 3200, '{}'::jsonb, reviewer),
    ('DEMO-SOIL-CARD', 'Soil health card & soil testing', 'service', 'Directorate of Agriculture, Goa (demo)',
     'Demo record type. Soil sample tested; nutrient card issued to the farmer.', 'Free soil test', null, null, '{}'::jsonb, reviewer),
    ('DEMO-INCOME', 'Farmer income support (annual)', 'government_scheme', 'Government of Goa (demo)',
     'Demo record type. Annual direct benefit transfer in instalments.', '₹6,000 per year', null, 6000, '{}'::jsonb, reviewer),
    ('DEMO-SPRAYER', 'Battery-operated knapsack sprayer', 'equipment', 'Company services (demo)',
     'Demo record type. Sprayer handed over at the company office.', 'Free sprayer', null, 4500, '{}'::jsonb, reviewer)
  on conflict (code) do nothing;

  -- Application history: each application goes to a scheme that fits the farmer
  -- (category, crop, land class, taluka, holding size), with a mix of outcomes.
  insert into public.subsidy_applications (farmer_id, scheme_id, land_record_id, status, amount_rs, applied_on, decided_at, remarks, created_by, updated_by)
  select p.farmer_id, sc.id, p.form_id, x.status, least(x.amount, coalesce(sc.max_amount_rs, x.amount)), x.applied_on,
         case when x.status in ('approved','rejected','disbursed') then (x.applied_on + 30)::timestamptz end,
         x.remarks, reviewer, reviewer
    from (
      select lr.farmer_id, lr.id as form_id, lr.area_sq_m, lr.land_class, lr.taluka, lr.status as form_status,
             kc.name as crop, fa.category, row_number() over (order by lr.created_at) as rn
        from public.land_records lr
        join public.farmers fa on fa.id = lr.farmer_id
        left join public.crops kc on kc.id = lr.kharif_crop_id
       where lr.created_by = any (officers)
    ) p
    cross join lateral (
      select
        case
          when p.category in ('sc', 'st') then 'DEMO-SCST-MECH'
          when p.crop = 'Cashew' and p.taluka in ('Pernem','Bicholim','Sattari','Dharbandora','Sanguem','Quepem','Canacona') and p.area_sq_m >= 5000 then 'DEMO-CASHEW'
          when p.land_class = 'khazan' then 'DEMO-KHAZAN'
          when p.crop in ('Arecanut','Coconut','Banana','Vegetables','Black Pepper','Pineapple') then 'DEMO-DRIP'
          when p.area_sq_m >= 10000 and p.form_status = 'verified' then 'DEMO-TRACTOR'
          else 'DEMO-POWER-TILLER'
        end as code,
        (array['disbursed','approved','under_review','applied','rejected','disbursed','applied'])[1 + (p.rn % 7)::int] as status,
        (array[150000, 45000, 30000, 60000, 0, 25000, 50000])[1 + (p.rn % 7)::int]::numeric as amount,
        (current_date - ((p.rn * 47) % 700)::int) as applied_on,
        (array['Released to bank account via DBT.', 'Sanctioned by the Zonal Agriculture Officer.', 'Field verification scheduled.',
               'Documents received at the ZAO office.', 'Rejected: 7/12 extract not in applicant''s name.', 'Amount credited.', null])[1 + (p.rn % 7)::int] as remarks
    ) x
    join public.subsidy_schemes sc on sc.code = x.code
   where p.rn % 4 = 1
      or (p.category in ('sc', 'st') and p.rn % 4 = 3)
   limit 18;

  update public.subsidy_applications set amount_rs = null where status = 'rejected' and amount_rs = 0;

  -- Services / benefits history (received, applied, pending, rejected) for the demo farmers.
  insert into public.subsidy_applications (farmer_id, scheme_id, status, amount_rs, applied_on, decided_at, remarks, created_by, updated_by)
  select fm.farmer_id, sc.id, x.status, case when x.status = 'disbursed' then sc.max_amount_rs end,
         x.applied_on, case when x.status in ('approved','rejected','disbursed') then (x.applied_on + 15)::timestamptz end,
         x.remarks, reviewer, reviewer
    from (
      select fa.id as farmer_id, row_number() over (order by fa.created_at, fa.id) as rn
        from public.farmers fa
       where exists (select 1 from public.land_records lr where lr.farmer_id = fa.id and lr.created_by = any (officers))
    ) fm
    cross join lateral (values
      ('DEMO-LPG',       fm.rn % 3 <> 0, (array['disbursed','disbursed','applied'])[1 + (fm.rn % 3)::int]),
      ('DEMO-SOIL-CARD', fm.rn % 2 = 0,  'disbursed'),
      ('DEMO-INCOME',    fm.rn % 4 <> 3, (array['disbursed','disbursed','under_review','rejected'])[1 + (fm.rn % 4)::int]),
      ('DEMO-SPRAYER',   fm.rn % 5 = 1,  (array['approved','disbursed'])[1 + (fm.rn % 2)::int]),
      ('DEMO-TRACTOR',   fm.rn % 6 = 2,  (array['disbursed','disbursed','approved'])[1 + ((fm.rn / 6) % 3)::int])
    ) v(code, include, st)
    cross join lateral (
      select v.st as status,
             (current_date - ((fm.rn * 37 + length(v.code) * 11) % 500)::int) as applied_on,
             case v.st
               when 'disbursed' then 'Received by the farmer.'
               when 'approved' then 'Approved — ready for hand-over at the office.'
               when 'under_review' then 'Documents being verified.'
               when 'rejected' then 'Rejected: bank account not seeded with Aadhaar.'
               else 'Application received.' end as remarks
    ) x
    join public.subsidy_schemes sc on sc.code = v.code
   where v.include;
  perform set_config('app.actor_id', '', true);
end $$;

------------------------------------------------------------------------------
-- Recent 1/14 forms entered by the admin (pending / verified / rejected mix),
-- including one duplicate survey number for the duplicate review screens.
------------------------------------------------------------------------------
do $$
declare
  actor uuid;
  reviewer uuid;
  plots jsonb := '[
    ["Assagao","Bardez",15.5953,73.7683,"Paddy","paddy","rainfed",6200,"Ravindra Naik","9000031001","general",0],
    ["Moira","Bardez",15.5960,73.8480,"Coconut","garden","well",4300,"Lourdes Fernandes","9000031002","general",0],
    ["Aldona","Bardez",15.5926,73.8741,"Paddy","paddy","well",8800,"Sitaram Gawas","9000031003","obc",0],
    ["Mayem","Bicholim",15.5690,73.9290,"Cashew","dry","rainfed",15500,"Narayan Gaude","9000031004","st",2],
    ["Sanquelim","Sattari",15.5620,74.0080,"Arecanut","garden","borewell",5200,"Prabhakar Kerkar","9000031005","obc",4],
    ["Marcela","Ponda",15.5140,73.9640,"Black Pepper","garden","well",3100,"Sunanda Naik","9000031006","general",6],
    ["Khandepar","Ponda",15.4340,74.0470,"Banana","garden","well",2700,"Vasudev Velip","9000031007","st",9],
    ["Divar","Tiswadi",15.5200,73.8950,"Paddy","khazan","rainfed",11200,"Cristina D''Costa","9000031008","general",12],
    ["Loutolim","Salcete",15.3336,73.9811,"Vegetables","paddy","well",1800,"Agnelo Rebelo","9000031009","general",15],
    ["Rivona","Sanguem",15.1780,74.1080,"Cashew","dry","rainfed",21000,"Bhiku Gaonkar","9000031010","sc",19],
    ["Quepem","Quepem",15.2130,74.0770,"Mango","dry","rainfed",9400,"Pandu Dessai","9000031011","general",24],
    ["Tuem","Pernem",15.6780,73.7940,"Kokum","dry","rainfed",4900,"Shalini Parab","9000031012","obc",29]
  ]';
  p jsonb; i int := 0; v_crop uuid; v_form uuid; v_survey uuid; res jsonb; created timestamptz; dup_sn text; dup_sd text;
begin
  perform setseed(0.31415);
  select id into actor from auth.users where email = 'admin@fieldsurvey.app';
  if actor is null then
    raise notice 'admin@fieldsurvey.app not found; skipping recent admin-entered forms';
    return;
  end if;
  reviewer := actor;

  -- One plot deliberately re-uses an existing demo survey number in the same village (duplicate warning).
  select lr.survey_number, lr.sub_division into dup_sn, dup_sd
    from public.land_records lr where lr.village = 'Aldona' order by lr.created_at limit 1;

  for p in select * from jsonb_array_elements(plots) loop
    i := i + 1;
    select id into v_crop from public.crops where name = p ->> 4;
    v_form := gen_random_uuid();
    v_survey := gen_random_uuid();
    created := date_trunc('day', now()) - make_interval(days => (p ->> 11)::int)
               + make_interval(hours => 9 + (i % 7), mins => (i * 13) % 60);
    if (p ->> 11)::int = 0 then created := least(created, now() - make_interval(mins => 30 + i * 7)); end if;

    perform set_config('app.actor_id', actor::text, true);
    res := public.submit_land_form(actor, jsonb_build_object(
      'farmer', jsonb_build_object(
        'name', p ->> 8, 'mobile', p ->> 9, 'category', p ->> 10,
        'gender', case when (p ->> 8) in ('Lourdes Fernandes','Sunanda Naik','Cristina D''Costa','Shalini Parab') then 'female' else 'male' end,
        'village', p ->> 0, 'taluka', p ->> 1, 'address', 'Near panchayat ghar, ' || (p ->> 0) || ', Goa'),
      'form', jsonb_build_object(
        'id', v_form, 'village', p ->> 0, 'taluka', p ->> 1,
        'survey_number', case when (p ->> 0) = 'Aldona' and dup_sn is not null then dup_sn else (200 + i * 17)::text end,
        'sub_division', case when (p ->> 0) = 'Aldona' and dup_sn is not null then dup_sd else ((i % 4) + 1)::text end,
        'occupant_names', p ->> 8, 'area_sq_m', (p ->> 7)::numeric, 'land_class', p ->> 5,
        'assessment_rs', round(((p ->> 7)::numeric / 10000 * (10 + i))::numeric, 2),
        'kharif_crop_id', v_crop, 'irrigation_source', p ->> 6,
        'mutation_number', case when i % 3 = 0 then 'M-' || (2100 + i * 11) end),
      'survey', jsonb_build_object(
        'id', v_survey, 'crop_id', v_crop,
        'area', round((p ->> 7)::numeric / 10000, 2), 'area_unit', 'hectare',
        'visit_date', (created at time zone 'Asia/Kolkata')::date,
        'latitude', round(((p ->> 2)::numeric + (random()::numeric - 0.5) * 0.006), 7),
        'longitude', round(((p ->> 3)::numeric + (random()::numeric - 0.5) * 0.006), 7),
        'gps_accuracy', 4 + (i % 9),
        'duplicate_reason', case when (p ->> 0) = 'Aldona' and dup_sn is not null then 'different_portion_of_land' end,
        'duplicate_reason_notes', case when (p ->> 0) = 'Aldona' and dup_sn is not null then 'Eastern half of the plot, separate occupant.' end,
        'notes', (p ->> 0) || ', ' || (p ->> 1) || ' taluka. Surveyed with the occupant present.')
    ));

    -- Older records reviewed by the admin; recent ones still pending.
    perform set_config('app.actor_id', reviewer::text, true);
    update public.land_records set
      created_at = created - interval '5 minutes', updated_at = created,
      status = case when (p ->> 11)::int >= 9 then (case when i = 10 then 'rejected' else 'verified' end) else 'pending' end,
      remarks = case when i = 10 then 'Rejected: occupant name differs from the 7/12 extract; resurvey needed.' end
    where id = v_form;
    update public.surveys set created_at = created, updated_at = created,
      submission_status = case when (p ->> 11)::int >= 9 then (case when i = 10 then 'rejected' else 'approved' end) else 'pending' end
    where id = v_survey;
  end loop;
  perform set_config('app.actor_id', '', true);
end $$;

-- Summary
select
  (select count(*) from public.surveys) as surveys,
  (select count(*) from public.land_records) as forms_1_14,
  (select count(*) from public.subsidy_schemes) as schemes,
  (select count(*) from public.subsidy_applications) as applications,
  (select count(*) from public.farmers) as farmers,
  (select count(*) from public.duplicate_matches) as duplicate_matches,
  (select string_agg(duplicate_status || '=' || n, ', ') from (select duplicate_status, count(*) n from public.surveys group by 1) x) as by_duplicate_status,
  (select string_agg(submission_status || '=' || n, ', ') from (select submission_status, count(*) n from public.surveys group by 1) x) as by_status;
