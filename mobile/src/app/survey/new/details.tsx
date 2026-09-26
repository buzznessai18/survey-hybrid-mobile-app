import { zodResolver } from "@hookform/resolvers/zod";
import { router } from "expo-router";
import { useMemo, useRef } from "react";
import { Controller, useForm, useWatch } from "react-hook-form";
import { StyleSheet, TextInput, View } from "react-native";
import { AppButton } from "@/components/ui/AppButton";
import { AppInput } from "@/components/ui/AppInput";
import { AppText } from "@/components/ui/AppText";
import { ProgressIndicator } from "@/components/ui/ProgressIndicator";
import { Screen } from "@/components/ui/Screen";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { DateField } from "@/components/forms/DateField";
import { SelectField } from "@/components/forms/SelectField";
import { DuplicateCheckStatus } from "@/components/survey/DuplicateCheckStatus";
import { useCrops } from "@/features/surveys/useCrops";
import { useDraft } from "@/features/surveys/useDraft";
import { useDuplicateCheck } from "@/features/surveys/useDuplicateCheck";
import { useAuthStore } from "@/store/authStore";
import { useDraftStore } from "@/store/draftStore";
import { colors } from "@/theme";
import { AREA_UNITS } from "@/types/api";
import type { SurveyDraft } from "@/types/survey";
import { fromIsoDate, maxVisitDate, toIsoDate } from "@/utils/date";
import { AREA_UNIT_LABELS } from "@/utils/format";
import { detailsSchema, type DetailsFormValues } from "@/utils/validation";

const unitOptions = AREA_UNITS.map((u) => ({ value: u, label: AREA_UNIT_LABELS[u].one }));

export default function DetailsStep() {
  const draft = useDraft();
  if (!draft) return null;
  return <DetailsForm draft={draft} />;
}

function DetailsForm({ draft }: { draft: SurveyDraft }) {
  const setDetails = useDraftStore((s) => s.setDetails);
  const setDuplicateCheck = useDraftStore((s) => s.setDuplicateCheck);
  const collector = useAuthStore((s) => s.profile?.full_name);
  const { crops, loading: cropsLoading, error: cropsError, refresh: refreshCrops } = useCrops();

  const mobileRef = useRef<TextInput>(null);
  const areaRef = useRef<TextInput>(null);
  const subDivRef = useRef<TextInput>(null);

  const { control, handleSubmit } = useForm<DetailsFormValues>({
    resolver: zodResolver(detailsSchema),
    mode: "onTouched",
    defaultValues: draft.details ?? {
      farmerName: "",
      farmerMobile: "",
      cropId: "",
      area: "",
      areaUnit: "acre",
      surveyNumber: "",
      subDivision: "",
      visitDate: toIsoDate(),
    },
  });

  const [surveyNumber, subDivision] = useWatch({ control, name: ["surveyNumber", "subDivision"] });
  const duplicate = useDuplicateCheck(surveyNumber ?? "", subDivision ?? "", {
    onResult: setDuplicateCheck,
    cached: { key: draft.duplicateCheckKey, result: draft.duplicateCheck },
  });

  const cropOptions = useMemo(() => crops.map((c) => ({ value: c.id, label: c.name })), [crops]);

  const onNext = handleSubmit((values) => {
    const cropName = crops.find((c) => c.id === values.cropId)?.name ?? draft.cropName;
    setDetails(values, cropName ?? null);
    router.push("/survey/new/location");
  });

  return (
    <Screen
      header={
        <>
          <ScreenHeader title="New Field Survey" />
          <View style={styles.progress}>
            <ProgressIndicator current={1} />
          </View>
        </>
      }
      footer={<AppButton title="Next" icon="arrow-forward" onPress={onNext} />}
    >
      <Controller
        control={control}
        name="farmerName"
        render={({ field, fieldState }) => (
          <AppInput
            label="Farmer Name"
            required
            placeholder="e.g. Ramesh Kumar"
            autoCapitalize="words"
            returnKeyType="next"
            onSubmitEditing={() => mobileRef.current?.focus()}
            value={field.value}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
            error={fieldState.error?.message}
            maxLength={150}
          />
        )}
      />
      <Controller
        control={control}
        name="farmerMobile"
        render={({ field, fieldState }) => (
          <AppInput
            ref={mobileRef}
            label="Mobile Number"
            required
            placeholder="10-digit mobile number"
            keyboardType="phone-pad"
            textContentType="telephoneNumber"
            icon="call-outline"
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
          <SelectField
            label="Crop"
            required
            searchable
            icon="leaf-outline"
            placeholder={cropsLoading ? "Loading crops…" : "Select crop"}
            value={field.value}
            options={cropOptions}
            onChange={(v) => field.onChange(v)}
            error={fieldState.error?.message ?? (cropsError ? `${cropsError} Connect to the internet once to download the crop list.` : undefined)}
            emptyMessage={cropsError ? "Crops unavailable offline. Connect once to download them." : "No crops found"}
          />
        )}
      />
      {cropsError ? (
        <AppButton title="Retry loading crops" variant="ghost" compact icon="refresh" onPress={refreshCrops} style={{ marginTop: -8, marginBottom: 8 }} />
      ) : null}

      <View style={styles.row}>
        <View style={{ flex: 1.4 }}>
          <Controller
            control={control}
            name="area"
            render={({ field, fieldState }) => (
              <AppInput
                ref={areaRef}
                label="Area"
                required
                placeholder="e.g. 2.5"
                keyboardType="decimal-pad"
                value={field.value}
                onChangeText={(t) => field.onChange(t.replace(",", "."))}
                onBlur={field.onBlur}
                error={fieldState.error?.message}
                maxLength={12}
              />
            )}
          />
        </View>
        <View style={{ flex: 1 }}>
          <Controller
            control={control}
            name="areaUnit"
            render={({ field }) => (
              <SelectField label="Area Unit" value={field.value} options={unitOptions} onChange={(v) => field.onChange(v)} />
            )}
          />
        </View>
      </View>

      <View style={styles.row}>
        <View style={{ flex: 1.4 }}>
          <Controller
            control={control}
            name="surveyNumber"
            render={({ field, fieldState }) => (
              <AppInput
                label="Survey Number"
                required
                prominent
                placeholder="e.g. 125"
                autoCapitalize="characters"
                returnKeyType="next"
                onSubmitEditing={() => subDivRef.current?.focus()}
                value={field.value}
                onChangeText={field.onChange}
                onBlur={field.onBlur}
                error={fieldState.error?.message}
                maxLength={50}
              />
            )}
          />
        </View>
        <View style={{ flex: 1 }}>
          <Controller
            control={control}
            name="subDivision"
            render={({ field, fieldState }) => (
              <AppInput
                ref={subDivRef}
                label="Sub-Division"
                prominent
                placeholder="e.g. 2"
                autoCapitalize="characters"
                value={field.value}
                onChangeText={field.onChange}
                onBlur={field.onBlur}
                error={fieldState.error?.message}
                maxLength={50}
              />
            )}
          />
        </View>
      </View>
      <DuplicateCheckStatus
        state={duplicate}
        onPress={() => router.push({ pathname: "/survey/new/duplicate", params: { mode: "preview" } })}
      />

      <Controller
        control={control}
        name="visitDate"
        render={({ field, fieldState }) => (
          <DateField
            label="Date of Visit"
            required
            value={field.value}
            onChange={field.onChange}
            error={fieldState.error?.message}
            maximumDate={fromIsoDate(maxVisitDate())}
            minimumDate={new Date(2000, 0, 1)}
          />
        )}
      />

      <View style={styles.collector} accessible accessibilityLabel={`Added by ${collector ?? "you"}`}>
        <AppText variant="small">Added by</AppText>
        <AppText variant="bodyStrong">{collector ?? "You"}</AppText>
        <AppText variant="small">Set automatically from your signed-in account.</AppText>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  progress: { paddingHorizontal: 12, paddingBottom: 8, backgroundColor: colors.background },
  row: { flexDirection: "row", gap: 12 },
  collector: {
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    gap: 2,
  },
});
