import type { ServiceRecord } from "@/types/api";
import { formatShortDate, formatTime, localDayRange } from "../date";
import { formatLandSize } from "../labels";
import { buildReceiptHtml, formatReceiptDateTime } from "../receipt";
import { EMPTY_SERVICE_RECORD, parseLandSize, serviceRecordSchema } from "../validation";

const valid = {
  ...EMPTY_SERVICE_RECORD,
  farmerName: "Ramesh Gaonkar",
  surveyNumber: "312",
  subDivision: "4B",
  landSize: "2.5",
  landUnit: "acre" as const,
  serviceDetails: "Tractor provided.",
};

const errorsFor = (input: unknown) => {
  const r = serviceRecordSchema.safeParse(input);
  return r.success ? {} : Object.fromEntries(r.error.issues.map((i) => [i.path.join("."), i.message]));
};

describe("service record form validation", () => {
  it("accepts a complete record and an equally valid minimal one", () => {
    expect(errorsFor(valid)).toEqual({});
    expect(errorsFor({ ...EMPTY_SERVICE_RECORD, farmerName: "A", surveyNumber: "1", landSize: "1", landUnit: "sq_m" })).toEqual({});
  });

  it("requires farmer name, survey number, land size and unit", () => {
    const e = errorsFor(EMPTY_SERVICE_RECORD);
    expect(e.farmerName).toBe("Farmer name is required");
    expect(e.surveyNumber).toBe("Survey number is required");
    expect(e.landSize).toBe("Land size is required");
    expect(e.landUnit).toBe("Select a unit");
    expect(e.gender).toBeUndefined();
    expect(e.address).toBeUndefined();
    expect(e.subDivision).toBeUndefined();
    expect(e.serviceDetails).toBeUndefined();
  });

  it("treats whitespace-only required fields as empty", () => {
    const e = errorsFor({ ...valid, farmerName: "   ", surveyNumber: " " });
    expect(e.farmerName).toBe("Farmer name is required");
    expect(e.surveyNumber).toBe("Survey number is required");
  });

  it.each([
    ["abc", "Enter a number, e.g. 2.5"],
    ["0", "Land size must be greater than 0"],
    ["-2", "Enter a number, e.g. 2.5"],
    ["2,500", "Use a dot for decimals and no commas, e.g. 2.5"],
    ["1.23456", "Use at most 4 decimal places"],
    ["200000000", "Land size is not plausible"],
  ])("rejects land size %p", (landSize, message) => {
    expect(errorsFor({ ...valid, landSize }).landSize).toBe(message);
  });

  it.each(["2.5", " 450 ", ".5", "10", "0.0001"])("accepts land size %p", (landSize) => {
    expect(errorsFor({ ...valid, landSize })).toEqual({});
  });

  it("only allows Acres or Square metres", () => {
    expect(errorsFor({ ...valid, landUnit: "hectare" }).landUnit).toBeDefined();
  });

  it("accepts free-text equipment / service descriptions of any kind, up to 2000 characters", () => {
    for (const serviceDetails of ["Tractor provided.", "Land ploughing completed.\nAlso levelled the field.", "Other agricultural work completed", ""]) {
      expect(errorsFor({ ...valid, serviceDetails })).toEqual({});
    }
    expect(errorsFor({ ...valid, serviceDetails: "x".repeat(2001) }).serviceDetails).toBeDefined();
  });

  it("parses land size exactly, never reinterpreting commas", () => {
    expect(parseLandSize("2.5")).toBe(2.5);
    expect(parseLandSize(" 450 ")).toBe(450);
    expect(parseLandSize("2,500")).toBeNaN();
  });
});

describe("land size display", () => {
  it("shows the saved value with its unit, unconverted", () => {
    expect(formatLandSize(2.5, "acre")).toBe("2.5 Acres");
    expect(formatLandSize(1, "acre")).toBe("1 Acre");
    expect(formatLandSize(450, "sq_m")).toBe("450 sq. m");
    expect(formatLandSize(0.1234, "acre")).toBe("0.1234 Acres");
  });
});

describe("localDayRange", () => {
  it("covers the whole local days, as instants", () => {
    const r = localDayRange("2026-10-01", "2026-10-12");
    expect(new Date(r.created_from)).toEqual(new Date(2026, 9, 1, 0, 0, 0, 0));
    expect(new Date(r.created_to)).toEqual(new Date(2026, 9, 12, 23, 59, 59, 999));
  });
});

const record: ServiceRecord = {
  id: "5b0f8d2e-7a51-4c1b-9a2f-3f6d8e1c2b4a",
  record_no: "RC-000123",
  farmer_name: "Shobha <b>Naik</b> with a very long name that should wrap across lines on a narrow receipt",
  gender: "female",
  address: "House 12,\nNear Temple, Aldona",
  survey_number: "312",
  sub_division: "4B",
  land_size: 2.5,
  land_unit: "acre",
  service_details: "Tractor provided & land ploughing completed.\nSecond line.",
  created_by: "u1",
  created_by_name: "Rahul Sharma",
  created_at: "2026-10-12T04:50:00.000Z",
  updated_at: "2026-10-12T04:50:00.000Z",
};

describe("receipt HTML", () => {
  const html = buildReceiptHtml(record, { orgName: "Goa Agri Services", orgSubtitle: "Panaji, Goa" }, new Date("2026-10-12T05:00:00Z"));

  it("contains every receipt field", () => {
    for (const text of [
      "Goa Agri Services", "Panaji, Goa", "Farmer Receipt", "RC-000123", "Female", "312", "4B", "2.5 Acres", "Rahul Sharma",
      "Equipment / service details", formatReceiptDateTime(record.created_at),
    ]) {
      expect(html).toContain(text);
    }
  });

  it("shows the date and time in the device's timezone", () => {
    expect(formatReceiptDateTime(record.created_at)).toBe(`${formatShortDate(record.created_at)}, ${formatTime(record.created_at)}`);
  });

  it("escapes user-entered text", () => {
    expect(html).toContain("Shobha &lt;b&gt;Naik&lt;/b&gt;");
    expect(html).not.toContain("<b>Naik</b>");
    expect(html).toContain("Tractor provided &amp; land ploughing completed.");
  });

  it("keeps line breaks and wraps long text", () => {
    expect(html).toContain("white-space: pre-wrap");
    expect(html).toContain("overflow-wrap: anywhere");
    expect(html).toContain("House 12,\nNear Temple, Aldona");
  });

  it("shows dashes for empty optional fields and omits an empty subtitle", () => {
    const bare = buildReceiptHtml({ ...record, gender: null, address: null, sub_division: null, service_details: null, created_by_name: null }, { orgName: "X" });
    expect(bare.match(/&mdash;/g)?.length).toBe(5);
    expect(bare).not.toContain('class="sub"');
  });

  it("invents nothing (no prices, amounts or payment status)", () => {
    expect(html).not.toMatch(/₹|\bRs\b|\bamount|\bprice|\bpaid\b|\bpayment/i);
  });
});
