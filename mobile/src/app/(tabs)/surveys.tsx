import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, FlatList, RefreshControl, ScrollView, StyleSheet, TextInput, View } from "react-native";
import { AppText } from "@/components/ui/AppText";
import { Chip } from "@/components/ui/Chip";
import { Segmented } from "@/components/ui/Segmented";
import { FormsPane } from "@/features/records/FormsPane";
import { IconButton } from "@/components/ui/IconButton";
import { useTopInset } from "@/components/ui/Screen";
import { useCanEditRecords } from "@/store/authStore";
import { EmptyState, ErrorState, SurveyCardSkeleton } from "@/components/ui/States";
import { SurveyCard, type SurveyCardData } from "@/components/survey/SurveyCard";
import { queueCard, serverCard } from "@/features/surveys/cardData";
import { useMySurveys } from "@/features/surveys/useMySurveys";
import { useStartSurvey } from "@/features/surveys/useStartSurvey";
import { useUserQueue } from "@/features/sync/hooks";
import { SyncService } from "@/services/sync/SyncService";
import { colors, fonts, radius } from "@/theme";
import { FLAGGED_DUPLICATE_STATUSES } from "@/types/api";
import type { QueueItem } from "@/types/survey";
import { matchesQueueSearch } from "@/utils/search";

type Filter = "all" | "submitted" | "pending" | "duplicates";


/** Records: 1/14 forms and field surveys (incl. offline / pending sync). */
export default function RecordsScreen() {
  const top = useTopInset();
  const params = useLocalSearchParams<{ filter?: Filter; tab?: "forms" | "surveys" }>();
  const [tab, setTab] = useState<"forms" | "surveys">(params.filter ? "surveys" : (params.tab ?? "forms"));
  const [lastTab, setLastTab] = useState(params.tab);
  if (params.tab !== lastTab) {
    setLastTab(params.tab);
    if (params.tab) setTab(params.tab);
  }
  const startSurvey = useStartSurvey();
  const canEdit = useCanEditRecords();
  const header = (
    <View style={styles.header}>
      <AppText variant="title" accessibilityRole="header">Records</AppText>
      {canEdit ? <IconButton icon="add-circle" size={30} color={colors.primary} label="New 1/14 form" onPress={() => startSurvey()} /> : null}
    </View>
  );
  return (
    <View style={[styles.root, { paddingTop: top }]}>
      {header}
      <View style={{ paddingHorizontal: 16, paddingBottom: 8 }}>
        <Segmented value={tab} onChange={setTab} options={[{ value: "forms", label: "1/14 Forms" }, { value: "surveys", label: "Field Surveys" }]} />
      </View>
      {tab === "forms" ? <FormsPane /> : <SurveysPane />}
    </View>
  );
}

function SurveysPane() {
  const params = useLocalSearchParams<{ filter?: Filter }>();
  const startSurvey = useStartSurvey();
  const canEdit = useCanEditRecords();
  const [filter, setFilter] = useState<Filter>(params.filter ?? "all");
  const [lastParam, setLastParam] = useState(params.filter);
  if (params.filter !== lastParam) {
    // Navigated here with a new filter (e.g. Home → Duplicates).
    setLastParam(params.filter);
    if (params.filter) setFilter(params.filter);
  }
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");

  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), 400);
    return () => clearTimeout(t);
  }, [searchInput]);

  const queue = useUserQueue();
  const local = useMemo(() => queue.filter((q) => q.status !== "synced" && matchesQueueSearch(q, search)), [queue, search]);

  const serverFilters = useMemo(
    () => ({
      search: search || undefined,
      duplicate_status: filter === "duplicates" ? FLAGGED_DUPLICATE_STATUSES : undefined,
    }),
    [search, filter],
  );
  const server = useMySurveys(serverFilters, filter !== "pending");

  const rows = useMemo(() => {
    const out: { card: SurveyCardData; id: string; local?: QueueItem }[] = [];
    if (filter === "all" || filter === "pending") out.push(...local.map((q) => ({ card: queueCard(q), id: q.id, local: q })));
    if (filter !== "pending") out.push(...server.items.map((s) => ({ card: serverCard(s), id: s.id })));
    return out;
  }, [filter, local, server.items]);

  const refresh = async () => {
    void SyncService.processQueue({ force: true });
    if (filter !== "pending") await server.refresh();
  };

  const allCount = (server.total ?? 0) + local.length;
  const showServerState = filter !== "pending";
  const empty = !server.loading && rows.length === 0;

  return (
    <View style={{ flex: 1 }}>

      <View style={styles.search}>
        <Ionicons name="search" size={18} color={colors.muted} />
        <TextInput
          value={searchInput}
          onChangeText={setSearchInput}
          placeholder="Search farmer or survey number"
          placeholderTextColor={colors.placeholder}
          style={styles.searchInput}
          returnKeyType="search"
          autoCorrect={false}
          accessibilityLabel="Search farmer or survey number"
        />
        {searchInput ? <IconButton icon="close-circle" size={18} color={colors.muted} label="Clear search" onPress={() => setSearchInput("")} /> : null}
      </View>

      <View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          <Chip label={`All${server.total !== null ? ` (${allCount})` : ""}`} selected={filter === "all"} onPress={() => setFilter("all")} />
          <Chip label="Submitted" selected={filter === "submitted"} onPress={() => setFilter("submitted")} />
          {canEdit || local.length ? <Chip label={`Pending sync (${local.length})`} selected={filter === "pending"} onPress={() => setFilter("pending")} /> : null}
          <Chip label="Duplicates" selected={filter === "duplicates"} onPress={() => setFilter("duplicates")} />
        </ScrollView>
      </View>

      <FlatList
        data={rows}
        keyExtractor={(r) => r.card.key}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <SurveyCard data={item.card} onPress={() => router.push({ pathname: "/survey/[id]", params: { id: item.id } })} />
        )}
        onEndReachedThreshold={0.4}
        onEndReached={server.loadMore}
        refreshControl={<RefreshControl refreshing={server.refreshing} onRefresh={refresh} tintColor={colors.primary} />}
        ListHeaderComponent={
          showServerState && server.error && rows.length > 0 ? (
            <View style={styles.inlineNotice}>
              <Ionicons name={server.error.offline ? "cloud-offline-outline" : "alert-circle-outline"} size={16} color={colors.muted} />
              <AppText variant="small" style={{ flex: 1 }}>
                {server.error.offline ? "Offline — showing surveys saved on this device." : server.error.message}
              </AppText>
            </View>
          ) : null
        }
        ListFooterComponent={
          server.loadingMore ? <ActivityIndicator color={colors.primary} style={{ marginVertical: 16 }} /> : null
        }
        ListEmptyComponent={
          showServerState && server.loading ? (
            <>
              <SurveyCardSkeleton />
              <SurveyCardSkeleton />
              <SurveyCardSkeleton />
            </>
          ) : showServerState && server.error && empty ? (
            <ErrorState
              offline={server.error.offline}
              message={server.error.offline ? "Connect to the internet to load your submitted surveys." : server.error.message}
              onRetry={server.error.offline ? undefined : server.refresh}
            />
          ) : filter === "pending" ? (
            <EmptyState icon="cloud-done-outline" title="All synced" message="No surveys are waiting to sync." />
          ) : search ? (
            <EmptyState icon="search-outline" title="No matches" message={`No surveys match "${search}".`} />
          ) : filter === "duplicates" ? (
            <EmptyState icon="shield-checkmark-outline" title="No duplicates" message="No surveys are flagged as duplicates." />
          ) : (
            <EmptyState
              icon="clipboard-outline"
              title="No surveys yet"
              message="Field surveys captured with 1/14 forms appear here."
              actionTitle={canEdit ? "New 1/14 Form" : undefined}
              onAction={canEdit ? () => startSurvey() : undefined}
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
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginHorizontal: 16,
    paddingHorizontal: 12,
    minHeight: 50,
    borderRadius: radius.md,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  searchInput: { flex: 1, fontFamily: fonts.regular, fontSize: 15.5, color: colors.text },
  chips: { gap: 8, paddingHorizontal: 16, paddingVertical: 12 },
  list: { paddingHorizontal: 16, paddingBottom: 24, flexGrow: 1 },
  inlineNotice: { flexDirection: "row", gap: 6, alignItems: "center", paddingBottom: 10 },
});
