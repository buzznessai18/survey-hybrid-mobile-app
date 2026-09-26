import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold, useFonts } from "@expo-google-fonts/inter";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import { View } from "react-native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { OfflineBanner } from "@/components/ui/SyncStatus";
import { ConfigMissing } from "@/features/auth/ConfigMissing";
import { useSyncEngine } from "@/features/sync/hooks";
import { env } from "@/config/env";
import { startAuthListener, useAuthStore } from "@/store/authStore";
import { useCacheStore } from "@/store/cacheStore";
import { useDraftStore } from "@/store/draftStore";
import { useQueueStore } from "@/store/queueStore";
import { useSettingsStore } from "@/store/settingsStore";
import { waitForHydration } from "@/store/storage";
import { colors } from "@/theme";

SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({ Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold });
  const [storesReady, setStoresReady] = useState(!env.isConfigured);
  const authStatus = useAuthStore((s) => s.status);
  const isAdmin = useAuthStore((s) => s.profile?.role === "admin");
  const isGuest = useAuthStore((s) => !!s.profile?.is_guest);

  useEffect(() => {
    if (!env.isConfigured) return;
    const stopAuth = startAuthListener();
    (async () => {
      await Promise.all([
        waitForHydration(useAuthStore),
        waitForHydration(useQueueStore),
        waitForHydration(useDraftStore),
        waitForHydration(useCacheStore),
        waitForHydration(useSettingsStore),
      ]);
      setStoresReady(true);
      await useAuthStore.getState().initialize();
    })();
    return stopAuth;
  }, []);

  useSyncEngine();

  const ready = (fontsLoaded || !!fontError) && storesReady && (authStatus !== "initializing" || !env.isConfigured);
  useEffect(() => {
    if (ready) SplashScreen.hideAsync().catch(() => {});
  }, [ready]);

  if (!ready) return null;

  const signedIn = authStatus === "signedIn";
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <StatusBar style="dark" />
        {!env.isConfigured ? (
          <ConfigMissing />
        ) : (
          <View style={{ flex: 1, backgroundColor: colors.background }}>
            <OfflineBanner />
            <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }}>
              <Stack.Protected guard={signedIn}>
                <Stack.Screen name="(tabs)" />
                <Stack.Screen name="survey/[id]" />
                <Stack.Screen name="profile" />
                {/* Creating and editing surveys is admin-only (enforced by the backend too). */}
                <Stack.Protected guard={isAdmin}>
                  <Stack.Screen name="survey/new" options={{ gestureEnabled: false }} />
                  <Stack.Screen name="survey/edit/[id]" />
                </Stack.Protected>
              </Stack.Protected>
              {/* Admin login: reachable when signed out or while browsing as a guest. */}
              <Stack.Protected guard={!signedIn || isGuest}>
                <Stack.Screen name="(auth)" options={{ presentation: signedIn ? "modal" : undefined }} />
              </Stack.Protected>
            </Stack>
          </View>
        )}
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
