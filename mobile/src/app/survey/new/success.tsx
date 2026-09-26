import { Ionicons } from "@expo/vector-icons";
import { router, useLocalSearchParams } from "expo-router";
import { useEffect } from "react";
import { BackHandler, StyleSheet, View } from "react-native";
import Animated, { FadeInDown, ZoomIn } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppButton } from "@/components/ui/AppButton";
import { AppText } from "@/components/ui/AppText";
import { IconButton } from "@/components/ui/IconButton";
import { useTopInset } from "@/components/ui/Screen";
import { startFresh } from "@/features/surveys/useStartSurvey";
import { colors, fonts } from "@/theme";

/** Screen 10 — submitted (or saved offline). */
export default function SuccessScreen() {
  const { id, code, replay, queued, message, duplicate } = useLocalSearchParams<{
    id: string;
    code?: string;
    replay?: string;
    queued?: string;
    message?: string;
    duplicate?: string;
  }>();
  const top = useTopInset();
  const insets = useSafeAreaInsets();
  const isQueued = queued === "1";

  const close = () => router.dismissTo("/");

  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      close();
      return true;
    });
    return () => sub.remove();
  }, []);

  return (
    <View style={[styles.root, { paddingTop: top + 8, paddingBottom: insets.bottom + 16 }]}>
      <View style={{ alignItems: "flex-end", paddingHorizontal: 8 }}>
        <IconButton icon="close" label="Close" onPress={close} />
      </View>
      <View style={styles.center}>
        <Animated.View entering={ZoomIn.springify().damping(12)} style={[styles.ring, isQueued && styles.ringQueued]}>
          <View style={[styles.circle, isQueued && { backgroundColor: colors.warning }]}>
            <Ionicons name={isQueued ? "cloud-upload" : "checkmark"} size={54} color={colors.white} />
          </View>
        </Animated.View>
        <Animated.View entering={FadeInDown.duration(350).delay(150)} style={{ alignItems: "center" }}>
          <AppText style={styles.title} accessibilityRole="header">
            {isQueued ? "Survey Saved Offline" : "Survey Submitted Successfully!"}
          </AppText>
          {isQueued ? (
            <AppText variant="body" style={styles.sub}>
              {message ?? "Your survey is saved on this device and will sync automatically when you're back online."}
            </AppText>
          ) : (
            <>
              <AppText variant="caption" style={{ marginTop: 18 }}>
                Survey ID
              </AppText>
              <AppText style={styles.code} selectable>
                {code || "—"}
              </AppText>
              {replay === "1" ? (
                <AppText variant="caption" style={styles.sub}>
                  This survey was already submitted. No duplicate record was created.
                </AppText>
              ) : null}
              {duplicate === "1" ? (
                <AppText variant="caption" style={styles.sub}>
                  Flagged as a possible duplicate for supervisor review.
                </AppText>
              ) : null}
            </>
          )}
        </Animated.View>
      </View>
      <Animated.View entering={FadeInDown.duration(350).delay(250)} style={styles.actions}>
        <AppButton
          title="Add Another Survey"
          icon="add"
          onPress={() => {
            startFresh();
            router.replace("/survey/new/details");
          }}
        />
        <AppButton
          title={isQueued ? "View Offline Data" : "View Survey"}
          variant="secondary"
          onPress={() =>
            isQueued ? router.replace("/profile/offline") : router.replace({ pathname: "/survey/[id]", params: { id } })
          }
        />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.card },
  center: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 28 },
  ring: {
    width: 136,
    height: 136,
    borderRadius: 68,
    backgroundColor: colors.primarySoft,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 28,
  },
  ringQueued: { backgroundColor: colors.warningSoft },
  circle: { width: 96, height: 96, borderRadius: 48, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" },
  title: { fontFamily: fonts.bold, fontSize: 24, lineHeight: 30, textAlign: "center", color: colors.text },
  sub: { textAlign: "center", marginTop: 10 },
  code: { fontFamily: fonts.bold, fontSize: 28, letterSpacing: 1, color: colors.text, marginTop: 2 },
  actions: { gap: 12, paddingHorizontal: 20 },
});
