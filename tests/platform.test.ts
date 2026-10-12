// End-to-end tests for 1/14 forms, farmer profiles, benefits / schemes,
// applications, audit history, exports and dashboards (migrations 015-017).
// Company-operated model: admins write everything; company users (role "user")
// are read-only, enforced by the Edge Functions and the database.
//   eval "$(supabase status -o env)"   (or export API_URL / ANON_KEY / SERVICE_ROLE_KEY for a cloud project)
//   deno test -A tests/platform.test.ts
import { createClient } from "jsr:@supabase/supabase-js@2";
import { assert, assertEquals, assertExists } from "jsr:@std/assert@1";

const URL = Deno.env.get("SUPABASE_URL") ?? Deno.env.get("API_URL") ?? "http://127.0.0.1:54321";
const ANON = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("ANON_KEY")!;
const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SERVICE_ROLE_KEY")!;
const opts = { auth: { persistSession: false, autoRefreshToken: false } };
const service = createClient(URL, SERVICE, opts);
const run = crypto.randomUUID().slice(0, 6);
const PASSWORD = "Test-password-123";

interface U { id: string; token: string }
async function makeUser(label: string, role: string): Promise<U> {
  const email = `${label}-${run}@example.test`;
  const { data, error } = await service.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true, user_metadata: { full_name: `${label} ${run}` } });
  if (error) throw error;
  await service.from("profiles").update({ role, status: "active" }).eq("id", data.user.id);
  const { data: s, error: e } = await createClient(URL, ANON, opts).auth.signInWithPassword({ email, password: PASSWORD });
  if (e) throw e;
  return { id: data.user.id, token: s.session!.access_token };
}
async function call(fn: string, u: U, body: unknown) {
  const res = await fetch(`${URL}/functions/v1/${fn}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: ANON, Authorization: `Bearer ${u.token}` },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  // deno-lint-ignore no-explicit-any
  let b: any; try { b = JSON.parse(text); } catch { b = text; }
  return { status: res.status, body: b };
}

const admin = await makeUser("padmin", "admin");
const company = await makeUser("pcompany", "user");
const legacy = await makeUser("plegacy", "field_surveyor"); // old role: stays read-only
const { data: crops } = await service.from("crops").select("id, name").eq("status", "active");
const paddy = crops!.find((c) => c.name === "Paddy")!;
const cashew = crops!.find((c) => c.name === "Cashew") ?? crops![0];

const SN = `${700 + Math.floor(Math.random() * 200)}${run.slice(0, 2).replace(/[^0-9]/g, "7")}`;
const MOBILE = `90009${String(Math.floor(Math.random() * 90000) + 10000)}`;
const formId = crypto.randomUUID();
const surveyId = crypto.randomUUID();
// deno-lint-ignore no-explicit-any
let form: any, farmerId = "", schemeId = "";

const submission = (overrides: Record<string, unknown> = {}) => ({
  action: "submit",
  farmer: { name: `Shobha Naik ${run}`, mobile: MOBILE, father_name: "Dattaram Naik", gender: "female", category: "obc", village: "Aldona", taluka: "Bardez" },
  form: {
    id: formId, village: "Aldona", taluka: "Bardez", survey_number: SN, sub_division: "2",
    occupant_names: `Shobha Naik ${run}`, tenant_name: null, area_sq_m: 8500, land_class: "paddy",
    assessment_rs: 42.5, kharif_crop_id: paddy.id, rabi_crop_id: null, irrigation_source: "well", mutation_number: "M-1204",
  },
  survey: {
    id: surveyId, crop_id: paddy.id, area: 0.85, area_unit: "hectare", visit_date: new Date().toISOString().slice(0, 10),
    latitude: 15.5926, longitude: 73.8741, gps_accuracy: 6,
  },
  ...overrides,
});

Deno.test("1/14 form: validation errors are field-specific", async () => {
  const bad = submission();
  // deno-lint-ignore no-explicit-any
  (bad.form as any) = { ...bad.form, taluka: "Mumbai", area_sq_m: 0, survey_number: " " };
  const res = await call("land-records", admin, bad);
  assertEquals(res.status, 422);
  for (const k of ["form.taluka", "form.area_sq_m", "form.survey_number"]) assert(res.body.error.details.fields[k], k);
});

Deno.test("company users add 1/14 forms + surveys (020); the legacy field role cannot", async () => {
  assertEquals((await call("land-records", legacy, submission())).status, 403);
  const { count } = await service.from("land_records").select("id", { count: "exact", head: true }).eq("id", formId);
  assertEquals(count, 0);

  // A separate field, farmer and location so the admin's records below stay unique.
  const base = submission();
  const res = await call("land-records", company, {
    ...base,
    farmer: { ...base.farmer, name: `Company Entry ${run}`, mobile: `9${MOBILE.slice(1, -1)}7` },
    // The simplified land step (021): village, taluka, survey no., sub-division, remarks only.
    form: { id: crypto.randomUUID(), village: "Aldona", taluka: "Bardez", survey_number: `CU-${run}`, sub_division: "1", remarks: "Simple form" },
    survey: { ...base.survey, id: crypto.randomUUID(), latitude: 15.65, longitude: 73.95 },
  });
  assertEquals(res.status, 201, JSON.stringify(res.body));
  assertEquals(res.body.form.created_by, company.id);
  assertEquals(res.body.form.occupant_names, null);
  assertEquals(res.body.form.land_class, null);
  assertEquals(res.body.form.area_sq_m, 8500, "area taken from the survey: 0.85 ha");

  // Location / photo / crop skipped in the app: the 1/14 form alone, no field survey.
  const formOnly = await call("land-records", company, {
    action: "submit",
    farmer: { id: res.body.form.farmer_id },
    form: { id: crypto.randomUUID(), village: "Aldona", taluka: "Bardez", survey_number: `CU-${run}`, sub_division: "2", remarks: null },
  });
  assertEquals(formOnly.status, 201, JSON.stringify(formOnly.body));
  assertEquals(formOnly.body.surveys, []);
  assertEquals(formOnly.body.form.area_sq_m, null);
  assertEquals(res.body.surveys.length, 1);
  assertEquals(res.body.surveys[0].collected_by, company.id);
});

Deno.test("admin submits a 1/14 form + field survey together, linked", async () => {
  const res = await call("land-records", admin, submission());
  assertEquals(res.status, 201, JSON.stringify(res.body));
  form = res.body.form;
  farmerId = form.farmer_id;
  assert(/^LR-\d{6,}$/.test(form.form_id));
  assertEquals(form.kharif_crop_name, "Paddy");
  assertEquals(form.status, "pending");
  assertEquals(res.body.surveys.length, 1);
  assertEquals(res.body.surveys[0].form_id, form.form_id);
  const { data: f } = await service.from("farmers").select("taluka, category, father_name").eq("id", farmerId).single();
  assertEquals(f, { taluka: "Bardez", category: "obc", father_name: "Dattaram Naik" });
});

Deno.test("form submission is idempotent (retries)", async () => {
  const res = await call("land-records", admin, submission());
  assertEquals(res.status, 200);
  assertEquals(res.body.idempotent_replay, true);
  assertEquals(res.body.form.form_id, form.form_id);
  const { count } = await service.from("surveys").select("id", { count: "exact", head: true }).eq("land_record_id", formId);
  assertEquals(count, 1);
});

Deno.test("duplicate check (viewable by company users) finds the existing form; admin can still add a second", async () => {
  const dup = await call("land-records", company, { action: "check_duplicate", survey_number: SN, sub_division: "2", village: "Aldona", latitude: 15.5927, longitude: 73.8741 });
  assertEquals(dup.status, 200);
  assertEquals(dup.body.duplicate_found, true);
  assertEquals(dup.body.forms[0].form_id, form.form_id);
  assertEquals(dup.body.survey_check.duplicate_found, true);
  const second = await call("land-records", admin, {
    ...submission({ survey: undefined }),
    farmer: { name: `Other Owner ${run}`, mobile: "9000900001", taluka: "Bardez" },
    form: { ...submission().form, id: crypto.randomUUID(), occupant_names: "Other Owner" },
  });
  assertEquals(second.status, 201, JSON.stringify(second.body));
});

Deno.test("form lists: company users see every form", async () => {
  const all = await call("land-records", company, { action: "list", q: SN });
  assertEquals(all.status, 200);
  assertEquals(all.body.pagination.total, 2);
  const byNumber = await call("land-records", company, { action: "list", q: `${SN}/` });
  assertEquals(byNumber.body.pagination.total, 2, "survey no. with trailing slash");
});

Deno.test("form edits and verification: admins and company users; not the legacy field role (API and database)", async () => {
  assertEquals((await call("land-records", legacy, { action: "update", id: formId, remarks: "x" })).status, 403);
  assertEquals((await call("land-records", legacy, { action: "set_status", id: formId, status: "verified" })).status, 403);
  const direct = await fetch(`${URL}/rest/v1/land_records?id=eq.${formId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", apikey: ANON, Authorization: `Bearer ${legacy.token}`, Prefer: "return=representation" },
    body: JSON.stringify({ remarks: "hack" }),
  });
  assertEquals(await direct.json(), [], "RLS: no direct updates by read-only roles");
  const edit = await call("land-records", company, { action: "update", id: formId, remarks: "Bund repaired" });
  assertEquals(edit.status, 200, JSON.stringify(edit.body));
  assertEquals(edit.body.form.remarks, "Bund repaired");
  const verify = await call("land-records", company, { action: "set_status", id: formId, status: "verified" });
  assertEquals(verify.status, 200, JSON.stringify(verify.body));
  assertEquals(verify.body.form.status, "verified");
});

Deno.test("farmer search by name, mobile, survey number and 1/14 number; 360 profile; company users edit farmers", async () => {
  const formNo = form.form_id.replace(/^LR-0*/, "LR-");
  for (const q of [`Shobha Naik ${run}`, MOBILE.slice(-6), `${SN}/2`, `${SN}/`, form.form_id, formNo]) {
    const res = await call("farmers", company, { action: "search", q });
    assertEquals(res.status, 200, JSON.stringify(res.body));
    const hit = res.body.data.find((f: { id: string }) => f.id === farmerId);
    assertExists(hit, `search "${q}"`);
    assertEquals(hit.form_count, 1);
    assertEquals(hit.form_ids, [form.form_id]);
  }
  const profile = await call("farmers", company, { action: "get", id: farmerId });
  assertEquals(profile.body.forms.length, 1);
  assertEquals(profile.body.surveys.length, 1);
  assertEquals(profile.body.applications, [], "benefit history is visible (empty so far)");
  assert(Array.isArray(profile.body.eligibility));
  assertEquals(profile.body.farmer.mobile, MOBILE, "company staff see full mobiles");
  assertEquals(profile.body.farmer.land_sq_m, 8500);
  assertEquals((await call("farmers", legacy, { action: "upsert", id: farmerId, name: "X", mobile: MOBILE })).status, 403);
  const renamed = await call("farmers", company, { action: "upsert", id: farmerId, name: `Shobha Naik ${run}`, mobile: MOBILE, village: "Aldona", taluka: "Bardez", father_name: "Dattaram G. Naik" });
  assertEquals(renamed.status, 200, JSON.stringify(renamed.body));
  assertEquals(renamed.body.farmer.father_name, "Dattaram G. Naik");
});

Deno.test("benefit types: admins and company users configure (with category + rules)", async () => {
  const code = `TR-${run.toUpperCase().replace(/[^A-Z0-9]/g, "X")}`;
  assertEquals((await call("schemes", legacy, { action: "upsert", code, name: "x" })).status, 403);
  const created = await call("schemes", company, {
    action: "upsert", code, name: `Tractor subsidy ${run}`, category: "tractor", subsidy_percent: 50, max_amount_rs: 250000,
    rules: { min_land_sq_m: 5000, eligible_talukas: ["Bardez", "Pernem"], eligible_categories: ["sc", "st", "obc"], cooldown_years: 5, eligible_crop_ids: [paddy.id, cashew.id], require_verified_land: true },
  });
  assertEquals(created.status, 201, JSON.stringify(created.body));
  assertEquals(created.body.scheme.category, "tractor");
  schemeId = created.body.scheme.id;
  const listed = await call("schemes", company, { action: "list", category: "tractor" });
  assertEquals(listed.status, 200);
  assert(listed.body.data.some((x: { id: string }) => x.id === schemeId));
  const ev = await call("schemes", company, { action: "eligibility", farmer_id: farmerId });
  const r = ev.body.results.find((x: { scheme_id: string }) => x.scheme_id === schemeId);
  assertEquals(r.eligible, true, JSON.stringify(r.checks));
  assertEquals(r.scheme_category, "tractor");
  assert(r.checks.length >= 5);
  const bad = await call("schemes", admin, { action: "upsert", code: "BAD1", name: "Bad", rules: { min_land_sq_m: 10, max_land_sq_m: 5 } });
  assertEquals(bad.status, 422);
});

Deno.test("benefit records: company users add and update status; history and pending", async () => {
  assertEquals((await call("applications", legacy, { action: "upsert", farmer_id: farmerId, scheme_id: schemeId, status: "disbursed" })).status, 403);
  const { error: rlsErr } = await createClient(URL, ANON, { ...opts, global: { headers: { Authorization: `Bearer ${legacy.token}` } } })
    .from("subsidy_applications").insert({ farmer_id: farmerId, scheme_id: schemeId });
  assertExists(rlsErr, "RLS: no direct inserts by read-only roles");
  const app = await call("applications", company, { action: "upsert", farmer_id: farmerId, scheme_id: schemeId, land_record_id: formId, status: "applied", amount_rs: 200000 });
  assertEquals(app.status, 201, JSON.stringify(app.body));
  assertEquals(app.body.eligibility.eligible, true);
  assert(/^SA-\d{6,}$/.test(app.body.application.application_no));
  const approved = await call("applications", company, { action: "upsert", id: app.body.application.id, farmer_id: farmerId, scheme_id: schemeId, status: "approved", amount_rs: 200000 });
  assertEquals(approved.body.application.status, "approved");
  assertExists(approved.body.application.decided_at);
  const ev = await call("schemes", admin, { action: "eligibility", farmer_id: farmerId });
  const r = ev.body.results.find((x: { scheme_id: string }) => x.scheme_id === schemeId);
  assertEquals(r.eligible, false, "approved within cooldown");
  assert(r.checks.some((c: { rule: string; passed: boolean }) => c.rule === "cooldown" && !c.passed));
  const profile = await call("farmers", company, { action: "get", id: farmerId });
  assertEquals(profile.body.applications.length, 1);
  assertEquals(profile.body.applications[0].scheme_category, "tractor");
  const search = await call("farmers", company, { action: "search", q: MOBILE });
  const hit = search.body.data.find((f: { id: string }) => f.id === farmerId);
  assertEquals([hit.benefits_received, hit.benefits_pending], [0, 1]);
  await call("applications", admin, { action: "upsert", id: app.body.application.id, farmer_id: farmerId, scheme_id: schemeId, status: "disbursed", amount_rs: 200000 });
  const after = (await call("farmers", company, { action: "search", q: MOBILE })).body.data.find((f: { id: string }) => f.id === farmerId);
  assertEquals([after.benefits_received, after.benefits_pending], [1, 0], "disbursed = received");
  assertEquals((await call("applications", company, { action: "list", farmer_id: farmerId })).body.data.length, 1);
});

Deno.test("audit history records who changed what (admin-only to view)", async () => {
  assertEquals((await call("audit-logs", company, {})).status, 403);
  const res = await call("audit-logs", admin, { entity_id: formId });
  const actions = res.body.data.map((a: { action: string }) => a.action);
  assert(actions.includes("form_created") && actions.includes("form_updated"), actions.join(","));
  const created = res.body.data.find((a: { action: string }) => a.action === "form_created");
  assertEquals(created.user_id, admin.id, "admin's form attributed to the admin");
  const edit = res.body.data.find((a: { action: string; metadata: { changes?: { remarks?: unknown } } }) => a.action === "form_updated" && a.metadata.changes?.remarks);
  assertEquals(edit.user_id, company.id, "company user's edit attributed to them");
});

Deno.test("exports return report rows; admin-only", async () => {
  assertEquals((await call("export-data", company, { dataset: "forms" })).status, 403);
  for (const dataset of ["surveys", "forms", "farmers", "applications"]) {
    const res = await call("export-data", admin, { dataset, taluka: "Bardez" });
    assertEquals(res.status, 200, dataset);
    assert(res.body.columns.length > 5);
    assert(res.body.rows.length > 0, `${dataset} has rows`);
  }
  const forms = await call("export-data", admin, { dataset: "forms", taluka: "Bardez" });
  assert(forms.body.rows.some((r: { form_id: string }) => r.form_id === form.form_id));
});

Deno.test("dashboards: admins see company-wide totals; company users get none", async () => {
  const r = await call("get-reports", admin, {});
  assertEquals(r.body.scope, "all");
  for (const k of ["forms_total", "forms_pending", "farmers_total", "applications_total", "applications_pending", "reviews_pending"]) {
    assert(typeof r.body.report[k] === "number", k);
  }
  for (const u of [company, legacy]) assertEquals((await call("get-reports", u, {})).status, 403);
});

Deno.test("analytics: admin-only date-range totals, comparison period, daily series and breakdowns", async () => {
  const today = new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10); // report timezone: Asia/Kolkata
  const weekAgo = new Date(Date.parse(`${today}T00:00:00Z`) - 6 * 86_400_000).toISOString().slice(0, 10);
  const range = { date_from: weekAgo, date_to: today };
  for (const u of [company, legacy]) assertEquals((await call("get-analytics", u, range)).status, 403);

  const r = await call("get-analytics", admin, range);
  assertEquals(r.status, 200, JSON.stringify(r.body));
  const a = r.body.analytics;
  assertEquals(a.period.from, weekAgo);
  assertEquals(a.period.prev_to, new Date(Date.parse(`${weekAgo}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10));
  assertEquals(a.series.length, 7);
  assertEquals(a.series.reduce((n: number, d: { forms: number }) => n + d.forms, 0), a.totals.forms);
  assert(a.totals.forms >= 1 && a.totals.surveys >= 1, "this run's form + survey are counted");
  assert(a.forms_by_taluka.some((t: { label: string }) => t.label === "Bardez"));
  for (const k of ["forms", "surveys", "farmers", "applications"]) assert(typeof a.previous[k] === "number", k);

  const custom = await call("get-analytics", admin, { ...range, prev_from: "2020-01-01", prev_to: "2020-01-07" });
  assertEquals(custom.body.analytics.period.prev_from, "2020-01-01");
  assertEquals(custom.body.analytics.previous.forms, 0);

  assertEquals((await call("get-analytics", admin, { date_from: today, date_to: weekAgo })).status, 422);
  assertEquals((await call("get-analytics", admin, { date_from: "2024-01-01", date_to: "2025-06-01" })).status, 422);
  assertEquals((await call("get-analytics", admin, { ...range, prev_from: weekAgo })).status, 422);
});

Deno.test("user management: admin views, edits sign-in details and deletes users without records", async () => {
  const email = `edit-${run}@example.test`;
  const created = await call("admin-users", admin, { action: "create", full_name: `Edit Me ${run}`, email, password: PASSWORD, role: "user" });
  assertEquals(created.status, 201, JSON.stringify(created.body));
  const id = created.body.user.id;

  for (const action of ["get", "delete"]) assertEquals((await call("admin-users", company, { action, user_id: id })).status, 403, action);
  assertEquals((await call("admin-users", company, { action: "update", user_id: id, full_name: "x" })).status, 403);

  const got = await call("admin-users", admin, { action: "get", user_id: id });
  assertEquals(got.status, 200);
  assertEquals(got.body.user.email, email);
  assertEquals(got.body.user.records, { forms: 0, surveys: 0, service_records: 0 });
  assertEquals(got.body.user.can_delete, true);

  // Edit name, role, sign-in phone/email and password in one go.
  const phone = `+9198${String(Math.floor(Math.random() * 1e8)).padStart(8, "0")}`;
  const newEmail = `edited-${run}@example.test`;
  const upd = await call("admin-users", admin, { action: "update", user_id: id, full_name: `Edited ${run}`, role: "admin", phone, email: newEmail, password: "New-password-456" });
  assertEquals(upd.status, 200, JSON.stringify(upd.body));
  assertEquals(upd.body.user.full_name, `Edited ${run}`);
  assertEquals(upd.body.user.role, "admin");
  assertEquals(upd.body.user.mobile, phone.slice(1));
  const after = (await call("admin-users", admin, { action: "get", user_id: id })).body.user;
  assertEquals([after.email, after.phone], [newEmail, phone]);
  const { error: oldPw } = await createClient(URL, ANON, opts).auth.signInWithPassword({ email: newEmail, password: PASSWORD });
  assert(oldPw, "old password no longer works");
  const { error: newPw } = await createClient(URL, ANON, opts).auth.signInWithPassword({ email: newEmail, password: "New-password-456" });
  assertEquals(newPw, null);

  // Email already used by another account -> 409 with the field.
  const taken = await call("admin-users", admin, { action: "update", user_id: id, email: `padmin-${run}@example.test` });
  assertEquals(taken.status, 409);
  assertEquals(taken.body.error.details.fields.email, "Already in use");
  assertEquals((await call("admin-users", admin, { action: "update", user_id: id, password: "short" })).status, 422);

  // Deleting: never yourself; never someone who entered records; otherwise permanent + audited.
  assertEquals((await call("admin-users", admin, { action: "delete", user_id: admin.id })).status, 409);
  const admin2 = await makeUser("padmin2", "admin");
  const blocked = await call("admin-users", admin2, { action: "delete", user_id: admin.id });
  assertEquals(blocked.status, 409);
  assertEquals(blocked.body.error.code, "user_has_records");
  assert(blocked.body.error.details.records.forms >= 1);
  assertEquals((await call("admin-users", admin, { action: "get", user_id: admin.id })).body.user.can_delete, false);

  const del = await call("admin-users", admin, { action: "delete", user_id: id });
  assertEquals(del.status, 200, JSON.stringify(del.body));
  assertEquals((await call("admin-users", admin, { action: "get", user_id: id })).status, 404);
  assertEquals((await call("admin-users", admin, { action: "delete", user_id: id })).status, 404);
  const { data: audit } = await service.from("audit_logs").select("action, user_id, metadata").eq("entity_id", id).eq("action", "user_deleted");
  assertEquals(audit?.length, 1);
  assertEquals(audit![0].user_id, admin.id);
});

Deno.test("admins can create company users (read-only) and admins", async () => {
  assertEquals((await call("admin-users", company, { action: "list" })).status, 403);
  const res = await call("admin-users", admin, { action: "create", full_name: `Company ${run}`, email: `newcompany-${run}@example.test`, password: PASSWORD, role: "user" });
  assertEquals(res.status, 201, JSON.stringify(res.body));
  assertEquals(res.body.user.role, "user");
});
