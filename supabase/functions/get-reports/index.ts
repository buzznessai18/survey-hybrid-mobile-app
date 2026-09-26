// GET|POST /functions/v1/get-reports
// Aggregated statistics, scoped by RLS: admins and read-only users see
// everything, supervisors their team's, surveyors their own.
import { requireViewer } from "../_shared/auth.ts";
import { dbError, json, readParams, serve } from "../_shared/http.ts";
import { isoDate, parse, uuid, z } from "../_shared/validation.ts";

const schema = z.object({
  date_from: isoDate.optional(),
  date_to: isoDate.optional(),
  surveyor_id: uuid.optional(),
  crop_id: uuid.optional(),
});

serve(["GET", "POST"], async (req) => {
  const { profile, readClient } = await requireViewer(req);
  const p = parse(schema, await readParams(req));

  const { data, error } = await readClient.rpc("get_survey_report", {
    p_from: p.date_from ?? null,
    p_to: p.date_to ?? null,
    p_collected_by: p.surveyor_id ?? null,
    p_crop_id: p.crop_id ?? null,
  });
  if (error) throw dbError(error);

  const scope = profile.role === "admin" || profile.role === "user" ? "all" : profile.role === "supervisor" ? "team" : "own";
  return json({ scope, filters: p, report: data });
});
