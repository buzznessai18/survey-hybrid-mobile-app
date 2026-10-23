/**
 * Types mirroring the Edge Function contracts in supabase/functions/*.
 * Same shapes as mobile/src/types/api.ts (only what the web app uses).
 */

export type Role = "field_surveyor" | "supervisor" | "admin" | "user";
export type ProfileStatus = "pending" | "active" | "inactive";

export interface Profile {
  id: string;
  full_name: string;
  mobile: string | null;
  role: Role;
  status: ProfileStatus;
  supervisor_id: string | null;
}

export interface Pagination {
  page: number;
  page_size: number;
  total: number;
  total_pages: number;
}

export interface Paginated<T> {
  data: T[];
  pagination: Pagination;
}

export type Gender = "male" | "female" | "other";

/** Farmer equipment / service record (service-records function, migration 022). */
export type LandUnit = "acre" | "sq_m";

export interface ServiceRecord {
  id: string;
  /** Receipt number, e.g. RC-000123 (set by the server). */
  record_no: string;
  farmer_name: string;
  gender: Gender | null;
  address: string | null;
  survey_number: string;
  sub_division: string | null;
  land_size: number;
  land_unit: LandUnit;
  service_details: string | null;
  created_by: string;
  created_by_name: string | null;
  /** Server timestamp (ISO, UTC); shown in the browser's local timezone. */
  created_at: string;
  updated_at: string;
}

export interface ServiceRecordInput {
  id: string;
  farmer_name: string;
  gender: Gender | null;
  address: string | null;
  survey_number: string;
  sub_division: string | null;
  land_size: number;
  land_unit: LandUnit;
  service_details: string | null;
}

/** admin-users list rows */
export interface ManagedUser {
  id: string;
  full_name: string;
  mobile: string | null;
  role: Role;
  status: ProfileStatus;
  supervisor_id: string | null;
  created_at: string;
  updated_at: string;
}

/** admin-users "get": a user with sign-in details and what they have entered. */
export interface ManagedUserDetail extends ManagedUser {
  email: string | null;
  /** Sign-in phone in E.164 (+919876543210), if any. */
  phone: string | null;
  last_sign_in_at: string | null;
  records: { forms: number; surveys: number; service_records: number };
  /** False when they entered service records, surveys or 1/14 forms (deactivate instead). */
  can_delete: boolean;
}

export interface AuditEntry {
  id: number;
  user_id: string | null;
  user_name: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  metadata: { ref?: string; changes?: Record<string, { from: unknown; to: unknown }> } & Record<string, unknown>;
  created_at: string;
}

export const GOA_TALUKAS = [
  "Bardez", "Bicholim", "Canacona", "Dharbandora", "Mormugao", "Pernem",
  "Ponda", "Quepem", "Salcete", "Sanguem", "Sattari", "Tiswadi",
] as const;
export type Taluka = (typeof GOA_TALUKAS)[number];

export type ExportDataset = "records" | "surveys" | "forms" | "farmers" | "applications";

export interface ExportResult {
  title: string;
  columns: { key: string; label: string }[];
  rows: Record<string, unknown>[];
  total: number;
  truncated: boolean;
  generated_at: string;
  filters: {
    date_from: string | null; date_to: string | null; taluka: string | null;
    created_from?: string | null; created_to?: string | null; q?: string | null;
  };
}
