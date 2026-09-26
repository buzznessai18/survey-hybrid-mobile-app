// POST /functions/v1/check-survey-duplicate
// Pre-submission duplicate check. Never blocks submission; it only warns.
import { requireUser } from "../_shared/auth.ts";
import { dbError, json, readParams, serve } from "../_shared/http.ts";
import { checkDuplicates, getDuplicateRadius, loadSurveySummaries } from "../_shared/surveys.ts";
import {
  latitude, longitude, mobile, parse, subDivision, surveyNumber, uuid, z,
} from "../_shared/validation.ts";

const schema = z
  .object({
    survey_number: surveyNumber,
    sub_division: subDivision,
    latitude: latitude.optional(),
    longitude: longitude.optional(),
    // Optional farmer check: existing surveys of the same farmer (informational).
    farmer_mobile: mobile.optional(),
    // When editing an existing survey, exclude it from the results.
    exclude_survey_id: uuid.optional(),
  })
  .refine((v) => (v.latitude === undefined) === (v.longitude === undefined), {
    message: "Provide both latitude and longitude, or neither",
    path: ["longitude"],
  });

const FARMER_SURVEY_LIMIT = 10;

serve(["POST"], async (req) => {
  const { profile, adminClient } = await requireUser(req);
  const input = parse(schema, await readParams(req));

  const [duplicates, radius, farmerSurveys] = await Promise.all([
    checkDuplicates(adminClient, profile, input),
    getDuplicateRadius(adminClient),
    input.farmer_mobile ? findFarmerSurveys(input.farmer_mobile, input.exclude_survey_id) : Promise.resolve(null),
  ]);

  return json({
    ...duplicates,
    radius_meters: radius,
    // Same farmer does NOT mean duplicate: a farmer can own many fields.
    farmer_surveys: farmerSurveys,
  });

  async function findFarmerSurveys(farmerMobile: string, excludeId?: string) {
    const { data: farmers, error } = await adminClient.from("farmers").select("id").eq("mobile", farmerMobile);
    if (error) throw dbError(error);
    const farmerIds = (farmers ?? []).map((f) => f.id);
    if (farmerIds.length === 0) return [];

    let query = adminClient
      .from("surveys")
      .select("id")
      .in("farmer_id", farmerIds)
      .order("created_at", { ascending: false })
      .limit(FARMER_SURVEY_LIMIT);
    if (excludeId) query = query.neq("id", excludeId);
    const { data: surveys, error: surveyError } = await query;
    if (surveyError) throw dbError(surveyError);

    const ids = (surveys ?? []).map((s) => s.id);
    const summaries = await loadSurveySummaries(adminClient, ids, profile);
    return ids.map((id) => summaries.get(id)).filter(Boolean);
  }
});
