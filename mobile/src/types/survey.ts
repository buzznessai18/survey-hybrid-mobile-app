import type {
  AreaUnit, DuplicateCheckResponse, DuplicateReason, DuplicateStatus, FarmerCategory, FormDuplicateCheck, Gender,
  IrrigationSource, LandClass, Taluka,
} from "./api";

/** Wizard step 1: an existing farmer (id) or a new one. */
export interface FarmerDraft {
  id: string | null;
  name: string;
  mobile: string;
  fatherName: string;
  gender: Gender | "";
  category: FarmerCategory | "";
  village: string;
  taluka: Taluka | "";
}

/** Wizard step 2: the 1/14 (Form I & XIV) land details. */
export interface LandDraft {
  village: string;
  taluka: Taluka;
  surveyNumber: string;
  subDivision: string;
  remarks: string;
  // No longer asked (021); kept so drafts queued by older app versions still sync.
  occupantNames?: string;
  tenantName?: string;
  areaSqM?: string;
  landClass?: LandClass;
  assessmentRs?: string;
  irrigation?: IrrigationSource;
  kharifCropId?: string;
  rabiCropId?: string;
}

/** Step 1 form values (what the surveyor types). */
export interface SurveyDetailsValues {
  farmerName: string;
  farmerMobile: string;
  cropId: string;
  area: string;
  areaUnit: AreaUnit;
  surveyNumber: string;
  subDivision: string;
  visitDate: string; // YYYY-MM-DD
}

export interface CapturedLocation {
  latitude: number;
  longitude: number;
  accuracy: number;
  capturedAt: string;
}

export interface CapturedPhoto {
  /** Persistent file in the app's document directory. */
  uri: string;
  width: number;
  height: number;
}

/** In-progress survey on this device. */
export interface SurveyDraft {
  /** Client-generated UUID = backend survey id + idempotency key. */
  id: string;
  startedAt: string;
  details: SurveyDetailsValues | null;
  cropName: string | null;
  location: CapturedLocation | null;
  photo: CapturedPhoto | null;
  notes: string;
  duplicateReason: DuplicateReason | null;
  duplicateReasonNotes: string;
  /** Last backend duplicate check for this draft. */
  duplicateCheck: DuplicateCheckResponse | null;
  duplicateCheckKey: string | null;
  /** 1/14 form (client-generated id = idempotency key for the form). */
  formId?: string;
  farmer?: FarmerDraft | null;
  land?: LandDraft | null;
  formDuplicateCheck?: FormDuplicateCheck | null;
}

export type SyncStatus = "pending_sync" | "syncing" | "synced" | "sync_failed";

export type SyncErrorKind = "network" | "server" | "validation" | "conflict" | "auth" | "forbidden" | "unknown";

export interface SyncError {
  kind: SyncErrorKind;
  message: string;
  fields?: Record<string, string>;
  at: string;
}

/** A submitted survey waiting for (or finished with) server sync. */
export interface QueueItem {
  id: string;
  userId: string;
  status: SyncStatus;
  createdAt: string;
  updatedAt: string;
  retryCount: number;
  /** Epoch ms; automatic sync waits until then after server errors. */
  nextAttemptAt: number;
  /** Null for a 1/14 form saved without a field survey (location / crop skipped). */
  details: SurveyDetailsValues | null;
  cropName: string | null;
  location: CapturedLocation | null;
  photoLocalUri: string | null;
  /** Set once the photo upload succeeded so retries skip it. */
  photoPath: string | null;
  notes: string;
  duplicateReason: DuplicateReason | null;
  duplicateReasonNotes: string;
  lastError: SyncError | null;
  result: {
    surveyCode: string;
    duplicateStatus: DuplicateStatus;
    idempotentReplay: boolean;
    syncedAt: string;
    /** Set for 1/14 form submissions. */
    formCode?: string;
    formDbId?: string;
  } | null;
  /** Present for 1/14 form submissions (new flow); absent for legacy survey-only items. */
  formId?: string;
  farmer?: FarmerDraft;
  land?: LandDraft;
}
