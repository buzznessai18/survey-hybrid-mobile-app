import { Text, type TextProps } from "react-native";
import { type as typography } from "@/theme";

type Variant = keyof typeof typography;

export function AppText({ variant = "body", style, ...rest }: TextProps & { variant?: Variant }) {
  return <Text maxFontSizeMultiplier={1.4} {...rest} style={[typography[variant], style]} />;
}
