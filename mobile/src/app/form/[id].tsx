import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Alert, Pressable, RefreshControl, View } from "react-native";
import { AppButton } from "@/components/ui/AppButton";
import { AppCard } from "@/components/ui/AppCard";
import { AppText } from "@/components/ui/AppText";
import { InfoRow } from "@/components/ui/InfoRow";
import { PhotoPreview } from "@/components/ui/PhotoPreview";
import { Screen } from "@/components/ui/Screen";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { SectionHeader } from "@/components/ui/SectionHeader";
import { ErrorState, LoadingState } from "@/components/ui/States";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { LocationMap } from "@/components/map/LocationMap";
import { useRemote } from "@/features/common/useRemote";
import { errorMessage } from "@/services/api/errors";
import { FormService } from "@/services/records/RecordServices";
import { canEditRecords, useAuthStore } from "@/store/authStore";
import { colors } from "@/theme";
import type { FormStatus } from "@/types/api";
import { formatDateTime, formatShortDate } from "@/utils/date";
import { formatArea } from "@/utils/format";
import { FORM_STATUS_VIEW, formatRupees, formatSqM, IRRIGATION_LABELS, LAND_CLASS_LABELS, surveyNo } from "@/utils/labels";
import { serverStatusView } from "@/utils/status";

/** 1/14 form detail: land record, farmer, linked field survey(s); admin verify/reject. */
export default function FormDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { data, loading, error, reload, setData } = useRemote(() => FormService.get(id), id);
  const me = useAuthStore((s) => s.profile);
  const canEdit = canEditRecords(me?.role);
  const [busy, setBusy] = useState<FormStatus | null>(null);

  if (!data) {
    return (
      <Screen header={<ScreenHeader title="1/14 Form" />} scroll={false}>
        {loading ? <LoadingState /> : <ErrorState offline={error?.offline} title={error?.notFound ? "Form not found" : undefined} message={error?.message} onRetry={reload} />}
      </Screen>
    );
  }
  const { form, farmer, surveys } = data;
  const st = FORM_STATUS_VIEW[form.status];

  const setStatus = (status: FormStatus) => {
    const apply = async () => {
      setBusy(status);
      try {
        const updated = await FormService.setStatus(form.id, status);
        setData({ ...data, form: updated });
      } catch (e) {
        Alert.alert("Couldn't update", errorMessage(e));
      } finally {
        setBusy(null);
      }
    };
    Alert.alert(status === "verified" ? "Verify this 1/14 form?" : status === "rejected" ? "Reject this 1/14 form?" : "Mark as pending?", undefined, [
      { text: "Cancel", style: "cancel" },
      { text: "Confirm", style: status === "rejected" ? "destructive" : "default", onPress: () => void apply() },
    ]);
  };

  return (
    <Screen
      header={<ScreenHeader title={form.form_id} right={canEdit ? (
        <Pressable onPress={() => router.push({ pathname: "/form/edit/[id]", params: { id: form.id } })} hitSlop={10} accessibilityRole="button" accessibilityLabel="Edit form">
          <AppText variant="label" style={{ color: colors.primary }}>Edit</AppText>
        </Pressable>
      ) : undefined} />}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={reload} tintColor={colors.primary} />}
      footer={canEdit ? (
        <View style={{ flexDirection: "row", gap: 10 }}>
          <AppButton title="Reject" variant="dangerSoft" compact style={{ flex: 1 }} loading={busy === "rejected"} disabled={form.status === "rejected"} onPress={() => setStatus("rejected")} />
          <AppButton title="Verify" icon="checkmark-done" compact style={{ flex: 1.4 }} loading={busy === "verified"} disabled={form.status === "verified"} onPress={() => setStatus("verified")} />
        </View>
      ) : undefined}
    >
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <StatusBadge size="md" label={st.label} tone={st.tone} />
        <AppText variant="small">Updated {formatDateTime(form.updated_at)}</AppText>
      </View>

      <AppCard>
        <InfoRow label="Survey no." value={surveyNo(form.survey_number, form.sub_division)} />
        <InfoRow label="Village" value={`${form.village}, ${form.taluka}`} />
        {form.area_sq_m ? <InfoRow label="Area" value={formatSqM(form.area_sq_m)} /> : null}
        {/* Asked only by older app versions (021): shown when recorded. */}
        {form.occupant_names ? <InfoRow label="Occupant(s)" value={form.occupant_names} /> : null}
        {form.tenant_name ? <InfoRow label="Tenant" value={form.tenant_name} /> : null}
        {form.land_class ? <InfoRow label="Land class" value={LAND_CLASS_LABELS[form.land_class]} /> : null}
        {form.assessment_rs !== null ? <InfoRow label="Assessment" value={formatRupees(form.assessment_rs)} /> : null}
        {form.kharif_crop_name ? <InfoRow label="Kharif crop" value={form.kharif_crop_name} /> : null}
        {form.rabi_crop_name ? <InfoRow label="Rabi crop" value={form.rabi_crop_name} /> : null}
        {form.land_class ? <InfoRow label="Irrigation" value={IRRIGATION_LABELS[form.irrigation_source]} /> : null}
        <InfoRow label="Remarks" value={form.remarks ?? "—"} />
        <InfoRow label="Entered by" value={`${form.created_by_name ?? "—"} · ${formatShortDate(form.created_at)}`} last />
      </AppCard>

      {farmer ? (
        <Pressable onPress={() => router.push({ pathname: "/farmer/[id]", params: { id: farmer.id } })} accessibilityRole="button" style={{ marginTop: 12 }}>
          <AppCard style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <View style={{ flex: 1 }}>
              <AppText variant="small">Farmer</AppText>
              <AppText variant="bodyStrong">{farmer.name}</AppText>
              <AppText variant="caption">{farmer.mobile} • {[farmer.village, farmer.taluka].filter(Boolean).join(", ")}</AppText>
            </View>
            <AppText variant="label" style={{ color: colors.primary }}>Open profile</AppText>
          </AppCard>
        </Pressable>
      ) : null}

      <View style={{ marginTop: 20 }}>
        <SectionHeader title={`Field survey${surveys.length === 1 ? "" : "s"} · ${surveys.length}`} />
        {surveys.length === 0 ? <AppText variant="caption">No field survey linked to this form.</AppText> : null}
        {surveys.map((s) => {
          const sv = serverStatusView(s);
          return (
            <AppCard key={s.id} style={{ marginBottom: 12, gap: 10 }}>
              <Pressable onPress={() => router.push({ pathname: "/survey/[id]", params: { id: s.id } })} accessibilityRole="button" style={{ gap: 10 }}>
                <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                  <AppText variant="bodyStrong">{s.survey_id}</AppText>
                  <StatusBadge label={sv.label} tone={sv.tone} icon={sv.icon} />
                </View>
                <PhotoPreview uri={s.photo_url} height={170} />
                <AppText variant="caption">
                  {[s.crop_name, formatArea(s.area, s.area_unit), formatShortDate(s.visit_date), s.collected_by_name].filter(Boolean).join(" • ")}
                </AppText>
              </Pressable>
              <LocationMap latitude={s.latitude} longitude={s.longitude} style={{ height: 180 }} controls={false} />
            </AppCard>
          );
        })}
      </View>

      {canEdit ? (
        <AppButton title="View change history" variant="ghost" icon="time-outline" compact onPress={() => router.push({ pathname: "/admin/audit", params: { entity_id: form.id, title: form.form_id } })} />
      ) : null}
    </Screen>
  );
}
