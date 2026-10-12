import { callFunction } from "@/services/api/functions";
import type { Paginated, ServiceRecord, ServiceRecordInput } from "@/types/api";

export interface ServiceRecordQuery {
  /** Farmer name, survey no. ("312", "312/4B"), sub-division or record no. */
  q?: string;
  /** ISO timestamps (local-day boundaries). */
  created_from?: string;
  created_to?: string;
  page?: number;
  page_size?: number;
}

/** Farmer equipment / service records via the service-records Edge Function. */
export const ServiceRecordService = {
  /**
   * Save a record. Idempotent on `input.id`: retrying after a timeout returns
   * the record the server already saved rather than creating a second one.
   * Resolves only once the backend has confirmed the save.
   */
  async create(input: ServiceRecordInput) {
    const { data } = await callFunction<{ record: ServiceRecord; created: boolean; idempotent_replay: boolean }>(
      "service-records",
      { action: "create", ...input },
      { timeoutMs: 30_000 },
    );
    return data;
  },

  async list(req: ServiceRecordQuery = {}) {
    const { data } = await callFunction<Paginated<ServiceRecord>>("service-records", { action: "list", page_size: 20, ...req });
    return data;
  },

  async get(id: string) {
    const body = /^RC-\d+$/i.test(id) ? { record_no: id } : { id };
    const { data } = await callFunction<{ record: ServiceRecord }>("service-records", { action: "get", ...body });
    return data.record;
  },

  /** Admins only (enforced by the function and RLS). */
  async remove(id: string) {
    const { data } = await callFunction<{ deleted: { id: string; record_no: string } }>("service-records", { action: "delete", id });
    return data.deleted;
  },
};
