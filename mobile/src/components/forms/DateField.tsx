import { Ionicons } from "@expo/vector-icons";
import DateTimePicker, { type DateTimePickerEvent } from "@react-native-community/datetimepicker";
import { useState } from "react";
import { Platform, Pressable, View } from "react-native";
import { AppButton } from "@/components/ui/AppButton";
import { AppText } from "@/components/ui/AppText";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { FieldLabel, fieldStyles } from "@/components/ui/AppInput";
import { colors, fonts } from "@/theme";
import { formatShortDate, fromIsoDate, toIsoDate } from "@/utils/date";

export function DateField({
  label,
  required,
  value,
  onChange,
  error,
  maximumDate,
  minimumDate,
}: {
  label: string;
  required?: boolean;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  maximumDate?: Date;
  minimumDate?: Date;
}) {
  const [open, setOpen] = useState(false);
  const [iosValue, setIosValue] = useState<Date>(value ? fromIsoDate(value) : new Date());
  const date = value ? fromIsoDate(value) : new Date();

  const onAndroidChange = (event: DateTimePickerEvent, selected?: Date) => {
    setOpen(false);
    if (event.type === "set" && selected) onChange(toIsoDate(selected));
  };

  return (
    <View style={{ marginBottom: 16 }}>
      <FieldLabel label={label} required={required} />
      <Pressable
        onPress={() => {
          setIosValue(date);
          setOpen(true);
        }}
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${value ? formatShortDate(value) : "not set"}`}
        accessibilityHint="Opens a date picker"
        style={[fieldStyles.field, error && { borderColor: colors.error }]}
      >
        <AppText style={{ flex: 1, fontFamily: fonts.medium, fontSize: 16 }}>
          {value ? formatShortDate(value) : "Select date"}
        </AppText>
        <Ionicons name="calendar-outline" size={20} color={colors.muted} />
      </Pressable>
      {error ? (
        <AppText variant="small" style={{ color: colors.error, marginTop: 6 }}>
          {error}
        </AppText>
      ) : null}

      {open && Platform.OS === "android" ? (
        <DateTimePicker
          value={date}
          mode="date"
          onChange={onAndroidChange}
          maximumDate={maximumDate}
          minimumDate={minimumDate}
        />
      ) : null}

      {Platform.OS === "ios" ? (
        <BottomSheet visible={open} onClose={() => setOpen(false)} accessibilityLabel={label}>
          <AppText variant="title">{label}</AppText>
          <DateTimePicker
            value={iosValue}
            mode="date"
            display="inline"
            accentColor={colors.primary}
            onChange={(_, d) => d && setIosValue(d)}
            maximumDate={maximumDate}
            minimumDate={minimumDate}
          />
          <AppButton
            title="Done"
            onPress={() => {
              onChange(toIsoDate(iosValue));
              setOpen(false);
            }}
          />
        </BottomSheet>
      ) : null}
    </View>
  );
}
