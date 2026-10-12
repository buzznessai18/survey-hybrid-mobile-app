import type { ServiceRecord } from "@/types/api";

/**
 * Records the backend has just confirmed, so the details screen can show the
 * saved record (and its Print Receipt action) straight away instead of waiting
 * on a second request. Server data only; never a local draft.
 */
const cache = new Map<string, ServiceRecord>();

export const recordCache = {
  put(record: ServiceRecord) {
    cache.set(record.id, record);
    if (cache.size > 50) cache.delete(cache.keys().next().value!);
  },
  get: (id: string) => cache.get(id) ?? null,
  remove: (id: string) => void cache.delete(id),
};
