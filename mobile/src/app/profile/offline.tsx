import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useState } from "react";
import { Alert, Pressable, StyleSheet, View } from "react-native";
import Animated, { FadeInDown, LinearTransition } from "react-native-reanimated";
import { AppButton } from "@/components/ui/AppButton";
import { AppText } from "@/components/ui/AppText";
import { Screen } from "@/components/ui/Screen";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { EmptyState } from "@/components/ui/States";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { useUserQueue } from "@/features/sync/hooks";
import { SyncService } from "@/services/sync/SyncService";
import { useNetworkStore } from "@/store/networkStore";
import { queueCounts, useQueueStore } from "@/store/queueStore";
import { useSyncStore } from "@/store/syncStore";
import { colors, fonts, radius, shadow } from "@/theme";
import type { QueueItem } from "@/types/survey";
import { formatDateTime } from "@/utils/date";
import { surveyNumberLabel } from "@/utils/format";
import { queueStatusView } from "@/utils/status";

/** Offline / Sync Center. */
export default function OfflineData() {
  const items = useUserQueue();
  const counts = queueCounts(items);
  const isOnline = useNetworkStore((s) => s.isOnline);
  const isSyncing = useSyncStore((s) => s.isSyncing);
  const lastSyncAt = useSyncStore((s) => s.lastSyncAt);
  const [retrying, setRetrying] = useState<string | null>(null);

  const retry = async (id: string) => {
    setRetrying(id);
    await SyncService.retry(id);
    setRetrying(null);
  };

  const clearSynced = () =>
    Alert.alert("Clear sync history?", "Removes the list of already-synced surveys from this device. Server data is not affected.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Clear",
        onPress: () => items.filter((i) => i.status === "synced").forEach((i) => useQueueStore.getState().remove(i.id)),
      },
    ]);

  return (
    <Screen
      header={<ScreenHeader title="Offline Data" />}
      footer={
        <AppButton
          title={isOnline ? "Sync Now" : "Waiting for connection"}
          icon="sync"
          loading={isSyncing}
          loadingTitle="Syncing…"
          disabled={!isOnline || counts.pending + counts.failed === 0}
          onPress={() => void SyncService.processQueue({ force: true })}
        />
      }
    >
      <View style={styles.stats}>
        <Stat value={counts.pending} label="Pending Surveys" color={colors.warning} />
        <Stat value={counts.failed} label="Sync Failed" color={colors.error} />
        <Stat value={counts.synced} label="Successfully Synced" color={colors.success} />
      </View>

      {!isOnline ? (
        <View style={styles.notice} accessibilityRole="alert">
          <Ionicons name="cloud-offline-outline" size={20} color={colors.muted} />
          <AppText variant="label" style={{ flex: 1 }}>
            You&apos;re offline. Surveys will sync automatically when you&apos;re back online.
          </AppText>
        </View>
      ) : lastSyncAt ? (
        <AppText variant="small" style={{ marginBottom: 12 }}>
          Last sync {formatDateTime(lastSyncAt)}
        </AppText>
      ) : null}

      {items.length === 0 ? (
        <EmptyState icon="cloud-done-outline" title="Nothing stored offline" message="Surveys saved without a connection will appear here until they sync." />
      ) : (
        items.map((item, i) => (
          <Animated.View key={item.id} entering={FadeInDown.duration(250).delay(Math.min(i, 8) * 40)} layout={LinearTransition}>
            <QueueRow item={item} retrying={retrying === item.id} onRetry={() => retry(item.id)} isOnline={isOnline} />
          </Animated.View>
        ))
      )}

      {counts.synced > 0 ? (
        <AppButton title="Clear synced history" variant="ghost" compact onPress={clearSynced} style={{ marginTop: 8 }} />
      ) : null}
    </Screen>
  );
}

function Stat({ value, label, color }: { value: number; label: string; color: string }) {
  return (
    <View style={[styles.stat, shadow.card]} accessible accessibilityLabel={`${label}: ${value}`}>
      <AppText style={[styles.statValue, { color }]}>{value}</AppText>
      <AppText variant="small" style={{ textAlign: "center" }}>
        {label}
      </AppText>
    </View>
  );
}

function QueueRow({ item, retrying, onRetry, isOnline }: { item: QueueItem; retrying: boolean; onRetry: () => void; isOnline: boolean }) {
  const status = queueStatusView(item.status);
  const d = item.details;
  const subtitle =
    item.status === "synced"
      ? `${item.result?.surveyCode ?? "Synced"}${item.result?.idempotentReplay ? " • already on server" : ""}`
      : item.status === "sync_failed"
        ? (item.lastError?.message ?? "Sync failed")
        : item.status === "syncing"
          ? "Uploading…"
          : isOnline
            ? "Queued for sync"
            : "Waiting for connection";

  return (
    <Pressable
      onPress={() => router.push({ pathname: "/survey/[id]", params: { id: item.id } })}
      accessibilityRole="button"
      accessibilityLabel={`Survey ${surveyNumberLabel(d.surveyNumber, d.subDivision || null)}, ${status.label}`}
      style={({ pressed }) => [styles.row, pressed && { opacity: 0.85 }]}
    >
      <View style={{ flex: 1, gap: 3 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <AppText variant="bodyStrong">Survey {surveyNumberLabel(d.surveyNumber, d.subDivision || null)}</AppText>
          <StatusBadge label={status.label} tone={status.tone} />
        </View>
        <AppText variant="caption" numberOfLines={2} style={item.status === "sync_failed" ? { color: colors.error } : undefined}>
          {subtitle}
        </AppText>
        <AppText variant="small">
          {d.farmerName} • {formatDateTime(item.createdAt)}
        </AppText>
      </View>
      {item.status === "sync_failed" ? (
        <AppButton title="Retry" compact variant="secondary" loading={retrying} onPress={onRetry} disabled={!isOnline} />
      ) : (
        <Ionicons name="chevron-forward" size={18} color={colors.placeholder} />
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  stats: { flexDirection: "row", gap: 10, marginBottom: 14 },
  stat: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    paddingVertical: 14,
    paddingHorizontal: 6,
    alignItems: "center",
    gap: 2,
  },
  statValue: { fontFamily: fonts.bold, fontSize: 26 },
  notice: { flexDirection: "row", gap: 10, alignItems: "center", padding: 14, borderRadius: radius.md, backgroundColor: "#EEF0EC", marginBottom: 14 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    padding: 14,
    marginBottom: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
});
