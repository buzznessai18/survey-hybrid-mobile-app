import { AppCard } from "@/components/ui/AppCard";
import { AppText } from "@/components/ui/AppText";
import { InfoRow } from "@/components/ui/InfoRow";
import { Screen } from "@/components/ui/Screen";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { useAuthStore } from "@/store/authStore";

const ROLE_LABEL = { field_surveyor: "View only", supervisor: "Supervisor", admin: "Admin", user: "Regular User" } as const;

/** Read-only: roles, status and supervisor are managed by administrators. */
export default function MyProfile() {
  const profile = useAuthStore((s) => s.profile);
  const session = useAuthStore((s) => s.session);
  return (
    <Screen header={<ScreenHeader title="My Profile" />}>
      <AppCard>
        <InfoRow label="Name" value={profile?.full_name ?? "—"} />
        <InfoRow label="Role" value={profile ? ROLE_LABEL[profile.role] : "—"} />
        <InfoRow label="Mobile" value={profile?.mobile ?? "—"} />
        <InfoRow label="Email" value={session?.user.email || "—"} />
        <InfoRow label="Status" value={profile?.status === "active" ? "Active" : (profile?.status ?? "—")} last />
      </AppCard>
      <AppText variant="small" style={{ marginTop: 12 }}>
        Your role and account details are managed by your administrator.
      </AppText>
    </Screen>
  );
}
