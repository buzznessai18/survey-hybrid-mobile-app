import type { QueueItem } from "@/types/survey";
import { queueSummary } from "./serialization";

const norm = (v: string | null | undefined) => (v ?? "").replace(/\s+/g, "").toUpperCase();

/**
 * Survey-number search, same rule as the backend: "312" or "312/" = any sub-division of 312,
 * "312/4" = sub-divisions starting with 4 (4, 4A, 4B), "312/4b" = 4B. Case and spaces ignored.
 */
export function matchesSurveyNumber(term: string, surveyNumber: string, subDivision: string | null | undefined): boolean {
  const t = term.trim();
  if (!/^[0-9A-Za-z-]{1,20}(\s*\/\s*[0-9A-Za-z-]{0,10})?$/.test(t) || !/\d/.test(t.split("/")[0])) return false;
  const [sn, sd = ""] = t.split("/");
  return norm(surveyNumber) === norm(sn) && norm(subDivision).startsWith(norm(sd));
}

/** Offline-queue search: farmer, mobile, village, survey no. (incl. "312/4b"). */
export function matchesQueueSearch(q: QueueItem, term: string): boolean {
  if (!term) return true;
  const t = term.toLowerCase();
  const d = queueSummary(q);
  const fields = [d.farmerName, d.farmerMobile, d.surveyNumber, d.subDivision, q.land?.village ?? "", q.land?.occupantNames ?? ""];
  return fields.some((v) => v.toLowerCase().includes(t)) || matchesSurveyNumber(term, d.surveyNumber, d.subDivision);
}
