import type { AreaUnit, DuplicateReason } from "@/types/api";

export const AREA_UNIT_LABELS: Record<AreaUnit, { one: string; many: string }> = {
  acre: { one: "Acre", many: "Acres" },
  hectare: { one: "Hectare", many: "Hectares" },
  guntha: { one: "Guntha", many: "Gunthas" },
  cent: { one: "Cent", many: "Cents" },
  bigha: { one: "Bigha", many: "Bighas" },
  sq_m: { one: "Sq. m", many: "Sq. m" },
};

export function formatArea(area: number | string | null | undefined, unit: AreaUnit): string {
  if (area === null || area === undefined || area === "") return "—";
  const n = Number(area);
  const label = AREA_UNIT_LABELS[unit] ?? { one: unit, many: unit };
  return `${Number.isInteger(n) ? n : Number(n.toFixed(4))} ${n === 1 ? label.one : label.many}`;
}

export const DUPLICATE_REASON_LABELS: Record<DuplicateReason, string> = {
  different_farmer: "Different farmer",
  different_portion_of_land: "Different portion of land",
  previous_data_incorrect: "Previous data incorrect",
  previous_survey_unavailable: "Previous survey unavailable",
  other: "Other",
};

/** "125/2" or "125" */
export function surveyNumberLabel(surveyNumber: string, subDivision?: string | null): string {
  return subDivision ? `${surveyNumber}/${subDivision}` : surveyNumber;
}

export function formatCoord(value: number | null | undefined): string {
  return value === null || value === undefined ? "—" : value.toFixed(6);
}

export function formatDistance(meters: number | null | undefined): string {
  if (meters === null || meters === undefined) return "—";
  if (meters >= 1000) return `${(meters / 1000).toFixed(1)} km`;
  return `${Math.round(meters)} meters`;
}

export function initials(name: string | null | undefined): string {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

export function firstName(name: string | null | undefined): string {
  return (name ?? "").trim().split(/\s+/)[0] || "there";
}
