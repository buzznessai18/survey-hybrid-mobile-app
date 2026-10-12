import { Pressable, StyleSheet, View } from "react-native";
import { colors, fonts, radius, shadow } from "@/theme";
import { AppText } from "./AppText";

/** Compact segmented tabs (e.g. Forms | Surveys | Pending). */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <View style={styles.wrap} accessibilityRole="tablist">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Pressable
            key={o.value}
            onPress={() => onChange(o.value)}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            style={[styles.tab, active && styles.active]}
          >
            <AppText style={[styles.text, active && styles.textActive]} numberOfLines={1}>
              {o.label}
            </AppText>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: "row", backgroundColor: "#EAEDE8", borderRadius: radius.md, padding: 4 },
  tab: { flex: 1, minHeight: 40, alignItems: "center", justifyContent: "center", borderRadius: 10, paddingHorizontal: 6 },
  active: { backgroundColor: colors.card, ...shadow.card },
  text: { fontFamily: fonts.medium, fontSize: 13.5, color: colors.muted },
  textActive: { fontFamily: fonts.semibold, color: colors.primaryDark },
});
