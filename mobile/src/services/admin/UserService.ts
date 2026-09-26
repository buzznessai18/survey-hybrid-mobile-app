import { callFunction } from "@/services/api/functions";
import type { ManagedUser, Paginated, ProfileStatus, Role } from "@/types/api";

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

  async update(req: { user_id: string; role?: Role; status?: ProfileStatus; full_name?: string }) {
    const { data } = await callFunction<{ user: ManagedUser }>("admin-users", { action: "update", ...req });
    return data.user;
  },
};
