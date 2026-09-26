import { zodResolver } from "@hookform/resolvers/zod";
import { router, useLocalSearchParams } from "expo-router";
import { useMemo, useState } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { StyleSheet, View } from "react-native";
import { AppButton } from "@/components/ui/AppButton";
import { AppInput } from "@/components/ui/AppInput";
import { AppText } from "@/components/ui/AppText";
import { Screen } from "@/components/ui/Screen";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { ErrorState, LoadingState } from "@/components/ui/States";
import { DateField } from "@/components/forms/DateField";
import { SelectField } from "@/components/forms/SelectField";
import { DuplicateCheckStatus } from "@/components/survey/DuplicateCheckStatus";
import { useCrops } from "@/features/surveys/useCrops";
import { useDuplicateCheck } from "@/features/surveys/useDuplicateCheck";
import { useSurveyDetail } from "@/features/surveys/useSurveyDetail";
import { errorMessage, toApiError } from "@/services/api/errors";
import { SurveyService } from "@/services/surveys/SurveyService";
import { useNetworkStore } from "@/store/networkStore";
import { colors, radius } from "@/theme";
import { AREA_UNITS, type SurveyDetail } from "@/types/api";
import type { SurveyDetailsValues } from "@/types/survey";
import { fromIsoDate, maxVisitDate } from "@/utils/date";
import { AREA_UNIT_LABELS } from "@/utils/format";
import { toUpdatePayload } from "@/utils/serialization";
import { BACKEND_FIELD_TO_FORM, detailsSchema, type DetailsFormValues } from "@/utils/validation";

const unitOptions = AREA_UNITS.map((u) => ({ value: u, label: AREA_UNIT_LABELS[u].one }));

function toFormValues(s: SurveyDetail): SurveyDetailsValues {
  return {
    farmerName: s.farmer_name ?? "",
    farmerMobile: s.farmer_mobile ?? "",
    cropId: s.crop_id,
    area: String(s.area),
    areaUnit: s.area_unit,
    surveyNumber: s.survey_number,
    subDivision: s.sub_division ?? "",
    visitDate: s.visit_date,
  };
}

export default function EditSurveyScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { survey, loading, error, reload } = useSurveyDetail(id);

  if (loading && !survey) {
    return (
      <Screen header={<ScreenHeader title="Edit Survey" />} scroll={false}>
        <LoadingState />
      </Screen>
    );
  }
  if (!survey) {
    return (
      <Screen header={<ScreenHeader title="Edit Survey" />} scroll={false}>
        <ErrorState offline={error?.offline} message={error?.message} onRetry={reload} />
      </Screen>
    );
  }
  return <EditForm survey={survey} />;
}

function EditForm({ survey }: { survey: SurveyDetail }) {
  const isOnline = useNetworkStore((s) => s.isOnline);
  const { crops } = useCrops();
  const initial = useMemo(() => toFormValues(survey), [survey]);
  const [notes, setNotes] = useState(survey.notes ?? "");
  const [saveError, setSaveError] = useState<string | null>(null);

  const { control, handleSubmit, formState, setError } = useForm<DetailsFormValues>({
    resolver: zodResolver(detailsSchema),
    mode: "onTouched",
    defaultValues: initial,
  });
  const [surveyNumber, subDivision] = useWatch({ control, name: ["surveyNumber", "subDivision"] });
  const changedKey = surveyNumber !== initial.surveyNumber || subDivision !== initial.subDivision;
  const duplicate = useDuplicateCheck(surveyNumber ?? "", subDivision ?? "", {
    enabled: changedKey,
    location: { latitude: survey.latitude, longitude: survey.longitude },
    excludeSurveyId: survey.id,
  });

  const cropOptions = useMemo(() => {
    const opts = crops.map((c) => ({ value: c.id, label: c.name }));
    if (!opts.some((o) => o.value === survey.crop_id)) opts.unshift({ value: survey.crop_id, label: survey.crop_name ?? "Current crop" });
    return opts;
  }, [crops, survey.crop_id, survey.crop_name]);

  const onSave = handleSubmit(async (values) => {
    setSaveError(null);
    const patch = toUpdatePayload(survey.id, initial, values, { before: survey.notes ?? "", after: notes });
    if (Object.keys(patch).length === 1) {
      router.back();
      return;
    }
    try {
      await SurveyService.updateSurvey(patch);
      router.back();
    } catch (e) {
      const err = toApiError(e);
      if (err.fields) {
        for (const [k, msg] of Object.entries(err.fields)) {
          const field = BACKEND_FIELD_TO_FORM[k];
          if (field) setError(field, { message: msg });
        }
      }
      setSaveError(err.isConnectivity ? "No internet connection. Connect to save your changes." : errorMessage(e));
    }
  });

  return (
    <Screen
      header={<ScreenHeader title={`Edit ${survey.survey_id}`} />}
      footer={
        <AppButton
          title={isOnline ? "Save Changes" : "Connect to save"}
          icon="save-outline"
          loading={formState.isSubmitting}
          loadingTitle="Saving…"
          disabled={!isOnline}
          onPress={onSave}
        />
      }
    >
      {saveError ? (
        <View style={styles.error} accessibilityRole="alert">
          <AppText variant="label" style={{ color: colors.error }}>
            {saveError}
          </AppText>
        </View>
      ) : null}

      <Controller
        control={control}
        name="farmerName"
        render={({ field, fieldState }) => (
          <AppInput label="Farmer Name" required value={field.value} onChangeText={field.onChange} onBlur={field.onBlur} error={fieldState.error?.message} maxLength={150} />
        )}
      />
      <Controller
        control={control}
        name="farmerMobile"
        render={({ field, fieldState }) => (
          <AppInput
            label="Mobile Number"
            required
            keyboardType="phone-pad"
            value={field.value}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
            error={fieldState.error?.message}
            maxLength={16}
          />
        )}
      />
      <Controller
        control={control}
        name="cropId"
        render={({ field, fieldState }) => (
          <SelectField label="Crop" required searchable icon="leaf-outline" value={field.value} options={cropOptions} onChange={(v) => field.onChange(v)} error={fieldState.error?.message} />
        )}
      />
      <View style={styles.row}>
        <View style={{ flex: 1.4 }}>
          <Controller
            control={control}
            name="area"
            render={({ field, fieldState }) => (
              <AppInput
                label="Area"
                required
                keyboardType="decimal-pad"
                value={field.value}
                onChangeText={(t) => field.onChange(t.replace(",", "."))}
                onBlur={field.onBlur}
                error={fieldState.error?.message}
              />
            )}
          />
        </View>
        <View style={{ flex: 1 }}>
          <Controller
            control={control}
            name="areaUnit"
            render={({ field }) => <SelectField label="Area Unit" value={field.value} options={unitOptions} onChange={(v) => field.onChange(v)} />}
          />
        </View>
      </View>
      <View style={styles.row}>
        <View style={{ flex: 1.4 }}>
          <Controller
            control={control}
            name="surveyNumber"
            render={({ field, fieldState }) => (
              <AppInput label="Survey Number" required prominent autoCapitalize="characters" value={field.value} onChangeText={field.onChange} onBlur={field.onBlur} error={fieldState.error?.message} maxLength={50} />
            )}
          />
        </View>
        <View style={{ flex: 1 }}>
          <Controller
            control={control}
            name="subDivision"
            render={({ field, fieldState }) => (
              <AppInput label="Sub-Division" prominent autoCapitalize="characters" value={field.value} onChangeText={field.onChange} onBlur={field.onBlur} error={fieldState.error?.message} maxLength={50} />
            )}
          />
        </View>
      </View>
      {changedKey ? <DuplicateCheckStatus state={duplicate} /> : null}
      {changedKey && duplicate.status === "duplicate" ? (
        <AppText variant="small" style={{ marginTop: -8, marginBottom: 14 }}>
          You can still save. The server will record the duplicate for supervisor review.
        </AppText>
      ) : null}

      <Controller
        control={control}
        name="visitDate"
        render={({ field, fieldState }) => (
          <DateField label="Date of Visit" required value={field.value} onChange={field.onChange} error={fieldState.error?.message} maximumDate={fromIsoDate(maxVisitDate())} />
        )}
      />
      <AppInput label="Notes (optional)" multiline value={notes} onChangeText={setNotes} maxLength={2000} style={{ minHeight: 90, textAlignVertical: "top" }} />
      <AppText variant="small">Location and photo are kept as captured in the field.</AppText>
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: 12 },
  error: { backgroundColor: colors.errorSoft, padding: 12, borderRadius: radius.md, marginBottom: 14 },
});
