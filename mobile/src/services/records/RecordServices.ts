import { callFunction } from "@/services/api/functions";
import type {
  Application, ApplicationStatus, AuditEntry, EligibilityResult, ExportDataset, ExportResult, Farmer,
  FarmerProfile, FarmerSearchItem, FormDuplicateCheck, FormStatus, LandForm, LinkedSurvey, Paginated,
  ReviewStatus, Scheme, SchemeRules, Taluka,
} from "@/types/api";

/** Typed wrappers over the farmers / land-records / schemes / applications / audit / export functions. */

export const FarmerService = {
  async search(req: { q?: string; taluka?: Taluka; village?: string; page?: number; page_size?: number }) {
    const { data } = await callFunction<Paginated<FarmerSearchItem>>("farmers", { action: "search", page_size: 20, ...req });
    return data;
  },
  async get(id: string) {
    const { data } = await callFunction<FarmerProfile>("farmers", { action: "get", id });
    return data;
  },
  async upsert(farmer: Partial<Farmer> & { name: string; mobile: string }) {
    const { data } = await callFunction<{ farmer: Farmer }>("farmers", { action: "upsert", ...farmer });
    return data.farmer;
  },
};

export interface FormSubmitRequest {
  farmer: { id: string } | Partial<Farmer> & { name: string; mobile: string };
  form: Omit<LandForm, "form_id" | "farmer_id" | "farmer_name" | "farmer_mobile" | "kharif_crop_name" | "rabi_crop_name" |
    "status" | "created_by" | "created_by_name" | "created_at" | "updated_at">;
  survey?: {
    id: string; crop_id: string; area: number; area_unit: string; visit_date: string; latitude: number; longitude: number;
    gps_accuracy: number; photo_path: string | null; duplicate_reason: string | null; duplicate_reason_notes: string | null;
    notes: string | null;
  };
}

export interface FormSubmitResponse {
  form: LandForm;
  surveys: LinkedSurvey[];
  created: boolean;
  idempotent_replay: boolean;
}

export const FormService = {
  async checkDuplicate(req: {
    survey_number: string; sub_division?: string | null; village?: string;
    latitude?: number; longitude?: number; exclude_id?: string;
  }) {
    const { data } = await callFunction<FormDuplicateCheck>("land-records", { action: "check_duplicate", ...req }, { timeoutMs: 12_000 });
    return data;
  },
  /** Idempotent on form.id (and survey.id). */
  async submit(req: FormSubmitRequest) {
    const { data } = await callFunction<FormSubmitResponse>("land-records", { action: "submit", ...req }, { timeoutMs: 30_000 });
    return data;
  },
  async get(id: string) {
    const body = /^LR-\d+$/i.test(id) ? { form_id: id } : { id };
    const { data } = await callFunction<{ form: LandForm; farmer: Farmer; surveys: LinkedSurvey[] }>("land-records", { action: "get", ...body });
    return data;
  },
  async list(req: { mine?: boolean; q?: string; status?: FormStatus; taluka?: Taluka; page?: number; page_size?: number }) {
    const { data } = await callFunction<Paginated<LandForm>>("land-records", { action: "list", page_size: 20, ...req });
    return data;
  },
  async update(id: string, changes: Partial<LandForm>) {
    const { data } = await callFunction<{ form: LandForm }>("land-records", { action: "update", id, ...changes });
    return data.form;
  },
  async setStatus(id: string, status: FormStatus, remarks?: string) {
    const { data } = await callFunction<{ form: LandForm }>("land-records", { action: "set_status", id, status, remarks });
    return data.form;
  },
};

export const SchemeService = {
  async list(status?: "active" | "inactive") {
    const { data } = await callFunction<{ data: Scheme[] }>("schemes", { action: "list", status });
    return data.data;
  },
  async upsert(scheme: Partial<Scheme> & { code: string; name: string; rules: SchemeRules }) {
    const { data } = await callFunction<{ scheme: Scheme }>("schemes", { action: "upsert", ...scheme });
    return data.scheme;
  },
  async eligibility(farmerId: string) {
    const { data } = await callFunction<{ results: EligibilityResult[] }>("schemes", { action: "eligibility", farmer_id: farmerId });
    return data.results;
  },
};

export const ApplicationService = {
  async list(req: { farmer_id?: string; scheme_id?: string; status?: ApplicationStatus[] } = {}) {
    const { data } = await callFunction<{ data: Application[] }>("applications", { action: "list", ...req });
    return data.data;
  },
  async upsert(req: {
    id?: string; farmer_id: string; scheme_id: string; land_record_id?: string | null; status: ApplicationStatus;
    amount_rs?: number | null; applied_on?: string; remarks?: string | null;
  }) {
    const { data } = await callFunction<{ application: Application; eligibility: EligibilityResult | null }>("applications", {
      action: "upsert", ...req,
    });
    return data;
  },
};

export const AuditService = {
  async list(req: { entity_type?: string; entity_id?: string; page?: number; page_size?: number } = {}) {
    const { data } = await callFunction<Paginated<AuditEntry>>("audit-logs", { action: "list", page_size: 30, ...req });
    return data;
  },
};

export const ExportService = {
  async fetch(req: {
    dataset: ExportDataset; date_from?: string; date_to?: string; taluka?: Taluka;
    /** "records" dataset: ISO timestamps (see localDayRange) and a search term. */
    created_from?: string; created_to?: string; q?: string;
  }) {
    const { data } = await callFunction<ExportResult>("export-data", req, { timeoutMs: 60_000 });
    return data;
  },
};

export const ReviewService = {
  async review(duplicateMatchId: string, status: ReviewStatus, notes?: string) {
    const { data } = await callFunction<{ duplicate_match: { id: string; status: ReviewStatus }; survey: { id: string; duplicate_status: string } }>(
      "review-duplicate", { duplicate_match_id: duplicateMatchId, status, notes },
    );
    return data;
  },
};
