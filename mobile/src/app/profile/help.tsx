import { AppCard } from "@/components/ui/AppCard";
import { AppText } from "@/components/ui/AppText";
import { Screen } from "@/components/ui/Screen";
import { ScreenHeader } from "@/components/ui/ScreenHeader";

const TIPS: [string, string][] = [
  ["No internet in the field?", "Complete the survey as usual. It is saved on your phone and syncs automatically when you are back online. Check Profile → Offline Data."],
  ["Duplicate warning", "It means a survey with the same survey number already exists. If this is a different farmer or portion of land, choose Submit Anyway and give a reason. Your supervisor reviews it."],
  ["Low GPS accuracy", "Stand in an open area away from buildings and trees, wait a few seconds and capture again."],
  ["Sync failed", "Open the survey from Offline Data. If details need fixing, use Edit & Resubmit; otherwise tap Retry."],
  ["Do I need an account?", "No. Anyone can open the app and search, view and map all surveys. Only admins sign in (Profile → Admin Login) to add or edit surveys."],
  ["Admin password problems", "Ask another admin to reset your account from Profile → Manage Admins."],
];

export default function Help() {
  return (
    <Screen header={<ScreenHeader title="Help & Support" />}>
      {TIPS.map(([title, body]) => (
        <AppCard key={title} style={{ marginBottom: 10, gap: 4 }}>
          <AppText variant="bodyStrong">{title}</AppText>
          <AppText variant="caption">{body}</AppText>
        </AppCard>
      ))}
    </Screen>
  );
}
