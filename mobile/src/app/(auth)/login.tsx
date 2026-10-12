import { zodResolver } from "@hookform/resolvers/zod";
import { useRef, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, TextInput, View } from "react-native";
import Animated, { FadeIn, FadeInDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { AppButton } from "@/components/ui/AppButton";
import { AppInput } from "@/components/ui/AppInput";
import { AppText } from "@/components/ui/AppText";
import { FieldIllustration, LeafLogo } from "@/components/ui/Brand";
import { AuthError } from "@/services/auth/AuthService";
import { useAuthStore } from "@/store/authStore";
import { useNetworkStore } from "@/store/networkStore";
import { colors, fonts, radius, shadow } from "@/theme";
import { loginSchema, type LoginValues } from "@/utils/validation";

type Method = LoginValues["method"];


export default function LoginScreen() {
  const insets = useSafeAreaInsets();
  const signIn = useAuthStore((s) => s.signIn);
  const notice = useAuthStore((s) => s.notice);
  const clearNotice = useAuthStore((s) => s.clearNotice);
  const isOnline = useNetworkStore((s) => s.isOnline);
  const [method, setMethod] = useState<Method>("phone");

  const [showPassword, setShowPassword] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const passwordRef = useRef<TextInput>(null);

  const { control, handleSubmit, formState, setValue, clearErrors } = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    // Company users and admins share one sign-in; the account's role decides the app.
    defaultValues: { method: "phone", identifier: "", password: "" },
  });

  const selectMethod = (m: Method, keepMessage = false) => {
    setMethod(m);
    setValue("method", m);
    setValue("identifier", "");
    clearErrors();
    if (!keepMessage) setFormError(null);
  };

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    clearNotice();
    if (!isOnline) {
      setFormError("No internet connection. Connect to the internet to sign in.");
      return;
    }
    try {
      await signIn(values);
    } catch (e) {
      setFormError(e instanceof AuthError ? e.message : "We couldn't sign you in. Please try again.");
      if (e instanceof AuthError && e.kind === "phone_login_disabled") selectMethod("email", true);
    }
  });

  const message = formError ?? notice;

  return (
    <View style={styles.root}>
      <FieldIllustration height={400} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView
          contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 48, paddingBottom: insets.bottom + 24 }]}
          keyboardShouldPersistTaps="handled"
        >
          <Animated.View entering={FadeIn.duration(500)} style={styles.brand}>
            <LeafLogo size={68} />
            <AppText style={styles.title} accessibilityRole="header">
              FIELD SURVEY
            </AppText>
            <AppText style={styles.tagline}>Collect. Verify. Map.</AppText>
          </Animated.View>

          <Animated.View entering={FadeInDown.duration(450).delay(120)} style={[styles.card, shadow.raised]}>
            <View style={styles.titleRow}>
              <View style={styles.portalIcon}>
                <Ionicons name="person-circle-outline" size={24} color={colors.primary} />
              </View>
              <View style={{ flex: 1 }}>
                <AppText variant="title">Sign in</AppText>
                <AppText variant="caption">For company staff and administrators.</AppText>
              </View>
            </View>

            <View style={styles.tabs} accessibilityRole="tablist">
              {(["phone", "email"] as const).map((m) => (
                <Pressable
                  key={m}
                  onPress={() => selectMethod(m)}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: method === m }}
                  style={[styles.tab, method === m && styles.tabActive]}
                >
                  <AppText style={[styles.tabText, method === m && styles.tabTextActive]}>
                    {m === "phone" ? "Mobile Number" : "Email"}
                  </AppText>
                </Pressable>
              ))}
            </View>

            <Controller
              control={control}
              name="identifier"
              render={({ field, fieldState }) => (
                <AppInput
                  label={method === "phone" ? "Mobile Number" : "Email"}
                  icon={method === "phone" ? "call-outline" : "mail-outline"}
                  placeholder={method === "phone" ? "Enter mobile number" : "name@example.com"}
                  keyboardType={method === "phone" ? "phone-pad" : "email-address"}
                  autoCapitalize="none"
                  autoComplete={method === "phone" ? "tel" : "email"}
                  textContentType={method === "phone" ? "telephoneNumber" : "username"}
                  returnKeyType="next"
                  onSubmitEditing={() => passwordRef.current?.focus()}
                  value={field.value}
                  onChangeText={field.onChange}
                  onBlur={field.onBlur}
                  error={fieldState.error?.message}
                  maxLength={method === "phone" ? 16 : 120}
                />
              )}
            />
            <Controller
              control={control}
              name="password"
              render={({ field, fieldState }) => (
                <AppInput
                  ref={passwordRef}
                  label="Password"
                  icon="lock-closed-outline"
                  placeholder="Enter password"
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                  autoComplete="password"
                  textContentType="password"
                  returnKeyType="go"
                  onSubmitEditing={onSubmit}
                  value={field.value}
                  onChangeText={field.onChange}
                  onBlur={field.onBlur}
                  error={fieldState.error?.message}
                  right={
                    <Pressable
                      onPress={() => setShowPassword((v) => !v)}
                      hitSlop={10}
                      accessibilityRole="button"
                      accessibilityLabel={showPassword ? "Hide password" : "Show password"}
                    >
                      <Ionicons name={showPassword ? "eye-off-outline" : "eye-outline"} size={20} color={colors.muted} />
                    </Pressable>
                  }
                />
              )}
            />

            {message ? (
              <Animated.View entering={FadeIn} style={styles.error} accessibilityRole="alert" accessibilityLiveRegion="assertive">
                <Ionicons name={isOnline ? "alert-circle" : "cloud-offline"} size={18} color={colors.error} />
                <AppText variant="label" style={{ color: colors.error, flex: 1 }}>
                  {message}
                </AppText>
              </Animated.View>
            ) : null}

            <AppButton
              title="Continue"
              loadingTitle="Signing in…"
              loading={formState.isSubmitting}
              onPress={onSubmit}
              style={{ marginTop: 4 }}
            />

            <AppText variant="small" style={styles.help}>
              Accounts are created by your administrator. Forgot your password? Ask an admin to reset it.
            </AppText>
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.background },
  scroll: { flexGrow: 1, paddingHorizontal: 20 },
  brand: { alignItems: "center", marginBottom: 40 },
  title: { fontFamily: fonts.bold, fontSize: 30, letterSpacing: 2, color: colors.white, marginTop: 12 },
  tagline: { fontFamily: fonts.medium, fontSize: 15, color: "#D6F0DF", marginTop: 4, letterSpacing: 0.5 },
  card: { backgroundColor: colors.card, borderRadius: radius.xl, padding: 20 },
  tabs: { flexDirection: "row", backgroundColor: colors.background, borderRadius: radius.md, padding: 4, marginBottom: 18 },
  tab: { flex: 1, minHeight: 42, alignItems: "center", justifyContent: "center", borderRadius: 10 },
  tabActive: { backgroundColor: colors.card, ...shadow.card },
  tabText: { fontFamily: fonts.medium, fontSize: 14, color: colors.muted },
  tabTextActive: { color: colors.primary, fontFamily: fonts.semibold },
  error: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: colors.errorSoft,
    borderRadius: radius.md,
    padding: 12,
    marginBottom: 14,
  },
  help: { textAlign: "center", marginTop: 16 },
  titleRow: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 16 },
  portalIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.primarySoft,
    marginBottom: 4,
  },
});
