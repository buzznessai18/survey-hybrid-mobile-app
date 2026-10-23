import type { ServiceRecord } from "./types";
import { formatShortDate, formatTime } from "./date";
import { formatLandSize, GENDER_LABELS } from "./labels";

export interface ReceiptBranding {
  orgName: string;
  orgSubtitle?: string;
}

const escapeHtml = (v: unknown) =>
  String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** "12 Oct 2026, 10:20 AM" in the browser's timezone (no "Today": receipts are kept). */
export function formatReceiptDateTime(iso: string): string {
  return `${formatShortDate(iso)}, ${formatTime(iso)}`;
}

/**
 * Self-contained receipt HTML, byte-for-byte the same layout the mobile app
 * prints (mobile/src/utils/receipt.ts), so web and phone receipts match. The layout is a single narrow column that fits
 * an 80 mm receipt roll as well as an A4/Letter page; long names, addresses and
 * service descriptions wrap instead of overflowing.
 */
export function buildReceiptHtml(record: ServiceRecord, branding: ReceiptBranding, printedAt: Date = new Date()): string {
  const row = (label: string, value: string | null | undefined, opts: { multiline?: boolean } = {}) =>
    `<tr><th>${escapeHtml(label)}</th><td class="${opts.multiline ? "multi" : ""}">${value ? escapeHtml(value) : "&mdash;"}</td></tr>`;

  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Receipt ${escapeHtml(record.record_no)}</title>
<style>
  @page { margin: 10mm; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: -apple-system, Roboto, "Helvetica Neue", Arial, sans-serif; color: #000; font-size: 13px; line-height: 1.4; }
  .receipt { max-width: 380px; margin: 0 auto; padding: 4px 0; }
  .head { text-align: center; padding-bottom: 8px; border-bottom: 2px solid #000; }
  .org { font-size: 18px; font-weight: 700; margin: 0; overflow-wrap: anywhere; }
  .sub { font-size: 12px; margin: 2px 0 0; overflow-wrap: anywhere; }
  .title { font-size: 14px; font-weight: 700; letter-spacing: 1px; margin: 8px 0 0; text-transform: uppercase; }
  .meta { display: flex; justify-content: space-between; gap: 8px; padding: 8px 0; border-bottom: 1px dashed #000; font-size: 12px; }
  .meta b { font-size: 14px; }
  table { width: 100%; border-collapse: collapse; margin-top: 6px; }
  th, td { text-align: left; vertical-align: top; padding: 5px 0; border-bottom: 1px dotted #999; }
  th { width: 38%; font-weight: 600; padding-right: 8px; }
  td { overflow-wrap: anywhere; word-break: break-word; }
  td.multi { white-space: pre-wrap; }
  .service { margin-top: 10px; border: 1px solid #000; border-radius: 4px; padding: 8px; }
  .service h3 { margin: 0 0 4px; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; }
  .service p { margin: 0; white-space: pre-wrap; overflow-wrap: anywhere; word-break: break-word; }
  .sign { display: flex; justify-content: space-between; gap: 16px; margin-top: 36px; font-size: 11px; }
  .sign div { flex: 1; border-top: 1px solid #000; padding-top: 4px; text-align: center; }
  .foot { margin-top: 14px; text-align: center; font-size: 10px; color: #333; }
</style></head>
<body><div class="receipt">
  <div class="head">
    <p class="org">${escapeHtml(branding.orgName)}</p>
    ${branding.orgSubtitle ? `<p class="sub">${escapeHtml(branding.orgSubtitle)}</p>` : ""}
    <p class="title">Farmer Receipt</p>
  </div>
  <div class="meta">
    <span>Receipt no.<br><b>${escapeHtml(record.record_no)}</b></span>
    <span style="text-align:right">Date &amp; time<br><b>${escapeHtml(formatReceiptDateTime(record.created_at))}</b></span>
  </div>
  <table>
    ${row("Farmer name", record.farmer_name)}
    ${row("Gender", record.gender ? GENDER_LABELS[record.gender] : null)}
    ${row("Address", record.address, { multiline: true })}
    ${row("Survey no.", record.survey_number)}
    ${row("Sub-division", record.sub_division)}
    ${row("Land size", formatLandSize(record.land_size, record.land_unit))}
    ${row("Recorded by", record.created_by_name)}
  </table>
  <div class="service">
    <h3>Equipment / service details</h3>
    <p>${record.service_details ? escapeHtml(record.service_details) : "&mdash;"}</p>
  </div>
  <div class="sign"><div>Farmer signature</div><div>Authorised signature</div></div>
  <p class="foot">Printed ${escapeHtml(formatReceiptDateTime(printedAt.toISOString()))}</p>
</div></body></html>`;
}
