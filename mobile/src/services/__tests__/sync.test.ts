import { ApiError } from "../api/errors";
import { PhotoService } from "../storage/PhotoService";
import { SurveyService } from "../surveys/SurveyService";
import { backoffDelay, SyncService } from "../sync/SyncService";
import { useNetworkStore } from "@/store/networkStore";
import { useQueueStore } from "@/store/queueStore";
import type { CreateSurveyResponse } from "@/types/api";
import { makeDraft, makeQueueItem, SURVEY_ID, USER_ID } from "@/utils/__tests__/fixtures";

jest.mock("../surveys/SurveyService", () => ({ SurveyService: { createSurvey: jest.fn() } }));
jest.mock("../records/RecordServices", () => ({ FormService: { submit: jest.fn() } }));
jest.mock("../storage/PhotoService", () => ({ PhotoService: { upload: jest.fn(), delete: jest.fn() } }));
jest.mock("../supabase/client", () => ({
  supabase: { auth: { getSession: jest.fn(async () => ({ data: { session: { user: { id: "11111111-2222-4333-8444-555555555555" } } } })) } },
}));

const createSurvey = SurveyService.createSurvey as jest.Mock;
// eslint-disable-next-line @typescript-eslint/no-require-imports
const submitForm = require("../records/RecordServices").FormService.submit as jest.Mock;
const upload = PhotoService.upload as jest.Mock;
const PHOTO_PATH = `${USER_ID}/${SURVEY_ID}/field-photo.jpg`;

function response(replay = false): CreateSurveyResponse {
  return {
    created: !replay,
    idempotent_replay: replay,
    survey: {
      id: SURVEY_ID,
      survey_id: "SV-001245",
      duplicate_status: "unique",
      duplicate_check: { duplicate_found: false, possible_duplicate: false, nearest_distance_meters: null, matches: [] },
    } as unknown as CreateSurveyResponse["survey"],
  };
}

const item = () => useQueueStore.getState().items[SURVEY_ID];

beforeEach(() => {
  jest.clearAllMocks();
  useQueueStore.setState({ items: {} });
  useNetworkStore.setState({ isOnline: true, known: true });
  upload.mockResolvedValue(PHOTO_PATH);
});

describe("SyncService", () => {
  it("uploads the photo, creates the survey and marks it synced", async () => {
    createSurvey.mockResolvedValue(response());
    const outcome = await SyncService.submitDraft(makeDraft(), USER_ID);

    expect(outcome.kind).toBe("synced");
    expect(upload).toHaveBeenCalledWith(USER_ID, SURVEY_ID, "file:///docs/survey-photos/p.jpg");
    expect(createSurvey).toHaveBeenCalledWith(expect.objectContaining({ id: SURVEY_ID, photo_path: PHOTO_PATH }));
    expect(item().status).toBe("synced");
    expect(item().result?.surveyCode).toBe("SV-001245");
    expect(item().photoLocalUri).toBeNull();
    expect(PhotoService.delete).toHaveBeenCalledWith("file:///docs/survey-photos/p.jpg");
  });

  it("queues without any network call when offline", async () => {
    useNetworkStore.setState({ isOnline: false });
    const outcome = await SyncService.submitDraft(makeDraft(), USER_ID);
    expect(outcome.kind).toBe("queued");
    expect(item().status).toBe("pending_sync");
    expect(upload).not.toHaveBeenCalled();
    expect(createSurvey).not.toHaveBeenCalled();
  });

  it("network failure keeps the item pending; the retry reuses the uploaded photo and the same id", async () => {
    createSurvey.mockRejectedValueOnce(new ApiError("network", "offline")).mockResolvedValueOnce(response(true));

    const first = await SyncService.submitDraft(makeDraft(), USER_ID);
    expect(first.kind).toBe("queued");
    expect(item().status).toBe("pending_sync");
    expect(item().retryCount).toBe(0); // connectivity doesn't consume retries
    expect(item().photoPath).toBe(PHOTO_PATH);

    const second = await SyncService.syncItem(SURVEY_ID);
    expect(second.kind).toBe("synced");
    expect(upload).toHaveBeenCalledTimes(1);
    expect(createSurvey).toHaveBeenCalledTimes(2);
    expect(createSurvey.mock.calls[0][0].id).toBe(createSurvey.mock.calls[1][0].id);
    // Server says it already had it: no duplicate record, flagged as a replay.
    expect(item().result?.idempotentReplay).toBe(true);
    expect(Object.keys(useQueueStore.getState().items)).toHaveLength(1);
  });

  it("validation errors mark the item sync_failed with field messages", async () => {
    createSurvey.mockRejectedValue(new ApiError("validation", "Invalid request", 422, "validation_error", { area: "Area must be greater than 0" }));
    const outcome = await SyncService.submitDraft(makeDraft(), USER_ID);
    expect(outcome.kind).toBe("failed");
    expect(item().status).toBe("sync_failed");
    expect(item().lastError?.kind).toBe("validation");
    expect(item().lastError?.fields).toEqual({ area: "Area must be greater than 0" });
  });

  it("server errors back off and eventually fail", async () => {
    createSurvey.mockRejectedValue(new ApiError("server", "boom", 500));
    await SyncService.submitDraft(makeDraft(), USER_ID);
    expect(item().status).toBe("pending_sync");
    expect(item().retryCount).toBe(1);
    expect(item().nextAttemptAt).toBeGreaterThan(Date.now());

    // Not due yet: automatic processing skips it.
    await SyncService.processQueue();
    expect(createSurvey).toHaveBeenCalledTimes(1);

    for (let i = 0; i < 10 && item().status !== "sync_failed"; i++) await SyncService.syncItem(SURVEY_ID);
    expect(item().status).toBe("sync_failed");
  });

  it("dedupes concurrent syncs of the same survey", async () => {
    let resolve!: (r: CreateSurveyResponse) => void;
    createSurvey.mockReturnValue(new Promise((r) => (resolve = r)));
    useQueueStore.getState().upsert(makeQueueItem());
    const a = SyncService.syncItem(SURVEY_ID);
    const b = SyncService.syncItem(SURVEY_ID);
    await Promise.resolve();
    await Promise.resolve();
    resolve(response());
    await Promise.all([a, b]);
    expect(createSurvey).toHaveBeenCalledTimes(1);
  });

  it("never re-sends a synced survey", async () => {
    useQueueStore.getState().upsert(makeQueueItem({ status: "synced" }));
    const outcome = await SyncService.submitDraft(makeDraft(), USER_ID);
    expect(outcome.kind).toBe("skipped");
    expect(createSurvey).not.toHaveBeenCalled();
  });

  it("processQueue(force) retries transient failures but not validation failures", async () => {
    createSurvey.mockResolvedValue(response());
    useQueueStore.getState().upsert(
      makeQueueItem({ id: "a", status: "sync_failed", lastError: { kind: "server", message: "x", at: "" } }),
    );
    useQueueStore.getState().upsert(
      makeQueueItem({ id: "b", status: "sync_failed", lastError: { kind: "validation", message: "x", at: "" } }),
    );
    await SyncService.processQueue({ force: true });
    expect(useQueueStore.getState().items.a.status).toBe("synced");
    expect(useQueueStore.getState().items.b.status).toBe("sync_failed");
  });

  it("recovers items left in syncing by a killed app", () => {
    useQueueStore.getState().upsert(makeQueueItem({ status: "syncing" }));
    useQueueStore.getState().recoverInterrupted();
    expect(item().status).toBe("pending_sync");
  });

  it("back-off grows and is capped", () => {
    expect(backoffDelay(1)).toBeLessThan(backoffDelay(3));
    expect(backoffDelay(50)).toBe(30 * 60_000);
  });

  it("1/14 form items sync via land-records submit (form + survey together) and keep the form code", async () => {
    const formId = "0f0f0f0f-0000-4000-8000-000000000000";
    const land = {
      village: "Aldona", taluka: "Bardez" as const, surveyNumber: "112", subDivision: "3", occupantNames: "Ramesh", tenantName: "",
      areaSqM: "8500", landClass: "paddy" as const, assessmentRs: "", irrigation: "well" as const, remarks: "",
      kharifCropId: "", rabiCropId: "",
    };
    const farmer = { id: "f1", name: "Ramesh", mobile: "9876543210", fatherName: "", gender: "" as const, category: "" as const, village: "", taluka: "" as const };
    submitForm.mockRejectedValueOnce(new ApiError("network", "offline")).mockResolvedValueOnce({
      created: false, idempotent_replay: true,
      form: { id: formId, form_id: "LR-000042" },
      surveys: [{ id: SURVEY_ID, survey_id: "SV-000900", duplicate_status: "unique" }],
    });
    const first = await SyncService.submitDraft(makeDraft({ formId, farmer, land }), USER_ID);
    expect(first.kind).toBe("queued");
    const second = await SyncService.syncItem(SURVEY_ID);
    expect(second.kind).toBe("synced");
    expect(createSurvey).not.toHaveBeenCalled();
    expect(submitForm).toHaveBeenCalledTimes(2);
    expect(submitForm.mock.calls[0][0].form.id).toBe(formId);
    expect(submitForm.mock.calls[1][0].form.id).toBe(formId);
    expect(submitForm.mock.calls[0][0].farmer).toEqual({ id: "f1" });
    expect(item().result?.formCode).toBe("LR-000042");
    expect(item().result?.surveyCode).toBe("SV-000900");
  });
});
