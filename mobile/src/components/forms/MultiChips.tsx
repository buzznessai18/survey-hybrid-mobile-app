import { View } from "react-native";
import { Chip } from "@/components/ui/Chip";
import { FieldLabel } from "@/components/ui/AppInput";
import { AppText } from "@/components/ui/AppText";

/** Toggleable chip list for multi-select (talukas, categories, crops). */
export function MultiChips<T extends string>({
  label,
  hint,
  options,
  value,
  onChange,
}: {
  label: string;
  hint?: string;
  options: { value: T; label: string }[];
  value: T[];
  onChange: (v: T[]) => void;
}) {
  return (
    <View style={{ marginBottom: 16 }}>
      <FieldLabel label={label} />
      {hint ? (
        <AppText variant="small" style={{ marginBottom: 8, marginTop: -2 }}>
          {hint}
        </AppText>
      ) : null}
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
        {options.map((o) => {
          const selected = value.includes(o.value);
          return (
            <Chip
              key={o.value}
              label={o.label}
              selected={selected}
              onPress={() => onChange(selected ? value.filter((v) => v !== o.value) : [...value, o.value])}
            />
          );
        })}
      </View>
    </View>
  );
}
