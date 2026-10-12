import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, View } from "react-native";
import { AppText } from "@/components/ui/AppText";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { colors, radius, shadow } from "@/theme";
import type { LandForm } from "@/types/api";
import { formatShortDate } from "@/utils/date";
import { FORM_STATUS_VIEW, formatSqM, LAND_CLASS_LABELS, surveyNo } from "@/utils/labels";

/** Compact 1/14 form row: Sy. no, village, occupant, area, class, status. */
export function LandFormCard({ form, onPress, highlight }: { form: LandForm; onPress?: () => void; highlight?: boolean }) {
  const st = FORM_STATUS_VIEW[form.status];
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? "button" : "summary"}
      accessibilityLabel={`1/14 form ${form.form_id}, survey ${surveyNo(form.survey_number, form.sub_division)}, ${form.village}`}
      style={({ pressed }) => [styles.card, highlight && styles.highlight, pressed && { opacity: 0.85 }]}
    >
      <View style={styles.icon}>
        <Ionicons name="document-text" size={20} color={colors.primary} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <AppText variant="bodyStrong">Sy. {surveyNo(form.survey_number, form.sub_division)}</AppText>
          <AppText variant="small">{form.form_id}</AppText>
        </View>
        <AppText variant="caption" numberOfLines={1}>
          {[`${form.village}, ${form.taluka}`, form.occupant_names].filter(Boolean).join(" • ")}
        </AppText>
        {form.area_sq_m || form.land_class || form.kharif_crop_name ? (
          <AppText variant="small" numberOfLines={1}>
            {[form.area_sq_m ? formatSqM(form.area_sq_m) : null, form.land_class ? LAND_CLASS_LABELS[form.land_class] : null, form.kharif_crop_name]
              .filter(Boolean).join(" • ")}
          </AppText>
        ) : null}
        <AppText variant="small" numberOfLines={1}>
          {form.created_by_name ? `By ${form.created_by_name} • ` : ""}{formatShortDate(form.created_at)}
        </AppText>
      </View>
      <View style={{ alignItems: "flex-end", gap: 6 }}>
        <StatusBadge label={st.label} tone={st.tone} />
        {onPress ? <Ionicons name="chevron-forward" size={18} color={colors.placeholder} /> : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: "row", alignItems: "center", gap: 12, padding: 12, marginBottom: 10, backgroundColor: colors.card,
    borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, ...shadow.card,
  },
  highlight: { borderColor: colors.error, borderWidth: 1.5 },
  icon: { width: 42, height: 42, borderRadius: 12, backgroundColor: colors.primarySoft, alignItems: "center", justifyContent: "center" },
});
