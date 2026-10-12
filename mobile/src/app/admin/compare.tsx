import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Alert, StyleSheet, View } from "react-native";
import { AppButton } from "@/components/ui/AppButton";
import { AppCard } from "@/components/ui/AppCard";
import { AppInput } from "@/components/ui/AppInput";
import { AppText } from "@/components/ui/AppText";
import { Screen } from "@/components/ui/Screen";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { ErrorState, LoadingState } from "@/components/ui/States";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { useRemote } from "@/features/common/useRemote";
import { errorMessage } from "@/services/api/errors";
import { ReviewService } from "@/services/records/RecordServices";
import { SurveyService } from "@/services/surveys/SurveyService";
import { colors, radius } from "@/theme";
import type { ReviewStatus, StoredDuplicateMatch, SurveyDetail } from "@/types/api";
import { formatShortDate } from "@/utils/date";
import { DUPLICATE_REASON_LABELS, formatArea, formatCoord, formatDistance, surveyNumberLabel } from "@/utils/format";
import { serverStatusView } from "@/utils/status";

const REVIEW: Record<ReviewStatus, { label: string; tone: "warning" | "error" | "success" | "info" }> = {
  pending: { label: "Awaiting review", tone: "warning" },
  confirmed_duplicate: { label: "Confirmed duplicate", tone: "error" },
  not_duplicate: { label: "Not a duplicate", tone: "success" },
  needs_verification: { label: "Needs verification", tone: "info" },
};

/** Admin: compare a survey with each record it matched, and mark the outcome. */
export default function CompareScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, loading, error, reload, setData } = useRemote(() => SurveyService.getSurvey(id), id);
  if (!data) {
    return (
      <Screen header={<ScreenHeader title="Compare Records" />} scroll={false}>
        {loading ? <LoadingState /> : <ErrorState offline={error?.offline} message={error?.message} onRetry={reload} />}
      </Screen>
    );
  }
  const matches = data.duplicate_check.matches;
  return (
    <Screen header={<ScreenHeader title="Compare Records" />}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <AppText variant="heading">{data.survey_id} · Sy. {surveyNumberLabel(data.survey_number, data.sub_division)}</AppText>
        <StatusBadge {...serverStatusView(data)} />
      </View>
      {data.duplicate_reason ? (
        <AppCard style={{ marginBottom: 12, backgroundColor: colors.infoSoft, borderColor: colors.infoSoft }}>
          <AppText variant="small">Reason given by {data.collected_by_name ?? "the surveyor"}</AppText>
          <AppText variant="bodyStrong">{DUPLICATE_REASON_LABELS[data.duplicate_reason]}</AppText>
          {data.duplicate_reason_notes ? <AppText variant="caption">{data.duplicate_reason_notes}</AppText> : null}
        </AppCard>
      ) : null}
      {matches.length === 0 ? <AppText variant="caption">This survey has no duplicate matches.</AppText> : null}
      {matches.map((m, i) => (
        <MatchCompare
          key={m.duplicate_match_id}
          index={i + 1}
          survey={data}
          match={m}
          onReviewed={(status, notes, surveyStatus) =>
            setData({
              ...data,
              duplicate_status: surveyStatus as SurveyDetail["duplicate_status"],
              duplicate_check: {
                ...data.duplicate_check,
                matches: matches.map((x) => (x.duplicate_match_id === m.duplicate_match_id ? { ...x, review_status: status, review_notes: notes ?? x.review_notes, reviewed_at: new Date().toISOString() } : x)),
              },
            })
          }
        />
      ))}
      <AppButton title="Open full survey" variant="ghost" icon="open-outline" compact onPress={() => router.push({ pathname: "/survey/[id]", params: { id: data.id } })} />
    </Screen>
  );
}

function MatchCompare({ index, survey, match, onReviewed }: {
  index: number; survey: SurveyDetail; match: StoredDuplicateMatch;
  onReviewed: (status: ReviewStatus, notes: string | undefined, surveyStatus: string) => void;
}) {
  const other = match.survey;
  const [notes, setNotes] = useState(match.review_notes ?? "");
  const [busy, setBusy] = useState<ReviewStatus | null>(null);
  const review = async (status: ReviewStatus) => {
    setBusy(status);
    try {
      const res = await ReviewService.review(match.duplicate_match_id, status, notes.trim() || undefined);
      onReviewed(status, notes.trim() || undefined, res.survey.duplicate_status);
    } catch (e) {
      Alert.alert("Couldn't save review", errorMessage(e));
    } finally {
      setBusy(null);
    }
  };
  const rows: [string, string, string][] = [
    ["Survey no.", surveyNumberLabel(survey.survey_number, survey.sub_division), other ? surveyNumberLabel(other.survey_number, other.sub_division) : "—"],
    ["Farmer", survey.farmer_name ?? "—", other?.farmer_name ?? "—"],
    ["Mobile", survey.farmer_mobile ?? "—", other?.farmer_mobile ?? "—"],
    ["Crop", survey.crop_name ?? "—", other?.crop_name ?? "—"],
    ["Area", formatArea(survey.area, survey.area_unit), other ? formatArea(other.area, other.area_unit) : "—"],
    ["Visit date", formatShortDate(survey.visit_date), other ? formatShortDate(other.visit_date) : "—"],
    ["Collected by", survey.collected_by_name ?? "—", other?.collected_by_name ?? "—"],
    ["GPS", `${formatCoord(survey.latitude)}, ${formatCoord(survey.longitude)}`, other ? `${formatCoord(other.latitude)}, ${formatCoord(other.longitude)}` : "—"],
    ["Record", survey.survey_id, other?.survey_id ?? "—"],
  ];
  const rv = REVIEW[match.review_status];
  return (
    <AppCard style={{ marginBottom: 16, gap: 12 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
        <AppText variant="heading">Match {index}</AppText>
        <StatusBadge label={rv.label} tone={rv.tone} />
      </View>
      <View style={styles.distance}>
        <Ionicons name="location" size={18} color={colors.primary} />
        <AppText variant="label" style={{ flex: 1 }}>
          {match.match_type === "proximity" ? "Same survey no., different sub-division" : "Same survey no. + sub-division"}
          {match.distance_meters !== null ? ` • ${formatDistance(match.distance_meters)} apart` : ""}
        </AppText>
      </View>
      <View style={styles.photos}>
        <Photo uri={survey.photo_url} label="This record" />
        <Photo uri={other?.photo_url ?? null} label="Existing record" />
      </View>
      <View>
        <View style={[styles.tr, styles.th]}>
          <AppText style={[styles.c0, styles.hText]}>Field</AppText>
          <AppText style={[styles.c, styles.hText]}>This record</AppText>
          <AppText style={[styles.c, styles.hText]}>Existing</AppText>
        </View>
        {rows.map(([label, a, b]) => {
          const differs = a !== b;
          return (
            <View key={label} style={styles.tr}>
              <AppText variant="small" style={styles.c0}>{label}</AppText>
              <AppText variant="caption" style={[styles.c, differs && styles.diff]}>{a}</AppText>
              <AppText variant="caption" style={[styles.c, differs && styles.diff]}>{b}</AppText>
            </View>
          );
        })}
      </View>
      {match.reviewed_by?.full_name ? (
        <AppText variant="small">Last reviewed by {match.reviewed_by.full_name}{match.reviewed_at ? ` on ${formatShortDate(match.reviewed_at)}` : ""}</AppText>
      ) : null}
      <AppInput label="Review notes" multiline value={notes} onChangeText={setNotes} maxLength={2000} placeholder="e.g. Different owner confirmed from 7/12 extract" style={{ minHeight: 60, textAlignVertical: "top" }} />
      <View style={{ gap: 8 }}>
        <View style={{ flexDirection: "row", gap: 8 }}>
          <AppButton title="Not duplicate" compact variant="secondary" style={{ flex: 1 }} loading={busy === "not_duplicate"} onPress={() => review("not_duplicate")} />
          <AppButton title="Confirm duplicate" compact variant="danger" style={{ flex: 1 }} loading={busy === "confirmed_duplicate"} onPress={() => review("confirmed_duplicate")} />
        </View>
        <AppButton title="Needs field verification" compact variant="ghost" icon="help-circle-outline" loading={busy === "needs_verification"} onPress={() => review("needs_verification")} />
      </View>
    </AppCard>
  );
}

function Photo({ uri, label }: { uri: string | null; label: string }) {
  return (
    <View style={{ flex: 1, gap: 4 }}>
      <View style={styles.photo}>
        {uri ? <Image source={{ uri }} style={StyleSheet.absoluteFill} contentFit="cover" /> : <Ionicons name="image-outline" size={24} color={colors.placeholder} />}
      </View>
      <AppText variant="small" style={{ textAlign: "center" }}>{label}</AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  distance: { flexDirection: "row", gap: 8, alignItems: "center", padding: 10, borderRadius: radius.md, backgroundColor: colors.background },
  photos: { flexDirection: "row", gap: 10 },
  photo: { height: 110, borderRadius: radius.md, overflow: "hidden", backgroundColor: "#E9EDE7", alignItems: "center", justifyContent: "center" },
  tr: { flexDirection: "row", paddingVertical: 7, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border, gap: 6 },
  th: { backgroundColor: colors.primarySoft, borderRadius: 8, paddingHorizontal: 6, borderBottomWidth: 0 },
  hText: { fontSize: 12, color: colors.primaryDark, fontWeight: "600" },
  c0: { width: 78 },
  c: { flex: 1 },
  diff: { color: colors.error },
});
