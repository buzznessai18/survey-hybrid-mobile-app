import { useCallback, useEffect, useRef, useState } from "react";
import { appConfig } from "@/config/env";
import { errorMessage, toApiError } from "@/services/api/errors";
import { SurveyService } from "@/services/surveys/SurveyService";
import { useNetworkStore } from "@/store/networkStore";
import { useSyncStore } from "@/store/syncStore";
import type { SearchSurveysRequest, SurveyListItem } from "@/types/api";

type Filters = Pick<SearchSurveysRequest, "search" | "duplicate_status" | "status">;

/**
 * Paginated search-surveys (all surveys the caller may see — admins and
 * company users see everything) with pull-to-refresh and infinite scroll.
 */
export function useMySurveys(filters: Filters, enabled = true) {
  const isOnline = useNetworkStore((s) => s.isOnline);
  const lastSyncAt = useSyncStore((s) => s.lastSyncAt);
  const [items, setItems] = useState<SurveyListItem[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<{ message: string; offline: boolean } | null>(null);
  const requestId = useRef(0);
  const filterKey = JSON.stringify(filters);

  const fetchPage = useCallback(
    async (nextPage: number, mode: "initial" | "refresh" | "more") => {
      const id = ++requestId.current;
      if (mode === "initial") setLoading(true);
      if (mode === "refresh") setRefreshing(true);
      if (mode === "more") setLoadingMore(true);
      try {
        const res = await SurveyService.searchSurveys({
          ...(JSON.parse(filterKey) as Filters),
          page: nextPage,
          page_size: appConfig.pageSize,
          include_photo_urls: true,
        });
        if (id !== requestId.current) return;
        setItems((prev) => (nextPage === 1 ? res.data : [...prev, ...res.data.filter((d) => !prev.some((p) => p.id === d.id))]));
        setTotal(res.pagination.total);
        setTotalPages(res.pagination.total_pages);
        setPage(nextPage);
        setError(null);
      } catch (e) {
        if (id !== requestId.current) return;
        setError({ message: errorMessage(e), offline: toApiError(e).isConnectivity });
      } finally {
        if (id === requestId.current) {
          setLoading(false);
          setRefreshing(false);
          setLoadingMore(false);
        }
      }
    },
    [filterKey],
  );

  useEffect(() => {
    if (!enabled || !isOnline) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional: fetch page 1 when filters/connectivity change
    void fetchPage(1, "initial");
  }, [enabled, isOnline, fetchPage, lastSyncAt]);

  const offlineError = !isOnline && items.length === 0
    ? { message: "Connect to the internet to see surveys stored on the server.", offline: true }
    : null;

  return {
    items,
    total,
    loading: loading && items.length === 0,
    refreshing,
    loadingMore,
    error: error ?? offlineError,
    hasMore: page < totalPages,
    refresh: () => fetchPage(1, "refresh"),
    loadMore: () => {
      if (!loadingMore && !loading && page < totalPages && isOnline) void fetchPage(page + 1, "more");
    },
  };
}
