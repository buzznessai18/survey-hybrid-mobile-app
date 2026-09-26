import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { memo } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { AppText } from "@/components/ui/AppText";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { colors, radius, shadow } from "@/theme";
import type { StatusView } from "@/utils/status";

export interface SurveyCardData {
  key: string;
  title: string; // "125/2"
  farmer: string;
  meta: string; // "2.5 Acres • Paddy"
  time: string;
  status: StatusView;
  photoUri?: string | null;
  hint?: string; // e.g. "Tap to retry"
}

/** Row used by the dashboard and My Surveys lists. */
export const SurveyCard = memo(function SurveyCard({
  data,
  onPress,
  compact,
}: {
  data: SurveyCardData;
  onPress: () => void;
  compact?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Survey ${data.title}, ${data.farmer}, ${data.status.label}`}
      style={({ pressed }) => [styles.card, compact && styles.compact, pressed && { opacity: 0.85 }]}
    >
      {compact ? (
        <View style={[styles.iconBox, { backgroundColor: data.status.tone === "error" ? colors.errorSoft : colors.primarySoft }]}>
          <Ionicons
            name={data.status.tone === "error" ? "copy-outline" : "document-text-outline"}
            size={20}
            color={data.status.tone === "error" ? colors.error : colors.primary}
          />
        </View>
      ) : (
        <View style={styles.thumb}>
          {data.photoUri ? (
            <Image source={{ uri: data.photoUri }} style={StyleSheet.absoluteFill} contentFit="cover" transition={150} />
          ) : (
            <Ionicons name="leaf-outline" size={22} color={colors.primary} />
          )}
        </View>
      )}
      <View style={styles.body}>
        <AppText variant="bodyStrong" numberOfLines={1}>
          {data.title}
        </AppText>
        <AppText variant="caption" numberOfLines={1}>
          {data.farmer}
        </AppText>
        {!compact ? (
          <AppText variant="small" numberOfLines={1}>
            {data.meta}
          </AppText>
        ) : null}
        {data.hint ? (
          <AppText variant="small" style={{ color: colors.error }} numberOfLines={1}>
            {data.hint}
          </AppText>
        ) : null}
      </View>
      <View style={styles.right}>
        <StatusBadge label={data.status.label} tone={data.status.tone} />
        <AppText variant="small">{data.time}</AppText>
      </View>
      {!compact ? <Ionicons name="chevron-forward" size={18} color={colors.placeholder} /> : null}
    </Pressable>
  );
});

const styles = StyleSheet.create({
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 12,
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    marginBottom: 10,
    minHeight: 76,
    ...shadow.card,
  },
  compact: { minHeight: 68 },
  thumb: {
    width: 60,
    height: 60,
    borderRadius: radius.md,
    overflow: "hidden",
    backgroundColor: colors.primarySoft,
    alignItems: "center",
    justifyContent: "center",
  },
  iconBox: { width: 42, height: 42, borderRadius: 12, alignItems: "center", justifyContent: "center" },
  body: { flex: 1, gap: 2 },
  right: { alignItems: "flex-end", gap: 6 },
});
