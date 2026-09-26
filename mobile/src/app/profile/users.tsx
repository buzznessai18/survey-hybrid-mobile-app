import { Ionicons } from "@expo/vector-icons";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { Alert, FlatList, RefreshControl, StyleSheet, Switch, TextInput, View } from "react-native";
import { AppButton } from "@/components/ui/AppButton";
import { AppText } from "@/components/ui/AppText";
import { Avatar } from "@/components/ui/Avatar";
import { useTopInset } from "@/components/ui/Screen";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { EmptyState, ErrorState, SurveyCardSkeleton } from "@/components/ui/States";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { UserService } from "@/services/admin/UserService";
import { errorMessage, toApiError } from "@/services/api/errors";
import { useAuthStore } from "@/store/authStore";
import { colors, fonts, radius } from "@/theme";
import type { ManagedUser } from "@/types/api";

const ROLE_LABEL: Record<string, string> = { admin: "Admin", user: "User", field_surveyor: "Field Surveyor", supervisor: "Supervisor" };

/** Admin-only: list accounts, activate/deactivate, add new ones. */
export default function ManageUsers() {
  const top = useTopInset();
  const me = useAuthStore((s) => s.profile?.id);
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<{ message: string; offline: boolean } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async (term: string) => {
    setLoading(true);
    try {
      const res = await UserService.list({ role: "admin", search: term.trim() || undefined });
      setUsers(res.data);
      setError(null);
    } catch (e) {
      setError({ message: errorMessage(e), offline: toApiError(e).isConnectivity });
    } finally {
      setLoading(false);
    }
  }, []);

  // Reload whenever the screen is shown (e.g. after adding a user).
  useFocusEffect(
    useCallback(() => {
      void load(search);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [load]),
  );

  const toggleActive = (u: ManagedUser) => {
    const next = u.status === "active" ? "inactive" : "active";
    const apply = async () => {
      setBusyId(u.id);
      try {
        const updated = await UserService.update({ user_id: u.id, status: next });
        setUsers((list) => list.map((x) => (x.id === u.id ? { ...x, ...updated } : x)));
      } catch (e) {
        Alert.alert("Couldn't update user", errorMessage(e));
      } finally {
        setBusyId(null);
      }
    };
    if (next === "inactive") {
      Alert.alert("Deactivate account?", `${u.full_name} will be signed out and can't sign in until reactivated.`, [
        { text: "Cancel", style: "cancel" },
        { text: "Deactivate", style: "destructive", onPress: () => void apply() },
      ]);
    } else void apply();
  };

  return (
    <View style={[styles.root, { paddingTop: top }]}>
      <ScreenHeader title="Manage Admins" />
      <View style={styles.searchRow}>
        <View style={styles.search}>
          <Ionicons name="search" size={18} color={colors.muted} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            onSubmitEditing={() => void load(search)}
            placeholder="Search name or mobile"
            placeholderTextColor={colors.placeholder}
            returnKeyType="search"
            style={styles.searchInput}
            accessibilityLabel="Search users"
          />
        </View>
        <AppButton title="Add" icon="person-add-outline" compact onPress={() => router.push("/profile/add-user")} />
      </View>

      <FlatList
        data={users}
        keyExtractor={(u) => u.id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={loading && users.length > 0} onRefresh={() => void load(search)} tintColor={colors.primary} />}
        ListEmptyComponent={
          loading ? (
            <>
              <SurveyCardSkeleton />
              <SurveyCardSkeleton />
            </>
          ) : error ? (
            <ErrorState offline={error.offline} message={error.message} onRetry={() => void load(search)} />
          ) : (
            <EmptyState icon="people-outline" title="No admins found" actionTitle="Add Admin" onAction={() => router.push("/profile/add-user")} />
          )
        }
        renderItem={({ item: u }) => {
          const isMe = u.id === me;
          return (
            <View style={styles.row}>
              <Avatar name={u.full_name} size={42} />
              <View style={{ flex: 1, gap: 3 }}>
                <AppText variant="bodyStrong" numberOfLines={1}>
                  {u.full_name}
                  {isMe ? " (you)" : ""}
                </AppText>
                <View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap" }}>
                  <StatusBadge label={ROLE_LABEL[u.role] ?? u.role} tone={u.role === "admin" ? "primary" : "info"} />
                  <StatusBadge
                    label={u.status === "active" ? "Active" : u.status === "pending" ? "Pending" : "Inactive"}
                    tone={u.status === "active" ? "success" : "neutral"}
                  />
                </View>
                {u.mobile ? <AppText variant="small">{u.mobile}</AppText> : null}
              </View>
              <Switch
                value={u.status === "active"}
                onValueChange={() => toggleActive(u)}
                disabled={isMe || busyId === u.id}
                trackColor={{ true: colors.primary, false: colors.borderStrong }}
                accessibilityLabel={`${u.full_name} active`}
              />
            </View>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  searchRow: { flexDirection: "row", gap: 10, paddingHorizontal: 16, paddingBottom: 10, alignItems: "center" },
  search: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    minHeight: 48,
    borderRadius: radius.md,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  searchInput: { flex: 1, fontFamily: fonts.regular, fontSize: 15.5, color: colors.text },
  list: { paddingHorizontal: 16, paddingBottom: 24, flexGrow: 1 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 12,
    marginBottom: 10,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
  },
});
