import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useEffect, useRef, useState } from "react";
import { Alert, StyleSheet, View } from "react-native";
import Animated, { FadeIn, FadeInDown } from "react-native-reanimated";
import { AppButton } from "@/components/ui/AppButton";
import { SkipButton } from "@/components/survey/SkipButton";
import { AppCard } from "@/components/ui/AppCard";
import { AppText } from "@/components/ui/AppText";
import { ProgressIndicator } from "@/components/ui/ProgressIndicator";
import { Screen } from "@/components/ui/Screen";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { StatusBadge, type BadgeTone } from "@/components/ui/StatusBadge";
import { LocationMap } from "@/components/map/LocationMap";
import { appConfig } from "@/config/env";
import {
  accuracyQuality,
  LocationError,
  LocationService,
  type AccuracyQuality,
  type LocationErrorKind,
} from "@/services/location/LocationService";
import { useDraftStore } from "@/store/draftStore";
import { useNetworkStore } from "@/store/networkStore";
import { colors, radius } from "@/theme";
import type { CapturedLocation } from "@/types/survey";
import { formatCoord } from "@/utils/format";

type State =
  | { kind: "idle" }
  | { kind: "capturing"; live: CapturedLocation | null }
  | { kind: "captured"; fix: CapturedLocation }
  | { kind: "error"; error: LocationErrorKind; message: string };

const QUALITY: Record<AccuracyQuality, { label: string; tone: BadgeTone }> = {
  good: { label: "Good accuracy", tone: "success" },
  fair: { label: "Fair accuracy", tone: "warning" },
  poor: { label: "Low accuracy", tone: "error" },
  unusable: { label: "Too inaccurate", tone: "error" },
};

export default function LocationStep() {
  const saved = useDraftStore((s) => s.draft?.location ?? null);
  const setLocation = useDraftStore((s) => s.setLocation);
  const isOnline = useNetworkStore((s) => s.isOnline);
  const [state, setState] = useState<State>(saved ? { kind: "captured", fix: saved } : { kind: "idle" });
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const capture = async () => {
    setState({ kind: "capturing", live: null });
    try {
      const fix = await LocationService.captureBestFix({
        onProgress: (live) => mounted.current && setState({ kind: "capturing", live }),
      });
      if (mounted.current) setState({ kind: "captured", fix });
    } catch (e) {
      if (!mounted.current) return;
      const err = e instanceof LocationError ? e : new LocationError("unavailable", "Location is unavailable right now.");
      setState({ kind: "error", error: err.kind, message: err.message });
    }
  };

  const fix = state.kind === "captured" ? state.fix : state.kind === "capturing" ? state.live : null;
  const quality = fix ? accuracyQuality(fix.accuracy) : null;

  const useLocation = () => {
    if (state.kind !== "captured") return;
    const accept = () => {
      setLocation(state.fix);
      router.push("/survey/new/photo");
    };
    if (quality === "poor") {
      Alert.alert(
        "Location accuracy is low",
        `Accuracy is ${Math.round(state.fix.accuracy)} m. Move to an open area and try again for a better fix, or use this location anyway.`,
        [
          { text: "Try again", onPress: capture },
          { text: "Use anyway", style: "destructive", onPress: accept },
        ],
      );
      return;
    }
    accept();
  };

  const canUse = state.kind === "captured" && quality !== "unusable";

  return (
    <Screen
      header={
        <>
          <ScreenHeader
            title="New 1/14 Form"
            right={
              <SkipButton
                onPress={() => {
                  // No GPS means no field survey, so photo and crop are not asked for.
                  setLocation(null);
                  router.push("/survey/new/review");
                }}
              />
            }
          />
          <View style={styles.progress}>
            <ProgressIndicator current={3} />
          </View>
        </>
      }
      footer={
        <View style={styles.footerRow}>
          <AppButton title="Back" variant="secondary" onPress={() => router.back()} style={{ flex: 1 }} />
          <AppButton
            title={state.kind === "captured" ? "Use This Location" : "Next"}
            icon={state.kind === "captured" ? "checkmark" : undefined}
            onPress={useLocation}
            disabled={!canUse}
            style={{ flex: 1.6 }}
          />
        </View>
      }
    >
      <AppCard style={styles.intro}>
        <View style={styles.introIcon}>
          <Ionicons name="location" size={22} color={colors.primary} />
        </View>
        <View style={{ flex: 1 }}>
          <AppText variant="heading">Capture Field Location</AppText>
          <AppText variant="caption">Stand at the field and capture your current location.</AppText>
        </View>
      </AppCard>

      <AppButton
        title={state.kind === "capturing" ? "Getting accurate location…" : state.kind === "captured" ? "Capture Again" : "Capture Location"}
        icon="navigate"
        variant={state.kind === "captured" ? "secondary" : "primary"}
        loading={state.kind === "capturing"}
        loadingTitle={
          state.kind === "capturing" && state.live
            ? `Improving accuracy… ${Math.round(state.live.accuracy)} m`
            : "Getting accurate location…"
        }
        onPress={capture}
        style={{ marginVertical: 16 }}
      />

      {state.kind === "error" ? <LocationErrorCard kind={state.error} message={state.message} onRetry={capture} /> : null}

      {fix ? (
        <Animated.View entering={FadeInDown.duration(300)}>
          <LocationMap latitude={fix.latitude} longitude={fix.longitude} accuracy={fix.accuracy} style={styles.map} />
          {!isOnline ? (
            <AppText variant="small" style={{ marginTop: 6 }}>
              Offline: map tiles may not load, but your GPS location is still recorded.
            </AppText>
          ) : null}
          <AppCard style={styles.stats}>
            <Stat label="Latitude" value={formatCoord(fix.latitude)} />
            <View style={styles.sep} />
            <Stat label="Longitude" value={formatCoord(fix.longitude)} />
            <View style={styles.sep} />
            <Stat label="Accuracy" value={`${Math.round(fix.accuracy)} m`} />
          </AppCard>
          {quality ? (
            <View style={{ marginTop: 10, flexDirection: "row", justifyContent: "center" }}>
              <StatusBadge size="md" label={QUALITY[quality].label} tone={QUALITY[quality].tone} icon="radio-outline" />
            </View>
          ) : null}
          {state.kind === "captured" && (quality === "poor" || quality === "unusable") ? (
            <Animated.View entering={FadeIn} style={styles.warning} accessibilityRole="alert">
              <Ionicons name="warning" size={18} color={colors.warning} />
              <AppText variant="label" style={{ flex: 1, color: "#8A5308" }}>
                {quality === "unusable"
                  ? `Accuracy is worse than ${appConfig.gpsMaxAccuracy} m and can't be used. Move to an open area and capture again.`
                  : "Location accuracy is low. Move to an open area and try again."}
              </AppText>
            </Animated.View>
          ) : null}
        </Animated.View>
      ) : state.kind === "idle" ? (
        <View style={styles.placeholder}>
          <Ionicons name="map-outline" size={40} color={colors.placeholder} />
          <AppText variant="caption" style={{ textAlign: "center", marginTop: 8 }}>
            Your position and GPS accuracy will appear here.
          </AppText>
        </View>
      ) : null}
    </Screen>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={{ flex: 1, alignItems: "center" }} accessible accessibilityLabel={`${label} ${value}`}>
      <AppText variant="small">{label}</AppText>
      <AppText variant="bodyStrong">{value}</AppText>
    </View>
  );
}

function LocationErrorCard({ kind, message, onRetry }: { kind: LocationErrorKind; message: string; onRetry: () => void }) {
  const blocked = kind === "permission_blocked";
  return (
    <Animated.View entering={FadeIn} style={styles.errorCard} accessibilityRole="alert">
      <View style={{ flexDirection: "row", gap: 10 }}>
        <Ionicons name={kind === "services_disabled" ? "navigate-circle-outline" : "alert-circle"} size={22} color={colors.error} />
        <AppText variant="label" style={{ flex: 1, color: colors.text }}>
          {message}
        </AppText>
      </View>
      <View style={{ flexDirection: "row", gap: 10, marginTop: 12 }}>
        {blocked ? (
          <AppButton title="Open Settings" icon="settings-outline" compact onPress={() => LocationService.openSettings()} style={{ flex: 1 }} />
        ) : null}
        <AppButton title="Try Again" icon="refresh" variant="secondary" compact onPress={onRetry} style={{ flex: 1 }} />
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  progress: { paddingHorizontal: 12, paddingBottom: 8 },
  footerRow: { flexDirection: "row", gap: 12 },
  intro: { flexDirection: "row", gap: 12, alignItems: "center", backgroundColor: colors.primarySoft, borderColor: colors.primaryBorder },
  introIcon: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.card, alignItems: "center", justifyContent: "center" },
  map: { height: 300 },
  stats: { flexDirection: "row", marginTop: 12, paddingVertical: 14 },
  sep: { width: StyleSheet.hairlineWidth, backgroundColor: colors.border },
  warning: {
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
    marginTop: 12,
    padding: 12,
    borderRadius: radius.md,
    backgroundColor: colors.warningSoft,
  },
  errorCard: { padding: 14, borderRadius: radius.md, backgroundColor: colors.errorSoft, marginBottom: 16 },
  placeholder: {
    height: 220,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderColor: colors.borderStrong,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
});
