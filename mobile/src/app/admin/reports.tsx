import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Alert, View } from "react-native";
import { AppButton } from "@/components/ui/AppButton";
import { AppCard } from "@/components/ui/AppCard";
import { Chip } from "@/components/ui/Chip";
import { defaultSelection, PeriodPicker, rangeError, selectionPeriod, type PeriodSelection } from "@/components/analytics/PeriodPicker";
import { AppInput } from "@/components/ui/AppInput";
import { AppText } from "@/components/ui/AppText";
import { Screen } from "@/components/ui/Screen";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { RadioOption } from "@/components/forms/RadioOption";
import { SelectField } from "@/components/forms/SelectField";
import { errorMessage } from "@/services/api/errors";
import { ExportService } from "@/services/records/RecordServices";
import { ReportExporter, summarize } from "@/services/reports/ReportExporter";
import { useNetworkStore } from "@/store/networkStore";
import { colors } from "@/theme";
import { GOA_TALUKAS, type ExportDataset, type ExportResult, type Taluka } from "@/types/api";
import { localDayRange } from "@/utils/date";
import { formatReceiptDateTime } from "@/utils/receipt";

const DATASETS: { value: ExportDataset; label: string }[] = [
  { value: "records", label: "Farmer service records" },
  { value: "surveys", label: "Field surveys" },
  { value: "forms", label: "1/14 forms (land records)" },
  { value: "farmers", label: "Farmers" },
  { value: "applications", label: "Benefits & subsidies" },
];
const isDate = (v: unknown): v is string => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);

/** Admin: weekly / monthly / custom-range Excel (.xlsx) and PDF reports, shared from the phone. */
export default function ReportsScreen() {
  const isOnline = useNetworkStore((s) => s.isOnline);
  // Opened from the dashboard with its period: start on that exact range.
  const params = useLocalSearchParams<{ from?: string; to?: string }>();
  const [dataset, setDataset] = useState<ExportDataset>("records");
  const [search, setSearch] = useState("");
  const [allDates, setAllDates] = useState(false);
  const [selection, setSelection] = useState<PeriodSelection>(() =>
    isDate(params.from) && isDate(params.to) ? { mode: "custom", offset: 0, custom: { from: params.from, to: params.to } } : defaultSelection("month"),
  );
  const [taluka, setTaluka] = useState<Taluka | "">("");
  const [busy, setBusy] = useState<"preview" | "xlsx" | "pdf" | null>(null);
  const [preview, setPreview] = useState<ExportResult | null>(null);

  const invalid = allDates ? null : rangeError(selection);
  const period = selectionPeriod(selection);

  const fetchData = async () => {
    if (invalid) throw new Error(invalid);
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
    try {
      const result = await fetchData();
      setPreview(result);
      if (result.rows.length === 0 && kind !== "preview") return Alert.alert("No records", "No records match these filters.");
      if (kind === "xlsx") await ReportExporter.shareExcel(result);
      // Records: every column (service details and who recorded it matter); other reports keep 9.
      if (kind === "pdf") await ReportExporter.sharePdf(result, 300, dataset === "records" ? result.columns.length : 9);
    } catch (e) {
      Alert.alert("Report failed", e instanceof Error && !("kind" in e) ? e.message : errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <Screen header={<ScreenHeader title="Reports" />}>
      <AppText variant="heading" style={{ marginBottom: 10 }}>Report</AppText>
      <View accessibilityRole="radiogroup">
        {DATASETS.map((d) => <RadioOption key={d.value} label={d.label} selected={dataset === d.value} onPress={() => { setDataset(d.value); setPreview(null); }} />)}
      </View>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 14, marginBottom: 10 }}>
        <AppText variant="heading">Period</AppText>
        <Chip label="All dates" selected={allDates} onPress={() => { setAllDates(!allDates); setPreview(null); }} />
      </View>
      {allDates ? (
        <AppText variant="caption" style={{ marginBottom: 16 }}>Every record, regardless of date.</AppText>
      ) : (
        <View style={{ marginBottom: 16 }}>
          <PeriodPicker value={selection} onChange={(v) => { setSelection(v); setPreview(null); }} />
          {invalid ? <AppText variant="small" style={{ color: colors.error, marginTop: 8 }}>{invalid}</AppText> : null}
        </View>
      )}
      {dataset === "records" ? (
        <AppInput
          label="Search"
          icon="search"
          value={search}
          onChangeText={(v) => { setSearch(v); setPreview(null); }}
          placeholder="Farmer name, survey no. or sub-division"
          autoCorrect={false}
          hint="Leave empty to include every record in the period."
        />
      ) : (
      <SelectField label="Taluka" searchable value={taluka} options={[{ value: "", label: "All talukas" }, ...GOA_TALUKAS.map((t) => ({ value: t, label: t }))]} onChange={(v) => setTaluka(v as Taluka | "")} />
      )}

      {preview ? (
        <AppCard style={{ gap: 6, marginBottom: 14 }}>
          <AppText variant="bodyStrong">{preview.title}: {preview.total} record{preview.total === 1 ? "" : "s"}</AppText>
          {summarize(preview).slice(0, 2).map((s) => (
            <AppText key={s.label} variant="caption">{s.label}: {s.counts.slice(0, 5).map(([k, n]) => `${k} ${n}`).join(" · ")}</AppText>
          ))}
          {preview.truncated ? <AppText variant="small" style={{ color: colors.warning }}>Large report: first {preview.rows.length} rows are included.</AppText> : null}
        </AppCard>
      ) : null}

      <View style={{ gap: 10 }}>
        <AppButton title="Preview count" variant="ghost" icon="eye-outline" loading={busy === "preview"} disabled={!isOnline || !!busy || !!invalid} onPress={() => run("preview")} />
        <AppButton title="Export Excel (.xlsx)" icon="grid-outline" loading={busy === "xlsx"} loadingTitle="Building Excel…" disabled={!isOnline || !!busy || !!invalid} onPress={() => run("xlsx")} />
        <AppButton title="Export PDF" icon="document-outline" variant="secondary" loading={busy === "pdf"} loadingTitle="Building PDF…" disabled={!isOnline || !!busy || !!invalid} onPress={() => run("pdf")} />
      </View>
      {!isOnline ? (
        <View style={{ flexDirection: "row", gap: 6, alignItems: "center", marginTop: 12 }}>
          <Ionicons name="cloud-offline-outline" size={16} color={colors.muted} />
          <AppText variant="small">Reports need an internet connection.</AppText>
        </View>
      ) : null}
      <AppText variant="small" style={{ marginTop: 12 }}>Files open the share sheet so you can send them by WhatsApp, email or save to Drive.</AppText>
    </Screen>
  );
}
