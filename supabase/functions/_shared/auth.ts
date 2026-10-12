import { createClient, type SupabaseClient, type User } from "jsr:@supabase/supabase-js@2";
import { config } from "./config.ts";
import { HttpError } from "./http.ts";

export type Role = "field_surveyor" | "supervisor" | "admin" | "user";

export interface Profile {
  id: string;
  full_name: string;
  mobile: string | null;
  role: Role;
  status: "pending" | "active" | "inactive";
  supervisor_id: string | null;
}

export interface AuthContext {
  user: User;
  profile: Profile;
  /** Acts as the caller: every query is filtered by RLS. Use for reads. */
  userClient: SupabaseClient;
  /** Service role: bypasses RLS. Use only after authorization checks. */
  adminClient: SupabaseClient;
}

const clientOptions = { auth: { persistSession: false, autoRefreshToken: false } };

export function createAdminClient(): SupabaseClient {
  return createClient(config.supabaseUrl, config.serviceRoleKey, clientOptions);
}

/**
 * Authenticate the caller from the Authorization header, load their profile
 * and enforce that they are active and (optionally) hold one of `roles`.
 * Roles are always read from the database, never from the JWT or metadata.
 */
export async function requireUser(req: Request, roles?: Role[]): Promise<AuthContext> {
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) {
    throw new HttpError(401, "unauthorized", "Missing bearer token");
  }

  const userClient = createClient(config.supabaseUrl, config.anonKey, {
    ...clientOptions,
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  const { data, error } = await userClient.auth.getUser(token);
  if (error || !data?.user) {
    throw new HttpError(401, "unauthorized", "Invalid or expired session");
  }

  const adminClient = createAdminClient();
  const { data: profile, error: profileError } = await adminClient
    .from("profiles")
    .select("id, full_name, mobile, role, status, supervisor_id")
    .eq("id", data.user.id)
    .maybeSingle<Profile>();

  if (profileError) {
    console.error("Profile lookup failed", profileError);
    throw new HttpError(500, "internal_error", "Could not load user profile");
  }
  if (!profile || profile.status !== "active") {
    throw new HttpError(403, "account_inactive", "Your account is not active. Contact an administrator.");
  }
  if (roles && !roles.includes(profile.role)) {
    throw new HttpError(403, "forbidden", "You do not have permission to perform this action");
  }

  return { user: data.user, profile, userClient, adminClient };
}

export interface ViewerContext {
  profile: Profile;
  isGuest: boolean;
  /**
   * Client used for reads. Read-only viewers (the `user` role and no-login
   * guests) have NO direct table access (migration 014); their reads are
   * served here with the service role, and callers must only return the
   * limited, masked fields they intend to expose. Everyone else reads through
   * their own RLS-scoped client.
   */
  readClient: SupabaseClient;
  adminClient: SupabaseClient;
}

/**
 * For read endpoints: any signed-in, active user. (No-login guest access was
 * removed in 015 — every request needs a user session again.)
 */
export async function requireViewer(req: Request): Promise<ViewerContext> {
  const ctx = await requireUser(req);
  const viewerOnly = ctx.profile.role === "user";
  return { profile: ctx.profile, isGuest: false, readClient: viewerOnly ? ctx.adminClient : ctx.userClient, adminClient: ctx.adminClient };
}
