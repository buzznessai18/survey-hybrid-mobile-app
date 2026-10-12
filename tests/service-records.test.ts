// End-to-end tests for farmer equipment / service records (migration 022,
// service-records Edge Function, records report in export-data, and the
// admin-users delete guard).
//   eval "$(supabase status -o env)"
//   deno test -A tests/service-records.test.ts
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
  await service.from("profiles").update({ role, status: "active", full_name: `${label} ${run}` }).eq("id", data.user.id);
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
const asUser = (u: U) => createClient(URL, ANON, { ...opts, global: { headers: { Authorization: `Bearer ${u.token}` } } });

const admin = await makeUser("radmin", "admin");
const company = await makeUser("rcompany", "user");
const legacy = await makeUser("rlegacy", "field_surveyor");
const SN = `9${run.replace(/[^0-9]/g, "").padEnd(4, "7").slice(0, 4)}`;
const recordId = crypto.randomUUID();
const payload = (overrides: Record<string, unknown> = {}) => ({
  action: "create",
  id: recordId,
  farmer_name: `Ramesh Gaonkar ${run}`,
  gender: "male",
  address: "House 12, Near Temple,\nAldona, Bardez, Goa",
  survey_number: SN,
  sub_division: "4B",
  land_size: "2.5",
  land_unit: "acre",
  service_details: "Tractor provided for 3 hours.\nLand ploughing completed.",
  ...overrides,
});
// deno-lint-ignore no-explicit-any
let saved: any;

Deno.test("validation: required fields, numeric land size and unit", async () => {
  const r = await call("service-records", company, payload({ id: crypto.randomUUID(), farmer_name: " ", survey_number: "", land_size: "abc", land_unit: "hectare" }));
  assertEquals(r.status, 422);
  const f = r.body.error.details.fields;
  assertExists(f.farmer_name);
  assertExists(f.survey_number);
  assertExists(f.land_size);
  assertExists(f.land_unit);
  const zero = await call("service-records", company, payload({ id: crypto.randomUUID(), land_size: 0 }));
  assertEquals(zero.status, 422);
});

Deno.test("company user creates a record; server sets number, timestamp and creator", async () => {
  const before = Date.now();
  const r = await call("service-records", company, payload({ created_at: "2001-01-01T00:00:00Z", created_by: admin.id, record_no: "RC-HACK" }));
  assertEquals(r.status, 201, JSON.stringify(r.body));
  saved = r.body.record;
  assertEquals(r.body.created, true);
  assert(/^RC-\d{6,}$/.test(saved.record_no), saved.record_no);
  assertEquals(saved.created_by, company.id); // not the forged admin id
  assertEquals(saved.created_by_name, `rcompany ${run}`);
  assert(Math.abs(new Date(saved.created_at).getTime() - before) < 60_000, "created_at is server time, not the forged value");
  assertEquals(saved.land_size, 2.5);
  assertEquals(saved.land_unit, "acre");
  assertEquals(saved.sub_division, "4B");
  assertEquals(saved.service_details, "Tractor provided for 3 hours.\nLand ploughing completed.");
});

Deno.test("create is idempotent on id (retry returns the saved record, no duplicate)", async () => {
  const r = await call("service-records", company, payload());
  assertEquals(r.status, 200);
  assertEquals(r.body.idempotent_replay, true);
  assertEquals(r.body.record.record_no, saved.record_no);
  const { count } = await service.from("service_records").select("id", { count: "exact", head: true }).eq("id", recordId);
  assertEquals(count, 1);
  // Someone else reusing the id is refused.
  const other = await call("service-records", admin, payload());
  assertEquals(other.status, 409);
});

Deno.test("search by farmer name, survey number, sub-division and 312/4 form", async () => {
  for (const body of [
    { q: `gaonkar ${run}` },
    { q: SN },
    { q: `${SN}/4` },
    { q: saved.record_no },
    { farmer_name: `ramesh gaonkar ${run}` },
    { survey_number: SN, sub_division: "4" },
  ]) {
    const r = await call("service-records", company, { action: "list", ...body });
    assertEquals(r.status, 200, JSON.stringify(body));
    assert(r.body.data.some((d: { id: string }) => d.id === recordId), `not found by ${JSON.stringify(body)}`);
  }
  const none = await call("service-records", company, { action: "list", survey_number: SN, sub_division: "9Z" });
  assert(!none.body.data.some((d: { id: string }) => d.id === recordId));
  const paged = await call("service-records", company, { action: "list", page_size: 1 });
  assertEquals(paged.body.data.length, 1);
  assert(paged.body.pagination.total >= 1);
});

Deno.test("date range filters by created_at", async () => {
  const from = new Date(Date.now() - 3600_000).toISOString();
  const inRange = await call("service-records", company, { action: "list", q: SN, created_from: from });
  assert(inRange.body.data.some((d: { id: string }) => d.id === recordId));
  const past = await call("service-records", company, { action: "list", q: SN, created_to: "2001-01-01T00:00:00Z" });
  assertEquals(past.body.data.length, 0);
});

Deno.test("get by id and by record number", async () => {
  const a = await call("service-records", company, { action: "get", id: recordId });
  assertEquals(a.body.record.record_no, saved.record_no);
  const b = await call("service-records", company, { action: "get", record_no: saved.record_no.toLowerCase() });
  assertEquals(b.body.record.id, recordId);
  const missing = await call("service-records", company, { action: "get", id: crypto.randomUUID() });
  assertEquals(missing.status, 404);
});

Deno.test("legacy role can view but not create", async () => {
  const list = await call("service-records", legacy, { action: "list", q: SN });
  assertEquals(list.status, 200);
  const create = await call("service-records", legacy, payload({ id: crypto.randomUUID() }));
  assertEquals(create.status, 403);
});

Deno.test("company user cannot delete records (API and direct database)", async () => {
  const api = await call("service-records", company, { action: "delete", id: recordId });
  assertEquals(api.status, 403);
  // Direct PostgREST delete: RLS silently matches nothing.
  await asUser(company).from("service_records").delete().eq("id", recordId);
  const { count } = await service.from("service_records").select("id", { count: "exact", head: true }).eq("id", recordId);
  assertEquals(count, 1);
  // Nor update (no update grant) or insert as someone else.
  const upd = await asUser(company).from("service_records").update({ farmer_name: "x" }).eq("id", recordId);
  assertExists(upd.error);
  const forged = await asUser(company).from("service_records").insert({
    farmer_name: "Forged", survey_number: "1", land_size: 1, land_unit: "acre", created_by: admin.id,
  });
  assertExists(forged.error);
});

Deno.test("reports: admin only, records dataset with filters", async () => {
  const denied = await call("export-data", company, { dataset: "records" });
  assertEquals(denied.status, 403);
  const r = await call("export-data", admin, { dataset: "records", q: SN, created_from: new Date(Date.now() - 3600_000).toISOString() });
  assertEquals(r.status, 200, JSON.stringify(r.body));
  assertEquals(r.body.title, "Farmer service records");
  const row = r.body.rows.find((x: { record_no: string }) => x.record_no === saved.record_no);
  assertExists(row);
  assertEquals(row.land_unit, "Acres");
  assertEquals(row.gender, "Male");
  assertEquals(row.created_by_name, `rcompany ${run}`);
});

Deno.test("admin-users refuses to delete a user who owns records", async () => {
  const r = await call("admin-users", admin, { action: "delete", user_id: company.id });
  assertEquals(r.status, 409);
  assertEquals(r.body.error.code, "user_has_records");
  const g = await call("admin-users", admin, { action: "get", user_id: company.id });
  assertEquals(g.body.user.records.service_records, 1);
  assertEquals(g.body.user.can_delete, false);
});

Deno.test("admin deletes a record; deletion is audited", async () => {
  const r = await call("service-records", admin, { action: "delete", id: recordId });
  assertEquals(r.status, 200, JSON.stringify(r.body));
  assertEquals(r.body.deleted.record_no, saved.record_no);
  const again = await call("service-records", admin, { action: "delete", id: recordId });
  assertEquals(again.status, 404);
  const { data: logs } = await service.from("audit_logs").select("action, user_id").eq("entity_id", recordId).order("created_at");
  assertEquals(logs?.map((l) => l.action), ["record_created", "record_deleted"]);
  assertEquals(logs?.[0].user_id, company.id);
  assertEquals(logs?.[1].user_id, admin.id);
});
