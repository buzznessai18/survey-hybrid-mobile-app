import { StyleSheet, View } from "react-native";
import Svg, { Circle, Defs, G, LinearGradient, Path, Rect, Stop } from "react-native-svg";

/** Leaf mark used on the login screen. */
export function LeafLogo({ size = 64, color = "#FFFFFF" }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 64 64" accessibilityLabel="Field Survey logo">
      <Path d="M32 6c9 8 13 17 13 25 0 8-5.5 14-13 14S19 39 19 31c0-8 4-17 13-25z" fill={color} />
      <Path d="M32 44c6-8 15-11 24-10-2 11-10 18-21 18h-3v-8z" fill={color} opacity={0.92} />
      <Path d="M32 44c-6-8-15-11-24-10 2 11 10 18 21 18h3v-8z" fill={color} opacity={0.92} />
      <Rect x={30.5} y={20} width={3} height={38} rx={1.5} fill="#168A4A" opacity={0.55} />
    </Svg>
  );
}

/** Stylised agricultural landscape: sky, hills and crop rows. */
export function FieldIllustration({ height = 360 }: { height?: number }) {
  return (
    <View style={[StyleSheet.absoluteFill, { height }]} pointerEvents="none">
      <Svg width="100%" height="100%" viewBox="0 0 400 360" preserveAspectRatio="xMidYMid slice">
        <Defs>
          <LinearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#0B4A28" />
            <Stop offset="0.55" stopColor="#15703D" />
            <Stop offset="1" stopColor="#2E9A55" />
          </LinearGradient>
          <LinearGradient id="field" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor="#3FAA5F" />
            <Stop offset="1" stopColor="#1C7A3E" />
          </LinearGradient>
        </Defs>
        <Rect width="400" height="360" fill="url(#sky)" />
        <Circle cx="318" cy="84" r="34" fill="#F4E7A1" opacity={0.22} />
        <Circle cx="318" cy="84" r="20" fill="#F7EDB6" opacity={0.35} />
        <Path d="M0 210 C 60 160, 120 170, 180 196 S 300 150, 400 188 L400 360 L0 360Z" fill="#0F5E33" opacity={0.85} />
        <Path d="M0 236 C 80 206, 150 214, 220 232 S 340 212, 400 226 L400 360 L0 360Z" fill="#177A42" />
        <Path d="M0 262 C 100 244, 240 246, 400 258 L400 360 L0 360Z" fill="url(#field)" />
        <G stroke="#9CD8AE" strokeOpacity={0.35} strokeWidth={2}>
          <Path d="M200 262 L 40 360" />
          <Path d="M200 262 L 110 360" />
          <Path d="M200 262 L 180 360" />
          <Path d="M200 262 L 250 360" />
          <Path d="M200 262 L 320 360" />
          <Path d="M200 262 L 390 360" />
        </G>
        <G fill="#0C4F2A" opacity={0.9}>
          <Circle cx="62" cy="214" r="10" />
          <Rect x="60.5" y="220" width="3" height="14" />
          <Circle cx="352" cy="206" r="12" />
          <Rect x="350.5" y="214" width="3" height="16" />
        </G>
      </Svg>
    </View>
  );
}
