import * as Location from "expo-location";
import { Linking, Platform } from "react-native";
import { appConfig } from "@/config/env";
import type { CapturedLocation } from "@/types/survey";

export type PermissionState = "granted" | "undetermined" | "denied" | "blocked";

export type LocationErrorKind = "permission_denied" | "permission_blocked" | "services_disabled" | "timeout" | "unavailable";

export class LocationError extends Error {
  constructor(public kind: LocationErrorKind, message: string) {
    super(message);
    this.name = "LocationError";
  }
}

export const LOCATION_MESSAGES: Record<LocationErrorKind, string> = {
  permission_denied: "Location permission is needed to record where the field is.",
  permission_blocked: "Location access is turned off for Field Survey. Enable it in Settings to capture the field location.",
  services_disabled: "GPS is turned off. Turn on Location in your phone settings and try again.",
  timeout: "We couldn't get an accurate location. Please move to an open area and try again.",
  unavailable: "Location is unavailable right now. Please try again.",
};

export type AccuracyQuality = "good" | "fair" | "poor" | "unusable";

export function accuracyQuality(accuracy: number): AccuracyQuality {
  if (accuracy <= appConfig.gpsGoodAccuracy) return "good";
  if (accuracy <= appConfig.gpsAcceptableAccuracy) return "fair";
  if (accuracy <= appConfig.gpsMaxAccuracy) return "poor";
  return "unusable";
}

function toPermissionState(res: Location.LocationPermissionResponse): PermissionState {
  if (res.granted) return "granted";
  if (res.status === Location.PermissionStatus.UNDETERMINED) return "undetermined";
  return res.canAskAgain ? "denied" : "blocked";
}

export const LocationService = {
  async getPermission(): Promise<PermissionState> {
    return toPermissionState(await Location.getForegroundPermissionsAsync());
  },

  /** Never re-prompts after a permanent denial (the OS would ignore it anyway). */
  async requestPermission(): Promise<PermissionState> {
    const current = await LocationService.getPermission();
    if (current === "granted" || current === "blocked") return current;
    return toPermissionState(await Location.requestForegroundPermissionsAsync());
  },

  openSettings() {
    return Linking.openSettings();
  },

  async ensureServicesEnabled(): Promise<boolean> {
    if (await Location.hasServicesEnabledAsync()) return true;
    if (Platform.OS === "android") {
      try {
        // Shows the system "Turn on location" dialog.
        await Location.enableNetworkProviderAsync();
        return await Location.hasServicesEnabledAsync();
      } catch {
        return false;
      }
    }
    return false;
  },

  /**
   * Watch GPS for up to `timeoutMs`, keeping the most accurate fix, and stop
   * early once it's good enough. Rejects with LocationError on failure.
   */
  async captureBestFix(
    options: { timeoutMs?: number; targetAccuracy?: number; onProgress?: (fix: CapturedLocation) => void } = {},
  ): Promise<CapturedLocation> {
    const permission = await LocationService.requestPermission();
    if (permission === "blocked") throw new LocationError("permission_blocked", LOCATION_MESSAGES.permission_blocked);
    if (permission !== "granted") throw new LocationError("permission_denied", LOCATION_MESSAGES.permission_denied);
    if (!(await LocationService.ensureServicesEnabled())) {
      throw new LocationError("services_disabled", LOCATION_MESSAGES.services_disabled);
    }

    const timeoutMs = options.timeoutMs ?? appConfig.gpsTimeoutMs;
    const target = options.targetAccuracy ?? appConfig.gpsGoodAccuracy;

    return new Promise<CapturedLocation>((resolve, reject) => {
      let best: CapturedLocation | null = null;
      let settled = false;
      let subscription: Location.LocationSubscription | null = null;

      const finish = (error?: LocationError) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        subscription?.remove();
        if (best && !error) resolve(best);
        else if (best && error?.kind === "timeout") resolve(best);
        else reject(error ?? new LocationError("timeout", LOCATION_MESSAGES.timeout));
      };

      const timer = setTimeout(() => finish(new LocationError("timeout", LOCATION_MESSAGES.timeout)), timeoutMs);

      Location.watchPositionAsync(
        { accuracy: Location.Accuracy.BestForNavigation, timeInterval: 1000, distanceInterval: 0 },
        (pos) => {
          const accuracy = pos.coords.accuracy ?? Number.POSITIVE_INFINITY;
          if (!best || accuracy < best.accuracy) {
            best = {
              latitude: Number(pos.coords.latitude.toFixed(7)),
              longitude: Number(pos.coords.longitude.toFixed(7)),
              accuracy: Math.round(accuracy * 10) / 10,
              capturedAt: new Date(pos.timestamp).toISOString(),
            };
            options.onProgress?.(best);
          }
          if (accuracy <= target) finish();
        },
        () => finish(new LocationError("unavailable", LOCATION_MESSAGES.unavailable)),
      )
        .then((sub) => {
          if (settled) sub.remove();
          else subscription = sub;
        })
        .catch(() => finish(new LocationError("unavailable", LOCATION_MESSAGES.unavailable)));
    });
  },

  /** Quick, low-accuracy position for centring maps. */
  async getApproximatePosition(): Promise<{ latitude: number; longitude: number } | null> {
    try {
      if ((await LocationService.getPermission()) !== "granted") return null;
      const last = await Location.getLastKnownPositionAsync({ maxAge: 10 * 60_000 });
      if (last) return { latitude: last.coords.latitude, longitude: last.coords.longitude };
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      return { latitude: pos.coords.latitude, longitude: pos.coords.longitude };
    } catch {
      return null;
    }
  },
};
