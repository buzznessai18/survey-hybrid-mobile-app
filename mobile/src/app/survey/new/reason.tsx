import { Ionicons } from "@expo/vector-icons";
import { zodResolver } from "@hookform/resolvers/zod";
import { router } from "expo-router";
import { Controller, useForm, useWatch } from "react-hook-form";
import { StyleSheet, View } from "react-native";
import { AppButton } from "@/components/ui/AppButton";
import { AppInput } from "@/components/ui/AppInput";
import { AppText } from "@/components/ui/AppText";
import { RadioOption } from "@/components/forms/RadioOption";
import { Screen } from "@/components/ui/Screen";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { useSubmitSurvey } from "@/features/surveys/useSubmitSurvey";
import { useDraftStore } from "@/store/draftStore";
import { colors, radius } from "@/theme";
import { DUPLICATE_REASONS } from "@/types/api";
import { DUPLICATE_REASON_LABELS } from "@/utils/format";
import { duplicateReasonSchema, type DuplicateReasonValues } from "@/utils/validation";

/** Screen 8 — reason for submitting a duplicate, sent with create-survey. */
export default function SubmitReason() {
  const draft = useDraftStore((s) => s.draft);
  const setDuplicateReason = useDraftStore((s) => s.setDuplicateReason);
  const { submit, submitting, error } = useSubmitSurvey();

  const { control, handleSubmit, formState } = useForm<DuplicateReasonValues>({
    resolver: zodResolver(duplicateReasonSchema),
    defaultValues: {
      reason: draft?.duplicateReason ?? (undefined as unknown as DuplicateReasonValues["reason"]),
      notes: draft?.duplicateReasonNotes ?? "",
    },
  });
  const reason = useWatch({ control, name: "reason" });

  const onConfirm = handleSubmit(async (values) => {
    setDuplicateReason(values.reason, values.notes);
    await submit();
  });

  return (
    <Screen
      header={<ScreenHeader title="Submit Anyway" />}
      footer={
        <View style={styles.row}>
          <AppButton title="Cancel" variant="ghost" onPress={() => router.back()} style={{ flex: 1 }} disabled={submitting} />
          <AppButton title="Confirm Submission" loading={submitting} loadingTitle="Submitting survey…" onPress={onConfirm} style={{ flex: 1.8 }} />
        </View>
      }
    >
      <View style={styles.info}>
        <Ionicons name="information-circle" size={22} color={colors.info} />
        <View style={{ flex: 1 }}>
          <AppText variant="bodyStrong" style={{ color: colors.info }}>
            Please provide a reason
          </AppText>
          <AppText variant="caption">Why are you submitting this duplicate survey?</AppText>
        </View>
      </View>

      <Controller
        control={control}
        name="reason"
        render={({ field, fieldState }) => (
          <View accessibilityRole="radiogroup" style={{ marginBottom: 8 }}>
            {DUPLICATE_REASONS.map((r) => (
              <RadioOption key={r} label={DUPLICATE_REASON_LABELS[r]} selected={field.value === r} onPress={() => field.onChange(r)} />
            ))}
            {fieldState.error || (formState.isSubmitted && !field.value) ? (
              <AppText variant="small" style={{ color: colors.error }}>
                Select a reason
              </AppText>
            ) : null}
          </View>
        )}
      />

      <Controller
        control={control}
        name="notes"
        render={({ field, fieldState }) => (
          <AppInput
            label={reason === "other" ? "Describe the reason" : "Additional notes (optional)"}
            required={reason === "other"}
            placeholder="Enter reason here…"
            multiline
            value={field.value}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
            error={fieldState.error?.message}
            maxLength={1000}
            style={{ minHeight: 100, textAlignVertical: "top" }}
          />
        )}
      />

      {error ? (
        <View style={styles.error} accessibilityRole="alert">
          <Ionicons name="alert-circle" size={18} color={colors.error} />
          <AppText variant="label" style={{ flex: 1, color: colors.error }}>
            {error.message}
          </AppText>
        </View>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: 12 },
  info: { flexDirection: "row", gap: 10, padding: 14, borderRadius: radius.md, backgroundColor: colors.infoSoft, marginBottom: 18 },
  error: { flexDirection: "row", gap: 8, alignItems: "center", padding: 12, borderRadius: radius.md, backgroundColor: colors.errorSoft },
});
