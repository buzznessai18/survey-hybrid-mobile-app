import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Switch, View } from "react-native";
import { AppButton } from "@/components/ui/AppButton";
import { AppCard } from "@/components/ui/AppCard";
import { AppInput } from "@/components/ui/AppInput";
import { AppText } from "@/components/ui/AppText";
import { Screen } from "@/components/ui/Screen";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { LoadingState } from "@/components/ui/States";
import { MultiChips } from "@/components/forms/MultiChips";
import { SelectField } from "@/components/forms/SelectField";
import { useRemote } from "@/features/common/useRemote";
import { useCrops } from "@/features/surveys/useCrops";
import { errorMessage, toApiError } from "@/services/api/errors";
import { SchemeService } from "@/services/records/RecordServices";
import { colors, radius } from "@/theme";
import { FARMER_CATEGORIES, GOA_TALUKAS, SCHEME_CATEGORIES, type FarmerCategory, type Scheme, type SchemeCategory, type SchemeRules, type Taluka } from "@/types/api";
import { CATEGORY_LABELS, SCHEME_CATEGORY_LABELS } from "@/utils/labels";

/** Admin: create or edit a benefit / scheme type (subsidy, tractor, cylinder, service…) and its optional eligibility rules. */
export default function SchemeEdit() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const { data, loading } = useRemote(() => (id ? SchemeService.list() : Promise.resolve([] as Scheme[])), id ?? "new");
  if (id && (loading || !data)) return <Screen header={<ScreenHeader title="Scheme" />} scroll={false}><LoadingState /></Screen>;
  return <SchemeForm scheme={id ? data?.find((s) => s.id === id) ?? null : null} />;
}

const numText = (v: number | undefined | null) => (v === undefined || v === null ? "" : String(v));

function SchemeForm({ scheme }: { scheme: Scheme | null }) {
  const { crops } = useCrops();
  const r = scheme?.rules ?? {};
  const [f, setF] = useState({
    code: scheme?.code ?? "", name: scheme?.name ?? "", category: (scheme?.category ?? "subsidy") as SchemeCategory, department: scheme?.department ?? "Directorate of Agriculture, Goa",
    benefit: scheme?.benefit ?? "", description: scheme?.description ?? "", subsidy_percent: numText(scheme?.subsidy_percent),
    max_amount_rs: numText(scheme?.max_amount_rs), valid_until: scheme?.valid_until ?? "", active: (scheme?.status ?? "active") === "active",
    min_land: numText(r.min_land_sq_m), max_land: numText(r.max_land_sq_m), cooldown: numText(r.cooldown_years),
    max_apps: numText(r.max_applications_per_farmer), verified: !!r.require_verified_land,
  });
  const [talukas, setTalukas] = useState<Taluka[]>(r.eligible_talukas ?? []);
  const [categories, setCategories] = useState<FarmerCategory[]>(r.eligible_categories ?? []);
  const [cropIds, setCropIds] = useState<string[]>(r.eligible_crop_ids ?? []);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (v: string | boolean) => setF((p) => ({ ...p, [k]: v }));
  const categoryOptions = SCHEME_CATEGORIES.map((c) => ({ value: c, label: SCHEME_CATEGORY_LABELS[c] }));

  const save = async () => {
    const e: Record<string, string> = {};
    if (!/^[A-Za-z0-9-]{2,30}$/.test(f.code.trim())) e.code = "Use 2-30 letters, digits or dashes";
    if (!f.name.trim()) e.name = "Name is required";
    const num = (v: string, key: string) => {
      if (!v.trim()) return undefined;
      const n = Number(v);
      if (!Number.isFinite(n) || n < 0) e[key] = "Enter a valid number";
      return n;
    };
    const rules: SchemeRules = {
      min_land_sq_m: num(f.min_land, "min_land"), max_land_sq_m: num(f.max_land, "max_land"),
      cooldown_years: num(f.cooldown, "cooldown"), max_applications_per_farmer: num(f.max_apps, "max_apps"),
      eligible_talukas: talukas.length ? talukas : undefined, eligible_categories: categories.length ? categories : undefined,
      eligible_crop_ids: cropIds.length ? cropIds : undefined, require_verified_land: f.verified || undefined,
    };
    if (rules.min_land_sq_m !== undefined && rules.max_land_sq_m !== undefined && rules.min_land_sq_m > rules.max_land_sq_m) e.max_land = "Must be ≥ minimum";
    if (f.valid_until && !/^\d{4}-\d{2}-\d{2}$/.test(f.valid_until)) e.valid_until = "Use YYYY-MM-DD";
    setErrors(e);
    if (Object.keys(e).length) return;
    const clean = Object.fromEntries(Object.entries(rules).filter(([, v]) => v !== undefined)) as SchemeRules;
    setSaving(true);
    setSaveError(null);
    try {
      await SchemeService.upsert({
        id: scheme?.id, code: f.code.trim().toUpperCase(), name: f.name.trim(), category: f.category, department: f.department.trim() || null,
        benefit: f.benefit.trim() || null, description: f.description.trim() || null,
        subsidy_percent: f.subsidy_percent ? Number(f.subsidy_percent) : null, max_amount_rs: f.max_amount_rs ? Number(f.max_amount_rs) : null,
        valid_until: f.valid_until || null, status: f.active ? "active" : "inactive", rules: clean,
      });
      router.back();
    } catch (err) {
      const apiErr = toApiError(err);
      setSaveError(errorMessage(err));
      if (apiErr.fields) setErrors(apiErr.fields);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen header={<ScreenHeader title={scheme ? "Edit Benefit Type" : "New Benefit Type"} />} footer={<AppButton title="Save scheme" icon="save-outline" loading={saving} loadingTitle="Saving…" onPress={save} />}>
      {saveError ? (
        <View style={{ backgroundColor: colors.errorSoft, padding: 12, borderRadius: radius.md, marginBottom: 14 }}>
          <AppText variant="label" style={{ color: colors.error }}>{saveError}</AppText>
        </View>
      ) : null}
      <View style={{ flexDirection: "row", gap: 12 }}>
        <View style={{ flex: 1 }}><AppInput label="Code" required autoCapitalize="characters" value={f.code} onChangeText={set("code")} error={errors.code} placeholder="TRACTOR-2026" /></View>
        <View style={{ flex: 0.9, justifyContent: "center" }}>
          <AppText variant="label">Active</AppText>
          <Switch value={f.active} onValueChange={set("active")} trackColor={{ true: colors.primary, false: colors.borderStrong }} />
        </View>
      </View>
      <AppInput label="Name" required value={f.name} onChangeText={set("name")} error={errors.name} placeholder="Subsidy on purchase of tractor" />
      <SelectField label="Type" required icon="pricetag-outline" value={f.category} options={categoryOptions} onChange={(v) => setF((p) => ({ ...p, category: v as SchemeCategory }))} />
      <AppInput label="Department" value={f.department} onChangeText={set("department")} />
      <View style={{ flexDirection: "row", gap: 12 }}>
        <View style={{ flex: 1 }}><AppInput label="Subsidy %" keyboardType="decimal-pad" value={f.subsidy_percent} onChangeText={set("subsidy_percent")} /></View>
        <View style={{ flex: 1 }}><AppInput label="Max amount (₹)" keyboardType="number-pad" value={f.max_amount_rs} onChangeText={set("max_amount_rs")} /></View>
      </View>
      <AppInput label="Benefit" value={f.benefit} onChangeText={set("benefit")} placeholder="50% of cost for tractors up to 45 HP" />
      <AppInput label="Description" multiline value={f.description} onChangeText={set("description")} style={{ minHeight: 70, textAlignVertical: "top" }} />
      <AppInput label="Valid until (YYYY-MM-DD)" value={f.valid_until} onChangeText={set("valid_until")} error={errors.valid_until} />

      <AppCard style={{ gap: 4, marginTop: 4 }}>
        <AppText variant="heading" style={{ marginBottom: 8 }}>Eligibility rules</AppText>
        <AppText variant="small" style={{ marginBottom: 10 }}>Optional. Leave every rule empty for services with no conditions. Land is the total on the farmer&apos;s 1/14 forms.</AppText>
        <View style={{ flexDirection: "row", gap: 12 }}>
          <View style={{ flex: 1 }}><AppInput label="Min land (sq.m)" keyboardType="number-pad" value={f.min_land} onChangeText={set("min_land")} error={errors.min_land ?? errors["rules.min_land_sq_m"]} /></View>
          <View style={{ flex: 1 }}><AppInput label="Max land (sq.m)" keyboardType="number-pad" value={f.max_land} onChangeText={set("max_land")} error={errors.max_land ?? errors["rules.max_land_sq_m"]} /></View>
        </View>
        <View style={{ flexDirection: "row", gap: 12 }}>
          <View style={{ flex: 1 }}><AppInput label="Once in (years)" keyboardType="number-pad" value={f.cooldown} onChangeText={set("cooldown")} error={errors.cooldown} /></View>
          <View style={{ flex: 1 }}><AppInput label="Max applications" keyboardType="number-pad" value={f.max_apps} onChangeText={set("max_apps")} error={errors.max_apps} /></View>
        </View>
        <MultiChips label="Eligible talukas" hint="None selected = all of Goa" options={GOA_TALUKAS.map((t) => ({ value: t, label: t }))} value={talukas} onChange={setTalukas} />
        <MultiChips label="Eligible categories" hint="None selected = all" options={FARMER_CATEGORIES.map((c) => ({ value: c, label: CATEGORY_LABELS[c] }))} value={categories} onChange={setCategories} />
        <MultiChips label="Eligible crops" hint="Farmer must grow one of these (none = any crop)" options={crops.map((c) => ({ value: c.id, label: c.name }))} value={cropIds} onChange={setCropIds} />
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <AppText variant="label" style={{ flex: 1 }}>Only count verified 1/14 forms</AppText>
          <Switch value={f.verified} onValueChange={set("verified")} trackColor={{ true: colors.primary, false: colors.borderStrong }} />
        </View>
      </AppCard>
    </Screen>
  );
}
