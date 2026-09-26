/**
 * Centralised error model. Every service converts failures into ApiError so
 * screens only ever deal with `kind` + a friendly `message`.
 */
export type ApiErrorKind =
  | "network"
  | "timeout"
  | "unauthorized"
  | "account_inactive"
  | "forbidden"
  | "not_found"
  | "validation"
  | "conflict"
  | "rate_limited"
  | "server"
  | "unknown";

export class ApiError extends Error {
  constructor(
    public kind: ApiErrorKind,
    message: string,
    public status?: number,
    public code?: string,
    public fields?: Record<string, string>,
  ) {
    super(message);
    this.name = "ApiError";
  }

  /** Worth retrying automatically (connectivity / transient server issues). */
  get retryable(): boolean {
    return this.kind === "network" || this.kind === "timeout" || this.kind === "server" || this.kind === "rate_limited";
  }

  /** Caused by missing connectivity rather than the server. */
  get isConnectivity(): boolean {
    return this.kind === "network" || this.kind === "timeout";
  }
}

export const FRIENDLY_MESSAGES: Record<ApiErrorKind, string> = {
  network: "No internet connection. Please check your network and try again.",
  timeout: "The server took too long to respond. Please try again.",
  unauthorized: "Your session has expired. Please sign in again.",
  account_inactive: "Your account is not active. Please contact your administrator.",
  forbidden: "You don't have permission to do that.",
  not_found: "We couldn't find that record.",
  validation: "Some details need attention.",
  conflict: "This record conflicts with existing data.",
  rate_limited: "Too many requests. Please wait a moment and try again.",
  server: "Something went wrong on our side. Please try again shortly.",
  unknown: "Something went wrong. Please try again.",
};

export function kindForStatus(status: number, code?: string): ApiErrorKind {
  if (code === "account_inactive") return "account_inactive";
  if (status === 401) return "unauthorized";
  if (status === 403) return "forbidden";
  if (status === 404) return "not_found";
  if (status === 409) return "conflict";
  if (status === 400 || status === 422) return "validation";
  if (status === 429) return "rate_limited";
  if (status >= 500) return "server";
  return "unknown";
}

/** Backend messages for these kinds are written for end users; others get ours. */
const USE_SERVER_MESSAGE: ApiErrorKind[] = ["validation", "conflict", "forbidden", "account_inactive", "not_found"];

export function fromHttp(status: number, body: unknown): ApiError {
  const err = (body as { error?: { code?: string; message?: string; details?: { fields?: Record<string, string> } } })?.error;
  const kind = kindForStatus(status, err?.code);
  const message = USE_SERVER_MESSAGE.includes(kind) && err?.message ? err.message : FRIENDLY_MESSAGES[kind];
  return new ApiError(kind, message, status, err?.code, err?.details?.fields);
}

export function toApiError(e: unknown): ApiError {
  if (e instanceof ApiError) return e;
  const message = e instanceof Error ? e.message : String(e);
  if (/abort|timed? ?out/i.test(message)) return new ApiError("timeout", FRIENDLY_MESSAGES.timeout);
  if (/network|fetch|failed to send|connection/i.test(message)) return new ApiError("network", FRIENDLY_MESSAGES.network);
  return new ApiError("unknown", FRIENDLY_MESSAGES.unknown);
}

/** Friendly text for anything thrown. */
export function errorMessage(e: unknown): string {
  return toApiError(e).message;
}
