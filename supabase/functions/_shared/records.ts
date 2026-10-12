// Shared helpers for farmers, 1/14 forms (land records), schemes and applications.
import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import type { Profile } from "./auth.ts";
import { dbError, HttpError } from "./http.ts";
import { formatSurvey, signPhotoUrls, toNumber } from "./surveys.ts";
import { normalizeCode, z } from "./validation.ts";

// deno-lint-ignore no-explicit-any
export type Row = Record<string, any>;

export const GOA_TALUKAS = [
  "Bardez", "Bicholim", "Canacona", "Dharbandora", "Mormugao", "Pernem",
  "Ponda", "Quepem", "Salcete", "Sanguem", "Sattari", "Tiswadi",
] as const;
export const LAND_CLASSES = ["dry", "garden", "paddy", "khazan", "morad", "forest", "other"] as const;
export const IRRIGATION_SOURCES = ["rainfed", "well", "borewell", "canal", "river", "tank", "other"] as const;
export const FARMER_CATEGORIES = ["general", "obc", "sc", "st"] as const;
export const APPLICATION_STATUSES = ["applied", "under_review", "approved", "rejected", "disbursed"] as const;
export const FORM_STATUSES = ["pending", "verified", "rejected"] as const;

export const FARMER_COLUMNS =
  "id, name, mobile, father_name, gender, category, village, taluka, address, notes, created_at, updated_at";

export const FORM_COLUMNS = [
  "id", "form_id", "farmer_id", "village", "taluka", "survey_number", "sub_division", "occupant_names",
  "tenant_name", "area_sq_m", "land_class", "assessment_rs", "kharif_crop_id", "rabi_crop_id",
  "irrigation_source", "mutation_number", "remarks", "status", "created_by", "created_at", "updated_at",
].join(", ");

export const isAdmin = (p: Profile) => p.role === "admin";

/** Admins and company users add and edit records (020); the legacy field role stays read-only. */
export const EDITOR_ROLES = ["admin", "user"] as const;
export const canEditRecords = (p: Profile) => (EDITOR_ROLES as readonly string[]).includes(p.role);

export function requireEditor(p: Profile) {
  if (!canEditRecords(p)) throw new HttpError(403, "forbidden", "Your account can only view records");
}

export const optionalTrimmed = (max: number) =>
  z.preprocess((v) => (typeof v === "string" && v.trim() === "" ? null : v), z.string().trim().max(max).nullable().optional());

/** Resolve crop + creator names and numeric fields for 1/14 form rows. */
export async function decorateForms(admin: SupabaseClient, rows: Row[]): Promise<Row[]> {
  if (rows.length === 0) return [];
  const cropIds = [...new Set(rows.flatMap((r) => [r.kharif_crop_id, r.rabi_crop_id]).filter(Boolean))];
  const userIds = [...new Set(rows.map((r) => r.created_by).filter(Boolean))];
  const farmerIds = [...new Set(rows.map((r) => r.farmer_id).filter(Boolean))];
  const [crops, users, farmers] = await Promise.all([
    cropIds.length ? admin.from("crops").select("id, name").in("id", cropIds) : Promise.resolve({ data: [] }),
    userIds.length ? admin.from("profiles").select("id, full_name").in("id", userIds) : Promise.resolve({ data: [] }),
    farmerIds.length ? admin.from("farmers").select("id, name, mobile").in("id", farmerIds) : Promise.resolve({ data: [] }),
  ]);
  const cropName = new Map((crops.data ?? []).map((c: Row) => [c.id, c.name]));
  const userName = new Map((users.data ?? []).map((u: Row) => [u.id, u.full_name]));
  const farmer = new Map((farmers.data ?? []).map((f: Row) => [f.id, f]));
  return rows.map((r): Row => ({
    ...r,
    area_sq_m: toNumber(r.area_sq_m),
    assessment_rs: toNumber(r.assessment_rs),
    kharif_crop_name: r.kharif_crop_id ? cropName.get(r.kharif_crop_id) ?? null : null,
    rabi_crop_name: r.rabi_crop_id ? cropName.get(r.rabi_crop_id) ?? null : null,
    created_by_name: userName.get(r.created_by) ?? null,
    farmer_name: farmer.get(r.farmer_id)?.name ?? null,
    farmer_mobile: farmer.get(r.farmer_id)?.mobile ?? null,
  }));
}

const SURVEY_SUMMARY = [
  "id", "survey_id", "survey_number", "sub_division", "crop_name", "area", "area_unit", "visit_date",
  "collected_by", "collected_by_name", "latitude", "longitude", "photo_path", "duplicate_status",
  "submission_status", "land_record_id", "form_id", "created_at",
].join(", ");

/** Field surveys of a farmer (or of a form), with signed photo URLs. */
export async function loadSurveysFor(admin: SupabaseClient, filter: { farmer_id?: string; land_record_id?: string }) {
  let q = admin.from("survey_details").select(SURVEY_SUMMARY).order("created_at", { ascending: false }).limit(100);
  if (filter.farmer_id) q = q.eq("farmer_id", filter.farmer_id);
  if (filter.land_record_id) q = q.eq("land_record_id", filter.land_record_id);
  const { data, error } = await q;
  if (error) throw dbError(error);
  const rows = (data ?? []) as Row[];
  const photos = await signPhotoUrls(admin, rows.map((r) => r.photo_path));
  return rows.map((r) => formatSurvey(r, photos));
}

export async function loadForm(admin: SupabaseClient, filter: { id?: string; form_id?: string }) {
  let q = admin.from("land_records").select(FORM_COLUMNS);
  q = filter.id ? q.eq("id", filter.id) : q.eq("form_id", filter.form_id!);
  const { data, error } = await q.maybeSingle();
  if (error) throw dbError(error);
  if (!data) throw new HttpError(404, "not_found", "1/14 form not found");
  const [form] = await decorateForms(admin, [data as Row]);
  return form;
}

export async function loadApplications(admin: SupabaseClient, filter: { farmer_id?: string; scheme_id?: string; status?: string[] }) {
  let q = admin
    .from("subsidy_applications")
    .select("id, application_no, farmer_id, scheme_id, land_record_id, status, amount_rs, applied_on, decided_at, remarks, created_at, updated_at, updated_by")
    .order("applied_on", { ascending: false })
    .limit(200);
  if (filter.farmer_id) q = q.eq("farmer_id", filter.farmer_id);
  if (filter.scheme_id) q = q.eq("scheme_id", filter.scheme_id);
  if (filter.status?.length) q = q.in("status", filter.status);
  const { data, error } = await q;
  if (error) throw dbError(error);
  const rows = (data ?? []) as Row[];
  const schemeIds = [...new Set(rows.map((r) => r.scheme_id))];
  const farmerIds = [...new Set(rows.map((r) => r.farmer_id))];
  const userIds = [...new Set(rows.map((r) => r.updated_by).filter(Boolean))];
  const [schemes, farmers, users] = await Promise.all([
    schemeIds.length ? admin.from("subsidy_schemes").select("id, code, name, category").in("id", schemeIds) : Promise.resolve({ data: [] }),
    farmerIds.length ? admin.from("farmers").select("id, name, mobile, village, taluka").in("id", farmerIds) : Promise.resolve({ data: [] }),
    userIds.length ? admin.from("profiles").select("id, full_name").in("id", userIds) : Promise.resolve({ data: [] }),
  ]);
  const scheme = new Map((schemes.data ?? []).map((s: Row) => [s.id, s]));
  const farmer = new Map((farmers.data ?? []).map((f: Row) => [f.id, f]));
  const user = new Map((users.data ?? []).map((u: Row) => [u.id, u.full_name]));
  return rows.map((r): Row => ({
    ...r,
    amount_rs: toNumber(r.amount_rs),
    scheme_code: scheme.get(r.scheme_id)?.code ?? null,
    scheme_name: scheme.get(r.scheme_id)?.name ?? null,
    scheme_category: scheme.get(r.scheme_id)?.category ?? null,
    farmer_name: farmer.get(r.farmer_id)?.name ?? null,
    farmer_village: farmer.get(r.farmer_id)?.village ?? null,
    farmer_taluka: farmer.get(r.farmer_id)?.taluka ?? null,
    updated_by_name: r.updated_by ? user.get(r.updated_by) ?? null : null,
  }));
}

/** Evaluate every active scheme for a farmer. */
export async function eligibilityFor(admin: SupabaseClient, farmerId: string) {
  const { data: schemes, error } = await admin.from("subsidy_schemes").select("id, category").eq("status", "active").order("name");
  if (error) throw dbError(error);
  const results = await Promise.all(
    (schemes ?? []).map(async (s: Row) => {
      const { data, error: e } = await admin.rpc("evaluate_scheme_eligibility", { p_farmer_id: farmerId, p_scheme_id: s.id });
      if (e) throw dbError(e);
      return { ...(data as Row), scheme_category: s.category };
    }),
  );
  return results;
}

/**
 * "112/3" | "112/" | "112" -> {sn, sd}; null when the text isn't survey-number-like.
 * sd is a sub-division *prefix* ("" = any), so "312/4" also finds 4A, 4B.
 */
export function parseSurveyNumber(q: string): { sn: string; sd: string | null } | null {
  const t = q.trim();
  // Survey numbers are codes like 112, 12A, 45-B (with optional /sub-division); they always contain a digit.
  if (!/^[0-9A-Za-z-]{1,20}(\s*\/\s*[0-9A-Za-z-]{0,10})?$/.test(t) || !/\d/.test(t.split("/")[0])) return null;
  const [sn, sd] = t.split("/").map((x) => x.trim());
  return { sn: normalizeCode(sn), sd: sd ? normalizeCode(sd) : null };
}

/** PostgREST `or` term matching rows by survey number (+ sub-division prefix), or null. */
export function surveyNumberFilter(q: string): string | null {
  const sn = parseSurveyNumber(q);
  if (!sn) return null;
  return sn.sd ? `and(survey_number_norm.eq.${sn.sn},sub_division_norm.like.${sn.sd}*)` : `survey_number_norm.eq.${sn.sn}`;
}
