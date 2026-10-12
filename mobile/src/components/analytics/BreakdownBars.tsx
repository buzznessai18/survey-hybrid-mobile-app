import { StyleSheet, View } from "react-native";
import { AppText } from "@/components/ui/AppText";
import { colors, radius } from "@/theme";
import type { AnalyticsCount } from "@/types/api";

/** Ranked horizontal bars (one hue): label, proportional bar, count. */
export function BreakdownBars({ items, empty = "Nothing in this period." }: { items: AnalyticsCount[]; empty?: string }) {
  if (!items.length) return <AppText variant="caption">{empty}</AppText>;
  const max = Math.max(...items.map((i) => i.count), 1);
  return (
    <View style={{ gap: 10 }}>
      {items.map((it) => (
        <View key={it.label} accessibilityLabel={`${it.label}: ${it.count}`} accessible>
          <View style={styles.row}>
            <AppText variant="label" numberOfLines={1} style={{ flex: 1 }}>{it.label}</AppText>
            <AppText variant="bodyStrong">{it.count}</AppText>
          </View>
          <View style={styles.track}>
            <View style={[styles.fill, { width: `${Math.max(2, (it.count / max) * 100)}%` }]} />
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 4 },
  track: { height: 8, borderRadius: radius.pill, backgroundColor: colors.primarySoft, overflow: "hidden" },
  fill: { height: 8, borderRadius: radius.pill, backgroundColor: colors.primary },
});
