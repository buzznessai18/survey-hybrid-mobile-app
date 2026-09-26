import { Pressable, StyleSheet, View } from "react-native";
import { colors, fonts } from "@/theme";
import { initials } from "@/utils/format";
import { AppText } from "./AppText";

/** Initials avatar (the backend has no profile photos). */
export function Avatar({ name, size = 48, onPress, light }: { name?: string | null; size?: number; onPress?: () => void; light?: boolean }) {
  const content = (
    <View
      style={[
        styles.circle,
        { width: size, height: size, borderRadius: size / 2 },
        light && { backgroundColor: "rgba(255,255,255,0.18)", borderColor: "rgba(255,255,255,0.5)" },
      ]}
    >
      <AppText style={[styles.text, { fontSize: size * 0.36 }, light && { color: colors.white }]}>{initials(name)}</AppText>
    </View>
  );
  if (!onPress) return content;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel="Open profile" hitSlop={6}>
      {content}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  circle: {
    backgroundColor: colors.primarySoft,
    borderWidth: 2,
    borderColor: colors.primaryBorder,
    alignItems: "center",
    justifyContent: "center",
  },
  text: { fontFamily: fonts.bold, color: colors.primaryDark },
});
