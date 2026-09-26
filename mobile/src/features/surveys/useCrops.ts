import { useCallback, useEffect, useState } from "react";
import { CropService } from "@/services/crops/CropService";
import { useCacheStore } from "@/store/cacheStore";
import { useNetworkStore } from "@/store/networkStore";

/** Active crops, cached for offline surveys. */
export function useCrops() {
  const crops = useCacheStore((s) => s.crops);
  const setCrops = useCacheStore((s) => s.setCrops);
  const isOnline = useNetworkStore((s) => s.isOnline);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setCrops(await CropService.listActive());
    } catch {
      setError("Couldn't load crops.");
    } finally {
      setLoading(false);
    }
  }, [setCrops]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional: (re)fetch server data when connectivity changes
    if (isOnline) void refresh();
  }, [isOnline, refresh]);

  return { crops, loading: loading && crops.length === 0, error: crops.length === 0 ? error : null, refresh };
}
