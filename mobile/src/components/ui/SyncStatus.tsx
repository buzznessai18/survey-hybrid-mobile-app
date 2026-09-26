import { Ionicons } from "@expo/vector-icons";
import { ActivityIndicator, Pressable, StyleSheet, View } from "react-native";
import Animated, { FadeInUp, FadeOutUp } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useUnsyncedCount } from "@/features/sync/hooks";
import { useNetworkStore } from "@/store/networkStore";
import { useSyncStore } from "@/store/syncStore";
import { colors, fonts, radius } from "@/theme";
import { AppText } from "./AppText";

/** Compact "Online / Offline • 3 waiting / Syncing…" pill. */
export function SyncStatus({ onPress }: { onPress?: () => void }) {
  const isOnline = useNetworkStore((s) => s.isOnline);
  const isSyncing = useSyncStore((s) => s.isSyncing);
  const { pending, failed } = useUnsyncedCount();
  const waiting = pending + failed;

  let label = "Online";
  let color: string = colors.success;
  if (!isOnline) {
    label = waiting ? `Offline • ${waiting} waiting to sync` : "Offline";
    color = colors.muted;
  } else if (isSyncing) {
    label = "Syncing…";
    color = colors.info;
  } else if (failed) {
    label = `${failed} sync failed`;
    color = colors.error;
  } else if (pending) {
    label = `${pending} waiting to sync`;
    color = colors.warning;
  }

  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? "button" : "text"}
      accessibilityLabel={`Sync status: ${label}`}
      style={styles.pill}
    >
      {isSyncing && isOnline ? (
        <ActivityIndicator size={10} color={color} />
      ) : (
        <View style={[styles.dot, { backgroundColor: color }]} />
      )}
      <AppText style={[styles.text, { color: isOnline && !pending && !failed ? colors.textSecondary : color }]}>{label}</AppText>
    </Pressable>
  );
}

/**
 * Subtle global offline strip. Rendered in normal flow above the navigator so
 * it never covers content (screens drop their own top inset while it shows).
 */
export function OfflineBanner() {
  const isOnline = useNetworkStore((s) => s.isOnline);
  const known = useNetworkStore((s) => s.known);
  const insets = useSafeAreaInsets();
  const { pending, failed } = useUnsyncedCount();
  if (isOnline || !known) return null;
  const waiting = pending + failed;
  return (
    <Animated.View
      entering={FadeInUp.duration(250)}
      exiting={FadeOutUp.duration(200)}
      style={[styles.banner, { paddingTop: insets.top + 4 }]}
      accessibilityLiveRegion="polite"
      accessibilityLabel="You are offline. Surveys are saved on this device."
    >
      <Ionicons name="cloud-offline" size={13} color={colors.white} />
      <AppText style={styles.bannerText}>
        Offline{waiting ? ` • ${waiting} survey${waiting === 1 ? "" : "s"} waiting to sync` : " • surveys are saved on this device"}
      </AppText>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    alignSelf: "flex-start",
    backgroundColor: colors.card,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
  text: { fontFamily: fonts.medium, fontSize: 12.5 },
  banner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    backgroundColor: "#2B342E",
    paddingBottom: 5,
  },
  bannerText: { fontFamily: fonts.medium, fontSize: 12.5, color: colors.white },
});
