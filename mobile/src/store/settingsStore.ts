import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { MapStyleId } from "@/components/map/mapStyles";
import { persistStorage } from "./storage";

interface SettingsState {
  mapStyle: MapStyleId;
  setMapStyle: (style: MapStyleId) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      mapStyle: "liberty",
      setMapStyle: (mapStyle) => set({ mapStyle }),
    }),
    { name: "settings", storage: persistStorage, version: 2, migrate: () => ({ mapStyle: "liberty" }) },
  ),
);
