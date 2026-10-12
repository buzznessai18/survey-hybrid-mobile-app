import { useCallback, useEffect, useEffectEvent, useState } from "react";
import { appConfig } from "@/config/env";
import { toApiError } from "@/services/api/errors";
import { FormService } from "@/services/records/RecordServices";
import { useNetworkStore } from "@/store/networkStore";
import type { FormDuplicateCheck } from "@/types/api";
import { normalizeCode } from "@/utils/mobile";

export type FormCheckState =
  | { status: "idle" }
  | { status: "checking" }
  | { status: "offline" }
  | { status: "error"; retry: () => void }
  | { status: "clear"; result: FormDuplicateCheck }
  | { status: "duplicate"; result: FormDuplicateCheck };

/**
 * Debounced land-records check_duplicate: existing 1/14 forms with the same
 * survey no./sub-division (same village first) + nearby/exact field surveys.
 * Informational only — submission is never blocked.
 */
export function useFormDuplicateCheck(
  input: { surveyNumber: string; subDivision: string; village?: string; location?: { latitude: number; longitude: number } | null },
  options: { enabled?: boolean; onResult?: (r: FormDuplicateCheck) => void } = {},
): FormCheckState {
  const { enabled = true, onResult } = options;
  const isOnline = useNetworkStore((s) => s.isOnline);
  const [attempt, setAttempt] = useState(0);
  const [outcome, setOutcome] = useState<{ tag: string; value: FormDuplicateCheck | "offline" | "error" } | null>(null);
  const retry = useCallback(() => setAttempt((a) => a + 1), []);
  const emit = useEffectEvent((r: FormDuplicateCheck) => onResult?.(r));

  const sn = input.surveyNumber.trim();
  const lat = input.location?.latitude;
  const lng = input.location?.longitude;
  const tag = [normalizeCode(sn), normalizeCode(input.subDivision), (input.village ?? "").toLowerCase(), lat?.toFixed(5), lng?.toFixed(5), attempt].join("|");
  const active = enabled && sn.length > 0 && isOnline;

  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const r = await FormService.checkDuplicate({
          survey_number: sn,
          sub_division: input.subDivision.trim() || null,
          village: input.village?.trim() || undefined,
          latitude: lat,
          longitude: lng,
        });
        if (cancelled) return;
        emit(r);
        setOutcome({ tag, value: r });
      } catch (e) {
        if (!cancelled) setOutcome({ tag, value: toApiError(e).isConnectivity ? "offline" : "error" });
      }
    }, appConfig.duplicateCheckDebounceMs);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [active, tag, sn, input.subDivision, input.village, lat, lng]);

  if (!enabled || sn.length === 0) return { status: "idle" };
  if (!isOnline) return { status: "offline" };
  if (!outcome || outcome.tag !== tag) return { status: "checking" };
  if (outcome.value === "offline") return { status: "offline" };
  if (outcome.value === "error") return { status: "error", retry };
  const r = outcome.value;
  const hit = r.same_village_forms > 0 || r.survey_check.duplicate_found || r.survey_check.possible_duplicate;
  return hit ? { status: "duplicate", result: r } : { status: "clear", result: r };
}

/** True when the check found something the user should acknowledge. */
export function formCheckHasWarning(r: FormDuplicateCheck | null | undefined): boolean {
  if (!r) return false;
  return r.same_village_forms > 0 || r.survey_check.duplicate_found || r.survey_check.possible_duplicate;
}
