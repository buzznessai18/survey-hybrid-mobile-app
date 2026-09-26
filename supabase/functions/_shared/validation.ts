import { z } from "npm:zod@3.23.8";
import { config } from "./config.ts";
import { HttpError } from "./http.ts";

export { z };

export const AREA_UNITS = ["acre", "hectare", "guntha", "cent", "bigha", "sq_m"] as const;
export const DUPLICATE_REASONS = [
  "different_farmer",
  "different_portion_of_land",
  "previous_data_incorrect",
  "previous_survey_unavailable",
  "other",
] as const;
export const DUPLICATE_STATUSES = [
  "unique",
  "duplicate",
  "possible_duplicate",
  "needs_verification",
  "confirmed_duplicate",
  "not_duplicate",
] as const;
export const SUBMISSION_STATUSES = ["pending", "approved", "rejected"] as const;
export const REVIEW_STATUSES = ["pending", "confirmed_duplicate", "not_duplicate", "needs_verification"] as const;

/** Parse with a zod schema, converting failures into a 422 with field errors. */
export function parse<T extends z.ZodTypeAny>(schema: T, input: unknown): z.infer<T> {
  const result = schema.safeParse(input);
  if (!result.success) {
    const fields: Record<string, string> = {};
    for (const issue of result.error.issues) {
      const key = issue.path.join(".") || "_";
      fields[key] ??= issue.message;
    }
    throw new HttpError(422, "validation_error", "Invalid request", { fields });
  }
  return result.data;
}

/** "+91 98765-43210" -> "9876543210" */
export function normalizeMobile(raw: string): string {
  let digits = raw.replace(/[\s\-().]/g, "");
  if (digits.startsWith("+")) digits = digits.slice(1);
  const cc = config.mobileCountryCode;
  if (cc && digits.startsWith(cc) && digits.length === cc.length + 10) digits = digits.slice(cc.length);
  if (digits.length === 11 && digits.startsWith("0")) digits = digits.slice(1);
  return digits;
}

/** Same canonical form as private.normalize_code() in the database. */
export function normalizeCode(raw: string): string {
  return raw.replace(/\s+/g, "").toUpperCase();
}

const emptyToNull = (v: unknown) => (typeof v === "string" && v.trim() === "" ? null : v);

export const uuid = z.string().uuid("Must be a valid UUID");

export const mobile = z
  .string({ required_error: "Mobile number is required" })
  .transform(normalizeMobile)
  .refine((v) => config.mobileRegex.test(v), "Enter a valid mobile number");

export const requiredText = (label: string, max: number) =>
  z
    .string({ required_error: `${label} is required`, invalid_type_error: `${label} must be text` })
    .trim()
    .min(1, `${label} is required`)
    .max(max, `${label} must be at most ${max} characters`);

export const optionalText = (max: number) =>
  z.preprocess(emptyToNull, z.string().trim().max(max, `Must be at most ${max} characters`).nullable().optional());

/** YYYY-MM-DD, a real calendar date. */
export const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD")
  .refine((v) => !Number.isNaN(Date.parse(`${v}T00:00:00Z`)) && new Date(`${v}T00:00:00Z`).toISOString().startsWith(v), "Invalid date");

export const visitDate = isoDate
  .refine((v) => v >= "2000-01-01", "Visit date is too far in the past")
  .refine((v) => {
    // Allow +1 day to tolerate device/server timezone differences.
    const tomorrow = new Date(Date.now() + 24 * 3600 * 1000).toISOString().slice(0, 10);
    return v <= tomorrow;
  }, "Visit date cannot be in the future");

/** Number that may arrive as a JSON number or a numeric string; null/"" count as missing. */
const numberField = (label: string) =>
  z.preprocess(
    (v) => (v === null || v === "" ? undefined : typeof v === "string" ? Number(v) : v),
    z.number({ required_error: `${label} is required`, invalid_type_error: `${label} must be a number` })
      .finite(`${label} must be a number`),
  );

export const latitude = numberField("Latitude").pipe(
  z.number().min(-90, "Latitude must be between -90 and 90").max(90, "Latitude must be between -90 and 90"),
);

export const longitude = numberField("Longitude").pipe(
  z.number().min(-180, "Longitude must be between -180 and 180").max(180, "Longitude must be between -180 and 180"),
);

export const gpsAccuracy = numberField("GPS accuracy").pipe(
  z.number().min(0, "GPS accuracy must be >= 0").max(100000, "GPS accuracy is not plausible"),
);

export const area = numberField("Area").pipe(
  z.number().gt(0, "Area must be greater than 0").max(1_000_000, "Area is not plausible"),
);

export const surveyNumber = requiredText("Survey number", 50);
export const subDivision = optionalText(50);

export const farmer = z.object({
  id: uuid.optional(),
  name: requiredText("Farmer name", 150),
  mobile,
});

/** Fields shared by create-survey and update-survey. */
export const surveyFields = {
  farmer,
  crop_id: uuid,
  area,
  area_unit: z.enum(AREA_UNITS, { errorMap: () => ({ message: `Area unit must be one of ${AREA_UNITS.join(", ")}` }) }),
  survey_number: surveyNumber,
  sub_division: subDivision,
  visit_date: visitDate,
  latitude,
  longitude,
  gps_accuracy: gpsAccuracy,
  photo_path: z.preprocess(emptyToNull, z.string().max(300).nullable().optional()),
  duplicate_reason: z.preprocess(emptyToNull, z.enum(DUPLICATE_REASONS).nullable().optional()),
  duplicate_reason_notes: optionalText(1000),
  notes: optionalText(2000),
};

export const pagination = {
  page: z.coerce.number().int().min(1).default(1),
  page_size: z.coerce.number().int().min(1).max(config.maxPageSize).default(config.defaultPageSize),
};

/** Accepts a single value, an array, or a comma-separated string. */
export function listOf<T extends [string, ...string[]]>(values: T) {
  return z.preprocess(
    (v) => (typeof v === "string" ? v.split(",").map((s) => s.trim()).filter(Boolean) : v),
    z.array(z.enum(values)).min(1).optional(),
  );
}

/** Make free text safe to embed in a PostgREST ilike / or() filter. */
export function likePattern(term: string): string {
  const cleaned = term.replace(/[,()*\\%_:"]/g, " ").trim();
  return `%${cleaned}%`;
}

export function rangeFor(page: number, pageSize: number): [number, number] {
  const from = (page - 1) * pageSize;
  return [from, from + pageSize - 1];
}

export function paginationMeta(page: number, pageSize: number, total: number | null) {
  const t = total ?? 0;
  return { page, page_size: pageSize, total: t, total_pages: Math.max(1, Math.ceil(t / pageSize)) };
}
