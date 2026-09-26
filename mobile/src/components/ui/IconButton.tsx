import { Ionicons } from "@expo/vector-icons";
import type { ComponentProps } from "react";
import { Pressable, StyleSheet, type StyleProp, type ViewStyle } from "react-native";
import { colors, shadow } from "@/theme";

interface Props {
  icon: ComponentProps<typeof Ionicons>["name"];
  onPress: () => void;
  label: string;
  size?: number;
  color?: string;
  variant?: "plain" | "floating" | "dark";
  style?: StyleProp<ViewStyle>;
  disabled?: boolean;
}

export function IconButton({ icon, onPress, label, size = 22, color, variant = "plain", style, disabled }: Props) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      disabled={disabled}
      hitSlop={8}
      style={({ pressed }) => [
        styles.base,
        variant === "floating" && [styles.floating, shadow.raised],
        variant === "dark" && styles.dark,
        pressed && { opacity: 0.7 },
        disabled && { opacity: 0.4 },
        style,
      ]}
    >
      <Ionicons name={icon} size={size} color={color ?? (variant === "dark" ? colors.white : colors.text)} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { width: 44, height: 44, borderRadius: 22, alignItems: "center", justifyContent: "center" },
  floating: { width: 48, height: 48, borderRadius: 24, backgroundColor: colors.card },
  dark: { backgroundColor: "rgba(0,0,0,0.45)" },
});
