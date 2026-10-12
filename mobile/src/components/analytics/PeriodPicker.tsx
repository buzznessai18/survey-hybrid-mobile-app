import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, View } from "react-native";
import { DateField } from "@/components/forms/DateField";
import { AppText } from "@/components/ui/AppText";
import { Segmented } from "@/components/ui/Segmented";
import { colors, TOUCH } from "@/theme";
import { formatShortDate, fromIsoDate, toIsoDate } from "@/utils/date";
import { getPeriod, periodDays, type Period, type PeriodMode } from "@/utils/period";

export const MAX_RANGE_DAYS = 366;

/** What the admin picked: week / month (stepped back with `offset`) or a custom range. */
export interface PeriodSelection {
  mode: PeriodMode;
  offset: number;
  custom: { from: string; to: string };
}

export function defaultSelection(mode: PeriodMode = "week"): PeriodSelection {
  const today = new Date();
  const monthStart = toIsoDate(new Date(today.getFullYear(), today.getMonth(), 1));
  return { mode, offset: 0, custom: { from: monthStart, to: toIsoDate(today) } };
}

export const selectionPeriod = (s: PeriodSelection): Period => getPeriod(s.mode, s.offset, s.custom);

/** Custom-range problem to show instead of loading, or null when the range is usable. */
export function rangeError(s: PeriodSelection): string | null {
  if (s.mode !== "custom") return null;
  if (s.custom.from > s.custom.to) return "Start date must be on or before the end date.";
  if (periodDays(s.custom) > MAX_RANGE_DAYS) return `Choose a range of at most ${MAX_RANGE_DAYS} days.`;
  return null;
}

/** Week | Month | Custom, with ‹ › to step through past weeks and months. */
export function PeriodPicker({ value, onChange }: { value: PeriodSelection; onChange: (v: PeriodSelection) => void }) {
  const period = selectionPeriod(value);
  const step = (d: number) => onChange({ ...value, offset: value.offset + d });
  const today = new Date();

  return (
    <View style={{ gap: 10 }}>
      <Segmented
        value={value.mode}
        onChange={(mode) => onChange({ ...value, mode, offset: 0 })}
        options={[
          { value: "week", label: "Weekly" },
          { value: "month", label: "Monthly" },
          { value: "custom", label: "Custom" },
        ]}
      />
      {value.mode === "custom" ? (
        <View style={styles.customRow}>
          <View style={{ flex: 1 }}>
            <DateField label="From" value={value.custom.from} maximumDate={today} onChange={(from) => onChange({ ...value, custom: { ...value.custom, from } })} />
          </View>
          <View style={{ flex: 1 }}>
            <DateField
              label="To"
              value={value.custom.to}
              maximumDate={today}
              minimumDate={fromIsoDate(value.custom.from)}
              onChange={(to) => onChange({ ...value, custom: { ...value.custom, to } })}
            />
          </View>
        </View>
      ) : (
        <View style={styles.stepper}>
          <StepButton icon="chevron-back" label={`Previous ${value.mode}`} onPress={() => step(-1)} />
          <View style={{ flex: 1, alignItems: "center" }}>
            <AppText variant="bodyStrong">{period.label}</AppText>
            <AppText variant="small">
              {period.from === period.to ? formatShortDate(period.from) : `${formatShortDate(period.from)} – ${formatShortDate(period.to)}`}
            </AppText>
          </View>
          <StepButton icon="chevron-forward" label={`Next ${value.mode}`} onPress={() => step(1)} disabled={period.isCurrent} />
        </View>
      )}
    </View>
  );
}

function StepButton({ icon, label, onPress, disabled }: { icon: "chevron-back" | "chevron-forward"; label: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      style={({ pressed }) => [styles.stepBtn, pressed && { opacity: 0.7 }, disabled && { opacity: 0.3 }]}
    >
      <Ionicons name={icon} size={22} color={colors.primaryDark} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  customRow: { flexDirection: "row", gap: 12, marginBottom: -16 },
  stepper: { flexDirection: "row", alignItems: "center", gap: 8 },
  stepBtn: { width: TOUCH - 8, height: TOUCH - 8, borderRadius: (TOUCH - 8) / 2, alignItems: "center", justifyContent: "center", backgroundColor: colors.primarySoft },
});
