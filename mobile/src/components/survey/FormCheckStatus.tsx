import { Ionicons } from "@expo/vector-icons";
import { ActivityIndicator, Pressable, StyleSheet, View } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";
import { AppText } from "@/components/ui/AppText";
import type { FormCheckState } from "@/features/surveys/useFormDuplicateCheck";
import { colors, radius } from "@/theme";
import { surveyNo } from "@/utils/labels";

/** Inline result of the 1/14 duplicate check under the survey-number fields. */
export function FormCheckStatus({ state, onPress }: { state: FormCheckState; onPress?: () => void }) {
  if (state.status === "idle") return null;
  if (state.status === "checking") {
    return (
      <View style={[styles.row, styles.neutral]}>
        <ActivityIndicator size="small" color={colors.muted} />
        <AppText variant="caption">Checking existing 1/14 records…</AppText>
      </View>
    );
  }
  if (state.status === "offline") {
    return (
      <View style={[styles.row, styles.neutral]}>
        <Ionicons name="cloud-offline-outline" size={18} color={colors.muted} />
        <AppText variant="caption" style={{ flex: 1 }}>Offline — duplicates will be checked by the server when the form syncs.</AppText>
      </View>
    );
  }
  if (state.status === "error") {
    return (
      <Pressable onPress={state.retry} style={[styles.row, styles.neutral]} accessibilityRole="button">
        <Ionicons name="refresh" size={18} color={colors.muted} />
        <AppText variant="caption">Couldn&apos;t check. Tap to retry.</AppText>
      </Pressable>
    );
  }
  if (state.status === "clear") {
    const other = state.result.forms.length;
    return (
      <Animated.View entering={FadeIn} style={[styles.row, styles.ok]}>
        <Ionicons name="checkmark-circle" size={18} color={colors.success} />
        <AppText variant="label" style={{ color: colors.primaryDark, flex: 1 }}>
          No 1/14 record for this survey number in this village{other ? ` (${other} in other villages)` : ""}
        </AppText>
      </Animated.View>
    );
  }
  const f = state.result.forms[0];
  const s = state.result.survey_check.matches.length;
  return (
    <Animated.View entering={FadeIn}>
      <Pressable onPress={onPress} style={[styles.row, styles.bad]} accessibilityRole="button" accessibilityLabel="Existing record found. Tap to view.">
        <Ionicons name="warning" size={18} color={colors.error} />
        <View style={{ flex: 1 }}>
          <AppText variant="label" style={{ color: colors.error }}>
            {f ? `${f.form_id} already exists for ${surveyNo(f.survey_number, f.sub_division)} in ${f.village}` : "A survey already exists for this number"}
          </AppText>
          <AppText variant="small">
            {f ? `Occupant: ${f.occupant_names}` : ""}
            {s ? `${f ? " • " : ""}${s} field survey${s === 1 ? "" : "s"}` : ""} • Tap to view
          </AppText>
        </View>
        <Ionicons name="chevron-forward" size={18} color={colors.muted} />
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 8, borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 10, marginTop: -6, marginBottom: 14 },
  neutral: { backgroundColor: "#EEF0EC" },
  ok: { backgroundColor: colors.successSoft },
  bad: { backgroundColor: colors.errorSoft },
});
