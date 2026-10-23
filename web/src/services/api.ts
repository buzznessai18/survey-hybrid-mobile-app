import type {
  AuditEntry, ExportDataset, ExportResult, ManagedUser, ManagedUserDetail, Paginated, ProfileStatus, Role, ServiceRecord,
  ServiceRecordInput, Taluka,
} from "@/lib/types";
import { callFunction } from "./functions";

/** Typed wrappers over the same Edge Functions the mobile app uses. */

export interface ServiceRecordQuery {
  /** Farmer name, survey no. ("312", "312/4B"), sub-division or record no. */
  q?: string;
  created_from?: string;
  created_to?: string;
  page?: number;
  page_size?: number;
}

/** Farmer equipment / service records via the service-records Edge Function. */
export const ServiceRecordService = {
  /** Idempotent on `input.id`: a retry after a timeout returns the record already saved. */
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

/** Account management via the admin-users Edge Function (admins only). */
export const UserService = {
  async list(req: { page?: number; page_size?: number; role?: Role; status?: ProfileStatus; search?: string } = {}) {
    const { data } = await callFunction<Paginated<ManagedUser>>("admin-users", { action: "list", page_size: 50, ...req });
    return data;
  },

  /** Phone must be E.164 (e.g. +919876543210); at least one of email/phone. */
  async create(req: { full_name: string; role: "admin" | "user"; email?: string; phone?: string; password: string }) {
    const { data } = await callFunction<{ user: ManagedUser }>("admin-users", { action: "create", ...req });
    return data.user;
  },

  async get(userId: string) {
    const { data } = await callFunction<{ user: ManagedUserDetail }>("admin-users", { action: "get", user_id: userId });
    return data.user;
  },

  async update(req: { user_id: string; role?: Role; status?: ProfileStatus; full_name?: string; email?: string; phone?: string; password?: string }) {
    const { data } = await callFunction<{ user: ManagedUser }>("admin-users", { action: "update", ...req });
    return data.user;
  },

  /** Permanent. Refused (409 user_has_records) for users who entered records. */
  async remove(userId: string) {
    const { data } = await callFunction<{ deleted: { id: string; full_name: string } }>("admin-users", { action: "delete", user_id: userId });
    return data.deleted;
  },
};

export const AuditService = {
  async list(req: { entity_type?: string; entity_id?: string; page?: number; page_size?: number } = {}) {
    const { data } = await callFunction<Paginated<AuditEntry>>("audit-logs", { action: "list", page_size: 30, ...req });
    return data;
  },
};

export const ExportService = {
  async fetch(req: {
    dataset: ExportDataset; date_from?: string; date_to?: string; taluka?: Taluka;
    /** "records" dataset: ISO timestamps (see localDayRange) and a search term. */
    created_from?: string; created_to?: string; q?: string;
  }) {
    const { data } = await callFunction<ExportResult>("export-data", req, { timeoutMs: 60_000 });
    return data;
  },
};
