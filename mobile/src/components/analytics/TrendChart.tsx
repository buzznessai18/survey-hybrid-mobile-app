import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import Svg, { Line, Path } from "react-native-svg";
import { AppText } from "@/components/ui/AppText";
import { colors } from "@/theme";
import type { Bucket } from "@/utils/period";

const HEIGHT = 140;
const TOP = 8;
const MAX_LABELS = 8;

/** Bar with 4px rounded top corners, flat on the baseline. */
function barPath(x: number, y: number, w: number, h: number) {
  const r = Math.min(4, w / 2, h);
  return `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + w - r}Q${x + w},${y} ${x + w},${y + r}V${y + h}Z`;
}

/** "Nice" axis maximum: 1, 2, 5 × 10^n at or above `v`. */
function niceMax(v: number) {
  if (v <= 4) return Math.max(v, 1);
  const p = 10 ** Math.floor(Math.log10(v));
  return ([1, 2, 5, 10].find((m) => m * p >= v) ?? 10) * p;
}

/**
 * Single-series bar chart (one hue, recessive axis). Tap a bar to read its
 * value; the caption names the series so no legend is needed.
 */
export function TrendChart({ buckets, unit }: { buckets: Bucket[]; unit: { one: string; many: string } }) {
  const [width, setWidth] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const max = niceMax(Math.max(0, ...buckets.map((b) => b.value)));
  const n = buckets.length;
  const slot = n ? width / n : 0;
  const gap = Math.max(2, Math.min(8, slot * 0.3));
  const barW = Math.max(1, slot - gap);
  const plotH = HEIGHT - TOP;
  const every = Math.ceil(n / MAX_LABELS);
  const sel = selected !== null && selected < n ? buckets[selected] : null;
  const fmt = (v: number) => `${v} ${v === 1 ? unit.one : unit.many}`;
  const total = buckets.reduce((s, b) => s + b.value, 0);

  return (
    <View>
      <View style={styles.readout}>
        <AppText variant="bodyStrong">{sel ? fmt(sel.value) : fmt(total)}</AppText>
        <AppText variant="small">{sel ? sel.title : "Total · tap a bar for details"}</AppText>
      </View>
      <View style={styles.plotRow}>
        <View style={{ flex: 1 }} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
          {width > 0 ? (
            <Svg width={width} height={HEIGHT}>
              <Line x1={0} x2={width} y1={TOP} y2={TOP} stroke={colors.border} strokeWidth={1} strokeDasharray="3 4" />
              {buckets.map((b, i) => {
                const h = b.value === 0 ? 0 : Math.max(2, (b.value / max) * plotH);
                const active = selected === null || selected === i;
                return h ? (
                  <Path key={b.start} d={barPath(i * slot + gap / 2, HEIGHT - h, barW, h)} fill={colors.primary} opacity={active ? 1 : 0.35} />
                ) : null;
              })}
              <Line x1={0} x2={width} y1={HEIGHT - 0.5} y2={HEIGHT - 0.5} stroke={colors.borderStrong} strokeWidth={1} />
            </Svg>
          ) : (
            <View style={{ height: HEIGHT }} />
          )}
          {/* Full-height tap targets, wider than the bars. */}
          <View style={StyleSheet.absoluteFill}>
            <View style={{ flex: 1, flexDirection: "row" }}>
              {buckets.map((b, i) => (
                <Pressable
                  key={b.start}
                  style={{ flex: 1 }}
                  onPress={() => setSelected(selected === i ? null : i)}
                  accessibilityRole="button"
                  accessibilityLabel={`${b.title}: ${fmt(b.value)}`}
                />
              ))}
            </View>
          </View>
        </View>
        <View style={styles.yAxis}>
          <AppText variant="small">{max}</AppText>
          <AppText variant="small">0</AppText>
        </View>
      </View>
      <View style={[styles.xAxis, { marginRight: 28 }]}>
        {buckets.map((b, i) => (
          <AppText key={b.start} variant="small" numberOfLines={1} style={[styles.xLabel, { opacity: i % every === 0 ? 1 : 0 }]}>
            {b.label}
          </AppText>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  readout: { minHeight: 40, marginBottom: 6 },
  plotRow: { flexDirection: "row", gap: 6 },
  yAxis: { width: 22, height: HEIGHT, justifyContent: "space-between", paddingTop: 0 },
  xAxis: { flexDirection: "row", marginTop: 4 },
  xLabel: { flex: 1, textAlign: "center", fontSize: 10.5 },
});
