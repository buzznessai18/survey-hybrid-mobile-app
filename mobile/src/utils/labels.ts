import type { BadgeTone } from "@/components/ui/StatusBadge";
import type { ApplicationStatus, FarmerCategory, FormStatus, Gender, IrrigationSource, LandClass, LandUnit, SchemeCategory } from "@/types/api";

export const LAND_CLASS_LABELS: Record<LandClass, string> = {
  dry: "Dry (jirayat)", garden: "Garden (bagayat)", paddy: "Paddy / wet", khazan: "Khazan", morad: "Morad", forest: "Forest", other: "Other",
};
export const IRRIGATION_LABELS: Record<IrrigationSource, string> = {
  rainfed: "Rain-fed", well: "Well", borewell: "Borewell", canal: "Canal", river: "River / nullah", tank: "Tank / lake", other: "Other",
};
export const CATEGORY_LABELS: Record<FarmerCategory, string> = { general: "General", obc: "OBC", sc: "SC", st: "ST" };
export const GENDER_LABELS: Record<Gender, string> = { male: "Male", female: "Female", other: "Other" };
export const LAND_UNIT_LABELS: Record<LandUnit, string> = { acre: "Acres", sq_m: "Square metres" };

/** 2.5, "acre" -> "2.5 Acres"; 1 acre -> "1 Acre"; 450, "sq_m" -> "450 sq. m". Value shown exactly as saved. */
export function formatLandSize(size: number, unit: LandUnit): string {
  const n = Number(size).toLocaleString("en-IN", { maximumFractionDigits: 4 });
  if (unit === "sq_m") return `${n} sq. m`;
  return `${n} ${Number(size) === 1 ? "Acre" : "Acres"}`;
}

export const APPLICATION_STATUS_VIEW: Record<ApplicationStatus, { label: string; tone: BadgeTone }> = {
  applied: { label: "Applied", tone: "info" },
  under_review: { label: "Under review", tone: "warning" },
  approved: { label: "Approved", tone: "success" },
  rejected: { label: "Rejected", tone: "error" },
  disbursed: { label: "Received", tone: "primary" },
};
/** How a benefit record counts on the farmer profile. */
export type BenefitStage = "received" | "pending" | "rejected";
export const BENEFIT_STAGE: Record<ApplicationStatus, BenefitStage> = {
  applied: "pending", under_review: "pending", approved: "pending", disbursed: "received", rejected: "rejected",
};

export const SCHEME_CATEGORY_LABELS: Record<SchemeCategory, string> = {
  subsidy: "Subsidy", tractor: "Tractor", equipment: "Agri equipment", cylinder: "Gas cylinder",
  government_scheme: "Government scheme", service: "Service", other: "Other benefit",
};

/** Farmer-profile sections: which benefit categories each one lists. */
export const BENEFIT_GROUPS: { key: string; title: string; icon: "ribbon-outline" | "car-sport-outline" | "gift-outline"; categories: SchemeCategory[] }[] = [
  { key: "subsidies", title: "Subsidies & schemes", icon: "ribbon-outline", categories: ["subsidy", "government_scheme"] },
  { key: "tractor", title: "Tractor / equipment", icon: "car-sport-outline", categories: ["tractor", "equipment"] },
  { key: "services", title: "Services & other benefits", icon: "gift-outline", categories: ["cylinder", "service", "other"] },
];

export const FORM_STATUS_VIEW: Record<FormStatus, { label: string; tone: BadgeTone }> = {
  pending: { label: "Pending review", tone: "warning" },
  verified: { label: "Verified", tone: "success" },
  rejected: { label: "Rejected", tone: "error" },
};

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

/** 8500 -> "8,500 sq.m (0.85 ha)" */
export function formatSqM(sqm: number | null | undefined): string {
  if (sqm === null || sqm === undefined) return "—";
  const ha = sqm / 10000;
  return `${Math.round(sqm).toLocaleString("en-IN")} sq.m${ha >= 0.01 ? ` (${ha.toFixed(2)} ha)` : ""}`;
}

export function formatRupees(v: number | null | undefined): string {
  if (v === null || v === undefined) return "—";
  return `₹${Math.round(v).toLocaleString("en-IN")}`;
}

export function surveyNo(sn: string, sd?: string | null) {
  return sd ? `${sn}/${sd}` : sn;
}
