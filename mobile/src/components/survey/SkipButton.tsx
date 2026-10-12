import { Pressable } from "react-native";
import { AppText } from "@/components/ui/AppText";
import { colors } from "@/theme";

/** "Skip" for the optional 1/14 wizard steps (location, photo, crop & area). */
export function SkipButton({ onPress, label = "Skip", color = colors.primary }: { onPress: () => void; label?: string; color?: string }) {
  return (
    <Pressable onPress={onPress} hitSlop={12} accessibilityRole="button" accessibilityLabel={label} style={({ pressed }) => [{ paddingHorizontal: 6, paddingVertical: 4 }, pressed && { opacity: 0.6 }]}>
      <AppText variant="label" style={{ color }}>{label}</AppText>
    </Pressable>
  );
}
