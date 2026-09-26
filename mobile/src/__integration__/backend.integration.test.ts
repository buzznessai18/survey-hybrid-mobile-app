/**
 * @jest-environment ./src/__integration__/node-fetch-env.js
 *
 * Contract test: runs the app's real service layer against a running Supabase
 * backend (local stack). Opt-in: `npm run test:integration` (see README).
 *
 * The service_role key is used ONLY by this test process to provision a
 * throwaway surveyor account (public signup is disabled). It is never part of
 * the app bundle.
 */
import { createClient } from "@supabase/supabase-js";
import { ApiError } from "@/services/api/errors";
import { AuthService } from "@/services/auth/AuthService";
import { CropService } from "@/services/crops/CropService";
import { MapService } from "@/services/map/MapService";
import { ReportService } from "@/services/reports/ReportService";
import { PhotoService } from "@/services/storage/PhotoService";
import { supabase } from "@/services/supabase/client";
import { DuplicateService } from "@/services/surveys/DuplicateService";
import { SurveyService } from "@/services/surveys/SurveyService";
import { SyncService } from "@/services/sync/SyncService";
import { useNetworkStore } from "@/store/networkStore";
import { useQueueStore } from "@/store/queueStore";
import type { SurveyDraft } from "@/types/survey";
import { toIsoDate } from "@/utils/date";
import { photoStoragePath, toCreatePayload } from "@/utils/serialization";

// Restore Node's real fetch (the Expo jest preset installs a stub).
const net = (globalThis as unknown as { __nodeNet: Record<string, unknown> }).__nodeNet;
Object.assign(globalThis, net);

// expo-file-system isn't available under Jest: upload a tiny JPEG through the
// same storage path/policy the app uses.
jest.mock("@/services/storage/PhotoService", () => {
  const { supabase: client } = jest.requireActual("@/services/supabase/client");
  const { photoStoragePath: path } = jest.requireActual("@/utils/serialization");
  return {
    PhotoService: {
      delete: jest.fn(),
      upload: jest.fn(async (userId: string, surveyId: string) => {
        const p = path(userId, surveyId, "field-photo.jpg");
        const bytes = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0xff, 0xd9]);
        const { error } = await client.storage.from("field-photos").upload(p, bytes, { contentType: "image/jpeg", upsert: true });
        if (error) throw error;
        return p;
      }),
    },
  };
});

const URL = process.env.INTEGRATION_SUPABASE_URL ?? "http://127.0.0.1:54321";
const SERVICE_KEY = process.env.INTEGRATION_SERVICE_ROLE_KEY ?? "";
const run = Math.random().toString(36).slice(2, 8);
const email = `app-admin-${run}@example.test`;
const password = "App-test-pass-123";
const SN = `APP${run}`.toUpperCase();
const BASE = { latitude: 15.495872, longitude: 73.827361 };

const describeIf = SERVICE_KEY ? describe : describe.skip;
jest.setTimeout(60_000);

describeIf("app services against the real backend", () => {
  let userId = "";
  let cropId = "";
  let firstId = "";

  const draft = (overrides: Partial<SurveyDraft> = {}): SurveyDraft => ({
    id: globalThis.crypto.randomUUID(),
    startedAt: new Date().toISOString(),
    details: {
      farmerName: "Ramesh Kumar",
      farmerMobile: "+91 98765 43210",
      cropId,
      area: "2.5",
      areaUnit: "acre",
      surveyNumber: SN,
      subDivision: "2",
      visitDate: toIsoDate(),
    },
    cropName: "Paddy",
    location: { ...BASE, accuracy: 8, capturedAt: new Date().toISOString() },
    photo: { uri: "file:///test.jpg", width: 10, height: 10 },
    notes: "integration",
    duplicateReason: null,
    duplicateReasonNotes: "",
    duplicateCheck: null,
    duplicateCheckKey: null,
    ...overrides,
  });

  beforeAll(async () => {
    const admin = createClient(URL, SERVICE_KEY, { auth: { persistSession: false } });
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: `App Admin ${run}` },
    });
    if (error) throw error;
    userId = data.user.id;
    const { error: pErr } = await admin.from("profiles").update({ role: "admin", status: "active" }).eq("id", userId);
    if (pErr) throw pErr;
    useNetworkStore.setState({ isOnline: true, known: true });
  });

  afterAll(async () => {
    await supabase.auth.signOut({ scope: "local" });
  });

  it("signs in with email + password and loads the DB profile", async () => {
    const { profile } = await AuthService.signIn({ portal: "admin", method: "email", identifier: email, password });
    expect(profile.id).toBe(userId);
    expect(profile.role).toBe("admin");
  });

  it("rejects a wrong password with a friendly error", async () => {
    await expect(AuthService.signIn({ portal: "admin", method: "email", identifier: email, password: "wrong" })).rejects.toMatchObject({
      kind: "invalid_credentials",
    });
    await AuthService.signIn({ portal: "admin", method: "email", identifier: email, password });
  });

  it("an admin account cannot enter through the User option", async () => {
    await expect(AuthService.signIn({ portal: "user", method: "email", identifier: email, password })).rejects.toMatchObject({
      kind: "use_admin_login",
    });
    await AuthService.signIn({ portal: "admin", method: "email", identifier: email, password });
  });

  it("reports phone login disabled on this backend (documented integration issue)", async () => {
    const res = AuthService.signIn({ portal: "admin", method: "phone", identifier: "9876543210", password });
    await expect(res).rejects.toMatchObject({ kind: expect.stringMatching(/phone_login_disabled|invalid_credentials/) });
    await AuthService.signIn({ portal: "admin", method: "email", identifier: email, password });
  });

  it("loads active crops", async () => {
    const crops = await CropService.listActive();
    expect(crops.length).toBeGreaterThan(0);
    cropId = crops[0].id;
  });

  it("check-survey-duplicate: a fresh survey number is available", async () => {
    const res = await DuplicateService.check({ surveyNumber: SN, subDivision: "2", location: BASE });
    expect(DuplicateService.interpret(res).level).toBe("none");
    expect(res.radius_meters).toBe(100);
  });

  it("submitDraft uploads the photo, creates the survey and is idempotent on retry", async () => {
    const d = draft();
    const outcome = await SyncService.submitDraft(d, userId);
    expect(outcome.kind).toBe("synced");
    if (outcome.kind !== "synced") return;
    firstId = outcome.response.survey.id;
    expect(firstId).toBe(d.id);
    expect(outcome.response.survey.survey_id).toMatch(/^SV-\d{6,}$/);
    expect(outcome.response.survey.photo_path).toBe(photoStoragePath(userId, d.id, "field-photo.jpg"));
    expect(PhotoService.upload).toHaveBeenCalled();

    // Simulate a lost response: the same request again must not create a second record.
    const queued = useQueueStore.getState().items[d.id];
    const replay = await SurveyService.createSurvey(toCreatePayload(queued, queued.photoPath));
    expect(replay.idempotent_replay).toBe(true);
    expect(replay.survey.survey_id).toBe(outcome.response.survey.survey_id);
  });

  it("detects the duplicate (exact + 35 m) and still accepts it with a reason", async () => {
    const near = { latitude: BASE.latitude + 35 / 111_320, longitude: BASE.longitude };
    const check = await DuplicateService.check({ surveyNumber: SN, subDivision: "2", location: near, farmerMobile: "9876543210" });
    const info = DuplicateService.interpret(check);
    expect(info.level).toBe("duplicate");
    expect(info.primary?.match_type).toBe("exact_and_proximity");
    expect(Math.round(info.nearestDistance ?? 0)).toBe(35);
    expect(info.farmerSurveys.length).toBeGreaterThan(0);

    const outcome = await SyncService.submitDraft(
      draft({
        location: { ...near, accuracy: 6, capturedAt: new Date().toISOString() },
        duplicateReason: "different_portion_of_land",
        duplicateReasonNotes: "North half",
      }),
      userId,
    );
    expect(outcome.kind).toBe("synced");
    if (outcome.kind !== "synced") return;
    expect(outcome.response.survey.duplicate_status).toBe("duplicate");
    expect(outcome.response.survey.duplicate_reason).toBe("different_portion_of_land");
    expect(outcome.response.survey.duplicate_check.matches[0].survey?.is_own).toBe(true);
  });

  it("maps backend 422 field errors", async () => {
    const d = draft();
    const bad = { ...toCreatePayload({ ...useQueueStore.getState().items[firstId], id: d.id }, null), area: 0 };
    await expect(SurveyService.createSurvey(bad)).rejects.toMatchObject({ kind: "validation", fields: { area: expect.any(String) } });
  });

  it("search-surveys paginates and searches", async () => {
    const page = await SurveyService.searchSurveys({ search: SN, page: 1, page_size: 1, include_photo_urls: true });
    expect(page.pagination.total).toBe(2);
    expect(page.pagination.total_pages).toBe(2);
    expect(page.data).toHaveLength(1);
    const dups = await SurveyService.searchSurveys({ search: SN, duplicate_status: ["duplicate"] });
    expect(dups.pagination.total).toBe(1);
  });

  it("get-survey returns full detail with a signed photo URL", async () => {
    const s = await SurveyService.getSurvey(firstId);
    expect(s.id).toBe(firstId);
    expect(s.photo_url).toContain("/storage/v1/object/sign/field-photos/");
    const byCode = await SurveyService.getSurvey(s.survey_id);
    expect(byCode.id).toBe(firstId);
  });

  it("update-survey edits a pending survey", async () => {
    const s = await SurveyService.updateSurvey({ id: firstId, area: 3.25, notes: "edited from app" });
    expect(s.area).toBe(3.25);
    expect(s.notes).toBe("edited from app");
  });

  it("get-survey-map-data returns lightweight points in the bounding box", async () => {
    const res = await MapService.getSurveyMapData({
      min_lat: BASE.latitude - 0.01,
      max_lat: BASE.latitude + 0.01,
      min_lng: BASE.longitude - 0.01,
      max_lng: BASE.longitude + 0.01,
    });
    const p = res.points.find((x) => x.id === firstId);
    expect(p).toBeDefined();
    expect(Object.keys(p!).sort()).toEqual(
      ["crop", "duplicate_status", "farmer_name", "id", "latitude", "longitude", "sub_division", "survey_id", "survey_number"],
    );
  });

  it("get-reports returns all-surveys dashboard numbers for admins", async () => {
    const res = await ReportService.getMyReport();
    expect(res.scope).toBe("all");
    expect(res.report.total_surveys).toBeGreaterThanOrEqual(2);
    expect(res.report.duplicate_count).toBeGreaterThanOrEqual(1);
  });

  it("a no-login guest (no session at all) browses the admin's surveys read-only", async () => {
    const queued = useQueueStore.getState().items[firstId];
    await supabase.auth.signOut({ scope: "local" });
    expect((await supabase.auth.getSession()).data.session).toBeNull();

    const seen = await SurveyService.searchSurveys({ search: SN, include_photo_urls: true });
    expect(seen.pagination.total).toBe(2);
    expect(seen.data.every((s) => s.collected_by === userId && s.collected_by_name)).toBe(true);
    expect(seen.data.every((s) => /^\*+\d{4}$/.test(s.farmer_mobile ?? ""))).toBe(true);

    const detail = await SurveyService.getSurvey(firstId);
    expect(detail.farmer_mobile).toBe("******3210");
    expect(detail.photo_url).toContain("/storage/v1/object/sign/field-photos/");
    expect((await ReportService.getMyReport()).scope).toBe("all");

    const blocked = toCreatePayload({ ...queued, id: globalThis.crypto.randomUUID() }, null);
    await expect(SurveyService.createSurvey(blocked)).rejects.toMatchObject({ kind: "unauthorized" });
    await expect(SurveyService.updateSurvey({ id: firstId, notes: "hack" })).rejects.toMatchObject({ kind: "unauthorized" });
    await AuthService.signIn({ portal: "admin", method: "email", identifier: email, password });
  });

  it("maps 404 for surveys the user cannot see", async () => {
    await expect(SurveyService.getSurvey(globalThis.crypto.randomUUID())).rejects.toBeInstanceOf(ApiError);
  });
});
