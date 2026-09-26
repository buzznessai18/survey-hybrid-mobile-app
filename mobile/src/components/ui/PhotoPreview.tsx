import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { colors, radius } from "@/theme";

/** Rounded field photo with a graceful placeholder. */
export function PhotoPreview({
  uri,
  style,
  height = 190,
  label = "Field photograph",
}: {
  uri: string | null | undefined;
  style?: StyleProp<ViewStyle>;
  height?: number;
  label?: string;
}) {
  return (
    <View style={[styles.wrap, { height }, style]} accessibilityRole="image" accessibilityLabel={uri ? label : "No photo"}>
      {uri ? (
        <Image source={{ uri }} style={StyleSheet.absoluteFill} contentFit="cover" transition={200} />
      ) : (
        <Ionicons name="image-outline" size={34} color={colors.placeholder} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderRadius: radius.lg,
    overflow: "hidden",
    backgroundColor: "#E9EDE7",
    alignItems: "center",
    justifyContent: "center",
  },
});
