import type { Session } from "@supabase/supabase-js";
import { toApiError } from "@/lib/errors";
import { toE164 } from "@/lib/mobile";
import type { Profile } from "@/lib/types";
import type { LoginValues } from "@/lib/validation";
import { supabase } from "./supabase";

/** Roles that can sign in: admin (full access), company users (records) and the legacy read-only field_surveyor. */
export const canUseApp = (role: Profile["role"]) => role === "admin" || role === "user" || role === "field_surveyor";
/** Admins and company users add records; the legacy field_surveyor role is read-only. */
export const canEditRecords = (role: string | null | undefined) => role === "admin" || role === "user";

export type AuthErrorKind = "invalid_credentials" | "account_disabled" | "wrong_role" | "phone_login_disabled" | "network" | "rate_limited" | "unknown";

export class AuthError extends Error {
  constructor(public kind: AuthErrorKind, message: string) {
    super(message);
    this.name = "AuthError";
  }
}

const AUTH_MESSAGES: Record<AuthErrorKind, string> = {
  invalid_credentials: "Incorrect mobile number/email or password.",
  account_disabled: "Your account is disabled or not yet activated. Please contact your administrator.",
  wrong_role: "This account can't use Field Survey. Please contact your administrator.",
  phone_login_disabled:
    "Mobile number login is not enabled on the server yet. Sign in with your email, or ask your administrator to enable phone login.",
  network: "No internet connection. Connect to the internet to sign in.",
  rate_limited: "Too many attempts. Wait a minute and try again.",
  unknown: "We couldn't sign you in. Please try again.",
};

const authError = (kind: AuthErrorKind) => new AuthError(kind, AUTH_MESSAGES[kind]);

/** Map Supabase Auth error codes (auth-js ErrorCode) to our kinds. */
function mapAuthError(error: { code?: string; status?: number; message?: string; name?: string }): AuthError {
  switch (error.code) {
    case "invalid_credentials":
    case "phone_not_confirmed":
    case "email_not_confirmed":
      return authError("invalid_credentials");
    case "user_banned":
      return authError("account_disabled");
    case "phone_provider_disabled":
    case "email_provider_disabled":
      return authError("phone_login_disabled");
    case "over_request_rate_limit":
      return authError("rate_limited");
  }
  if (error.name === "AuthRetryableFetchError" || error.status === 0) return authError("network");
  if (error.status === 400) return authError("invalid_credentials");
  return authError(toApiError(error).isConnectivity ? "network" : "unknown");
}

export const AuthService = {
  /** Password sign-in. Public signup is disabled on the backend; admins create accounts. */
  async signIn(values: LoginValues): Promise<{ session: Session; profile: Profile }> {
    const credentials =
      values.method === "phone"
        ? { phone: toE164(values.identifier), password: values.password }
        : { email: values.identifier.trim().toLowerCase(), password: values.password };

    const { data, error } = await supabase.auth.signInWithPassword(credentials);
    if (error || !data.session) throw mapAuthError(error ?? {});

    try {
      const profile = await AuthService.loadProfile(data.session.user.id);
      AuthService.assertCanUseApp(profile);
      return { session: data.session, profile };
    } catch (e) {
      await supabase.auth.signOut({ scope: "local" });
      throw e;
    }
  },

  /** Roles and status always come from the database, never from the client. */
  async loadProfile(userId: string): Promise<Profile> {
    const { data, error } = await supabase
      .from("profiles")
      .select("id, full_name, mobile, role, status, supervisor_id")
      .eq("id", userId)
      .maybeSingle<Profile>();
    if (error) {
      const apiError = toApiError(error);
      throw apiError.isConnectivity ? authError("network") : apiError;
    }
    if (!data) throw authError("account_disabled");
    return data;
  },

  assertCanUseApp(profile: Profile) {
    if (profile.status !== "active") throw authError("account_disabled");
    if (!canUseApp(profile.role)) throw authError("wrong_role");
  },

  async getSession(): Promise<Session | null> {
    const { data } = await supabase.auth.getSession();
    return data.session;
  },

  async signOut(): Promise<void> {
    await supabase.auth.signOut({ scope: "local" });
  },
};
