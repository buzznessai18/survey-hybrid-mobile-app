# Field Survey — Supabase Backend

This is the backend for the Field Survey mobile app, built on Supabase (Postgres + PostGIS, Auth, Storage, and Deno Edge Functions).
It does not include a web or admin frontend. The mobile app uses only the public Supabase URL, the anon key, and the logged-in user's session.

```
supabase/
  config.toml                  local stack + function config (public signup disabled)
  seed.sql                     default crops (local only)
  migrations/
    001_create_profiles.sql    extensions, private schema, profiles, auth.users trigger
    002_create_farmers.sql
    003_create_crops.sql
    004_create_surveys.sql     surveys, app_settings (radius), survey code generator
    005_create_duplicate_matches.sql
    006_create_audit_logs.sql  audit table + triggers
    007_enable_rls.sql         RLS helpers, guard triggers, policies
    008_create_indexes.sql
    009_business_functions.sql duplicate detection, create/update survey, admin profile update
    010_storage.sql            field-photos bucket + storage policies
    011_views_and_reports.sql  survey_details view, map points, report aggregates
  functions/
    _shared/                   auth, validation (zod), HTTP helpers, survey helpers
    check-survey-duplicate/    create-survey/      update-survey/
    get-my-surveys/            get-survey/         search-surveys/
    review-duplicate/          get-survey-map-data/
    get-reports/               admin-users/
tests/api.test.ts              end-to-end tests (auth, RLS, duplicates, idempotency, storage…)
```

Beyond the requested set, there are three extra functions and three extra migrations. `update-survey` handles surveyor edits and runs duplicate detection again when the key fields change. `admin-users` handles admin user and role management. `get-reports` returns the dashboard and report numbers. The extra migrations are 009–011.

---

## ⚠️ Current access model (migrations 012–014 — supersedes the original brief)

| Who | How they get in | Can do |
|---|---|---|
| **Admin** | Signs in (email or mobile + password) | The **only** role that creates surveys (`create-survey`), edits them (`update-survey`), uploads photos, reviews duplicates, exports CSV and manages admins (`admin-users`). Full data. |
| **Anyone (guest)** | **No account.** The app calls the read endpoints with the public anon key only | Search (`search-surveys`), view (`get-survey`), map (`get-survey-map-data`) and reports (`get-reports`, scope `all`) on **every** survey. Farmer mobile numbers are **masked** (`******3210`). No writes. |
| `user` accounts | Legacy / optional | Same read-only access as guests, also through the functions only. |

How it works:
- The read endpoints use `requireViewer()` (`functions/_shared/auth.ts`). A request that carries the anon key instead of a user JWT is served as a guest.
- Viewers and guests have **no direct table access**; migration 014 removed those policies. This way the functions decide exactly which fields go out and mask mobiles, and the REST API can't be used to bypass them.
- Public signup and anonymous sign-ins stay **disabled**.

## 1. Database schema

| Table | Purpose / key columns |
|---|---|
| `profiles` | One row per `auth.users` row. Columns: `full_name`, `mobile`, `role` (`field_surveyor` \| `supervisor` \| `admin`), `status` (`pending` \| `active` \| `inactive`), and `supervisor_id` (the supervisor a surveyor is assigned to). A trigger creates the row on signup as **field_surveyor + pending**. The role is never read from user metadata. |
| `farmers` | `name`, `mobile` (normalised to 10 digits), `created_by`. Unique on `(mobile, lower(name))`, because families often share one phone. One farmer can have many surveys. |
| `crops` | `name` (unique, case-insensitive), `status` (`active`/`inactive`). Admins manage this table. |
| `surveys` | `id` is the **client-generated UUID** and also the idempotency key. `survey_id` is the readable code (`SV-000123`). Other columns: `farmer_id`, `crop_id`, `area > 0`, `area_unit` (`acre, hectare, guntha, cent, bigha, sq_m`), `survey_number`, `sub_division`, the normalised `survey_number_norm`/`sub_division_norm` (generated), `visit_date`, `collected_by`, `latitude`/`longitude`/`gps_accuracy`, `location geography(Point,4326)` (generated from lat/lng), `photo_path`, `duplicate_status`, `submission_status` (`pending`/`approved`/`rejected`), `duplicate_reason` + `duplicate_reason_notes`, `notes`, and timestamps. |
| `duplicate_matches` | One row per new survey → existing survey match. Columns: `match_type` (`exact` \| `proximity` \| `exact_and_proximity`), `distance_meters`, `status` (`pending` \| `confirmed_duplicate` \| `not_duplicate` \| `needs_verification`), `reviewed_by`, `reviewed_at`, `notes`. |
| `audit_logs` | `user_id`, `action`, `entity_type`, `entity_id`, `metadata jsonb`, `created_at`. Only triggers write to it, so clients can't skip or forge entries. |
| `app_settings` | Runtime settings: `duplicate_radius_meters` (default **100**) and `report_timezone` (default `Asia/Kolkata`). |

**`surveys.duplicate_status`** is derived from the survey's matches by `private.refresh_survey_duplicate_status`:
- `unique`: no matches.
- `duplicate`: an exact match is pending review.
- `possible_duplicate`: only proximity matches are pending.
- `needs_verification`: a reviewer asked for verification.
- `confirmed_duplicate`: at least one match was confirmed.
- `not_duplicate`: every match was cleared.

**Audit actions.** Each action below is written by a trigger:
- `survey_created`, `survey_updated` (with a from/to diff), `survey_deleted`
- `duplicate_detected`, `duplicate_reviewed`
- `user_role_changed`, `user_updated` (status or supervisor changes)

The acting user is `auth.uid()`. When an Edge Function runs a privileged database function, the acting user is passed through `set_config('app.actor_id')` instead.

**Reporting.** The report data lives in the `survey_details` view (security-invoker), `get_survey_map_points(...)`, and `get_survey_report(...)`. Because they run as the caller, RLS limits the results automatically.

## 2. Edge Functions

All functions require `Authorization: Bearer <user access token>`. Each one checks the token with Supabase Auth, loads the user's **profile from the database** (never from JWT claims), rejects non-active users, and checks the role.

| Function | Roles | What it does |
|---|---|---|
| `check-survey-duplicate` | any active | Checks for duplicates before submitting. Returns exact and GPS matches (limited summaries only), the nearest distance, the radius in use, and optionally the farmer's other surveys (`farmer_mobile`). It never blocks. |
| `create-survey` | field_surveyor | The main submission endpoint. It validates the input and checks that the photo exists in storage. It then calls `public.create_survey` as **one transaction**, which: 1. takes a lock on the survey number, 2. runs the idempotency check, 3. checks the crop, 4. creates or reuses the farmer, 5. runs duplicate detection, 6. inserts the survey, 7. inserts the matches, 8. writes the audit entries. It returns the full survey with its duplicate info. **Idempotent** on `id`: a new survey returns `201`, and a replay of the same `id` returns `200` with `idempotent_replay: true`. |
| `update-survey` | field_surveyor (own, pending), admin | Partial update. If the survey number, sub-division or GPS changes, duplicate detection runs again (reviewed matches are kept). Admins can also set `submission_status`. |
| `get-my-surveys` | field_surveyor | Lists the caller's own surveys. Supports pagination, `search`, `status`, `duplicate_status`, `date_from`/`date_to`, `updated_since` (for offline sync), and `include_photo_urls`. |
| `get-survey` | any active | Full detail by `id` or `survey_id`. Includes a signed photo URL and the duplicate matches with a summary of each matched survey and its review info. RLS decides who can see what, so an unauthorised caller gets a 404. |
| `search-surveys` | supervisor (team only), admin | Filters: `search`, `farmer_name`, `farmer_mobile`, `survey_number`, `sub_division`, `crop_id`/`crop`, `surveyor_id`, date range, `duplicate_status`, `status`, sort and paging. Admins can also request `format: "csv"` for an export. |
| `review-duplicate` | supervisor (assigned surveyors), admin | Sets a match's `status` and `notes`. Triggers stamp `reviewed_by`/`reviewed_at`, write the audit entry, and recompute the survey's `duplicate_status`. |
| `get-survey-map-data` | any active (RLS-scoped) | Returns lightweight points inside a **bounding box** (`min_lat,min_lng,max_lat,max_lng`) using the GiST index. Supports filters and a `limit` (default 500, max 5000), and sets `truncated` when there were more points. |
| `get-reports` | any active (RLS-scoped) | Returns the total, today's count, the duplicate count, pending reviews, and breakdowns by submission status, duplicate status, crop, surveyor and date. The scope depends on role: surveyor = own, supervisor = team, admin = all. |
| `admin-users` | admin | `list` / `create` / `update` users. Covers role, status, supervisor assignment, name and mobile. Setting a user inactive also bans them in Auth. Admins cannot demote or deactivate themselves. |

Errors always look like `{ "error": { "code", "message", "details?" } }`. The codes used are:
- `400` invalid_json
- `401` unauthorized
- `403` forbidden / account_inactive
- `404` not_found
- `409` conflict
- `422` validation_error (`details.fields` maps each field to its message)

## 3. Authentication flow

1. **Accounts are provisioned, not self-registered.** `enable_signup = false`. An admin creates users through `admin-users` (email + password and/or phone). The admin-created user is set to `active` with the chosen role.
2. The **app signs in** with the Supabase client, using either:
   - Phone OTP (the "Mobile Number" tab): `supabase.auth.signInWithOtp({ phone, options: { shouldCreateUser: false } })`, then `verifyOtp`. This needs an SMS provider (Twilio, MessageBird, Textlocal, Vonage…) configured under Auth › Providers › Phone.
   - Password (the "Username" tab): `signInWithPassword({ email, password })`.
3. The app **reads its own profile** (`from('profiles').select().eq('id', user.id)`) to get the role and status for routing.
4. The app calls the Edge Functions with `supabase.functions.invoke(name, { body })`. The SDK attaches the access token automatically. The gateway checks the JWT (`verify_jwt = true`), and the function checks it again and then checks the role.
5. **The role can't be changed by the client.** A guard trigger rejects any non-admin change to `role`/`status`/`supervisor_id`. Admin changes go through `admin-users` and are audited.
6. Deactivating a user sets `status = inactive`, which makes RLS return nothing and the functions return 403. It also bans the user in Auth, so they can't refresh their session.

**Bootstrap the first admin** (once, from the SQL editor), after creating the user in Dashboard › Authentication:
```sql
update public.profiles set role = 'admin', status = 'active' where id = '<auth-user-uuid>';
```

## 4. Duplicate detection flow

```
Surveyor enters Survey No + Sub-Division (+ GPS, farmer mobile)
        │
        ▼
check-survey-duplicate ──► public.find_survey_duplicates()
        │     normalise: trim, upper-case, remove spaces ("12 a" == "12A")
        │     exact      : same survey_number + sub_division  (any distance)
        │     proximity  : same survey_number within app_settings.duplicate_radius_meters
        │                  (PostGIS ST_DWithin on geography → metres)
        │     excludes rejected surveys; exact matches first, then by distance
        ▼
{ duplicate_found, possible_duplicate, nearest_distance_meters, matches[], farmer_surveys[] }
        │
        │  App shows "Possible Duplicate Found" → surveyor picks a reason → "Submit Anyway"
        ▼
create-survey (never rejected for being a duplicate)
        │  one transaction + advisory lock per survey number (concurrent 125/2 submissions see each other)
        ├─ insert survey with duplicate_status = duplicate | possible_duplicate | unique
        ├─ insert duplicate_matches (status = pending)      → audit: duplicate_detected
        ▼
Supervisor/admin: search-surveys (duplicate_status=duplicate) → get-survey → review-duplicate
        └─ trigger stamps reviewer, recomputes surveys.duplicate_status → audit: duplicate_reviewed
```

- `duplicate_found = true` means there is at least one exact (survey number + sub-division) match.
- `possible_duplicate = true` means at least one same-survey-number record lies within the radius. An exact match that is within the radius sets both flags.
- A farmer having other surveys is **only informational** (`farmer_surveys`). It never raises a duplicate flag.
- **Change the radius** without redeploying:
  ```sql
  update app_settings set value = '150' where key = 'duplicate_radius_meters';
  ```
  Admins can also update the `app_settings` table directly through the API.
- **Privacy.** A surveyor looking at another surveyor's record in a warning sees the farmer mobile masked (`******3210`) and a signed photo URL that expires.

## 5. RLS permission matrix

✅ = allowed. "EF" = only through an Edge Function (service role + validated database function).

| Resource | field_surveyor | supervisor | admin |
|---|---|---|---|
| `profiles` SELECT | own | own + assigned surveyors | all |
| `profiles` UPDATE | own name/mobile only (guard trigger) | own name/mobile only | all (use `admin-users` for audited role changes) |
| `farmers` SELECT | farmers on own surveys | farmers on team surveys | all |
| `farmers` INSERT/UPDATE | EF (`create-survey`) | ✗ | ✅ |
| `crops` SELECT | ✅ | ✅ | ✅ |
| `crops` INSERT/UPDATE/DELETE | ✗ | ✗ | ✅ |
| `surveys` SELECT | own | assigned surveyors' | all |
| `surveys` INSERT | EF (`create-survey`) only | ✗ | ✅ |
| `surveys` UPDATE | own + `pending`. Directly: descriptive fields only. Survey no./sub-division/GPS: EF (`update-survey`) | ✗ | ✅ |
| `surveys` DELETE | ✗ | ✗ | ✅ (audited) |
| `duplicate_matches` SELECT | on own surveys | on team surveys | all |
| `duplicate_matches` UPDATE | ✗ | team: `status`/`notes` only | ✅ |
| `audit_logs` SELECT | ✗ | ✗ | ✅ (nobody can write directly) |
| `app_settings` SELECT / write | read | read | read/write |
| Storage `field-photos` upload | own folder `{uid}/{uuid}/file` | ✗ | ✗ (uses signed URLs) |
| Storage `field-photos` read | own folder | signed URLs from EFs | signed URLs from EFs |

Further rules:
- `anon` has no table access.
- Inactive and pending users get no rows.
- The business functions (`create_survey`, `update_survey`, `find_survey_duplicates`, `admin_update_profile`) can be executed **only by `service_role`**.
- Internal helpers live in the `private` schema, which the API does not expose.

## 6. Deployment

```bash
# one-time
npm i -g supabase            # or: brew install supabase/tap/supabase
supabase login
supabase link --project-ref <project-ref>

# database (migrations 001-011)
supabase db push
# default crops (optional, remote)
psql "<connection-string from Dashboard › Connect>" -f supabase/seed.sql
#   …or paste supabase/seed.sql into the Dashboard SQL editor

# optional function secrets
supabase secrets set --env-file supabase/functions/.env

# all functions
supabase functions deploy
#   or one by one: supabase functions deploy create-survey
```

Dashboard settings:
- **Auth › Sign In / Providers:** turn off "Allow new users to sign up".
- **Auth › Phone:** enable it and configure an SMS provider for OTP login.
- **Database › Extensions:** PostGIS is enabled by migration 001, in the `extensions` schema.
- Create the first admin (see §3).

Local development:
```bash
supabase start                     # applies migrations + seed.sql
supabase functions serve           # serves all functions on http://127.0.0.1:54321/functions/v1/*
supabase db reset                  # re-apply everything from scratch
```

## 7. Mobile app environment variables

| Variable | Value |
|---|---|
| `SUPABASE_URL` | `https://<project-ref>.supabase.co` |
| `SUPABASE_ANON_KEY` | the project's anon / publishable key (public by design) |
| `SUPABASE_PHOTO_BUCKET` | `field-photos` |

**Never ship** the `service_role` key, the database password, or any storage credentials. The app doesn't need them.

## 8. API examples

Every call has the form `POST {SUPABASE_URL}/functions/v1/<name>`, with the headers `Authorization: Bearer <access_token>`, `apikey: <anon key>`, and `Content-Type: application/json`. The read-only functions also accept `GET` with query parameters.

From the app:
```ts
const { data, error } = await supabase.functions.invoke("create-survey", { body: payload });
```

### Photo upload (before create-survey)
```ts
const id = crypto.randomUUID();             // generate when the survey is started; persist in the offline queue
const path = `${user.id}/${id}/field-photo.jpg`;
await supabase.storage.from("field-photos").upload(path, file, { contentType: "image/jpeg", upsert: true });
// then send photo_path: path and id: id to create-survey
```

### check-survey-duplicate
```json
// request
{ "survey_number": "125", "sub_division": "2", "latitude": 15.4961864, "longitude": 73.827361,
  "farmer_mobile": "9876543210" }
// 200
{
  "duplicate_found": true,
  "possible_duplicate": true,
  "nearest_distance_meters": 35,
  "radius_meters": 100,
  "matches": [{
    "match_type": "exact_and_proximity",
    "distance_meters": 35,
    "within_radius": true,
    "survey": {
      "id": "9f1c…", "survey_id": "SV-001201", "survey_number": "125", "sub_division": "2",
      "farmer_name": "Ramesh Kumar", "farmer_mobile": "******3210", "crop_name": "Paddy",
      "area": 2, "area_unit": "acre", "visit_date": "2026-09-20", "collected_by_name": "Amit Sharma",
      "latitude": 15.495872, "longitude": 73.827361, "photo_url": "https://…/sign/field-photos/…",
      "duplicate_status": "unique", "submission_status": "pending", "created_at": "…", "is_own": false
    }
  }],
  "farmer_surveys": [ /* same summary shape; informational only */ ]
}
```

### create-survey
```json
// request
{
  "id": "5b0f8d2e-7a51-4c1b-9a2f-3f6d8e1c2b4a",
  "farmer": { "name": "Ramesh Kumar", "mobile": "+91 98765 43210" },
  "crop_id": "c7e5…", "area": 2.5, "area_unit": "acre",
  "survey_number": "125", "sub_division": "2", "visit_date": "2026-09-24",
  "latitude": 15.495872, "longitude": 73.827361, "gps_accuracy": 8,
  "photo_path": "<user_id>/5b0f8d2e-7a51-4c1b-9a2f-3f6d8e1c2b4a/field-photo.jpg",
  "duplicate_reason": "different_portion_of_land", "duplicate_reason_notes": "North half",
  "notes": "Canal side"
}
// 201 (200 + "idempotent_replay": true when retried with the same id)
{
  "created": true, "idempotent_replay": false,
  "survey": {
    "id": "5b0f8d2e-…", "survey_id": "SV-001245", "survey_number": "125", "sub_division": "2",
    "farmer_id": "…", "farmer_name": "Ramesh Kumar", "farmer_mobile": "9876543210",
    "crop_id": "c7e5…", "crop_name": "Paddy", "area": 2.5, "area_unit": "acre",
    "visit_date": "2026-09-24", "collected_by": "…", "collected_by_name": "Rahul Sharma",
    "latitude": 15.495872, "longitude": 73.827361, "gps_accuracy": 8,
    "photo_path": "…", "photo_url": "https://…", "duplicate_status": "duplicate",
    "submission_status": "pending", "duplicate_reason": "different_portion_of_land",
    "duplicate_reason_notes": "North half", "notes": "Canal side",
    "created_at": "…", "updated_at": "…",
    "duplicate_check": {
      "duplicate_found": true, "possible_duplicate": true, "nearest_distance_meters": 35,
      "matches": [{ "duplicate_match_id": "…", "match_type": "exact_and_proximity", "distance_meters": 35,
                    "within_radius": true, "review_status": "pending", "reviewed_by": null,
                    "reviewed_at": null, "review_notes": null, "survey": { /* summary */ } }]
    }
  }
}
// 422
{ "error": { "code": "validation_error", "message": "Invalid request",
             "details": { "fields": { "farmer.mobile": "Enter a valid mobile number", "area": "Area must be greater than 0" } } } }
```
Allowed `duplicate_reason` values:
- `different_farmer`
- `different_portion_of_land`
- `previous_data_incorrect`
- `previous_survey_unavailable`
- `other` (requires `duplicate_reason_notes`)

### update-survey
```json
{ "id": "5b0f8d2e-…", "area": 2.75, "notes": "Corrected area" }            // → 200 { "survey": { … } }
{ "id": "5b0f8d2e-…", "submission_status": "approved" }                    // admin only
```

### get-my-surveys
```json
{ "page": 1, "page_size": 20, "search": "ramesh", "status": ["pending"], "date_from": "2026-09-01",
  "include_photo_urls": true }
// 200
{ "data": [{ "id": "…", "survey_id": "SV-001245", "survey_number": "125", "sub_division": "2",
             "farmer_name": "Ramesh Kumar", "crop_name": "Paddy", "area": 2.5, "area_unit": "acre",
             "visit_date": "2026-09-24", "duplicate_status": "duplicate", "submission_status": "pending",
             "photo_url": "https://…", "created_at": "…", "updated_at": "…" }],
  "pagination": { "page": 1, "page_size": 20, "total": 23, "total_pages": 2 } }
```

### get-survey
```
GET /functions/v1/get-survey?survey_id=SV-001245      (or ?id=<uuid>)
→ 200 { "survey": { …same shape as create-survey's survey… } }   | 404 if not visible to caller
```

### search-surveys
```json
{ "survey_number": "125", "sub_division": "2", "farmer_name": "ramesh", "farmer_mobile": "98765",
  "crop": "paddy", "surveyor_id": "…", "date_from": "2026-09-01", "date_to": "2026-09-30",
  "duplicate_status": ["duplicate", "possible_duplicate"], "page": 1, "page_size": 50,
  "sort": "visit_date", "order": "desc" }
// 200 { "data": [ … ], "pagination": { … } }
// admin + "format": "csv" → text/csv attachment (X-Total-Count, X-Truncated headers)
```

### review-duplicate
```json
{ "duplicate_match_id": "…", "status": "confirmed_duplicate", "notes": "Same plot, re-surveyed" }
// 200
{ "duplicate_match": { "id": "…", "survey_id": "…", "matched_survey_id": "…", "match_type": "exact_and_proximity",
                       "distance_meters": 35, "status": "confirmed_duplicate", "reviewed_by": "…",
                       "reviewed_at": "2026-09-25T06:12:00Z", "notes": "Same plot, re-surveyed", "created_at": "…" },
  "survey": { "id": "…", "survey_id": "SV-001245", "duplicate_status": "confirmed_duplicate" } }
```

### get-survey-map-data
```
GET /functions/v1/get-survey-map-data?min_lat=15.48&min_lng=73.81&max_lat=15.51&max_lng=73.84&duplicate_status=duplicate,possible_duplicate
// 200
{ "points": [{ "id": "…", "survey_id": "SV-001245", "survey_number": "125", "sub_division": "2",
               "farmer_name": "Ramesh Kumar", "latitude": 15.495872, "longitude": 73.827361,
               "duplicate_status": "duplicate", "crop": "Paddy" }],
  "count": 1, "truncated": false }
```

### get-reports
```json
{ "date_from": "2026-09-01", "date_to": "2026-09-30" }
// 200
{ "scope": "own", "filters": { … },
  "report": { "total_surveys": 23, "today_surveys": 4, "duplicate_count": 2, "pending_duplicate_reviews": 2,
              "by_submission_status": { "pending": 3, "approved": 18, "rejected": 2 },
              "by_duplicate_status": { "unique": 21, "duplicate": 2 },
              "by_crop": [{ "crop_id": "…", "crop": "Paddy", "count": 12 }],
              "by_surveyor": [{ "surveyor_id": "…", "surveyor": "Rahul Sharma", "count": 23 }],
              "by_date": [{ "date": "2026-09-24", "count": 4 }] } }
```

### admin-users
```json
{ "action": "create", "full_name": "Rahul Sharma", "phone": "+919876543210",
  "role": "field_surveyor", "supervisor_id": "…" }                                   // → 201 { "user": { … } }
{ "action": "update", "user_id": "…", "role": "supervisor" }                          // → 200, audited
{ "action": "update", "user_id": "…", "status": "inactive" }                          // blocks sign-in
{ "action": "list", "role": "field_surveyor", "search": "rahul", "page": 1 }
```

## 9. Testing

```bash
supabase start                        # Docker required; applies migrations + seed
supabase functions serve              # keep running in a second terminal
eval "$(supabase status -o env)"      # exports API_URL, ANON_KEY, SERVICE_ROLE_KEY
deno test -A tests/api.test.ts
```

`tests/api.test.ts` creates throwaway users (admin, two supervisors, two surveyors) and checks the following:
- **Auth:** unauthenticated calls return 401, and a role in user metadata is ignored.
- **Profile protection:** users can't change their own role.
- **Insert protection:** direct survey inserts are blocked by RLS.
- **Validation:** the `422` response lists the errors per field.
- **Idempotency:** a retried create doesn't make a second row, and reusing another user's id returns 409.
- **Duplicates:** exact match, 35 m GPS match (`exact_and_proximity`), proximity-only, and a far-away non-match.
- **Farmers:** the farmer record is reused, and the same farmer on another field is not flagged.
- **Masking:** another surveyor's farmer mobile is masked in warnings.
- **Scoping:** get-survey, search and map data only return what each role may see.
- **Export:** CSV export works for admins only.
- **Review:** only the assigned supervisor or an admin can review; the reviewer is stamped, the survey status is recomputed, and the review is audited.
- **Updates:** protected columns can't be changed directly; `update-survey` runs detection again; approved surveys are locked.
- **Storage:** uploads work only in the user's own folder, the photo path is checked at submit, and signed URLs are returned.
- **Admin users:** create, role change (audited), self-demotion blocked, and deactivation cuts off access.

Manual checks with curl:
```bash
TOKEN=$(curl -s "$API_URL/auth/v1/token?grant_type=password" -H "apikey: $ANON_KEY" \
  -H "Content-Type: application/json" -d '{"email":"surveyor@example.com","password":"…"}' | jq -r .access_token)
curl -s "$API_URL/functions/v1/check-survey-duplicate" -H "Authorization: Bearer $TOKEN" \
  -H "apikey: $ANON_KEY" -H "Content-Type: application/json" \
  -d '{"survey_number":"125","sub_division":"2","latitude":15.4958,"longitude":73.8273}' | jq
```

## Offline-queue contract (for the mobile app)

1. When a survey is started, generate `id = uuid()` and store it with the queued item.
2. Upload the photo to `{user_id}/{id}/field-photo.jpg`. Upload with `upsert: true`, so retrying is safe.
3. POST `create-survey` with the same `id`. Retry on network errors, timeouts and 5xx responses. A `200` with `idempotent_replay: true` still counts as success.
4. Do **not** retry `4xx` responses automatically. `422` means the data needs fixing, and `409` means the id belongs to someone else.
5. Sync the local list with `get-my-surveys?updated_since=<last sync ISO timestamp>`.

## Notes and assumptions

- **Duplicates are global.** Survey numbers are compared across the whole database, as specified. In practice survey numbers are usually unique only within a village. If that applies here, add a `village_code` column to the survey and to the match key.
- **Normalisation.** Survey numbers and sub-divisions are compared case-insensitively and ignoring whitespace. Leading zeros matter (`0125` ≠ `125`).
- **Mobile numbers** are validated as Indian 10-digit mobiles by default. To use another format, set the `MOBILE_REGEX` and `MOBILE_COUNTRY_CODE` secrets.
- **Map bounding boxes** that cross the antimeridian are not supported. Split them on the client.
- **One supervisor per surveyor** (`profiles.supervisor_id`). If a surveyor needs several supervisors, add a join table and update `private.assigned_surveyor_ids()`.
