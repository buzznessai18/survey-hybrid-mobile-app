import { toIsoDate } from "../date";
import { isValidMobile, normalizeCode, normalizeMobile, toE164 } from "../mobile";
import { detailsSchema, duplicateReasonSchema, editUserSchema, loginSchema, newUserSchema } from "../validation";

const valid = {
  farmerName: "Ramesh Kumar",
  farmerMobile: "9876543210",
  cropId: "c7e5a1b2-0000-4000-8000-000000000001",
  area: "2.5",
  areaUnit: "acre" as const,
  surveyNumber: "125",
  subDivision: "2",
  visitDate: toIsoDate(),
};

const errorsFor = (input: unknown) => {
  const r = detailsSchema.safeParse(input);
  return r.success ? {} : Object.fromEntries(r.error.issues.map((i) => [i.path.join("."), i.message]));
};

describe("mobile normalisation (mirrors backend normalizeMobile)", () => {
  it.each([
    ["+91 98765 43210", "9876543210"],
    ["919876543210", "9876543210"],
    ["09876543210", "9876543210"],
    ["98765-43210", "9876543210"],
  ])("%s -> %s", (input, expected) => expect(normalizeMobile(input)).toBe(expected));

  it("validates Indian 10-digit mobiles", () => {
    expect(isValidMobile("9876543210")).toBe(true);
    expect(isValidMobile("5876543210")).toBe(false);
    expect(isValidMobile("98765")).toBe(false);
  });

  it("builds E.164 numbers for phone auth", () => expect(toE164("98765 43210")).toBe("+919876543210"));

  it("normalises survey codes like the database", () => expect(normalizeCode(" 12 a ")).toBe("12A"));
});

describe("detailsSchema", () => {
  it("accepts a valid survey", () => expect(errorsFor(valid)).toEqual({}));

  it("requires farmer name, mobile, crop, area, survey number and date", () => {
    const e = errorsFor({ ...valid, farmerName: " ", farmerMobile: "", cropId: "", area: "", surveyNumber: "", visitDate: "" });
    expect(Object.keys(e).sort()).toEqual(["area", "cropId", "farmerMobile", "farmerName", "surveyNumber", "visitDate"]);
  });

  it("rejects area <= 0 and non-numbers", () => {
    expect(errorsFor({ ...valid, area: "0" }).area).toMatch(/greater than 0/);
    expect(errorsFor({ ...valid, area: "abc" }).area).toMatch(/number/);
  });

  it("rejects invalid mobile numbers", () => expect(errorsFor({ ...valid, farmerMobile: "12345" }).farmerMobile).toBeDefined());

  it("allows an empty sub-division", () => expect(errorsFor({ ...valid, subDivision: "" })).toEqual({}));

  it("rejects future visit dates", () => {
    const future = new Date();
    future.setDate(future.getDate() + 5);
    expect(errorsFor({ ...valid, visitDate: toIsoDate(future) }).visitDate).toMatch(/future/);
  });
});

describe("duplicateReasonSchema", () => {
  it("requires notes when reason is other", () => {
    expect(duplicateReasonSchema.safeParse({ reason: "other", notes: "" }).success).toBe(false);
    expect(duplicateReasonSchema.safeParse({ reason: "other", notes: "Split plot" }).success).toBe(true);
    expect(duplicateReasonSchema.safeParse({ reason: "different_farmer", notes: "" }).success).toBe(true);
  });
  it("rejects unknown reasons", () => expect(duplicateReasonSchema.safeParse({ reason: "nope", notes: "" }).success).toBe(false));
});

describe("loginSchema", () => {
  it("validates phone and email logins", () => {
    expect(loginSchema.safeParse({ portal: "user", method: "phone", identifier: "9876543210", password: "x" }).success).toBe(true);
    expect(loginSchema.safeParse({ portal: "user", method: "phone", identifier: "123", password: "x" }).success).toBe(false);
    expect(loginSchema.safeParse({ portal: "admin", method: "email", identifier: "a@b.co", password: "x" }).success).toBe(true);
    expect(loginSchema.safeParse({ portal: "admin", method: "email", identifier: "a@b.co", password: "" }).success).toBe(false);
    expect(loginSchema.safeParse({ portal: "guest", method: "email", identifier: "a@b.co", password: "x" }).success).toBe(false);
  });

  it("validates the admin add-user form", () => {
    const ok = { fullName: "Asha", role: "user", mobile: "9876543210", email: "", password: "Secret-123" };
    expect(newUserSchema.safeParse(ok).success).toBe(true);
    expect(newUserSchema.safeParse({ ...ok, role: "admin" }).success).toBe(true);
    expect(newUserSchema.safeParse({ ...ok, role: "field_surveyor" }).success).toBe(false);
    expect(newUserSchema.safeParse({ ...ok, mobile: "" }).success).toBe(false); // needs mobile or email
    expect(newUserSchema.safeParse({ ...ok, mobile: "", email: "asha@x.co" }).success).toBe(true);
    expect(newUserSchema.safeParse({ ...ok, password: "short" }).success).toBe(false);
  });
});

describe("editUserSchema", () => {
  const ok = { fullName: "Asha Naik", role: "user" as const, mobile: "9876543210", email: "", password: "" };
  it("keeps the password unless one is typed", () => {
    expect(editUserSchema.safeParse(ok).success).toBe(true);
    expect(editUserSchema.safeParse({ ...ok, password: "New-pass-1" }).success).toBe(true);
    expect(editUserSchema.safeParse({ ...ok, password: "short" }).success).toBe(false);
  });
  it("still needs a way to sign in", () => {
    expect(editUserSchema.safeParse({ ...ok, mobile: "" }).success).toBe(false);
    expect(editUserSchema.safeParse({ ...ok, mobile: "", email: "asha@x.co" }).success).toBe(true);
    expect(editUserSchema.safeParse({ ...ok, mobile: "12345" }).success).toBe(false);
  });
});
