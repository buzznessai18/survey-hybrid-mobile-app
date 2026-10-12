import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Alert, RefreshControl, StyleSheet, View } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { AppButton } from "@/components/ui/AppButton";
import { AppCard } from "@/components/ui/AppCard";
import { AppText } from "@/components/ui/AppText";
import { InfoRow } from "@/components/ui/InfoRow";
import { PhotoPreview } from "@/components/ui/PhotoPreview";
import { Screen } from "@/components/ui/Screen";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { ErrorState, LoadingState } from "@/components/ui/States";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { LocationMap } from "@/components/map/LocationMap";
import { ExistingRecordCard } from "@/components/survey/ExistingRecordCard";
import { useSurveyDetail } from "@/features/surveys/useSurveyDetail";
import { PhotoService } from "@/services/storage/PhotoService";
import { SyncService } from "@/services/sync/SyncService";
import { canEditRecords, useAuthStore } from "@/store/authStore";
import { useDraftStore } from "@/store/draftStore";
import { useNetworkStore } from "@/store/networkStore";
import { useQueueStore } from "@/store/queueStore";
import { colors, radius } from "@/theme";
import type { ReviewStatus, SurveyDetail } from "@/types/api";
import type { QueueItem } from "@/types/survey";
import { queueSummary } from "@/utils/serialization";
import { formatDateTime, formatShortDate } from "@/utils/date";
import { DUPLICATE_REASON_LABELS, formatArea, formatCoord, surveyNumberLabel } from "@/utils/format";
import { normalizeMobile } from "@/utils/mobile";
import { queueStatusView, serverStatusView } from "@/utils/status";

export default function SurveyDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const local = useQueueStore((s) => (id ? s.items[id] : undefined));
  if (local && local.status !== "synced") return <LocalSurvey item={local} />;
  return <ServerSurvey id={id} />;
}

/* ------------------------------------------------------------------ */
/* Server survey                                                       */
/* ------------------------------------------------------------------ */

const REVIEW_LABEL: Record<ReviewStatus, { label: string; tone: "warning" | "error" | "success" | "info" }> = {
  pending: { label: "Awaiting review", tone: "warning" },
  confirmed_duplicate: { label: "Confirmed duplicate", tone: "error" },
  not_duplicate: { label: "Not a duplicate", tone: "success" },
  needs_verification: { label: "Needs verification", tone: "info" },
};

function ServerSurvey({ id }: { id: string }) {
  const { survey, loading, error, reload } = useSurveyDetail(id);
  const me = useAuthStore((s) => s.profile);
  const canEdit = canEditRecords(me?.role);

  if (loading && !survey) {
    return (
      <Screen header={<ScreenHeader title="Survey Details" />} scroll={false}>
        <LoadingState label="Loading survey…" />
      </Screen>
    );
  }
  if (!survey) {
    return (
      <Screen header={<ScreenHeader title="Survey Details" />} scroll={false}>
        <ErrorState
          offline={error?.offline}
          title={error?.notFound ? "Survey not found" : undefined}
          message={error?.offline ? "Connect to the internet to view this survey." : error?.message}
          onRetry={error?.notFound ? undefined : reload}
        />
      </Screen>
    );
  }

  const status = serverStatusView(survey);

  return (
    <Screen
      header={<ScreenHeader title="Survey Details" />}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={reload} tintColor={colors.primary} />}
      footer={
        canEdit ? (
          <AppButton
            title="Edit Survey"
            icon="create-outline"
            variant="secondary"
            onPress={() => router.push({ pathname: "/survey/edit/[id]", params: { id: survey.id } })}
          />
        ) : undefined
      }
    >
      <Animated.View entering={FadeInDown.duration(300)}>
        <View style={styles.topRow}>
          <StatusBadge size="md" label={status.label} tone={status.tone} icon={status.icon} />
          <View style={{ alignItems: "flex-end" }}>
            <AppText variant="bodyStrong" selectable>
              {survey.survey_id}
            </AppText>
            <AppText variant="small">{formatDateTime(survey.created_at)}</AppText>
          </View>
        </View>

        <PhotoPreview uri={survey.photo_url} height={210} style={{ marginBottom: 14 }} />

        <AppCard>
          <InfoRow label="Farmer Name" value={survey.farmer_name ?? "—"} />
          <InfoRow label="Mobile Number" value={survey.farmer_mobile ?? "—"} />
          <InfoRow label="Crop" value={survey.crop_name ?? "—"} />
          <InfoRow label="Area" value={formatArea(survey.area, survey.area_unit)} />
          <InfoRow label="Survey Number" value={survey.survey_number} />
          <InfoRow label="Sub-Division" value={survey.sub_division ?? "—"} />
          <InfoRow label="Date of Visit" value={formatShortDate(survey.visit_date)} />
          <InfoRow label="Added by" value={survey.collected_by_name ?? "—"} />
          <InfoRow label="Review status" value={survey.submission_status === "pending" ? "Awaiting review" : survey.submission_status === "approved" ? "Approved" : "Rejected"} />
          {survey.notes ? <InfoRow label="Notes" value={survey.notes} /> : null}
          <InfoRow
            label="Location"
            last
            value={
              <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                <AppText variant="bodyStrong" style={{ flexShrink: 1 }}>
                  {formatCoord(survey.latitude)}, {formatCoord(survey.longitude)}
                </AppText>
                <Ionicons name="location" size={18} color={colors.primary} />
              </View>
            }
          />
        </AppCard>

        <AppText variant="caption" style={{ marginTop: 8 }}>
          GPS accuracy {Math.round(survey.gps_accuracy)} m
        </AppText>
        <LocationMap
          latitude={survey.latitude}
          longitude={survey.longitude}
          accuracy={survey.gps_accuracy}
          style={{ height: 220, marginTop: 8 }}
        />

        {canEdit && survey.duplicate_check.matches.length > 0 ? (
          <AppButton
            title="Compare & review duplicates"
            icon="git-compare-outline"
            variant="secondary"
            style={{ marginTop: 16 }}
            onPress={() => router.push({ pathname: "/admin/compare", params: { id: survey.id } })}
          />
        ) : null}
        <DuplicateSection survey={survey} />
      </Animated.View>
    </Screen>
  );
}

function DuplicateSection({ survey }: { survey: SurveyDetail }) {
  const matches = survey.duplicate_check.matches;
  if (matches.length === 0) return null;
  return (
    <View style={{ marginTop: 20 }}>
      <AppText variant="heading" style={{ marginBottom: 6 }}>
        Duplicate information
      </AppText>
      {survey.duplicate_reason ? (
        <AppCard style={{ marginBottom: 12 }}>
          <AppText variant="small">Reason given for submitting</AppText>
          <AppText variant="bodyStrong">{DUPLICATE_REASON_LABELS[survey.duplicate_reason]}</AppText>
          {survey.duplicate_reason_notes ? <AppText variant="caption">{survey.duplicate_reason_notes}</AppText> : null}
        </AppCard>
      ) : null}
      {matches.map((m) => {
        const review = REVIEW_LABEL[m.review_status];
        return (
          <View key={m.duplicate_match_id} style={{ marginBottom: 14 }}>
            <View style={styles.reviewRow}>
              <StatusBadge label={review.label} tone={review.tone} />
              {m.reviewed_by?.full_name ? (
                <AppText variant="small">
                  by {m.reviewed_by.full_name}
                  {m.reviewed_at ? `, ${formatShortDate(m.reviewed_at)}` : ""}
                </AppText>
              ) : null}
            </View>
            {m.review_notes ? (
              <AppText variant="caption" style={{ marginBottom: 6 }}>
                “{m.review_notes}”
              </AppText>
            ) : null}
            <ExistingRecordCard survey={m.survey} matchType={m.match_type} distance={m.distance_meters} />
          </View>
        );
      })}
    </View>
  );
}

/* ------------------------------------------------------------------ */
/* Local (not yet synced) survey                                       */
/* ------------------------------------------------------------------ */

function LocalSurvey({ item }: { item: QueueItem }) {
  const isOnline = useNetworkStore((s) => s.isOnline);
  const [busy, setBusy] = useState(false);
  const status = queueStatusView(item.status);
  const d = item.details;
  const sum = queueSummary(item);
  const needsEdit = item.status === "sync_failed" && (item.lastError?.kind === "validation" || item.lastError?.kind === "conflict");

  const retry = async () => {
    setBusy(true);
    await SyncService.retry(item.id);
    setBusy(false);
  };

  const editAndResubmit = () => {
    useDraftStore.getState().loadFromQueueItem(item);
    router.push(item.details ? "/survey/new/details" : "/survey/new/review");
  };

  const discard = () =>
    Alert.alert("Discard survey?", "This survey has not reached the server. Discarding deletes it from this device permanently.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Discard",
        style: "destructive",
        onPress: () => {
          PhotoService.delete(item.photoLocalUri);
          useQueueStore.getState().remove(item.id);
          router.back();
        },
      },
    ]);

  return (
    <Screen
      header={<ScreenHeader title="Survey Details" />}
      footer={
        <View style={{ gap: 10 }}>
          {needsEdit ? (
            <AppButton title="Edit & Resubmit" icon="create-outline" onPress={editAndResubmit} />
          ) : item.status !== "syncing" ? (
            <AppButton
              title={isOnline ? "Sync Now" : "Waiting for connection"}
              icon="cloud-upload-outline"
              onPress={retry}
              loading={busy}
              loadingTitle="Syncing…"
              disabled={!isOnline}
            />
          ) : null}
          <AppButton title="Discard" variant="dangerSoft" icon="trash-outline" onPress={discard} compact disabled={item.status === "syncing"} />
        </View>
      }
    >
      <View style={styles.topRow}>
        <StatusBadge size="md" label={status.label} tone={status.tone} icon={status.icon} />
        <AppText variant="small">Saved {formatDateTime(item.createdAt)}</AppText>
      </View>

      <View style={[styles.syncCard, item.status === "sync_failed" && { backgroundColor: colors.errorSoft }]}>
        <Ionicons
          name={item.status === "sync_failed" ? "alert-circle" : "cloud-offline-outline"}
          size={20}
          color={item.status === "sync_failed" ? colors.error : colors.muted}
        />
        <View style={{ flex: 1 }}>
          <AppText variant="label" style={{ color: colors.text }}>
            {item.status === "sync_failed"
              ? item.lastError?.message ?? "Sync failed"
              : isOnline
                ? "This survey will sync shortly."
                : "Waiting for connection. It will sync automatically when you're back online."}
          </AppText>
          {item.lastError?.fields
            ? Object.values(item.lastError.fields).map((msg) => (
                <AppText key={msg} variant="caption">
                  • {msg}
                </AppText>
              ))
            : null}
          {item.retryCount > 0 && item.status !== "sync_failed" ? (
            <AppText variant="small">Retry attempt {item.retryCount}</AppText>
          ) : null}
        </View>
      </View>

      {d && item.location ? (
        <>
          <PhotoPreview uri={item.photoLocalUri} height={200} style={{ marginBottom: 14 }} />
          <AppCard>
            <InfoRow label="Farmer Name" value={d.farmerName} />
            <InfoRow label="Mobile Number" value={normalizeMobile(d.farmerMobile)} />
            <InfoRow label="Crop" value={item.cropName ?? "—"} />
            <InfoRow label="Area" value={formatArea(d.area, d.areaUnit)} />
            <InfoRow label="Survey Number" value={surveyNumberLabel(d.surveyNumber, d.subDivision || null)} />
            <InfoRow label="Sub-Division" value={d.subDivision || "—"} />
            <InfoRow label="Date of Visit" value={formatShortDate(d.visitDate)} />
            {item.duplicateReason ? <InfoRow label="Duplicate reason" value={DUPLICATE_REASON_LABELS[item.duplicateReason]} /> : null}
            <InfoRow label="Location" value={`${formatCoord(item.location.latitude)}, ${formatCoord(item.location.longitude)}`} />
            <InfoRow label="GPS accuracy" value={`${Math.round(item.location.accuracy)} m`} last />
          </AppCard>
        </>
      ) : (
        <AppCard>
          <InfoRow label="Farmer Name" value={sum.farmerName} />
          <InfoRow label="Mobile Number" value={normalizeMobile(sum.farmerMobile)} />
          <InfoRow label="Survey Number" value={surveyNumberLabel(sum.surveyNumber, sum.subDivision || null)} />
          <InfoRow label="Village" value={item.land ? `${item.land.village}, ${item.land.taluka}` : "—"} />
          <InfoRow label="Field survey" value="Not included (location or crop skipped)" last />
        </AppCard>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  topRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 14 },
  reviewRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 6 },
  syncCard: {
    flexDirection: "row",
    gap: 10,
    padding: 14,
    borderRadius: radius.md,
    backgroundColor: "#EEF0EC",
    marginBottom: 14,
  },
});
