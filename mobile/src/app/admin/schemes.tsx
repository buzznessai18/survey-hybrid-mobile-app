import { router } from "expo-router";
import { FlatList, Pressable, RefreshControl, StyleSheet, View } from "react-native";
import { AppButton } from "@/components/ui/AppButton";
import { AppText } from "@/components/ui/AppText";
import { useTopInset } from "@/components/ui/Screen";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { EmptyState, ErrorState, SurveyCardSkeleton } from "@/components/ui/States";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { useRemote } from "@/features/common/useRemote";
import { SchemeService } from "@/services/records/RecordServices";
import { colors, radius, shadow } from "@/theme";
import type { Scheme } from "@/types/api";
import { formatRupees, formatSqM, SCHEME_CATEGORY_LABELS } from "@/utils/labels";

export function describeRules(s: Scheme): string[] {
  const r = s.rules;
  const out: string[] = [];
  if (r.min_land_sq_m !== undefined) out.push(`Land ≥ ${formatSqM(r.min_land_sq_m)}`);
  if (r.max_land_sq_m !== undefined) out.push(`Land ≤ ${formatSqM(r.max_land_sq_m)}`);
  if (r.eligible_talukas?.length) out.push(`Talukas: ${r.eligible_talukas.join(", ")}`);
  if (r.eligible_categories?.length) out.push(`Categories: ${r.eligible_categories.map((c) => c.toUpperCase()).join(", ")}`);
  if (r.eligible_crop_ids?.length) out.push(`${r.eligible_crop_ids.length} eligible crop(s)`);
  if (r.cooldown_years) out.push(`Once in ${r.cooldown_years} years`);
  if (r.max_applications_per_farmer) out.push(`Max ${r.max_applications_per_farmer} application(s)`);
  if (r.require_verified_land) out.push("Verified 1/14 only");
  return out;
}

/** Admin: benefit & scheme types (tractor, equipment, cylinder, subsidies, services, …). */
export default function SchemesScreen() {
  const top = useTopInset();
  const { data, loading, error, reload } = useRemote(() => SchemeService.list());
  return (
    <View style={{ flex: 1, backgroundColor: colors.background, paddingTop: top }}>
      <ScreenHeader title="Benefit & Scheme Types" right={<AppButton title="New" compact variant="secondary" icon="add" onPress={() => router.push("/admin/scheme")} />} />
      <FlatList
        data={data ?? []}
        keyExtractor={(s) => s.id}
        contentContainerStyle={{ padding: 16, paddingTop: 4, flexGrow: 1 }}
        refreshControl={<RefreshControl refreshing={loading && !!data} onRefresh={reload} tintColor={colors.primary} />}
        renderItem={({ item: s }) => {
          const counts = s.application_counts ?? {};
          const total = Object.values(counts).reduce((a, b) => a + (b ?? 0), 0);
          return (
            <Pressable onPress={() => router.push({ pathname: "/admin/scheme", params: { id: s.id } })} style={({ pressed }) => [styles.card, pressed && { opacity: 0.85 }]} accessibilityRole="button">
              <View style={{ flexDirection: "row", justifyContent: "space-between", gap: 8 }}>
                <View style={{ flex: 1 }}>
                  <AppText variant="bodyStrong">{s.name}</AppText>
                  <AppText variant="small">{SCHEME_CATEGORY_LABELS[s.category]} • {s.code}{s.department ? ` • ${s.department}` : ""}</AppText>
                </View>
                <StatusBadge label={s.status === "active" ? "Active" : "Inactive"} tone={s.status === "active" ? "success" : "neutral"} />
              </View>
              {s.benefit || s.subsidy_percent ? (
                <AppText variant="caption">
                  {s.subsidy_percent ? `${s.subsidy_percent}% subsidy` : ""}{s.max_amount_rs ? ` up to ${formatRupees(s.max_amount_rs)}` : ""}{s.benefit ? ` • ${s.benefit}` : ""}
                </AppText>
              ) : null}
              <AppText variant="small">{describeRules(s).join(" · ") || "No eligibility rules"}</AppText>
              <AppText variant="small" style={{ color: colors.primaryDark }}>
                {total} application{total === 1 ? "" : "s"}{counts.approved ? ` • ${counts.approved} approved` : ""}{counts.disbursed ? ` • ${counts.disbursed} received` : ""}
              </AppText>
            </Pressable>
          );
        }}
        ListEmptyComponent={loading ? <SurveyCardSkeleton /> : error ? <ErrorState offline={error.offline} message={error.message} onRetry={reload} /> : (
          <EmptyState icon="ribbon-outline" title="No benefit types yet" actionTitle="Create one" onAction={() => router.push("/admin/scheme")} />
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.card, borderRadius: radius.lg, padding: 14, marginBottom: 10, gap: 6, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, ...shadow.card },
});
