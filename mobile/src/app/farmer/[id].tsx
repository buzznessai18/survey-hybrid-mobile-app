import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { useMemo, useState } from "react";
import { Pressable, RefreshControl, StyleSheet, View } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { AppButton } from "@/components/ui/AppButton";
import { AppCard } from "@/components/ui/AppCard";
import { AppText } from "@/components/ui/AppText";
import { Avatar } from "@/components/ui/Avatar";
import { InfoRow } from "@/components/ui/InfoRow";
import { Screen } from "@/components/ui/Screen";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/States";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { LandFormCard } from "@/components/records/LandFormCard";
import { SurveyCard } from "@/components/survey/SurveyCard";
import { useRemote } from "@/features/common/useRemote";
import { useStartSurvey } from "@/features/surveys/useStartSurvey";
import { FarmerService } from "@/services/records/RecordServices";
import { useCanEditRecords } from "@/store/authStore";
import { colors, radius } from "@/theme";
import type { Application, EligibilityResult, FarmerProfile, LandForm, LinkedSurvey } from "@/types/api";
import { formatDateTime, formatShortDate } from "@/utils/date";
import { formatArea, surveyNumberLabel } from "@/utils/format";
import {
  APPLICATION_STATUS_VIEW, BENEFIT_GROUPS, BENEFIT_STAGE, CATEGORY_LABELS, FORM_STATUS_VIEW, formatRupees, formatSqM,
  GENDER_LABELS, SCHEME_CATEGORY_LABELS,
} from "@/utils/labels";
import { serverStatusView } from "@/utils/status";

/**
 * Farmer 360: who the farmer is, their land / survey numbers / 1/14 forms, what they have
 * already received, what is still pending, and what they may be eligible for.
 * Admins and company users see everything and get add / edit actions (the legacy field role is read-only).
 */
export default function FarmerProfileScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, loading, error, reload } = useRemote<FarmerProfile>(() => FarmerService.get(id), id);
  const canEdit = useCanEditRecords();
  const startForm = useStartSurvey();

  if (!data) {
    return (
      <Screen header={<ScreenHeader title="Farmer" />} scroll={false}>
        {loading ? <LoadingState label="Loading farmer…" /> : <ErrorState offline={error?.offline} message={error?.message} onRetry={reload} />}
      </Screen>
    );
  }
  const { farmer } = data;

  const addForm = () =>
    startForm({
      id: farmer.id, name: farmer.name, mobile: farmer.mobile, fatherName: farmer.father_name ?? "", gender: farmer.gender ?? "",
      category: farmer.category ?? "", village: farmer.village ?? "", taluka: farmer.taluka ?? "",
    });

  return (
    <Screen
      header={
        <ScreenHeader
          title="Farmer Profile"
          right={canEdit ? (
            <Pressable onPress={() => router.push({ pathname: "/farmer/edit", params: { id: farmer.id } })} hitSlop={10} accessibilityRole="button" accessibilityLabel="Edit farmer">
              <AppText variant="label" style={{ color: colors.primary }}>Edit</AppText>
            </Pressable>
          ) : undefined}
        />
      }
      refreshControl={<RefreshControl refreshing={loading} onRefresh={reload} tintColor={colors.primary} />}
      footer={canEdit ? (
        <View style={styles.footer}>
          <AppButton
            title="Add benefit"
            icon="gift-outline"
            variant="secondary"
            style={{ flex: 1 }}
            onPress={() => router.push({ pathname: "/admin/application", params: { farmer_id: farmer.id } })}
          />
          <AppButton title="Add 1/14 Form" icon="add" style={{ flex: 1 }} onPress={addForm} />
        </View>
      ) : undefined}
    >
      <Animated.View entering={FadeInDown.duration(250)}>
        <Farmer360 data={data} canEdit={canEdit} />
      </Animated.View>
    </Screen>
  );
}

function Farmer360({ data, canEdit }: { data: FarmerProfile; canEdit: boolean }) {
  const { farmer, forms, surveys, applications, eligibility } = data;
  const byStage = useMemo(() => {
    const out = { received: [] as Application[], pending: [] as Application[], rejected: [] as Application[] };
    for (const a of applications) out[BENEFIT_STAGE[a.status]].push(a);
    return out;
  }, [applications]);
  // Eligible under the configured rules, and not already applied for / received.
  const possible = useMemo(
    () => eligibility.filter((r) => r.eligible && !applications.some((a) => a.scheme_id === r.scheme_id && a.status !== "rejected")),
    [eligibility, applications],
  );
  const openApplication = canEdit
    ? (a: Application) => router.push({ pathname: "/admin/application", params: { id: a.id, farmer_id: farmer.id } })
    : undefined;

  return (
    <>
      <AppCard style={styles.hero}>
        <Avatar name={farmer.name} size={56} />
        <View style={{ flex: 1 }}>
          <AppText variant="title">{farmer.name}</AppText>
          <AppText variant="caption">{farmer.mobile}</AppText>
          <AppText variant="caption">{[farmer.village, farmer.taluka].filter(Boolean).join(", ") || "Village not recorded"}</AppText>
        </View>
      </AppCard>

      <View style={styles.stats}>
        <Stat value={String(forms.length)} label="1/14 forms" />
        <Stat value={formatSqM(farmer.land_sq_m).split(" (")[0]} label="Total land" />
        <Stat value={String(byStage.received.length)} label="Received" tone="primary" />
        <Stat value={String(byStage.pending.length)} label="Pending" tone="warning" />
      </View>

      {/* Farmer information */}
      <SectionHeader
        title="Farmer information"
        action={canEdit ? "Edit" : undefined}
        onAction={canEdit ? () => router.push({ pathname: "/farmer/edit", params: { id: farmer.id } }) : undefined}
      />
      <AppCard>
        <InfoRow label="Mobile" value={farmer.mobile} />
        <InfoRow label="Father / husband" value={farmer.father_name ?? "—"} />
        <InfoRow label="Gender" value={farmer.gender ? GENDER_LABELS[farmer.gender] : "—"} />
        <InfoRow label="Category" value={farmer.category ? CATEGORY_LABELS[farmer.category] : "—"} />
        <InfoRow label="Village / taluka" value={[farmer.village, farmer.taluka].filter(Boolean).join(", ") || "—"} />
        <InfoRow label="Address" value={farmer.address ?? "—"} />
        <InfoRow label="Registered" value={formatShortDate(farmer.created_at)} last />
      </AppCard>

      {/* What has the farmer received / what is pending */}
      <Section title="Benefits at a glance">
        <AppCard style={styles.glance}>
          <Glance value={byStage.received.length} label="Received" tone={colors.primary} />
          <Glance value={byStage.pending.length} label="Pending" tone={colors.warning} />
          <Glance value={byStage.rejected.length} label="Rejected" tone={colors.error} />
          <Glance value={possible.length} label="May be eligible" tone={colors.success} />
        </AppCard>
        {byStage.received.length ? (
          <AppText variant="small" style={{ marginTop: 6 }}>
            Received: {byStage.received.map((a) => a.scheme_name).filter(Boolean).join(", ")}
          </AppText>
        ) : (
          <AppText variant="small" style={{ marginTop: 6 }}>No benefits received yet.</AppText>
        )}
      </Section>

      {/* Land & survey */}
      <Section title={`Land & survey · ${forms.length}`}>
        {forms.length === 0 ? (
          <AppText variant="caption">No land recorded.</AppText>
        ) : (
          <AppCard style={{ paddingVertical: 4 }}>
            {forms.map((f, i) => <LandRow key={f.id} form={f} last={i === forms.length - 1} canEdit={canEdit} />)}
          </AppCard>
        )}
        {surveys.length ? (
          <View style={{ marginTop: 10 }}>
            <AppText variant="label" style={{ marginBottom: 6 }}>Field surveys · {surveys.length}</AppText>
            {surveys.map((s) => <SurveyCard key={s.id} data={surveyCard(s)} onPress={() => router.push({ pathname: "/survey/[id]", params: { id: s.id } })} />)}
          </View>
        ) : null}
      </Section>

      {/* 1/14 forms */}
      <Section title={`1/14 forms · ${forms.length}`}>
        {forms.length === 0 ? (
          <EmptyState icon="document-outline" title="No 1/14 forms" message={canEdit ? "Add the farmer's land record from the button below." : "No 1/14 form has been recorded for this farmer."} />
        ) : (
          forms.map((f) => <LandFormCard key={f.id} form={f} onPress={() => router.push({ pathname: "/form/[id]", params: { id: f.id } })} />)
        )}
      </Section>

      {/* Benefits by type: subsidies, tractor / equipment, services */}
      {BENEFIT_GROUPS.map((g) => {
        const rows = applications.filter((a) => g.categories.includes(a.scheme_category ?? "subsidy"));
        return (
          <Section key={g.key} title={`${g.title} · ${rows.length}`}>
            {rows.length === 0 ? (
              <AppText variant="caption">None recorded.</AppText>
            ) : (
              rows.map((a) => <BenefitRow key={a.id} a={a} onPress={openApplication} />)
            )}
          </Section>
        );
      })}

      {/* Pending & possible benefits */}
      <Section title="Pending & possible benefits">
        {byStage.pending.length === 0 && possible.length === 0 ? <AppText variant="caption">Nothing pending.</AppText> : null}
        {byStage.pending.map((a) => <BenefitRow key={a.id} a={a} onPress={openApplication} />)}
        {possible.map((r) => (
          <View key={r.scheme_id} style={styles.row}>
            <Ionicons name="sparkles-outline" size={20} color={colors.success} />
            <View style={{ flex: 1 }}>
              <AppText variant="bodyStrong">{r.scheme_name}</AppText>
              <AppText variant="small">Not applied yet · meets all configured rules</AppText>
            </View>
            <StatusBadge label="May be eligible" tone="success" />
          </View>
        ))}
        <Eligibility farmerId={farmer.id} results={eligibility} canEdit={canEdit} />
      </Section>

      {/* Applications & history */}
      <Section title="Applications & history">
        <History forms={forms} surveys={surveys} applications={applications} />
      </Section>
    </>
  );
}

/** Small pencil button for editing one item (kept separate from the row's own tap target). */
function EditButton({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} hitSlop={10} accessibilityRole="button" accessibilityLabel={label} style={({ pressed }) => [{ padding: 4 }, pressed && { opacity: 0.6 }]}>
      <Ionicons name="create-outline" size={20} color={colors.primary} />
    </Pressable>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={{ marginTop: 20 }}>
      <SectionHeader title={title} />
      {children}
    </View>
  );
}

function LandRow({ form, last, canEdit }: { form: LandForm; last: boolean; canEdit: boolean }) {
  const st = FORM_STATUS_VIEW[form.status];
  return (
    <Pressable
      onPress={() => router.push({ pathname: "/form/[id]", params: { id: form.id } })}
      style={({ pressed }) => [styles.landRow, !last && styles.divider, pressed && { opacity: 0.85 }]}
      accessibilityRole="button"
      accessibilityLabel={`Survey number ${surveyNumberLabel(form.survey_number, form.sub_division)}, ${form.village}`}
    >
      <View style={{ flex: 1 }}>
        <AppText variant="bodyStrong">Sy. {surveyNumberLabel(form.survey_number, form.sub_division)} · {form.village}</AppText>
        <AppText variant="small">
          {[form.form_id, form.area_sq_m ? formatSqM(form.area_sq_m) : null, form.kharif_crop_name, form.rabi_crop_name].filter(Boolean).join(" • ")}
        </AppText>
      </View>
      <StatusBadge label={st.label} tone={st.tone} />
      {canEdit ? <EditButton label={`Edit form ${form.form_id}`} onPress={() => router.push({ pathname: "/form/edit/[id]", params: { id: form.id } })} /> : null}
    </Pressable>
  );
}

function BenefitRow({ a, onPress }: { a: Application; onPress?: (a: Application) => void }) {
  const st = APPLICATION_STATUS_VIEW[a.status];
  const body = (
    <>
      <View style={{ flex: 1 }}>
        <AppText variant="bodyStrong">{a.scheme_name}</AppText>
        <AppText variant="small">
          {[a.scheme_category ? SCHEME_CATEGORY_LABELS[a.scheme_category] : null, a.application_no, formatShortDate(a.applied_on), a.amount_rs ? formatRupees(a.amount_rs) : null]
            .filter(Boolean).join(" • ")}
        </AppText>
        {a.status === "disbursed" && a.decided_at ? <AppText variant="small">Received on {formatShortDate(a.decided_at)}</AppText> : null}
        <AppText variant="small">Added {formatDateTime(a.created_at)}</AppText>
        {a.remarks ? <AppText variant="caption" numberOfLines={2}>{a.remarks}</AppText> : null}
      </View>
      <View style={{ alignItems: "flex-end", gap: 8 }}>
        <StatusBadge label={st.label} tone={st.tone} />
        {onPress ? <Ionicons name="create-outline" size={18} color={colors.primary} /> : null}
      </View>
    </>
  );
  if (!onPress) return <View style={styles.row}>{body}</View>;
  return (
    <Pressable onPress={() => onPress(a)} style={({ pressed }) => [styles.row, pressed && { opacity: 0.85 }]} accessibilityRole="button" accessibilityLabel={`Edit ${a.scheme_name ?? "benefit"}`}>
      {body}
    </Pressable>
  );
}

type HistoryItem = { key: string; date: string; icon: "document-text-outline" | "map-outline" | "gift-outline"; title: string; detail: string };

/** Everything that happened for this farmer, newest first. */
function History({ forms, surveys, applications }: { forms: LandForm[]; surveys: LinkedSurvey[]; applications: Application[] }) {
  const items = useMemo<HistoryItem[]>(() => {
    const out: HistoryItem[] = [
      ...forms.map((f) => ({
        key: `f-${f.id}`, date: f.created_at, icon: "document-text-outline" as const,
        title: `1/14 form ${f.form_id} recorded`, detail: `Sy. ${surveyNumberLabel(f.survey_number, f.sub_division)}, ${f.village} · ${FORM_STATUS_VIEW[f.status].label}`,
      })),
      ...surveys.map((s) => ({
        key: `s-${s.id}`, date: s.visit_date, icon: "map-outline" as const,
        title: `Field survey ${s.survey_id}`, detail: [surveyNumberLabel(s.survey_number, s.sub_division), s.crop_name, s.collected_by_name].filter(Boolean).join(" · "),
      })),
      ...applications.map((a) => ({
        key: `a-${a.id}`, date: a.status === "disbursed" && a.decided_at ? a.decided_at : a.applied_on, icon: "gift-outline" as const,
        title: `${a.scheme_name ?? "Benefit"} — ${APPLICATION_STATUS_VIEW[a.status].label}`,
        detail: [a.application_no, `added ${formatDateTime(a.created_at)}`, a.remarks].filter(Boolean).join(" · "),
      })),
    ];
    return out.sort((x, y) => y.date.localeCompare(x.date));
  }, [forms, surveys, applications]);

  if (items.length === 0) return <AppText variant="caption">No history yet.</AppText>;
  return (
    <AppCard style={{ paddingVertical: 4 }}>
      {items.map((it, i) => (
        <View key={it.key} style={[styles.historyRow, i < items.length - 1 && styles.divider]}>
          <Ionicons name={it.icon} size={18} color={colors.primary} style={{ marginTop: 2 }} />
          <View style={{ flex: 1 }}>
            <AppText variant="label">{it.title}</AppText>
            {it.detail ? <AppText variant="small" numberOfLines={2}>{it.detail}</AppText> : null}
          </View>
          <AppText variant="small">{formatShortDate(it.date)}</AppText>
        </View>
      ))}
    </AppCard>
  );
}

function surveyCard(s: LinkedSurvey) {
  return {
    key: s.id,
    title: surveyNumberLabel(s.survey_number, s.sub_division),
    farmer: s.form_id ? `1/14 ${s.form_id}` : "Field survey",
    meta: [formatArea(s.area, s.area_unit), s.crop_name, s.collected_by_name ? `by ${s.collected_by_name}` : null].filter(Boolean).join(" • "),
    time: formatShortDate(s.visit_date),
    status: serverStatusView(s),
    photoUri: s.photo_url,
  };
}

function Stat({ value, label, tone }: { value: string; label: string; tone?: "primary" | "warning" }) {
  const color = tone === "warning" ? colors.warning : colors.primaryDark;
  return (
    <View style={styles.stat}>
      <AppText variant="heading" style={{ color }}>{value}</AppText>
      <AppText variant="small">{label}</AppText>
    </View>
  );
}

function Glance({ value, label, tone }: { value: number; label: string; tone: string }) {
  return (
    <View style={{ flex: 1, alignItems: "center", gap: 2 }}>
      <AppText variant="heading" style={{ color: tone }}>{value}</AppText>
      <AppText variant="small" style={{ textAlign: "center" }}>{label}</AppText>
    </View>
  );
}

/** Rule-by-rule check against every active scheme (rules are configured by admins). */
function Eligibility({ farmerId, results, canEdit }: { farmerId: string; results: EligibilityResult[]; canEdit: boolean }) {
  const [shown, setShown] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const withRules = results.filter((r) => r.checks.length > 0);
  if (withRules.length === 0) return null;
  return (
    <View style={{ marginTop: 6 }}>
      <Pressable onPress={() => setShown(!shown)} style={styles.toggle} accessibilityRole="button" accessibilityState={{ expanded: shown }}>
        <AppText variant="label" style={{ color: colors.primary }}>{shown ? "Hide" : "Show"} eligibility check ({withRules.length} schemes)</AppText>
        <Ionicons name={shown ? "chevron-up" : "chevron-down"} size={16} color={colors.primary} />
      </Pressable>
      {shown ? withRules.map((r) => {
        const expanded = open === r.scheme_id;
        return (
          <AppCard key={r.scheme_id} style={{ marginBottom: 10, gap: 8 }}>
            <Pressable onPress={() => setOpen(expanded ? null : r.scheme_id)} style={styles.eligHead} accessibilityRole="button" accessibilityState={{ expanded }}>
              <Ionicons name={r.eligible ? "checkmark-circle" : "close-circle"} size={22} color={r.eligible ? colors.success : colors.error} />
              <View style={{ flex: 1 }}>
                <AppText variant="bodyStrong">{r.scheme_name}</AppText>
                <AppText variant="small">{r.eligible ? "Eligible" : `Not eligible · ${r.checks.filter((c) => !c.passed).length} rule(s) not met`}</AppText>
              </View>
              <Ionicons name={expanded ? "chevron-up" : "chevron-down"} size={18} color={colors.muted} />
            </Pressable>
            {expanded ? (
              <View style={{ gap: 6 }}>
                {r.checks.map((c) => (
                  <View key={c.rule} style={styles.check}>
                    <Ionicons name={c.passed ? "checkmark" : "close"} size={16} color={c.passed ? colors.success : colors.error} />
                    <View style={{ flex: 1 }}>
                      <AppText variant="label">{c.label}</AppText>
                      {c.detail ? <AppText variant="small">{c.detail}</AppText> : null}
                    </View>
                  </View>
                ))}
                {canEdit ? (
                  <AppButton
                    title={r.eligible ? "Create application" : "Create application anyway"}
                    compact
                    variant={r.eligible ? "primary" : "secondary"}
                    icon="document-attach-outline"
                    onPress={() => router.push({ pathname: "/admin/application", params: { farmer_id: farmerId, scheme_id: r.scheme_id } })}
                  />
                ) : null}
              </View>
            ) : null}
          </AppCard>
        );
      }) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  hero: { flexDirection: "row", alignItems: "center", gap: 14 },
  stats: { flexDirection: "row", gap: 8, marginVertical: 12 },
  stat: { flex: 1, backgroundColor: colors.primarySoft, borderRadius: radius.md, paddingVertical: 12, paddingHorizontal: 4, alignItems: "center", gap: 2 },
  footer: { flexDirection: "row", gap: 10 },
  glance: { flexDirection: "row", gap: 6 },
  row: {
    flexDirection: "row", alignItems: "center", gap: 10, padding: 12, marginBottom: 8, backgroundColor: colors.card,
    borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border,
  },
  landRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10 },
  historyRow: { flexDirection: "row", gap: 10, paddingVertical: 10, alignItems: "flex-start" },
  divider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  toggle: { flexDirection: "row", alignItems: "center", gap: 4, paddingVertical: 8 },
  eligHead: { flexDirection: "row", alignItems: "center", gap: 10 },
  check: { flexDirection: "row", gap: 8, alignItems: "flex-start", paddingLeft: 4 },
});
