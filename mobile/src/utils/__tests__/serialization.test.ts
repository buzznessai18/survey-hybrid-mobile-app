import { photoStoragePath, queueItemFromDraft, toCreatePayload, toFormSubmitPayload, toUpdatePayload } from "../serialization";
import { makeDraft, makeQueueItem, SURVEY_ID, USER_ID } from "./fixtures";

describe("toCreatePayload", () => {
  it("produces the exact create-survey request body", () => {
    const payload = toCreatePayload(makeQueueItem(), `${USER_ID}/${SURVEY_ID}/field-photo.jpg`);
    expect(payload).toEqual({
      id: SURVEY_ID,
      farmer: { name: "Ramesh Kumar", mobile: "9876543210" },
      crop_id: "c7e5a1b2-0000-4000-8000-000000000001",
      area: 2.5,
      area_unit: "acre",
      survey_number: "125",
      sub_division: "2",
      visit_date: "2026-09-24",
      latitude: 15.495872,
      longitude: 73.827361,
      gps_accuracy: 8.46,
      photo_path: `${USER_ID}/${SURVEY_ID}/field-photo.jpg`,
      duplicate_reason: null,
      duplicate_reason_notes: null,
      notes: null,
    });
  });

  it("sends blank sub-division as null and keeps reason notes only with a reason", () => {
    const item = makeQueueItem({
      details: { ...makeQueueItem().details!, subDivision: "  " },
      duplicateReasonNotes: "stale text",
    });
    const p = toCreatePayload(item, null);
    expect(p.sub_division).toBeNull();
    expect(p.duplicate_reason_notes).toBeNull();

    const withReason = toCreatePayload({ ...item, duplicateReason: "other", duplicateReasonNotes: " Split plot " }, null);
    expect(withReason.duplicate_reason).toBe("other");
    expect(withReason.duplicate_reason_notes).toBe("Split plot");
  });

  it("uses the client-generated draft id as the idempotency key", () => {
    const item = queueItemFromDraft(makeDraft(), USER_ID, new Date("2026-09-24T05:00:00Z"));
    expect(item.id).toBe(SURVEY_ID);
    expect(item.status).toBe("pending_sync");
    expect(toCreatePayload(item, null).id).toBe(SURVEY_ID);
  });

  it("refuses incomplete drafts", () => {
    expect(() => queueItemFromDraft(makeDraft({ location: null }), USER_ID)).toThrow(/location/);
  });

  it("matches the storage layout required by the bucket policies", () => {
    expect(photoStoragePath(USER_ID, SURVEY_ID, "field-photo.jpg")).toBe(`${USER_ID}/${SURVEY_ID}/field-photo.jpg`);
  });
});

describe("toUpdatePayload", () => {
  const before = makeQueueItem().details!;
  it("contains only changed fields", () => {
    expect(toUpdatePayload("x", before, { ...before })).toEqual({ id: "x" });
    expect(toUpdatePayload("x", before, { ...before, area: "3", subDivision: "" })).toEqual({ id: "x", area: 3, sub_division: null });
  });
  it("sends the whole farmer object when name or mobile change", () => {
    expect(toUpdatePayload("x", before, { ...before, farmerMobile: "9123456780" }).farmer).toEqual({
      name: "Ramesh Kumar",
      mobile: "9123456780",
    });
  });
});

describe("toFormSubmitPayload (1/14 form + survey)", () => {
  const land = {
    village: " Aldona ", taluka: "Bardez" as const, surveyNumber: " 112 ", subDivision: "3", occupantNames: "Ramesh Kumar",
    tenantName: " ", areaSqM: "8500", landClass: "paddy" as const, assessmentRs: "", irrigation: "well" as const,
    remarks: "", kharifCropId: "c7e5a1b2-0000-4000-8000-000000000001", rabiCropId: "",
  };
  const formId = "0f0f0f0f-0000-4000-8000-000000000000";

  it("sends a new farmer's profile and the exact land-records body", () => {
    const farmer = { id: null, name: " Ramesh Kumar ", mobile: "+91 98765 43210", fatherName: "", gender: "" as const, category: "obc" as const, village: "Aldona", taluka: "Bardez" as const };
    const item = queueItemFromDraft(makeDraft({ formId, farmer, land }), USER_ID);
    const p = toFormSubmitPayload(item, null);
    expect(p.farmer).toEqual({ name: "Ramesh Kumar", mobile: "9876543210", father_name: null, gender: null, category: "obc", village: "Aldona", taluka: "Bardez" });
    expect(p.form).toEqual({
      id: formId, village: "Aldona", taluka: "Bardez", survey_number: "112", sub_division: "3", occupant_names: "Ramesh Kumar",
      tenant_name: null, area_sq_m: 8500, land_class: "paddy", assessment_rs: null, kharif_crop_id: land.kharifCropId, rabi_crop_id: null,
      irrigation_source: "well", remarks: null,
    });
    expect(p.survey?.id).toBe(SURVEY_ID);
    expect(p.survey?.latitude).toBe(15.495872);
  });

  it("references an existing farmer by id only", () => {
    const farmer = { id: "11111111-aaaa-4bbb-8ccc-000000000001", name: "X", mobile: "9876543210", fatherName: "", gender: "" as const, category: "" as const, village: "", taluka: "" as const };
    const p = toFormSubmitPayload(queueItemFromDraft(makeDraft({ formId, farmer, land }), USER_ID), null);
    expect(p.farmer).toEqual({ id: farmer.id });
  });

  it("legacy survey-only items have no form payload", () => {
    expect(() => toFormSubmitPayload(makeQueueItem(), null)).toThrow(/Land details/);
  });
});
