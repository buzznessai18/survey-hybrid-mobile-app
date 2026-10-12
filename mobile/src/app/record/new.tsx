import { zodResolver } from "@hookform/resolvers/zod";
import { Ionicons } from "@expo/vector-icons";
import * as Crypto from "expo-crypto";
import { router } from "expo-router";
import { useRef, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { Alert, StyleSheet, View, type TextInput } from "react-native";
import { SelectField } from "@/components/forms/SelectField";
import { AppButton } from "@/components/ui/AppButton";
import { AppInput } from "@/components/ui/AppInput";
import { AppText } from "@/components/ui/AppText";
import { Screen } from "@/components/ui/Screen";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { recordCache } from "@/features/records/recordCache";
import { ApiError, errorMessage } from "@/services/api/errors";
import { ServiceRecordService } from "@/services/records/ServiceRecordService";
import { useNetworkStore } from "@/store/networkStore";
import { colors, radius } from "@/theme";
import type { Gender, LandUnit } from "@/types/api";
import { GENDER_LABELS, LAND_UNIT_LABELS } from "@/utils/labels";
import {
  EMPTY_SERVICE_RECORD, parseLandSize, SERVICE_RECORD_FIELD_TO_FORM, serviceRecordSchema, type ServiceRecordFormValues,
} from "@/utils/validation";

const GENDER_OPTIONS = (["male", "female", "other"] as const).map((g) => ({ value: g, label: GENDER_LABELS[g] }));
const UNIT_OPTIONS = (["acre", "sq_m"] as const).map((u) => ({ value: u, label: LAND_UNIT_LABELS[u] }));

const blank = (s: string) => (s.trim() ? s.trim() : null);

/** Add a farmer equipment / service record: one simple screen, saved to the backend. */
export default function NewRecordScreen() {
  const isOnline = useNetworkStore((s) => s.isOnline);
  const [saveError, setSaveError] = useState<string | null>(null);
  // Idempotency key for this record. It is kept across failed attempts, so a retry
  // after a lost response returns the already-saved record instead of a duplicate.
  const recordId = useRef(Crypto.randomUUID());
  const savingRef = useRef(false);
  const surveyRef = useRef<TextInput>(null);
  const subDivRef = useRef<TextInput>(null);
  const sizeRef = useRef<TextInput>(null);

  const { control, handleSubmit, formState, setError } = useForm<ServiceRecordFormValues>({
    resolver: zodResolver(serviceRecordSchema),
    defaultValues: EMPTY_SERVICE_RECORD,
    mode: "onTouched",
  });

  const save = async (v: ServiceRecordFormValues) => {
    if (savingRef.current) return; // double taps
    savingRef.current = true;
    setSaveError(null);
    try {
      const { record, idempotent_replay } = await ServiceRecordService.create({
        id: recordId.current,
        farmer_name: v.farmerName.trim(),
        gender: (v.gender || null) as Gender | null,
        address: blank(v.address),
        survey_number: v.surveyNumber.trim(),
        sub_division: blank(v.subDivision),
        land_size: parseLandSize(v.landSize),
        land_unit: v.landUnit as LandUnit,
        service_details: blank(v.serviceDetails),
      });
      recordCache.put(record);
      router.replace({ pathname: "/record/[id]", params: { id: record.id, saved: idempotent_replay ? "replay" : "new" } });
    } catch (e) {
      // Values stay in the form; the same record id is reused on retry.
      const fields = e instanceof ApiError ? e.fields : undefined;
      let highlighted = false;
      for (const [key, message] of Object.entries(fields ?? {})) {
        const name = SERVICE_RECORD_FIELD_TO_FORM[key];
        if (name) {
          setError(name, { message });
          highlighted = true;
        }
      }
      setSaveError(highlighted ? "The record was not saved. Please correct the highlighted fields." : `The record was not saved. ${errorMessage(e)}`);
    } finally {
      savingRef.current = false;
    }
  };
  const onSave = () => void handleSubmit(save)();

  const leave = () => {
    if (!formState.isDirty || formState.isSubmitting) return router.back();
    Alert.alert("Discard this record?", "The details you entered will be lost.", [
      { text: "Keep editing", style: "cancel" },
      { text: "Discard", style: "destructive", onPress: () => router.back() },
    ]);
  };

  return (
    <Screen
      header={<ScreenHeader title="Add Record" backIcon="close" onBack={leave} />}
      footer={
        <AppButton
          title="Save Record"
          icon="checkmark-circle-outline"
          loading={formState.isSubmitting}
          loadingTitle="Saving…"
          onPress={onSave}
          accessibilityHint="Saves the record. You can print the receipt next."
        />
      }
    >
      {!isOnline ? (
        <Banner tone="warning" icon="cloud-offline-outline" text="You're offline. Records are saved to the server, so connect to the internet before saving." />
      ) : null}
      {saveError ? <Banner tone="error" icon="alert-circle-outline" text={saveError} /> : null}

      <AppText variant="small" style={{ marginBottom: 14 }}>
        Fields marked <AppText variant="small" style={{ color: colors.error }}>*</AppText> are required. Date and time are recorded automatically when you save.
      </AppText>

      <SectionTitle title="Farmer" />
      <Controller control={control} name="farmerName" render={({ field, fieldState }) => (
        <AppInput
          label="Farmer name" required value={field.value} onChangeText={field.onChange} onBlur={field.onBlur}
          error={fieldState.error?.message} autoCapitalize="words" autoComplete="name" returnKeyType="next"
          maxLength={150} placeholder="Full name"
        />
      )} />
      <Controller control={control} name="gender" render={({ field }) => (
        <SelectField label="Gender" value={field.value} options={GENDER_OPTIONS} onChange={field.onChange} placeholder="Select gender" />
      )} />
      <Controller control={control} name="address" render={({ field, fieldState }) => (
        <AppInput
          label="Address" multiline value={field.value} onChangeText={field.onChange} onBlur={field.onBlur}
          error={fieldState.error?.message} autoCapitalize="sentences" maxLength={500} placeholder="House, village, taluka"
          style={styles.multiline}
        />
      )} />

      <SectionTitle title="Land" />
      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          <Controller control={control} name="surveyNumber" render={({ field, fieldState }) => (
            <AppInput
              ref={surveyRef} label="Survey no." required value={field.value} onChangeText={field.onChange} onBlur={field.onBlur}
              error={fieldState.error?.message} autoCapitalize="characters" autoCorrect={false} returnKeyType="next"
              onSubmitEditing={() => subDivRef.current?.focus()} maxLength={50} placeholder="e.g. 312"
            />
          )} />
        </View>
        <View style={{ flex: 1 }}>
          <Controller control={control} name="subDivision" render={({ field, fieldState }) => (
            <AppInput
              ref={subDivRef} label="Sub-division no." value={field.value} onChangeText={field.onChange} onBlur={field.onBlur}
              error={fieldState.error?.message} autoCapitalize="characters" autoCorrect={false} returnKeyType="next"
              onSubmitEditing={() => sizeRef.current?.focus()} maxLength={50} placeholder="e.g. 4B"
            />
          )} />
        </View>
      </View>
      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          <Controller control={control} name="landSize" render={({ field, fieldState }) => (
            <AppInput
              ref={sizeRef} label="Land size" required value={field.value} onChangeText={field.onChange} onBlur={field.onBlur}
              error={fieldState.error?.message} keyboardType="decimal-pad" inputMode="decimal" maxLength={16} placeholder="e.g. 2.5"
            />
          )} />
        </View>
        <View style={{ flex: 1 }}>
          <Controller control={control} name="landUnit" render={({ field, fieldState }) => (
            <SelectField label="Unit" required value={field.value} options={UNIT_OPTIONS} onChange={field.onChange} placeholder="Select" error={fieldState.error?.message} />
          )} />
        </View>
      </View>

      <SectionTitle title="Equipment / service" />
      <Controller control={control} name="serviceDetails" render={({ field, fieldState }) => (
        <AppInput
          label="Equipment provided or work completed" multiline value={field.value} onChangeText={field.onChange} onBlur={field.onBlur}
          error={fieldState.error?.message} autoCapitalize="sentences" maxLength={2000}
          placeholder="e.g. Tractor provided. Land ploughing completed."
          hint="Describe in your own words what was provided or done."
          style={[styles.multiline, { minHeight: 110 }]}
        />
      )} />
    </Screen>
  );
}

function SectionTitle({ title }: { title: string }) {
  return <AppText variant="heading" style={{ marginBottom: 10, marginTop: 4 }} accessibilityRole="header">{title}</AppText>;
}

function Banner({ tone, icon, text }: { tone: "error" | "warning"; icon: "alert-circle-outline" | "cloud-offline-outline"; text: string }) {
  const fg = tone === "error" ? colors.error : colors.warning;
  return (
    <View style={[styles.banner, { backgroundColor: tone === "error" ? colors.errorSoft : colors.warningSoft }]} accessibilityRole="alert" accessibilityLiveRegion="polite">
      <Ionicons name={icon} size={18} color={fg} />
      <AppText variant="label" style={{ color: tone === "error" ? colors.error : colors.text, flex: 1 }}>{text}</AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: 12 },
  multiline: { minHeight: 80, textAlignVertical: "top" },
  banner: { flexDirection: "row", gap: 8, alignItems: "flex-start", padding: 12, borderRadius: radius.md, marginBottom: 14 },
});
