import { useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { ApiError, errorMessage, toApiError } from "@/services/api/errors";
import { SurveyService } from "@/services/surveys/SurveyService";
import type { SurveyDetail } from "@/types/api";

export function useSurveyDetail(id: string | undefined, enabled = true) {
  const [survey, setSurvey] = useState<SurveyDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<{ message: string; offline: boolean; notFound: boolean } | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      setSurvey(await SurveyService.getSurvey(id));
      setError(null);
    } catch (e) {
      const err = toApiError(e);
      setError({
        message: err.kind === "not_found" ? "This survey doesn't exist or isn't yours." : errorMessage(e),
        offline: err.isConnectivity,
        notFound: err instanceof ApiError && err.kind === "not_found",
      });
    } finally {
      setLoading(false);
    }
  }, [id]);

  // Load on focus so returning from the edit screen shows fresh data.
  useFocusEffect(
    useCallback(() => {
      if (enabled) void load();
      else setLoading(false);
    }, [enabled, load]),
  );

  return { survey, setSurvey, loading, error, reload: load };
}
