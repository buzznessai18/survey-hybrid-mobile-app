import type { ReactNode } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNetworkStore } from "@/store/networkStore";
import { colors } from "@/theme";

/**
 * Top safe-area inset for screens. When the global offline strip is visible it
 * already occupies the status-bar area, so screens don't add it again.
 */
export function useTopInset(): number {
  const insets = useSafeAreaInsets();
  const offline = useNetworkStore((s) => s.known && !s.isOnline);
  return offline ? 0 : insets.top;
}

export function Screen({
  children,
  header,
  footer,
  scroll = true,
  style,
  contentStyle,
  refreshControl,
  bottomInset = true,
}: {
  children: ReactNode;
  header?: ReactNode;
  footer?: ReactNode;
  scroll?: boolean;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
  refreshControl?: React.ComponentProps<typeof ScrollView>["refreshControl"];
  bottomInset?: boolean;
}) {
  const top = useTopInset();
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.root, { paddingTop: top }, style]}>
      {header}
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        {scroll ? (
          <ScrollView
            contentContainerStyle={[styles.content, contentStyle]}
            keyboardShouldPersistTaps="handled"
            refreshControl={refreshControl}
            showsVerticalScrollIndicator={false}
          >
            {children}
          </ScrollView>
        ) : (
          <View style={[{ flex: 1 }, contentStyle]}>{children}</View>
        )}
        {footer ? (
          <View style={[styles.footer, { paddingBottom: (bottomInset ? insets.bottom : 0) + 12 }]}>{footer}</View>
        ) : null}
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  content: { padding: 16, paddingBottom: 32 },
  footer: {
    paddingHorizontal: 16,
    paddingTop: 12,
    backgroundColor: colors.background,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
});
