import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, StyleSheet, TextInput, View } from "react-native";
import { AppButton } from "@/components/ui/AppButton";
import { AppText } from "@/components/ui/AppText";
import { Avatar } from "@/components/ui/Avatar";
import { useTopInset } from "@/components/ui/Screen";
import { EmptyState, ErrorState } from "@/components/ui/States";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { SelectField } from "@/components/forms/SelectField";
import { errorMessage, toApiError } from "@/services/api/errors";
import { FarmerService } from "@/services/records/RecordServices";
import { useCanEditRecords } from "@/store/authStore";
import { useNetworkStore } from "@/store/networkStore";
import { colors, fonts, radius, shadow } from "@/theme";
import { GOA_TALUKAS, type FarmerSearchItem, type Taluka } from "@/types/api";
import { CATEGORY_LABELS, formatSqM } from "@/utils/labels";

const SEARCH_HINTS = ["Farmer name", "Mobile", "Survey no. 312/4B", "1/14 no. LR-000300"];

const talukaOptions = [{ value: "", label: "All talukas" }, ...GOA_TALUKAS.map((t) => ({ value: t, label: t }))];

/** Search farmers by name, mobile, survey number (e.g. 312/4B) or 1/14 form number (LR-000300). */
export default function SearchScreen() {
  const top = useTopInset();
  const canEdit = useCanEditRecords();
  const isOnline = useNetworkStore((s) => s.isOnline);
  const params = useLocalSearchParams<{ q?: string }>();
  const [q, setQ] = useState(params.q ?? "");
  // A search started from the Home screen.
  const [lastParam, setLastParam] = useState(params.q);
  if (params.q !== lastParam) {
    setLastParam(params.q);
    if (params.q !== undefined) setQ(params.q);
  }
  const [taluka, setTaluka] = useState<Taluka | "">("");
  const [items, setItems] = useState<FarmerSearchItem[]>([]);
  const [total, setTotal] = useState<number | null>(null);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<{ message: string; offline: boolean } | null>(null);

  useEffect(() => {
    if (!isOnline) return;
    let cancelled = false;
    const t = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await FarmerService.search({ q: q.trim() || undefined, taluka: taluka || undefined, page: 1 });
        if (cancelled) return;
        setItems(res.data);
        setTotal(res.pagination.total);
        setPages(res.pagination.total_pages);
        setPage(1);
        setError(null);
      } catch (e) {
        if (!cancelled) setError({ message: errorMessage(e), offline: toApiError(e).isConnectivity });
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [q, taluka, isOnline]);

  const loadMore = async () => {
    if (loading || page >= pages) return;
    setLoading(true);
    try {
      const res = await FarmerService.search({ q: q.trim() || undefined, taluka: taluka || undefined, page: page + 1 });
      setItems((prev) => [...prev, ...res.data.filter((d) => !prev.some((p) => p.id === d.id))]);
      setPage(page + 1);
    } catch {
      /* keep current results */
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={[styles.root, { paddingTop: top }]}>
      <View style={styles.header}>
        <AppText variant="title" accessibilityRole="header">Search Farmers</AppText>
        {canEdit ? <AppButton title="Add" icon="person-add-outline" compact variant="secondary" onPress={() => router.push("/farmer/edit")} /> : null}
      </View>
      <View style={styles.search}>
        <Ionicons name="search" size={18} color={colors.muted} />
        <TextInput
          value={q}
          onChangeText={setQ}
          placeholder="Name, mobile, survey no. or 1/14 no."
          placeholderTextColor={colors.placeholder}
          style={styles.input}
          autoCorrect={false}
          returnKeyType="search"
          accessibilityLabel="Search by farmer name, mobile number, survey number or 1/14 form number"
          autoFocus={!params.q}
          clearButtonMode="while-editing"
        />
        {loading ? <ActivityIndicator size="small" color={colors.primary} /> : null}
      </View>
      <View style={styles.hints}>
        {SEARCH_HINTS.map((h) => <AppText key={h} variant="small" style={styles.hint}>{h}</AppText>)}
      </View>
      <View style={{ paddingHorizontal: 16, marginTop: 10 }}>
        <SelectField compact value={taluka} options={talukaOptions} onChange={(v) => setTaluka(v as Taluka | "")} placeholder="All talukas" icon="map-outline" />
      </View>
      {total !== null ? (
        <AppText variant="small" style={{ paddingHorizontal: 16, marginTop: 10 }}>
          {total} farmer{total === 1 ? "" : "s"}
        </AppText>
      ) : null}

      <FlatList
        data={items}
        keyExtractor={(f) => f.id}
        contentContainerStyle={styles.list}
        onEndReached={loadMore}
        onEndReachedThreshold={0.4}
        keyboardShouldPersistTaps="handled"
        renderItem={({ item: f }) => (
          <Pressable
            onPress={() => router.push({ pathname: "/farmer/[id]", params: { id: f.id } })}
            style={({ pressed }) => [styles.row, pressed && { opacity: 0.85 }]}
            accessibilityRole="button"
            accessibilityLabel={`${f.name}, ${f.village ?? ""}`}
          >
            <Avatar name={f.name} size={44} />
            <View style={{ flex: 1, gap: 2 }}>
              <AppText variant="bodyStrong">{f.name}</AppText>
              <AppText variant="caption">
                {f.mobile} • {[f.village, f.taluka].filter(Boolean).join(", ") || "—"}
                {f.category ? ` • ${CATEGORY_LABELS[f.category]}` : ""}
              </AppText>
              <AppText variant="small">
                {f.form_count} land record{f.form_count === 1 ? "" : "s"} • {formatSqM(f.land_sq_m)} • {f.survey_count} survey{f.survey_count === 1 ? "" : "s"}
              </AppText>
              {f.survey_numbers.length ? <AppText variant="small" numberOfLines={1}>Sy. {f.survey_numbers.join(", ")}</AppText> : null}
              {f.form_ids.length ? <AppText variant="small" numberOfLines={1}>1/14: {f.form_ids.join(", ")}</AppText> : null}
              {f.benefits_received || f.benefits_pending ? (
                <View style={styles.badges}>
                  {f.benefits_received ? <StatusBadge label={`${f.benefits_received} received`} tone="primary" /> : null}
                  {f.benefits_pending ? <StatusBadge label={`${f.benefits_pending} pending`} tone="warning" /> : null}
                </View>
              ) : null}
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.placeholder} />
          </Pressable>
        )}
        ListEmptyComponent={
          !isOnline ? (
            <ErrorState offline message="Farmer search needs an internet connection." />
          ) : error ? (
            <ErrorState message={error.message} />
          ) : loading ? null : (
            <EmptyState icon="people-outline" title="No farmers found" message={q ? `Nothing matches “${q}”.` : "No farmers recorded yet."} />
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
    flexDirection: "row", alignItems: "center", gap: 8, marginHorizontal: 16, paddingHorizontal: 12, minHeight: 50,
    borderRadius: radius.md, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border,
  },
  hints: { flexDirection: "row", flexWrap: "wrap", gap: 6, paddingHorizontal: 16, marginTop: 8 },
  hint: { backgroundColor: colors.primarySoft, color: colors.primaryDark, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
  badges: { flexDirection: "row", gap: 6, marginTop: 4 },
  input: { flex: 1, fontFamily: fonts.regular, fontSize: 15.5, color: colors.text },
  list: { padding: 16, paddingBottom: 24, flexGrow: 1 },
  row: {
    flexDirection: "row", alignItems: "center", gap: 12, padding: 12, marginBottom: 10, backgroundColor: colors.card,
    borderRadius: radius.lg, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border, ...shadow.card,
  },
});
