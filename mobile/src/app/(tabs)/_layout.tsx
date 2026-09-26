import { Ionicons } from "@expo/vector-icons";
import { Tabs } from "expo-router";
import type { ComponentProps } from "react";
import type { ColorValue } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useUnsyncedCount } from "@/features/sync/hooks";
import { colors, fonts } from "@/theme";

type IconName = ComponentProps<typeof Ionicons>["name"];

function TabIcon({ focused, color, active, inactive }: { focused: boolean; color: ColorValue; active: IconName; inactive: IconName }) {
  return <Ionicons name={focused ? active : inactive} size={24} color={color} />;
}

const icon = (active: IconName, inactive: IconName) =>
  function renderTabIcon({ focused, color }: { focused: boolean; color: ColorValue }) {
    return <TabIcon focused={focused} color={color} active={active} inactive={inactive} />;
  };

export default function TabsLayout() {
  const insets = useSafeAreaInsets();
  const { pending, failed } = useUnsyncedCount();
  const waiting = pending + failed;
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.muted,
        tabBarLabelStyle: { fontFamily: fonts.medium, fontSize: 12 },
        tabBarStyle: {
          backgroundColor: colors.card,
          borderTopColor: colors.border,
          height: 62 + insets.bottom,
          paddingTop: 6,
          paddingBottom: insets.bottom + 6,
        },
      }}
    >
      <Tabs.Screen name="index" options={{ title: "Home", tabBarIcon: icon("home", "home-outline") }} />
      <Tabs.Screen
        name="surveys"
        options={{
          title: "Surveys",
          tabBarIcon: icon("document-text", "document-text-outline"),
          tabBarBadge: waiting > 0 ? waiting : undefined,
          tabBarBadgeStyle: { backgroundColor: failed ? colors.error : colors.warning, fontFamily: fonts.semibold, fontSize: 11 },
        }}
      />
      <Tabs.Screen name="map" options={{ title: "Map", tabBarIcon: icon("map", "map-outline") }} />
      <Tabs.Screen name="profile" options={{ title: "Profile", tabBarIcon: icon("person", "person-outline") }} />
    </Tabs>
  );
}
