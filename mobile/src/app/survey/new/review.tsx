import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import type { ReactNode } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import Animated, { FadeIn, FadeInDown } from "react-native-reanimated";
import { AppButton } from "@/components/ui/AppButton";
import { AppCard } from "@/components/ui/AppCard";
import { AppText } from "@/components/ui/AppText";
import { Field } from "@/components/ui/InfoRow";
import { PhotoPreview } from "@/components/ui/PhotoPreview";
import { ProgressIndicator } from "@/components/ui/ProgressIndicator";
import { Screen } from "@/components/ui/Screen";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { useCrops } from "@/features/surveys/useCrops";
import { formCheckHasWarning, useFormDuplicateCheck } from "@/features/surveys/useFormDuplicateCheck";
import { useSubmitSurvey } from "@/features/surveys/useSubmitSurvey";
import { useDraftStore } from "@/store/draftStore";
import { useNetworkStore } from "@/store/networkStore";
import { colors, radius } from "@/theme";
import { formatShortDate } from "@/utils/date";
import { DUPLICATE_REASON_LABELS, formatArea, formatCoord, formatDistance } from "@/utils/format";
import { CATEGORY_LABELS, surveyNo } from "@/utils/labels";
import { normalizeMobile } from "@/utils/mobile";

export default function ReviewStep() {
  const draft = useDraftStore((s) => s.draft);
  const setFormDuplicateCheck = useDraftStore((s) => s.setFormDuplicateCheck);
  const isOnline = useNetworkStore((s) => s.isOnline);
  const { crops } = useCrops();
  const { submit, submitting, error } = useSubmitSurvey();

  const farmer = draft?.farmer;
  const land = draft?.land;
  const d = draft?.details;
  const loc = draft?.location ?? null;

  // Full check now that GPS is known: existing 1/14 forms + exact/nearby field surveys.
  const check = useFormDuplicateCheck(
    { surveyNumber: land?.surveyNumber ?? "", subDivision: land?.subDivision ?? "", village: land?.village, location: loc },
    { enabled: !!land, onResult: setFormDuplicateCheck },
  );

  // Steps 3–5 are optional: without location + crop & area only the 1/14 form is saved.
  const withSurvey = !!d && !!loc;

  if (!draft || !farmer || !land) {
    return (
      <Screen header={<ScreenHeader title="Review" />}>
        <AppText variant="body">This form is incomplete. Please go back and complete all steps.</AppText>
        <AppButton title="Start from the farmer step" onPress={() => router.dismissTo("/survey/new/farmer")} style={{ marginTop: 16 }} />
      </Screen>
    );
  }

  const result = check.status === "duplicate" || check.status === "clear" ? check.result : draft.formDuplicateCheck;
  const hasWarning = check.status === "duplicate" || (check.status !== "clear" && formCheckHasWarning(result));
  const cropName = (id: string) => crops.find((c) => c.id === id)?.name ?? "—";

  const onSubmit = () => {
    if (hasWarning && !draft.duplicateReason) {
      router.push("/survey/new/duplicate");
      return;
    }
    void submit();
  };

  return (
    <Screen
      header={
        <>
          <ScreenHeader title="Review 1/14 Form" />
          <View style={styles.progress}>
            <ProgressIndicator current={6} />
          </View>
        </>
      }
      footer={
        <AppButton
          title={hasWarning && !draft.duplicateReason ? "Review Duplicate & Submit" : "Submit Form"}
          icon="cloud-upload-outline"
          loading={submitting}
          loadingTitle="Submitting…"
          disabled={check.status === "checking"}
          onPress={onSubmit}
        />
      }
    >
      {check.status === "checking" ? (
        <Banner tone="neutral" icon="sync">Checking existing records…</Banner>
      ) : hasWarning ? (
        <Animated.View entering={FadeIn}>
          <Pressable onPress={() => router.push("/survey/new/duplicate")} accessibilityRole="button">
            <Banner tone="error" icon="warning">
              <AppText variant="bodyStrong" style={{ color: colors.error }}>⚠ Possible duplicate record</AppText>
              <AppText variant="small">
                {result?.same_village_forms ? `${result.same_village_forms} 1/14 form(s) for this survey no. in ${land.village}. ` : ""}
                {result?.survey_check.matches.length ? `${result.survey_check.matches.length} field survey(s)` : ""}
                {result?.survey_check.nearest_distance_meters != null ? `, nearest ${formatDistance(result.survey_check.nearest_distance_meters)}` : ""}
                {draft.duplicateReason ? ` • Reason: ${DUPLICATE_REASON_LABELS[draft.duplicateReason]}` : " • Tap to view"}
              </AppText>
            </Banner>
          </Pressable>
        </Animated.View>
      ) : check.status === "clear" ? (
        <Banner tone="ok" icon="checkmark-circle">No duplicate 1/14 form or survey found</Banner>
      ) : check.status === "offline" || !isOnline ? (
        <Banner tone="neutral" icon="cloud-offline-outline">
          You&apos;re offline. The form is saved on this device and checked for duplicates when it syncs.
        </Banner>
      ) : null}

      {error ? (
        <Animated.View entering={FadeInDown} style={styles.errorBox} accessibilityRole="alert">
          <AppText variant="bodyStrong" style={{ color: colors.error }}>{error.message}</AppText>
          {error.fields ? Object.values(error.fields).map((m) => <AppText key={m} variant="caption">• {m}</AppText>) : null}
        </Animated.View>
      ) : null}

      <Section title="Farmer" onEdit={() => router.dismissTo("/survey/new/farmer")}>
        <Cell label="Name" value={farmer.name} sub={normalizeMobile(farmer.mobile)} />
        <Cell label="Village / taluka" value={[farmer.village, farmer.taluka].filter(Boolean).join(", ") || "—"} />
        {farmer.category ? <Cell label="Category" value={CATEGORY_LABELS[farmer.category]} /> : null}
        <Cell label="Record" value={farmer.id ? "Existing farmer" : "New farmer"} />
      </Section>

      <Section title="1/14 land details" onEdit={() => router.dismissTo("/survey/new/land")}>
        <Cell label="Survey no." value={surveyNo(land.surveyNumber, land.subDivision || null)} />
        <Cell label="Village" value={`${land.village}, ${land.taluka}`} />
        <Cell label="Remarks" value={land.remarks.trim() || "—"} />
      </Section>

      {withSurvey && d && loc ? (
        <>
          <Section title="Location" onEdit={() => router.dismissTo("/survey/new/location")}>
            <Cell label="Latitude" value={formatCoord(loc.latitude)} />
            <Cell label="Longitude" value={formatCoord(loc.longitude)} />
            <Cell label="Accuracy" value={`${Math.round(loc.accuracy)} m`} />
          </Section>

          <AppCard style={{ gap: 12, marginTop: 12 }}>
            <SectionTitle title="Field photo" onEdit={() => router.dismissTo("/survey/new/photo")} />
            {draft.photo ? <PhotoPreview uri={draft.photo.uri} height={190} /> : <AppText variant="caption">Skipped — no photo.</AppText>}
          </AppCard>

          <Section title="Crop & area" onEdit={() => router.dismissTo("/survey/new/details")}>
            <Cell label="Crop" value={draft.cropName ?? cropName(d.cropId)} />
            <Cell label="Surveyed area" value={formatArea(d.area, d.areaUnit)} />
            <Cell label="Date of visit" value={formatShortDate(d.visitDate)} />
            {draft.notes ? <Cell label="Notes" value={draft.notes} /> : null}
          </Section>
        </>
      ) : (
        <AppCard style={{ gap: 10, marginTop: 12 }}>
          <AppText variant="heading">No field survey</AppText>
          <AppText variant="caption">
            {loc ? "Crop & area was skipped" : "Location was skipped"}, so only the 1/14 form will be saved — no GPS, photo or crop.
          </AppText>
          <AppButton title="Add field survey" icon="location-outline" variant="secondary" compact onPress={() => router.dismissTo(loc ? "/survey/new/details" : "/survey/new/location")} />
        </AppCard>
      )}
    </Screen>
  );
}

function Banner({ tone, icon, children }: { tone: "ok" | "error" | "neutral"; icon: "sync" | "warning" | "checkmark-circle" | "cloud-offline-outline"; children: ReactNode }) {
  const bg = tone === "ok" ? colors.successSoft : tone === "error" ? colors.errorSoft : "#EEF0EC";
  const fg = tone === "ok" ? colors.success : tone === "error" ? colors.error : colors.muted;
  return (
    <View style={[styles.banner, { backgroundColor: bg }]}>
      <Ionicons name={icon} size={20} color={fg} />
      <View style={{ flex: 1 }}>{typeof children === "string" ? <AppText variant="label">{children}</AppText> : children}</View>
    </View>
  );
}

function Section({ title, onEdit, children }: { title: string; onEdit: () => void; children: ReactNode }) {
  return (
    <Animated.View entering={FadeInDown.duration(250)}>
      <AppCard style={{ gap: 14, marginTop: 12 }}>
        <SectionTitle title={title} onEdit={onEdit} />
        <View style={styles.grid}>{children}</View>
      </AppCard>
    </Animated.View>
  );
}

function SectionTitle({ title, onEdit }: { title: string; onEdit: () => void }) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
      <AppText variant="heading">{title}</AppText>
      <Pressable onPress={onEdit} hitSlop={12} accessibilityRole="button" accessibilityLabel={`Edit ${title}`}>
        <AppText variant="label" style={{ color: colors.primary }}>Edit</AppText>
      </Pressable>
    </View>
  );
}

function Cell({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <View style={{ width: "50%", paddingRight: 8 }}>
      <Field label={label} value={<View><AppText variant="bodyStrong">{value}</AppText>{sub ? <AppText variant="caption">{sub}</AppText> : null}</View>} />
    </View>
  );
}

const styles = StyleSheet.create({
  progress: { paddingHorizontal: 12, paddingBottom: 8 },
  banner: { flexDirection: "row", alignItems: "center", gap: 10, padding: 14, borderRadius: radius.md, marginBottom: 4 },
  errorBox: { backgroundColor: colors.errorSoft, borderRadius: radius.md, padding: 14, marginTop: 10 },
  grid: { flexDirection: "row", flexWrap: "wrap", rowGap: 14 },
});
