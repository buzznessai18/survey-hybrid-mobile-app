import { z } from "zod";
import { isValidMobile } from "./mobile";

/**
 * Client-side validation mirroring mobile/src/utils/validation.ts and
 * supabase/functions/_shared/validation.ts. The backend re-validates everything.
 */

const required = (label: string, max: number) =>
  z.string().trim().min(1, `${label} is required`).max(max, `${label} must be at most ${max} characters`);

export const loginSchema = z.discriminatedUnion("method", [
  z.object({
    method: z.literal("phone"),
    identifier: z.string().trim().refine(isValidMobile, "Enter your 10-digit mobile number"),
    password: z.string().min(1, "Enter your password"),
  }),
  z.object({
    method: z.literal("email"),
    identifier: z.string().trim().email("Enter a valid email address"),
    password: z.string().min(1, "Enter your password"),
  }),
]);

export type LoginValues = z.infer<typeof loginSchema>;

const userMobile = z.string().trim().refine((v) => v === "" || isValidMobile(v), "Enter a valid 10-digit mobile number");
const userEmail = z.string().trim().refine((v) => v === "" || z.string().email().safeParse(v).success, "Enter a valid email address");

/** Admin "Add user" form. At least one login (mobile or email) is required. */
export const newUserSchema = z
  .object({
    fullName: required("Full name", 150),
    role: z.enum(["admin", "user"]),
    mobile: userMobile,
    email: userEmail,
    password: z.string().min(8, "At least 8 characters").max(72, "At most 72 characters"),
  })
  .refine((v) => v.mobile !== "" || v.email !== "", { message: "Enter a mobile number or an email", path: ["mobile"] });

export type NewUserValues = z.infer<typeof newUserSchema>;

/** Edit user: like new user, but the password is only set when typed. */
export const editUserSchema = z
  .object({
    fullName: required("Full name", 150),
    role: z.enum(["admin", "user"]),
    mobile: userMobile,
    email: userEmail,
    password: z.string().refine((v) => v === "" || (v.length >= 8 && v.length <= 72), "8 to 72 characters, or leave empty"),
  })
  .refine((v) => v.mobile !== "" || v.email !== "", { message: "Enter a mobile number or an email", path: ["mobile"] });

export type EditUserValues = z.infer<typeof editUserSchema>;

/**
 * "2.5" / " 450 " -> number; anything else -> NaN. Commas are rejected rather
 * than guessed at ("2,500" could mean 2500 or 2.5), so a value is never reinterpreted.
 */
export function parseLandSize(v: string): number {
  const t = v.trim();
  return /^\d*\.?\d+$/.test(t) ? Number(t) : Number.NaN;
}

export const serviceRecordSchema = z.object({
  farmerName: required("Farmer name", 150),
  gender: z.enum(["", "male", "female", "other"]),
  address: z.string().trim().max(500, "Address must be at most 500 characters"),
  surveyNumber: required("Survey number", 50),
  subDivision: z.string().trim().max(50, "Sub-division must be at most 50 characters"),
  landSize: z.string().superRefine((v, ctx) => {
    const n = parseLandSize(v);
    const problem = !v.trim()
      ? "Land size is required"
      : v.includes(",")
        ? "Use a dot for decimals and no commas, e.g. 2.5"
        : Number.isNaN(n)
          ? "Enter a number, e.g. 2.5"
          : n <= 0
            ? "Land size must be greater than 0"
            : n > 100_000_000
              ? "Land size is not plausible"
              : !/^\d*\.?\d{0,4}$/.test(v.trim())
                ? "Use at most 4 decimal places"
                : null;
    if (problem) ctx.addIssue({ code: "custom", message: problem });
  }),
  landUnit: z.enum(["", "acre", "sq_m"]).refine((v): boolean => v !== "", "Select a unit"),
  serviceDetails: z.string().trim().max(2000, "Details must be at most 2000 characters"),
});

export type ServiceRecordFormValues = z.infer<typeof serviceRecordSchema>;

export const EMPTY_SERVICE_RECORD: ServiceRecordFormValues = {
  farmerName: "", gender: "", address: "", surveyNumber: "", subDivision: "", landSize: "", landUnit: "", serviceDetails: "",
};

/** Map service-records backend field names onto form field names. */
export const SERVICE_RECORD_FIELD_TO_FORM: Record<string, keyof ServiceRecordFormValues> = {
  farmer_name: "farmerName",
  gender: "gender",
  address: "address",
  survey_number: "surveyNumber",
  sub_division: "subDivision",
  land_size: "landSize",
  land_unit: "landUnit",
  service_details: "serviceDetails",
};
