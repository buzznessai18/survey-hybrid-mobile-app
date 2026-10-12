import { Ionicons } from "@expo/vector-icons";
import { zodResolver } from "@hookform/resolvers/zod";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { ActivityIndicator, Pressable, StyleSheet, TextInput, View } from "react-native";
import { z } from "zod";
import { AppButton } from "@/components/ui/AppButton";
import { AppCard } from "@/components/ui/AppCard";
import { AppInput } from "@/components/ui/AppInput";
import { AppText } from "@/components/ui/AppText";
import { Avatar } from "@/components/ui/Avatar";
import { ProgressIndicator } from "@/components/ui/ProgressIndicator";
import { Screen } from "@/components/ui/Screen";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { Segmented } from "@/components/ui/Segmented";
import { SelectField } from "@/components/forms/SelectField";
import { useDraft } from "@/features/surveys/useDraft";
import { errorMessage } from "@/services/api/errors";
import { FarmerService } from "@/services/records/RecordServices";
import { useDraftStore } from "@/store/draftStore";
import { useNetworkStore } from "@/store/networkStore";
import { colors, fonts, radius } from "@/theme";
import { FARMER_CATEGORIES, GOA_TALUKAS, type FarmerSearchItem } from "@/types/api";
import type { FarmerDraft } from "@/types/survey";
import { CATEGORY_LABELS, formatSqM, GENDER_LABELS } from "@/utils/labels";
import { isValidMobile, normalizeMobile } from "@/utils/mobile";

const newFarmerSchema = z.object({
  name: z.string().trim().min(1, "Farmer name is required").max(150),
  mobile: z.string().trim().refine(isValidMobile, "Enter a valid 10-digit mobile number"),
  fatherName: z.string().trim().max(150),
  gender: z.enum(["male", "female", "other", ""]),
  category: z.enum(["general", "obc", "sc", "st", ""]),
  village: z.string().trim().min(1, "Village is required").max(100),
  taluka: z.string().refine((v) => (GOA_TALUKAS as readonly string[]).includes(v), "Select the taluka"),
});
type NewFarmer = z.infer<typeof newFarmerSchema>;

const talukaOptions = GOA_TALUKAS.map((t) => ({ value: t, label: t }));
const categoryOptions = FARMER_CATEGORIES.map((c) => ({ value: c, label: CATEGORY_LABELS[c] }));
const genderOptions = (["male", "female", "other"] as const).map((g) => ({ value: g, label: GENDER_LABELS[g] }));

const fromSearch = (f: FarmerSearchItem): FarmerDraft => ({
  id: f.id, name: f.name, mobile: f.mobile, fatherName: f.father_name ?? "", gender: f.gender ?? "",
  category: f.category ?? "", village: f.village ?? "", taluka: f.taluka ?? "",
});

/** Step 1 — pick an existing farmer (search) or register a new one. */
export default function FarmerStep() {
  const draft = useDraft();
  const setFarmer = useDraftStore((s) => s.setFarmer);
  const isOnline = useNetworkStore((s) => s.isOnline);
  const [mode, setMode] = useState<"existing" | "new">(isOnline ? "existing" : "new");
  const [q, setQ] = useState("");
  const [results, setResults] = useState<FarmerSearchItem[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const selected = draft?.farmer?.id ? draft.farmer : null;

  const { control, handleSubmit } = useForm<NewFarmer>({
    resolver: zodResolver(newFarmerSchema),
    defaultValues: draft?.farmer && !draft.farmer.id
      ? {
        name: draft.farmer.name, mobile: draft.farmer.mobile, fatherName: draft.farmer.fatherName, gender: draft.farmer.gender,
        category: draft.farmer.category, village: draft.farmer.village, taluka: draft.farmer.taluka,
      }
      : { name: "", mobile: "", fatherName: "", gender: "", category: "", village: "", taluka: "" },
  });

  useEffect(() => {
    const term = q.trim();
    if (mode !== "existing" || term.length < 2 || !isOnline) return;
    let cancelled = false;
    const t = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await FarmerService.search({ q: term, page_size: 10 });
        if (!cancelled) {
          setResults(res.data);
          setError(null);
        }
      } catch (e) {
        if (!cancelled) setError(errorMessage(e));
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [q, mode, isOnline]);

  const next = () => router.push("/survey/new/land");
  const saveNew = handleSubmit((v) => {
    setFarmer({ id: null, ...v, mobile: normalizeMobile(v.mobile), taluka: v.taluka as FarmerDraft["taluka"] });
    next();
  });

  return (
    <Screen
      header={
        <>
          <ScreenHeader title="New 1/14 Form" />
          <View style={styles.progress}>
            <ProgressIndicator current={1} />
          </View>
        </>
      }
      footer={
        mode === "existing" ? (
          <AppButton title="Next" icon="arrow-forward" onPress={next} disabled={!selected} />
        ) : (
          <AppButton title="Next" icon="arrow-forward" onPress={saveNew} />
        )
      }
    >
      <Segmented
        value={mode}
        onChange={setMode}
        options={[
          { value: "existing", label: "Existing farmer" },
          { value: "new", label: "New farmer" },
        ]}
      />
      <View style={{ height: 16 }} />

      {mode === "existing" ? (
        <>
          {selected ? (
            <AppCard style={styles.selected}>
              <Avatar name={selected.name} size={44} />
              <View style={{ flex: 1 }}>
                <AppText variant="bodyStrong">{selected.name}</AppText>
                <AppText variant="caption">
                  {selected.mobile} • {[selected.village, selected.taluka].filter(Boolean).join(", ") || "—"}
                </AppText>
              </View>
              <Ionicons name="checkmark-circle" size={24} color={colors.primary} />
            </AppCard>
          ) : null}
          <View style={styles.search}>
            <Ionicons name="search" size={18} color={colors.muted} />
            <TextInput
              value={q}
              onChangeText={setQ}
              placeholder="Name, mobile or survey no. (e.g. 112/3)"
              placeholderTextColor={colors.placeholder}
              style={styles.searchInput}
              autoCorrect={false}
              editable={isOnline}
              accessibilityLabel="Search farmer"
            />
            {searching ? <ActivityIndicator size="small" color={colors.primary} /> : null}
          </View>
          {!isOnline ? (
            <AppText variant="caption" style={{ marginTop: 10 }}>
              Offline: farmer search needs internet. Use “New farmer” — the server links it to an existing record with the same name and mobile.
            </AppText>
          ) : error ? (
            <AppText variant="caption" style={{ color: colors.error, marginTop: 10 }}>{error}</AppText>
          ) : q.trim().length >= 2 && !searching && results.length === 0 ? (
            <View style={{ marginTop: 12, gap: 8 }}>
              <AppText variant="caption">No farmer found for “{q.trim()}”.</AppText>
              <AppButton title="Register as new farmer" variant="secondary" compact icon="person-add-outline" onPress={() => setMode("new")} />
            </View>
          ) : null}
          <View style={{ marginTop: 12 }}>
            {results.map((f) => {
              const active = selected?.id === f.id;
              return (
                <Pressable
                  key={f.id}
                  onPress={() => setFarmer(fromSearch(f))}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  style={({ pressed }) => [styles.result, active && styles.resultActive, pressed && { opacity: 0.85 }]}
                >
                  <Avatar name={f.name} size={40} />
                  <View style={{ flex: 1 }}>
                    <AppText variant="bodyStrong">{f.name}</AppText>
                    <AppText variant="caption">{f.mobile} • {[f.village, f.taluka].filter(Boolean).join(", ") || "—"}</AppText>
                    <AppText variant="small">
                      {f.form_count} land record{f.form_count === 1 ? "" : "s"} • {formatSqM(f.land_sq_m)}
                      {f.survey_numbers.length ? ` • Sy. ${f.survey_numbers.slice(0, 3).join(", ")}` : ""}
                    </AppText>
                  </View>
                  {active ? <Ionicons name="checkmark-circle" size={22} color={colors.primary} /> : null}
                </Pressable>
              );
            })}
          </View>
        </>
      ) : (
        <>
          <Controller control={control} name="name" render={({ field, fieldState }) => (
            <AppInput label="Farmer name" required autoCapitalize="words" value={field.value} onChangeText={field.onChange} onBlur={field.onBlur} error={fieldState.error?.message} maxLength={150} />
          )} />
          <Controller control={control} name="mobile" render={({ field, fieldState }) => (
            <AppInput label="Mobile number" required keyboardType="phone-pad" icon="call-outline" value={field.value} onChangeText={field.onChange} onBlur={field.onBlur} error={fieldState.error?.message} maxLength={16} />
          )} />
          <Controller control={control} name="fatherName" render={({ field }) => (
            <AppInput label="Father / husband name" autoCapitalize="words" value={field.value} onChangeText={field.onChange} maxLength={150} />
          )} />
          <View style={styles.row}>
            <View style={{ flex: 1 }}>
              <Controller control={control} name="gender" render={({ field }) => (
                <SelectField label="Gender" value={field.value} options={genderOptions} onChange={(v) => field.onChange(v)} placeholder="Select" />
              )} />
            </View>
            <View style={{ flex: 1 }}>
              <Controller control={control} name="category" render={({ field }) => (
                <SelectField label="Category" value={field.value} options={categoryOptions} onChange={(v) => field.onChange(v)} placeholder="Select" />
              )} />
            </View>
          </View>
          <Controller control={control} name="village" render={({ field, fieldState }) => (
            <AppInput label="Village" required autoCapitalize="words" value={field.value} onChangeText={field.onChange} onBlur={field.onBlur} error={fieldState.error?.message} maxLength={100} />
          )} />
          <Controller control={control} name="taluka" render={({ field, fieldState }) => (
            <SelectField label="Taluka" required searchable value={field.value} options={talukaOptions} onChange={(v) => field.onChange(v)} error={fieldState.error?.message} />
          )} />
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  progress: { paddingHorizontal: 12, paddingBottom: 8 },
  row: { flexDirection: "row", gap: 12 },
  selected: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 12, borderColor: colors.primaryBorder, backgroundColor: colors.primarySoft },
  search: {
    flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, minHeight: 50,
    borderRadius: radius.md, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border,
  },
  searchInput: { flex: 1, fontFamily: fonts.regular, fontSize: 15.5, color: colors.text },
  result: {
    flexDirection: "row", alignItems: "center", gap: 12, padding: 12, marginBottom: 8, borderRadius: radius.lg,
    backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border,
  },
  resultActive: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
});
