// POST /functions/v1/review-duplicate
// Supervisor (assigned surveyors only), admin or company user reviews a duplicate match.
// The update runs as the caller, so RLS decides whether they may review it;
// database triggers stamp reviewed_by/reviewed_at, write the audit log and
// recompute the survey's duplicate_status.
import { requireUser } from "../_shared/auth.ts";
import { dbError, HttpError, json, readParams, serve } from "../_shared/http.ts";
import { toNumber } from "../_shared/surveys.ts";
import { optionalText, parse, REVIEW_STATUSES, uuid, z } from "../_shared/validation.ts";

const schema = z.object({
  duplicate_match_id: uuid,
  status: z.enum(REVIEW_STATUSES),
  notes: optionalText(2000),
});

serve(["POST"], async (req) => {
  const { userClient } = await requireUser(req, ["supervisor", "admin", "user"]);
  const input = parse(schema, await readParams(req));

  const changes: Record<string, unknown> = { status: input.status };
  if (input.notes !== undefined) changes.notes = input.notes;

  const { data: match, error } = await userClient
    .from("duplicate_matches")
    .update(changes)
    .eq("id", input.duplicate_match_id)
    .select("id, survey_id, matched_survey_id, match_type, distance_meters, status, reviewed_by, reviewed_at, notes, created_at")
    .maybeSingle();
  if (error) throw dbError(error);
  if (!match) {
    throw new HttpError(404, "not_found", "Duplicate match not found or not assigned to you");
  }

  const { data: survey, error: surveyError } = await userClient
    .from("surveys")
    .select("id, survey_id, duplicate_status")
    .eq("id", match.survey_id)
    .single();
  if (surveyError) throw dbError(surveyError);

  return json({
    duplicate_match: { ...match, distance_meters: toNumber(match.distance_meters) },
    survey,
  });
});
