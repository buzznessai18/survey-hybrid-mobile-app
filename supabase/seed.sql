-- Local development seed (runs on `supabase db reset`). Not applied to remote
-- projects by `supabase db push`; run it manually there if wanted.
insert into public.crops (name) values
  ('Paddy'), ('Sugarcane'), ('Vegetables'), ('Wheat'), ('Cotton'),
  ('Maize'), ('Groundnut'), ('Soybean'), ('Pulses'), ('Banana')
on conflict do nothing;
