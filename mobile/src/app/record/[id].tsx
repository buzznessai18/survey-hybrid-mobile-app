import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Alert, StyleSheet, View } from "react-native";
import { AppButton } from "@/components/ui/AppButton";
import { AppCard } from "@/components/ui/AppCard";
import { AppText } from "@/components/ui/AppText";
import { InfoRow } from "@/components/ui/InfoRow";
import { Screen } from "@/components/ui/Screen";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { ErrorState, LoadingState } from "@/components/ui/States";
import { useRemote } from "@/features/common/useRemote";
import { recordCache } from "@/features/records/recordCache";
import { errorMessage } from "@/services/api/errors";
import { ReceiptService } from "@/services/receipts/ReceiptService";
import { ServiceRecordService } from "@/services/records/ServiceRecordService";
import { useIsAdmin } from "@/store/authStore";
import { colors, radius } from "@/theme";
import { formatReceiptDateTime } from "@/utils/receipt";
import { formatLandSize, GENDER_LABELS } from "@/utils/labels";

/**
 * A saved record: full details, Print Receipt / Share PDF (anyone who can see
 * it, any number of times) and Delete (admins only). Reached right after saving
 * (`saved` param) and from Home / Records.
 */
export default function RecordDetailScreen() {
  const { id, saved } = useLocalSearchParams<{ id: string; saved?: "new" | "replay" }>();
  const isAdmin = useIsAdmin();
  const remote = useRemote(() => ServiceRecordService.get(id), id);
  // The record confirmed by the save call, until the fresh copy arrives.
  const record = remote.data ?? recordCache.get(id);
  const [busy, setBusy] = useState<"print" | "share" | "delete" | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const close = () => (saved ? router.replace("/") : router.canGoBack() ? router.back() : router.replace("/"));
  const header = <ScreenHeader title={record?.record_no ?? "Record"} onBack={close} backIcon={saved ? "close" : "chevron-back"} />;

  if (!record) {
    if (remote.loading) return <Screen header={header} scroll={false}><LoadingState label="Loading record…" /></Screen>;
    return (
      <Screen header={header} scroll={false}>
        <ErrorState
          title={remote.error?.notFound ? "Record not found" : "Couldn't load record"}
          message={remote.error?.notFound ? "It may have been deleted." : remote.error?.message}
          offline={remote.error?.offline}
          onRetry={remote.error?.notFound ? undefined : remote.reload}
        />
      </Screen>
    );
  }

  const print = async () => {
    setBusy("print");
    setNotice(null);
    try {
      const outcome = await ReceiptService.print(record);
      if (outcome === "dismissed") setNotice("Printing was cancelled. You can print the receipt again at any time.");
    } catch (e) {
      Alert.alert("Couldn't print", e instanceof Error ? e.message : "Please try again.");
    } finally {
      setBusy(null);
    }
  };

  const share = async () => {
    setBusy("share");
    try {
      await ReceiptService.sharePdf(record);
    } catch (e) {
      Alert.alert("Couldn't create the PDF", e instanceof Error ? e.message : "Please try again.");
    } finally {
      setBusy(null);
    }
  };

  const confirmDelete = () =>
    Alert.alert(
      "Delete this record?",
      `${record.record_no} for ${record.farmer_name} will be permanently deleted. Printed receipts will no longer match a saved record. This can't be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            setBusy("delete");
            try {
              await ServiceRecordService.remove(record.id);
              recordCache.remove(record.id);
              Alert.alert("Record deleted", `${record.record_no} was deleted.`);
              close();
            } catch (e) {
              Alert.alert("Couldn't delete", errorMessage(e));
              setBusy(null);
            }
          },
        },
      ],
    );

  return (
    <Screen
      header={header}
      footer={
        <View style={{ gap: 10 }}>
          <AppButton title="Print Receipt" icon="print-outline" loading={busy === "print"} loadingTitle="Opening printer…" disabled={!!busy} onPress={print} />
          <AppButton title="Share Receipt PDF" icon="share-outline" variant="secondary" loading={busy === "share"} loadingTitle="Creating PDF…" disabled={!!busy} onPress={share} />
        </View>
      }
    >
      {saved ? (
        <View style={styles.success} accessibilityRole="alert" accessibilityLiveRegion="polite">
          <Ionicons name="checkmark-circle" size={28} color={colors.success} />
          <View style={{ flex: 1 }}>
            <AppText variant="bodyStrong">{saved === "replay" ? "Record already saved" : "Record saved"}</AppText>
            <AppText variant="caption">
              {saved === "replay"
                ? "The connection dropped while saving, but the server had already saved this record. Check the details below before printing."
                : `Receipt no. ${record.record_no}. You can print the receipt now.`}
            </AppText>
          </View>
        </View>
      ) : null}
      {notice ? (
        <View style={styles.notice} accessibilityLiveRegion="polite">
          <Ionicons name="information-circle-outline" size={18} color={colors.info} />
          <AppText variant="label" style={{ flex: 1 }}>{notice}</AppText>
        </View>
      ) : null}

      <AppCard style={{ marginBottom: 14 }}>
        <AppText variant="small">FARMER</AppText>
        <AppText variant="title" style={{ marginTop: 2 }}>{record.farmer_name}</AppText>
        <View style={{ marginTop: 8 }}>
          <InfoRow label="Gender" value={record.gender ? GENDER_LABELS[record.gender] : "—"} />
          <InfoRow label="Address" value={<AppText variant="bodyStrong">{record.address || "—"}</AppText>} last />
        </View>
      </AppCard>

      <AppCard style={{ marginBottom: 14 }}>
        <AppText variant="small">LAND</AppText>
        <InfoRow label="Survey no." value={record.survey_number} />
        <InfoRow label="Sub-division" value={record.sub_division || "—"} />
        <InfoRow label="Land size" value={formatLandSize(record.land_size, record.land_unit)} last />
      </AppCard>

      <AppCard style={{ marginBottom: 14 }}>
        <AppText variant="small">EQUIPMENT / SERVICE</AppText>
        <AppText variant="body" style={{ marginTop: 6 }}>{record.service_details || "—"}</AppText>
      </AppCard>

      <AppCard style={{ marginBottom: 14 }}>
        <InfoRow label="Receipt no." value={record.record_no} />
        <InfoRow label="Date & time" value={formatReceiptDateTime(record.created_at)} />
        <InfoRow label="Recorded by" value={record.created_by_name ?? "—"} last />
      </AppCard>

      {isAdmin ? (
        <AppButton title="Delete record" icon="trash-outline" variant="dangerSoft" loading={busy === "delete"} disabled={!!busy} onPress={confirmDelete} />
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  success: { flexDirection: "row", gap: 10, alignItems: "flex-start", backgroundColor: colors.successSoft, borderRadius: radius.lg, padding: 14, marginBottom: 14 },
  notice: { flexDirection: "row", gap: 8, alignItems: "flex-start", backgroundColor: colors.infoSoft, borderRadius: radius.md, padding: 12, marginBottom: 14 },
});
