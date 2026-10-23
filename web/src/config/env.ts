/**
 * Public runtime configuration. Only VITE_* variables reach the bundle, and only
 * public values (URL + anon/publishable key) belong here. Same Supabase project
 * as the mobile app.
 */
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL ?? "";
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY ?? "";

export const env = {
  supabaseUrl,
  supabaseAnonKey,
  defaultCountryCode: import.meta.env.VITE_DEFAULT_COUNTRY_CODE ?? "91",
  /** Heading printed on farmer receipts (organisation name). */
  receiptOrgName: import.meta.env.VITE_RECEIPT_ORG_NAME || "Field Survey",
  /** Optional second line under the heading (address / phone). */
  receiptOrgSubtitle: import.meta.env.VITE_RECEIPT_ORG_SUBTITLE ?? "",
  isConfigured: supabaseUrl.length > 0 && supabaseAnonKey.length > 0,
};

export const appConfig = {
  functionTimeoutMs: 20_000,
  pageSize: 20,
};
