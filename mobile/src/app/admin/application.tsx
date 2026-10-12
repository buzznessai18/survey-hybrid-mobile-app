import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { useMemo, useState } from "react";
import { Alert, View } from "react-native";
import { AppButton } from "@/components/ui/AppButton";
import { AppCard } from "@/components/ui/AppCard";
import { AppInput } from "@/components/ui/AppInput";
import { AppText } from "@/components/ui/AppText";
import { Screen } from "@/components/ui/Screen";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { ErrorState, LoadingState } from "@/components/ui/States";
import { RadioOption } from "@/components/forms/RadioOption";
import { SelectField } from "@/components/forms/SelectField";
import { useRemote } from "@/features/common/useRemote";
import { errorMessage } from "@/services/api/errors";
import { ApplicationService, FarmerService, SchemeService } from "@/services/records/RecordServices";
import { colors } from "@/theme";
import { APPLICATION_STATUSES, type ApplicationStatus } from "@/types/api";
import { formatDateTime, toIsoDate } from "@/utils/date";
import { APPLICATION_STATUS_VIEW, surveyNo, SCHEME_CATEGORY_LABELS } from "@/utils/labels";

/** Admin: record a benefit / service / subsidy for a farmer, or update its status. */
export default function ApplicationEdit() {
  const { id, farmer_id, scheme_id } = useLocalSearchParams<{ id?: string; farmer_id: string; scheme_id?: string }>();
  const { data, loading, error, reload } = useRemote(async () => {
    const [profile, schemes] = await Promise.all([FarmerService.get(farmer_id), SchemeService.list()]);
    return { profile, schemes };
  }, farmer_id);
  if (!data) {
    return (
      <Screen header={<ScreenHeader title="Benefit Record" />} scroll={false}>
        {loading ? <LoadingState /> : <ErrorState offline={error?.offline} message={error?.message} onRetry={reload} />}
      </Screen>
    );
  }
  const existing = id ? data.profile.applications.find((a) => a.id === id) ?? null : null;
  return <ApplicationForm {...data} existing={existing} initialSchemeId={existing?.scheme_id ?? scheme_id ?? ""} />;
}

function ApplicationForm({ profile, schemes, existing, initialSchemeId }: {
  profile: Awaited<ReturnType<typeof FarmerService.get>>;
  schemes: Awaited<ReturnType<typeof SchemeService.list>>;
  existing: NonNullable<Awaited<ReturnType<typeof FarmerService.get>>["applications"]>[number] | null;
  initialSchemeId: string;
}) {
  const [schemeId, setSchemeId] = useState(initialSchemeId);
  const [landId, setLandId] = useState(existing?.land_record_id ?? "");
  const [status, setStatus] = useState<ApplicationStatus>(existing?.status ?? "applied");
  const [amount, setAmount] = useState(existing?.amount_rs != null ? String(existing.amount_rs) : "");
  const [appliedOn, setAppliedOn] = useState(existing?.applied_on ?? toIsoDate());
  const [remarks, setRemarks] = useState(existing?.remarks ?? "");
  const [saving, setSaving] = useState(false);
  const elig = profile.eligibility.find((e) => e.scheme_id === schemeId);
  const scheme = schemes.find((s) => s.id === schemeId);
  const schemeOptions = useMemo(() => schemes.filter((s) => s.status === "active" || s.id === schemeId).map((s) => ({ value: s.id, label: `${s.name} (${SCHEME_CATEGORY_LABELS[s.category]})` })), [schemes, schemeId]);
  const landOptions = [{ value: "", label: "— Not linked —" }, ...profile.forms.map((f) => ({ value: f.id, label: `${f.form_id} · Sy. ${surveyNo(f.survey_number, f.sub_division)}, ${f.village}` }))];

  const save = async () => {
    if (!schemeId) return Alert.alert("Select a scheme");
    if (amount && !(Number(amount) >= 0)) return Alert.alert("Enter a valid amount");
    setSaving(true);
    try {
      await ApplicationService.upsert({
        id: existing?.id, farmer_id: profile.farmer.id, scheme_id: schemeId, land_record_id: landId || null, status,
        amount_rs: amount ? Number(amount) : null, applied_on: appliedOn, remarks: remarks.trim() || null,
      });
      router.back();
    } catch (e) {
      Alert.alert("Couldn't save", errorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen header={<ScreenHeader title={existing ? existing.application_no : "New Benefit Record"} />} footer={<AppButton title="Save" icon="save-outline" loading={saving} loadingTitle="Saving…" onPress={save} />}>
      <AppCard style={{ marginBottom: 14 }}>
        <AppText variant="small">Farmer</AppText>
        <AppText variant="bodyStrong">{profile.farmer.name}</AppText>
        <AppText variant="caption">{profile.farmer.mobile} • {[profile.farmer.village, profile.farmer.taluka].filter(Boolean).join(", ")}</AppText>
      </AppCard>
      <SelectField label="Benefit / scheme" required searchable value={schemeId} options={schemeOptions} onChange={setSchemeId} placeholder="Select benefit or scheme" />
      {elig ? (
        <AppCard style={{ marginBottom: 14, gap: 6, backgroundColor: elig.eligible ? colors.successSoft : colors.errorSoft, borderColor: "transparent" }}>
          <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
            <Ionicons name={elig.eligible ? "checkmark-circle" : "alert-circle"} size={20} color={elig.eligible ? colors.success : colors.error} />
            <AppText variant="bodyStrong">{elig.eligible ? "Farmer is eligible" : "Farmer does not meet all rules"}</AppText>
          </View>
          {elig.checks.filter((c) => !c.passed).map((c) => <AppText key={c.rule} variant="caption">• {c.label}: {c.detail}</AppText>)}
          {scheme?.max_amount_rs ? <AppText variant="small">Maximum under this scheme: ₹{scheme.max_amount_rs.toLocaleString("en-IN")}</AppText> : null}
        </AppCard>
      ) : null}
      <SelectField label="Land record (1/14)" value={landId} options={landOptions} onChange={setLandId} />
      <AppText variant="label" style={{ marginBottom: 8 }}>Status</AppText>
      {APPLICATION_STATUSES.map((s) => <RadioOption key={s} label={APPLICATION_STATUS_VIEW[s].label} selected={status === s} onPress={() => setStatus(s)} />)}
      <View style={{ flexDirection: "row", gap: 12, marginTop: 6 }}>
        <View style={{ flex: 1 }}><AppInput label="Amount (₹)" keyboardType="number-pad" value={amount} onChangeText={setAmount} /></View>
        <View style={{ flex: 1 }}><AppInput label="Applied on" value={appliedOn} onChangeText={setAppliedOn} placeholder="YYYY-MM-DD" /></View>
      </View>
      <AppInput label="Remarks" multiline value={remarks} onChangeText={setRemarks} style={{ minHeight: 70, textAlignVertical: "top" }} />
      {existing ? (
        <AppText variant="small">
          Added {formatDateTime(existing.created_at)}
          {existing.updated_at !== existing.created_at ? ` · Last updated ${formatDateTime(existing.updated_at)}${existing.updated_by_name ? ` by ${existing.updated_by_name}` : ""}` : ""}
        </AppText>
      ) : null}
    </Screen>
  );
}
