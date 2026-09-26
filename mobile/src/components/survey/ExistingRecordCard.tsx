import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { StyleSheet, View } from "react-native";
import { AppCard } from "@/components/ui/AppCard";
import { AppText } from "@/components/ui/AppText";
import { Field } from "@/components/ui/InfoRow";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { colors, radius } from "@/theme";
import type { MatchType, SurveySummary } from "@/types/api";
import { formatShortDate } from "@/utils/date";
import { formatArea, formatDistance, surveyNumberLabel } from "@/utils/format";

const MATCH_LABEL: Record<MatchType, string> = {
  exact: "Same survey number & sub-division",
  proximity: "Same survey number nearby",
  exact_and_proximity: "Same survey number & sub-division nearby",
};

/**
 * Existing record returned by the backend. The farmer mobile may be masked
 * (******3210) for another surveyor's record — displayed exactly as returned.
 */
export function ExistingRecordCard({
  survey,
  matchType,
  distance,
}: {
  survey: SurveySummary | null;
  matchType: MatchType;
  distance: number | null;
}) {
  if (!survey) return null;
  return (
    <AppCard style={{ gap: 14 }}>
      <View style={styles.top}>
        <View style={{ flex: 1, gap: 12 }}>
          <Field label="Survey Number" value={surveyNumberLabel(survey.survey_number, survey.sub_division)} />
          <Field label="Existing Farmer" value={survey.farmer_name ?? "—"} />
          <Field label="Mobile Number" value={survey.farmer_mobile ?? "—"} />
        </View>
        <View style={styles.photo}>
          {survey.photo_url ? (
            <Image source={{ uri: survey.photo_url }} style={StyleSheet.absoluteFill} contentFit="cover" transition={200} />
          ) : (
            <Ionicons name="image-outline" size={26} color={colors.placeholder} />
          )}
        </View>
      </View>
      <View style={styles.grid}>
        <View style={styles.cell}>
          <Field label="Crop" value={survey.crop_name ?? "—"} />
        </View>
        <View style={styles.cell}>
          <Field label="Area" value={formatArea(survey.area, survey.area_unit)} />
        </View>
        <View style={styles.cell}>
          <Field label="Date of Visit" value={formatShortDate(survey.visit_date)} />
        </View>
        <View style={styles.cell}>
          <Field label="Added by" value={survey.is_own ? "You" : (survey.collected_by_name ?? "—")} />
        </View>
      </View>
      <View style={styles.distance}>
        <Ionicons name="location" size={20} color={colors.primary} />
        <View style={{ flex: 1 }}>
          <AppText variant="small">Distance from existing location</AppText>
          <AppText variant="bodyStrong">{distance === null ? "Location not compared" : formatDistance(distance)}</AppText>
        </View>
      </View>
      <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
        <StatusBadge label={MATCH_LABEL[matchType]} tone={matchType === "proximity" ? "warning" : "error"} />
        <StatusBadge label={survey.survey_id} tone="neutral" />
      </View>
    </AppCard>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: "row", gap: 12 },
  photo: {
    width: 116,
    height: 96,
    borderRadius: radius.md,
    overflow: "hidden",
    backgroundColor: "#E9EDE7",
    alignItems: "center",
    justifyContent: "center",
  },
  grid: { flexDirection: "row", flexWrap: "wrap", rowGap: 12 },
  cell: { width: "50%" },
  distance: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 12,
    backgroundColor: colors.background,
    borderRadius: radius.md,
  },
});
