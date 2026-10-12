import { zodResolver } from "@hookform/resolvers/zod";
import { router } from "expo-router";
import { useMemo } from "react";
import { Controller, useForm } from "react-hook-form";
import { Alert, StyleSheet, View } from "react-native";
import { z } from "zod";
import { AppButton } from "@/components/ui/AppButton";
import { SkipButton } from "@/components/survey/SkipButton";
import { AppInput } from "@/components/ui/AppInput";
import { AppText } from "@/components/ui/AppText";
import { ProgressIndicator } from "@/components/ui/ProgressIndicator";
import { Screen } from "@/components/ui/Screen";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { DateField } from "@/components/forms/DateField";
import { SelectField } from "@/components/forms/SelectField";
import { useCrops } from "@/features/surveys/useCrops";
import { useDraft } from "@/features/surveys/useDraft";
import { useAuthStore } from "@/store/authStore";
import { useDraftStore } from "@/store/draftStore";
import { colors } from "@/theme";
import { AREA_UNITS, type AreaUnit } from "@/types/api";
import type { SurveyDraft } from "@/types/survey";
import { fromIsoDate, maxVisitDate, toIsoDate } from "@/utils/date";
import { AREA_UNIT_LABELS } from "@/utils/format";
import { detailsSchema } from "@/utils/validation";

const unitOptions = AREA_UNITS.map((u) => ({ value: u, label: AREA_UNIT_LABELS[u].one }));

const cropStepSchema = z.object({
  cropId: z.string().min(1, "Select the crop seen in the field"),
  area: detailsSchema.shape.area,
  areaUnit: z.enum(AREA_UNITS),
  visitDate: detailsSchema.shape.visitDate,
  notes: z.string().trim().max(2000),
});
type CropValues = z.infer<typeof cropStepSchema>;

/** Step 5 — crop observed in the field + surveyed area + date of visit. */
export default function CropStep() {
  const draft = useDraft();
  if (!draft) return null;
  return <CropForm draft={draft} />;
}

function CropForm({ draft }: { draft: SurveyDraft }) {
  const setDetails = useDraftStore((s) => s.setDetails);
  const setNotes = useDraftStore((s) => s.setNotes);
  const clearDetails = useDraftStore((s) => s.clearDetails);
  const skip = () =>
    Alert.alert(
      "Skip crop & area?",
      "A field survey needs crop & area, so only the 1/14 form will be saved. The location and photo from the previous steps won't be kept.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Skip", onPress: () => { clearDetails(); router.push("/survey/new/review"); } },
      ],
    );
  const collector = useAuthStore((s) => s.profile?.full_name);
  const { crops, loading: cropsLoading } = useCrops();
  const land = draft.land;
  const cropOptions = useMemo(() => crops.map((c) => ({ value: c.id, label: c.name })), [crops]);

  // Default the surveyed area to the 1/14 area in hectares.
  const defaultArea = land?.areaSqM && Number(land.areaSqM) > 0 ? String(Math.round((Number(land.areaSqM) / 10000) * 100) / 100 || "") : "";
  const { control, handleSubmit } = useForm<CropValues>({
    resolver: zodResolver(cropStepSchema),
    defaultValues: {
      cropId: draft.details?.cropId ?? land?.kharifCropId ?? "",
      area: draft.details?.area ?? defaultArea,
      areaUnit: draft.details?.areaUnit ?? ("hectare" as AreaUnit),
      visitDate: draft.details?.visitDate ?? toIsoDate(),
      notes: draft.notes ?? "",
    },
  });

  const onNext = handleSubmit((v) => {
    if (!draft.farmer || !land) {
      router.dismissTo("/survey/new/farmer");
      return;
    }
    // The survey record is derived from the farmer + 1/14 details already entered.
    setDetails(
      {
        farmerName: draft.farmer.name,
        farmerMobile: draft.farmer.mobile,
        cropId: v.cropId,
        area: v.area,
        areaUnit: v.areaUnit,
        surveyNumber: land.surveyNumber,
        subDivision: land.subDivision,
        visitDate: v.visitDate,
      },
      crops.find((c) => c.id === v.cropId)?.name ?? null,
    );
    setNotes(v.notes);
    router.push("/survey/new/review");
  });

  return (
    <Screen
      header={
        <>
          <ScreenHeader title="New 1/14 Form" right={<SkipButton onPress={skip} />} />
          <View style={styles.progress}>
            <ProgressIndicator current={5} />
          </View>
        </>
      }
      footer={<AppButton title="Next" icon="arrow-forward" onPress={onNext} />}
    >
      <AppText variant="heading" style={{ marginBottom: 10 }}>Crop &amp; area observed</AppText>
      <Controller control={control} name="cropId" render={({ field, fieldState }) => (
        <SelectField label="Crop" required searchable icon="leaf-outline" placeholder={cropsLoading ? "Loading crops…" : "Select crop"} value={field.value} options={cropOptions} onChange={(v) => field.onChange(v)} error={fieldState.error?.message} />
      )} />
      <View style={styles.row}>
        <View style={{ flex: 1.4 }}>
          <Controller control={control} name="area" render={({ field, fieldState }) => (
            <AppInput label="Surveyed area" required keyboardType="decimal-pad" value={field.value} onChangeText={(t) => field.onChange(t.replace(",", "."))} onBlur={field.onBlur} error={fieldState.error?.message} maxLength={12} />
          )} />
        </View>
        <View style={{ flex: 1 }}>
          <Controller control={control} name="areaUnit" render={({ field }) => (
            <SelectField label="Unit" value={field.value} options={unitOptions} onChange={(v) => field.onChange(v)} />
          )} />
        </View>
      </View>
      <Controller control={control} name="visitDate" render={({ field, fieldState }) => (
        <DateField label="Date of visit" required value={field.value} onChange={field.onChange} error={fieldState.error?.message} maximumDate={fromIsoDate(maxVisitDate())} minimumDate={new Date(2000, 0, 1)} />
      )} />
      <Controller control={control} name="notes" render={({ field }) => (
        <AppInput label="Field notes (optional)" multiline value={field.value} onChangeText={field.onChange} maxLength={2000} style={{ minHeight: 80, textAlignVertical: "top" }} />
      )} />
      <View style={styles.collector}>
        <AppText variant="small">Collected by</AppText>
        <AppText variant="bodyStrong">{collector ?? "You"}</AppText>
        <AppText variant="small">Set automatically from your signed-in account.</AppText>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  progress: { paddingHorizontal: 12, paddingBottom: 8 },
  row: { flexDirection: "row", gap: 12 },
  collector: { backgroundColor: colors.card, borderRadius: 12, padding: 14, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, gap: 2 },
});
