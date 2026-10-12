import { File, Paths } from "expo-file-system";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";
import { Platform } from "react-native";
import { env } from "@/config/env";
import type { ServiceRecord } from "@/types/api";
import { buildReceiptHtml } from "@/utils/receipt";

export type PrintOutcome = "printed" | "dismissed";

const html = (record: ServiceRecord) => buildReceiptHtml(record, { orgName: env.receiptOrgName, orgSubtitle: env.receiptOrgSubtitle });

/**
 * Receipts go through the operating system's print service (expo-print), so
 * any printer the phone can already reach works: Wi-Fi/network printers,
 * Mopria / manufacturer print plugins on Android, AirPrint on iOS. Nothing here
 * is tied to a printer model. A Bluetooth thermal printer without an OS print
 * plugin can still be used by sharing the PDF to its own app (sharePdf).
 */
export const ReceiptService = {
  html,

  /**
   * Open the system print dialog. iOS rejects when the user closes the dialog
   * without printing; that is reported as "dismissed", not as an error. Android
   * resolves as soon as the dialog opens and never reports a cancellation.
   */
  async print(record: ServiceRecord): Promise<PrintOutcome> {
    try {
      await Print.printAsync({ html: html(record) });
      return "printed";
    } catch (e) {
      if (Platform.OS === "ios" && isDismissal(e)) return "dismissed";
      throw new Error(printErrorMessage(e));
    }
  },

  /** Save the receipt as a PDF and open the share sheet (WhatsApp, Drive, a printer app…). */
  async sharePdf(record: ServiceRecord) {
    if (!(await Sharing.isAvailableAsync())) throw new Error("Sharing is not available on this device.");
    const { uri } = await Print.printToFileAsync({ html: html(record) });
    const target = new File(Paths.cache, `receipt-${record.record_no}.pdf`);
    if (target.exists) target.delete();
    await new File(uri).move(target);
    await Sharing.shareAsync(target.uri, { mimeType: "application/pdf", dialogTitle: `Receipt ${record.record_no}`, UTI: "com.adobe.pdf" });
    return target.uri;
  },
};

function isDismissal(e: unknown): boolean {
  const msg = e instanceof Error ? e.message : String(e ?? "");
  // expo-print doesn't document the message; it says printing did not complete / was cancelled.
  return /cancel|did not complete|not completed|dismiss/i.test(msg) || msg === "";
}

function printErrorMessage(e: unknown): string {
  const msg = e instanceof Error ? e.message : "";
  if (/no printer|not available|unavailable/i.test(msg)) return "No printer is available. Check the printer is on and connected, or use Share PDF.";
  return "The receipt could not be printed. Check the printer connection and try again, or use Share PDF.";
}
