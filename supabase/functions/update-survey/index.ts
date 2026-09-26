// POST /functions/v1/update-survey
// Admins only: edit any survey, including submission_status (approve/reject).
// Changing survey number, sub-division or GPS re-runs duplicate detection.
import { requireUser } from "../_shared/auth.ts";
import { dbError, HttpError, json, readParams, serve } from "../_shared/http.ts";
import { assertPhotoPath, loadSurveyDetail } from "../_shared/surveys.ts";
import { parse, SUBMISSION_STATUSES, surveyFields, uuid, z } from "../_shared/validation.ts";

const schema = z
  .object({
    id: uuid,
    ...surveyFields,
    submission_status: z.enum(SUBMISSION_STATUSES),
  })
  .partial()
  .required({ id: true })
  .refine((v) => (v.latitude === undefined) === (v.longitude === undefined), {
    message: "Provide both latitude and longitude, or neither",
    path: ["longitude"],
  })
  .refine((v) => (v.latitude === undefined) || v.gps_accuracy !== undefined, {
    message: "gps_accuracy is required when the location changes",
    path: ["gps_accuracy"],
  })
  .refine((v) => v.duplicate_reason !== "other" || !!v.duplicate_reason_notes, {
    message: "Please describe the reason",
    path: ["duplicate_reason_notes"],
  });

serve(["POST"], async (req) => {
  const { profile, userClient, adminClient } = await requireUser(req, ["admin"]);
  const { id, ...patch } = parse(schema, await readParams(req));

  if (Object.keys(patch).length === 0) {
    throw new HttpError(422, "validation_error", "Nothing to update");
  }
  if (patch.photo_path) {
    const { data: owner } = await adminClient.from("surveys").select("collected_by").eq("id", id).maybeSingle();
    if (!owner) throw new HttpError(404, "not_found", "Survey not found");
    await assertPhotoPath(adminClient, owner.collected_by, id, patch.photo_path);
  }

  const { error } = await adminClient.rpc("update_survey", {
    p_actor: profile.id,
    p_survey_id: id,
    p_patch: patch,
  });
  if (error) throw dbError(error);

  const survey = await loadSurveyDetail(userClient, adminClient, profile, { id });
  return json({ survey });
});
