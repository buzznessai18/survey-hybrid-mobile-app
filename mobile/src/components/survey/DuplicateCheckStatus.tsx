import { Ionicons } from "@expo/vector-icons";
import { ActivityIndicator, Pressable, StyleSheet, View } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";
import { AppText } from "@/components/ui/AppText";
import type { DuplicateCheckState } from "@/features/surveys/useDuplicateCheck";
import { colors, radius } from "@/theme";
import { formatDistance } from "@/utils/format";

/** Inline feedback under the survey number fields. */
export function DuplicateCheckStatus({ state, onPress }: { state: DuplicateCheckState; onPress?: () => void }) {
  if (state.status === "idle") return null;

  if (state.status === "checking") {
    return (
      <View style={[styles.row, styles.neutral]} accessibilityLiveRegion="polite">
        <ActivityIndicator size="small" color={colors.muted} />
        <AppText variant="caption">Checking survey number…</AppText>
      </View>
    );
  }
  if (state.status === "offline") {
    return (
      <View style={[styles.row, styles.neutral]}>
        <Ionicons name="cloud-offline-outline" size={18} color={colors.muted} />
        <AppText variant="caption" style={{ flex: 1 }}>
          Offline — the server will check for duplicates when the survey syncs.
        </AppText>
      </View>
    );
  }
  if (state.status === "error") {
    return (
      <Pressable onPress={state.retry} style={[styles.row, styles.neutral]} accessibilityRole="button">
        <Ionicons name="refresh" size={18} color={colors.muted} />
        <AppText variant="caption" style={{ flex: 1 }}>
          Couldn&apos;t check the survey number. Tap to retry.
        </AppText>
      </Pressable>
    );
  }
  if (state.status === "available") {
    return (
      <Animated.View entering={FadeIn} style={[styles.row, styles.ok]} accessibilityLiveRegion="polite">
        <Ionicons name="checkmark-circle" size={18} color={colors.success} />
        <AppText variant="label" style={{ color: colors.primaryDark }}>
          Survey number available
        </AppText>
      </Animated.View>
    );
  }

  const exact = state.interpretation.level === "duplicate";
  const distance = state.interpretation.nearestDistance;
  return (
    <Animated.View entering={FadeIn}>
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel="Duplicate warning. Tap to view the existing record."
        style={[styles.row, exact ? styles.bad : styles.warn]}
        accessibilityLiveRegion="assertive"
      >
        <Ionicons name="warning" size={18} color={exact ? colors.error : colors.warning} />
        <View style={{ flex: 1 }}>
          <AppText variant="label" style={{ color: exact ? colors.error : "#A8650A" }}>
            {exact ? "This Survey Number already exists." : "A survey with this number exists nearby."}
          </AppText>
          <AppText variant="small">
            {state.interpretation.matchCount} existing record{state.interpretation.matchCount === 1 ? "" : "s"}
            {distance !== null ? ` • ${formatDistance(distance)} away` : ""} • Tap to view
          </AppText>
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.muted} />
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginTop: -6,
    marginBottom: 14,
  },
  neutral: { backgroundColor: "#EEF0EC" },
  ok: { backgroundColor: colors.successSoft },
  warn: { backgroundColor: colors.warningSoft },
  bad: { backgroundColor: colors.errorSoft },
});
