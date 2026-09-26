// POST /functions/v1/admin-users
// Admin-only user management: list, create and update surveyors/supervisors/admins.
//
//   { "action": "list",   "role": "field_surveyor", "status": "active", "search": "rahul", "page": 1 }
//   { "action": "create", "full_name": "...", "phone": "+919876543210" | "email": "...", "password": "...",
//                         "role": "field_surveyor", "supervisor_id": "<uuid>" }
//   { "action": "update", "user_id": "<uuid>", "role"?, "status"?, "supervisor_id"?, "full_name"?, "mobile"? }
//
// Role/status changes go through public.admin_update_profile so they are
// validated and audited (user_role_changed). Inactive users are also banned in
// Supabase Auth so they cannot obtain new sessions.
import type { SupabaseClient } from "jsr:@supabase/supabase-js@2";
import { requireUser } from "../_shared/auth.ts";
import { dbError, HttpError, json, readParams, serve } from "../_shared/http.ts";
import { likePattern, pagination, paginationMeta, parse, rangeFor, uuid, z } from "../_shared/validation.ts";

const ROLES = ["field_surveyor", "supervisor", "admin", "user"] as const;
const STATUSES = ["pending", "active", "inactive"] as const;
const e164 = z.string().trim().regex(/^\+?[1-9]\d{7,14}$/, "Use international format, e.g. +919876543210");

const listSchema = z.object({
  action: z.literal("list"),
  ...pagination,
  role: z.enum(ROLES).optional(),
  status: z.enum(STATUSES).optional(),
  supervisor_id: uuid.optional(),
  search: z.string().trim().max(100).optional(),
});

const createBase = z.object({
    action: z.literal("create"),
    full_name: z.string().trim().min(1).max(150),
    email: z.string().trim().email().optional(),
    phone: e164.optional(),
    password: z.string().min(8).max(72).optional(),
    role: z.enum(ROLES),
    supervisor_id: uuid.nullable().optional(),
  });

const createSchema = createBase
  .refine((v) => v.email || v.phone, { message: "Provide email and/or phone", path: ["email"] })
  .refine((v) => !v.email || v.password || v.phone, { message: "Password is required for email-only users", path: ["password"] });

const updateSchema = z.object({
  action: z.literal("update"),
  user_id: uuid,
  full_name: z.string().trim().min(1).max(150).optional(),
  mobile: z.string().trim().regex(/^\+?[0-9]{7,15}$/).nullable().optional(),
  role: z.enum(ROLES).optional(),
  status: z.enum(STATUSES).optional(),
  supervisor_id: uuid.nullable().optional(),
});

const schema = z.discriminatedUnion("action", [
  listSchema,
  // discriminatedUnion needs plain objects; createSchema's refinements are applied in the handler.
  createBase,
  updateSchema,
]);

serve(["POST"], async (req) => {
  const { profile, adminClient } = await requireUser(req, ["admin"]);
  const params = await readParams(req);
  const input = parse(schema, params);

  switch (input.action) {
    case "list":
      return json(await listUsers(adminClient, input));
    case "create":
      return json({ user: await createUser(adminClient, profile.id, parse(createSchema, params)) }, 201);
    case "update":
      return json({ user: await updateUser(adminClient, profile.id, input) });
  }
});

async function listUsers(admin: SupabaseClient, p: z.infer<typeof listSchema>) {
  let query = admin
    .from("profiles")
    .select("id, full_name, mobile, role, status, supervisor_id, created_at, updated_at", { count: "exact" })
    // Anonymous app visitors are not managed accounts.
    .eq("is_guest", false);
  if (p.role) query = query.eq("role", p.role);
  if (p.status) query = query.eq("status", p.status);
  if (p.supervisor_id) query = query.eq("supervisor_id", p.supervisor_id);
  if (p.search) {
    const like = likePattern(p.search);
    query = query.or(`full_name.ilike.${like},mobile.ilike.${like}`);
  }
  const [from, to] = rangeFor(p.page, p.page_size);
  const { data, count, error } = await query.order("full_name").range(from, to);
  if (error) throw dbError(error);
  return { data, pagination: paginationMeta(p.page, p.page_size, count) };
}

async function createUser(admin: SupabaseClient, actorId: string, p: z.infer<typeof createSchema>) {
  const phone = p.phone?.replace(/^\+/, "");
  const { data, error } = await admin.auth.admin.createUser({
    email: p.email,
    phone,
    password: p.password,
    email_confirm: !!p.email,
    phone_confirm: !!phone,
    user_metadata: { full_name: p.full_name },
  });
  if (error || !data.user) {
    const status = error?.status === 422 || error?.status === 400 ? 409 : 500;
    throw new HttpError(status, status === 409 ? "conflict" : "internal_error", error?.message ?? "Could not create user");
  }

  const { data: updated, error: rpcError } = await admin.rpc("admin_update_profile", {
    p_actor: actorId,
    p_user_id: data.user.id,
    p_changes: {
      full_name: p.full_name,
      mobile: phone ?? null,
      role: p.role,
      status: "active",
      supervisor_id: p.supervisor_id ?? null,
    },
  });
  if (rpcError) {
    // Roll back the auth user so a failed create leaves nothing behind.
    await admin.auth.admin.deleteUser(data.user.id);
    throw dbError(rpcError);
  }
  return { ...updated, email: data.user.email ?? null, phone: data.user.phone ?? null };
}

async function updateUser(admin: SupabaseClient, actorId: string, p: z.infer<typeof updateSchema>) {
  const { action: _action, user_id, ...changes } = p;
  if (Object.keys(changes).length === 0) {
    throw new HttpError(422, "validation_error", "Nothing to update");
  }

  const { data, error } = await admin.rpc("admin_update_profile", {
    p_actor: actorId,
    p_user_id: user_id,
    p_changes: changes,
  });
  if (error) throw dbError(error);

  if (changes.status) {
    // Block/unblock sign-in. Existing access tokens expire within the JWT TTL,
    // and every Edge Function / RLS policy already rejects non-active profiles.
    const { error: banError } = await admin.auth.admin.updateUserById(user_id, {
      ban_duration: changes.status === "inactive" ? "876000h" : "none",
    });
    if (banError) console.error("Failed to update auth ban state", banError);
  }
  return data;
}
