import { FunctionsFetchError, FunctionsHttpError, FunctionsRelayError } from "@supabase/supabase-js";
import { appConfig } from "@/config/env";
import { supabase } from "@/services/supabase/client";
import { ApiError, FRIENDLY_MESSAGES, fromHttp, toApiError } from "./errors";

/** Edge Functions this app is allowed to call (see supabase/functions/). */
export type FunctionName =
  | "check-survey-duplicate"
  | "create-survey"
  | "update-survey"
  | "get-my-surveys"
  | "get-survey"
  | "get-survey-map-data"
  | "get-reports"
  | "search-surveys"
  | "admin-users";

/** Read-only endpoints that also serve no-login guests (public anon key only). */
const GUEST_FUNCTIONS: FunctionName[] = ["search-surveys", "get-survey", "get-survey-map-data", "get-reports"];

/**
 * POST a JSON body to an Edge Function with the signed-in user's JWT, or —
 * for guest-readable endpoints without a session — with the public anon key.
 * All survey functions accept POST (GET-capable ones read the same params).
 */
export async function callFunction<T>(
  name: FunctionName,
  body: object,
  options: { timeoutMs?: number } = {},
): Promise<{ data: T; status: number }> {
  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData.session && !GUEST_FUNCTIONS.includes(name)) {
    throw new ApiError("unauthorized", FRIENDLY_MESSAGES.unauthorized, 401);
  }

  const { data, error, response } = await supabase.functions.invoke<T>(name, {
    body,
    method: "POST",
    timeout: options.timeoutMs ?? appConfig.functionTimeoutMs,
  });

  if (error) throw await normalizeFunctionError(error);
  return { data: data as T, status: response?.status ?? 200 };
}

async function normalizeFunctionError(error: unknown): Promise<ApiError> {
  if (error instanceof FunctionsHttpError) {
    const res = error.context as Response;
    let body: unknown = null;
    try {
      body = await res.json();
    } catch {
      /* non-JSON error body */
    }
    return fromHttp(res.status, body);
  }
  if (error instanceof FunctionsRelayError) return new ApiError("server", FRIENDLY_MESSAGES.server);
  if (error instanceof FunctionsFetchError) {
    const cause = (error as { context?: unknown }).context;
    const text = cause instanceof Error ? `${cause.name} ${cause.message}` : String(cause ?? "");
    if (/abort|timeout/i.test(text)) return new ApiError("timeout", FRIENDLY_MESSAGES.timeout);
    return new ApiError("network", FRIENDLY_MESSAGES.network);
  }
  return toApiError(error);
}
