import type { ConfigContext, ExpoConfig } from "expo/config";

// Only EXPO_PUBLIC_* values are embedded in the JS bundle. Never put the
// Supabase service_role key (or any other secret) in this project.
// Maps use MapLibre + OpenStreetMap tiles: no Google Maps API key required.

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: "Field Survey",
  slug: "field-survey",
  scheme: "fieldsurvey",
  version: "1.5.0",
  orientation: "portrait",
  icon: "./assets/icon.png",
  userInterfaceStyle: "light",
  ios: {
    supportsTablet: false,
    bundleIdentifier: "com.sjinnovation.fieldsurvey",
    infoPlist: {
      NSLocationWhenInUseUsageDescription:
        "Field Survey records the GPS location of each field you survey so duplicates can be detected.",
    },
  },
  android: {
    package: "com.sjinnovation.fieldsurvey",
    adaptiveIcon: {
      backgroundColor: "#F7F8F5",
      foregroundImage: "./assets/android-icon-foreground.png",
      backgroundImage: "./assets/android-icon-background.png",
      monochromeImage: "./assets/android-icon-monochrome.png",
    },
    permissions: [
      "android.permission.CAMERA",
      "android.permission.ACCESS_FINE_LOCATION",
      "android.permission.ACCESS_COARSE_LOCATION",
    ],
    blockedPermissions: ["android.permission.RECORD_AUDIO"],
    predictiveBackGestureEnabled: false,
  },
  plugins: [
    "expo-router",
    "expo-status-bar",
    "expo-image",
    "@react-native-community/datetimepicker",
    "expo-font",
    [
      "expo-splash-screen",
      { backgroundColor: "#F7F8F5", image: "./assets/icon.png", imageWidth: 160 },
    ],
    [
      "expo-camera",
      {
        cameraPermission: "Allow Field Survey to use the camera to photograph the surveyed field.",
        recordAudioAndroid: false,
      },
    ],
    [
      "expo-location",
      {
        locationWhenInUsePermission:
          "Field Survey records the GPS location of each field you survey so duplicates can be detected.",
      },
    ],
    [
      "expo-image-picker",
      {
        photosPermission: "Allow Field Survey to pick a field photograph from your gallery.",
        cameraPermission: "Allow Field Survey to use the camera to photograph the surveyed field.",
      },
    ],
    "@maplibre/maplibre-react-native",
    "expo-dev-client",
  ],
  experiments: { typedRoutes: true },
  owner: "afshanakd",
  extra: { eas: { projectId: "b31cd6c6-7159-4cd9-90bf-7fffbc9f64ed" } },
});
