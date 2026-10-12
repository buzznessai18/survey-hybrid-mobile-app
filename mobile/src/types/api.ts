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

/** admin-users "get": a user with sign-in details and what they have entered. */
export interface ManagedUserDetail extends ManagedUser {
  /** Sign-in email (Supabase Auth), if any. */
  email: string | null;
  /** Sign-in phone in E.164 (+919876543210), if any. */
  phone: string | null;
  last_sign_in_at: string | null;
  records: { forms: number; surveys: number; service_records: number };
  /** False when they entered service records, surveys or 1/14 forms (deactivate instead). */
  can_delete: boolean;
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
  report: SurveyReport & Partial<ReportExtras>;
}

/** Error envelope: { error: { code, message, details? } } */
export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    details?: { fields?: Record<string, string> } & Record<string, unknown>;
  };
}

/* ------------------------------------------------------------------ */
/* Farmers, 1/14 forms, schemes, applications (migrations 015-016)    */
/* ------------------------------------------------------------------ */

export const GOA_TALUKAS = [
  "Bardez", "Bicholim", "Canacona", "Dharbandora", "Mormugao", "Pernem",
  "Ponda", "Quepem", "Salcete", "Sanguem", "Sattari", "Tiswadi",
] as const;
export type Taluka = (typeof GOA_TALUKAS)[number];

export const LAND_CLASSES = ["dry", "garden", "paddy", "khazan", "morad", "forest", "other"] as const;
export type LandClass = (typeof LAND_CLASSES)[number];
export const IRRIGATION_SOURCES = ["rainfed", "well", "borewell", "canal", "river", "tank", "other"] as const;
export type IrrigationSource = (typeof IRRIGATION_SOURCES)[number];
export const FARMER_CATEGORIES = ["general", "obc", "sc", "st"] as const;
export type FarmerCategory = (typeof FARMER_CATEGORIES)[number];
export const APPLICATION_STATUSES = ["applied", "under_review", "approved", "rejected", "disbursed"] as const;
export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];
/** Benefit / service type of a scheme (tractor, cylinder, subsidy, ...). */
export const SCHEME_CATEGORIES = ["subsidy", "tractor", "equipment", "cylinder", "government_scheme", "service", "other"] as const;
export type SchemeCategory = (typeof SCHEME_CATEGORIES)[number];
export type FormStatus = "pending" | "verified" | "rejected";
export type Gender = "male" | "female" | "other";

export interface Farmer {
  id: string;
  name: string;
  mobile: string;
  father_name: string | null;
  gender: Gender | null;
  category: FarmerCategory | null;
  village: string | null;
  taluka: Taluka | null;
  address: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface FarmerSearchItem extends Farmer {
  form_count: number;
  survey_count: number;
  land_sq_m: number;
  survey_numbers: string[];
  form_ids: string[];
  benefits_received: number;
  benefits_pending: number;
}

export interface LandForm {
  id: string;
  form_id: string;
  farmer_id: string;
  farmer_name: string | null;
  farmer_mobile: string | null;
  village: string;
  taluka: Taluka;
  survey_number: string;
  sub_division: string | null;
  occupant_names: string | null;
  tenant_name: string | null;
  area_sq_m: number | null;
  land_class: LandClass | null;
  assessment_rs: number | null;
  kharif_crop_id: string | null;
  kharif_crop_name: string | null;
  rabi_crop_id: string | null;
  rabi_crop_name: string | null;
  irrigation_source: IrrigationSource;
  remarks: string | null;
  status: FormStatus;
  created_by: string;
  created_by_name: string | null;
  created_at: string;
  updated_at: string;
}

/** Survey summary rows attached to farmers and forms. */
export interface LinkedSurvey {
  id: string;
  survey_id: string;
  survey_number: string;
  sub_division: string | null;
  crop_name: string | null;
  area: number;
  area_unit: AreaUnit;
  visit_date: string;
  collected_by_name: string | null;
  latitude: number;
  longitude: number;
  photo_url: string | null;
  duplicate_status: DuplicateStatus;
  submission_status: SubmissionStatus;
  land_record_id: string | null;
  form_id: string | null;
  created_at: string;
}

export interface EligibilityCheck {
  rule: string;
  label: string;
  passed: boolean;
  detail: string | null;
}

export interface EligibilityResult {
  scheme_id: string;
  scheme_code: string;
  scheme_name: string;
  scheme_category?: SchemeCategory;
  eligible: boolean;
  land_sq_m: number;
  checks: EligibilityCheck[];
}

export interface SchemeRules {
  min_land_sq_m?: number;
  max_land_sq_m?: number;
  eligible_crop_ids?: string[];
  eligible_talukas?: Taluka[];
  eligible_categories?: FarmerCategory[];
  cooldown_years?: number;
  max_applications_per_farmer?: number;
  require_verified_land?: boolean;
}

export interface Scheme {
  id: string;
  code: string;
  name: string;
  category: SchemeCategory;
  department: string | null;
  description: string | null;
  benefit: string | null;
  subsidy_percent: number | null;
  max_amount_rs: number | null;
  rules: SchemeRules;
  status: "active" | "inactive";
  valid_until: string | null;
  application_counts?: Partial<Record<ApplicationStatus, number>>;
}

export interface Application {
  id: string;
  application_no: string;
  farmer_id: string;
  farmer_name: string | null;
  farmer_village: string | null;
  farmer_taluka: string | null;
  scheme_id: string;
  scheme_code: string | null;
  scheme_name: string | null;
  scheme_category: SchemeCategory | null;
  land_record_id: string | null;
  status: ApplicationStatus;
  amount_rs: number | null;
  applied_on: string;
  decided_at: string | null;
  remarks: string | null;
  updated_by_name: string | null;
  created_at: string;
  updated_at: string;
}

export interface FarmerProfile {
  farmer: Farmer & { land_sq_m: number };
  forms: LandForm[];
  surveys: LinkedSurvey[];
  /** Benefits / services history and scheme eligibility. */
  applications: Application[];
  eligibility: EligibilityResult[];
}

/** land-records check_duplicate */
export interface FormDuplicateCheck {
  duplicate_found: boolean;
  forms: LandForm[];
  same_village_forms: number;
  survey_check: DuplicateCheckResponse;
}

export interface AuditEntry {
  id: number;
  user_id: string | null;
  user_name: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  metadata: { ref?: string; changes?: Record<string, { from: unknown; to: unknown }> } & Record<string, unknown>;
  created_at: string;
}

export type ExportDataset = "records" | "surveys" | "forms" | "farmers" | "applications";

export interface ExportResult {
  title: string;
  columns: { key: string; label: string }[];
  rows: Record<string, unknown>[];
  total: number;
  truncated: boolean;
  generated_at: string;
  filters: {
    date_from: string | null; date_to: string | null; taluka: string | null;
    created_from?: string | null; created_to?: string | null; q?: string | null;
  };
}

/** Farmer equipment / service record (service-records function, migration 022). */
export type LandUnit = "acre" | "sq_m";

export interface ServiceRecord {
  id: string;
  /** Receipt number, e.g. RC-000123 (set by the server). */
  record_no: string;
  farmer_name: string;
  gender: Gender | null;
  address: string | null;
  survey_number: string;
  sub_division: string | null;
  land_size: number;
  land_unit: LandUnit;
  service_details: string | null;
  created_by: string;
  created_by_name: string | null;
  /** Server timestamp (ISO, UTC); shown in the device's local timezone. */
  created_at: string;
  updated_at: string;
}

export interface ServiceRecordInput {
  id: string;
  farmer_name: string;
  gender: Gender | null;
  address: string | null;
  survey_number: string;
  sub_division: string | null;
  land_size: number;
  land_unit: LandUnit;
  service_details: string | null;
}

/** One labelled count in an analytics breakdown (taluka, crop, scheme, user). */
export interface AnalyticsCount {
  label: string;
  count: number;
}

/** get-analytics (018, admins): one date range vs a comparison period. */
export interface AdminAnalytics {
  period: { from: string; to: string; prev_from: string; prev_to: string };
  totals: {
    forms: number;
    forms_verified: number;
    land_sq_m: number;
    surveys: number;
    duplicates: number;
    farmers: number;
    applications: number;
    approved: number;
    disbursed_rs: number;
  };
  previous: { forms: number; surveys: number; farmers: number; applications: number };
  /** One entry per day of the range, zeros included. */
  series: { date: string; forms: number; surveys: number }[];
  forms_by_taluka: AnalyticsCount[];
  forms_by_status: Partial<Record<"pending" | "verified" | "rejected", number>>;
  surveys_by_crop: AnalyticsCount[];
  applications_by_status: Partial<Record<ApplicationStatus, number>>;
  applications_by_scheme: AnalyticsCount[];
  /** Users who entered the most 1/14 forms. */
  top_users: AnalyticsCount[];
}

/** get-reports extra tiles (015). Null when not in scope. */
export interface ReportExtras {
  forms_total: number;
  forms_pending: number;
  farmers_total: number | null;
  applications_total: number | null;
  applications_pending: number | null;
  reviews_pending: number | null;
}
