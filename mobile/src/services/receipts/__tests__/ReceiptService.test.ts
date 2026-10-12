import * as Print from "expo-print";
import { Platform } from "react-native";
import type { ServiceRecord } from "@/types/api";
import { ReceiptService } from "../ReceiptService";

jest.mock("expo-print", () => ({ printAsync: jest.fn(), printToFileAsync: jest.fn() }));
jest.mock("expo-sharing", () => ({ isAvailableAsync: jest.fn(async () => false), shareAsync: jest.fn() }));
jest.mock("expo-file-system", () => ({ File: jest.fn(), Paths: { cache: "/cache" } }));

const printAsync = Print.printAsync as jest.Mock;
const record = {
  id: "1", record_no: "RC-000001", farmer_name: "Ramesh", gender: null, address: null, survey_number: "1", sub_division: null,
  land_size: 1, land_unit: "acre", service_details: "Tractor provided.", created_by: "u", created_by_name: "Admin",
  created_at: "2026-10-12T04:50:00.000Z", updated_at: "2026-10-12T04:50:00.000Z",
} satisfies ServiceRecord;

const setOS = (os: "ios" | "android") => Object.defineProperty(Platform, "OS", { get: () => os, configurable: true });

describe("ReceiptService.print", () => {
  beforeEach(() => printAsync.mockReset());

  it("prints the receipt HTML through the system print dialog", async () => {
    printAsync.mockResolvedValue(undefined);
    await expect(ReceiptService.print(record)).resolves.toBe("printed");
    expect(printAsync).toHaveBeenCalledWith({ html: expect.stringContaining("RC-000001") });
  });

  it("reports an iOS cancellation as dismissed, not as an error", async () => {
    setOS("ios");
    printAsync.mockRejectedValue(new Error("Printing did not complete"));
    await expect(ReceiptService.print(record)).resolves.toBe("dismissed");
  });

  it("turns real printing failures into a friendly error", async () => {
    setOS("android");
    printAsync.mockRejectedValue(new Error("Native crash xyz"));
    await expect(ReceiptService.print(record)).rejects.toThrow(/could not be printed.*Share PDF/);
  });

  it("explains when no printer is available", async () => {
    setOS("ios");
    printAsync.mockRejectedValue(new Error("Printing is not available"));
    await expect(ReceiptService.print(record)).rejects.toThrow(/No printer is available/);
  });
});

describe("ReceiptService.sharePdf", () => {
  it("fails clearly when sharing is unavailable", async () => {
    await expect(ReceiptService.sharePdf(record)).rejects.toThrow("Sharing is not available on this device.");
  });
});
