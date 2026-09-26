import Constants from "expo-constants";
import { View } from "react-native";
import { AppCard } from "@/components/ui/AppCard";
import { AppText } from "@/components/ui/AppText";
import { LeafLogo } from "@/components/ui/Brand";
import { InfoRow } from "@/components/ui/InfoRow";
import { Screen } from "@/components/ui/Screen";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { env } from "@/config/env";
import { colors } from "@/theme";

export default function About() {
  const host = (() => {
    try {
      return new URL(env.supabaseUrl).host;
    } catch {
      return "—";
    }
  })();
  return (
    <Screen header={<ScreenHeader title="About App" />}>
      <View style={{ alignItems: "center", marginVertical: 20 }}>
        <View style={{ backgroundColor: colors.primary, borderRadius: 24, padding: 14 }}>
          <LeafLogo size={56} />
        </View>
        <AppText variant="title" style={{ marginTop: 12 }}>
          Field Survey
        </AppText>
        <AppText variant="caption">Collect. Verify. Map.</AppText>
      </View>
      <AppCard>
        <InfoRow label="Version" value={Constants.expoConfig?.version ?? "1.0.0"} />
        <InfoRow label="Server" value={host} last />
      </AppCard>
    </Screen>
  );
}
