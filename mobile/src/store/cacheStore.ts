import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { AdminAnalytics, Crop, ReportResponse, SurveyListItem } from "@/types/api";
import { persistStorage } from "./storage";

type Report = ReportResponse["report"];

/** Last analytics loaded, for one user and one period (`key`). */
export interface CachedAnalytics {
  userId: string;
  key: string;
  data: AdminAnalytics;
  updatedAt: string;
}

interface CacheState {
  userId: string | null;
  crops: Crop[];
  report: Report | null;
  recent: SurveyListItem[];
  updatedAt: string | null;
  analytics: CachedAnalytics | null;
  setCrops: (crops: Crop[]) => void;
  setDashboard: (userId: string, report: Report, recent: SurveyListItem[]) => void;
  setAnalytics: (value: CachedAnalytics) => void;
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
      analytics: null,
      setCrops: (crops) => set({ crops }),
      setDashboard: (userId, report, recent) =>
        set({ userId, report, recent, updatedAt: new Date().toISOString() }),
      setAnalytics: (analytics) => set({ analytics }),
      clearUserData: () => set({ userId: null, report: null, recent: [], updatedAt: null, analytics: null }),
    }),
    { name: "server-cache", storage: persistStorage },
  ),
);
