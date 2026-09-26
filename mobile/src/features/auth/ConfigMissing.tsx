import { StyleSheet, View } from "react-native";
import { AppText } from "@/components/ui/AppText";
import { colors } from "@/theme";

/** Shown when EXPO_PUBLIC_SUPABASE_URL / _ANON_KEY are not set. */
export function ConfigMissing() {
  return (
    <View style={styles.root}>
      <AppText variant="title">Configuration needed</AppText>
      <AppText variant="body" style={{ textAlign: "center", marginTop: 8 }}>
        Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY in mobile/.env, then restart Expo with
        {" "}npx expo start --clear.
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32, backgroundColor: colors.background },
});
