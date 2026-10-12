import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import { AppText } from "@/components/ui/AppText";
import { Chip } from "@/components/ui/Chip";
import { useTopInset } from "@/components/ui/Screen";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { EmptyState, ErrorState, SurveyCardSkeleton } from "@/components/ui/States";
import { useRemote } from "@/features/common/useRemote";
import { AuditService } from "@/services/records/RecordServices";
import { colors, radius } from "@/theme";
import type { AuditEntry } from "@/types/api";
import { formatDateTime } from "@/utils/date";
import { AUDIT_ACTION_LABELS } from "@/utils/labels";

const TYPES = [
  { value: "", label: "All" }, { value: "form", label: "1/14 forms" }, { value: "survey", label: "Surveys" },
  { value: "duplicate_match", label: "Duplicates" }, { value: "farmer", label: "Farmers" }, { value: "application", label: "Applications" },
  { value: "scheme", label: "Schemes" }, { value: "profile", label: "Users" },
];
const HIDDEN = new Set(["id", "created_at", "location", "farmer_id", "crop_id", "created_by", "updated_by"]);

function changeSummary(e: AuditEntry): string | null {
  const ch = e.metadata?.changes;
  if (!ch) return null;
  return Object.entries(ch)
    .filter(([k]) => !HIDDEN.has(k))
    .slice(0, 4)
    .map(([k, v]) => `${k.replace(/_/g, " ")}: ${fmt(v.from)} → ${fmt(v.to)}`)
    .join("\n");
}
const fmt = (v: unknown) => (v === null || v === undefined || v === "" ? "—" : typeof v === "object" ? "…" : String(v).slice(0, 40));

function openEntity(e: AuditEntry) {
  if (!e.entity_id) return;
  if (e.entity_type === "form") router.push({ pathname: "/form/[id]", params: { id: e.entity_id } });
  else if (e.entity_type === "survey") router.push({ pathname: "/survey/[id]", params: { id: e.entity_id } });
  else if (e.entity_type === "farmer") router.push({ pathname: "/farmer/[id]", params: { id: e.entity_id } });
}

/** Admin: audit history of important changes. */
export default function AuditScreen() {
  const top = useTopInset();
  const params = useLocalSearchParams<{ entity_id?: string; title?: string }>();
  const [type, setType] = useState("");
  const { data, loading, error, reload } = useRemote(
    () => AuditService.list({ entity_type: type || undefined, entity_id: params.entity_id, page_size: 60 }),
    `${type}|${params.entity_id ?? ""}`,
  );
  return (
    <View style={{ flex: 1, backgroundColor: colors.background, paddingTop: top }}>
      <ScreenHeader title={params.title ? `History · ${params.title}` : "Audit History"} />
      {!params.entity_id ? (
        <View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: 16, paddingBottom: 12 }}>
            {TYPES.map((t) => <Chip key={t.value} label={t.label} selected={type === t.value} onPress={() => setType(t.value)} />)}
          </ScrollView>
        </View>
      ) : null}
      <FlatList
        data={data?.data ?? []}
        keyExtractor={(e) => String(e.id)}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24, flexGrow: 1 }}
        refreshControl={<RefreshControl refreshing={loading && !!data} onRefresh={reload} tintColor={colors.primary} />}
        renderItem={({ item: e }) => {
          const summary = changeSummary(e);
          const openable = !!e.entity_id && ["form", "survey", "farmer"].includes(e.entity_type);
          return (
            <Pressable disabled={!openable} onPress={() => openEntity(e)} style={({ pressed }) => [styles.row, pressed && { opacity: 0.85 }]} accessibilityRole={openable ? "button" : "text"}>
              <View style={styles.dot} />
              <View style={{ flex: 1, gap: 2 }}>
                <AppText variant="bodyStrong">{AUDIT_ACTION_LABELS[e.action] ?? e.action}{e.metadata?.ref ? ` · ${e.metadata.ref}` : ""}</AppText>
                <AppText variant="small">{e.user_name} • {formatDateTime(e.created_at)}</AppText>
                {summary ? <AppText variant="caption">{summary}</AppText> : null}
              </View>
            </Pressable>
          );
        }}
        ListEmptyComponent={loading ? <SurveyCardSkeleton /> : error ? <ErrorState offline={error.offline} message={error.message} onRetry={reload} /> : <EmptyState icon="time-outline" title="No history" />}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", gap: 12, backgroundColor: colors.card, borderRadius: radius.md, padding: 12, marginBottom: 8, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.primary, marginTop: 6 },
});
