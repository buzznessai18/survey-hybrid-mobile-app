// POST /functions/v1/admin-users
// Admin-only user management: list, view, create, update and delete users.
//
//   { "action": "list",   "role": "field_surveyor", "status": "active", "search": "rahul", "page": 1 }
//   { "action": "get",    "user_id": "<uuid>" }   -> profile + sign-in email/phone + record counts
//   { "action": "create", "full_name": "...", "phone": "+919876543210" | "email": "...", "password": "...",
//                         "role": "field_surveyor", "supervisor_id": "<uuid>" }
//   { "action": "update", "user_id": "<uuid>", "role"?, "status"?, "supervisor_id"?, "full_name"?, "mobile"?,
//                         "email"?, "phone"?, "password"? }
//   { "action": "delete", "user_id": "<uuid>" }
//
// Role/status changes go through public.admin_update_profile so they are
// validated and audited (user_role_changed). Inactive users are also banned in
// Supabase Auth so they cannot obtain new sessions. email / phone / password
// change how the person signs in (Supabase Auth); a new phone also becomes the
// profile mobile. Users who entered surveys, 1/14 forms or service records cannot be deleted
// (those records keep who entered them): deactivate them instead.
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
  // Sign-in details (Supabase Auth).
  email: z.string().trim().toLowerCase().email().optional(),
  phone: e164.optional(),
  password: z.string().min(8).max(72).optional(),
});

const userIdSchema = (action: "get" | "delete") => z.object({ action: z.literal(action), user_id: uuid });

const schema = z.discriminatedUnion("action", [
  listSchema,
  userIdSchema("get"),
  // discriminatedUnion needs plain objects; createSchema's refinements are applied in the handler.
  createBase,
  updateSchema,
  userIdSchema("delete"),
]);

serve(["POST"], async (req) => {
  const { profile, adminClient } = await requireUser(req, ["admin"]);
  const params = await readParams(req);
  const input = parse(schema, params);

  switch (input.action) {
    case "list":
      return json(await listUsers(adminClient, input));
    case "get":
      return json({ user: await getUser(adminClient, input.user_id) });
    case "create":
      return json({ user: await createUser(adminClient, profile.id, parse(createSchema, params)) }, 201);
    case "update":
      return json({ user: await updateUser(adminClient, profile.id, input) });
    case "delete":
      return json({ deleted: await deleteUser(adminClient, profile.id, input.user_id) });
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

/** Surveys, 1/14 forms and service records entered by the user (these block a permanent delete). */
async function recordCounts(admin: SupabaseClient, userId: string) {
  const count = async (table: string, column: string) => {
    const { count: n, error } = await admin.from(table).select("id", { count: "exact", head: true }).eq(column, userId);
    if (error) throw dbError(error);
    return n ?? 0;
  };
  const [forms, surveys, service_records] = await Promise.all([
    count("land_records", "created_by"), count("surveys", "collected_by"), count("service_records", "created_by"),
  ]);
  return { forms, surveys, service_records };
}

async function loadProfile(admin: SupabaseClient, userId: string) {
  const { data, error } = await admin
    .from("profiles")
    .select("id, full_name, mobile, role, status, supervisor_id, created_at, updated_at")
    .eq("id", userId)
    .eq("is_guest", false)
    .maybeSingle();
  if (error) throw dbError(error);
  if (!data) throw new HttpError(404, "not_found", "User not found");
  return data;
}

async function getUser(admin: SupabaseClient, userId: string) {
  const profile = await loadProfile(admin, userId);
  const [{ data: auth }, records] = await Promise.all([admin.auth.admin.getUserById(userId), recordCounts(admin, userId)]);
  return {
    ...profile,
    email: auth?.user?.email || null,
    phone: auth?.user?.phone ? `+${auth.user.phone.replace(/^\+/, "")}` : null,
    last_sign_in_at: auth?.user?.last_sign_in_at ?? null,
    records,
    can_delete: records.forms === 0 && records.surveys === 0 && records.service_records === 0,
  };
}

async function updateUser(admin: SupabaseClient, actorId: string, p: z.infer<typeof updateSchema>) {
  const { action: _action, user_id, email, phone: rawPhone, password, ...changes } = p;
  const phone = rawPhone?.replace(/^\+/, "");
  const signIn = { ...(email ? { email, email_confirm: true } : {}), ...(phone ? { phone, phone_confirm: true } : {}), ...(password ? { password } : {}) };
  if (phone) changes.mobile = phone;
  if (Object.keys(changes).length === 0 && Object.keys(signIn).length === 0) {
    throw new HttpError(422, "validation_error", "Nothing to update");
  }
  await loadProfile(admin, user_id);

  // Sign-in details first: a taken email/phone must not leave a half-applied edit.
  if (email || phone) {
    const { data: taken, error } = await admin.rpc("admin_sign_in_taken", { p_user_id: user_id, p_email: email ?? null, p_phone: phone ?? null });
    if (error) throw dbError(error);
    const fields: Record<string, string> = {};
    if (taken?.email) fields.email = "Already in use";
    if (taken?.phone) fields.phone = "Already in use";
    if (Object.keys(fields).length) {
      const what = fields.email && fields.phone ? "email and mobile number are" : fields.email ? "email is" : "mobile number is";
      throw new HttpError(409, "conflict", `That ${what} already used by another account`, { fields });
    }
  }
  if (Object.keys(signIn).length) {
    const { error: authError } = await admin.auth.admin.updateUserById(user_id, signIn);
    if (authError) {
      if (authError.status === 400 || authError.status === 422) {
        throw new HttpError(422, "validation_error", authError.message);
      }
      console.error("Auth update failed", authError);
      throw new HttpError(500, "internal_error", "Could not update sign-in details");
    }
  }

  let data;
  if (Object.keys(changes).length) {
    const res = await admin.rpc("admin_update_profile", { p_actor: actorId, p_user_id: user_id, p_changes: changes });
    if (res.error) throw dbError(res.error);
    data = res.data;
  } else {
    data = await loadProfile(admin, user_id);
  }

  if (Object.keys(signIn).length) {
    // Profile triggers audit name/role/status changes; sign-in changes are logged here (never the password itself).
    const changed = [email && "email", phone && "phone", password && "password"].filter(Boolean);
    const { error: auditError } = await admin.from("audit_logs").insert({
      user_id: actorId, action: "user_updated", entity_type: "user", entity_id: user_id, metadata: { sign_in_changed: changed },
    });
    if (auditError) console.error("Audit insert failed", auditError);
  }

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

async function deleteUser(admin: SupabaseClient, actorId: string, userId: string) {
  if (userId === actorId) throw new HttpError(409, "conflict", "You cannot delete your own account");
  const profile = await loadProfile(admin, userId);
  const records = await recordCounts(admin, userId);
  if (records.forms || records.surveys || records.service_records) {
    const what = [
      records.service_records && `${records.service_records} record${records.service_records === 1 ? "" : "s"}`,
      records.forms && `${records.forms} 1/14 form${records.forms === 1 ? "" : "s"}`,
      records.surveys && `${records.surveys} survey${records.surveys === 1 ? "" : "s"}`,
    ].filter(Boolean).join(" and ");
    throw new HttpError(409, "user_has_records", `${profile.full_name} entered ${what}, so the account can't be deleted. Deactivate it instead.`, { records });
  }

  // Deleting the auth user removes the profile (on delete cascade); other references are cleared (set null).
  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) {
    console.error("Auth delete failed", error);
    // A record entered between the check and the delete trips the restrict FKs.
    throw new HttpError(409, "user_has_records", "This account has records now, so it can't be deleted. Deactivate it instead.");
  }

  const { error: auditError } = await admin.from("audit_logs").insert({
    user_id: actorId, action: "user_deleted", entity_type: "user", entity_id: userId,
    metadata: { full_name: profile.full_name, role: profile.role, mobile: profile.mobile },
  });
  if (auditError) console.error("Audit insert failed", auditError);
  return { id: userId, full_name: profile.full_name };
}
