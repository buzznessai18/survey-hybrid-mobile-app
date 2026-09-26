import { useEffect } from "react";
import { useDraftStore } from "@/store/draftStore";
import type { SurveyDraft } from "@/types/survey";

/**
 * The current draft. Normally created by useStartSurvey before navigating;
 * if a wizard screen is opened directly, one is created after mount.
 */
export function useDraft(): SurveyDraft | null {
  const draft = useDraftStore((s) => s.draft);
  useEffect(() => {
    if (!draft) useDraftStore.getState().ensureDraft();
  }, [draft]);
  return draft;
}
