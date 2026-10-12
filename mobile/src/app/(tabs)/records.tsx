import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, TextInput, View } from "react-native";
import { ServiceRecordCard } from "@/components/records/ServiceRecordCard";
import { AppButton } from "@/components/ui/AppButton";
import { AppText } from "@/components/ui/AppText";
import { useTopInset } from "@/components/ui/Screen";
import { EmptyState, ErrorState, SurveyCardSkeleton } from "@/components/ui/States";
import { errorMessage, toApiError } from "@/services/api/errors";
import { ServiceRecordService } from "@/services/records/ServiceRecordService";
import { useCanEditRecords } from "@/store/authStore";
import { useNetworkStore } from "@/store/networkStore";
import { colors, fonts, radius } from "@/theme";
import type { ServiceRecord } from "@/types/api";

const SEARCH_HINTS = ["Farmer name", "Survey no. 312", "With sub-division 312/4B", "Receipt RC-000123"];

/** Records: search saved records by farmer name, survey number or sub-division (paged from the server). */
export default function RecordsScreen() {
  const top = useTopInset();
  const canCreate = useCanEditRecords();
  const isOnline = useNetworkStore((s) => s.isOnline);
  const params = useLocalSearchParams<{ q?: string; focus?: string }>();
  const [q, setQ] = useState(params.q ?? "");
  // A search started from Home ("Search Records" / quick search).
  const [lastParams, setLastParams] = useState(params);
  if (params.q !== lastParams.q || params.focus !== lastParams.focus) {
    setLastParams(params);
    if (params.q !== undefined) setQ(params.q);
  }
  const inputRef = useRef<TextInput>(null);
  useEffect(() => {
    if (params.focus) setTimeout(() => inputRef.current?.focus(), 250);
  }, [params.focus]);

  const [items, setItems] = useState<ServiceRecord[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<{ message: string; offline: boolean } | null>(null);
  const reqId = useRef(0);

  const loadFirst = useCallback(async (term: string) => {
    const id = ++reqId.current;
    setLoading(true);
    try {
      const res = await ServiceRecordService.list({ q: term.trim() || undefined, page: 1 });
      if (id !== reqId.current) return;
      setItems(res.data);
      setTotal(res.pagination.total);
      setPages(res.pagination.total_pages);
      setPage(1);
      setError(null);
    } catch (e) {
      if (id === reqId.current) setError({ message: errorMessage(e), offline: toApiError(e).isConnectivity });
    } finally {
      if (id === reqId.current) setLoading(false);
    }
  }, []);

  // Debounced search as the user types.
  useEffect(() => {
    const t = setTimeout(() => void loadFirst(q), 350);
    return () => clearTimeout(t);
  }, [q, loadFirst, isOnline]);

  // Fresh list when returning to the tab (e.g. after adding or deleting a record).
  const qRef = useRef(q);
  useLayoutEffect(() => {
    qRef.current = q;
  });
  const firstFocus = useRef(true);
  useFocusEffect(
    useCallback(() => {
      if (firstFocus.current) {
        firstFocus.current = false;
        return;
      }
      void loadFirst(qRef.current);
    }, [loadFirst]),
  );

  const loadMore = async () => {
    if (loading || loadingMore || page >= pages) return;
    const id = reqId.current;
    setLoadingMore(true);
    try {
      const res = await ServiceRecordService.list({ q: q.trim() || undefined, page: page + 1 });
      if (id !== reqId.current) return;
      setItems((prev) => [...prev, ...res.data.filter((d) => !prev.some((p) => p.id === d.id))]);
      setPage(page + 1);
    } catch {
      /* keep current results; scrolling again retries */
    } finally {
      setLoadingMore(false);
    }
  };

  const refresh = async () => {
    setRefreshing(true);
    await loadFirst(q);
    setRefreshing(false);
  };

  return (
    <View style={[styles.root, { paddingTop: top }]}>
      <View style={styles.header}>
        <AppText variant="title" accessibilityRole="header">Records</AppText>
        {canCreate ? <AppButton title="Add" icon="add" compact onPress={() => router.push("/record/new")} /> : null}
      </View>
      <View style={styles.search}>
        <Ionicons name="search" size={18} color={colors.muted} />
        <TextInput
          ref={inputRef}
          value={q}
          onChangeText={setQ}
          placeholder="Farmer name, survey no. or sub-division"
          placeholderTextColor={colors.placeholder}
          style={styles.input}
          autoCorrect={false}
          returnKeyType="search"
          accessibilityLabel="Search records by farmer name, survey number or sub-division number"
          clearButtonMode="while-editing"
        />
        {loading && items.length > 0 ? <ActivityIndicator size="small" color={colors.primary} /> : null}
        {q ? <Ionicons name="close-circle" size={20} color={colors.placeholder} onPress={() => setQ("")} accessibilityLabel="Clear search" accessibilityRole="button" /> : null}
      </View>
      <View style={styles.hints}>
        {SEARCH_HINTS.map((h) => <AppText key={h} variant="small" style={styles.hint}>{h}</AppText>)}
      </View>
      {total !== null && !error ? (
        <AppText variant="small" style={{ paddingHorizontal: 16, marginTop: 10 }}>
          {total} record{total === 1 ? "" : "s"}{q.trim() ? ` matching “${q.trim()}”` : ""}
        </AppText>
      ) : null}

      <FlatList
        data={error ? [] : items}
        keyExtractor={(r) => r.id}
        contentContainerStyle={styles.list}
        onEndReached={loadMore}
        onEndReachedThreshold={0.4}
        keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={colors.primary} />}
        renderItem={({ item }) => <ServiceRecordCard record={item} onPress={() => router.push({ pathname: "/record/[id]", params: { id: item.id } })} />}
        ListFooterComponent={loadingMore ? <ActivityIndicator color={colors.primary} style={{ marginVertical: 16 }} /> : null}
        ListEmptyComponent={
          error ? (
            <ErrorState offline={error.offline} message={error.offline ? "Records need an internet connection." : error.message} onRetry={() => void loadFirst(q)} />
          ) : loading ? (
            <>
              <SurveyCardSkeleton />
              <SurveyCardSkeleton />
              <SurveyCardSkeleton />
            </>
          ) : q.trim() ? (
            <EmptyState icon="search-outline" title="No matching records" message={`Nothing matches “${q.trim()}”. Check the spelling or try the survey number.`} />
          ) : (
            <EmptyState
              icon="receipt-outline"
              title="No records yet"
              message="Saved farmer records will appear here."
              actionTitle={canCreate ? "Add a record" : undefined}
              onAction={canCreate ? () => router.push("/record/new") : undefined}
            />
          )
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 },
  search: {
    flexDirection: "row", alignItems: "center", gap: 8, marginHorizontal: 16, paddingHorizontal: 12, minHeight: 52,
    borderRadius: radius.md, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border,
  },
  input: { flex: 1, fontFamily: fonts.regular, fontSize: 16, color: colors.text },
  hints: { flexDirection: "row", flexWrap: "wrap", gap: 6, paddingHorizontal: 16, marginTop: 8 },
  hint: { backgroundColor: colors.primarySoft, color: colors.primaryDark, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2, overflow: "hidden" },
  list: { padding: 16, paddingBottom: 24, flexGrow: 1 },
});
