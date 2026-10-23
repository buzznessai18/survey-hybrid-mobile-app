import { createClient } from "@supabase/supabase-js";
import { env } from "@/config/env";

/**
 * The only Supabase client in the web app. Uses the PUBLIC url + anon key (the
 * same project as the mobile app); all access control is enforced server side
 * (RLS + Edge Function role checks). The session lives in localStorage.
 */
export const supabase = createClient(env.supabaseUrl || "http://localhost:54321", env.supabaseAnonKey || "missing-anon-key", {
  auth: { autoRefreshToken: true, persistSession: true, detectSessionInUrl: false },
});
