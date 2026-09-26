import { create } from "zustand";
import { persist } from "zustand/middleware";
import { appConfig } from "@/config/env";
import type { QueueItem } from "@/types/survey";
import { persistStorage } from "./storage";

interface QueueState {
  items: Record<string, QueueItem>;
  /** Insert or replace by survey id (resubmitting a fixed survey keeps its id). */
  upsert: (item: QueueItem) => void;
  update: (id: string, changes: Partial<QueueItem>) => void;
  remove: (id: string) => void;
  /** Items left in "syncing" by a killed app go back to the queue. */
  recoverInterrupted: () => void;
  pruneSynced: () => void;
}

/** Offline outbox of submitted surveys. Persisted to AsyncStorage. */
export const useQueueStore = create<QueueState>()(
  persist(
    (set, get) => ({
      items: {},

      upsert: (item) => set({ items: { ...get().items, [item.id]: item } }),

      update(id, changes) {
        const current = get().items[id];
        if (!current) return;
        set({ items: { ...get().items, [id]: { ...current, ...changes, updatedAt: new Date().toISOString() } } });
      },

      remove(id) {
        const { [id]: _removed, ...rest } = get().items;
        set({ items: rest });
      },

      recoverInterrupted() {
        const items = { ...get().items };
        let changed = false;
        for (const [id, item] of Object.entries(items)) {
          if (item.status === "syncing") {
            items[id] = { ...item, status: "pending_sync" };
            changed = true;
          }
        }
        if (changed) set({ items });
      },

      pruneSynced() {
        const synced = Object.values(get().items)
          .filter((i) => i.status === "synced")
          .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
        const drop = synced.slice(appConfig.syncedHistoryLimit);
        if (drop.length === 0) return;
        const items = { ...get().items };
        for (const item of drop) delete items[item.id];
        set({ items });
      },
    }),
    { name: "survey-queue", storage: persistStorage, partialize: (s) => ({ items: s.items }) },
  ),
);

export const selectUserItems = (items: Record<string, QueueItem>, userId: string | undefined) =>
  Object.values(items)
    .filter((i) => i.userId === userId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

/** Not yet confirmed by the server. */
export const isUnsynced = (i: QueueItem) => i.status !== "synced";

export function queueCounts(items: QueueItem[]) {
  return {
    pending: items.filter((i) => i.status === "pending_sync" || i.status === "syncing").length,
    failed: items.filter((i) => i.status === "sync_failed").length,
    synced: items.filter((i) => i.status === "synced").length,
  };
}
