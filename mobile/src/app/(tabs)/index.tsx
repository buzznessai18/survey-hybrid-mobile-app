import { Ionicons } from "@expo/vector-icons";
import { router, type Href } from "expo-router";
import type { ComponentProps } from "react";
import { useState } from "react";
import { Pressable, RefreshControl, StyleSheet, TextInput, View } from "react-native";
import { ServiceRecordCard } from "@/components/records/ServiceRecordCard";
import { AppButton } from "@/components/ui/AppButton";
import { AppText } from "@/components/ui/AppText";
import { Avatar } from "@/components/ui/Avatar";
import { Screen } from "@/components/ui/Screen";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { EmptyState, ErrorState, SurveyCardSkeleton } from "@/components/ui/States";
import { useRemote } from "@/features/common/useRemote";
import { useUnsyncedCount } from "@/features/sync/hooks";
import { ServiceRecordService } from "@/services/records/ServiceRecordService";
import { useAuthStore, useCanEditRecords, useIsAdmin } from "@/store/authStore";
import { useNetworkStore } from "@/store/networkStore";
import { colors, fonts, radius, shadow } from "@/theme";
import { formatLongDate, greeting } from "@/utils/date";
import { firstName } from "@/utils/format";

/** Home: add a record, search records, the latest records, and (admins) reports & users. */
export default function HomeScreen() {
  const profile = useAuthStore((s) => s.profile);
  const isAdmin = useIsAdmin();
  const canEdit = useCanEditRecords();
  const isOnline = useNetworkStore((s) => s.isOnline);
  const recent = useRemote(() => ServiceRecordService.list({ page_size: 5 }), isOnline ? "on" : "off");
  const { pending, failed } = useUnsyncedCount();
  const waiting = pending + failed;

  return (
    <Screen
      refreshControl={<RefreshControl refreshing={recent.loading && !!recent.data} onRefresh={recent.reload} tintColor={colors.primary} />}
      contentStyle={{ paddingTop: 12 }}
    >
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <AppText variant="caption">{greeting()},</AppText>
          <AppText variant="display" numberOfLines={1}>{firstName(profile?.full_name)} 👋</AppText>
          <AppText variant="caption" style={{ marginTop: 2 }}>{formatLongDate()}</AppText>
        </View>
        <Avatar name={profile?.full_name} onPress={() => router.push("/profile")} />
      </View>
      <View style={styles.pills}>
        <View style={styles.rolePill}>
          <AppText variant="small" style={{ color: colors.primaryDark }}>{isAdmin ? "Admin" : canEdit ? "Regular user" : "View only"}</AppText>
        </View>
      </View>

      {canEdit ? (
        <Pressable
          onPress={() => router.push("/record/new")}
          style={({ pressed }) => [styles.addCard, pressed && { backgroundColor: colors.primaryDark }]}
          accessibilityRole="button"
          accessibilityLabel="Add record"
          accessibilityHint="Record farmer, land and equipment or service details"
        >
          <View style={styles.addIcon}>
            <Ionicons name="add" size={30} color={colors.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <AppText style={styles.addTitle}>Add Record</AppText>
            <AppText style={styles.addSub}>Farmer, land and equipment / service details</AppText>
          </View>
          <Ionicons name="chevron-forward" size={22} color={colors.white} />
        </Pressable>
      ) : null}

      <QuickSearch />

      {isAdmin ? (
        <View style={{ marginBottom: 20 }}>
          <SectionHeader title="Admin" />
          <View style={styles.tools}>
            <Tool icon="stats-chart-outline" label="Reports" href="/admin/reports" />
            <Tool icon="people-circle-outline" label="Users" href="/profile/users" />
            <Tool icon="time-outline" label="Audit history" href="/admin/audit" />
          </View>
        </View>
      ) : null}

      {waiting > 0 ? (
        <Pressable onPress={() => router.push("/profile/offline")} style={styles.syncNote} accessibilityRole="button">
          <Ionicons name="cloud-upload-outline" size={18} color={colors.warning} />
          <AppText variant="label" style={{ flex: 1 }}>
            {waiting} older survey{waiting === 1 ? " is" : "s are"} still waiting to sync on this device.
          </AppText>
          <Ionicons name="chevron-forward" size={16} color={colors.muted} />
        </Pressable>
      ) : null}

      <SectionHeader title="Recent records" action="View all" onAction={() => router.push("/records")} />
      {recent.loading && !recent.data ? (
        <>
          <SurveyCardSkeleton />
          <SurveyCardSkeleton />
        </>
      ) : recent.error && !recent.data ? (
        <ErrorState offline={recent.error.offline} message={recent.error.offline ? "Connect to the internet to see records." : recent.error.message} onRetry={recent.reload} />
      ) : recent.data?.data.length ? (
        <>
          {recent.data.data.map((r) => (
            <ServiceRecordCard key={r.id} record={r} onPress={() => router.push({ pathname: "/record/[id]", params: { id: r.id } })} />
          ))}
          {recent.data.pagination.total > recent.data.data.length ? (
            <AppButton title={`View all ${recent.data.pagination.total} records`} variant="ghost" icon="list-outline" onPress={() => router.push("/records")} />
          ) : null}
        </>
      ) : (
        <EmptyState
          icon="receipt-outline"
          title="No records yet"
          message="Records you save will appear here, ready to print receipts."
          actionTitle={canEdit ? "Add a record" : undefined}
          onAction={canEdit ? () => router.push("/record/new") : undefined}
        />
      )}
    </Screen>
  );
}

/** Search entry point: farmer name, survey number or sub-division. */
function QuickSearch() {
  const [q, setQ] = useState("");
  const go = () => router.push({ pathname: "/records", params: q.trim() ? { q: q.trim() } : { focus: String(Date.now()) } });
  return (
    <View style={styles.quick}>
      <AppText variant="heading">Search Records</AppText>
      <AppText variant="small">Farmer name, survey no. (312) or with sub-division (312/4B)</AppText>
      <View style={styles.quickInput}>
        <Ionicons name="search" size={18} color={colors.muted} />
        <TextInput
          value={q}
          onChangeText={setQ}
          onSubmitEditing={go}
          returnKeyType="search"
          placeholder="Search records"
          placeholderTextColor={colors.placeholder}
          style={styles.quickText}
          autoCorrect={false}
          accessibilityLabel="Search records by farmer name, survey number or sub-division"
        />
        <AppButton title="Search" compact onPress={go} />
      </View>
    </View>
  );
}

function Tool({ icon, label, href }: { icon: ComponentProps<typeof Ionicons>["name"]; label: string; href: Href }) {
  return (
    <Pressable onPress={() => router.push(href)} style={({ pressed }) => [styles.tool, pressed && { opacity: 0.85 }]} accessibilityRole="button" accessibilityLabel={label}>
      <View style={styles.toolIcon}>
        <Ionicons name={icon} size={22} color={colors.primary} />
      </View>
      <AppText variant="label" style={{ textAlign: "center" }} numberOfLines={2}>{label}</AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", gap: 12 },
  pills: { marginTop: 12, marginBottom: 16, flexDirection: "row", gap: 8, alignItems: "center", flexWrap: "wrap" },
  rolePill: { backgroundColor: colors.primarySoft, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
  addCard: {
    flexDirection: "row", alignItems: "center", gap: 14, backgroundColor: colors.primary, borderRadius: radius.lg,
    padding: 16, minHeight: 84, marginBottom: 16, ...shadow.raised,
  },
  addIcon: { width: 52, height: 52, borderRadius: 26, backgroundColor: colors.white, alignItems: "center", justifyContent: "center" },
  addTitle: { fontFamily: fonts.bold, fontSize: 19, color: colors.white },
  addSub: { fontFamily: fonts.medium, fontSize: 13.5, color: "#D8F0E1", marginTop: 2 },
  quick: { backgroundColor: colors.card, borderRadius: radius.lg, padding: 14, gap: 4, marginBottom: 20, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, ...shadow.card },
  quickInput: {
    flexDirection: "row", alignItems: "center", gap: 8, marginTop: 8, paddingLeft: 12, paddingRight: 6, minHeight: 52,
    borderRadius: radius.md, backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border,
  },
  quickText: { flex: 1, fontFamily: fonts.regular, fontSize: 16, color: colors.text },
  tools: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  tool: {
    flexGrow: 1, flexBasis: "30%", minHeight: 92, backgroundColor: colors.card, borderRadius: radius.lg, padding: 10, alignItems: "center", justifyContent: "center", gap: 8,
    borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, ...shadow.card,
  },
  toolIcon: { width: 42, height: 42, borderRadius: 21, backgroundColor: colors.primarySoft, alignItems: "center", justifyContent: "center" },
  syncNote: {
    flexDirection: "row", alignItems: "center", gap: 8, padding: 12, borderRadius: radius.md, backgroundColor: colors.warningSoft, marginBottom: 16,
  },
});
