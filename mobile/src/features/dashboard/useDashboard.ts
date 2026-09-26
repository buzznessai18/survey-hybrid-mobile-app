import { useCallback, useEffect, useState } from "react";
import { errorMessage, toApiError } from "@/services/api/errors";
import { ReportService } from "@/services/reports/ReportService";
import { SurveyService } from "@/services/surveys/SurveyService";
import { useAuthStore } from "@/store/authStore";
import { useCacheStore } from "@/store/cacheStore";
import { useNetworkStore } from "@/store/networkStore";
import { useSyncStore } from "@/store/syncStore";

/** get-reports + latest surveys, with last-known values shown offline. */
export function useDashboard() {
  const userId = useAuthStore((s) => s.profile?.id);
  const isOnline = useNetworkStore((s) => s.isOnline);
  const lastSyncAt = useSyncStore((s) => s.lastSyncAt);
  const cache = useCacheStore();
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ownCache = cache.userId === userId;

  const load = useCallback(async () => {
    if (!userId) return;
    setRefreshing(true);
    try {
      const [report, recent] = await Promise.all([
        ReportService.getMyReport(),
        SurveyService.searchSurveys({ page: 1, page_size: 5 }),
      ]);
      useCacheStore.getState().setDashboard(userId, report.report, recent.data);
      setError(null);
    } catch (e) {
      if (!toApiError(e).isConnectivity) setError(errorMessage(e));
    } finally {
      setRefreshing(false);
    }
  }, [userId]);

  // Reload on mount, when coming online and after each sync run.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional: (re)fetch server data when connectivity changes
    if (isOnline) void load();
  }, [isOnline, lastSyncAt, load]);

  return {
    report: ownCache ? cache.report : null,
    recent: ownCache ? cache.recent : [],
    updatedAt: ownCache ? cache.updatedAt : null,
    refreshing,
    error,
    reload: load,
  };
}
