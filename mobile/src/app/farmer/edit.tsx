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
import { LoadingState } from "@/components/ui/States";
import { SelectField } from "@/components/forms/SelectField";
import { useRemote } from "@/features/common/useRemote";
import { errorMessage } from "@/services/api/errors";
import { FarmerService } from "@/services/records/RecordServices";
import { colors, radius } from "@/theme";
import { FARMER_CATEGORIES, GOA_TALUKAS, type Farmer } from "@/types/api";
import { CATEGORY_LABELS, GENDER_LABELS } from "@/utils/labels";
import { isValidMobile, normalizeMobile } from "@/utils/mobile";

const schema = z.object({
  name: z.string().trim().min(1, "Name is required").max(150),
  mobile: z.string().trim().refine(isValidMobile, "Enter a valid 10-digit mobile number"),
  father_name: z.string().trim().max(150),
  gender: z.string(),
  category: z.string(),
  village: z.string().trim().max(100),
  taluka: z.string(),
  address: z.string().trim().max(500),
  notes: z.string().trim().max(2000),
});
type Values = z.infer<typeof schema>;

/** Admin: create or edit a farmer. */
export default function FarmerEdit() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const existing = useRemote(() => (id ? FarmerService.get(id) : Promise.resolve(null)), id ?? "new");
  if (id && !existing.data) return <Screen header={<ScreenHeader title="Edit Farmer" />} scroll={false}><LoadingState /></Screen>;
  return <FarmerForm farmer={existing.data?.farmer ?? null} />;
}

function FarmerForm({ farmer }: { farmer: Farmer | null }) {
  const [saveError, setSaveError] = useState<string | null>(null);
  const { control, handleSubmit, formState } = useForm<Values>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: farmer?.name ?? "", mobile: farmer?.mobile ?? "", father_name: farmer?.father_name ?? "", gender: farmer?.gender ?? "",
      category: farmer?.category ?? "", village: farmer?.village ?? "", taluka: farmer?.taluka ?? "", address: farmer?.address ?? "", notes: farmer?.notes ?? "",
    },
  });
  const onSave = handleSubmit(async (v) => {
    setSaveError(null);
    const blank = (s: string) => (s.trim() ? s.trim() : null);
    try {
      const saved = await FarmerService.upsert({
        id: farmer?.id, name: v.name.trim(), mobile: normalizeMobile(v.mobile), father_name: blank(v.father_name),
        gender: (v.gender || null) as Farmer["gender"], category: (v.category || null) as Farmer["category"], village: blank(v.village),
        taluka: (v.taluka || null) as Farmer["taluka"], address: blank(v.address), notes: blank(v.notes),
      });
      if (farmer) router.back();
      else router.replace({ pathname: "/farmer/[id]", params: { id: saved.id } });
    } catch (e) {
      setSaveError(errorMessage(e));
    }
  });
  return (
    <Screen
      header={<ScreenHeader title={farmer ? "Edit Farmer" : "Add Farmer"} />}
      footer={<AppButton title="Save" icon="save-outline" loading={formState.isSubmitting} loadingTitle="Saving…" onPress={onSave} />}
    >
      {saveError ? (
        <View style={{ backgroundColor: colors.errorSoft, padding: 12, borderRadius: radius.md, marginBottom: 14 }}>
          <AppText variant="label" style={{ color: colors.error }}>{saveError}</AppText>
        </View>
      ) : null}
      <Controller control={control} name="name" render={({ field, fieldState }) => <AppInput label="Name" required value={field.value} onChangeText={field.onChange} error={fieldState.error?.message} />} />
      <Controller control={control} name="mobile" render={({ field, fieldState }) => <AppInput label="Mobile" required keyboardType="phone-pad" value={field.value} onChangeText={field.onChange} error={fieldState.error?.message} />} />
      <Controller control={control} name="father_name" render={({ field }) => <AppInput label="Father / husband name" value={field.value} onChangeText={field.onChange} />} />
      <View style={{ flexDirection: "row", gap: 12 }}>
        <View style={{ flex: 1 }}>
          <Controller control={control} name="gender" render={({ field }) => (
            <SelectField label="Gender" value={field.value} options={(["male", "female", "other"] as const).map((g) => ({ value: g, label: GENDER_LABELS[g] }))} onChange={field.onChange} />
          )} />
        </View>
        <View style={{ flex: 1 }}>
          <Controller control={control} name="category" render={({ field }) => (
            <SelectField label="Category" value={field.value} options={FARMER_CATEGORIES.map((c) => ({ value: c, label: CATEGORY_LABELS[c] }))} onChange={field.onChange} />
          )} />
        </View>
      </View>
      <Controller control={control} name="village" render={({ field }) => <AppInput label="Village" value={field.value} onChangeText={field.onChange} />} />
      <Controller control={control} name="taluka" render={({ field }) => (
        <SelectField label="Taluka" searchable value={field.value} options={GOA_TALUKAS.map((t) => ({ value: t, label: t }))} onChange={field.onChange} />
      )} />
      <Controller control={control} name="address" render={({ field }) => <AppInput label="Address" multiline value={field.value} onChangeText={field.onChange} />} />
      <Controller control={control} name="notes" render={({ field }) => <AppInput label="Notes" multiline value={field.value} onChangeText={field.onChange} />} />
    </Screen>
  );
}
