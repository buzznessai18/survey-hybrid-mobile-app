import { StyleSheet, View } from "react-native";
import { IconButton } from "@/components/ui/IconButton";
import { colors, radius, shadow } from "@/theme";

/** Vertical stack of zoom / recenter / layer buttons. */
export function MapControls({
  onZoomIn,
  onZoomOut,
  onRecenter,
  onToggleLayer,
  layerIsSatellite,
}: {
  onZoomIn?: () => void;
  onZoomOut?: () => void;
  onRecenter?: () => void;
  onToggleLayer?: () => void;
  layerIsSatellite?: boolean;
}) {
  return (
    <View style={styles.col}>
      {onToggleLayer ? (
        <View style={[styles.group, shadow.raised]}>
          <IconButton
            icon={layerIsSatellite ? "map-outline" : "earth"}
            label={layerIsSatellite ? "Show street map" : "Show satellite map"}
            onPress={onToggleLayer}
          />
        </View>
      ) : null}
      {onZoomIn && onZoomOut ? (
        <View style={[styles.group, shadow.raised]}>
          <IconButton icon="add" label="Zoom in" onPress={onZoomIn} />
          <View style={styles.sep} />
          <IconButton icon="remove" label="Zoom out" onPress={onZoomOut} />
        </View>
      ) : null}
      {onRecenter ? (
        <View style={[styles.group, shadow.raised]}>
          <IconButton icon="locate" label="Recenter on my location" onPress={onRecenter} color={colors.primary} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  col: { gap: 10 },
  group: { backgroundColor: colors.card, borderRadius: radius.md, padding: 2 },
  sep: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginHorizontal: 8 },
});
