import type { ServiceRecord } from "@/lib/types";

/** The record a save just confirmed, shown on its page until the fresh copy arrives. */
const cache = new Map<string, ServiceRecord>();

export const recordCache = {
  put: (r: ServiceRecord) => void cache.set(r.id, r),
  get: (id: string) => cache.get(id),
  remove: (id: string) => void cache.delete(id),
};
