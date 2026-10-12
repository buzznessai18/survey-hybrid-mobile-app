/**
 * Public runtime configuration. Only EXPO_PUBLIC_* variables are available to
 * the bundle, and only public values (URL + anon/publishable key) belong here.
 */
const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? "";
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? "";

export const env = {
  supabaseUrl,
  supabaseAnonKey,
  defaultCountryCode: process.env.EXPO_PUBLIC_DEFAULT_COUNTRY_CODE ?? "91",
  /** Heading printed on farmer receipts (organisation name). */
  receiptOrgName: process.env.EXPO_PUBLIC_RECEIPT_ORG_NAME || "Field Survey",
  /** Optional second line under the heading (address / phone). */
  receiptOrgSubtitle: process.env.EXPO_PUBLIC_RECEIPT_ORG_SUBTITLE ?? "",
  isConfigured: supabaseUrl.length > 0 && supabaseAnonKey.length > 0,
};

/** Tunables that mirror or complement backend rules. */
export const appConfig = {
  /** Must match the backend bucket (supabase/migrations/010_storage.sql). */
  photoBucket: "field-photos",
  photoFileName: "field-photo.jpg",
  photoMaxDimension: 1600,
  photoJpegQuality: 0.72,

  /** GPS quality thresholds in metres. */
  gpsGoodAccuracy: 10,
  gpsAcceptableAccuracy: 30,
  /** Above this we refuse the fix entirely. */
  gpsMaxAccuracy: 100,
  gpsTimeoutMs: 25_000,

  functionTimeoutMs: 20_000,
  duplicateCheckDebounceMs: 700,
  pageSize: 20,
  mapPointLimit: 500,

  /** Sync back-off for server errors (ms). */
  syncBaseDelayMs: 30_000,
  syncMaxDelayMs: 30 * 60_000,
  syncMaxServerRetries: 5,
  /** Synced records kept locally for the Offline Data history. */
  syncedHistoryLimit: 50,
};
