import * as Crypto from "expo-crypto";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { DuplicateCheckResponse, DuplicateReason, FormDuplicateCheck } from "@/types/api";
import type { CapturedLocation, CapturedPhoto, FarmerDraft, LandDraft, QueueItem, SurveyDetailsValues, SurveyDraft } from "@/types/survey";
import { persistStorage } from "./storage";

interface DraftState {
  draft: SurveyDraft | null;
  /** Start a fresh 1/14 form + survey with new client-generated UUIDs (idempotency keys). */
  startNew: (farmer?: FarmerDraft) => SurveyDraft;
  setFarmer: (farmer: FarmerDraft) => void;
  setLand: (land: LandDraft) => void;
  setFormDuplicateCheck: (result: FormDuplicateCheck | null) => void;
  ensureDraft: () => SurveyDraft;
  setDetails: (details: SurveyDetailsValues, cropName: string | null) => void;
  /** Crop & area skipped: the 1/14 form is saved without a field survey. */
  clearDetails: () => void;
  setLocation: (location: CapturedLocation | null) => void;
  setPhoto: (photo: CapturedPhoto | null) => void;
  setNotes: (notes: string) => void;
  setDuplicateReason: (reason: DuplicateReason | null, notes: string) => void;
  setDuplicateCheck: (key: string, result: DuplicateCheckResponse | null) => void;
  /** Re-open a queued survey that failed validation, keeping its id. */
  loadFromQueueItem: (item: QueueItem) => void;
  clear: () => void;
}

const emptyDraft = (farmer?: FarmerDraft): SurveyDraft => ({
  id: Crypto.randomUUID(),
  formId: Crypto.randomUUID(),
  farmer: farmer ?? null,
  land: null,
  formDuplicateCheck: null,
  startedAt: new Date().toISOString(),
  details: null,
  cropName: null,
  location: null,
  photo: null,
  notes: "",
  duplicateReason: null,
  duplicateReasonNotes: "",
  duplicateCheck: null,
  duplicateCheckKey: null,
});

const patch = (get: () => DraftState, set: (s: Partial<DraftState>) => void, changes: Partial<SurveyDraft>) => {
  const draft = get().ensureDraft();
  set({ draft: { ...draft, ...changes } });
};

/** The in-progress survey, persisted so an app restart never loses field work. */
export const useDraftStore = create<DraftState>()(
  persist(
    (set, get) => ({
      draft: null,

      startNew(farmer) {
        const draft = emptyDraft(farmer);
        set({ draft });
        return draft;
      },
      setFarmer: (farmer) => patch(get, set, { farmer }),
      setLand: (land) => patch(get, set, { land }),
      setFormDuplicateCheck: (formDuplicateCheck) => patch(get, set, { formDuplicateCheck }),

      ensureDraft() {
        const existing = get().draft;
        if (existing) return existing;
        return get().startNew();
      },

      setDetails: (details, cropName) => patch(get, set, { details, cropName }),
      clearDetails: () => patch(get, set, { details: null, cropName: null }),
      setLocation: (location) => patch(get, set, { location }),
      setPhoto: (photo) => patch(get, set, { photo }),
      setNotes: (notes) => patch(get, set, { notes }),
      setDuplicateReason: (duplicateReason, duplicateReasonNotes) =>
        patch(get, set, { duplicateReason, duplicateReasonNotes }),
      setDuplicateCheck: (duplicateCheckKey, duplicateCheck) => patch(get, set, { duplicateCheckKey, duplicateCheck }),

      loadFromQueueItem(item) {
        set({
          draft: {
            id: item.id,
            startedAt: item.createdAt,
            details: item.details,
            cropName: item.cropName,
            location: item.location,
            photo: item.photoLocalUri ? { uri: item.photoLocalUri, width: 0, height: 0 } : null,
            notes: item.notes,
            duplicateReason: item.duplicateReason,
            duplicateReasonNotes: item.duplicateReasonNotes,
            duplicateCheck: null,
            duplicateCheckKey: null,
            formId: item.formId,
            farmer: item.farmer ?? null,
            land: item.land ?? null,
            formDuplicateCheck: null,
          },
        });
      },

      clear: () => set({ draft: null }),
    }),
    { name: "survey-draft", storage: persistStorage, partialize: (s) => ({ draft: s.draft }) },
  ),
);
