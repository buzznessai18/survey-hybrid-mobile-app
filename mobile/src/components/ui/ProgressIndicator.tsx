import { Ionicons } from "@expo/vector-icons";
import { StyleSheet, View } from "react-native";
import { colors, fonts } from "@/theme";
import { AppText } from "./AppText";

const STEPS = ["Details", "Location", "Photo", "Review"] as const;

/** 1 Details — 2 Location — 3 Photo — 4 Review */
export function ProgressIndicator({ current }: { current: 1 | 2 | 3 | 4 }) {
  return (
    <View
      style={styles.row}
      accessibilityRole="progressbar"
      accessibilityLabel={`Step ${current} of 4: ${STEPS[current - 1]}`}
      accessibilityValue={{ min: 1, max: 4, now: current }}
    >
      {STEPS.map((label, i) => {
        const step = i + 1;
        const done = step < current;
        const active = step === current;
        return (
          <View key={label} style={styles.step}>
            <View style={styles.track}>
              <View style={[styles.line, { opacity: i === 0 ? 0 : 1 }, (done || active) && styles.lineActive]} />
              <View style={[styles.circle, done && styles.circleDone, active && styles.circleActive]}>
                {done ? (
                  <Ionicons name="checkmark" size={14} color={colors.white} />
                ) : (
                  <AppText style={[styles.num, active && { color: colors.white }]}>{step}</AppText>
                )}
              </View>
              <View style={[styles.line, { opacity: i === STEPS.length - 1 ? 0 : 1 }, done && styles.lineActive]} />
            </View>
            <AppText style={[styles.label, (active || done) && { color: colors.primary, fontFamily: fonts.semibold }]}>
              {label}
            </AppText>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", paddingVertical: 6 },
  step: { flex: 1, alignItems: "center" },
  track: { flexDirection: "row", alignItems: "center", alignSelf: "stretch" },
  line: { flex: 1, height: 2, backgroundColor: colors.border },
  lineActive: { backgroundColor: colors.primary },
  circle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: colors.borderStrong,
    backgroundColor: colors.card,
    alignItems: "center",
    justifyContent: "center",
  },
  circleActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  circleDone: { backgroundColor: colors.primary, borderColor: colors.primary },
  num: { fontFamily: fonts.semibold, fontSize: 13, color: colors.muted },
  label: { fontFamily: fonts.medium, fontSize: 12, color: colors.muted, marginTop: 6 },
});
