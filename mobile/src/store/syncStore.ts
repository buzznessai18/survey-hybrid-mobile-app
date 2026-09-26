import { create } from "zustand";

interface SyncState {
  isSyncing: boolean;
  currentId: string | null;
  lastSyncAt: string | null;
  set: (s: Partial<Omit<SyncState, "set">>) => void;
}

/** Runtime (non-persisted) sync engine status for UI indicators. */
export const useSyncStore = create<SyncState>((set) => ({
  isSyncing: false,
  currentId: null,
  lastSyncAt: null,
  set: (s) => set(s),
}));
