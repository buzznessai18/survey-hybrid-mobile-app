import type { AreaUnit, DuplicateCheckResponse, DuplicateReason, DuplicateStatus } from "./api";

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
  details: SurveyDetailsValues;
  cropName: string | null;
  location: CapturedLocation;
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
  } | null;
}
