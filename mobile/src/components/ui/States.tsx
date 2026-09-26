import { Ionicons } from "@expo/vector-icons";
import { useEffect, type ComponentProps } from "react";
import { ActivityIndicator, StyleSheet, View, type ViewStyle } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withRepeat, withTiming } from "react-native-reanimated";
import { colors, radius } from "@/theme";
import { AppButton } from "./AppButton";
import { AppText } from "./AppText";

type IconName = ComponentProps<typeof Ionicons>["name"];

export function EmptyState({
  icon = "leaf-outline",
  title,
  message,
  actionTitle,
  onAction,
}: {
  icon?: IconName;
  title: string;
  message?: string;
  actionTitle?: string;
  onAction?: () => void;
}) {
  return (
    <View style={styles.center} accessibilityRole="summary">
      <View style={styles.iconCircle}>
        <Ionicons name={icon} size={30} color={colors.primary} />
      </View>
      <AppText variant="heading" style={styles.centerText}>
        {title}
      </AppText>
      {message ? (
        <AppText variant="caption" style={styles.centerText}>
          {message}
        </AppText>
      ) : null}
      {actionTitle && onAction ? (
        <AppButton title={actionTitle} onPress={onAction} variant="secondary" compact style={{ marginTop: 16 }} />
      ) : null}
    </View>
  );
}

export function ErrorState({
  title = "Something went wrong",
  message,
  onRetry,
  offline,
}: {
  title?: string;
  message?: string;
  onRetry?: () => void;
  offline?: boolean;
}) {
  return (
    <View style={styles.center} accessibilityRole="alert">
      <View style={[styles.iconCircle, { backgroundColor: offline ? "#EEF0EC" : colors.errorSoft }]}>
        <Ionicons
          name={offline ? "cloud-offline-outline" : "alert-circle-outline"}
          size={30}
          color={offline ? colors.muted : colors.error}
        />
      </View>
      <AppText variant="heading" style={styles.centerText}>
        {offline ? "You're offline" : title}
      </AppText>
      {message ? (
        <AppText variant="caption" style={styles.centerText}>
          {message}
        </AppText>
      ) : null}
      {onRetry ? <AppButton title="Try again" icon="refresh" onPress={onRetry} variant="secondary" compact style={{ marginTop: 16 }} /> : null}
    </View>
  );
}

export function LoadingState({ label }: { label?: string }) {
  return (
    <View style={styles.center} accessibilityLabel={label ?? "Loading"} accessibilityRole="progressbar">
      <ActivityIndicator color={colors.primary} size="large" />
      {label ? (
        <AppText variant="caption" style={[styles.centerText, { marginTop: 12 }]}>
          {label}
        </AppText>
      ) : null}
    </View>
  );
}

/** Pulsing placeholder block. */
export function Skeleton({ style }: { style?: ViewStyle }) {
  const opacity = useSharedValue(0.5);
  useEffect(() => {
    opacity.value = withRepeat(withTiming(1, { duration: 800 }), -1, true);
  }, [opacity]);
  const animated = useAnimatedStyle(() => ({ opacity: opacity.value }));
  return <Animated.View style={[styles.skeleton, style, animated]} />;
}

export function SurveyCardSkeleton() {
  return (
    <View style={styles.skeletonCard}>
      <Skeleton style={{ width: 56, height: 56, borderRadius: 12 }} />
      <View style={{ flex: 1, gap: 8 }}>
        <Skeleton style={{ width: "40%", height: 14 }} />
        <Skeleton style={{ width: "65%", height: 12 }} />
        <Skeleton style={{ width: "50%", height: 12 }} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: "center", justifyContent: "center", paddingVertical: 40, paddingHorizontal: 32 },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.primarySoft,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14,
  },
  centerText: { textAlign: "center", marginTop: 4 },
  skeleton: { backgroundColor: "#E6E9E4", borderRadius: radius.sm },
  skeletonCard: {
    flexDirection: "row",
    gap: 12,
    padding: 14,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    marginBottom: 10,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
});
