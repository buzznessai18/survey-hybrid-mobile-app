import { useCallback, useEffect, useEffectEvent, useState } from "react";
import { appConfig } from "@/config/env";
import { toApiError } from "@/services/api/errors";
import { DuplicateService } from "@/services/surveys/DuplicateService";
import { useNetworkStore } from "@/store/networkStore";
import type { DuplicateCheckResponse } from "@/types/api";
import { duplicateCheckKey, interpretDuplicateCheck, type DuplicateInterpretation } from "@/utils/duplicate";

export type DuplicateCheckState =
  | { status: "idle" }
  | { status: "checking" }
  | { status: "offline" }
  | { status: "error"; retry: () => void }
  | { status: "available"; result: DuplicateCheckResponse; interpretation: DuplicateInterpretation }
  | { status: "duplicate"; result: DuplicateCheckResponse; interpretation: DuplicateInterpretation };

interface Options {
  location?: { latitude: number; longitude: number } | null;
  farmerMobile?: string;
  excludeSurveyId?: string;
  enabled?: boolean;
  /** Called with every successful backend result (e.g. to store on the draft). */
  onResult?: (key: string, result: DuplicateCheckResponse) => void;
  /** Result already known for these inputs (skips the request). */
  cached?: { key: string | null; result: DuplicateCheckResponse | null };
}

type Outcome = { kind: "result"; result: DuplicateCheckResponse } | { kind: "offline" } | { kind: "error" };

const fromResult = (result: DuplicateCheckResponse): DuplicateCheckState => {
  const interpretation = interpretDuplicateCheck(result);
  return interpretation.level === "none"
    ? { status: "available", result, interpretation }
    : { status: "duplicate", result, interpretation };
};

/**
 * Debounced call to check-survey-duplicate as the surveyor types. The backend
 * is the source of truth; this only surfaces its answer early.
 */
export function useDuplicateCheck(surveyNumber: string, subDivision: string, options: Options = {}): DuplicateCheckState {
  const { location, farmerMobile, excludeSurveyId, enabled = true, onResult, cached } = options;
  const isOnline = useNetworkStore((s) => s.isOnline);
  const [attempt, setAttempt] = useState(0);
  // Outcome of the last request, tagged with the request it answers.
  const [outcome, setOutcome] = useState<{ tag: string; value: Outcome } | null>(null);

  const sn = surveyNumber.trim();
  const key = duplicateCheckKey(sn, subDivision, location ?? null);
  const cachedResult = cached?.key === key && attempt === 0 ? cached.result : null;
  const needsRequest = enabled && sn.length > 0 && !cachedResult && isOnline;
  const tag = `${key}|${farmerMobile ?? ""}|${excludeSurveyId ?? ""}|${attempt}`;
  const retry = useCallback(() => setAttempt((a) => a + 1), []);

  const emitResult = useEffectEvent((k: string, result: DuplicateCheckResponse) => onResult?.(k, result));
  const coords = location ? { latitude: location.latitude, longitude: location.longitude } : null;
  const latitude = coords?.latitude;
  const longitude = coords?.longitude;

  useEffect(() => {
    if (!needsRequest) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const result = await DuplicateService.check({
          surveyNumber: sn,
          subDivision,
          location: latitude !== undefined && longitude !== undefined ? { latitude, longitude } : null,
          farmerMobile,
          excludeSurveyId,
        });
        if (cancelled) return;
        emitResult(key, result);
        setOutcome({ tag, value: { kind: "result", result } });
      } catch (e) {
        if (cancelled) return;
        setOutcome({ tag, value: toApiError(e).isConnectivity ? { kind: "offline" } : { kind: "error" } });
      }
    }, appConfig.duplicateCheckDebounceMs);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [needsRequest, tag, key, sn, subDivision, latitude, longitude, farmerMobile, excludeSurveyId]);

  // Derive the visible state from inputs + the latest matching outcome.
  if (!enabled || sn.length === 0) return { status: "idle" };
  if (cachedResult) return fromResult(cachedResult);
  if (!isOnline) return { status: "offline" };
  if (!outcome || outcome.tag !== tag) return { status: "checking" };
  if (outcome.value.kind === "result") return fromResult(outcome.value.result);
  if (outcome.value.kind === "offline") return { status: "offline" };
  return { status: "error", retry };
}
