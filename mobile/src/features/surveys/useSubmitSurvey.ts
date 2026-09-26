import { router } from "expo-router";
import { useCallback, useRef, useState } from "react";
import { SyncService } from "@/services/sync/SyncService";
import { useAuthStore } from "@/store/authStore";
import { useDraftStore } from "@/store/draftStore";
import { IncompleteDraftError } from "@/utils/serialization";

/** Collapse the wizard stack so the success screen is the only step left. */
function goToSuccess(params: Record<string, string>) {
  if (router.canDismiss()) router.dismissAll();
  router.replace({ pathname: "/survey/new/success", params });
}

export interface SubmitError {
  message: string;
  fields?: Record<string, string>;
}

/**
 * Submit the current draft through the offline queue. Guards against double
 * taps; the backend's idempotency guards against network retries.
 */
export function useSubmitSurvey() {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<SubmitError | null>(null);
  const busy = useRef(false);

  const submit = useCallback(async () => {
    if (busy.current) return;
    const draft = useDraftStore.getState().draft;
    const userId = useAuthStore.getState().profile?.id;
    if (!draft || !userId) return;

    busy.current = true;
    setSubmitting(true);
    setError(null);
    try {
      const outcome = await SyncService.submitDraft(draft, userId);
      switch (outcome.kind) {
        case "synced":
          useDraftStore.getState().clear();
          goToSuccess({
            id: outcome.response.survey.id,
            code: outcome.response.survey.survey_id,
            replay: outcome.response.idempotent_replay ? "1" : "0",
            duplicate: outcome.response.survey.duplicate_check.duplicate_found ? "1" : "0",
          });
          break;
        case "queued":
          useDraftStore.getState().clear();
          goToSuccess({ id: outcome.item.id, queued: "1", message: outcome.message });
          break;
        case "skipped":
          // Already synced earlier (e.g. double submit after success).
          useDraftStore.getState().clear();
          goToSuccess({ id: draft.id, code: outcome.item?.result?.surveyCode ?? "", replay: "1" });
          break;
        case "failed":
          setError({ message: outcome.error.message, fields: outcome.error.fields });
          break;
      }
    } catch (e) {
      setError({
        message: e instanceof IncompleteDraftError ? e.message : "We couldn't save the survey. Please try again.",
      });
    } finally {
      busy.current = false;
      setSubmitting(false);
    }
  }, []);

  return { submit, submitting, error, clearError: () => setError(null) };
}
