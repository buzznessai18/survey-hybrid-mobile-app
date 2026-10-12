import type { CreateSurveyRequest, UpdateSurveyRequest } from "@/types/api";
import type { FormSubmitRequest } from "@/services/records/RecordServices";
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

/**
 * A field survey needs both GPS location and crop & area; the photo is optional.
 * 1/14 forms may skip them (steps 3–5) and are then saved without a survey.
 */
export const hasFieldSurvey = (x: { details: SurveyDetailsValues | null; location: unknown }) => !!x.details && !!x.location;

/** Exact create-survey request body (supabase/functions/create-survey/index.ts). */
export function toCreatePayload(item: QueueItem, photoPath: string | null): CreateSurveyRequest {
  const d = item.details;
  if (!d || !item.location) throw new IncompleteDraftError("Field location or crop details are missing");
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

/** Survey no. and farmer of a queued item: from its field survey, or from the 1/14 form when it has none. */
export function queueSummary(q: QueueItem) {
  const d = q.details;
  return {
    surveyNumber: d?.surveyNumber ?? q.land?.surveyNumber ?? "",
    subDivision: d?.subDivision ?? q.land?.subDivision ?? "",
    farmerName: d?.farmerName ?? q.farmer?.name ?? "",
    farmerMobile: d?.farmerMobile ?? q.farmer?.mobile ?? "",
  };
}

/** Freeze a completed draft into a queue item ready for sync. */
export function queueItemFromDraft(draft: SurveyDraft, userId: string, now = new Date()): QueueItem {
  const isForm = !!(draft.formId && draft.farmer && draft.land);
  const withSurvey = hasFieldSurvey(draft);
  if (!isForm && !withSurvey) {
    // Legacy survey-only drafts always need the survey.
    if (!draft.details) throw new IncompleteDraftError("Survey details are missing");
    throw new IncompleteDraftError("Field location is missing");
  }
  const ts = now.toISOString();
  return {
    id: draft.id,
    userId,
    status: "pending_sync",
    createdAt: ts,
    updatedAt: ts,
    retryCount: 0,
    nextAttemptAt: 0,
    // Without a field survey, location / photo / crop are not saved.
    details: withSurvey ? draft.details : null,
    cropName: withSurvey ? draft.cropName : null,
    location: withSurvey ? draft.location : null,
    photoLocalUri: withSurvey ? draft.photo?.uri ?? null : null,
    photoPath: null,
    notes: draft.notes,
    duplicateReason: draft.duplicateReason,
    duplicateReasonNotes: draft.duplicateReasonNotes,
    lastError: null,
    result: null,
    ...(draft.formId && draft.farmer && draft.land ? { formId: draft.formId, farmer: draft.farmer, land: draft.land } : {}),
  };
}

const num = (v: string) => (v.trim() === "" ? null : Number(v));

/** Exact land-records "submit" body: 1/14 form + farmer + the field survey (land-records/index.ts). */
export function toFormSubmitPayload(item: QueueItem, photoPath: string | null): FormSubmitRequest {
  if (!item.formId || !item.farmer || !item.land) throw new IncompleteDraftError("Land details are missing");
  const f = item.farmer;
  const l = item.land;
  const survey = hasFieldSurvey(item) ? toCreatePayload(item, photoPath) : null;
  return {
    farmer: f.id
      ? { id: f.id }
      : {
        name: f.name.trim(),
        mobile: normalizeMobile(f.mobile),
        father_name: nullIfBlank(f.fatherName),
        gender: f.gender || null,
        category: f.category || null,
        village: nullIfBlank(f.village),
        taluka: f.taluka || null,
      },
    form: {
      id: item.formId,
      village: l.village.trim(),
      taluka: l.taluka,
      survey_number: l.surveyNumber.trim(),
      sub_division: nullIfBlank(l.subDivision),
      remarks: nullIfBlank(l.remarks),
      // Only drafts from older app versions have these; the server fills area from the survey.
      occupant_names: nullIfBlank(l.occupantNames ?? ""),
      tenant_name: nullIfBlank(l.tenantName ?? ""),
      area_sq_m: l.areaSqM ? Number(l.areaSqM) : null,
      land_class: l.landClass ?? null,
      assessment_rs: num(l.assessmentRs ?? ""),
      kharif_crop_id: l.kharifCropId || null,
      rabi_crop_id: l.rabiCropId || null,
      irrigation_source: l.irrigation ?? "rainfed",
    },
    survey: survey ? {
      id: survey.id,
      crop_id: survey.crop_id,
      area: survey.area,
      area_unit: survey.area_unit,
      visit_date: survey.visit_date,
      latitude: survey.latitude,
      longitude: survey.longitude,
      gps_accuracy: survey.gps_accuracy,
      photo_path: survey.photo_path,
      duplicate_reason: survey.duplicate_reason,
      duplicate_reason_notes: survey.duplicate_reason_notes,
      notes: survey.notes,
    } : undefined,
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
