// GET|POST /functions/v1/get-survey?id=<uuid>  or  ?survey_id=SV-000123
// Full survey detail for any authorised user. Authorisation is enforced by
// RLS: surveyors see their own, supervisors their team's, admins all.
import { requireViewer } from "../_shared/auth.ts";
import { json, readParams, serve } from "../_shared/http.ts";
import { loadSurveyDetail } from "../_shared/surveys.ts";
import { parse, uuid, z } from "../_shared/validation.ts";

const schema = z
  .object({
    id: uuid.optional(),
    survey_id: z.string().trim().regex(/^SV-\d{6,}$/i, "Expected a survey id like SV-000123").transform((s) => s.toUpperCase()).optional(),
  })
  .refine((v) => !!v.id !== !!v.survey_id, { message: "Provide either id or survey_id", path: ["id"] });

serve(["GET", "POST"], async (req) => {
  const { profile, readClient, adminClient } = await requireViewer(req);
  const input = parse(schema, await readParams(req));

  const survey = await loadSurveyDetail(readClient, adminClient, profile, input);
  return json({ survey });
});
