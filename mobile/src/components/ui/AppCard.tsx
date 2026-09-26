import { View, StyleSheet, type ViewProps } from "react-native";
import { colors, radius, shadow } from "@/theme";

export function AppCard({ style, padded = true, ...rest }: ViewProps & { padded?: boolean }) {
  return <View {...rest} style={[styles.card, padded && styles.padded, style]} />;
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    ...shadow.card,
  },
  padded: { padding: 16 },
});
