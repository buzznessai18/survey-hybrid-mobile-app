import type { Session } from "@supabase/supabase-js";
import { ApiError, FRIENDLY_MESSAGES, toApiError } from "@/services/api/errors";
import { supabase } from "@/services/supabase/client";
import type { Portal, Profile } from "@/types/api";
import { toE164 } from "@/utils/mobile";
import type { LoginValues } from "@/utils/validation";

export type AuthErrorKind =
  | "invalid_credentials"
  | "account_disabled"
  | "wrong_role"
  | "not_admin"
  | "use_admin_login"
  | "phone_login_disabled"
  | "network"
  | "rate_limited"
  | "unknown";

export class AuthError extends Error {
  constructor(public kind: AuthErrorKind, message: string) {
    super(message);
    this.name = "AuthError";
  }
}

const AUTH_MESSAGES: Record<AuthErrorKind, string> = {
  invalid_credentials: "Incorrect mobile number/email or password.",
  account_disabled: "Your account is disabled or not yet activated. Please contact your administrator.",
  wrong_role: "This account can't use the app. Please contact your administrator.",
  not_admin: "This account is not an admin. Choose \"User\" to sign in.",
  use_admin_login: "This is an admin account. Choose \"Admin\" to sign in.",
  phone_login_disabled:
    "Mobile number login is not enabled on the server yet. Please sign in with your email, or ask your administrator to enable phone login.",
  network: "No internet connection. Connect to the internet to sign in.",
  rate_limited: "Too many attempts. Please wait a minute and try again.",
  unknown: "We couldn't sign you in. Please try again.",
};

function authError(kind: AuthErrorKind) {
  return new AuthError(kind, AUTH_MESSAGES[kind]);
}

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
  /**
   * Password sign-in. Public signup is disabled on the backend (accounts are
   * created by admins), so there is no registration and no fake OTP.
   */
  async signIn(values: LoginValues): Promise<{ session: Session; profile: Profile }> {
    const credentials =
      values.method === "phone"
        ? { phone: toE164(values.identifier), password: values.password }
        : { email: values.identifier.trim().toLowerCase(), password: values.password };

    const { data, error } = await supabase.auth.signInWithPassword(credentials);
    if (error || !data.session) throw mapAuthError(error ?? {});

    try {
      const profile = await AuthService.loadProfile(data.session.user.id);
      AuthService.assertCanUseApp(profile, values.portal);
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
      .select("id, full_name, mobile, role, status, supervisor_id, is_guest")
      .eq("id", userId)
      .maybeSingle<Profile>();
    if (error) {
      const apiError = toApiError(error);
      throw apiError.isConnectivity ? authError("network") : apiError;
    }
    if (!data) throw authError("account_disabled");
    return data;
  },

  /**
   * Admins sign in through the Admin option, read-only users through User.
   * Without a portal (restoring a saved session) either role is accepted.
   */
  assertCanUseApp(profile: Profile, portal?: Portal) {
    if (profile.status !== "active") throw authError("account_disabled");
    if (profile.role !== "admin" && profile.role !== "user") throw authError("wrong_role");
    if (portal === "admin" && profile.role !== "admin") throw authError("not_admin");
    if (portal === "user" && profile.role !== "user") throw authError("use_admin_login");
  },

  async getSession(): Promise<Session | null> {
    const { data } = await supabase.auth.getSession();
    return data.session;
  },

  /** Local sign-out works offline; the refresh token is discarded on device. */
  async signOut(): Promise<void> {
    await supabase.auth.signOut({ scope: "local" });
  },

  onAuthStateChange(cb: (event: string, session: Session | null) => void) {
    const { data } = supabase.auth.onAuthStateChange((event, session) => cb(event, session));
    return () => data.subscription.unsubscribe();
  },
};

export function isSessionExpiredError(e: unknown): boolean {
  return e instanceof ApiError && e.kind === "unauthorized";
}

export { FRIENDLY_MESSAGES };
