import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Crop, SurveyListItem, SurveyReport } from "@/types/api";
import { persistStorage } from "./storage";

interface CacheState {
  userId: string | null;
  crops: Crop[];
  report: SurveyReport | null;
  recent: SurveyListItem[];
  updatedAt: string | null;
  setCrops: (crops: Crop[]) => void;
  setDashboard: (userId: string, report: SurveyReport, recent: SurveyListItem[]) => void;
  clearUserData: () => void;
}

/** Last-known server data so the app stays useful offline. */
export const useCacheStore = create<CacheState>()(
  persist(
    (set) => ({
      userId: null,
      crops: [],
      report: null,
      recent: [],
      updatedAt: null,
      setCrops: (crops) => set({ crops }),
      setDashboard: (userId, report, recent) =>
        set({ userId, report, recent, updatedAt: new Date().toISOString() }),
      clearUserData: () => set({ userId: null, report: null, recent: [], updatedAt: null }),
    }),
    { name: "server-cache", storage: persistStorage },
  ),
);
