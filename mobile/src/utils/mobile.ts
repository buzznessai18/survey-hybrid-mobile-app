import { env } from "@/config/env";

/**
 * Same normalisation as the backend (supabase/functions/_shared/validation.ts
 * normalizeMobile): "+91 98765-43210" -> "9876543210".
 */
export function normalizeMobile(raw: string, countryCode = env.defaultCountryCode): string {
  let digits = raw.replace(/[\s\-().]/g, "");
  if (digits.startsWith("+")) digits = digits.slice(1);
  if (countryCode && digits.startsWith(countryCode) && digits.length === countryCode.length + 10) {
    digits = digits.slice(countryCode.length);
  }
  if (digits.length === 11 && digits.startsWith("0")) digits = digits.slice(1);
  return digits;
}

/** Backend default MOBILE_REGEX (Indian 10-digit mobile numbers). */
export const MOBILE_REGEX = /^[6-9]\d{9}$/;

export function isValidMobile(raw: string): boolean {
  return MOBILE_REGEX.test(normalizeMobile(raw));
}

/** 10-digit national number -> E.164 for Supabase phone auth (+919876543210). */
export function toE164(raw: string, countryCode = env.defaultCountryCode): string {
  const national = normalizeMobile(raw, countryCode);
  return `+${countryCode}${national}`;
}

/** Same canonical form as private.normalize_code() in the database. */
export function normalizeCode(raw: string): string {
  return raw.replace(/\s+/g, "").toUpperCase();
}
