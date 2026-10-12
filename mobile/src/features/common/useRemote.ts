import { useFocusEffect } from "expo-router";
import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { errorMessage, toApiError } from "@/services/api/errors";

export interface RemoteError {
  message: string;
  offline: boolean;
  notFound: boolean;
  forbidden: boolean;
}

/**
 * Load server data when the screen gains focus (so returning from an edit
 * shows fresh data). A change of `key` triggers a reload too.
 */
export function useRemote<T>(fetcher: () => Promise<T>, key: string = "") {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<RemoteError | null>(null);
  const req = useRef(0);
  const fetcherRef = useRef(fetcher);
  useLayoutEffect(() => {
    fetcherRef.current = fetcher;
  });

  const reload = useCallback(async () => {
    const id = ++req.current;
    setLoading(true);
    try {
      const value = await fetcherRef.current();
      if (id !== req.current) return;
      setData(value);
      setError(null);
    } catch (e) {
      if (id !== req.current) return;
      const err = toApiError(e);
      setError({ message: errorMessage(e), offline: err.isConnectivity, notFound: err.kind === "not_found", forbidden: err.kind === "forbidden" });
    } finally {
      if (id === req.current) setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload, key]), // eslint-disable-line react-hooks/exhaustive-deps
  );

  return { data, setData, loading, error, reload };
}
