import { Camera, GeoJSONSource, Layer, Map, type CameraRef } from "@maplibre/maplibre-react-native";
import { useEffect, useMemo, useRef } from "react";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { useSettingsStore } from "@/store/settingsStore";
import { colors, radius } from "@/theme";
import { circlePolygon, pointFeature, zoomForAccuracy } from "./geo";
import { MapControls } from "./MapControls";
import { mapStyleUrl } from "./mapStyles";

/** Map of one captured point with its GPS accuracy circle (MapLibre + OSM tiles). */
export function LocationMap({
  latitude,
  longitude,
  accuracy,
  style,
  interactive = true,
  controls = true,
}: {
  latitude: number;
  longitude: number;
  accuracy?: number | null;
  style?: StyleProp<ViewStyle>;
  interactive?: boolean;
  controls?: boolean;
}) {
  const camera = useRef<CameraRef>(null);
  const zoomRef = useRef(zoomForAccuracy(accuracy));
  const mapStyle = useSettingsStore((s) => s.mapStyle);
  const zoom = zoomForAccuracy(accuracy);

  const accuracyShape = useMemo(
    () => (accuracy ? circlePolygon(latitude, longitude, accuracy) : null),
    [latitude, longitude, accuracy],
  );
  const point = useMemo(() => pointFeature(latitude, longitude), [latitude, longitude]);

  // Follow new fixes while the GPS is improving.
  useEffect(() => {
    camera.current?.easeTo({ center: [longitude, latitude], zoom, duration: 400 });
  }, [latitude, longitude, zoom]);

  return (
    <View style={[styles.wrap, style]} accessibilityLabel="Map showing the captured field location">
      <Map
        style={StyleSheet.absoluteFill}
        mapStyle={mapStyleUrl(mapStyle)}
        dragPan={interactive}
        touchZoom={interactive}
        doubleTapZoom={interactive}
        touchRotate={false}
        touchPitch={false}
        logo={false}
        compass={false}
        attribution
        onRegionDidChange={(e) => {
          zoomRef.current = e.nativeEvent.zoom;
        }}
      >
        <Camera ref={camera} initialViewState={{ center: [longitude, latitude], zoom }} />
        {accuracyShape ? (
          <GeoJSONSource id="accuracy" data={accuracyShape}>
            <Layer id="accuracy-fill" type="fill" paint={{ "fill-color": colors.primary, "fill-opacity": 0.18 }} />
            <Layer id="accuracy-line" type="line" paint={{ "line-color": colors.primary, "line-width": 1.5, "line-opacity": 0.8 }} />
          </GeoJSONSource>
        ) : null}
        <GeoJSONSource id="position" data={point}>
          <Layer id="position-halo" type="circle" paint={{ "circle-radius": 11, "circle-color": colors.white }} />
          <Layer id="position-dot" type="circle" paint={{ "circle-radius": 7, "circle-color": colors.info }} />
        </GeoJSONSource>
      </Map>
      {controls && interactive ? (
        <View style={styles.controls}>
          <MapControls
            onZoomIn={() => camera.current?.zoomTo(Math.min(20, zoomRef.current + 1), { duration: 250 })}
            onZoomOut={() => camera.current?.zoomTo(Math.max(2, zoomRef.current - 1), { duration: 250 })}
            onRecenter={() => camera.current?.flyTo({ center: [longitude, latitude], zoom, duration: 400 })}
          />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { borderRadius: radius.lg, overflow: "hidden", backgroundColor: "#E4EAE2" },
  controls: { position: "absolute", right: 10, bottom: 28 },
});
