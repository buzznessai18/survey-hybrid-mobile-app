/**
 * Types mirroring the Edge Function contracts in supabase/functions/*.
 * Source of truth: supabase/functions/_shared/{validation,surveys}.ts and the
 * individual function handlers. Keep in sync with the backend.
 */

export type Role = "field_surveyor" | "supervisor" | "admin" | "user";

/** The two ways into the app. Admins create surveys; users browse all of them. */
export type Portal = "admin" | "user";
export type ProfileStatus = "pending" | "active" | "inactive";

export interface Profile {
  id: string;
  full_name: string;
  mobile: string | null;
  role: Role;
  status: ProfileStatus;
  supervisor_id: string | null;
  /** Anonymous (no-login) visitor — read-only. */
  is_guest?: boolean;
}

export interface Crop {
  id: string;
  name: string;
}

/** supabase/functions/_shared/validation.ts AREA_UNITS */
export const AREA_UNITS = ["acre", "hectare", "guntha", "cent", "bigha", "sq_m"] as const;
export type AreaUnit = (typeof AREA_UNITS)[number];

/** DUPLICATE_REASONS */
export const DUPLICATE_REASONS = [
  "different_farmer",
  "different_portion_of_land",
  "previous_data_incorrect",
  "previous_survey_unavailable",
  "other",
] as const;
export type DuplicateReason = (typeof DUPLICATE_REASONS)[number];

/** DUPLICATE_STATUSES */
export const DUPLICATE_STATUSES = [
  "unique",
  "duplicate",
  "possible_duplicate",
  "needs_verification",
  "confirmed_duplicate",
  "not_duplicate",
] as const;
export type DuplicateStatus = (typeof DUPLICATE_STATUSES)[number];

/** Duplicate statuses that mean "flagged" for list filters and badges. */
export const FLAGGED_DUPLICATE_STATUSES: DuplicateStatus[] = [
  "duplicate",
  "possible_duplicate",
  "needs_verification",
  "confirmed_duplicate",
];

export type SubmissionStatus = "pending" | "approved" | "rejected";
export type MatchType = "exact" | "proximity" | "exact_and_proximity";
export type ReviewStatus = "pending" | "confirmed_duplicate" | "not_duplicate" | "needs_verification";

/** loadSurveySummaries(): limited record shown in duplicate warnings. */
export interface SurveySummary {
  id: string;
  survey_id: string;
  survey_number: string;
  sub_division: string | null;
  farmer_name: string | null;
  /** Masked (******3210) when it belongs to another surveyor. Display as-is. */
  farmer_mobile: string | null;
  crop_name: string | null;
  area: number | null;
  area_unit: AreaUnit;
  visit_date: string;
  collected_by_name: string | null;
  latitude: number | null;
  longitude: number | null;
  photo_url: string | null;
  duplicate_status: DuplicateStatus;
  submission_status: SubmissionStatus;
  created_at: string;
  is_own: boolean;
}

/** check-survey-duplicate match */
export interface DuplicateCheckMatch {
  match_type: MatchType;
  distance_meters: number | null;
  within_radius: boolean;
  survey: SurveySummary | null;
}

/** check-survey-duplicate response */
export interface DuplicateCheckResponse {
  duplicate_found: boolean;
  possible_duplicate: boolean;
  nearest_distance_meters: number | null;
  radius_meters: number;
  matches: DuplicateCheckMatch[];
  farmer_surveys: SurveySummary[] | null;
}

export interface DuplicateCheckRequest {
  survey_number: string;
  sub_division?: string | null;
  latitude?: number;
  longitude?: number;
  farmer_mobile?: string;
  exclude_survey_id?: string;
}

/** get-survey / create-survey stored match */
export interface StoredDuplicateMatch {
  duplicate_match_id: string;
  match_type: MatchType;
  distance_meters: number | null;
  within_radius: boolean;
  review_status: ReviewStatus;
  reviewed_by: { id: string; full_name: string | null } | null;
  reviewed_at: string | null;
  review_notes: string | null;
  survey: SurveySummary | null;
}

/** DETAIL_COLUMNS + photo_url + duplicate_check */
export interface SurveyDetail {
  id: string;
  survey_id: string;
  survey_number: string;
  sub_division: string | null;
  farmer_id: string;
  farmer_name: string | null;
  farmer_mobile: string | null;
  crop_id: string;
  crop_name: string | null;
  area: number;
  area_unit: AreaUnit;
  visit_date: string;
  collected_by: string;
  collected_by_name: string | null;
  latitude: number;
  longitude: number;
  gps_accuracy: number;
  photo_path: string | null;
  photo_url: string | null;
  duplicate_status: DuplicateStatus;
  submission_status: SubmissionStatus;
  duplicate_reason: DuplicateReason | null;
  duplicate_reason_notes: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  duplicate_check: {
    duplicate_found: boolean;
    possible_duplicate: boolean;
    nearest_distance_meters: number | null;
    matches: StoredDuplicateMatch[];
  };
}

/** LIST_COLUMNS (+ photo_url when include_photo_urls) */
export interface SurveyListItem {
  id: string;
  survey_id: string;
  survey_number: string;
  sub_division: string | null;
  farmer_name: string | null;
  farmer_mobile: string | null;
  crop_id: string;
  crop_name: string | null;
  area: number;
  area_unit: AreaUnit;
  visit_date: string;
  collected_by: string;
  collected_by_name: string | null;
  photo_path: string | null;
  photo_url?: string | null;
  duplicate_status: DuplicateStatus;
  submission_status: SubmissionStatus;
  created_at: string;
  updated_at: string;
}

export interface Pagination {
  page: number;
  page_size: number;
  total: number;
  total_pages: number;
}

export interface Paginated<T> {
  data: T[];
  pagination: Pagination;
}

export interface GetMySurveysRequest {
  page?: number;
  page_size?: number;
  search?: string;
  status?: SubmissionStatus[];
  duplicate_status?: DuplicateStatus[];
  date_from?: string;
  date_to?: string;
  updated_since?: string;
  include_photo_urls?: boolean;
}

/** create-survey request body (see create-survey/index.ts schema) */
export interface CreateSurveyRequest {
  id: string;
  farmer: { id?: string; name: string; mobile: string };
  crop_id: string;
  area: number;
  area_unit: AreaUnit;
  survey_number: string;
  sub_division: string | null;
  visit_date: string;
  latitude: number;
  longitude: number;
  gps_accuracy: number;
  photo_path: string | null;
  duplicate_reason: DuplicateReason | null;
  duplicate_reason_notes: string | null;
  notes: string | null;
}

export interface CreateSurveyResponse {
  survey: SurveyDetail;
  created: boolean;
  idempotent_replay: boolean;
}

/** update-survey: id + any subset of the create fields */
export type UpdateSurveyRequest = { id: string } & Partial<Omit<CreateSurveyRequest, "id">>;

/** search-surveys request (supabase/functions/search-surveys/index.ts) */
export interface SearchSurveysRequest {
  page?: number;
  page_size?: number;
  search?: string;
  farmer_name?: string;
  farmer_mobile?: string;
  survey_number?: string;
  sub_division?: string;
  crop_id?: string;
  crop?: string;
  surveyor_id?: string;
  date_from?: string;
  date_to?: string;
  duplicate_status?: DuplicateStatus[];
  status?: SubmissionStatus[];
  sort?: "created_at" | "visit_date" | "survey_number";
  order?: "asc" | "desc";
  include_photo_urls?: boolean;
}

/** admin-users list rows */
export interface ManagedUser {
  id: string;
  full_name: string;
  mobile: string | null;
  role: Role;
  status: ProfileStatus;
  supervisor_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface MapPoint {
  id: string;
  survey_id: string;
  survey_number: string;
  sub_division: string | null;
  farmer_name: string | null;
  latitude: number;
  longitude: number;
  duplicate_status: DuplicateStatus;
  crop: string | null;
}

export interface MapDataRequest {
  min_lat: number;
  min_lng: number;
  max_lat: number;
  max_lng: number;
  duplicate_status?: DuplicateStatus[];
  crop_id?: string;
  date_from?: string;
  date_to?: string;
  limit?: number;
}

export interface MapDataResponse {
  points: MapPoint[];
  count: number;
  truncated: boolean;
}

/** get-reports report (public.get_survey_report) */
export interface SurveyReport {
  total_surveys: number;
  today_surveys: number;
  duplicate_count: number;
  pending_duplicate_reviews: number;
  by_submission_status: Partial<Record<SubmissionStatus, number>>;
  by_duplicate_status: Partial<Record<DuplicateStatus, number>>;
  by_crop: { crop_id: string; crop: string | null; count: number }[];
  by_surveyor: { surveyor_id: string; surveyor: string | null; count: number }[];
  by_date: { date: string; count: number }[];
}

export interface ReportResponse {
  scope: "own" | "team" | "all";
  report: SurveyReport;
}

/** Error envelope: { error: { code, message, details? } } */
export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    details?: { fields?: Record<string, string> } & Record<string, unknown>;
  };
}
