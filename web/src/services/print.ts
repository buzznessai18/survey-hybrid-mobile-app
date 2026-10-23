import { env } from "@/config/env";
import { toIsoDate } from "@/lib/date";
import { buildReceiptHtml } from "@/lib/receipt";
import type { ExportResult, ServiceRecord } from "@/lib/types";

/**
 * Print a self-contained HTML document through the browser's print dialog,
 * from a hidden iframe so the page itself is untouched. Any printer the
 * computer can reach works, and "Save as PDF" in the dialog gives a PDF.
 */
function printHtml(html: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const frame = document.createElement("iframe");
    frame.setAttribute("aria-hidden", "true");
    frame.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden";
    frame.srcdoc = html;
    frame.onload = () => {
      const win = frame.contentWindow;
      if (!win) {
        frame.remove();
        return reject(new Error("The print preview could not be opened."));
      }
      // print() blocks until the dialog closes in most browsers; clean up after.
      win.addEventListener("afterprint", () => setTimeout(() => frame.remove(), 500));
      win.focus();
      win.print();
      setTimeout(() => frame.remove(), 60_000);
      resolve();
    };
    document.body.appendChild(frame);
  });
}

const receiptHtml = (record: ServiceRecord) =>
  buildReceiptHtml(record, { orgName: env.receiptOrgName, orgSubtitle: env.receiptOrgSubtitle });

export const ReceiptService = {
  html: receiptHtml,
  print: (record: ServiceRecord) => printHtml(receiptHtml(record)),
};

// ---------------------------------------------------------------------------
// Reports (same output as mobile/src/services/reports/ReportExporter.ts)
// ---------------------------------------------------------------------------

const stamp = () => new Date().toISOString().slice(0, 16).replace(/[-:T]/g, "");
const safeName = (title: string) => title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");

/** Counts per status-like column, for the summary sheet / PDF header. */
export function summarize(result: ExportResult): { label: string; counts: [string, number][] }[] {
  const keys = ["status", "submission_status", "duplicate_status", "taluka", "farmer_taluka"];
  return result.columns
    .filter((c) => keys.includes(c.key))
    .map((c) => {
      const counts = new Map<string, number>();
      for (const r of result.rows) {
        const v = String(r[c.key] ?? "—");
        counts.set(v, (counts.get(v) ?? 0) + 1);
      }
      return { label: c.label, counts: [...counts.entries()].sort((a, b) => b[1] - a[1]) };
    });
}

const localDay = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : toIsoDate(d);
};

function filtersText(result: ExportResult): string {
  const f = result.filters;
  const parts = [
    f.date_from || f.date_to ? `Dates: ${f.date_from ?? "…"} to ${f.date_to ?? "…"}` : null,
    f.created_from || f.created_to
      ? `Dates: ${f.created_from ? localDay(f.created_from) : "…"} to ${f.created_to ? localDay(f.created_to) : "…"}`
      : null,
    f.taluka ? `Taluka: ${f.taluka}` : null,
    f.q ? `Search: ${f.q}` : null,
  ];
  return parts.filter(Boolean).join(" · ") || "All records";
}

export const ReportExporter = {
  /** Real .xlsx with a data sheet and a summary sheet, downloaded by the browser. */
  async downloadExcel(result: ExportResult) {
    // Loaded on demand: the spreadsheet library is most of the bundle and only admins export.
    const XLSX = await import("xlsx");
    const wb = XLSX.utils.book_new();
    const header = result.columns.map((c) => c.label);
    const data = result.rows.map((r) => result.columns.map((c) => r[c.key] ?? ""));
    const sheet = XLSX.utils.aoa_to_sheet([header, ...data]);
    sheet["!cols"] = result.columns.map((c) => ({ wch: Math.min(40, Math.max(c.label.length + 2, 12)) }));
    XLSX.utils.book_append_sheet(wb, sheet, result.title.slice(0, 31));

    const summary: (string | number)[][] = [
      ["Report", result.title], ["Generated", new Date(result.generated_at).toLocaleString()], ["Filters", filtersText(result)],
      ["Rows", result.rows.length + (result.truncated ? ` of ${result.total} (truncated)` : "")], [],
    ];
    for (const s of summarize(result)) {
      summary.push([s.label, "Count"], ...s.counts.map(([k, n]) => [k, n]), []);
    }
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(summary), "Summary");
    XLSX.writeFile(wb, `${safeName(result.title)}-${stamp()}.xlsx`);
  },

  /** Formatted landscape report through the print dialog ("Save as PDF" or a printer). */
  printPdf(result: ExportResult, maxRows = 300, maxColumns = 9) {
    const esc = (v: unknown) => String(v ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
    const cols = result.columns.slice(0, maxColumns);
    const rows = result.rows.slice(0, maxRows);
    const summaries = summarize(result)
      .map((s) => `<div class="card"><h3>${esc(s.label)}</h3><table>${s.counts.map(([k, n]) => `<tr><td>${esc(k)}</td><td class="n">${n}</td></tr>`).join("")}</table></div>`)
      .join("");
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>${esc(result.title)}</title><style>
      @page { size: A4 landscape; margin: 14mm; }
      body { font-family: -apple-system, Roboto, Arial, sans-serif; color: #17201A; font-size: 10px; }
      h1 { color: #0F6335; font-size: 20px; margin: 0; } .sub { color: #6B746D; margin: 4px 0 14px; }
      .cards { display: flex; gap: 10px; flex-wrap: wrap; margin-bottom: 14px; }
      .card { border: 1px solid #E3E7E1; border-radius: 8px; padding: 8px 10px; min-width: 150px; }
      .card h3 { margin: 0 0 6px; font-size: 11px; color: #168A4A; } .card td { padding: 1px 4px; } .n { text-align: right; font-weight: 600; }
      table.data { width: 100%; border-collapse: collapse; }
      table.data th { background: #168A4A; color: #fff; text-align: left; padding: 5px; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      table.data td { border-bottom: 1px solid #E3E7E1; padding: 4px 5px; vertical-align: top; white-space: pre-wrap; overflow-wrap: anywhere; }
      table.data tr:nth-child(even) td { background: #F7F8F5; }
      .foot { color: #6B746D; margin-top: 8px; }
    </style></head><body>
      <h1>${esc(env.receiptOrgName)} — ${esc(result.title)}</h1>
      <div class="sub">${esc(filtersText(result))} · Generated ${esc(new Date(result.generated_at).toLocaleString())} · ${result.total} records</div>
      <div class="cards">${summaries}</div>
      <table class="data"><thead><tr>${cols.map((c) => `<th>${esc(c.label)}</th>`).join("")}</tr></thead>
      <tbody>${rows.map((r) => `<tr>${cols.map((c) => `<td>${esc(r[c.key])}</td>`).join("")}</tr>`).join("")}</tbody></table>
      <div class="foot">${rows.length < result.total ? `Showing the first ${rows.length} of ${result.total} records. Use the Excel export for the full list.` : ""}</div>
    </body></html>`;
    return printHtml(html);
  },
};
