// POST /functions/v1/applications   (benefit / service records; read: admins + company users; upsert: admins + company users)
// Status: applied / under_review / approved = pending, disbursed = received, rejected.
//   { action: "list", farmer_id?, scheme_id?, status? }
//   { action: "upsert", id?, farmer_id, scheme_id, land_record_id?, status, amount_rs?, applied_on?, remarks? }
// Creating an application returns the current eligibility result as a warning (it doesn't block).
import { requireUser } from "../_shared/auth.ts";
import { dbError, HttpError, json, readParams, serve } from "../_shared/http.ts";
import { APPLICATION_STATUSES, loadApplications, optionalTrimmed, requireEditor, type Row } from "../_shared/records.ts";
import { listOf, parse, uuid, z } from "../_shared/validation.ts";

const schema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("list"), farmer_id: uuid.optional(), scheme_id: uuid.optional(), status: listOf([...APPLICATION_STATUSES]) }),
  z.object({
    action: z.literal("upsert"),
    id: uuid.optional(),
    farmer_id: uuid,
    scheme_id: uuid,
    land_record_id: uuid.nullable().optional(),
    status: z.enum(APPLICATION_STATUSES).default("applied"),
    amount_rs: z.coerce.number().min(0).nullable().optional(),
    applied_on: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    remarks: optionalTrimmed(2000),
  }),
]);

serve(["POST"], async (req) => {
  const { profile, adminClient, userClient } = await requireUser(req, ["user", "field_surveyor", "admin"]);
  const input = parse(schema, await readParams(req));

  if (input.action === "list") {
    return json({ data: await loadApplications(adminClient, input) });
  }

  requireEditor(profile);
  const { action: _a, id, ...fields } = input;
  const row: Row = { ...fields, updated_by: profile.id };
  if (["approved", "rejected", "disbursed"].includes(fields.status)) row.decided_at = new Date().toISOString();
  let eligibility: Row | null = null;
  if (!id) {
    const { data: ev, error: evErr } = await adminClient.rpc("evaluate_scheme_eligibility", {
      p_farmer_id: fields.farmer_id, p_scheme_id: fields.scheme_id,
    });
    if (evErr) throw dbError(evErr);
    eligibility = ev as Row;
  }
  const { data, error } = id
    ? await userClient.from("subsidy_applications").update(row).eq("id", id).select("id").maybeSingle()
    : await userClient.from("subsidy_applications").insert({ ...row, created_by: profile.id }).select("id").single();
  if (error) throw dbError(error);
  if (!data) throw new HttpError(404, "not_found", "Application not found");
  const [application] = (await loadApplications(adminClient, { farmer_id: fields.farmer_id })).filter((a) => a.id === data.id);
  return json({ application, eligibility }, id ? 200 : 201);
});
