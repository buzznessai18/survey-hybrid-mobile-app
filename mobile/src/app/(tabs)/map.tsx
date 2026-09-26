import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";
import { Camera, GeoJSONSource, Layer, Map, UserLocation, type CameraRef } from "@maplibre/maplibre-react-native";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";
import { AppButton } from "@/components/ui/AppButton";
import { AppText } from "@/components/ui/AppText";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { useTopInset } from "@/components/ui/Screen";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { MapControls } from "@/components/map/MapControls";
import { mapStyleUrl } from "@/components/map/mapStyles";
import { useUserQueue } from "@/features/sync/hooks";
import { toApiError } from "@/services/api/errors";
import { LocationService } from "@/services/location/LocationService";
import { boundsToRequest, MapService, type Bounds } from "@/services/map/MapService";
import { SurveyService } from "@/services/surveys/SurveyService";
import { useNetworkStore } from "@/store/networkStore";
import { useSettingsStore } from "@/store/settingsStore";
import { colors, fonts, radius, shadow } from "@/theme";
import type { MapPoint, SurveyDetail } from "@/types/api";
import { formatArea, surveyNumberLabel } from "@/utils/format";
import { MARKER_COLORS, markerColor, queueStatusView, serverStatusView } from "@/utils/status";

/** Wide initial view (India) used only until the device location is known. */
const FALLBACK_CENTER: [number, number] = [78.9629, 20.5937];
const FALLBACK_ZOOM = 4;
const FALLBACK_BOUNDS: Bounds = [68, 6, 97.5, 36];
const FIELD_ZOOM = 14;

type Selected =
  | { kind: "server"; point: MapPoint }
  | { kind: "local"; id: string };

export default function SurveyMapScreen() {
  const top = useTopInset();
  const camera = useRef<CameraRef>(null);
  const bounds = useRef<Bounds>(FALLBACK_BOUNDS);
  const zoomLevel = useRef(FALLBACK_ZOOM);
  const reqId = useRef(0);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isOnline = useNetworkStore((s) => s.isOnline);
  const mapStyle = useSettingsStore((s) => s.mapStyle);
  const queue = useUserQueue();

  const [points, setPoints] = useState<MapPoint[]>([]);
  const pointsRef = useRef<MapPoint[]>([]);
  const [loading, setLoading] = useState(false);
  const [truncated, setTruncated] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loadedOnce, setLoadedOnce] = useState(false);
  const [selected, setSelected] = useState<Selected | null>(null);
  const [loadedDetail, setLoadedDetail] = useState<SurveyDetail | null>(null);
  const [locationGranted, setLocationGranted] = useState(false);

  const localPoints = useMemo(() => queue.filter((q) => q.status !== "synced"), [queue]);

  const load = useCallback(async (b: Bounds) => {
    if (!useNetworkStore.getState().isOnline) return;
    const id = ++reqId.current;
    setLoading(true);
    try {
      const res = await MapService.getSurveyMapData(boundsToRequest(b));
      if (id !== reqId.current) return;
      pointsRef.current = res.points;
      setPoints(res.points);
      setTruncated(res.truncated);
      setError(null);
      setLoadedOnce(true);
    } catch (e) {
      if (id !== reqId.current) return;
      const err = toApiError(e);
      setError(err.isConnectivity ? null : err.message);
    } finally {
      if (id === reqId.current) setLoading(false);
    }
  }, []);

  const scheduleLoad = useCallback(
    (b: Bounds, zoom: number) => {
      bounds.current = b;
      zoomLevel.current = zoom;
      if (debounce.current) clearTimeout(debounce.current);
      debounce.current = setTimeout(() => void load(b), 450);
    },
    [load],
  );

  const centerOnUser = useCallback(async () => {
    const permission = await LocationService.requestPermission();
    setLocationGranted(permission === "granted");
    if (permission === "blocked") {
      setError("Location access is off. Enable it in Settings to centre the map on you.");
      return;
    }
    const pos = await LocationService.getApproximatePosition();
    if (!pos) return;
    camera.current?.flyTo({ center: [pos.longitude, pos.latitude], zoom: FIELD_ZOOM, duration: 600 });
  }, []);

  // Initial centring: device location, else the latest local survey.
  useEffect(() => {
    (async () => {
      const granted = (await LocationService.getPermission()) === "granted";
      setLocationGranted(granted);
      const pos = granted ? await LocationService.getApproximatePosition() : null;
      const fallback = localPoints[0]?.location;
      const center = pos ?? (fallback ? { latitude: fallback.latitude, longitude: fallback.longitude } : null);
      if (center) camera.current?.jumpTo({ center: [center.longitude, center.latitude], zoom: FIELD_ZOOM });
      else void load(FALLBACK_BOUNDS);
    })();
    return () => {
      if (debounce.current) clearTimeout(debounce.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Reload the current area when connectivity returns.
  useEffect(() => {
    if (isOnline) void load(bounds.current);
  }, [isOnline, load]);

  // Lazy detail for the bottom sheet (area, photo) — one small request on tap.
  const selectedServerId = selected?.kind === "server" ? selected.point.id : null;
  const detail = loadedDetail && loadedDetail.id === selectedServerId ? loadedDetail : null;
  useEffect(() => {
    if (!selectedServerId || !isOnline) return;
    let cancelled = false;
    SurveyService.getSurvey(selectedServerId)
      .then((d) => !cancelled && setLoadedDetail(d))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [selectedServerId, isOnline]);

  const zoomBy = (delta: number) =>
    camera.current?.zoomTo(Math.min(20, Math.max(2, zoomLevel.current + delta)), { duration: 250 });

  const onPressFeature = useCallback((feature: GeoJSON.Feature | undefined) => {
    const props = feature?.properties as { id?: string; kind?: "server" | "local" } | null | undefined;
    if (!props?.id) return;
    if (props.kind === "local") {
      setSelected({ kind: "local", id: props.id });
      return;
    }
    const p = pointsRef.current.find((x) => x.id === props.id);
    if (p) setSelected({ kind: "server", point: p });
  }, []);

  // One GeoJSON source for all pins: rendered on the GPU, scales to thousands.
  const features = useMemo<GeoJSON.FeatureCollection>(
    () => ({
      type: "FeatureCollection",
      features: [
        ...points.map((p) => ({
          type: "Feature" as const,
          properties: { id: p.id, kind: "server", color: markerColor(p.duplicate_status) },
          geometry: { type: "Point" as const, coordinates: [p.longitude, p.latitude] },
        })),
        ...localPoints.map((q) => ({
          type: "Feature" as const,
          properties: { id: q.id, kind: "local", color: MARKER_COLORS.pending },
          geometry: { type: "Point" as const, coordinates: [q.location.longitude, q.location.latitude] },
        })),
      ],
    }),
    [points, localPoints],
  );

  const localSelected = selected?.kind === "local" ? localPoints.find((q) => q.id === selected.id) : undefined;

  let statusText: string | null = null;
  if (!isOnline) statusText = "Offline — map tiles and server surveys may not load";
  else if (loading) statusText = "Loading surveys…";
  else if (error) statusText = error;
  else if (truncated) statusText = `Showing ${points.length} surveys — zoom in to see all`;
  else if (loadedOnce && points.length === 0 && localPoints.length === 0) statusText = "No surveys in this area";

  return (
    <View style={styles.root}>
      <Map
        style={StyleSheet.absoluteFill}
        mapStyle={mapStyleUrl(mapStyle)}
        touchRotate={false}
        touchPitch={false}
        logo={false}
        attribution
        compass
        compassHiddenFacingNorth
        onRegionDidChange={(e) => scheduleLoad(e.nativeEvent.bounds as Bounds, e.nativeEvent.zoom)}
        accessibilityLabel="Map of your surveyed fields"
      >
        <Camera ref={camera} initialViewState={{ center: FALLBACK_CENTER, zoom: FALLBACK_ZOOM }} />
        {locationGranted ? <UserLocation accuracy /> : null}
        <GeoJSONSource
          id="surveys"
          data={features}
          hitbox={{ top: 12, right: 12, bottom: 12, left: 12 }}
          onPress={(e) => onPressFeature(e.nativeEvent.features[0])}
        >
          <Layer
            id="survey-points"
            type="circle"
            paint={{
              "circle-radius": ["interpolate", ["linear"], ["zoom"], 5, 5, 12, 8, 16, 11],
              "circle-color": ["get", "color"],
              "circle-stroke-color": "#FFFFFF",
              "circle-stroke-width": 3,
            }}
          />
        </GeoJSONSource>
      </Map>

      <View style={[styles.topBar, { paddingTop: top + 10 }]} pointerEvents="box-none">
        <View style={[styles.titleCard, shadow.raised]}>
          <AppText variant="heading" accessibilityRole="header">
            My Survey Map
          </AppText>
          <View style={styles.legend}>
            <Legend color={MARKER_COLORS.normal} label="Survey" />
            <Legend color={MARKER_COLORS.duplicate} label="Duplicate" />
            <Legend color={MARKER_COLORS.possible} label="Possible" />
            <Legend color={MARKER_COLORS.pending} label="Pending sync" />
          </View>
        </View>
        {statusText ? (
          <Animated.View entering={FadeIn} exiting={FadeOut} style={[styles.statusPill, shadow.card]} accessibilityLiveRegion="polite">
            {loading ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <Ionicons name={!isOnline ? "cloud-offline-outline" : "information-circle-outline"} size={16} color={colors.muted} />
            )}
            <AppText style={styles.statusText}>{statusText}</AppText>
          </Animated.View>
        ) : null}
      </View>

      <View style={styles.controls}>
        <MapControls
          onZoomIn={() => zoomBy(1)}
          onZoomOut={() => zoomBy(-1)}
          onRecenter={() => void centerOnUser()}
        />
      </View>

      <BottomSheet visible={!!selected} onClose={() => setSelected(null)} accessibilityLabel="Survey summary">
        {selected?.kind === "server" ? (
          <View style={{ gap: 6 }}>
            <View style={styles.sheetHeader}>
              <AppText variant="title">Survey {surveyNumberLabel(selected.point.survey_number, selected.point.sub_division)}</AppText>
              <StatusBadge {...serverStatusView({ duplicate_status: selected.point.duplicate_status, submission_status: detail?.submission_status ?? "pending" })} />
            </View>
            <AppText variant="bodyStrong">{selected.point.farmer_name ?? "—"}</AppText>
            <AppText variant="caption">
              {[selected.point.crop, detail ? formatArea(detail.area, detail.area_unit) : null].filter(Boolean).join(" • ")}
            </AppText>
            <AppText variant="small">{selected.point.survey_id}</AppText>
            <AppButton
              title="View Survey"
              icon="document-text-outline"
              style={{ marginTop: 12 }}
              onPress={() => {
                const id = selected.point.id;
                setSelected(null);
                router.push({ pathname: "/survey/[id]", params: { id } });
              }}
            />
          </View>
        ) : localSelected ? (
          <View style={{ gap: 6 }}>
            <View style={styles.sheetHeader}>
              <AppText variant="title">
                Survey {surveyNumberLabel(localSelected.details.surveyNumber, localSelected.details.subDivision || null)}
              </AppText>
              <StatusBadge {...queueStatusView(localSelected.status)} />
            </View>
            <AppText variant="bodyStrong">{localSelected.details.farmerName}</AppText>
            <AppText variant="caption">
              {[localSelected.cropName, formatArea(localSelected.details.area, localSelected.details.areaUnit)].filter(Boolean).join(" • ")}
            </AppText>
            <AppButton
              title="View Survey"
              icon="document-text-outline"
              style={{ marginTop: 12 }}
              onPress={() => {
                const id = localSelected.id;
                setSelected(null);
                router.push({ pathname: "/survey/[id]", params: { id } });
              }}
            />
          </View>
        ) : null}
      </BottomSheet>
    </View>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <View style={styles.legendItem}>
      <View style={[styles.legendDot, { borderColor: color }]}>
        <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: color }} />
      </View>
      <AppText style={styles.legendText}>{label}</AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#DDE5DA" },
  topBar: { position: "absolute", left: 12, right: 12, top: 0, gap: 8 },
  titleCard: { backgroundColor: colors.card, borderRadius: radius.lg, paddingHorizontal: 14, paddingVertical: 10, gap: 6 },
  legend: { flexDirection: "row", flexWrap: "wrap", columnGap: 12, rowGap: 4 },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 5 },
  legendDot: { width: 12, height: 12, borderRadius: 6, borderWidth: 2, alignItems: "center", justifyContent: "center", backgroundColor: colors.white },
  legendText: { fontFamily: fonts.medium, fontSize: 12, color: colors.textSecondary },
  statusPill: {
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: colors.card,
    borderRadius: radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 7,
    maxWidth: "100%",
  },
  statusText: { fontFamily: fonts.medium, fontSize: 13, color: colors.textSecondary, flexShrink: 1 },
  controls: { position: "absolute", right: 12, bottom: 24 },
  sheetHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 },
});
