import { Ionicons } from "@expo/vector-icons";
import { StyleSheet, View } from "react-native";
import { colors, fonts } from "@/theme";
import { AppText } from "./AppText";

/** Steps of the New 1/14 Form wizard. */
export const FORM_STEPS = ["Farmer", "Land", "Location", "Photo", "Crop", "Review"] as const;

/** Numbered stepper: 1 Farmer — 2 Land — … */
export function ProgressIndicator({ current, steps = FORM_STEPS }: { current: number; steps?: readonly string[] }) {
  const STEPS = steps;
  return (
    <View
      style={styles.row}
      accessibilityRole="progressbar"
      accessibilityLabel={`Step ${current} of ${STEPS.length}: ${STEPS[current - 1]}`}
      accessibilityValue={{ min: 1, max: STEPS.length, now: current }}
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
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 2,
    borderColor: colors.borderStrong,
    backgroundColor: colors.card,
    alignItems: "center",
    justifyContent: "center",
  },
  circleActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  circleDone: { backgroundColor: colors.primary, borderColor: colors.primary },
  num: { fontFamily: fonts.semibold, fontSize: 13, color: colors.muted },
  label: { fontFamily: fonts.medium, fontSize: 11, color: colors.muted, marginTop: 6 },
});
