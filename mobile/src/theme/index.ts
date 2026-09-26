import { Platform, type TextStyle, type ViewStyle } from "react-native";

export const colors = {
  primary: "#168A4A",
  primaryDark: "#0F6335",
  primarySoft: "#E7F4EC",
  primaryBorder: "#BFE3CC",
  background: "#F7F8F5",
  card: "#FFFFFF",
  text: "#17201A",
  textSecondary: "#3E4840",
  muted: "#6B746D",
  placeholder: "#98A09A",
  border: "#E3E7E1",
  borderStrong: "#CBD2CA",
  success: "#1E9B59",
  successSoft: "#E6F5EC",
  warning: "#D98B18",
  warningSoft: "#FDF3E3",
  error: "#D64545",
  errorSoft: "#FCEBEB",
  info: "#2F6FDE",
  infoSoft: "#EAF1FD",
  overlay: "rgba(12, 20, 14, 0.45)",
  white: "#FFFFFF",
  black: "#000000",
} as const;

export const spacing = { xxs: 2, xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24, xxxl: 32 } as const;

export const radius = { sm: 8, md: 12, lg: 16, xl: 20, pill: 999 } as const;

export const fonts = {
  regular: "Inter_400Regular",
  medium: "Inter_500Medium",
  semibold: "Inter_600SemiBold",
  bold: "Inter_700Bold",
} as const;

export const type = {
  display: { fontFamily: fonts.bold, fontSize: 26, lineHeight: 32, color: colors.text },
  title: { fontFamily: fonts.bold, fontSize: 20, lineHeight: 26, color: colors.text },
  heading: { fontFamily: fonts.semibold, fontSize: 17, lineHeight: 22, color: colors.text },
  body: { fontFamily: fonts.regular, fontSize: 15, lineHeight: 21, color: colors.text },
  bodyStrong: { fontFamily: fonts.semibold, fontSize: 15, lineHeight: 21, color: colors.text },
  label: { fontFamily: fonts.medium, fontSize: 14, lineHeight: 19, color: colors.textSecondary },
  caption: { fontFamily: fonts.regular, fontSize: 13, lineHeight: 18, color: colors.muted },
  small: { fontFamily: fonts.medium, fontSize: 12, lineHeight: 16, color: colors.muted },
} satisfies Record<string, TextStyle>;

export const shadow = {
  card: Platform.select<ViewStyle>({
    ios: { shadowColor: "#0F2416", shadowOpacity: 0.06, shadowRadius: 10, shadowOffset: { width: 0, height: 3 } },
    default: { elevation: 1.5 },
  }),
  raised: Platform.select<ViewStyle>({
    ios: { shadowColor: "#0F2416", shadowOpacity: 0.14, shadowRadius: 16, shadowOffset: { width: 0, height: 6 } },
    default: { elevation: 6 },
  }),
};

/** Minimum touch target (outdoor use, gloves, sunlight). */
export const TOUCH = 52;
