import type { Gender, LandUnit, Role } from "./types";

export const GENDER_LABELS: Record<Gender, string> = { male: "Male", female: "Female", other: "Other" };
export const LAND_UNIT_LABELS: Record<LandUnit, string> = { acre: "Acres", sq_m: "Square metres" };
export const ROLE_LABELS: Record<Role, string> = { admin: "Admin", user: "Regular user", field_surveyor: "View only", supervisor: "Supervisor" };

/** 2.5, "acre" -> "2.5 Acres"; 1 acre -> "1 Acre"; 450, "sq_m" -> "450 sq. m". Value shown exactly as saved. */
export function formatLandSize(size: number, unit: LandUnit): string {
  const n = Number(size).toLocaleString("en-IN", { maximumFractionDigits: 4 });
  if (unit === "sq_m") return `${n} sq. m`;
  return `${n} ${Number(size) === 1 ? "Acre" : "Acres"}`;
}

/** "125/2" or "125" */
export function surveyNumberLabel(surveyNumber: string, subDivision?: string | null): string {
  return subDivision ? `${surveyNumber}/${subDivision}` : surveyNumber;
}

export const AUDIT_ACTION_LABELS: Record<string, string> = {
  survey_created: "Survey submitted", survey_updated: "Survey updated", survey_deleted: "Survey deleted",
  duplicate_detected: "Duplicate detected", duplicate_reviewed: "Duplicate reviewed",
  user_role_changed: "User role changed", user_updated: "User updated", user_deleted: "User deleted",
  farmer_created: "Farmer added", farmer_updated: "Farmer updated", farmer_deleted: "Farmer deleted",
  form_created: "1/14 form submitted", form_updated: "1/14 form updated", form_deleted: "1/14 form deleted",
  scheme_created: "Scheme created", scheme_updated: "Scheme updated", scheme_deleted: "Scheme deleted",
  application_created: "Application created", application_updated: "Application updated", application_deleted: "Application deleted",
  record_created: "Record saved", record_updated: "Record updated", record_deleted: "Record deleted",
};

export function initials(name: string | null | undefined): string {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

export function firstName(name: string | null | undefined): string {
  return (name ?? "").trim().split(/\s+/)[0] || "there";
}
