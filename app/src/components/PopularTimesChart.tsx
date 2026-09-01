import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { useTheme } from "../theme/ThemeContext";

interface Props {
  hourly: { hour: number; percent: number }[];
}

const CHART_HEIGHT = 90;
const LABEL_INTERVAL = 3; // show every 3rd hour, matching Google's own spacing (6a, 9a, 12p...)

function formatHour(hour: number): string {
  if (hour === 0) return "12a";
  if (hour === 12) return "12p";
  return hour < 12 ? `${hour}a` : `${hour - 12}p`;
}

// Same bar-chart shape as Google's own Popular Times graph - a bar per hour
// the venue's open, scaled to its busyness, with the current hour picked out
// in the accent colour the way Google highlights "now" in red.
export function PopularTimesChart({ hourly }: Props) {
  const { colors } = useTheme();
  const currentHour = new Date().getHours();

  return (
    <View style={styles.container}>
      <View style={styles.barsRow}>
        {hourly.map((entry) => {
          const isCurrent = entry.hour === currentHour;
          const barHeight = Math.max(3, (entry.percent / 100) * CHART_HEIGHT);
          return (
            <View key={entry.hour} style={styles.barColumn}>
              <View style={styles.barTrack}>
                <View
                  style={[
                    styles.bar,
                    { height: barHeight, backgroundColor: isCurrent ? colors.accent : colors.border },
                  ]}
                />
              </View>
            </View>
          );
        })}
      </View>
      <View style={styles.labelsRow}>
        {hourly.map((entry, i) => (
          <View key={entry.hour} style={styles.barColumn}>
            {i % LABEL_INTERVAL === 0 && (
              <Text style={[styles.label, { color: colors.textMuted }]}>{formatHour(entry.hour)}</Text>
            )}
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginTop: 12 },
  barsRow: { flexDirection: "row", alignItems: "flex-end" },
  barColumn: { flex: 1, alignItems: "center" },
  barTrack: { height: CHART_HEIGHT, justifyContent: "flex-end" },
  bar: { width: 8, borderRadius: 3 },
  labelsRow: { flexDirection: "row", marginTop: 4 },
  label: { fontSize: 10 },
});
