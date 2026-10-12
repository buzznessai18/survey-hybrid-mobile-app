// POST /functions/v1/schemes   (read: admins + company users; upsert: admins + company users)
//   { action: "list", status?, category? }
//   { action: "upsert", id?, code, name, category, ..., rules:{...} }
//   { action: "eligibility", farmer_id }            -> every active scheme evaluated for the farmer
import { requireUser } from "../_shared/auth.ts";
import { dbError, HttpError, json, readParams, serve } from "../_shared/http.ts";
import { eligibilityFor, FARMER_CATEGORIES, GOA_TALUKAS, optionalTrimmed, requireEditor, type Row } from "../_shared/records.ts";
import { toNumber } from "../_shared/surveys.ts";
import { parse, requiredText, uuid, z } from "../_shared/validation.ts";

const COLUMNS = "id, code, name, category, department, description, benefit, subsidy_percent, max_amount_rs, rules, status, valid_until, created_at, updated_at";

export const SCHEME_CATEGORIES = ["subsidy", "tractor", "equipment", "cylinder", "government_scheme", "service", "other"] as const;

const rules = z
  .object({
    min_land_sq_m: z.coerce.number().min(0).optional(),
    max_land_sq_m: z.coerce.number().gt(0).optional(),
    eligible_crop_ids: z.array(uuid).max(50).optional(),
    eligible_talukas: z.array(z.enum(GOA_TALUKAS)).max(12).optional(),
    eligible_categories: z.array(z.enum(FARMER_CATEGORIES)).max(4).optional(),
    cooldown_years: z.coerce.number().int().min(0).max(50).optional(),
    max_applications_per_farmer: z.coerce.number().int().min(1).max(100).optional(),
    require_verified_land: z.boolean().optional(),
  })
  .strict()
  .refine((r) => r.min_land_sq_m === undefined || r.max_land_sq_m === undefined || r.min_land_sq_m <= r.max_land_sq_m, {
    message: "Minimum land must not exceed maximum land", path: ["max_land_sq_m"],
  });

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("list"), status: z.enum(["active", "inactive"]).optional(), category: z.enum(SCHEME_CATEGORIES).optional() }),
  z.object({
    action: z.literal("upsert"),
    id: uuid.optional(),
    code: z.string().trim().toUpperCase().regex(/^[A-Z0-9-]{2,30}$/, "Use 2-30 letters, digits or dashes"),
    name: requiredText("Scheme name", 150),
    category: z.enum(SCHEME_CATEGORIES).default("subsidy"),
    department: optionalTrimmed(150),
    description: optionalTrimmed(2000),
    benefit: optionalTrimmed(500),
    subsidy_percent: z.coerce.number().min(0).max(100).nullable().optional(),
    max_amount_rs: z.coerce.number().min(0).nullable().optional(),
    rules: rules.default({}),
    status: z.enum(["active", "inactive"]).default("active"),
    valid_until: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  }),
  z.object({ action: z.literal("eligibility"), farmer_id: uuid }),
]);

const fmt = (s: Row) => ({ ...s, subsidy_percent: toNumber(s.subsidy_percent), max_amount_rs: toNumber(s.max_amount_rs) });

serve(["POST"], async (req) => {
  const { profile, adminClient, userClient } = await requireUser(req, ["user", "field_surveyor", "admin"]);
  const input = parse(schema, await readParams(req));

  if (input.action === "list") {
    let q = adminClient.from("subsidy_schemes").select(COLUMNS).order("name");
    if (input.status) q = q.eq("status", input.status);
    if (input.category) q = q.eq("category", input.category);
    const { data, error } = await q;
    if (error) throw dbError(error);
    const schemes = (data ?? []) as Row[];
    // Application counts per scheme for the list view.
    const { data: apps } = await adminClient.from("subsidy_applications").select("scheme_id, status");
    const counts = new Map<string, Record<string, number>>();
    for (const a of (apps ?? []) as Row[]) {
      const c = counts.get(a.scheme_id) ?? {};
      c[a.status] = (c[a.status] ?? 0) + 1;
      counts.set(a.scheme_id, c);
    }
    return json({ data: schemes.map((s) => ({ ...fmt(s), application_counts: counts.get(s.id) ?? {} })) });
  }

  if (input.action === "eligibility") {
    const { data: farmer } = await adminClient.from("farmers").select("id, name").eq("id", input.farmer_id).maybeSingle();
    if (!farmer) throw new HttpError(404, "not_found", "Farmer not found");
    return json({ farmer, results: await eligibilityFor(adminClient, input.farmer_id) });
  }

  requireEditor(profile);
  const { action: _a, id, ...fields } = input;
  const row = { ...fields, rules: fields.rules ?? {} };
  const { data, error } = id
    ? await userClient.from("subsidy_schemes").update(row).eq("id", id).select(COLUMNS).maybeSingle()
    : await userClient.from("subsidy_schemes").insert({ ...row, created_by: profile.id }).select(COLUMNS).single();
  if (error) throw dbError(error);
  if (!data) throw new HttpError(404, "not_found", "Scheme not found");
  return json({ scheme: fmt(data as Row) }, id ? 200 : 201);
});
