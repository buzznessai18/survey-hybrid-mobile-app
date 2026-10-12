import { router } from "expo-router";
import { useState } from "react";
import { FlatList, RefreshControl, ScrollView, View } from "react-native";
import { Chip } from "@/components/ui/Chip";
import { useTopInset } from "@/components/ui/Screen";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { EmptyState, ErrorState, SurveyCardSkeleton } from "@/components/ui/States";
import { SurveyCard } from "@/components/survey/SurveyCard";
import { useRemote } from "@/features/common/useRemote";
import { serverCard } from "@/features/surveys/cardData";
import { SurveyService } from "@/services/surveys/SurveyService";
import { colors } from "@/theme";
import type { DuplicateStatus } from "@/types/api";

const FILTERS: { value: string; label: string; statuses: DuplicateStatus[] }[] = [
  { value: "open", label: "Needs review", statuses: ["duplicate", "possible_duplicate", "needs_verification"] },
  { value: "duplicate", label: "Exact", statuses: ["duplicate"] },
  { value: "possible", label: "Nearby", statuses: ["possible_duplicate"] },
  { value: "verify", label: "Verification", statuses: ["needs_verification"] },
  { value: "confirmed", label: "Confirmed", statuses: ["confirmed_duplicate"] },
  { value: "cleared", label: "Cleared", statuses: ["not_duplicate"] },
];

/** Admin: duplicate records queue. */
export default function DuplicatesScreen() {
  const top = useTopInset();
  const [filter, setFilter] = useState("open");
  const statuses = FILTERS.find((f) => f.value === filter)!.statuses;
  const { data, loading, error, reload } = useRemote(
    () => SurveyService.searchSurveys({ duplicate_status: statuses, include_photo_urls: true, page_size: 50 }),
    filter,
  );
  return (
    <View style={{ flex: 1, backgroundColor: colors.background, paddingTop: top }}>
      <ScreenHeader title="Duplicate Records" />
      <View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: 16, paddingBottom: 12 }}>
          {FILTERS.map((f) => <Chip key={f.value} label={f.label} selected={filter === f.value} onPress={() => setFilter(f.value)} />)}
        </ScrollView>
      </View>
      <FlatList
        data={data?.data ?? []}
        keyExtractor={(s) => s.id}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24, flexGrow: 1 }}
        refreshControl={<RefreshControl refreshing={loading && !!data} onRefresh={reload} tintColor={colors.primary} />}
        renderItem={({ item }) => <SurveyCard data={serverCard(item)} onPress={() => router.push({ pathname: "/admin/compare", params: { id: item.id } })} />}
        ListEmptyComponent={
          loading ? <><SurveyCardSkeleton /><SurveyCardSkeleton /></> : error ? <ErrorState offline={error.offline} message={error.message} onRetry={reload} /> : (
            <EmptyState icon="shield-checkmark-outline" title="Nothing here" message="No records in this category." />
          )
        }
      />
    </View>
  );
}
