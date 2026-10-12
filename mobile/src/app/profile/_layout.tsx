import { Stack } from "expo-router";
import { useIsAdmin } from "@/store/authStore";
import { colors } from "@/theme";

export default function ProfileStackLayout() {
  const isAdmin = useIsAdmin();
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.background } }}>
      {/* User management: admins only (admin-users enforces this as well). */}
      <Stack.Protected guard={isAdmin}>
        <Stack.Screen name="users" />
        <Stack.Screen name="add-user" />
        <Stack.Screen name="user/[id]" />
      </Stack.Protected>
    </Stack>
  );
}
