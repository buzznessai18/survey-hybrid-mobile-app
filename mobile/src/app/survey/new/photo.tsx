import { Ionicons } from "@expo/vector-icons";
import { CameraView, useCameraPermissions, type CameraType } from "expo-camera";
import { Image } from "expo-image";
import * as ImagePicker from "expo-image-picker";
import { router } from "expo-router";
import { useRef, useState } from "react";
import { ActivityIndicator, Linking, Pressable, StyleSheet, View } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppButton } from "@/components/ui/AppButton";
import { AppText } from "@/components/ui/AppText";
import { IconButton } from "@/components/ui/IconButton";
import { useTopInset } from "@/components/ui/Screen";
import { PhotoService } from "@/services/storage/PhotoService";
import { useDraftStore } from "@/store/draftStore";
import { useQueueStore } from "@/store/queueStore";
import { SkipButton } from "@/components/survey/SkipButton";
import { colors, fonts, radius } from "@/theme";
import type { CapturedPhoto } from "@/types/survey";

export default function PhotoStep() {
  const top = useTopInset();
  const insets = useSafeAreaInsets();
  const draft = useDraftStore((s) => s.draft);
  const setPhoto = useDraftStore((s) => s.setPhoto);
  const [permission, requestPermission] = useCameraPermissions();
  const [facing, setFacing] = useState<CameraType>("back");
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<CapturedPhoto | null>(draft?.photo ?? null);
  const camera = useRef<CameraView>(null);

  const surveyId = draft?.id ?? "draft";

  const process = async (source: { uri: string; width: number; height: number }) => {
    setBusy(true);
    setError(null);
    try {
      const stored = await PhotoService.processAndStore(source, surveyId);
      // Replace (and clean up) an unsubmitted earlier capture.
      if (preview && preview.uri !== draft?.photo?.uri) PhotoService.delete(preview.uri);
      setPreview(stored);
    } catch {
      setError("We couldn't process the photo. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const takePhoto = async () => {
    if (!camera.current || !ready || busy) return;
    try {
      setBusy(true);
      const pic = await camera.current.takePictureAsync({ quality: 0.9, exif: false });
      await process(pic);
    } catch {
      setBusy(false);
      setError("The camera couldn't take a photo. Please try again.");
    }
  };

  const pickFromGallery = async () => {
    const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 1, allowsEditing: false });
    if (!res.canceled && res.assets[0]) {
      const a = res.assets[0];
      await process({ uri: a.uri, width: a.width, height: a.height });
    }
  };

  const retake = () => {
    if (preview && preview.uri !== draft?.photo?.uri) PhotoService.delete(preview.uri);
    setPreview(null);
  };

  const usePhoto = () => {
    if (!preview) return;
    const old = draft?.photo?.uri;
    if (old && old !== preview.uri && !Object.values(useQueueStore.getState().items).some((i) => i.photoLocalUri === old)) {
      PhotoService.delete(old);
    }
    setPhoto(preview);
    router.push("/survey/new/details");
  };

  const skip = () => {
    const old = draft?.photo?.uri;
    if (preview && preview.uri !== old) PhotoService.delete(preview.uri);
    if (old && !Object.values(useQueueStore.getState().items).some((i) => i.photoLocalUri === old)) PhotoService.delete(old);
    setPhoto(null);
    router.push("/survey/new/details");
  };

  const header = (
    <View style={[styles.header, { paddingTop: top + 4 }]}>
      <IconButton icon="chevron-back" label="Go back" color={colors.white} onPress={() => router.back()} />
      <AppText style={styles.headerTitle} accessibilityRole="header">
        Take Field Photograph
      </AppText>
      <View style={{ minWidth: 44, alignItems: "flex-end" }}>
        <SkipButton onPress={skip} color={colors.white} />
      </View>
    </View>
  );

  // Preview after capture
  if (preview) {
    return (
      <View style={styles.root}>
        {header}
        <Animated.View entering={FadeIn} style={styles.previewWrap}>
          <Image source={{ uri: preview.uri }} style={styles.preview} contentFit="cover" accessibilityLabel="Captured field photograph" />
        </Animated.View>
        <AppText style={styles.hint}>Make sure the field is clearly visible</AppText>
        <View style={[styles.previewActions, { paddingBottom: insets.bottom + 16 }]}>
          <AppButton title="Retake" icon="camera-reverse-outline" variant="secondary" onPress={retake} style={{ flex: 1 }} />
          <AppButton title="Use Photo" icon="checkmark" onPress={usePhoto} style={{ flex: 1.4 }} />
        </View>
      </View>
    );
  }

  // Permission states
  if (!permission) {
    return (
      <View style={[styles.root, styles.center]}>
        <ActivityIndicator color={colors.white} />
      </View>
    );
  }
  if (!permission.granted) {
    const blocked = !permission.canAskAgain;
    return (
      <View style={styles.root}>
        {header}
        <View style={[styles.center, { flex: 1, padding: 28 }]}>
          <View style={styles.permIcon}>
            <Ionicons name="camera-outline" size={34} color={colors.white} />
          </View>
          <AppText style={styles.permTitle}>Camera access needed</AppText>
          <AppText style={styles.permText}>
            {blocked
              ? "Camera access is turned off for Field Survey. Enable it in Settings to photograph the field, or choose a photo from your gallery."
              : "Field Survey uses the camera to photograph the surveyed field."}
          </AppText>
          <AppButton
            title={blocked ? "Open Settings" : "Allow Camera"}
            icon={blocked ? "settings-outline" : "camera"}
            onPress={() => (blocked ? Linking.openSettings() : requestPermission())}
            style={{ alignSelf: "stretch", marginTop: 24 }}
          />
          <AppButton title="Choose from Gallery" icon="images-outline" variant="ghost" onPress={pickFromGallery} style={{ alignSelf: "stretch", marginTop: 10 }} />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      {header}
      <View style={styles.cameraWrap}>
        <CameraView
          ref={camera}
          style={StyleSheet.absoluteFill}
          facing={facing}
          mode="picture"
          onCameraReady={() => setReady(true)}
          onMountError={() => setError("The camera couldn't start. Close other camera apps and try again.")}
          accessibilityLabel="Camera preview"
        />
        {busy ? (
          <View style={[StyleSheet.absoluteFill, styles.center, { backgroundColor: "rgba(0,0,0,0.35)" }]}>
            <ActivityIndicator color={colors.white} size="large" />
            <AppText style={{ color: colors.white, marginTop: 10 }}>Processing photo…</AppText>
          </View>
        ) : null}
      </View>
      <AppText style={styles.hint}>{error ?? "Make sure the field is clearly visible"}</AppText>
      <View style={[styles.controls, { paddingBottom: insets.bottom + 20 }]}>
        <IconButton icon="images-outline" label="Choose from gallery" variant="dark" size={24} onPress={pickFromGallery} style={styles.sideBtn} />
        <Pressable
          onPress={takePhoto}
          disabled={!ready || busy}
          accessibilityRole="button"
          accessibilityLabel="Take photo"
          style={({ pressed }) => [styles.shutter, pressed && { transform: [{ scale: 0.94 }] }, (!ready || busy) && { opacity: 0.5 }]}
        >
          <View style={styles.shutterInner} />
        </Pressable>
        <IconButton
          icon="camera-reverse-outline"
          label="Switch camera"
          variant="dark"
          size={24}
          onPress={() => setFacing((f) => (f === "back" ? "front" : "back"))}
          style={styles.sideBtn}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#0B0F0C" },
  center: { alignItems: "center", justifyContent: "center" },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 8, paddingBottom: 8 },
  headerTitle: { flex: 1, textAlign: "center", color: colors.white, fontFamily: fonts.semibold, fontSize: 17 },
  cameraWrap: { flex: 1, marginHorizontal: 12, borderRadius: radius.lg, overflow: "hidden", backgroundColor: "#111" },
  previewWrap: { flex: 1, marginHorizontal: 12, borderRadius: radius.lg, overflow: "hidden" },
  preview: { flex: 1 },
  hint: { color: "#D9E2DB", textAlign: "center", fontFamily: fonts.medium, fontSize: 14, marginVertical: 14 },
  controls: { flexDirection: "row", alignItems: "center", justifyContent: "space-around", paddingHorizontal: 24 },
  sideBtn: { width: 52, height: 52, borderRadius: 26 },
  shutter: {
    width: 78,
    height: 78,
    borderRadius: 39,
    borderWidth: 4,
    borderColor: colors.white,
    alignItems: "center",
    justifyContent: "center",
  },
  shutterInner: { width: 62, height: 62, borderRadius: 31, backgroundColor: colors.white },
  previewActions: { flexDirection: "row", gap: 12, paddingHorizontal: 16 },
  permIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: "rgba(255,255,255,0.12)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  permTitle: { color: colors.white, fontFamily: fonts.bold, fontSize: 20 },
  permText: { color: "#C9D3CC", textAlign: "center", marginTop: 8, fontFamily: fonts.regular, fontSize: 15, lineHeight: 21 },
});
