import { zodResolver } from "@hookform/resolvers/zod";
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { Alert, View } from "react-native";
import { RadioOption } from "@/components/forms/RadioOption";
import { AppButton } from "@/components/ui/AppButton";
import { AppCard } from "@/components/ui/AppCard";
import { AppInput } from "@/components/ui/AppInput";
import { AppText } from "@/components/ui/AppText";
import { Screen } from "@/components/ui/Screen";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { ErrorState, LoadingState } from "@/components/ui/States";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { useRemote } from "@/features/common/useRemote";
import { UserService } from "@/services/admin/UserService";
import { errorMessage, toApiError } from "@/services/api/errors";
import { useAuthStore } from "@/store/authStore";
import { colors, radius } from "@/theme";
import type { ManagedUserDetail } from "@/types/api";
import { formatDateTime } from "@/utils/date";
import { normalizeMobile, toE164 } from "@/utils/mobile";
import { editUserSchema, type EditUserValues } from "@/utils/validation";

/** Admin-only: view and edit a user (name, role, sign-in mobile / email, password), deactivate or delete. */
export default function EditUserScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const user = useRemote(() => UserService.get(id), id);

  if (!user.data) {
    return (
      <Screen header={<ScreenHeader title="Edit User" />} scroll={false}>
        {user.error ? (
          <ErrorState offline={user.error.offline} message={user.error.notFound ? "This user no longer exists." : user.error.message} onRetry={user.error.notFound ? undefined : () => void user.reload()} />
        ) : (
          <LoadingState label="Loading user…" />
        )}
      </Screen>
    );
  }
  return <EditUserForm key={user.data.updated_at} user={user.data} onChanged={user.reload} />;
}

function EditUserForm({ user, onChanged }: { user: ManagedUserDetail; onChanged: () => Promise<void> }) {
  const me = useAuthStore((s) => s.profile?.id);
  const isMe = user.id === me;
  const [saveError, setSaveError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"status" | "delete" | null>(null);
  const originalMobile = user.phone ? normalizeMobile(user.phone) : user.mobile ? normalizeMobile(user.mobile) : "";
  const originalEmail = user.email ?? "";

  const { control, handleSubmit, formState, setError } = useForm<EditUserValues>({
    resolver: zodResolver(editUserSchema),
    defaultValues: {
      fullName: user.full_name,
      role: user.role === "admin" ? "admin" : "user",
      mobile: originalMobile,
      email: originalEmail,
      password: "",
    },
  });

  const onSave = handleSubmit(async (v) => {
    setSaveError(null);
    // Sign-in details can be replaced but not removed.
    if (originalMobile && !v.mobile.trim()) return setError("mobile", { message: "Enter a new number to replace it (it can't be removed)" });
    if (originalEmail && !v.email.trim()) return setError("email", { message: "Enter a new email to replace it (it can't be removed)" });

    const changes: Parameters<typeof UserService.update>[0] = { user_id: user.id };
    if (v.fullName.trim() !== user.full_name) changes.full_name = v.fullName.trim();
    if (!isMe && v.role !== (user.role === "admin" ? "admin" : "user")) changes.role = v.role;
    if (v.mobile.trim() && normalizeMobile(v.mobile) !== originalMobile) changes.phone = toE164(v.mobile);
    const email = v.email.trim().toLowerCase();
    if (email && email !== originalEmail) changes.email = email;
    if (v.password) changes.password = v.password;
    if (Object.keys(changes).length === 1) return router.back();

    try {
      await UserService.update(changes);
      Alert.alert("Saved", v.password ? `${v.fullName.trim()} must use the new password from now on.` : `${v.fullName.trim()} has been updated.`);
      router.back();
    } catch (e) {
      const err = toApiError(e);
      if (err.fields?.email) setError("email", { message: err.fields.email });
      if (err.fields?.phone) setError("mobile", { message: err.fields.phone });
      setSaveError(errorMessage(e));
    }
  });

  const setStatus = async (status: "active" | "inactive") => {
    setBusy("status");
    try {
      await UserService.update({ user_id: user.id, status });
      await onChanged();
    } catch (e) {
      Alert.alert("Couldn't update user", errorMessage(e));
    } finally {
      setBusy(null);
    }
  };

  const confirmDeactivate = () =>
    Alert.alert("Deactivate account?", `${user.full_name} will be signed out and can't sign in until reactivated. Their records stay.`, [
      { text: "Cancel", style: "cancel" },
      { text: "Deactivate", style: "destructive", onPress: () => void setStatus("inactive") },
    ]);

  const confirmDelete = () => {
    if (!user.can_delete) {
      Alert.alert(
        "Can't delete this user",
        `${user.full_name} entered ${recordsText(user)}. Those records must keep who entered them, so the account can only be deactivated.`,
        user.status === "active"
          ? [{ text: "Cancel", style: "cancel" }, { text: "Deactivate", style: "destructive", onPress: () => void setStatus("inactive") }]
          : [{ text: "OK" }],
      );
      return;
    }
    Alert.alert("Delete user permanently?", `${user.full_name}'s account will be removed and they won't be able to sign in. This can't be undone.`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          setBusy("delete");
          try {
            await UserService.remove(user.id);
            router.back();
          } catch (e) {
            Alert.alert("Couldn't delete user", errorMessage(e));
            setBusy(null);
          }
        },
      },
    ]);
  };

  const active = user.status === "active";
  return (
    <Screen
      header={<ScreenHeader title="Edit User" />}
      footer={<AppButton title="Save Changes" icon="checkmark" loading={formState.isSubmitting} loadingTitle="Saving…" disabled={!!busy} onPress={onSave} />}
    >
      <AppCard style={{ gap: 6, marginBottom: 16 }}>
        <View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap" }}>
          <StatusBadge label={user.role === "admin" ? "Admin" : "Regular user"} tone={user.role === "admin" ? "primary" : "info"} />
          <StatusBadge label={active ? "Active" : user.status === "pending" ? "Pending" : "Inactive"} tone={active ? "success" : "neutral"} />
          {isMe ? <StatusBadge label="You" tone="neutral" /> : null}
        </View>
        <AppText variant="caption">
          {recordsText(user) ? `Entered ${recordsText(user)}` : "Hasn't entered any records"}
        </AppText>
        <AppText variant="caption">{user.last_sign_in_at ? `Last signed in ${formatDateTime(user.last_sign_in_at)}` : "Has never signed in"}</AppText>
      </AppCard>

      {saveError ? (
        <View style={{ backgroundColor: colors.errorSoft, padding: 12, borderRadius: radius.md, marginBottom: 14 }} accessibilityRole="alert">
          <AppText variant="label" style={{ color: colors.error }}>{saveError}</AppText>
        </View>
      ) : null}

      {isMe ? (
        <AppText variant="caption" style={{ marginBottom: 12 }}>You can&apos;t change your own role or deactivate yourself.</AppText>
      ) : (
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
      )}
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
            label="New password"
            icon="lock-closed-outline"
            secureTextEntry
            autoCapitalize="none"
            placeholder="Leave empty to keep the current one"
            hint="Share it with the person securely. Their old password stops working."
            value={field.value}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
            error={fieldState.error?.message}
          />
        )}
      />

      {isMe ? null : (
        <View style={{ gap: 10, marginTop: 8 }}>
          <AppText variant="heading">Account</AppText>
          {active ? (
            <AppButton title="Deactivate user" icon="pause-circle-outline" variant="secondary" loading={busy === "status"} disabled={!!busy} onPress={confirmDeactivate} />
          ) : (
            <AppButton title="Reactivate user" icon="play-circle-outline" variant="secondary" loading={busy === "status"} disabled={!!busy} onPress={() => void setStatus("active")} />
          )}
          <AppButton title="Delete user" icon="trash-outline" variant="dangerSoft" loading={busy === "delete"} disabled={!!busy} onPress={confirmDelete} />
          {!user.can_delete ? (
            <AppText variant="small">Users who entered records can&apos;t be deleted, only deactivated.</AppText>
          ) : null}
        </View>
      )}
    </Screen>
  );
}

function recordsText(u: ManagedUserDetail) {
  const parts = [];
  if (u.records.service_records) parts.push(`${u.records.service_records} record${u.records.service_records === 1 ? "" : "s"}`);
  if (u.records.forms) parts.push(`${u.records.forms} 1/14 form${u.records.forms === 1 ? "" : "s"}`);
  if (u.records.surveys) parts.push(`${u.records.surveys} field survey${u.records.surveys === 1 ? "" : "s"}`);
  return parts.join(" and ");
}
