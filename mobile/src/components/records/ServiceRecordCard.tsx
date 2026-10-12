import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, View } from "react-native";
import { AppText } from "@/components/ui/AppText";
import { colors, radius, shadow } from "@/theme";
import type { ServiceRecord } from "@/types/api";
import { formatDateTime } from "@/utils/date";
import { surveyNumberLabel } from "@/utils/format";
import { formatLandSize } from "@/utils/labels";

/** One saved farmer equipment / service record in a list. */
export function ServiceRecordCard({ record, onPress }: { record: ServiceRecord; onPress: () => void }) {
  const survey = surveyNumberLabel(record.survey_number, record.sub_division);
  const land = formatLandSize(record.land_size, record.land_unit);
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && { opacity: 0.85 }]}
      accessibilityRole="button"
      accessibilityLabel={`${record.farmer_name}, survey ${survey}, ${land}, ${formatDateTime(record.created_at)}`}
      accessibilityHint="Opens the record and receipt"
    >
      <View style={styles.icon}>
        <Ionicons name="receipt-outline" size={22} color={colors.primary} />
      </View>
      <View style={{ flex: 1, gap: 3 }}>
        <View style={styles.topRow}>
          <AppText variant="bodyStrong" style={{ flex: 1 }} numberOfLines={2}>{record.farmer_name}</AppText>
          <AppText variant="small" style={styles.no}>{record.record_no}</AppText>
        </View>
        <AppText variant="caption">Sy. No. {survey} • {land}</AppText>
        {record.service_details ? (
          <AppText variant="label" numberOfLines={2}>{record.service_details}</AppText>
        ) : null}
        <View style={styles.dateRow}>
          <Ionicons name="time-outline" size={13} color={colors.muted} />
          <AppText variant="small">{formatDateTime(record.created_at)}</AppText>
        </View>
      </View>
      <Ionicons name="chevron-forward" size={18} color={colors.placeholder} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row", alignItems: "center", gap: 12, padding: 14, marginBottom: 10, backgroundColor: colors.card,
    borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, ...shadow.card,
  },
  icon: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.primarySoft, alignItems: "center", justifyContent: "center", alignSelf: "flex-start" },
  topRow: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  no: { color: colors.primaryDark, backgroundColor: colors.primarySoft, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2, overflow: "hidden" },
  dateRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 2 },
});
