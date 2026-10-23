-- supabase/demo/seed_demo_records.sql
-- Realistic DEMO farmer equipment / service records (migration 022) for client reviews.
--
-- * 60 records across Goa villages over the last 60 days, during office hours (IST),
--   numbered RC-… in date order. Some farmers come back for a second service.
-- * "Recorded by" the three demo staff accounts (create_demo_accounts.sh), which is
--   also how remove_demo_records.sql finds them again. Real records are never touched.
-- * Audit history gets a record_created entry per record, by its demo creator,
--   dated when the record was created.
--
-- Run (cloud):  supabase db query --linked -f supabase/demo/seed_demo_records.sql

do $$
declare
  officers uuid[];
  n_records int := 60;

  -- farmer name, gender
  farmers jsonb := '[
    ["Ramesh Naik","male"], ["Suresh Gaonkar","male"], ["Prakash Sawant","male"], ["Mahesh Parab","male"],
    ["Santosh Desai","male"], ["Vishnu Kamat","male"], ["Anant Shirodkar","male"], ["Dattaram Gawas","male"],
    ["Tukaram Velip","male"], ["Govind Gaude","male"], ["Joaquim Fernandes","male"], ["Anthony D''Souza","male"],
    ["Francis Rodrigues","male"], ["Maria Pereira","female"], ["Agnelo Colaco","male"], ["Caetano Dias","male"],
    ["Savio Menezes","male"], ["Rosy Fernandes","female"], ["Shobha Naik","female"], ["Laxmi Gaonkar","female"],
    ["Sunita Parab","female"], ["Vasant Harmalkar","male"], ["Uday Bhembre","male"], ["Krishna Kerkar","male"],
    ["Nilesh Kunkolienkar","male"], ["Shrikant Mhamal","male"], ["Raju Velip","male"], ["Pandurang Zarapkar","male"],
    ["Premanand Morajkar","male"], ["Babli Gaude","female"], ["Jose Carvalho","male"], ["Pedro Afonso","male"],
    ["Ashok Salgaonkar","male"], ["Deepa Sawant","female"], ["Xavier Pinto","male"], ["Rajendra Borkar","male"],
    ["Kamlakant Naik","male"], ["Sushila Velip","female"], ["Gangaram Kavlekar","male"], ["Annapurna Dessai","female"],
    ["Shivaji Rane","male"], ["Leena Gawas","female"]
  ]';

  -- village, taluka, PIN
  villages jsonb := '[
    ["Aldona","Bardez","403508"], ["Moira","Bardez","403507"], ["Siolim","Bardez","403517"], ["Assagao","Bardez","403507"],
    ["Pernem","Pernem","403512"], ["Tuem","Pernem","403512"], ["Bicholim","Bicholim","403504"], ["Mayem","Bicholim","403504"],
    ["Valpoi","Sattari","403506"], ["Sanquelim","Sattari","403505"], ["Divar","Tiswadi","403403"], ["Goa Velha","Tiswadi","403108"],
    ["Ponda","Ponda","403401"], ["Marcela","Ponda","403107"], ["Khandepar","Ponda","403406"], ["Bethora","Ponda","403409"],
    ["Loutolim","Salcete","403718"], ["Curtorim","Salcete","403709"], ["Chinchinim","Salcete","403715"], ["Raia","Salcete","403720"],
    ["Quepem","Quepem","403705"], ["Sanguem","Sanguem","403704"], ["Rivona","Sanguem","403704"], ["Chaudi","Canacona","403702"],
    ["Dharbandora","Dharbandora","403406"], ["Verna","Mormugao","403722"]
  ]';

  landmarks jsonb := '["Near Shantadurga Temple", "Opposite Panchayat Office", "Behind Primary School", "Near Chapel",
    "Near Bus Stand", "Next to Co-operative Society", "Near Ration Shop", "Near Church Square", "Off Main Road", "Near Village Well"]';

  -- equipment provided / work completed (free text, as staff would type it)
  services jsonb := '[
    "Tractor provided for land ploughing. Work completed in 3 hours.",
    "Land ploughing completed with tractor and disc plough before kharif sowing.",
    "Power tiller provided for 2 days for paddy field preparation.",
    "Rotavator used for puddling and levelling of paddy field.",
    "Paddy transplanter provided. Transplanting completed on full plot.",
    "Combine harvester provided for paddy harvesting. Harvest completed.",
    "Brush cutter provided for clearing weeds in cashew orchard.",
    "Battery-operated knapsack sprayer provided for pest control.",
    "Diesel water pump set (5 HP) provided for irrigation from well.",
    "Khazan bund repair work completed along 40 m of the field boundary.",
    "Drip irrigation lines laid for arecanut garden. Installation completed.",
    "Tractor with trolley provided to transport coconut husk and farmyard manure.",
    "Power weeder provided for vegetable plot. Weeding completed.",
    "Land levelling completed with tractor and leveller blade.",
    "Coconut climbing device provided and farmer trained in its use.",
    "Chaff cutter provided for fodder preparation.",
    "Mini tractor provided for inter-cultivation in arecanut plantation.",
    "Sprinkler set provided for rabi vegetables.",
    "Tractor provided for ploughing; seed drill used for sowing cowpea (alsando).",
    "Agricultural equipment provided: spade, sickle, crowbar and pruning saw.",
    "Earth auger used to dig 60 pits for new cashew grafts. Work completed.",
    "Paddy thresher provided for 1 day. Threshing completed.",
    "Bund trimming and field channel cleaning completed before monsoon.",
    "Tractor provided for ploughing; farmer to return for harrowing next week.",
    "Other agricultural work completed: clearing and burning of dry cashew leaves under supervision."
  ]';

  i int;
  f jsonb; v jsonb; svc text;
  sn text; sd text; unit text; size numeric; addr text; ts timestamptz; officer uuid;
  rid uuid;
  repeat_pool jsonb := '[]';
begin
  select array_agg(u.id order by u.email) into officers
    from auth.users u join public.profiles p on p.id = u.id
   where u.email in ('pratik.naik@fieldsurvey.app', 'sneha.kamat@fieldsurvey.app', 'rohan.fernandes@fieldsurvey.app')
     and p.status = 'active';
  if coalesce(array_length(officers, 1), 0) = 0 then
    raise exception 'Create the demo accounts first (supabase/demo/create_demo_accounts.sh)';
  end if;
  if exists (select 1 from public.service_records where created_by = any (officers)) then
    raise exception 'Demo records already present. Run remove_demo_records.sql first.';
  end if;

  perform setseed(0.22);

  -- Timestamps first, oldest first, so RC numbers follow the dates.
  create temporary table demo_times on commit drop as
    select (date_trunc('day', now() at time zone 'Asia/Kolkata') - make_interval(days => d)
            + make_interval(hours => 9 + floor(random() * 8)::int, mins => floor(random() * 60)::int))
           at time zone 'Asia/Kolkata' as ts
      from (select 1 + floor(random() * 60)::int as d from generate_series(1, n_records)) x
     order by 1;

  i := 0;
  for ts in select t.ts from demo_times t order by t.ts loop
    i := i + 1;
    -- Every 6th record is a returning farmer (same plot, another service).
    if i % 6 = 0 and jsonb_array_length(repeat_pool) > 0 then
      f   := repeat_pool -> floor(random() * jsonb_array_length(repeat_pool))::int;
      sn  := f ->> 'sn'; sd := f ->> 'sd'; unit := f ->> 'unit'; size := (f ->> 'size')::numeric; addr := f ->> 'addr';
      f   := f -> 'farmer';
    else
      f := farmers -> floor(random() * jsonb_array_length(farmers))::int;
      v := villages -> floor(random() * jsonb_array_length(villages))::int;
      sn := (10 + floor(random() * 480))::int::text;
      sd := case when random() < 0.8
                 then (1 + floor(random() * 12))::int::text || case when random() < 0.3 then chr(65 + floor(random() * 3)::int) else '' end
            end;
      if random() < 0.75 then
        unit := 'acre';
        size := round((0.25 + random() * 4.75)::numeric * 4) / 4;                -- 0.25 .. 5 acres in quarters
      else
        unit := 'sq_m';
        size := round((400 + random() * 11600)::numeric / 50) * 50;             -- 400 .. 12,000 sq m
      end if;
      addr := 'H. No. ' || (1 + floor(random() * 450))::int || case when random() < 0.25 then '/' || chr(65 + floor(random() * 3)::int) else '' end
              || ', ' || (landmarks ->> floor(random() * jsonb_array_length(landmarks))::int) || E',\n'
              || (v ->> 0) || ', ' || (v ->> 1) || ', Goa ' || (v ->> 2);
      if random() < 0.35 then
        repeat_pool := repeat_pool || jsonb_build_object('farmer', f, 'sn', sn, 'sd', sd, 'unit', unit, 'size', size, 'addr', addr);
      end if;
    end if;

    svc := services ->> floor(random() * jsonb_array_length(services))::int;
    officer := officers[1 + floor(random() * array_length(officers, 1))::int];
    rid := gen_random_uuid();

    perform set_config('app.actor_id', officer::text, true);   -- audit entry by the demo creator
    insert into public.service_records (
      id, farmer_name, gender, address, survey_number, sub_division, land_size, land_unit,
      service_details, created_by, created_at, updated_at
    ) values (
      rid, f ->> 0, case when random() < 0.9 then f ->> 1 end, case when random() < 0.92 then addr end,
      sn, sd, size, unit, svc, officer, ts, ts
    );
    update public.audit_logs set created_at = ts
     where entity_type = 'record' and entity_id = rid and action = 'record_created';
  end loop;

  raise notice 'Inserted % demo service records', n_records;
end;
$$;
