// End-to-end tests against a running Supabase stack (local or staging).
//
//   supabase start && supabase functions serve        (separate terminal)
//   eval "$(supabase status -o env)"                  (exports API_URL, ANON_KEY, SERVICE_ROLE_KEY)
//   deno test -A tests/api.test.ts
//
// Role model (migration 012): admins create surveys; `user` accounts are
// read-only and can search/view every survey. The tests create throwaway
// accounts and unique survey numbers, so they can be re-run.
import { createClient, type SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { assert, assertEquals, assertExists } from "jsr:@std/assert@1";

const URL = Deno.env.get("SUPABASE_URL") ?? Deno.env.get("API_URL") ?? "http://127.0.0.1:54321";
const ANON = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("ANON_KEY")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SERVICE_ROLE_KEY")!;
if (!ANON || !SERVICE) throw new Error("Set SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY");

const opts = { auth: { persistSession: false, autoRefreshToken: false } };
const service = createClient(URL, SERVICE, opts);
const run = crypto.randomUUID().slice(0, 8);
const PASSWORD = "Test-password-123";

interface TestUser { id: string; token: string; client: SupabaseClient }

async function makeUser(label: string, role: string): Promise<TestUser> {
  const email = `${label}-${run}@example.test`;
  const { data, error } = await service.auth.admin.createUser({
    email, password: PASSWORD, email_confirm: true, user_metadata: { full_name: `${label} ${run}`, role: "admin" },
  });
  if (error) throw error;
  const { error: pErr } = await service.from("profiles").update({ role, status: "active" }).eq("id", data.user.id);
  if (pErr) throw pErr;
  const anon = createClient(URL, ANON, opts);
  const { data: session, error: sErr } = await anon.auth.signInWithPassword({ email, password: PASSWORD });
  if (sErr) throw sErr;
  const token = session.session!.access_token;
  const client = createClient(URL, ANON, { ...opts, global: { headers: { Authorization: `Bearer ${token}` } } });
  return { id: data.user.id, token, client };
}

/** user = a signed-in account, "guest" = no-login visitor (public anon key only), null = no auth. */
async function call(fn: string, user: TestUser | "guest" | null, body?: unknown) {
  const auth: Record<string, string> = user === "guest" ? { Authorization: `Bearer ${ANON}` } : user ? { Authorization: `Bearer ${user.token}` } : {};
  const res = await fetch(`${URL}/functions/v1/${fn}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: ANON, ...auth },
    body: JSON.stringify(body ?? {}),
  });
  const text = await res.text();
  // deno-lint-ignore no-explicit-any
  let json: any;
  try { json = JSON.parse(text); } catch { json = text; }
  return { status: res.status, body: json, headers: res.headers };
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------
const admin = await makeUser("admin", "admin");
const admin2 = await makeUser("admin2", "admin");
const viewer = await makeUser("viewer", "user");
const surveyor = await makeUser("surveyor", "field_surveyor");

const { data: crop } = await service.from("crops").select("id, name").eq("status", "active").limit(1).single();
assertExists(crop, "Seed crops first (supabase db reset)");

const SN = `T${run}`;
const BASE = { lat: 15.495872, lng: 73.827361 };
const NEAR_LAT = BASE.lat + 35 / 111_320; // ~35 m north

function payload(overrides: Record<string, unknown> = {}) {
  return {
    id: crypto.randomUUID(),
    farmer: { name: "Ramesh Kumar", mobile: "+91 98765 43210" },
    crop_id: crop!.id,
    area: 2.5,
    area_unit: "acre",
    survey_number: SN,
    sub_division: "2",
    visit_date: new Date().toISOString().slice(0, 10),
    latitude: BASE.lat,
    longitude: BASE.lng,
    gps_accuracy: 8,
    notes: "test",
    ...overrides,
  };
}

// deno-lint-ignore no-explicit-any
let firstSurvey: any;
// deno-lint-ignore no-explicit-any
let dupSurvey: any;

// ---------------------------------------------------------------------------
// Auth & roles
// ---------------------------------------------------------------------------
Deno.test("rejects unauthenticated calls", async () => {
  assertEquals((await call("search-surveys", null)).status, 401);
});

Deno.test("role in user metadata is ignored; new users are pending company users", async () => {
  const { data } = await service.auth.admin.createUser({
    email: `meta-${run}@example.test`, password: PASSWORD, email_confirm: true, user_metadata: { role: "admin" },
  });
  const { data: profile } = await service.from("profiles").select("role, status").eq("id", data.user!.id).single();
  assertEquals(profile, { role: "user", status: "pending" });
});

Deno.test("users cannot change their own role", async () => {
  const { error } = await viewer.client.from("profiles").update({ role: "admin" }).eq("id", viewer.id);
  assertExists(error);
  const { data } = await service.from("profiles").select("role").eq("id", viewer.id).single();
  assertEquals(data!.role, "user");
});

Deno.test("users can update their own name", async () => {
  const { error } = await viewer.client.from("profiles").update({ full_name: `Viewer ${run}` }).eq("id", viewer.id);
  assertEquals(error, null);
});

Deno.test("admins and company users create surveys; the legacy field role cannot", async () => {
  assertEquals((await call("create-survey", surveyor, payload({ survey_number: `S${run}`, sub_division: "1" }))).status, 403);
  // Unique name per run so re-runs don't hit the (mobile, name) unique index.
  const { data: farmer, error: fErr } = await service.from("farmers").insert({ name: `Direct ${run}`, mobile: "9000000000" }).select().single();
  if (fErr) throw fErr;
  const { error } = await surveyor.client.from("surveys").insert({
    farmer_id: farmer.id, crop_id: crop!.id, area: 1, area_unit: "acre", survey_number: "X",
    visit_date: "2026-01-01", collected_by: surveyor.id, latitude: 1, longitude: 1, gps_accuracy: 1,
  });
  assertExists(error, "direct inserts by read-only roles are blocked by RLS");

  // Elsewhere (own survey number, far away) so the admin duplicate tests below are unaffected.
  const own = await call("create-survey", viewer, payload({ survey_number: `U${run}`, sub_division: "1", latitude: BASE.lat + 0.2 }));
  assertEquals(own.status, 201, JSON.stringify(own.body));
  assertEquals(own.body.survey.collected_by, viewer.id);
  const mine = await call("get-my-surveys", viewer, { search: `U${run}` });
  assertEquals(mine.status, 200, JSON.stringify(mine.body));
  assertEquals(mine.body.pagination.total, 1);
});

Deno.test("create-survey validates input", async () => {
  const res = await call("create-survey", admin, payload({
    farmer: { name: "", mobile: "123" }, area: 0, latitude: 91, longitude: null, gps_accuracy: -1, survey_number: " ",
  }));
  assertEquals(res.status, 422);
  const f = res.body.error.details.fields;
  for (const key of ["farmer.name", "farmer.mobile", "area", "latitude", "longitude", "gps_accuracy", "survey_number"]) {
    assert(f[key], `expected error for ${key}: ${JSON.stringify(f)}`);
  }
});

// ---------------------------------------------------------------------------
// Create, idempotency, duplicates (admins)
// ---------------------------------------------------------------------------
Deno.test("admin creates a unique survey; retries are idempotent", async () => {
  const body = payload();
  const res = await call("create-survey", admin, body);
  assertEquals(res.status, 201, JSON.stringify(res.body));
  firstSurvey = res.body.survey;
  assertEquals(firstSurvey.id, body.id);
  assert(/^SV-\d{6,}$/.test(firstSurvey.survey_id));
  assertEquals(firstSurvey.farmer_mobile, "9876543210");
  assertEquals(firstSurvey.duplicate_status, "unique");

  const retry = await call("create-survey", admin, body);
  assertEquals(retry.status, 200);
  assertEquals(retry.body.idempotent_replay, true);
  const { count } = await service.from("surveys").select("id", { count: "exact", head: true }).eq("id", body.id);
  assertEquals(count, 1);
});

Deno.test("another admin cannot reuse an existing survey id", async () => {
  assertEquals((await call("create-survey", admin2, payload({ id: firstSurvey.id }))).status, 409);
});

Deno.test("check-survey-duplicate finds exact + GPS match and farmer surveys", async () => {
  const res = await call("check-survey-duplicate", admin2, {
    survey_number: ` ${SN.toLowerCase()} `, sub_division: "2", latitude: NEAR_LAT, longitude: BASE.lng, farmer_mobile: "9876543210",
  });
  assertEquals(res.status, 200, JSON.stringify(res.body));
  assertEquals(res.body.duplicate_found, true);
  assertEquals(res.body.possible_duplicate, true);
  const m = res.body.matches[0];
  assertEquals(m.match_type, "exact_and_proximity");
  assert(Math.abs(m.distance_meters - 35) < 1, `distance ${m.distance_meters}`);
  assertEquals(m.survey.survey_id, firstSurvey.survey_id);
  assert(res.body.farmer_surveys.length >= 1);
});

Deno.test("check-survey-duplicate: different sub-division far away is not a match", async () => {
  const res = await call("check-survey-duplicate", admin, { survey_number: SN, sub_division: "9", latitude: BASE.lat + 0.01, longitude: BASE.lng });
  assertEquals(res.body.duplicate_found, false);
  assertEquals(res.body.matches.length, 0);
});

Deno.test("check-survey-duplicate: different sub-division nearby is a possible duplicate", async () => {
  const res = await call("check-survey-duplicate", admin, { survey_number: SN, sub_division: "3", latitude: NEAR_LAT, longitude: BASE.lng });
  assertEquals(res.body.duplicate_found, false);
  assertEquals(res.body.possible_duplicate, true);
  assertEquals(res.body.matches[0].match_type, "proximity");
});

Deno.test("a duplicate can still be submitted with a reason", async () => {
  const res = await call("create-survey", admin2, payload({
    latitude: NEAR_LAT, farmer: { name: "Suresh Patil", mobile: "9123456780" },
    duplicate_reason: "different_portion_of_land", duplicate_reason_notes: "North half",
  }));
  assertEquals(res.status, 201, JSON.stringify(res.body));
  dupSurvey = res.body.survey;
  assertEquals(dupSurvey.duplicate_status, "duplicate");
  assertEquals(dupSurvey.duplicate_check.matches.length, 1);
  const { data: logs } = await service.from("audit_logs").select("action, user_id").eq("entity_id", dupSurvey.id);
  assert(logs!.some((l) => l.action === "survey_created" && l.user_id === admin2.id));
});

Deno.test("same farmer on another field is not a duplicate", async () => {
  const res = await call("create-survey", admin, payload({ survey_number: `${SN}-B`, sub_division: null }));
  assertEquals(res.status, 201);
  assertEquals(res.body.survey.duplicate_status, "unique");
  assertEquals(res.body.survey.farmer_id, firstSurvey.farmer_id, "farmer record reused");
});

// ---------------------------------------------------------------------------
// Company users see everything admins add
// ---------------------------------------------------------------------------
Deno.test("users can search every admin's surveys (with photos); 'my' surveys are their own", async () => {
  const res = await call("search-surveys", viewer, { search: SN, include_photo_urls: true });
  assertEquals(res.status, 200, JSON.stringify(res.body));
  assertEquals(res.body.pagination.total, 3);
  const creators = new Set(res.body.data.map((s: { collected_by: string }) => s.collected_by));
  assert(creators.has(admin.id) && creators.has(admin2.id), "surveys from both admins");
  assert(res.body.data.every((s: { collected_by_name: string | null }) => s.collected_by_name), "admin names resolve");
  assert(res.body.data.every((s: { farmer_mobile: string }) => /^\d{10}$/.test(s.farmer_mobile)), "company staff see full mobiles");
  const exact = await call("search-surveys", viewer, { survey_number: SN, sub_division: "2" });
  assertEquals(exact.body.pagination.total, 2);
  const mine = await call("get-my-surveys", viewer, { search: SN });
  assertEquals(mine.body.pagination.total, 0, "admins' surveys are not the user's own");
  assertEquals((await call("get-my-surveys", surveyor)).status, 200, "legacy role keeps its own list");
});

Deno.test("users can open any survey; unknown ids are 404", async () => {
  const res = await call("get-survey", viewer, { id: dupSurvey.id });
  assertEquals(res.status, 200);
  assertEquals(res.body.survey.duplicate_check.matches.length, 1);
  assertEquals((await call("get-survey", viewer, { survey_id: firstSurvey.survey_id })).status, 200);
  assertEquals((await call("get-survey", viewer, { id: crypto.randomUUID() })).status, 404);
});

Deno.test("admin 'my surveys' lists only their own", async () => {
  const res = await call("get-my-surveys", admin, { search: SN });
  assertEquals(res.status, 200);
  assert(res.body.data.every((s: { collected_by: string }) => s.collected_by === admin.id));
  assertEquals(res.body.pagination.total, 2);
});

Deno.test("CSV export is admin-only", async () => {
  const res = await call("search-surveys", admin, { survey_number: SN, format: "csv" });
  assertEquals(res.status, 200);
  assert(res.headers.get("content-type")!.startsWith("text/csv"));
  assertEquals((await call("search-surveys", viewer, { format: "csv" })).status, 403);
});

Deno.test("map data: users see all points in the bounding box", async () => {
  const box = { min_lat: BASE.lat - 0.01, max_lat: BASE.lat + 0.01, min_lng: BASE.lng - 0.01, max_lng: BASE.lng + 0.01 };
  const res = await call("get-survey-map-data", viewer, box);
  assertEquals(res.status, 200);
  const ids = res.body.points.map((p: { id: string }) => p.id);
  assert(ids.includes(firstSurvey.id) && ids.includes(dupSurvey.id));
  assertEquals(Object.keys(res.body.points[0]).sort(),
    ["crop", "duplicate_status", "farmer_name", "id", "latitude", "longitude", "sub_division", "survey_id", "survey_number"]);
  const away = await call("get-survey-map-data", viewer, { min_lat: 0, max_lat: 1, min_lng: 0, max_lng: 1 });
  assert(!away.body.points.some((p: { id: string }) => p.id === firstSurvey.id));
});

Deno.test("reports: admins get the all-surveys scope; company users get no dashboard", async () => {
  assertEquals((await call("get-reports", viewer, {})).status, 403);
  assertEquals((await call("get-reports", surveyor, {})).status, 403);
  const res = await call("get-reports", admin, {});
  assertEquals(res.status, 200);
  assertEquals(res.body.scope, "all");
  assert(res.body.report.total_surveys >= 3);
  assert(res.body.report.duplicate_count >= 1);
});

Deno.test("read-only roles cannot bypass the functions to read tables directly", async () => {
  const { data: farmers } = await surveyor.client.from("farmers").select("mobile").neq("created_by", surveyor.id).limit(5);
  assertEquals(farmers, []);
  const { data: forms } = await surveyor.client.from("land_records").select("id").limit(5);
  assertEquals(forms, []);
});

// ---------------------------------------------------------------------------
// No-login access is rejected (sign-in required since migration 015)
// ---------------------------------------------------------------------------
Deno.test("requests with only the public anon key are rejected", async () => {
  for (const fn of ["search-surveys", "get-survey", "get-survey-map-data", "get-reports", "create-survey", "farmers", "land-records"]) {
    assertEquals((await call(fn, "guest", { id: firstSurvey.id, action: "search" })).status, 401, fn);
  }
  const anon = createClient(URL, ANON, opts);
  const { data } = await anon.from("survey_details").select("farmer_mobile").limit(5);
  assert(!data || data.length === 0, "anon key alone reads no table data");
});

// ---------------------------------------------------------------------------
// Writes: admins and company users; the legacy field role is read-only
// ---------------------------------------------------------------------------
Deno.test("company users edit and review; the legacy field role cannot", async () => {
  assertEquals((await call("update-survey", surveyor, { id: firstSurvey.id, notes: "x" })).status, 403);
  const { data: rows } = await surveyor.client.from("surveys").update({ notes: "hack" }).eq("id", firstSurvey.id).select();
  assertEquals(rows, [], "RLS gives the legacy role no UPDATE on others' surveys");
  const edit = await call("update-survey", viewer, { id: firstSurvey.id, notes: "Checked boundary" });
  assertEquals(edit.status, 200, JSON.stringify(edit.body));
  assertEquals(edit.body.survey.notes, "Checked boundary");

  const matchId = dupSurvey.duplicate_check.matches[0].duplicate_match_id;
  assertEquals((await call("review-duplicate", surveyor, { duplicate_match_id: matchId, status: "not_duplicate" })).status, 403);
  const review = await call("review-duplicate", viewer, { duplicate_match_id: matchId, status: "confirmed_duplicate", notes: "Same plot" });
  assertEquals(review.status, 200, JSON.stringify(review.body));
  assertEquals(review.body.duplicate_match.reviewed_by, viewer.id);
  assertEquals(review.body.survey.duplicate_status, "confirmed_duplicate");
});

Deno.test("update-survey re-runs duplicate detection", async () => {
  const other = await call("create-survey", admin, payload({ survey_number: `${SN}-C`, sub_division: "1", latitude: BASE.lat + 0.05 }));
  assertEquals(other.body.survey.duplicate_status, "unique");
  const res = await call("update-survey", admin, { id: other.body.survey.id, survey_number: SN, sub_division: "2" });
  assertEquals(res.status, 200, JSON.stringify(res.body));
  assertEquals(res.body.survey.duplicate_status, "duplicate");
  assert(res.body.survey.duplicate_check.matches.length >= 2);
});

Deno.test("admin can approve; users see the new status", async () => {
  const approve = await call("update-survey", admin, { id: firstSurvey.id, submission_status: "approved" });
  assertEquals(approve.status, 200);
  const seen = await call("get-survey", viewer, { id: firstSurvey.id });
  assertEquals(seen.body.survey.submission_status, "approved");
});

// ---------------------------------------------------------------------------
// Storage
// ---------------------------------------------------------------------------
Deno.test("photo upload: editors into their own folder only; the legacy role cannot upload", async () => {
  const id = crypto.randomUUID();
  const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]);
  const own = await admin.client.storage.from("field-photos").upload(`${admin.id}/${id}/field-photo.jpg`, jpeg, { contentType: "image/jpeg" });
  assertEquals(own.error, null);
  const foreign = await admin.client.storage.from("field-photos").upload(`${admin2.id}/${id}/field-photo.jpg`, jpeg, { contentType: "image/jpeg" });
  assertExists(foreign.error);
  const byViewer = await viewer.client.storage.from("field-photos").upload(`${viewer.id}/${id}/field-photo.jpg`, jpeg, { contentType: "image/jpeg" });
  assertEquals(byViewer.error, null, "company users upload into their own folder");
  const bySurveyor = await surveyor.client.storage.from("field-photos").upload(`${surveyor.id}/${id}/field-photo.jpg`, jpeg, { contentType: "image/jpeg" });
  assertExists(bySurveyor.error);

  const wrongId = await call("create-survey", admin, payload({ id: crypto.randomUUID(), photo_path: `${admin.id}/${id}/field-photo.jpg` }));
  assertEquals(wrongId.status, 422, "photo path must match the survey id");

  const res = await call("create-survey", admin, payload({ id, survey_number: `${SN}-P`, photo_path: `${admin.id}/${id}/field-photo.jpg` }));
  assertEquals(res.status, 201, JSON.stringify(res.body));
  assert(String(res.body.survey.photo_url).includes("/storage/v1/object/sign/field-photos/"));
  const seen = await call("get-survey", viewer, { id });
  assert(String(seen.body.survey.photo_url).includes("/storage/v1/object/sign/field-photos/"), "users get signed photo URLs");
});

// ---------------------------------------------------------------------------
// Admin user management
// ---------------------------------------------------------------------------
Deno.test("admin-users: create a user, promote, audit, deactivate", async () => {
  assertEquals((await call("admin-users", viewer, { action: "list" })).status, 403);

  const created = await call("admin-users", admin, {
    action: "create", full_name: "New Viewer", email: `newviewer-${run}@example.test`, password: PASSWORD, role: "user",
  });
  assertEquals(created.status, 201, JSON.stringify(created.body));
  assertEquals(created.body.user.role, "user");
  assertEquals(created.body.user.status, "active");
  const userId = created.body.user.id;

  const listed = await call("admin-users", admin, { action: "list", role: "user", search: "New Viewer" });
  assert(listed.body.data.some((u: { id: string }) => u.id === userId));

  const promoted = await call("admin-users", admin, { action: "update", user_id: userId, role: "admin" });
  assertEquals(promoted.body.user.role, "admin");
  const { data: logs } = await service.from("audit_logs").select("action, user_id").eq("entity_id", userId);
  assert(logs!.some((l) => l.action === "user_role_changed" && l.user_id === admin.id));

  assertEquals((await call("admin-users", admin, { action: "update", user_id: admin.id, role: "user" })).status, 409);

  assertEquals((await call("admin-users", admin, { action: "update", user_id: viewer.id, status: "inactive" })).status, 200);
  assert([401, 403].includes((await call("search-surveys", viewer)).status));
});
