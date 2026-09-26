import { Ionicons } from "@expo/vector-icons";
import { useMemo, useState, type ComponentProps } from "react";
import { FlatList, Pressable, StyleSheet, TextInput, View } from "react-native";
import { AppText } from "@/components/ui/AppText";
import { BottomSheet } from "@/components/ui/BottomSheet";
import { FieldLabel, fieldStyles } from "@/components/ui/AppInput";
import { colors, fonts, radius } from "@/theme";

export interface SelectOption {
  value: string;
  label: string;
}

/** Tap-to-open picker with optional search (used for crops, area units). */
export function SelectField({
  label,
  required,
  value,
  options,
  onChange,
  placeholder = "Select",
  error,
  searchable,
  icon,
  compact,
  emptyMessage = "No options available",
}: {
  label?: string;
  required?: boolean;
  value: string | null | undefined;
  options: SelectOption[];
  onChange: (value: string, option: SelectOption) => void;
  placeholder?: string;
  error?: string;
  searchable?: boolean;
  icon?: ComponentProps<typeof Ionicons>["name"];
  compact?: boolean;
  emptyMessage?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const selected = options.find((o) => o.value === value);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? options.filter((o) => o.label.toLowerCase().includes(q)) : options;
  }, [options, query]);

  return (
    <View style={!compact && { marginBottom: 16 }}>
      {label ? <FieldLabel label={label} required={required} /> : null}
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={`${label ?? placeholder}: ${selected?.label ?? "not selected"}`}
        accessibilityHint="Opens a list to choose from"
        style={[fieldStyles.field, error && { borderColor: colors.error }]}
      >
        {icon ? <Ionicons name={icon} size={20} color={colors.primary} /> : null}
        <AppText
          style={[styles.value, !selected && { color: colors.placeholder, fontFamily: fonts.regular }]}
          numberOfLines={1}
        >
          {selected?.label ?? placeholder}
        </AppText>
        <Ionicons name="chevron-down" size={18} color={colors.muted} />
      </Pressable>
      {error ? (
        <AppText variant="small" style={{ color: colors.error, marginTop: 6 }}>
          {error}
        </AppText>
      ) : null}

      <BottomSheet
        visible={open}
        onClose={() => {
          setOpen(false);
          setQuery("");
        }}
        accessibilityLabel={label}
      >
        <AppText variant="title" style={{ marginBottom: 12 }}>
          {label ?? "Select"}
        </AppText>
        {searchable ? (
          <View style={styles.search}>
            <Ionicons name="search" size={18} color={colors.muted} />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Search"
              placeholderTextColor={colors.placeholder}
              style={styles.searchInput}
              autoCorrect={false}
              accessibilityLabel={`Search ${label ?? ""}`}
            />
          </View>
        ) : null}
        <FlatList
          data={filtered}
          keyExtractor={(o) => o.value}
          keyboardShouldPersistTaps="handled"
          style={{ maxHeight: 380 }}
          ListEmptyComponent={
            <AppText variant="caption" style={{ textAlign: "center", paddingVertical: 24 }}>
              {emptyMessage}
            </AppText>
          }
          renderItem={({ item }) => {
            const isSelected = item.value === value;
            return (
              <Pressable
                onPress={() => {
                  onChange(item.value, item);
                  setOpen(false);
                  setQuery("");
                }}
                accessibilityRole="button"
                accessibilityState={{ selected: isSelected }}
                style={({ pressed }) => [styles.option, isSelected && styles.optionSelected, pressed && { opacity: 0.7 }]}
              >
                <AppText style={[styles.optionText, isSelected && { color: colors.primaryDark }]}>{item.label}</AppText>
                {isSelected ? <Ionicons name="checkmark-circle" size={22} color={colors.primary} /> : null}
              </Pressable>
            );
          }}
        />
      </BottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  value: { flex: 1, fontFamily: fonts.medium, fontSize: 16, color: colors.text },
  search: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: colors.background,
    borderRadius: radius.md,
    paddingHorizontal: 12,
    minHeight: 48,
    marginBottom: 8,
  },
  searchInput: { flex: 1, fontFamily: fonts.regular, fontSize: 16, color: colors.text },
  option: {
    minHeight: 52,
    paddingHorizontal: 12,
    borderRadius: radius.md,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  optionSelected: { backgroundColor: colors.primarySoft },
  optionText: { fontFamily: fonts.medium, fontSize: 16, color: colors.text },
});
