// POST /functions/v1/create-survey
// Main survey submission endpoint. Idempotent on the client-generated `id`.
import { requireUser } from "../_shared/auth.ts";
import { dbError, json, readParams, serve } from "../_shared/http.ts";
import { assertPhotoPath, loadSurveyDetail } from "../_shared/surveys.ts";
import { parse, surveyFields, uuid, z } from "../_shared/validation.ts";

const schema = z
  .object({
    // Client-generated UUID = idempotency key. Generate it when the survey is
    // started on the device and reuse it for every retry and the photo path.
    id: uuid,
    ...surveyFields,
  })
  .refine((v) => v.duplicate_reason !== "other" || !!v.duplicate_reason_notes, {
    message: "Please describe the reason",
    path: ["duplicate_reason_notes"],
  });

serve(["POST"], async (req) => {
  // 1-2. Authenticate: field survey users and admins create surveys.
  const { profile, adminClient } = await requireUser(req, ["admin", "user"]);

  // 3. Validate.
  const input = parse(schema, await readParams(req));
  if (input.photo_path) {
    await assertPhotoPath(adminClient, profile.id, input.id, input.photo_path);
  }

  // 4-8. Duplicate checks, farmer upsert, survey + duplicate_matches insert,
  // all inside one database transaction (public.create_survey).
  const { data, error } = await adminClient.rpc("create_survey", {
    p_actor: profile.id,
    p_payload: input,
  });
  if (error) throw dbError(error);
  const result = data as { id: string; created: boolean };

  // 9. Return the created (or previously created) survey.
  const survey = await loadSurveyDetail(adminClient, adminClient, profile, { id: result.id });
  return json(
    { survey, created: result.created, idempotent_replay: !result.created },
    result.created ? 201 : 200,
  );
});
