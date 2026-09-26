// Central configuration for all Edge Functions.
// SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY are injected
// automatically by the Supabase runtime. The rest are optional secrets.

function required(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing environment variable ${name}`);
  return value;
}

function intEnv(name: string, fallback: number): number {
  const raw = Deno.env.get(name);
  const n = raw ? Number.parseInt(raw, 10) : NaN;
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export const config = {
  supabaseUrl: required("SUPABASE_URL"),
  anonKey: required("SUPABASE_ANON_KEY"),
  serviceRoleKey: required("SUPABASE_SERVICE_ROLE_KEY"),

  photoBucket: Deno.env.get("PHOTO_BUCKET") ?? "field-photos",
  signedUrlTtlSeconds: intEnv("SIGNED_URL_TTL_SECONDS", 3600),

  // Accepted farmer mobile format AFTER normalisation (see normalizeMobile).
  // Default: Indian 10-digit mobile numbers.
  mobileRegex: new RegExp(Deno.env.get("MOBILE_REGEX") ?? "^[6-9]\\d{9}$"),
  // Country calling code stripped from numbers entered as +91XXXXXXXXXX.
  mobileCountryCode: Deno.env.get("MOBILE_COUNTRY_CODE") ?? "91",

  maxPageSize: 100,
  defaultPageSize: 20,
  maxExportRows: intEnv("MAX_EXPORT_ROWS", 10000),
  mapDefaultLimit: 500,
  mapMaxLimit: 5000,
};
