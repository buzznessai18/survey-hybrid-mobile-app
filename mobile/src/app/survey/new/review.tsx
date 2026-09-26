import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { Pressable, StyleSheet, View } from "react-native";
import Animated, { FadeIn, FadeInDown } from "react-native-reanimated";
import { AppButton } from "@/components/ui/AppButton";
import { AppCard } from "@/components/ui/AppCard";
import { AppInput } from "@/components/ui/AppInput";
import { AppText } from "@/components/ui/AppText";
import { Field } from "@/components/ui/InfoRow";
import { PhotoPreview } from "@/components/ui/PhotoPreview";
import { ProgressIndicator } from "@/components/ui/ProgressIndicator";
import { Screen } from "@/components/ui/Screen";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { useDuplicateCheck } from "@/features/surveys/useDuplicateCheck";
import { useSubmitSurvey } from "@/features/surveys/useSubmitSurvey";
import { useDraftStore } from "@/store/draftStore";
import { useNetworkStore } from "@/store/networkStore";
import { colors, radius } from "@/theme";
import { formatShortDate } from "@/utils/date";
import { DUPLICATE_REASON_LABELS, formatArea, formatCoord, formatDistance, surveyNumberLabel } from "@/utils/format";
import { normalizeMobile } from "@/utils/mobile";
import { BACKEND_FIELD_TO_FORM } from "@/utils/validation";

export default function ReviewStep() {
  const draft = useDraftStore((s) => s.draft);
  const setNotes = useDraftStore((s) => s.setNotes);
  const setDuplicateCheck = useDraftStore((s) => s.setDuplicateCheck);
  const isOnline = useNetworkStore((s) => s.isOnline);
  const { submit, submitting, error } = useSubmitSurvey();

  const d = draft?.details;
  const loc = draft?.location ?? null;

  // Full backend check now that GPS + farmer mobile are known.
  const duplicate = useDuplicateCheck(d?.surveyNumber ?? "", d?.subDivision ?? "", {
    location: loc,
    farmerMobile: d?.farmerMobile,
    enabled: !!d,
    onResult: setDuplicateCheck,
    cached: { key: draft?.duplicateCheckKey ?? null, result: draft?.duplicateCheck ?? null },
  });

  if (!draft || !d || !loc) {
    return (
      <Screen header={<ScreenHeader title="Review" />}>
        <AppText variant="body">This survey is incomplete. Please go back and complete all steps.</AppText>
        <AppButton title="Go to details" onPress={() => router.dismissTo("/survey/new/details")} style={{ marginTop: 16 }} />
      </Screen>
    );
  }

  const hasWarning = duplicate.status === "duplicate";
  const exact = hasWarning && duplicate.interpretation.level === "duplicate";
  const farmerSurveys = duplicate.status === "duplicate" || duplicate.status === "available" ? duplicate.interpretation.farmerSurveys : [];

  const onSubmit = () => {
    if (hasWarning && !draft.duplicateReason) {
      router.push("/survey/new/duplicate");
      return;
    }
    void submit();
  };

  const fieldErrors = error?.fields ? Object.entries(error.fields) : [];
  const detailFieldError = fieldErrors.some(([k]) => k in BACKEND_FIELD_TO_FORM);

  return (
    <Screen
      header={
        <>
          <ScreenHeader title="Review Survey" />
          <View style={styles.progress}>
            <ProgressIndicator current={4} />
          </View>
        </>
      }
      footer={
        <AppButton
          title={hasWarning && !draft.duplicateReason ? "Review Duplicate & Submit" : "Submit Survey"}
          icon="cloud-upload-outline"
          loading={submitting}
          loadingTitle="Submitting survey…"
          disabled={duplicate.status === "checking"}
          onPress={onSubmit}
          accessibilityHint={isOnline ? undefined : "You're offline. The survey will be saved and synced later."}
        />
      }
    >
      {duplicate.status === "checking" ? (
        <View style={[styles.banner, { backgroundColor: "#EEF0EC" }]}>
          <Ionicons name="sync" size={18} color={colors.muted} />
          <AppText variant="label">Checking for duplicates…</AppText>
        </View>
      ) : hasWarning ? (
        <Animated.View entering={FadeIn}>
          <Pressable
            onPress={() => router.push("/survey/new/duplicate")}
            accessibilityRole="button"
            accessibilityLabel="Possible duplicate. Tap to view the existing record."
            style={[styles.banner, { backgroundColor: exact ? colors.errorSoft : colors.warningSoft }]}
          >
            <Ionicons name="warning" size={20} color={exact ? colors.error : colors.warning} />
            <View style={{ flex: 1 }}>
              <AppText variant="bodyStrong" style={{ color: exact ? colors.error : "#8A5308" }}>
                ⚠ Possible Duplicate
              </AppText>
              <AppText variant="small">
                {exact ? "This Survey Number already exists." : "A survey with this number exists nearby."}
                {duplicate.interpretation.nearestDistance !== null
                  ? ` Nearest: ${formatDistance(duplicate.interpretation.nearestDistance)}.`
                  : ""}
              </AppText>
              {draft.duplicateReason ? (
                <AppText variant="small" style={{ color: colors.text, marginTop: 2 }}>
                  Reason: {DUPLICATE_REASON_LABELS[draft.duplicateReason]}
                </AppText>
              ) : null}
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.muted} />
          </Pressable>
        </Animated.View>
      ) : duplicate.status === "available" ? (
        <View style={[styles.banner, { backgroundColor: colors.successSoft }]}>
          <Ionicons name="checkmark-circle" size={18} color={colors.success} />
          <AppText variant="label" style={{ color: colors.primaryDark }}>
            No duplicate found for this survey number
          </AppText>
        </View>
      ) : duplicate.status === "offline" || !isOnline ? (
        <View style={[styles.banner, { backgroundColor: "#EEF0EC" }]}>
          <Ionicons name="cloud-offline-outline" size={18} color={colors.muted} />
          <AppText variant="label" style={{ flex: 1 }}>
            You&apos;re offline. The survey will be saved on this device and checked for duplicates when it syncs.
          </AppText>
        </View>
      ) : null}

      {error ? (
        <Animated.View entering={FadeInDown} style={styles.errorBox} accessibilityRole="alert">
          <View style={{ flexDirection: "row", gap: 8 }}>
            <Ionicons name="alert-circle" size={20} color={colors.error} />
            <AppText variant="bodyStrong" style={{ flex: 1, color: colors.error }}>
              {error.message}
            </AppText>
          </View>
          {fieldErrors.map(([k, v]) => (
            <AppText key={k} variant="caption" style={{ marginTop: 4 }}>
              • {v}
            </AppText>
          ))}
          {detailFieldError ? (
            <AppButton title="Edit details" variant="secondary" compact onPress={() => router.dismissTo("/survey/new/details")} style={{ marginTop: 10 }} />
          ) : null}
        </Animated.View>
      ) : null}

      <Animated.View entering={FadeInDown.duration(300)}>
        <AppCard style={{ gap: 16 }}>
          <SectionTitle title="Farmer & Crop" onEdit={() => router.dismissTo("/survey/new/details")} />
          <View style={styles.grid}>
            <Cell label="Farmer" value={d.farmerName} sub={normalizeMobile(d.farmerMobile)} />
            <Cell label="Crop" value={draft.cropName ?? "—"} />
            <Cell label="Area" value={formatArea(d.area, d.areaUnit)} />
            <Cell label="Date of Visit" value={formatShortDate(d.visitDate)} />
            <Cell label="Survey Number" value={surveyNumberLabel(d.surveyNumber, d.subDivision || null)} />
            <Cell label="Sub-Division" value={d.subDivision || "—"} />
          </View>
        </AppCard>

        <AppCard style={{ gap: 16, marginTop: 12 }}>
          <SectionTitle title="Location" onEdit={() => router.dismissTo("/survey/new/location")} />
          <View style={styles.grid}>
            <Cell label="Latitude" value={formatCoord(loc.latitude)} />
            <Cell label="Longitude" value={formatCoord(loc.longitude)} />
            <Cell label="Accuracy" value={`${Math.round(loc.accuracy)} m`} />
          </View>
        </AppCard>

        <AppCard style={{ gap: 12, marginTop: 12 }}>
          <SectionTitle title="Field Photo" onEdit={() => router.dismissTo("/survey/new/photo")} />
          <PhotoPreview uri={draft.photo?.uri} height={200} />
        </AppCard>

        {farmerSurveys.length > 0 ? (
          <View style={styles.info}>
            <Ionicons name="information-circle-outline" size={18} color={colors.info} />
            <AppText variant="caption" style={{ flex: 1 }}>
              This farmer already has {farmerSurveys.length} other survey{farmerSurveys.length === 1 ? "" : "s"}. A farmer can own several fields, so this is not a duplicate.
            </AppText>
          </View>
        ) : null}

        <View style={{ marginTop: 16 }}>
          <AppInput
            label="Notes (optional)"
            placeholder="Anything the reviewer should know"
            multiline
            value={draft.notes}
            onChangeText={setNotes}
            maxLength={2000}
            style={{ minHeight: 90, textAlignVertical: "top" }}
          />
        </View>
      </Animated.View>
    </Screen>
  );
}

function SectionTitle({ title, onEdit }: { title: string; onEdit: () => void }) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
      <AppText variant="heading">{title}</AppText>
      <Pressable onPress={onEdit} hitSlop={12} accessibilityRole="button" accessibilityLabel={`Edit ${title}`}>
        <AppText variant="label" style={{ color: colors.primary }}>
          Edit
        </AppText>
      </Pressable>
    </View>
  );
}

function Cell({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <View style={{ width: "50%", paddingRight: 8 }}>
      <Field
        label={label}
        value={
          <View>
            <AppText variant="bodyStrong">{value}</AppText>
            {sub ? <AppText variant="caption">{sub}</AppText> : null}
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  progress: { paddingHorizontal: 12, paddingBottom: 8 },
  banner: { flexDirection: "row", alignItems: "center", gap: 10, padding: 14, borderRadius: radius.md, marginBottom: 14 },
  errorBox: { backgroundColor: colors.errorSoft, borderRadius: radius.md, padding: 14, marginBottom: 14 },
  grid: { flexDirection: "row", flexWrap: "wrap", rowGap: 16 },
  info: { flexDirection: "row", gap: 8, alignItems: "center", marginTop: 12, padding: 12, borderRadius: radius.md, backgroundColor: colors.infoSoft },
});
