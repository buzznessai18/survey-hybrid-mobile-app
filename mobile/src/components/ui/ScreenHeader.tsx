import { router } from "expo-router";
import type { ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { colors } from "@/theme";
import { AppText } from "./AppText";
import { IconButton } from "./IconButton";

export function ScreenHeader({
  title,
  onBack,
  right,
  showBack = true,
  backIcon = "chevron-back",
}: {
  title: string;
  onBack?: () => void;
  right?: ReactNode;
  showBack?: boolean;
  backIcon?: "chevron-back" | "close";
}) {
  return (
    <View style={styles.row}>
      <View style={styles.side}>
        {showBack ? (
          <IconButton
            icon={backIcon}
            label={backIcon === "close" ? "Close" : "Go back"}
            onPress={onBack ?? (() => (router.canGoBack() ? router.back() : router.replace("/")))}
          />
        ) : null}
      </View>
      <AppText variant="heading" style={styles.title} numberOfLines={1} accessibilityRole="header">
        {title}
      </AppText>
      <View style={[styles.side, { alignItems: "flex-end" }]}>{right}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    height: 56,
    paddingHorizontal: 8,
    backgroundColor: colors.background,
  },
  side: { width: 56 },
  title: { flex: 1, textAlign: "center" },
});
