import { Ionicons } from "@expo/vector-icons";
import { forwardRef, useState, type ComponentProps, type ReactNode } from "react";
import { StyleSheet, TextInput, View, type TextInputProps } from "react-native";
import { colors, fonts, radius, TOUCH } from "@/theme";
import { AppText } from "./AppText";

export interface AppInputProps extends TextInputProps {
  label?: string;
  required?: boolean;
  error?: string;
  hint?: string;
  icon?: ComponentProps<typeof Ionicons>["name"];
  right?: ReactNode;
  prominent?: boolean;
}

export const AppInput = forwardRef<TextInput, AppInputProps>(function AppInput(
  { label, required, error, hint, icon, right, prominent, style, onFocus, onBlur, ...rest },
  ref,
) {
  const [focused, setFocused] = useState(false);
  const borderColor = error ? colors.error : focused ? colors.primary : colors.border;
  return (
    <View style={styles.wrap}>
      {label ? <FieldLabel label={label} required={required} /> : null}
      <View style={[styles.field, prominent && styles.prominent, { borderColor }, focused && styles.focused]}>
        {icon ? <Ionicons name={icon} size={20} color={focused ? colors.primary : colors.muted} /> : null}
        <TextInput
          ref={ref}
          placeholderTextColor={colors.placeholder}
          accessibilityLabel={label}
          accessibilityHint={error ?? hint}
          maxFontSizeMultiplier={1.4}
          {...rest}
          onFocus={(e) => {
            setFocused(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            onBlur?.(e);
          }}
          style={[styles.input, prominent && styles.prominentText, style]}
        />
        {right}
      </View>
      {error ? (
        <View style={styles.msgRow} accessibilityLiveRegion="polite">
          <Ionicons name="alert-circle" size={14} color={colors.error} />
          <AppText variant="small" style={{ color: colors.error, flex: 1 }}>
            {error}
          </AppText>
        </View>
      ) : hint ? (
        <AppText variant="small" style={styles.hint}>
          {hint}
        </AppText>
      ) : null}
    </View>
  );
});

export function FieldLabel({ label, required }: { label: string; required?: boolean }) {
  return (
    <AppText variant="label" style={styles.label}>
      {label}
      {required ? <AppText style={{ color: colors.error }}> *</AppText> : null}
    </AppText>
  );
}

export const fieldStyles = StyleSheet.create({
  field: {
    minHeight: TOUCH,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.card,
    paddingHorizontal: 14,
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
});

const styles = StyleSheet.create({
  wrap: { marginBottom: 16 },
  label: { marginBottom: 6 },
  field: fieldStyles.field,
  focused: { backgroundColor: "#FBFDFB" },
  prominent: { minHeight: 58 },
  input: { flex: 1, fontFamily: fonts.medium, fontSize: 16, color: colors.text, paddingVertical: 12 },
  prominentText: { fontFamily: fonts.semibold, fontSize: 19, letterSpacing: 0.5 },
  msgRow: { flexDirection: "row", alignItems: "center", gap: 4, marginTop: 6 },
  hint: { marginTop: 6 },
});
