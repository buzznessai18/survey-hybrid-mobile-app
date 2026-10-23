import { ChevronLeft, ChevronRight, Eye, FileText, Sheet } from "lucide-react";
import { useState } from "react";
import { Banner, Button, SelectField, Segmented, TextField } from "@/components/ui";
import { errorMessage } from "@/lib/errors";
import { formatShortDate, localDayRange, toIsoDate } from "@/lib/date";
import { getPeriod, periodDays, type PeriodMode } from "@/lib/period";
import { formatReceiptDateTime } from "@/lib/receipt";
import { GOA_TALUKAS, type ExportDataset, type ExportResult, type Taluka } from "@/lib/types";
import { ExportService } from "@/services/api";
import { ReportExporter, summarize } from "@/services/print";

const DATASETS: { value: ExportDataset; label: string; hint: string }[] = [
  { value: "records", label: "Farmer service records", hint: "The current record and receipt workflow." },
  { value: "surveys", label: "Field surveys", hint: "Earlier survey workflow (historical data)." },
  { value: "forms", label: "1/14 forms (land records)", hint: "Earlier survey workflow (historical data)." },
  { value: "farmers", label: "Farmers", hint: "Earlier survey workflow (historical data)." },
  { value: "applications", label: "Benefits & subsidies", hint: "Earlier survey workflow (historical data)." },
];
const MAX_RANGE_DAYS = 366;

/** Admin: weekly / monthly / custom-range Excel (.xlsx) and PDF reports. */
export default function Reports() {
  const today = toIsoDate();
  const [dataset, setDataset] = useState<ExportDataset>("records");
  const [search, setSearch] = useState("");
  const [allDates, setAllDates] = useState(false);
  const [mode, setMode] = useState<PeriodMode>("month");
  const [offset, setOffset] = useState(0);
  const [custom, setCustom] = useState({ from: `${today.slice(0, 8)}01`, to: today });
  const [taluka, setTaluka] = useState<Taluka | "">("");
  const [busy, setBusy] = useState<"preview" | "xlsx" | "pdf" | null>(null);
  const [preview, setPreview] = useState<ExportResult | null>(null);
  const [message, setMessage] = useState<{ tone: "error" | "info"; text: string } | null>(null);

  const period = getPeriod(mode, offset, custom);
  const invalid = allDates || mode !== "custom"
    ? null
    : custom.from > custom.to
      ? "Start date must be on or before the end date."
      : periodDays(custom) > MAX_RANGE_DAYS
        ? `Choose a range of at most ${MAX_RANGE_DAYS} days.`
        : null;

  const changed = <T,>(fn: (v: T) => void) => (v: T) => { fn(v); setPreview(null); setMessage(null); };

  const fetchData = async () => {
    if (dataset === "records") {
      // Local-day boundaries, so "today" means the user's today; times shown in local time.
      const range = allDates ? {} : localDayRange(period.from, period.to);
      const result = await ExportService.fetch({ dataset, ...range, q: search.trim() || undefined });
      return { ...result, rows: result.rows.map((r) => ({ ...r, created_at: r.created_at ? formatReceiptDateTime(String(r.created_at)) : "" })) };
    }
    const range = allDates ? {} : { date_from: period.from, date_to: period.to };
    return ExportService.fetch({ dataset, ...range, taluka: taluka || undefined });
  };

  const run = async (kind: "preview" | "xlsx" | "pdf") => {
    setBusy(kind);
    setMessage(null);
    try {
      const result = await fetchData();
      setPreview(result);
      if (result.rows.length === 0 && kind !== "preview") return setMessage({ tone: "info", text: "No records match these filters, so there is nothing to export." });
      if (kind === "xlsx") await ReportExporter.downloadExcel(result);
      // Records: every column (service details and who recorded it matter); other reports keep 9.
      if (kind === "pdf") await ReportExporter.printPdf(result, 300, dataset === "records" ? result.columns.length : 9);
    } catch (e) {
      setMessage({ tone: "error", text: `The report failed. ${errorMessage(e)}` });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="form-page">
      <div className="page-head">
        <div>
          <h1>Reports</h1>
          <p>Download an Excel file, or print a PDF, for any week, month or date range.</p>
        </div>
      </div>

      <section className="form-section" aria-labelledby="r-what">
        <h2 id="r-what">Report</h2>
        <div role="radiogroup" aria-labelledby="r-what">
          {DATASETS.map((d) => (
            <label key={d.value} className="radio-card">
              <input type="radio" name="dataset" checked={dataset === d.value} onChange={() => changed(setDataset)(d.value)} />
              <div><strong>{d.label}</strong><span>{d.hint}</span></div>
            </label>
          ))}
        </div>
      </section>

      <section className="form-section" aria-labelledby="r-period">
        <h2 id="r-period" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          Period
          <label style={{ fontSize: 15, fontWeight: 500, display: "inline-flex", gap: 8, alignItems: "center" }}>
            <input type="checkbox" checked={allDates} onChange={(e) => changed(setAllDates)(e.target.checked)} style={{ accentColor: "var(--leaf)" }} />
            All dates
          </label>
        </h2>
        {allDates ? (
          <p className="hint">Every record, regardless of date.</p>
        ) : (
          <>
            <Segmented
              label="Period type"
              value={mode}
              onChange={(m) => { changed(setMode)(m); setOffset(0); }}
              options={[{ value: "week", label: "Weekly" }, { value: "month", label: "Monthly" }, { value: "custom", label: "Custom" }]}
            />
            {mode === "custom" ? (
              <div className="row-2" style={{ marginTop: 16 }}>
                <TextField label="From" type="date" max={today} value={custom.from} onChange={(e) => changed(setCustom)({ ...custom, from: e.target.value })} />
                <TextField label="To" type="date" max={today} min={custom.from} value={custom.to} onChange={(e) => changed(setCustom)({ ...custom, to: e.target.value })} error={invalid ?? undefined} />
              </div>
            ) : (
              <div className="stepper">
                <button type="button" className="icon-btn" onClick={() => changed(setOffset)(offset - 1)} aria-label={`Previous ${mode}`}><ChevronLeft aria-hidden /></button>
                <div className="label" aria-live="polite">
                  <strong>{period.label}</strong>
                  <span>{period.from === period.to ? formatShortDate(period.from) : `${formatShortDate(period.from)} to ${formatShortDate(period.to)}`}</span>
                </div>
                <button type="button" className="icon-btn" onClick={() => changed(setOffset)(offset + 1)} disabled={period.isCurrent} aria-label={`Next ${mode}`}><ChevronRight aria-hidden /></button>
              </div>
            )}
          </>
        )}
      </section>

      <section className="form-section" aria-labelledby="r-filter">
        <h2 id="r-filter">Filter</h2>
        {dataset === "records" ? (
          <TextField
            label="Search"
            value={search}
            onChange={(e) => changed(setSearch)(e.target.value)}
            placeholder="Farmer name, survey no. or sub-division"
            hint="Leave empty to include every record in the period."
            autoComplete="off"
          />
        ) : (
          <SelectField
            label="Taluka"
            value={taluka}
            onChange={(e) => changed(setTaluka)(e.target.value as Taluka | "")}
            options={[{ value: "", label: "All talukas" }, ...GOA_TALUKAS.map((t) => ({ value: t, label: t }))]}
          />
        )}
      </section>

      {message ? <Banner tone={message.tone}>{message.text}</Banner> : null}
      {preview ? (
        <div className="panel report-summary" style={{ marginBottom: 16 }} aria-live="polite">
          <strong>{preview.title}: {preview.total} record{preview.total === 1 ? "" : "s"}</strong>
          {summarize(preview).slice(0, 2).map((s) => (
            <span key={s.label} className="hint">{s.label}: {s.counts.slice(0, 5).map(([k, n]) => `${k} ${n}`).join(", ")}</span>
          ))}
          {preview.truncated ? <span className="hint" style={{ color: "var(--warning)" }}>Large report: the first {preview.rows.length} rows are included.</span> : null}
        </div>
      ) : null}

      <div className="form-footer" style={{ justifyContent: "flex-start" }}>
        <Button variant="ghost" icon={Eye} loading={busy === "preview"} disabled={!!busy || !!invalid} onClick={() => run("preview")}>Preview count</Button>
        <Button icon={Sheet} loading={busy === "xlsx"} loadingText="Building Excel…" disabled={!!busy || !!invalid} onClick={() => run("xlsx")}>Download Excel</Button>
        <Button variant="secondary" icon={FileText} loading={busy === "pdf"} loadingText="Building PDF…" disabled={!!busy || !!invalid} onClick={() => run("pdf")}>Print or save PDF</Button>
      </div>
    </div>
  );
}
