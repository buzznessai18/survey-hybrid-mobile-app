import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, FlatList, RefreshControl, ScrollView, StyleSheet, TextInput, View } from "react-native";
import { Chip } from "@/components/ui/Chip";
import { EmptyState, ErrorState, SurveyCardSkeleton } from "@/components/ui/States";
import { LandFormCard } from "@/components/records/LandFormCard";
import { SurveyCard } from "@/components/survey/SurveyCard";
import { queueCard } from "@/features/surveys/cardData";
import { useUserQueue } from "@/features/sync/hooks";
import { errorMessage, toApiError } from "@/services/api/errors";
import { FormService } from "@/services/records/RecordServices";
import { useNetworkStore } from "@/store/networkStore";
import { colors, fonts, radius } from "@/theme";
import type { FormStatus, LandForm } from "@/types/api";
import type { QueueItem } from "@/types/survey";
import { matchesQueueSearch } from "@/utils/search";

type Filter = "all" | FormStatus;
type Row = { kind: "local"; item: QueueItem } | { kind: "server"; item: LandForm };

/** 1/14 forms list (everyone sees all forms; only admins add or edit). */
export function FormsPane({ header }: { header?: React.ReactNode }) {
  const isOnline = useNetworkStore((s) => s.isOnline);
  const [q, setQ] = useState("");
  const [term, setTerm] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [items, setItems] = useState<LandForm[]>([]);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<{ message: string; offline: boolean } | null>(null);

  // 1/14 forms saved on this phone that haven't reached the server yet.
  const queue = useUserQueue();
  const local = useMemo(
    () => (filter === "all" || filter === "pending" ? queue.filter((i) => i.formId && i.status !== "synced" && matchesQueueSearch(i, term)) : []),
    [queue, filter, term],
  );
  const rows = useMemo<Row[]>(
    () => [...local.map((item) => ({ kind: "local" as const, item })), ...items.map((item) => ({ kind: "server" as const, item }))],
    [local, items],
  );

  useEffect(() => {
    const t = setTimeout(() => setTerm(q.trim()), 400);
    return () => clearTimeout(t);
  }, [q]);

  const load = useCallback(async (nextPage: number, mode: "initial" | "refresh" | "more") => {
    if (mode === "refresh") setRefreshing(true);
    else setLoading(true);
    try {
      const res = await FormService.list({ q: term || undefined, status: filter === "all" ? undefined : filter, page: nextPage });
      setItems((prev) => (nextPage === 1 ? res.data : [...prev, ...res.data.filter((d) => !prev.some((p) => p.id === d.id))]));
      setPage(nextPage);
      setPages(res.pagination.total_pages);
      setTotal(res.pagination.total);
      setError(null);
    } catch (e) {
      setError({ message: errorMessage(e), offline: toApiError(e).isConnectivity });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [term, filter]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional: reload when filters/connectivity change
    if (isOnline) void load(1, "initial");
  }, [load, isOnline]);

  return (
    <FlatList
      data={rows}
      keyExtractor={(r) => `${r.kind}-${r.item.id}`}
      contentContainerStyle={styles.list}
      onEndReachedThreshold={0.4}
      onEndReached={() => {
        if (!loading && page < pages) void load(page + 1, "more");
      }}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => load(1, "refresh")} tintColor={colors.primary} />}
      ListHeaderComponent={
        <View>
          {header}
          <View style={styles.search}>
            <Ionicons name="search" size={18} color={colors.muted} />
            <TextInput value={q} onChangeText={setQ} placeholder="Occupant, village, survey no. or LR-…" placeholderTextColor={colors.placeholder} style={styles.input} autoCorrect={false} accessibilityLabel="Search 1/14 forms" />
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
            <Chip label={`All${total !== null && filter === "all" ? ` (${total})` : ""}`} selected={filter === "all"} onPress={() => setFilter("all")} />
            <Chip label="Pending review" selected={filter === "pending"} onPress={() => setFilter("pending")} />
            <Chip label="Verified" selected={filter === "verified"} onPress={() => setFilter("verified")} />
            <Chip label="Rejected" selected={filter === "rejected"} onPress={() => setFilter("rejected")} />
          </ScrollView>
        </View>
      }
      renderItem={({ item: row }) =>
        row.kind === "local" ? (
          <SurveyCard data={{ ...queueCard(row.item), hint: row.item.status === "sync_failed" ? "Not synced — tap to retry" : "Saved on this phone — not synced yet" }} onPress={() => router.push({ pathname: "/survey/[id]", params: { id: row.item.id } })} />
        ) : (
          <LandFormCard form={row.item} onPress={() => router.push({ pathname: "/form/[id]", params: { id: row.item.id } })} />
        )
      }
      ListFooterComponent={loading && items.length > 0 ? <ActivityIndicator color={colors.primary} style={{ marginVertical: 16 }} /> : null}
      ListEmptyComponent={
        loading ? (
          <>
            <SurveyCardSkeleton />
            <SurveyCardSkeleton />
          </>
        ) : !isOnline || error?.offline ? (
          <ErrorState offline message="Connect to the internet to load 1/14 forms." />
        ) : error ? (
          <ErrorState message={error.message} onRetry={() => load(1, "initial")} />
        ) : (
          <EmptyState icon="document-text-outline" title="No 1/14 forms" message={term ? `Nothing matches “${term}”.` : "Submitted 1/14 forms appear here."} />
        )
      }
    />
  );
}

const styles = StyleSheet.create({
  list: { paddingHorizontal: 16, paddingBottom: 24, flexGrow: 1 },
  search: {
    flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, minHeight: 50, marginTop: 4,
    borderRadius: radius.md, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border,
  },
  input: { flex: 1, fontFamily: fonts.regular, fontSize: 15.5, color: colors.text },
  chips: { gap: 8, paddingVertical: 12 },
});
