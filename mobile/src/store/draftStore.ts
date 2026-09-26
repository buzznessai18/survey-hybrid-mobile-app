import * as Crypto from "expo-crypto";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { DuplicateCheckResponse, DuplicateReason } from "@/types/api";
import type { CapturedLocation, CapturedPhoto, QueueItem, SurveyDetailsValues, SurveyDraft } from "@/types/survey";
import { persistStorage } from "./storage";

interface DraftState {
  draft: SurveyDraft | null;
  /** Start a fresh survey with a new client-generated UUID (idempotency key). */
  startNew: () => SurveyDraft;
  ensureDraft: () => SurveyDraft;
  setDetails: (details: SurveyDetailsValues, cropName: string | null) => void;
  setLocation: (location: CapturedLocation | null) => void;
  setPhoto: (photo: CapturedPhoto | null) => void;
  setNotes: (notes: string) => void;
  setDuplicateReason: (reason: DuplicateReason | null, notes: string) => void;
  setDuplicateCheck: (key: string, result: DuplicateCheckResponse | null) => void;
  /** Re-open a queued survey that failed validation, keeping its id. */
  loadFromQueueItem: (item: QueueItem) => void;
  clear: () => void;
}

const emptyDraft = (): SurveyDraft => ({
  id: Crypto.randomUUID(),
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

      startNew() {
        const draft = emptyDraft();
        set({ draft });
        return draft;
      },

      ensureDraft() {
        const existing = get().draft;
        if (existing) return existing;
        return get().startNew();
      },

      setDetails: (details, cropName) => patch(get, set, { details, cropName }),
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
          },
        });
      },

      clear: () => set({ draft: null }),
    }),
    { name: "survey-draft", storage: persistStorage, partialize: (s) => ({ draft: s.draft }) },
  ),
);
