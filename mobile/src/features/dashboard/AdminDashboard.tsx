import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import { BreakdownBars } from "@/components/analytics/BreakdownBars";
import { KpiTile } from "@/components/analytics/KpiTile";
import { defaultSelection, PeriodPicker, rangeError, selectionPeriod, type PeriodSelection } from "@/components/analytics/PeriodPicker";
import { TrendChart } from "@/components/analytics/TrendChart";
import { AppButton } from "@/components/ui/AppButton";
import { AppCard } from "@/components/ui/AppCard";
import { AppText } from "@/components/ui/AppText";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { StatCard } from "@/components/ui/StatCard";
import { Skeleton } from "@/components/ui/States";
import { useNetworkStore } from "@/store/networkStore";
import { colors } from "@/theme";
import { APPLICATION_STATUSES, type AdminAnalytics, type ReportResponse } from "@/types/api";
import { formatDateTime } from "@/utils/date";
import { APPLICATION_STATUS_VIEW, formatRupees } from "@/utils/labels";
import { bucketSeries, percentChange, type Period } from "@/utils/period";
import { useAnalytics } from "./useAnalytics";

const FORMS_UNIT = { one: "1/14 form", many: "1/14 forms" };

/** Admin home: analytics for a week / month / custom range, plus all-time work queues. */
export function AdminDashboard({ report, refreshKey }: { report: ReportResponse["report"] | null; refreshKey: number }) {
  const [selection, setSelection] = useState<PeriodSelection>(() => defaultSelection("week"));
  const invalid = rangeError(selection);
  const period = selectionPeriod(selection);
  const { data, updatedAt, loading, error, reload } = useAnalytics(period, !invalid);
  const isOnline = useNetworkStore((s) => s.isOnline);

  // Pull-to-refresh on the home screen bumps refreshKey.
  const seen = useRef(refreshKey);
  useEffect(() => {
    if (seen.current === refreshKey) return;
    seen.current = refreshKey;
    void reload();
  }, [refreshKey, reload]);

  return (
    <View style={{ marginBottom: 22 }}>
      <SectionHeader title="Dashboard" action="Export" onAction={() => openReports(period)} />
      <PeriodPicker value={selection} onChange={setSelection} />

      {invalid ? (
        <Note icon="alert-circle-outline" tone="error">{invalid}</Note>
      ) : !data ? (
        loading ? <DashboardSkeleton /> : (
          <Note icon={isOnline ? "alert-circle-outline" : "cloud-offline-outline"} tone={isOnline ? "error" : "muted"}>
            {isOnline ? error ?? "Couldn't load the dashboard. Pull down to retry." : "Connect to the internet to load this period."}
          </Note>
        )
      ) : (
        <Analytics data={data} period={period} />
      )}

      {data && !invalid ? (
        <AppText variant="small" style={{ marginTop: 8 }}>
          {loading ? "Updating…" : updatedAt ? `Updated ${formatDateTime(updatedAt)}` : ""}
          {error && !loading ? ` · ${error}` : ""}
        </AppText>
      ) : null}

      <View style={{ marginTop: 22 }}>
        <SectionHeader title="Needs attention" />
      </View>
      <View style={styles.row}>
        <StatCard
          value={report ? (report.forms_pending ?? 0) + (report.reviews_pending ?? 0) : "–"}
          label="Pending review"
          tone="warning"
          icon="hourglass-outline"
          onPress={() => router.push({ pathname: "/surveys", params: { tab: "forms" } })}
        />
        <StatCard value={report?.duplicate_count ?? "–"} label="Duplicates" tone="error" icon="copy-outline" onPress={() => router.push("/admin/duplicates")} />
      </View>
      <View style={[styles.row, { marginTop: 12 }]}>
        <StatCard value={report?.applications_pending ?? "–"} label="Benefits pending" tone="warning" icon="gift-outline" onPress={() => router.push("/admin/applications")} />
        <StatCard value={report?.farmers_total ?? "–"} label="Farmers (all time)" tone="info" icon="people-outline" onPress={() => router.push("/search")} />
      </View>
    </View>
  );
}

function Analytics({ data, period }: { data: AdminAnalytics; period: Period }) {
  const t = data.totals;
  const p = data.previous;
  const vs = `vs ${period.compareLabel}`;
  const appStatus = APPLICATION_STATUSES.filter((s) => data.applications_by_status[s]).map((s) => `${APPLICATION_STATUS_VIEW[s].label} ${data.applications_by_status[s]}`);
  const series = data.series.map((d) => ({ date: d.date, value: d.forms }));

  return (
    <View style={{ gap: 12, marginTop: 14 }}>
      <View style={styles.row}>
        <KpiTile value={t.forms} label="1/14 forms" icon="document-text-outline" change={percentChange(t.forms, p.forms)}
          onPress={() => router.push({ pathname: "/surveys", params: { tab: "forms" } })} />
        <KpiTile value={t.surveys} label="Field surveys" icon="map-outline" change={percentChange(t.surveys, p.surveys)}
          onPress={() => router.push({ pathname: "/surveys", params: { tab: "surveys" } })} />
      </View>
      <View style={styles.row}>
        <KpiTile value={t.farmers} label="New farmers" icon="people-outline" change={percentChange(t.farmers, p.farmers)} />
        <KpiTile value={t.applications} label="Benefit applications" icon="gift-outline" change={percentChange(t.applications, p.applications)}
          onPress={() => router.push("/admin/applications")} />
      </View>
      <AppText variant="small" style={{ marginTop: -4 }}>Change {vs}.</AppText>
      <View style={styles.row}>
        <KpiTile value={`${(t.land_sq_m / 10000).toFixed(t.land_sq_m >= 1_000_000 ? 0 : 1)} ha`} label="Land recorded" icon="resize-outline" note={`${t.forms_verified} form${t.forms_verified === 1 ? "" : "s"} verified`} />
        <KpiTile value={t.approved} label="Benefits approved" icon="ribbon-outline" note={`${formatRupees(t.disbursed_rs)} disbursed`} />
      </View>

      <Panel title="1/14 forms entered">
        <TrendChart key={period.from + period.to} buckets={bucketSeries(series)} unit={FORMS_UNIT} />
      </Panel>
      <Panel title="1/14 forms by taluka">
        <BreakdownBars items={data.forms_by_taluka.slice(0, 6)} />
      </Panel>
      <Panel title="Field surveys by crop">
        <BreakdownBars items={data.surveys_by_crop} />
      </Panel>
      <Panel title="Benefit applications by scheme">
        <BreakdownBars items={data.applications_by_scheme} />
        {appStatus.length ? <AppText variant="caption" style={{ marginTop: 10 }}>{appStatus.join(" · ")}</AppText> : null}
      </Panel>
      <Panel title="Most 1/14 forms entered by">
        <BreakdownBars items={data.top_users} />
      </Panel>
      {t.duplicates ? (
        <Note icon="copy-outline" tone="muted">
          {t.duplicates} field survey{t.duplicates === 1 ? " was" : "s were"} flagged as possible duplicates in this period.
        </Note>
      ) : null}
      <AppButton title="Export this period (Excel / PDF)" icon="download-outline" variant="secondary" onPress={() => openReports(period)} />
    </View>
  );
}

function openReports(period: Period) {
  router.push({ pathname: "/admin/reports", params: { from: period.from, to: period.to } });
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <AppCard style={{ gap: 12 }}>
      <AppText variant="bodyStrong" accessibilityRole="header">{title}</AppText>
      {children}
    </AppCard>
  );
}

function Note({ icon, tone, children }: { icon: "alert-circle-outline" | "cloud-offline-outline" | "copy-outline"; tone: "error" | "muted"; children: ReactNode }) {
  const color = tone === "error" ? colors.error : colors.muted;
  return (
    <View style={styles.note}>
      <Ionicons name={icon} size={16} color={color} />
      <AppText variant="caption" style={{ flex: 1 }}>{children}</AppText>
    </View>
  );
}

function DashboardSkeleton() {
  return (
    <View style={{ gap: 12, marginTop: 14 }}>
      <View style={styles.row}>
        <Skeleton style={{ flex: 1, height: 104, borderRadius: 16 }} />
        <Skeleton style={{ flex: 1, height: 104, borderRadius: 16 }} />
      </View>
      <View style={styles.row}>
        <Skeleton style={{ flex: 1, height: 104, borderRadius: 16 }} />
        <Skeleton style={{ flex: 1, height: 104, borderRadius: 16 }} />
      </View>
      <Skeleton style={{ height: 220, borderRadius: 16 }} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: 12 },
  note: { flexDirection: "row", gap: 8, alignItems: "center", marginTop: 14 },
});
