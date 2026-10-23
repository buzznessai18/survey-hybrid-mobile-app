import type { Session } from "@supabase/supabase-js";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { env } from "@/config/env";
import type { Profile } from "@/lib/types";
import type { LoginValues } from "@/lib/validation";
import { AuthError, AuthService, canEditRecords, canUseApp } from "@/services/auth";
import { supabase } from "@/services/supabase";

export type AuthStatus = "initializing" | "signedOut" | "signedIn";

interface AuthState {
  status: AuthStatus;
  session: Session | null;
  profile: Profile | null;
  /** Shown on the sign-in page after an involuntary sign-out. */
  notice: string | null;
  signIn: (values: LoginValues) => Promise<void>;
  signOut: (notice?: string) => Promise<void>;
  clearNotice: () => void;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>(env.isConfigured ? "initializing" : "signedOut");
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const statusRef = useRef(status);
  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  const signOut = useCallback(async (msg?: string) => {
    // Update state first so the SIGNED_OUT listener doesn't treat this as an expiry.
    statusRef.current = "signedOut";
    setStatus("signedOut");
    setSession(null);
    setProfile(null);
    setNotice(msg ?? null);
    await AuthService.signOut();
  }, []);

  // Restore the stored session and re-check the profile (role and status come from the database).
  useEffect(() => {
    if (!env.isConfigured) return;
    let cancelled = false;
    (async () => {
      const s = await AuthService.getSession();
      if (cancelled) return;
      if (!s) return setStatus("signedOut");
      try {
        const p = await AuthService.loadProfile(s.user.id);
        AuthService.assertCanUseApp(p);
        if (cancelled) return;
        setSession(s);
        setProfile(p);
        setStatus("signedIn");
      } catch (e) {
        if (cancelled) return;
        await AuthService.signOut();
        setNotice(e instanceof AuthError ? e.message : "Please sign in again.");
        setStatus("signedOut");
      }
    })();

    const { data } = supabase.auth.onAuthStateChange((event, s) => {
      if (event === "SIGNED_OUT" && statusRef.current === "signedIn") {
        setStatus("signedOut");
        setSession(null);
        setProfile(null);
        setNotice((n) => n ?? "Your session has expired. Please sign in again.");
      } else if ((event === "TOKEN_REFRESHED" || event === "USER_UPDATED") && s) {
        setSession(s);
      }
    });
    return () => {
      cancelled = true;
      data.subscription.unsubscribe();
    };
  }, []);

  // Pick up role / status changes made by an admin when the tab regains focus.
  useEffect(() => {
    if (status !== "signedIn" || !session) return;
    const refresh = async () => {
      try {
        const p = await AuthService.loadProfile(session.user.id);
        if (p.status !== "active" || !canUseApp(p.role)) {
          await signOut("Your account is no longer active. Please contact your administrator.");
          return;
        }
        setProfile(p);
      } catch {
        /* keep the current profile on a network blip */
      }
    };
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, [status, session, signOut]);

  const signIn = useCallback(async (values: LoginValues) => {
    const res = await AuthService.signIn(values);
    setSession(res.session);
    setProfile(res.profile);
    setNotice(null);
    setStatus("signedIn");
  }, []);

  const value = useMemo<AuthState>(
    () => ({ status, session, profile, notice, signIn, signOut, clearNotice: () => setNotice(null) }),
    [status, session, profile, notice, signIn, signOut],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside <AuthProvider>");
  return ctx;
}

export const useIsAdmin = () => useAuth().profile?.role === "admin";
export const useCanEditRecords = () => canEditRecords(useAuth().profile?.role);
