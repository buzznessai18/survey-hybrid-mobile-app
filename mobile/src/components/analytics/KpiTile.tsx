import { Ionicons } from "@expo/vector-icons";
import type { ComponentProps } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { AppText } from "@/components/ui/AppText";
import { colors, fonts, radius, shadow } from "@/theme";

/** A headline number for the period with its change vs the comparison period. */
export function KpiTile({
  value,
  label,
  icon,
  change,
  note,
  onPress,
}: {
  value: string | number;
  label: string;
  icon: ComponentProps<typeof Ionicons>["name"];
  /** % change; null = no baseline to compare with; undefined = not shown. */
  change?: number | null;
  /** Secondary line when there is no change to show (e.g. "3 verified"). */
  note?: string;
  onPress?: () => void;
}) {
  const up = (change ?? 0) > 0;
  const flat = change === 0;
  const changeText =
    change === undefined ? note : change === null ? "No data last period" : flat ? "No change" : `${up ? "+" : ""}${change}%`;
  const a11yChange = change === undefined || change === null ? changeText ?? "" : flat ? "no change" : `${up ? "up" : "down"} ${Math.abs(change)} percent`;

  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? "button" : "summary"}
      accessibilityLabel={`${label}: ${value}. ${a11yChange}`}
      style={({ pressed }) => [styles.card, shadow.card, pressed && { opacity: 0.85 }]}
    >
      <View style={styles.top}>
        <AppText variant="label" numberOfLines={1} style={{ flex: 1 }}>{label}</AppText>
        <Ionicons name={icon} size={18} color={colors.primary} />
      </View>
      <AppText style={styles.value} numberOfLines={1} adjustsFontSizeToFit>{value}</AppText>
      {changeText ? (
        <View style={styles.change}>
          {change !== undefined && change !== null && !flat ? (
            <Ionicons name={up ? "arrow-up" : "arrow-down"} size={13} color={up ? colors.success : colors.error} />
          ) : null}
          <AppText variant="small" numberOfLines={1}>{changeText}</AppText>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1, minHeight: 104, backgroundColor: colors.card, borderRadius: radius.lg, padding: 14, gap: 4,
    borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border,
  },
  top: { flexDirection: "row", alignItems: "center", gap: 6 },
  value: { fontFamily: fonts.bold, fontSize: 26, lineHeight: 32, color: colors.text },
  change: { flexDirection: "row", alignItems: "center", gap: 3 },
});
