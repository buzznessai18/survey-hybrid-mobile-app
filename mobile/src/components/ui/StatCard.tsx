import { Ionicons } from "@expo/vector-icons";
import type { ComponentProps } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { colors, fonts, radius } from "@/theme";
import { AppText } from "./AppText";

type Tone = "success" | "warning" | "error" | "info";

const tones: Record<Tone, { bg: string; fg: string; border: string }> = {
  success: { bg: "#EAF6EF", fg: colors.primaryDark, border: "#D3ECDD" },
  warning: { bg: "#FDF4E6", fg: "#B26D08", border: "#F6E3C4" },
  error: { bg: "#FCEEEE", fg: "#C23B3B", border: "#F4D6D6" },
  info: { bg: "#EDF3FD", fg: "#2A5FBF", border: "#D6E3F8" },
};

export function StatCard({
  value,
  label,
  tone,
  icon,
  onPress,
}: {
  value: number | string;
  label: string;
  tone: Tone;
  icon: ComponentProps<typeof Ionicons>["name"];
  onPress?: () => void;
}) {
  const t = tones[tone];
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? "button" : "summary"}
      accessibilityLabel={`${label}: ${value}`}
      style={({ pressed }) => [styles.card, { backgroundColor: t.bg, borderColor: t.border }, pressed && { opacity: 0.85 }]}
    >
      <View style={styles.top}>
        <AppText style={[styles.value, { color: t.fg }]}>{value}</AppText>
        <Ionicons name={icon} size={20} color={t.fg} style={{ opacity: 0.8 }} />
      </View>
      <AppText variant="label" style={{ color: t.fg }}>
        {label}
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { flex: 1, minHeight: 92, borderRadius: radius.lg, borderWidth: 1, padding: 14, justifyContent: "space-between" },
  top: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  value: { fontFamily: fonts.bold, fontSize: 28, lineHeight: 34 },
});
