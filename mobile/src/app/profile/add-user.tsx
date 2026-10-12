import { zodResolver } from "@hookform/resolvers/zod";
import { router } from "expo-router";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { View } from "react-native";
import { AppButton } from "@/components/ui/AppButton";
import { RadioOption } from "@/components/forms/RadioOption";
import { AppInput } from "@/components/ui/AppInput";
import { AppText } from "@/components/ui/AppText";
import { Screen } from "@/components/ui/Screen";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { UserService } from "@/services/admin/UserService";
import { errorMessage } from "@/services/api/errors";
import { colors, radius } from "@/theme";
import { toE164 } from "@/utils/mobile";
import { newUserSchema, type NewUserValues } from "@/utils/validation";

/** Admin-only: create a company user or admin (public sign-up is closed). */
export default function AddUser() {
  const [saveError, setSaveError] = useState<string | null>(null);
  const { control, handleSubmit, formState } = useForm<NewUserValues>({
    resolver: zodResolver(newUserSchema),
    defaultValues: { fullName: "", role: "user", mobile: "", email: "", password: "" },
  });

  const onSave = handleSubmit(async (v) => {
    setSaveError(null);
    try {
      await UserService.create({
        full_name: v.fullName.trim(),
        role: v.role,
        email: v.email.trim() ? v.email.trim().toLowerCase() : undefined,
        phone: v.mobile.trim() ? toE164(v.mobile) : undefined,
        password: v.password,
      });
      router.back();
    } catch (e) {
      setSaveError(errorMessage(e));
    }
  });

  return (
    <Screen
      header={<ScreenHeader title="Add User" />}
      footer={<AppButton title="Create Account" icon="person-add-outline" loading={formState.isSubmitting} loadingTitle="Creating…" onPress={onSave} />}
    >
      {saveError ? (
        <View style={{ backgroundColor: colors.errorSoft, padding: 12, borderRadius: radius.md, marginBottom: 14 }} accessibilityRole="alert">
          <AppText variant="label" style={{ color: colors.error }}>
            {saveError}
          </AppText>
        </View>
      ) : null}

      <Controller
        control={control}
        name="role"
        render={({ field }) => (
          <View accessibilityRole="radiogroup" style={{ marginBottom: 8 }}>
            <AppText variant="label" style={{ marginBottom: 8 }}>Account type</AppText>
            <RadioOption label="Regular user — adds, searches and views records, prints receipts" selected={field.value === "user"} onPress={() => field.onChange("user")} />
            <RadioOption label="Admin — everything, plus deleting records, users, reports & audit history" selected={field.value === "admin"} onPress={() => field.onChange("admin")} />
          </View>
        )}
      />
      <Controller
        control={control}
        name="fullName"
        render={({ field, fieldState }) => (
          <AppInput label="Full name" required autoCapitalize="words" value={field.value} onChangeText={field.onChange} onBlur={field.onBlur} error={fieldState.error?.message} maxLength={150} />
        )}
      />
      <Controller
        control={control}
        name="mobile"
        render={({ field, fieldState }) => (
          <AppInput
            label="Mobile number"
            icon="call-outline"
            keyboardType="phone-pad"
            placeholder="10-digit mobile (used to sign in)"
            value={field.value}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
            error={fieldState.error?.message}
            maxLength={16}
          />
        )}
      />
      <Controller
        control={control}
        name="email"
        render={({ field, fieldState }) => (
          <AppInput
            label="Email (optional)"
            icon="mail-outline"
            keyboardType="email-address"
            autoCapitalize="none"
            value={field.value}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
            error={fieldState.error?.message}
            maxLength={120}
          />
        )}
      />
      <Controller
        control={control}
        name="password"
        render={({ field, fieldState }) => (
          <AppInput
            label="Password"
            required
            icon="lock-closed-outline"
            secureTextEntry
            autoCapitalize="none"
            hint="Share it with the person securely. They sign in with their mobile number (or email) and this password."
            value={field.value}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
            error={fieldState.error?.message}
          />
        )}
      />
    </Screen>
  );
}
