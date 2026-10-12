import type { Session } from "@supabase/supabase-js";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { AuthError, AuthService, canUseApp } from "@/services/auth/AuthService";
import type { Profile } from "@/types/api";
import type { LoginValues } from "@/utils/validation";
import { persistStorage } from "./storage";

export type AuthStatus = "initializing" | "signedOut" | "signedIn";

interface AuthState {
  status: AuthStatus;
  session: Session | null;
  profile: Profile | null;
  /** Shown on the login screen after an involuntary sign-out. */
  notice: string | null;
  initialize: () => Promise<void>;
  signIn: (values: LoginValues) => Promise<void>;
  signOut: (notice?: string) => Promise<void>;
  refreshProfile: () => Promise<void>;
  clearNotice: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      status: "initializing",
      session: null,
      profile: null,
      notice: null,

      /**
       * Restore the persisted session. Offline we keep the cached profile so the
       * surveyor can keep collecting; the backend re-checks on every request.
       */
      async initialize() {
        const session = await AuthService.getSession();
        if (!session) {
          set({ status: "signedOut", session: null, profile: null });
          return;
        }
        const cached = get().profile;
        try {
          const profile = await AuthService.loadProfile(session.user.id);
          AuthService.assertCanUseApp(profile);
          set({ status: "signedIn", session, profile });
        } catch (e) {
          if (e instanceof AuthError && e.kind === "network") {
            set({ status: "signedIn", session, profile: cached ?? offlineProfile(session) });
            return;
          }
          await AuthService.signOut();
          set({
            status: "signedOut",
            session: null,
            profile: null,
            notice: e instanceof AuthError ? e.message : "Please sign in again.",
          });
        }
      },

      async signIn(values) {
        const { session, profile } = await AuthService.signIn(values);
        set({ status: "signedIn", session, profile, notice: null });
      },



      async signOut(notice) {
        // Update state first so the SIGNED_OUT listener doesn't treat this as an expiry.
        set({ status: "signedOut", session: null, profile: null, notice: notice ?? null });
        await AuthService.signOut();
      },

      async refreshProfile() {
        const session = get().session;
        if (!session) return;
        try {
          const profile = await AuthService.loadProfile(session.user.id);
          if (profile.status !== "active" || !canUseApp(profile.role)) {
            await get().signOut("Your account is no longer active. Please contact your administrator.");
            return;
          }
          set({ profile });
        } catch {
          /* keep cached profile when offline */
        }
      },

      clearNotice: () => set({ notice: null }),
    }),
    {
      name: "auth-profile",
      storage: persistStorage,
      // Only the profile is cached (for offline starts). The session itself is
      // persisted by supabase-js; status is always re-derived on launch.
      partialize: (s) => ({ profile: s.profile }),
    },
  ),
);

/** Minimal profile when the app starts offline with a valid stored session. */
function offlineProfile(session: Session): Profile {
  const meta = session.user.user_metadata as { full_name?: string } | undefined;
  return {
    id: session.user.id,
    full_name: meta?.full_name ?? "User",
    mobile: session.user.phone ? session.user.phone : null,
    // Least privilege until the real profile can be loaded (can't reach admin screens offline).
    role: "field_surveyor",
    status: "active",
    supervisor_id: null,
  };
}

/** Keep the store in sync with Supabase session events (refresh, expiry). */
export function startAuthListener(): () => void {
  return AuthService.onAuthStateChange((event, session) => {
    const state = useAuthStore.getState();
    if (event === "SIGNED_OUT" && state.status === "signedIn") {
      useAuthStore.setState({
        status: "signedOut",
        session: null,
        profile: null,
        notice: state.notice ?? "Your session has expired. Please sign in again.",
      });
    } else if ((event === "TOKEN_REFRESHED" || event === "USER_UPDATED") && session) {
      useAuthStore.setState({ session });
    }
  });
}

/** True when the signed-in account is an admin (also manages users and sees the dashboard, reports and audit history). */
export const useIsAdmin = () => useAuthStore((s) => s.profile?.role === "admin");

/** Admins and company users add and edit records; the legacy field_surveyor role is read-only. */
export const canEditRecords = (role: string | null | undefined) => role === "admin" || role === "user";
export const useCanEditRecords = () => useAuthStore((s) => canEditRecords(s.profile?.role));
