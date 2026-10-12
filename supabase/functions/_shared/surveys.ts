import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import type { Profile } from "./auth.ts";
import { config } from "./config.ts";
import { dbError, HttpError } from "./http.ts";

/** Columns returned for list views (get-my-surveys, search-surveys). */
export const LIST_COLUMNS = [
  "id", "survey_id", "survey_number", "sub_division", "farmer_name", "farmer_mobile",
  "crop_id", "crop_name", "area", "area_unit", "visit_date", "collected_by", "collected_by_name",
  "photo_path", "duplicate_status", "submission_status", "created_at", "updated_at",
].join(", ");

/** Columns returned for a single survey. */
export const DETAIL_COLUMNS = [
  "id", "survey_id", "survey_number", "sub_division", "farmer_id", "farmer_name", "farmer_mobile",
  "crop_id", "crop_name", "area", "area_unit", "visit_date", "collected_by", "collected_by_name",
  "latitude", "longitude", "gps_accuracy", "photo_path", "duplicate_status", "submission_status",
  "duplicate_reason", "duplicate_reason_notes", "notes", "created_at", "updated_at",
].join(", ");

/** Minimal columns for another surveyor's record shown in a duplicate warning. */
const SUMMARY_COLUMNS = [
  "id", "survey_id", "survey_number", "sub_division", "farmer_name", "farmer_mobile", "crop_name",
  "area", "area_unit", "visit_date", "collected_by", "collected_by_name", "latitude", "longitude",
  "photo_path", "duplicate_status", "submission_status", "created_at",
].join(", ");

// deno-lint-ignore no-explicit-any
type Row = Record<string, any>;

export function toNumber(v: unknown): number | null {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/**
 * Read-only viewers (the `user` role, incl. no-login guests) see farmer
 * mobile numbers masked. Admins and supervisors see them in full.
 */
/** "9876543210" -> "******3210" */
export function maskMobile(mobile: string | null): string | null {
  if (!mobile) return mobile;
  return mobile.length <= 4 ? "****" : "*".repeat(mobile.length - 4) + mobile.slice(-4);
}

/** Batch-sign photo paths. Returns path -> signed URL. */
export async function signPhotoUrls(admin: SupabaseClient, paths: (string | null | undefined)[]) {
  const unique = [...new Set(paths.filter((p): p is string => !!p))];
  const urls = new Map<string, string>();
  if (unique.length === 0) return urls;
  const { data, error } = await admin.storage
    .from(config.photoBucket)
    .createSignedUrls(unique, config.signedUrlTtlSeconds);
  if (error) {
    console.error("createSignedUrls failed", error);
    return urls;
  }
  for (const item of data ?? []) {
    if (item.path && item.signedUrl && !item.error) urls.set(item.path, item.signedUrl);
  }
  return urls;
}

/** Normalise numeric columns (PostgREST returns numeric as number or string). */
export function formatSurvey(row: Row, photoUrls?: Map<string, string>) {
  const out: Row = { ...row };
  for (const key of ["area", "latitude", "longitude", "gps_accuracy"]) {
    if (key in out) out[key] = toNumber(out[key]);
  }
  if ("photo_path" in out) {
    out.photo_url = out.photo_path ? photoUrls?.get(out.photo_path) ?? null : null;
  }
  return out;
}

/**
 * Load limited summaries of arbitrary surveys (bypassing RLS) for duplicate
 * warnings. Field surveyors see other surveyors' farmer mobiles masked.
 */
export async function loadSurveySummaries(admin: SupabaseClient, ids: string[], viewer: Profile) {
  const map = new Map<string, Row>();
  if (ids.length === 0) return map;
  const { data, error } = await admin.from("survey_details").select(SUMMARY_COLUMNS).in("id", ids);
  if (error) throw dbError(error);

  const rows = (data ?? []) as Row[];
  const photos = await signPhotoUrls(admin, rows.map((r) => r.photo_path));
  for (const row of rows) {
    const summary = formatSurvey(row, photos);
    const isOwn = row.collected_by === viewer.id;
    if (viewer.role === "field_surveyor" && !isOwn) {
      summary.farmer_mobile = maskMobile(summary.farmer_mobile);
    }
    delete summary.photo_path;
    delete summary.collected_by;
    summary.is_own = isOwn;
    map.set(row.id, summary);
  }
  return map;
}

export interface DuplicateRow {
  matched_survey_id: string;
  match_type: "exact" | "proximity" | "exact_and_proximity";
  distance_meters: number | string | null;
  within_radius: boolean;
}

/** Run the database duplicate detector and build the API response shape. */
export async function checkDuplicates(
  admin: SupabaseClient,
  viewer: Profile,
  input: {
    survey_number: string;
    sub_division?: string | null;
    latitude?: number | null;
    longitude?: number | null;
    exclude_survey_id?: string | null;
  },
) {
  const { data, error } = await admin.rpc("find_survey_duplicates", {
    p_survey_number: input.survey_number,
    p_sub_division: input.sub_division ?? null,
    p_latitude: input.latitude ?? null,
    p_longitude: input.longitude ?? null,
    p_exclude_survey_id: input.exclude_survey_id ?? null,
  });
  if (error) throw dbError(error);

  const rows = (data ?? []) as DuplicateRow[];
  const summaries = await loadSurveySummaries(admin, rows.map((r) => r.matched_survey_id), viewer);
  return buildDuplicateResult(
    rows.map((r) => ({
      match_type: r.match_type,
      distance_meters: toNumber(r.distance_meters),
      within_radius: r.within_radius,
      survey: summaries.get(r.matched_survey_id) ?? null,
    })),
  );
}

export function buildDuplicateResult<
  T extends { match_type: string; distance_meters: number | null; within_radius: boolean },
>(matches: T[]) {
  const distances = matches.map((m) => m.distance_meters).filter((d): d is number => d !== null);
  return {
    duplicate_found: matches.some((m) => m.match_type !== "proximity"),
    possible_duplicate: matches.some((m) => m.within_radius),
    nearest_distance_meters: distances.length ? Math.min(...distances) : null,
    matches,
  };
}

export async function getDuplicateRadius(admin: SupabaseClient): Promise<number> {
  const { data } = await admin.from("app_settings").select("value").eq("key", "duplicate_radius_meters").maybeSingle();
  const n = toNumber(data?.value);
  return n ?? 100;
}

/**
 * Full survey detail with duplicate matches. `client` decides visibility:
 * pass the user client to enforce RLS, or the admin client after the caller
 * has already been authorised (e.g. right after creating the survey).
 */
export async function loadSurveyDetail(
  client: SupabaseClient,
  admin: SupabaseClient,
  viewer: Profile,
  filter: { id?: string; survey_id?: string },
) {
  let query = client.from("survey_details").select(DETAIL_COLUMNS);
  query = filter.id ? query.eq("id", filter.id) : query.eq("survey_id", filter.survey_id!);
  const { data: survey, error } = await query.maybeSingle<Row>();
  if (error) throw dbError(error);
  if (!survey) throw new HttpError(404, "not_found", "Survey not found");

  const { data: matchRows, error: matchError } = await client
    .from("duplicate_matches")
    .select("id, matched_survey_id, match_type, distance_meters, status, reviewed_by, reviewed_at, notes, created_at")
    .eq("survey_id", survey.id)
    .order("created_at");
  if (matchError) throw dbError(matchError);

  const matches = (matchRows ?? []) as Row[];
  const [summaries, photos, reviewers] = await Promise.all([
    loadSurveySummaries(admin, matches.map((m) => m.matched_survey_id), viewer),
    signPhotoUrls(admin, [survey.photo_path]),
    loadProfileNames(admin, matches.map((m) => m.reviewed_by)),
  ]);

  const duplicate = buildDuplicateResult(
    matches.map((m) => {
      const distance = toNumber(m.distance_meters);
      return {
        duplicate_match_id: m.id,
        match_type: m.match_type,
        distance_meters: distance,
        // Stored match types already encode whether it was inside the radius.
        within_radius: m.match_type !== "exact",
        review_status: m.status,
        reviewed_by: m.reviewed_by ? { id: m.reviewed_by, full_name: reviewers.get(m.reviewed_by) ?? null } : null,
        reviewed_at: m.reviewed_at,
        review_notes: m.notes,
        survey: summaries.get(m.matched_survey_id) ?? null,
      };
    }),
  );

  const detail = formatSurvey(survey, photos);
  return { ...detail, duplicate_check: duplicate };
}

async function loadProfileNames(admin: SupabaseClient, ids: (string | null)[]) {
  const unique = [...new Set(ids.filter((id): id is string => !!id))];
  const names = new Map<string, string>();
  if (unique.length === 0) return names;
  const { data } = await admin.from("profiles").select("id, full_name").in("id", unique);
  for (const p of data ?? []) names.set(p.id, p.full_name);
  return names;
}

/** Verify a claimed photo path belongs to this user/survey and exists. */
export async function assertPhotoPath(
  admin: SupabaseClient,
  userId: string,
  surveyUuid: string,
  photoPath: string,
) {
  const prefix = `${userId}/${surveyUuid}/`;
  const fileName = photoPath.slice(prefix.length);
  if (!photoPath.startsWith(prefix) || !/^[A-Za-z0-9._-]{1,100}$/.test(fileName)) {
    throw new HttpError(422, "validation_error", "Invalid photo_path", {
      fields: { photo_path: `Must be ${prefix}<file name>` },
    });
  }
  const { data, error } = await admin.storage
    .from(config.photoBucket)
    .list(`${userId}/${surveyUuid}`, { search: fileName, limit: 10 });
  if (error) {
    console.error("storage list failed", error);
    throw new HttpError(502, "storage_error", "Could not verify the uploaded photo");
  }
  if (!(data ?? []).some((f) => f.name === fileName)) {
    throw new HttpError(422, "validation_error", "Photo has not been uploaded", {
      fields: { photo_path: "Upload the photo to storage before submitting the survey" },
    });
  }
}
