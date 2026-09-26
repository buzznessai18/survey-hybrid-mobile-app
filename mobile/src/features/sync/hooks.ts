import { useEffect, useMemo } from "react";
import { AppState } from "react-native";
import { useShallow } from "zustand/react/shallow";
import { SyncService } from "@/services/sync/SyncService";
import { useAuthStore } from "@/store/authStore";
import { startNetworkListener, useNetworkStore } from "@/store/networkStore";
import { queueCounts, selectUserItems, useQueueStore } from "@/store/queueStore";
import type { QueueItem } from "@/types/survey";

/** The signed-in user's outbox, newest first. */
export function useUserQueue(): QueueItem[] {
  const userId = useAuthStore((s) => s.profile?.id);
  const items = useQueueStore((s) => s.items);
  return useMemo(() => selectUserItems(items, userId), [items, userId]);
}

export function useUnsyncedCount() {
  const userId = useAuthStore((s) => s.profile?.id);
  return useQueueStore(useShallow((s) => queueCounts(selectUserItems(s.items, userId))));
}

const AUTO_SYNC_INTERVAL_MS = 60_000;

/**
 * Starts automatic background-ish sync while the app is open:
 * on sign-in, on reconnect, when returning to the foreground, and on a timer
 * (the timer respects each item's back-off).
 */
export function useSyncEngine() {
  const signedIn = useAuthStore((s) => s.status === "signedIn");

  useEffect(() => startNetworkListener(() => void SyncService.processQueue()), []);

  useEffect(() => {
    if (!signedIn) return;
    useQueueStore.getState().recoverInterrupted();
    void SyncService.processQueue();

    const appStateSub = AppState.addEventListener("change", (state) => {
      if (state === "active") void SyncService.processQueue();
    });
    const timer = setInterval(() => {
      const userId = useAuthStore.getState().profile?.id;
      if (useNetworkStore.getState().isOnline && SyncService.hasDueItems(userId)) void SyncService.processQueue();
    }, AUTO_SYNC_INTERVAL_MS);

    return () => {
      appStateSub.remove();
      clearInterval(timer);
    };
  }, [signedIn]);
}
