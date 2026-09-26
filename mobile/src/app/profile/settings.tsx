import { View } from "react-native";
import { AppCard } from "@/components/ui/AppCard";
import { AppText } from "@/components/ui/AppText";
import { RadioOption } from "@/components/forms/RadioOption";
import { Screen } from "@/components/ui/Screen";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { MAP_STYLES, type MapStyleId } from "@/components/map/mapStyles";
import { appConfig } from "@/config/env";
import { useSettingsStore } from "@/store/settingsStore";

export default function Settings() {
  const mapStyle = useSettingsStore((s) => s.mapStyle);
  const setMapStyle = useSettingsStore((s) => s.setMapStyle);
  return (
    <Screen header={<ScreenHeader title="Settings" />}>
      <AppText variant="heading" style={{ marginBottom: 10 }}>
        Map style
      </AppText>
      <View accessibilityRole="radiogroup">
        {(Object.keys(MAP_STYLES) as MapStyleId[]).map((id) => (
          <RadioOption key={id} label={MAP_STYLES[id].label} selected={mapStyle === id} onPress={() => setMapStyle(id)} />
        ))}
        <AppText variant="small" style={{ marginBottom: 6 }}>
          Maps use free OpenStreetMap data and need an internet connection to load.
        </AppText>
      </View>
      <AppText variant="heading" style={{ marginVertical: 10 }}>
        GPS quality
      </AppText>
      <AppCard style={{ gap: 4 }}>
        <AppText variant="body">Good: {appConfig.gpsGoodAccuracy} m or better</AppText>
        <AppText variant="body">Acceptable: up to {appConfig.gpsAcceptableAccuracy} m</AppText>
        <AppText variant="body">Low (confirmation needed): up to {appConfig.gpsMaxAccuracy} m</AppText>
        <AppText variant="caption">Locations less accurate than {appConfig.gpsMaxAccuracy} m are not accepted.</AppText>
      </AppCard>
    </Screen>
  );
}
