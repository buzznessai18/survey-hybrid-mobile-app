import type { CreateSurveyRequest, UpdateSurveyRequest } from "@/types/api";
import type { QueueItem, SurveyDetailsValues, SurveyDraft } from "@/types/survey";
import { normalizeMobile } from "./mobile";

const nullIfBlank = (v: string | null | undefined) => {
  const t = (v ?? "").trim();
  return t.length ? t : null;
};

/** Backend photo layout (010_storage.sql): {user_id}/{survey uuid}/{file}. */
export function photoStoragePath(userId: string, surveyId: string, fileName: string): string {
  return `${userId}/${surveyId}/${fileName}`;
}

/** Exact create-survey request body (supabase/functions/create-survey/index.ts). */
export function toCreatePayload(item: QueueItem, photoPath: string | null): CreateSurveyRequest {
  const d = item.details;
  return {
    id: item.id,
    farmer: { name: d.farmerName.trim(), mobile: normalizeMobile(d.farmerMobile) },
    crop_id: d.cropId,
    area: Number(d.area),
    area_unit: d.areaUnit,
    survey_number: d.surveyNumber.trim(),
    sub_division: nullIfBlank(d.subDivision),
    visit_date: d.visitDate,
    latitude: item.location.latitude,
    longitude: item.location.longitude,
    gps_accuracy: Math.round(item.location.accuracy * 100) / 100,
    photo_path: photoPath,
    duplicate_reason: item.duplicateReason,
    duplicate_reason_notes: item.duplicateReason ? nullIfBlank(item.duplicateReasonNotes) : null,
    notes: nullIfBlank(item.notes),
  };
}

export class IncompleteDraftError extends Error {}

/** Freeze a completed draft into a queue item ready for sync. */
export function queueItemFromDraft(draft: SurveyDraft, userId: string, now = new Date()): QueueItem {
  if (!draft.details) throw new IncompleteDraftError("Survey details are missing");
  if (!draft.location) throw new IncompleteDraftError("Field location is missing");
  const ts = now.toISOString();
  return {
    id: draft.id,
    userId,
    status: "pending_sync",
    createdAt: ts,
    updatedAt: ts,
    retryCount: 0,
    nextAttemptAt: 0,
    details: draft.details,
    cropName: draft.cropName,
    location: draft.location,
    photoLocalUri: draft.photo?.uri ?? null,
    photoPath: null,
    notes: draft.notes,
    duplicateReason: draft.duplicateReason,
    duplicateReasonNotes: draft.duplicateReasonNotes,
    lastError: null,
    result: null,
  };
}

/** Only the changed fields, in update-survey's shape. */
export function toUpdatePayload(
  id: string,
  before: SurveyDetailsValues,
  after: SurveyDetailsValues,
  notes?: { before: string; after: string },
): UpdateSurveyRequest {
  const patch: UpdateSurveyRequest = { id };
  if (
    before.farmerName.trim() !== after.farmerName.trim() ||
    normalizeMobile(before.farmerMobile) !== normalizeMobile(after.farmerMobile)
  ) {
    patch.farmer = { name: after.farmerName.trim(), mobile: normalizeMobile(after.farmerMobile) };
  }
  if (before.cropId !== after.cropId) patch.crop_id = after.cropId;
  if (Number(before.area) !== Number(after.area)) patch.area = Number(after.area);
  if (before.areaUnit !== after.areaUnit) patch.area_unit = after.areaUnit;
  if (before.surveyNumber.trim() !== after.surveyNumber.trim()) patch.survey_number = after.surveyNumber.trim();
  if (before.subDivision.trim() !== after.subDivision.trim()) patch.sub_division = nullIfBlank(after.subDivision);
  if (before.visitDate !== after.visitDate) patch.visit_date = after.visitDate;
  if (notes && notes.before.trim() !== notes.after.trim()) patch.notes = nullIfBlank(notes.after);
  return patch;
}
