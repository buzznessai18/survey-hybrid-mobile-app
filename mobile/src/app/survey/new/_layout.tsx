import { Stack } from "expo-router";
import { colors } from "@/theme";

export default function NewSurveyLayout() {
  return (
    <Stack screenOptions={{ headerShown: false, animation: "slide_from_right", contentStyle: { backgroundColor: colors.background } }}>
      <Stack.Screen name="details" />
      <Stack.Screen name="location" />
      <Stack.Screen name="photo" options={{ animation: "fade" }} />
      <Stack.Screen name="review" />
      <Stack.Screen name="duplicate" options={{ animation: "slide_from_bottom" }} />
      <Stack.Screen name="reason" />
      <Stack.Screen name="success" options={{ animation: "fade", gestureEnabled: false }} />
    </Stack>
  );
}
