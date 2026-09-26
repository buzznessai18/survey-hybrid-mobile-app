import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { colors } from "@/theme";
import { AppText } from "./AppText";

/** Label on the left, value on the right (Survey Details style). */
export function InfoRow({ label, value, last }: { label: string; value: ReactNode; last?: boolean }) {
  return (
    <View style={[styles.row, !last && styles.divider]} accessible accessibilityLabel={`${label}: ${typeof value === "string" ? value : ""}`}>
      <AppText variant="caption" style={styles.label}>
        {label}
      </AppText>
      <View style={styles.value}>
        {typeof value === "string" || typeof value === "number" ? <AppText variant="bodyStrong">{value}</AppText> : value}
      </View>
    </View>
  );
}

/** Stacked label/value used in compact grids. */
export function Field({ label, value }: { label: string; value: ReactNode }) {
  return (
    <View style={{ gap: 2 }}>
      <AppText variant="small">{label}</AppText>
      {typeof value === "string" ? <AppText variant="bodyStrong">{value}</AppText> : value}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", paddingVertical: 11, gap: 12 },
  divider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  label: { width: 120 },
  value: { flex: 1 },
});
