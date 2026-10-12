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
import { canEditRecords, startAuthListener, useAuthStore } from "@/store/authStore";
import { useCacheStore } from "@/store/cacheStore";
import { useDraftStore } from "@/store/draftStore";
import { useQueueStore } from "@/store/queueStore";
import { useSettingsStore } from "@/store/settingsStore";
import { waitForHydration } from "@/store/storage";
import { colors } from "@/theme";

SplashScreen.preventAutoHideAsync().catch(() => {});

/** The previous multi-step survey / 1-14 form workflow. Off: the client asked for the simple record form. */
const LEGACY_SURVEY_WORKFLOW = false;

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({ Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold });
  const [storesReady, setStoresReady] = useState(!env.isConfigured);
  const authStatus = useAuthStore((s) => s.status);
  const canEdit = useAuthStore((s) => canEditRecords(s.profile?.role));
  const isAdmin = useAuthStore((s) => s.profile?.role === "admin");

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
                <Stack.Screen name="record/[id]" />
                <Stack.Screen name="profile" />
                {/* Adding records: admins and company users (the backend enforces it too). */}
                <Stack.Protected guard={canEdit}>
                  <Stack.Screen name="record/new" options={{ gestureEnabled: false }} />
                </Stack.Protected>
                {/* Reports and audit history: admins only (admin/_layout and the backend enforce it too). */}
                <Stack.Protected guard={isAdmin}>
                  <Stack.Screen name="admin" />
                </Stack.Protected>
                {/* Previous survey workflow (6-step survey, 1/14 forms, farmers, map, approvals):
                    switched off for the simplified client workflow. Kept, not deleted, so historical
                    data and code stay available until the client confirms removal. */}
                <Stack.Protected guard={LEGACY_SURVEY_WORKFLOW}>
                  <Stack.Screen name="survey/[id]" />
                  <Stack.Screen name="farmer/[id]" />
                  <Stack.Screen name="form/[id]" />
                  <Stack.Screen name="survey/new" options={{ gestureEnabled: false }} />
                  <Stack.Screen name="survey/edit/[id]" />
                  <Stack.Screen name="farmer/edit" />
                  <Stack.Screen name="form/edit/[id]" />
                </Stack.Protected>
              </Stack.Protected>
              <Stack.Protected guard={!signedIn}>
                <Stack.Screen name="(auth)" />
              </Stack.Protected>
            </Stack>
          </View>
        )}
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
