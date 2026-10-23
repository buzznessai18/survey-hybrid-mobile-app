import { FunctionsFetchError, FunctionsHttpError, FunctionsRelayError } from "@supabase/supabase-js";
import { appConfig } from "@/config/env";
import { ApiError, FRIENDLY_MESSAGES, fromHttp, toApiError } from "@/lib/errors";
import { supabase } from "./supabase";

/** Edge Functions the web app calls (see supabase/functions/). */
export type FunctionName = "service-records" | "admin-users" | "audit-logs" | "export-data";

/** POST a JSON body to an Edge Function with the signed-in user's JWT. */
export async function callFunction<T>(name: FunctionName, body: object, options: { timeoutMs?: number } = {}): Promise<{ data: T; status: number }> {
  const { data: sessionData } = await supabase.auth.getSession();
  if (!sessionData.session) throw new ApiError("unauthorized", FRIENDLY_MESSAGES.unauthorized, 401);

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
