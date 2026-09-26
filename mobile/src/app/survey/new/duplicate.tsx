import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { StyleSheet, View } from "react-native";
import Animated, { FadeInDown, ZoomIn } from "react-native-reanimated";
import { AppButton } from "@/components/ui/AppButton";
import { AppText } from "@/components/ui/AppText";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { InfoRow } from "@/components/ui/InfoRow";
import { Screen } from "@/components/ui/Screen";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { EmptyState } from "@/components/ui/States";
import { ExistingRecordCard } from "@/components/survey/ExistingRecordCard";
import { useDraftStore } from "@/store/draftStore";
import { colors, radius } from "@/theme";
import type { DuplicateCheckMatch } from "@/types/api";
import { formatShortDate } from "@/utils/date";
import { interpretDuplicateCheck } from "@/utils/duplicate";
import { formatArea, formatDistance, surveyNumberLabel } from "@/utils/format";

/**
 * Screen 7 — Possible Duplicate Found. Shows exactly what the backend
 * returned. A duplicate warning never blocks submission.
 *   mode=preview : opened from the details step (no submit actions yet)
 */
export default function DuplicateWarning() {
  const { mode } = useLocalSearchParams<{ mode?: string }>();
  const draft = useDraftStore((s) => s.draft);
  const result = draft?.duplicateCheck ?? null;
  const info = interpretDuplicateCheck(result);
  const [viewing, setViewing] = useState<DuplicateCheckMatch | null>(null);
  const preview = mode === "preview";
  const d = draft?.details;

  if (!result || info.level === "none") {
    return (
      <Screen header={<ScreenHeader title="Duplicate Check" />}>
        <EmptyState icon="checkmark-circle-outline" title="No duplicate found" message="No existing survey matches this survey number." />
        <AppButton title="Go Back" variant="secondary" onPress={() => router.back()} />
      </Screen>
    );
  }

  const exact = info.level === "duplicate";
  const others = result.matches.slice(1);

  const openExisting = (m: DuplicateCheckMatch) => {
    if (m.survey?.is_own) router.push({ pathname: "/survey/[id]", params: { id: m.survey.id } });
    else setViewing(m);
  };

  return (
    <Screen
      header={<ScreenHeader title="Possible Duplicate Found" />}
      footer={
        <View style={{ gap: 10 }}>
          {info.primary?.survey ? (
            <AppButton title="View Existing Record" icon="eye-outline" onPress={() => openExisting(info.primary!)} />
          ) : null}
          <View style={styles.row}>
            <AppButton title={preview ? "Back to Form" : "Go Back"} variant="ghost" onPress={() => router.back()} style={{ flex: 1 }} />
            {!preview ? (
              <AppButton title="Submit Anyway" variant="secondary" onPress={() => router.push("/survey/new/reason")} style={{ flex: 1.3 }} />
            ) : null}
          </View>
        </View>
      }
    >
      <Animated.View entering={ZoomIn.duration(300)} style={[styles.alert, { backgroundColor: exact ? colors.errorSoft : colors.warningSoft }]}>
        <Ionicons name="warning" size={30} color={exact ? colors.error : colors.warning} />
        <View style={{ flex: 1 }}>
          <AppText variant="bodyStrong" style={{ color: exact ? colors.error : "#8A5308" }}>
            {exact ? "This Survey Number already exists in the system." : "A survey with this number exists nearby."}
          </AppText>
          {d ? <AppText variant="caption">Survey No: {surveyNumberLabel(d.surveyNumber, d.subDivision || null)}</AppText> : null}
        </View>
      </Animated.View>

      <AppText variant="heading" style={{ marginBottom: 10 }}>
        Existing Record
      </AppText>
      {info.primary ? (
        <Animated.View entering={FadeInDown.duration(300).delay(80)}>
          <ExistingRecordCard survey={info.primary.survey} matchType={info.primary.match_type} distance={info.primary.distance_meters} />
        </Animated.View>
      ) : null}

      {others.length > 0 ? (
        <View style={{ marginTop: 18 }}>
          <AppText variant="heading" style={{ marginBottom: 8 }}>
            {others.length} more matching record{others.length === 1 ? "" : "s"}
          </AppText>
          {others.map((m, i) =>
            m.survey ? (
              <AppButton
                key={m.survey.id ?? i}
                variant="ghost"
                title={`${surveyNumberLabel(m.survey.survey_number, m.survey.sub_division)} • ${m.survey.farmer_name ?? "—"} • ${formatDistance(m.distance_meters)}`}
                onPress={() => openExisting(m)}
                style={styles.otherRow}
              />
            ) : null,
          )}
        </View>
      ) : null}

      <AppText variant="small" style={{ marginTop: 16, textAlign: "center" }}>
        A duplicate warning does not block submission. If this is a different field or farmer, you can submit anyway with a reason.
      </AppText>

      <BottomSheet visible={!!viewing} onClose={() => setViewing(null)} accessibilityLabel="Existing record details">
        {viewing?.survey ? (
          <View>
            <AppText variant="title">{viewing.survey.survey_id}</AppText>
            {viewing.survey.photo_url ? (
              <Image source={{ uri: viewing.survey.photo_url }} style={styles.sheetPhoto} contentFit="cover" />
            ) : null}
            <InfoRow label="Survey Number" value={surveyNumberLabel(viewing.survey.survey_number, viewing.survey.sub_division)} />
            <InfoRow label="Farmer" value={viewing.survey.farmer_name ?? "—"} />
            <InfoRow label="Mobile" value={viewing.survey.farmer_mobile ?? "—"} />
            <InfoRow label="Crop" value={viewing.survey.crop_name ?? "—"} />
            <InfoRow label="Area" value={formatArea(viewing.survey.area, viewing.survey.area_unit)} />
            <InfoRow label="Date of Visit" value={formatShortDate(viewing.survey.visit_date)} />
            <InfoRow label="Collected by" value={viewing.survey.collected_by_name ?? "—"} />
            <InfoRow label="Distance" value={formatDistance(viewing.distance_meters)} last />
            <AppText variant="small" style={{ marginTop: 10 }}>
              This record belongs to another surveyor, so only a summary is shown.
            </AppText>
          </View>
        ) : null}
      </BottomSheet>
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: 12 },
  alert: { flexDirection: "row", gap: 12, alignItems: "center", padding: 16, borderRadius: radius.lg, marginBottom: 18 },
  otherRow: { justifyContent: "flex-start", borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, marginBottom: 8 },
  sheetPhoto: { height: 170, borderRadius: radius.md, marginVertical: 12 },
});
