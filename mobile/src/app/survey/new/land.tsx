import { zodResolver } from "@hookform/resolvers/zod";
import { router } from "expo-router";
import { Controller, useForm, useWatch } from "react-hook-form";
import { StyleSheet, View } from "react-native";
import { z } from "zod";
import { AppButton } from "@/components/ui/AppButton";
import { AppInput } from "@/components/ui/AppInput";
import { AppText } from "@/components/ui/AppText";
import { ProgressIndicator } from "@/components/ui/ProgressIndicator";
import { Screen } from "@/components/ui/Screen";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { SelectField } from "@/components/forms/SelectField";
import { FormCheckStatus } from "@/components/survey/FormCheckStatus";
import { useDraft } from "@/features/surveys/useDraft";
import { useFormDuplicateCheck } from "@/features/surveys/useFormDuplicateCheck";
import { useDraftStore } from "@/store/draftStore";
import { colors } from "@/theme";
import { GOA_TALUKAS } from "@/types/api";
import type { LandDraft, SurveyDraft } from "@/types/survey";

/** Mirrors land-records/index.ts landFields (the rest are optional since 021). */
const landSchema = z.object({
  village: z.string().trim().min(1, "Village is required").max(100),
  taluka: z.enum(GOA_TALUKAS, "Select the taluka"),
  surveyNumber: z.string().trim().min(1, "Survey number is required").max(50),
  subDivision: z.string().trim().max(50),
  remarks: z.string().trim().max(2000),
});

const talukaOptions = GOA_TALUKAS.map((t) => ({ value: t, label: t }));

export default function LandStep() {
  const draft = useDraft();
  if (!draft) return null;
  return <LandForm draft={draft} />;
}

function LandForm({ draft }: { draft: SurveyDraft }) {
  const setLand = useDraftStore((s) => s.setLand);
  const setFormDuplicateCheck = useDraftStore((s) => s.setFormDuplicateCheck);
  const f = draft.farmer;

  const { control, handleSubmit } = useForm<LandDraft>({
    resolver: zodResolver(landSchema),
    mode: "onTouched",
    defaultValues: draft.land ?? {
      village: f?.village ?? "",
      taluka: (f?.taluka || undefined) as LandDraft["taluka"],
      surveyNumber: "",
      subDivision: "",
      remarks: "",
    },
  });
  const [sn, sd, village] = useWatch({ control, name: ["surveyNumber", "subDivision", "village"] });
  const check = useFormDuplicateCheck(
    { surveyNumber: sn ?? "", subDivision: sd ?? "", village: village ?? "" },
    { onResult: setFormDuplicateCheck },
  );

  const onNext = handleSubmit((values) => {
    setLand(values);
    router.push("/survey/new/location");
  });

  return (
    <Screen
      header={
        <>
          <ScreenHeader title="New 1/14 Form" />
          <View style={styles.progress}>
            <ProgressIndicator current={2} />
          </View>
        </>
      }
      footer={<AppButton title="Next" icon="arrow-forward" onPress={onNext} />}
    >
      {f ? (
        <AppText variant="caption" style={{ marginBottom: 12 }}>
          Farmer: <AppText variant="label">{f.name}</AppText> ({f.mobile})
        </AppText>
      ) : null}

      <AppText variant="heading" style={styles.section}>Land identification</AppText>
      <View style={styles.row}>
        <View style={{ flex: 1.2 }}>
          <Controller control={control} name="village" render={({ field, fieldState }) => (
            <AppInput label="Village" required autoCapitalize="words" value={field.value} onChangeText={field.onChange} onBlur={field.onBlur} error={fieldState.error?.message} maxLength={100} />
          )} />
        </View>
        <View style={{ flex: 1 }}>
          <Controller control={control} name="taluka" render={({ field, fieldState }) => (
            <SelectField label="Taluka" required searchable value={field.value} options={talukaOptions} onChange={(v) => field.onChange(v)} error={fieldState.error?.message} />
          )} />
        </View>
      </View>
      <View style={styles.row}>
        <View style={{ flex: 1.2 }}>
          <Controller control={control} name="surveyNumber" render={({ field, fieldState }) => (
            <AppInput label="Survey number" required prominent autoCapitalize="characters" placeholder="e.g. 112" value={field.value} onChangeText={field.onChange} onBlur={field.onBlur} error={fieldState.error?.message} maxLength={50} />
          )} />
        </View>
        <View style={{ flex: 1 }}>
          <Controller control={control} name="subDivision" render={({ field, fieldState }) => (
            <AppInput label="Sub-division" prominent autoCapitalize="characters" placeholder="e.g. 3" value={field.value} onChangeText={field.onChange} onBlur={field.onBlur} error={fieldState.error?.message} maxLength={50} />
          )} />
        </View>
      </View>
      <FormCheckStatus state={check} onPress={() => router.push({ pathname: "/survey/new/duplicate", params: { mode: "preview" } })} />

      <Controller control={control} name="remarks" render={({ field }) => (
        <AppInput label="Remarks" multiline value={field.value} onChangeText={field.onChange} maxLength={2000} style={{ minHeight: 70, textAlignVertical: "top" }} />
      )} />
      <AppText variant="small" style={{ color: colors.muted }}>
        GPS location and a field photograph are captured in the next steps.
      </AppText>
    </Screen>
  );
}

const styles = StyleSheet.create({
  progress: { paddingHorizontal: 12, paddingBottom: 8 },
  row: { flexDirection: "row", gap: 12 },
  section: { marginBottom: 10, marginTop: 4 },
});
