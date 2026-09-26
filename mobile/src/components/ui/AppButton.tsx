import { Ionicons } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import type { ComponentProps } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { colors, fonts, radius, TOUCH } from "@/theme";

type Variant = "primary" | "secondary" | "ghost" | "danger" | "dangerSoft";

interface Props {
  title: string;
  onPress?: () => void;
  variant?: Variant;
  icon?: ComponentProps<typeof Ionicons>["name"];
  loading?: boolean;
  loadingTitle?: string;
  disabled?: boolean;
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
  accessibilityHint?: string;
}

const palette: Record<Variant, { bg: string; fg: string; border: string; pressed: string }> = {
  primary: { bg: colors.primary, fg: colors.white, border: colors.primary, pressed: colors.primaryDark },
  secondary: { bg: colors.card, fg: colors.primary, border: colors.primary, pressed: colors.primarySoft },
  ghost: { bg: "transparent", fg: colors.text, border: "transparent", pressed: "#EEF0EC" },
  danger: { bg: colors.error, fg: colors.white, border: colors.error, pressed: "#B83939" },
  dangerSoft: { bg: colors.errorSoft, fg: colors.error, border: colors.errorSoft, pressed: "#F8DADA" },
};

export function AppButton({
  title,
  onPress,
  variant = "primary",
  icon,
  loading,
  loadingTitle,
  disabled,
  compact,
  style,
  accessibilityHint,
}: Props) {
  const p = palette[variant];
  const inactive = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={loading && loadingTitle ? loadingTitle : title}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: !!inactive, busy: !!loading }}
      disabled={inactive}
      onPress={() => {
        if (variant === "primary") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
        onPress?.();
      }}
      style={({ pressed }) => [
        styles.base,
        compact && styles.compact,
        { backgroundColor: pressed ? p.pressed : p.bg, borderColor: p.border },
        pressed && styles.pressed,
        inactive && styles.disabled,
        style,
      ]}
    >
      <View style={styles.row}>
        {loading ? (
          <ActivityIndicator color={p.fg} size="small" />
        ) : icon ? (
          <Ionicons name={icon} size={20} color={p.fg} />
        ) : null}
        <Text style={[styles.title, { color: p.fg }]} numberOfLines={1} maxFontSizeMultiplier={1.3}>
          {loading && loadingTitle ? loadingTitle : title}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: TOUCH,
    borderRadius: radius.md,
    borderWidth: 1.5,
    paddingHorizontal: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  compact: { minHeight: 44, paddingHorizontal: 14 },
  row: { flexDirection: "row", alignItems: "center", gap: 8 },
  title: { fontFamily: fonts.semibold, fontSize: 16 },
  pressed: { transform: [{ scale: 0.985 }] },
  disabled: { opacity: 0.55 },
});
