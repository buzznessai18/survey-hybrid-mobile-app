import type { DuplicateCheckResponse, SurveySummary } from "@/types/api";
import type { QueueItem, SurveyDraft } from "@/types/survey";

export const SURVEY_ID = "5b0f8d2e-7a51-4c1b-9a2f-3f6d8e1c2b4a";
export const USER_ID = "11111111-2222-4333-8444-555555555555";

export function makeDraft(overrides: Partial<SurveyDraft> = {}): SurveyDraft {
  return {
    id: SURVEY_ID,
    startedAt: "2026-09-24T04:00:00.000Z",
    details: {
      farmerName: "  Ramesh Kumar ",
      farmerMobile: "+91 98765 43210",
      cropId: "c7e5a1b2-0000-4000-8000-000000000001",
      area: "2.5",
      areaUnit: "acre",
      surveyNumber: " 125 ",
      subDivision: "2",
      visitDate: "2026-09-24",
    },
    cropName: "Paddy",
    location: { latitude: 15.495872, longitude: 73.827361, accuracy: 8.456, capturedAt: "2026-09-24T04:10:00.000Z" },
    photo: { uri: "file:///docs/survey-photos/p.jpg", width: 1600, height: 1200 },
    notes: "",
    duplicateReason: null,
    duplicateReasonNotes: "",
    duplicateCheck: null,
    duplicateCheckKey: null,
    ...overrides,
  };
}

export function makeQueueItem(overrides: Partial<QueueItem> = {}): QueueItem {
  const d = makeDraft();
  return {
    id: SURVEY_ID,
    userId: USER_ID,
    status: "pending_sync",
    createdAt: "2026-09-24T04:12:00.000Z",
    updatedAt: "2026-09-24T04:12:00.000Z",
    retryCount: 0,
    nextAttemptAt: 0,
    details: d.details!,
    cropName: "Paddy",
    location: d.location!,
    photoLocalUri: d.photo!.uri,
    photoPath: null,
    notes: "",
    duplicateReason: null,
    duplicateReasonNotes: "",
    lastError: null,
    result: null,
    ...overrides,
  };
}

export function summary(overrides: Partial<SurveySummary> = {}): SurveySummary {
  return {
    id: "9f1c0000-0000-4000-8000-000000000009",
    survey_id: "SV-001201",
    survey_number: "125",
    sub_division: "2",
    farmer_name: "Ramesh Kumar",
    farmer_mobile: "******3210",
    crop_name: "Paddy",
    area: 2,
    area_unit: "acre",
    visit_date: "2026-09-20",
    collected_by_name: "Amit Sharma",
    latitude: 15.495872,
    longitude: 73.827361,
    photo_url: null,
    duplicate_status: "unique",
    submission_status: "pending",
    created_at: "2026-09-20T05:00:00Z",
    is_own: false,
    ...overrides,
  };
}

export function checkResponse(overrides: Partial<DuplicateCheckResponse> = {}): DuplicateCheckResponse {
  return {
    duplicate_found: false,
    possible_duplicate: false,
    nearest_distance_meters: null,
    radius_meters: 100,
    matches: [],
    farmer_surveys: null,
    ...overrides,
  };
}
