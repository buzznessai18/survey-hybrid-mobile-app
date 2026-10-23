import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { toApiError } from "./errors";

export interface RemoteError {
  message: string;
  offline: boolean;
  notFound: boolean;
}

/** Load something from the backend; re-runs when `key` changes. Stale responses are dropped. */
export function useRemote<T>(load: () => Promise<T>, key: unknown) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<RemoteError | null>(null);
  const loadRef = useRef(load);
  useLayoutEffect(() => {
    loadRef.current = load;
  });
  const req = useRef(0);

  const reload = useCallback(async () => {
    const id = ++req.current;
    setLoading(true);
    try {
      const result = await loadRef.current();
      if (id !== req.current) return;
      setData(result);
      setError(null);
    } catch (e) {
      if (id !== req.current) return;
      const err = toApiError(e);
      setError({ message: err.message, offline: err.isConnectivity, notFound: err.kind === "not_found" });
    } finally {
      if (id === req.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [key, reload]);

  return { data, loading, error, reload, setData };
}
