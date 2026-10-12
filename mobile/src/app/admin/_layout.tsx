import { Stack } from "expo-router";
import { useIsAdmin } from "@/store/authStore";
import { colors } from "@/theme";

/**
 * Admin-only: reports and audit history (the root layout and the backend enforce this too).
 * The previous survey tools (duplicates, compare, benefit/scheme types, benefits given) are
 * switched off with the old workflow; their files are kept until the client confirms removal.
 */
export default function AdminLayout() {
  const isAdmin = useIsAdmin();
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }}>
      <Stack.Protected guard={isAdmin}>
        <Stack.Screen name="reports" />
        <Stack.Screen name="audit" />
      </Stack.Protected>
      <Stack.Protected guard={false}>
        <Stack.Screen name="duplicates" />
        <Stack.Screen name="compare" />
        <Stack.Screen name="schemes" />
        <Stack.Screen name="scheme" />
        <Stack.Screen name="applications" />
        <Stack.Screen name="application" />
      </Stack.Protected>
    </Stack>
  );
}
