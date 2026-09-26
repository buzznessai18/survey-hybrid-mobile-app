import { corsHeaders } from "./cors.ts";

export class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

export function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", ...headers },
  });
}

// Map Postgres / PostgREST errors to HTTP errors without leaking internals.
const SQLSTATE_TO_HTTP: Record<string, [number, string]> = {
  SV403: [403, "forbidden"],
  SV404: [404, "not_found"],
  SV409: [409, "conflict"],
  SV422: [422, "validation_error"],
  "42501": [403, "forbidden"],
  "23514": [422, "validation_error"], // check_violation
  "23503": [422, "validation_error"], // foreign_key_violation
  "23502": [422, "validation_error"], // not_null_violation
  "22P02": [422, "validation_error"], // invalid_text_representation
  "22007": [422, "validation_error"], // invalid_datetime_format
  "22008": [422, "validation_error"], // datetime_field_overflow
  "22003": [422, "validation_error"], // numeric_value_out_of_range
  "23505": [409, "conflict"], // unique_violation
};

export function dbError(error: { code?: string; message?: string }): HttpError {
  const mapped = error.code ? SQLSTATE_TO_HTTP[error.code] : undefined;
  if (mapped) {
    // Custom SV* errors carry user-facing messages; others get a generic one.
    const message = error.code?.startsWith("SV") || error.code === "42501"
      ? error.message ?? "Request failed"
      : "The submitted data violates a database constraint";
    return new HttpError(mapped[0], mapped[1], message);
  }
  console.error("Database error", error);
  return new HttpError(500, "internal_error", "Unexpected database error");
}

export function errorResponse(err: unknown): Response {
  if (err instanceof HttpError) {
    return json({ error: { code: err.code, message: err.message, details: err.details } }, err.status);
  }
  console.error("Unhandled error", err);
  return json({ error: { code: "internal_error", message: "Unexpected server error" } }, 500);
}

/**
 * Read request parameters: JSON body for POST, query string for GET.
 * Query-string values are strings; zod schemas coerce them.
 */
export async function readParams(req: Request): Promise<Record<string, unknown>> {
  if (req.method === "GET") {
    const params: Record<string, unknown> = {};
    for (const [key, value] of new URL(req.url).searchParams) {
      if (key in params) {
        const prev = params[key];
        params[key] = Array.isArray(prev) ? [...prev, value] : [prev, value];
      } else {
        params[key] = value;
      }
    }
    return params;
  }
  const text = await req.text();
  if (!text.trim()) return {};
  try {
    const body = JSON.parse(text);
    if (body === null || typeof body !== "object" || Array.isArray(body)) {
      throw new Error("not an object");
    }
    return body as Record<string, unknown>;
  } catch {
    throw new HttpError(400, "invalid_json", "Request body must be a JSON object");
  }
}

/** Standard entry point: CORS preflight, method check and error handling. */
export function serve(
  methods: string[],
  handler: (req: Request) => Promise<Response>,
): void {
  Deno.serve(async (req) => {
    if (req.method === "OPTIONS") {
      return new Response("ok", { headers: corsHeaders });
    }
    if (!methods.includes(req.method)) {
      return json({ error: { code: "method_not_allowed", message: `Use ${methods.join(" or ")}` } }, 405);
    }
    try {
      return await handler(req);
    } catch (err) {
      return errorResponse(err);
    }
  });
}
