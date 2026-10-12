import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { errorMessage, toApiError } from "@/services/api/errors";
import { ReportService } from "@/services/reports/ReportService";
import { useAuthStore } from "@/store/authStore";
import { useCacheStore } from "@/store/cacheStore";
import { useNetworkStore } from "@/store/networkStore";
import { useSyncStore } from "@/store/syncStore";
import type { Period } from "@/utils/period";

/** Admin analytics for a period; the last loaded period stays visible offline. */
export function useAnalytics(period: Period, enabled = true) {
  const userId = useAuthStore((s) => s.profile?.id);
  const isOnline = useNetworkStore((s) => s.isOnline);
  const lastSyncAt = useSyncStore((s) => s.lastSyncAt);
  const key = `${period.from}|${period.to}|${period.prevFrom}|${period.prevTo}`;
  const cached = useCacheStore((s) => (s.analytics && s.analytics.userId === userId && s.analytics.key === key ? s.analytics : null));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const req = useRef(0);
  const periodRef = useRef(period);
  useLayoutEffect(() => {
    periodRef.current = period;
  });

  const load = useCallback(async () => {
    if (!userId || !enabled) return;
    const id = ++req.current;
    setLoading(true);
    try {
      const data = await ReportService.getAnalytics(periodRef.current);
      if (id !== req.current) return;
      useCacheStore.getState().setAnalytics({ userId, key, data, updatedAt: new Date().toISOString() });
      setError(null);
    } catch (e) {
      if (id === req.current) setError(toApiError(e).isConnectivity ? null : errorMessage(e));
    } finally {
      if (id === req.current) setLoading(false);
    }
  }, [userId, key, enabled]);

  // Reload when the period changes, when coming online and after each sync run.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional: (re)fetch server data for the selected period
    if (isOnline) void load();
  }, [isOnline, lastSyncAt, load]);

  return { data: cached?.data ?? null, updatedAt: cached?.updatedAt ?? null, loading, error, reload: load };
}
