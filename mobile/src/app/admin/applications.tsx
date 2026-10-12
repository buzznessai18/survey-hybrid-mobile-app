import { router } from "expo-router";
import { useState } from "react";
import { FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { AppText } from "@/components/ui/AppText";
import { Chip } from "@/components/ui/Chip";
import { useTopInset } from "@/components/ui/Screen";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { EmptyState, ErrorState, SurveyCardSkeleton } from "@/components/ui/States";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { useRemote } from "@/features/common/useRemote";
import { ApplicationService } from "@/services/records/RecordServices";
import { colors, radius, shadow } from "@/theme";
import { APPLICATION_STATUSES, type ApplicationStatus } from "@/types/api";
import { formatDateTime, formatShortDate } from "@/utils/date";
import { APPLICATION_STATUS_VIEW, formatRupees, SCHEME_CATEGORY_LABELS } from "@/utils/labels";

/** Admin: benefits, services and subsidies given / applied for, across all farmers. */
export default function ApplicationsScreen() {
  const top = useTopInset();
  const [status, setStatus] = useState<ApplicationStatus | "open" | "all">("open");
  const filter = status === "all" ? undefined : status === "open" ? (["applied", "under_review"] as ApplicationStatus[]) : [status];
  const { data, loading, error, reload } = useRemote(() => ApplicationService.list({ status: filter }), status);
  return (
    <View style={{ flex: 1, backgroundColor: colors.background, paddingTop: top }}>
      <ScreenHeader title="Benefits & Subsidies Given" />
      <View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: 16, paddingBottom: 12 }}>
          <Chip label="Open" selected={status === "open"} onPress={() => setStatus("open")} />
          {APPLICATION_STATUSES.map((s) => <Chip key={s} label={APPLICATION_STATUS_VIEW[s].label} selected={status === s} onPress={() => setStatus(s)} />)}
          <Chip label="All" selected={status === "all"} onPress={() => setStatus("all")} />
        </ScrollView>
      </View>
      <FlatList
        data={data ?? []}
        keyExtractor={(a) => a.id}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24, flexGrow: 1 }}
        refreshControl={<RefreshControl refreshing={loading && !!data} onRefresh={reload} tintColor={colors.primary} />}
        renderItem={({ item: a }) => {
          const st = APPLICATION_STATUS_VIEW[a.status];
          return (
            <Pressable onPress={() => router.push({ pathname: "/admin/application", params: { id: a.id, farmer_id: a.farmer_id } })} style={({ pressed }) => [styles.card, pressed && { opacity: 0.85 }]} accessibilityRole="button">
              <View style={{ flex: 1, gap: 2 }}>
                <AppText variant="bodyStrong">{a.farmer_name}</AppText>
                <AppText variant="caption">{a.scheme_name}{a.scheme_category ? ` · ${SCHEME_CATEGORY_LABELS[a.scheme_category]}` : ""}</AppText>
                <AppText variant="small">
                  {a.application_no} • {formatShortDate(a.applied_on)} • {formatRupees(a.amount_rs)}
                  {a.farmer_village ? ` • ${a.farmer_village}` : ""}
                </AppText>
                <AppText variant="small">Added {formatDateTime(a.created_at)}</AppText>
              </View>
              <StatusBadge label={st.label} tone={st.tone} />
            </Pressable>
          );
        }}
        ListEmptyComponent={loading ? <SurveyCardSkeleton /> : error ? <ErrorState offline={error.offline} message={error.message} onRetry={reload} /> : (
          <EmptyState icon="document-attach-outline" title="No applications" message="Add benefits from a farmer's profile (Add benefit)." />
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: colors.card, borderRadius: radius.lg, padding: 14, marginBottom: 10, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, ...shadow.card },
});
