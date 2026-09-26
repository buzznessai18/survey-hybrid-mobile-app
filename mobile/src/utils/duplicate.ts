import type { DuplicateCheckMatch, DuplicateCheckResponse, SurveySummary } from "@/types/api";
import { normalizeCode } from "./mobile";

export type DuplicateLevel = "none" | "possible" | "duplicate";

export interface DuplicateInterpretation {
  level: DuplicateLevel;
  /** Closest / most relevant existing record to show first. */
  primary: DuplicateCheckMatch | null;
  matchCount: number;
  nearestDistance: number | null;
  /** Same farmer's other surveys — informational, NOT a duplicate. */
  farmerSurveys: SurveySummary[];
}

/**
 * Interpret the backend response. The backend decides what matches; the app
 * only chooses how to present it:
 *   duplicate_found     -> same survey number + sub-division exists
 *   possible_duplicate  -> same survey number within the GPS radius
 */
export function interpretDuplicateCheck(res: DuplicateCheckResponse | null | undefined): DuplicateInterpretation {
  if (!res) return { level: "none", primary: null, matchCount: 0, nearestDistance: null, farmerSurveys: [] };
  const level: DuplicateLevel = res.duplicate_found ? "duplicate" : res.possible_duplicate ? "possible" : "none";
  // Backend orders exact matches first, then by distance.
  const primary = res.matches[0] ?? null;
  return {
    level: res.matches.length === 0 ? "none" : level === "none" ? "possible" : level,
    primary,
    matchCount: res.matches.length,
    nearestDistance: res.nearest_distance_meters,
    farmerSurveys: res.farmer_surveys ?? [],
  };
}

/** Identifies which inputs a stored check result belongs to. */
export function duplicateCheckKey(
  surveyNumber: string,
  subDivision: string,
  location?: { latitude: number; longitude: number } | null,
): string {
  const base = `${normalizeCode(surveyNumber)}|${normalizeCode(subDivision)}`;
  return location ? `${base}|${location.latitude.toFixed(5)},${location.longitude.toFixed(5)}` : base;
}
