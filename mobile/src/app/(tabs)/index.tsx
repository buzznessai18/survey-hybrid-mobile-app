import { router } from "expo-router";
import { useMemo } from "react";
import { RefreshControl, StyleSheet, View } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { AppButton } from "@/components/ui/AppButton";
import { AppText } from "@/components/ui/AppText";
import { Avatar } from "@/components/ui/Avatar";
import { Screen } from "@/components/ui/Screen";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { StatCard } from "@/components/ui/StatCard";
import { EmptyState, SurveyCardSkeleton } from "@/components/ui/States";
import { SyncStatus } from "@/components/ui/SyncStatus";
import { SurveyCard } from "@/components/survey/SurveyCard";
import { useDashboard } from "@/features/dashboard/useDashboard";
import { queueCard, serverCard } from "@/features/surveys/cardData";
import { useStartSurvey } from "@/features/surveys/useStartSurvey";
import { useUnsyncedCount, useUserQueue } from "@/features/sync/hooks";
import { useAuthStore, useIsAdmin, useIsGuest } from "@/store/authStore";
import { colors } from "@/theme";
import { formatDateTime, formatLongDate, greeting } from "@/utils/date";
import { firstName } from "@/utils/format";

export default function HomeScreen() {
  const profile = useAuthStore((s) => s.profile);
  const { report, recent, refreshing, reload, updatedAt } = useDashboard();
  const queue = useUserQueue();
  const { pending, failed } = useUnsyncedCount();
  const startSurvey = useStartSurvey();
  const isAdmin = useIsAdmin();
  const isGuest = useIsGuest();

  // Local, not-yet-synced surveys first, then the latest server records.
  const recentCards = useMemo(() => {
    const local = queue.filter((q) => q.status !== "synced").map((q) => ({ card: queueCard(q), id: q.id }));
    const server = recent.map((s) => ({ card: serverCard(s), id: s.id }));
    return [...local, ...server].slice(0, 5);
  }, [queue, recent]);

  const stat = (n: number | undefined) => (n === undefined ? "–" : n);

  return (
    <Screen
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={reload} tintColor={colors.primary} />}
      contentStyle={{ paddingTop: 12 }}
    >
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <AppText variant="caption">{greeting()},</AppText>
          <AppText variant="display" numberOfLines={1}>
            {isGuest ? "Welcome" : firstName(profile?.full_name)} 👋
          </AppText>
          <AppText variant="caption" style={{ marginTop: 2 }}>
            {formatLongDate()}
          </AppText>
        </View>
        <Avatar name={isGuest ? "Guest" : profile?.full_name} onPress={() => router.push(isGuest ? "/login" : "/profile")} />
      </View>

      <View style={{ marginTop: 12, marginBottom: 16, flexDirection: "row", gap: 8, alignItems: "center" }}>
        <SyncStatus onPress={isAdmin ? () => router.push("/profile/offline") : undefined} />
        <View style={styles.rolePill}>
          <AppText variant="small" style={{ color: colors.primaryDark }}>
            {isAdmin ? "Admin" : isGuest ? "Guest • read-only" : "Viewer"}
          </AppText>
        </View>
      </View>

      <Animated.View entering={FadeInDown.duration(350)} style={styles.grid}>
        <View style={styles.gridRow}>
          <StatCard value={stat(report?.today_surveys)} label="Added Today" tone="success" icon="checkmark-done" />
          {isAdmin ? (
            <StatCard
              value={pending + failed}
              label="Pending Sync"
              tone="warning"
              icon="cloud-upload-outline"
              onPress={() => router.push("/profile/offline")}
            />
          ) : (
            <StatCard value={stat(report?.by_crop.length)} label="Crops Surveyed" tone="warning" icon="leaf-outline" />
          )}
        </View>
        <View style={styles.gridRow}>
          <StatCard
            value={stat(report?.duplicate_count)}
            label="Duplicates"
            tone="error"
            icon="copy-outline"
            onPress={() => router.push({ pathname: "/surveys", params: { filter: "duplicates" } })}
          />
          <StatCard
            value={stat(report?.total_surveys)}
            label="Total Surveys"
            tone="info"
            icon="layers-outline"
            onPress={() => router.push("/surveys")}
          />
        </View>
      </Animated.View>
      {updatedAt && !refreshing && report ? (
        <AppText variant="small" style={{ marginTop: 6 }}>
          Updated {formatDateTime(updatedAt)}
        </AppText>
      ) : null}

      {isAdmin ? (
        <AppButton title="New Survey" icon="add" onPress={startSurvey} style={{ marginTop: 18, marginBottom: 24 }} />
      ) : (
        <AppButton
          title="Search Surveys"
          icon="search"
          onPress={() => router.push("/surveys")}
          style={{ marginTop: 18, marginBottom: 24 }}
        />
      )}

      <SectionHeader title="Recent Surveys" action="View All" onAction={() => router.push("/surveys")} />
      {recentCards.length === 0 && refreshing ? (
        <>
          <SurveyCardSkeleton />
          <SurveyCardSkeleton />
        </>
      ) : recentCards.length === 0 ? (
        <EmptyState
          icon="clipboard-outline"
          title="No surveys yet"
          message={isAdmin ? "Surveys you add will appear here." : "Surveys added by admins will appear here."}
          actionTitle={isAdmin ? "Add your first survey" : undefined}
          onAction={isAdmin ? startSurvey : undefined}
        />
      ) : (
        recentCards.map(({ card, id }, i) => (
          <Animated.View key={card.key} entering={FadeInDown.duration(300).delay(60 * i)}>
            <SurveyCard compact data={card} onPress={() => router.push({ pathname: "/survey/[id]", params: { id } })} />
          </Animated.View>
        ))
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: "row", alignItems: "center", gap: 12 },
  grid: { gap: 12 },
  gridRow: { flexDirection: "row", gap: 12 },
  rolePill: { backgroundColor: colors.primarySoft, borderRadius: 999, paddingHorizontal: 10, paddingVertical: 5 },
});
