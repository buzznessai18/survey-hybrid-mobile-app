import { zodResolver } from "@hookform/resolvers/zod";
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { View } from "react-native";
import { z } from "zod";
import { AppButton } from "@/components/ui/AppButton";
import { AppInput } from "@/components/ui/AppInput";
import { AppText } from "@/components/ui/AppText";
import { Screen } from "@/components/ui/Screen";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { ErrorState, LoadingState } from "@/components/ui/States";
import { SelectField } from "@/components/forms/SelectField";
import { useRemote } from "@/features/common/useRemote";
import { errorMessage, toApiError } from "@/services/api/errors";
import { FormService } from "@/services/records/RecordServices";
import { colors, radius } from "@/theme";
import { GOA_TALUKAS, type LandForm } from "@/types/api";

/** Same fields as the land step (021); other stored values are left as they are. */
const schema = z.object({
  village: z.string().trim().min(1, "Village is required").max(100),
  taluka: z.enum(GOA_TALUKAS),
  survey_number: z.string().trim().min(1, "Survey number is required").max(50),
  sub_division: z.string().trim().max(50),
  remarks: z.string().trim().max(2000),
});
type Values = z.infer<typeof schema>;

export default function FormEdit() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, loading, error, reload } = useRemote(() => FormService.get(id), id);
  if (!data) {
    return (
      <Screen header={<ScreenHeader title="Edit 1/14 Form" />} scroll={false}>
        {loading ? <LoadingState /> : <ErrorState offline={error?.offline} message={error?.message} onRetry={reload} />}
      </Screen>
    );
  }
  return <EditForm form={data.form} />;
}

function EditForm({ form }: { form: LandForm }) {
  const [saveError, setSaveError] = useState<string | null>(null);
  const initial: Values = {
    village: form.village, taluka: form.taluka, survey_number: form.survey_number, sub_division: form.sub_division ?? "",
    remarks: form.remarks ?? "",
  };
  const { control, handleSubmit, formState, setError } = useForm<Values>({ resolver: zodResolver(schema), defaultValues: initial });

  const onSave = handleSubmit(async (v) => {
    setSaveError(null);
    const changes: Record<string, unknown> = {};
    const blank = (s: string) => (s.trim() ? s.trim() : null);
    const next: Record<string, unknown> = { ...v, sub_division: blank(v.sub_division), remarks: blank(v.remarks) };
    const before: Record<string, unknown> = { ...form };
    for (const [k, val] of Object.entries(next)) if (val !== before[k]) changes[k] = val;
    if (Object.keys(changes).length === 0) return router.back();
    try {
      await FormService.update(form.id, changes as Partial<LandForm>);
      router.back();
    } catch (e) {
      const err = toApiError(e);
      for (const [k, m] of Object.entries(err.fields ?? {})) setError(k as keyof Values, { message: m });
      setSaveError(errorMessage(e));
    }
  });

  const text = (name: keyof Values, label: string, extra: Partial<React.ComponentProps<typeof AppInput>> = {}) => (
    <Controller control={control} name={name} render={({ field, fieldState }) => (
      <AppInput label={label} value={field.value as string} onChangeText={field.onChange} onBlur={field.onBlur} error={fieldState.error?.message} {...extra} />
    )} />
  );

  return (
    <Screen
      header={<ScreenHeader title={`Edit ${form.form_id}`} />}
      footer={<AppButton title="Save changes" icon="save-outline" loading={formState.isSubmitting} loadingTitle="Saving…" onPress={onSave} />}
    >
      {saveError ? (
        <View style={{ backgroundColor: colors.errorSoft, padding: 12, borderRadius: radius.md, marginBottom: 14 }}>
          <AppText variant="label" style={{ color: colors.error }}>{saveError}</AppText>
        </View>
      ) : null}
      <View style={{ flexDirection: "row", gap: 12 }}>
        <View style={{ flex: 1.2 }}>{text("village", "Village")}</View>
        <View style={{ flex: 1 }}>
          <Controller control={control} name="taluka" render={({ field }) => (
            <SelectField label="Taluka" searchable value={field.value} options={GOA_TALUKAS.map((t) => ({ value: t, label: t }))} onChange={field.onChange} />
          )} />
        </View>
      </View>
      <View style={{ flexDirection: "row", gap: 12 }}>
        <View style={{ flex: 1.2 }}>{text("survey_number", "Survey number", { autoCapitalize: "characters" })}</View>
        <View style={{ flex: 1 }}>{text("sub_division", "Sub-division", { autoCapitalize: "characters" })}</View>
      </View>
      {text("remarks", "Remarks", { multiline: true, style: { minHeight: 70, textAlignVertical: "top" } })}
    </Screen>
  );
}
