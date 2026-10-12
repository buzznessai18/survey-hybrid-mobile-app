// GET|POST /functions/v1/get-reports   (admins)
// All-time dashboard counts and work queues. Company users (read-only) get no
// dashboard; see get-analytics for the admin's date-range analytics.
import { requireUser } from "../_shared/auth.ts";
// deno-lint-ignore-file no-explicit-any
import { dbError, json, readParams, serve } from "../_shared/http.ts";
import { isoDate, parse, uuid, z } from "../_shared/validation.ts";

const schema = z.object({
  date_from: isoDate.optional(),
  date_to: isoDate.optional(),
  surveyor_id: uuid.optional(),
  crop_id: uuid.optional(),
});

serve(["GET", "POST"], async (req) => {
  const { userClient, adminClient } = await requireUser(req, ["admin"]);
  const p = parse(schema, await readParams(req));

  const { data, error } = await userClient.rpc("get_survey_report", {
    p_from: p.date_from ?? null,
    p_to: p.date_to ?? null,
    p_collected_by: p.surveyor_id ?? null,
    p_crop_id: p.crop_id ?? null,
  });
  if (error) throw dbError(error);

  // Extra dashboard tiles: farmers, 1/14 forms and subsidy applications.
  // deno-lint-ignore no-explicit-any
  const count = async (table: string, apply?: (q: any) => any) => {
    let q = adminClient.from(table).select("id", { count: "exact", head: true });
    if (apply) q = apply(q);
    const { count: n } = await q;
    return n ?? 0;
  };
  const [forms_total, forms_pending, farmers_total, applications_total, applications_pending, reviews_pending] = await Promise.all([
    count("land_records"),
    count("land_records", (q) => q.eq("status", "pending")),
    count("farmers"),
    count("subsidy_applications"),
    count("subsidy_applications", (q) => q.in("status", ["applied", "under_review"])),
    count("surveys", (q) => q.eq("submission_status", "pending")),
  ]);
  return json({
    scope: "all",
    filters: p,
    report: { ...(data as object), forms_total, forms_pending, farmers_total, applications_total, applications_pending, reviews_pending },
  });
});
