import { Ionicons } from "@expo/vector-icons";
import type { ComponentProps } from "react";
import { StyleSheet, Text, View } from "react-native";
import { colors, fonts, radius } from "@/theme";

export type BadgeTone = "success" | "warning" | "error" | "info" | "neutral" | "primary";

const tones: Record<BadgeTone, { bg: string; fg: string }> = {
  success: { bg: colors.successSoft, fg: colors.success },
  warning: { bg: colors.warningSoft, fg: "#A8650A" },
  error: { bg: colors.errorSoft, fg: colors.error },
  info: { bg: colors.infoSoft, fg: colors.info },
  neutral: { bg: "#EEF0EC", fg: colors.textSecondary },
  primary: { bg: colors.primarySoft, fg: colors.primaryDark },
};

export function StatusBadge({
  label,
  tone,
  icon,
  size = "sm",
}: {
  label: string;
  tone: BadgeTone;
  icon?: ComponentProps<typeof Ionicons>["name"];
  size?: "sm" | "md";
}) {
  const t = tones[tone];
  return (
    <View
      accessibilityRole="text"
      accessibilityLabel={`Status: ${label}`}
      style={[styles.badge, size === "md" && styles.md, { backgroundColor: t.bg }]}
    >
      {icon ? <Ionicons name={icon} size={size === "md" ? 15 : 12} color={t.fg} /> : null}
      <Text style={[styles.text, size === "md" && styles.mdText, { color: t.fg }]} maxFontSizeMultiplier={1.2}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.pill,
    alignSelf: "flex-start",
  },
  md: { paddingHorizontal: 12, paddingVertical: 6 },
  text: { fontFamily: fonts.semibold, fontSize: 11.5 },
  mdText: { fontSize: 13.5 },
});
