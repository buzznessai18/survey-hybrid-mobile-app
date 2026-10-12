import { Ionicons } from "@expo/vector-icons";
import { router, type Href } from "expo-router";
import type { ComponentProps } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { AppButton } from "@/components/ui/AppButton";
import { AppText } from "@/components/ui/AppText";
import { Avatar } from "@/components/ui/Avatar";
import { useTopInset } from "@/components/ui/Screen";
import { useUnsyncedCount } from "@/features/sync/hooks";
import { canEditRecords, useAuthStore } from "@/store/authStore";
import { colors, fonts, radius, shadow } from "@/theme";

const ROLE_LABEL = { field_surveyor: "View only", supervisor: "Supervisor", admin: "Admin", user: "Regular User" } as const;

export default function ProfileScreen() {
  const top = useTopInset();
  const profile = useAuthStore((s) => s.profile);
  const signOut = useAuthStore((s) => s.signOut);
  const isAdmin = profile?.role === "admin";
  const canEdit = canEditRecords(profile?.role);
  const { pending, failed } = useUnsyncedCount();
  const waiting = pending + failed;

  const confirmLogout = () =>
    Alert.alert(
      "Log out?",
      waiting
        ? `${waiting} survey${waiting === 1 ? " is" : "s are"} not synced yet. They stay on this device and will sync the next time you sign in.`
        : "You will need your password to sign in again.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Log out", style: "destructive", onPress: () => void signOut() },
      ],
    );

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.background }} contentContainerStyle={{ paddingBottom: 32 }}>
      <View style={[styles.hero, { paddingTop: top + 24 }]}>
        <Avatar name={profile?.full_name} size={72} light />
        <View style={{ flex: 1 }}>
          <AppText style={styles.name} numberOfLines={2}>
            {profile?.full_name ?? "—"}
          </AppText>
          <AppText style={styles.heroSub}>{profile ? ROLE_LABEL[profile.role] : ""}</AppText>
          {profile?.mobile ? <AppText style={styles.heroSub}>{profile.mobile}</AppText> : null}
        </View>
      </View>

      <View style={[styles.menu, shadow.card]}>
        <MenuRow icon="person-outline" label="My Profile" href="/profile/details" />
        {/* Only the previous survey workflow queued data offline; shown while anything is still waiting. */}
        {canEdit && waiting > 0 ? <MenuRow icon="cloud-upload-outline" label="Offline Data" href="/profile/offline" badge={waiting} badgeTone={failed ? "error" : "warning"} /> : null}
        <MenuRow icon="settings-outline" label="Settings" href="/profile/settings" />
        <MenuRow icon="help-circle-outline" label="Help & Support" href="/profile/help" />
        <MenuRow icon="information-circle-outline" label="About App" href="/profile/about" last />
      </View>

      {isAdmin ? (
        <>
          <AppText variant="label" style={styles.sectionLabel}>ADMINISTRATION</AppText>
          <View style={[styles.menu, shadow.card, { marginTop: 0 }]}>
            <MenuRow icon="people-circle-outline" label="User Management" href="/profile/users" />
            <MenuRow icon="stats-chart-outline" label="Reports (Excel / PDF)" href="/admin/reports" />
            <MenuRow icon="time-outline" label="Audit History" href="/admin/audit" last />
          </View>
        </>
      ) : null}

      <AppButton title="Logout" icon="log-out-outline" variant="dangerSoft" onPress={confirmLogout} style={{ marginHorizontal: 16, marginTop: 20 }} />
    </ScrollView>
  );
}

function MenuRow({
  icon,
  label,
  href,
  badge,
  badgeTone = "error",
  last,
}: {
  icon: ComponentProps<typeof Ionicons>["name"];
  label: string;
  href: Href;
  badge?: number;
  badgeTone?: "error" | "warning";
  last?: boolean;
}) {
  return (
    <Pressable
      onPress={() => router.push(href)}
      accessibilityRole="button"
      accessibilityLabel={badge ? `${label}, ${badge} pending` : label}
      style={({ pressed }) => [styles.row, !last && styles.divider, pressed && { backgroundColor: "#F3F5F2" }]}
    >
      <Ionicons name={icon} size={22} color={colors.text} />
      <AppText variant="body" style={{ flex: 1 }}>
        {label}
      </AppText>
      {badge ? (
        <View style={[styles.badge, { backgroundColor: badgeTone === "error" ? colors.error : colors.warning }]}>
          <AppText style={styles.badgeText}>{badge}</AppText>
        </View>
      ) : null}
      <Ionicons name="chevron-forward" size={18} color={colors.placeholder} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  hero: {
    backgroundColor: colors.primary,
    paddingHorizontal: 20,
    paddingBottom: 48,
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
  },
  name: { fontFamily: fonts.bold, fontSize: 22, color: colors.white },
  heroSub: { fontFamily: fonts.medium, fontSize: 14, color: "#D8F0E1", marginTop: 2 },
  menu: { backgroundColor: colors.card, borderRadius: radius.lg, marginHorizontal: 16, marginTop: -28, overflow: "hidden" },
  row: { flexDirection: "row", alignItems: "center", gap: 14, paddingHorizontal: 16, minHeight: 58 },
  divider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  badge: { minWidth: 22, height: 22, borderRadius: 11, alignItems: "center", justifyContent: "center", paddingHorizontal: 6 },
  badgeText: { color: colors.white, fontFamily: fonts.bold, fontSize: 12 },
  sectionLabel: { marginHorizontal: 20, marginTop: 22, marginBottom: 8, color: colors.muted, letterSpacing: 0.5 },
});
