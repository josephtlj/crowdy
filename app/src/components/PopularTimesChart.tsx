import React from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { useTheme } from "../theme/ThemeContext";

interface Props {
  hourly: { hour: number; percent: number }[];
  selectedHour: number;
  onSelectHour: (hour: number) => void;
}

const CHART_HEIGHT = 90;
const LABEL_WIDTH = 34; // wide enough that "12pm"/"10pm" never wraps, however narrow its bar column is
const DOT_COUNT = 9;
const DOT_SIZE = 3;
const DOT_GAP = (CHART_HEIGHT - DOT_COUNT * DOT_SIZE) / (DOT_COUNT - 1);
const TARGET_LABEL_COUNT = 6; // roughly this many labels regardless of how many hours a venue has open
// Google's own selected-bar blue - deliberately not colors.accent (that's
// Crowdy's red brand colour, which now means something different here: the
// current hour specifically, not "whatever's selected").
const SELECTED_COLOR = "#1A73E8";
const CURRENT_COLOR = "#E53935";

function formatHour(hour: number): string {
  if (hour === 0) return "12am";
  if (hour === 12) return "12pm";
  return hour < 12 ? `${hour}am` : `${hour - 12}pm`;
}

// Centre of the i-th of N equal-width flex columns, as a percentage of the
// row's total width - used to align the current-hour guide line and the
// (absolutely positioned, so they can't wrap) x-axis labels to the same
// spot their bar sits at.
function columnCenterPercent(index: number, total: number): number {
  return ((index + 0.5) / total) * 100;
}

// Same bar-chart shape as Google's own Popular Times graph. The current
// hour gets a full-height dotted guide line (like Google's own chart) plus
// its bar rendered in red, and stays that way even if it's also the tapped
// bar - tapping it is a no-op, not a colour change. Whatever other bar the
// user taps turns blue instead and drives the callout text;
// selectedHour/onSelectHour are owned by the parent screen (not this
// component) because resetting on "tap away from the chart" needs a
// tappable area outside the chart's own bounds, which this component -
// filled edge to edge with bars - doesn't have room for.
export function PopularTimesChart({ hourly, selectedHour, onSelectHour }: Props) {
  const { colors } = useTheme();
  const currentHour = new Date().getHours();

  const selectedEntry = hourly.find((e) => e.hour === selectedHour) ?? hourly[0];
  const labelInterval = Math.max(1, Math.round(hourly.length / TARGET_LABEL_COUNT));
  const currentIndex = hourly.findIndex((e) => e.hour === currentHour);

  return (
    <View style={styles.container}>
      {selectedEntry && (
        <Text style={[styles.callout, { color: colors.text }]}>
          {formatHour(selectedEntry.hour)}
          {selectedEntry.hour === currentHour ? " (now)" : ""}: {selectedEntry.percent}% of crowd peak
        </Text>
      )}
      <View style={styles.barsRowWrapper}>
        {currentIndex !== -1 && (
          <View
            pointerEvents="none"
            style={[styles.currentLine, { left: `${columnCenterPercent(currentIndex, hourly.length)}%` }]}
          >
            {Array.from({ length: DOT_COUNT }).map((_, i) => (
              <View
                key={i}
                style={[styles.currentDot, i > 0 ? { marginTop: DOT_GAP } : null]}
              />
            ))}
          </View>
        )}
        <View style={styles.barsRow}>
          {hourly.map((entry) => {
            const isCurrent = entry.hour === currentHour;
            const isSelected = entry.hour === selectedHour;
            const barHeight = Math.max(3, (entry.percent / 100) * CHART_HEIGHT);
            const barColor = isCurrent ? CURRENT_COLOR : isSelected ? SELECTED_COLOR : colors.border;
            return (
              <TouchableOpacity
                key={entry.hour}
                style={styles.barColumn}
                activeOpacity={0.7}
                hitSlop={{ top: 8, bottom: 8, left: 2, right: 2 }}
                onPress={() => onSelectHour(entry.hour)}
              >
                <View style={styles.barTrack}>
                  <View style={[styles.bar, { height: barHeight, backgroundColor: barColor }]} />
                </View>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
      <View style={styles.labelsRow}>
        {hourly.map(
          (entry, i) =>
            i % labelInterval === 0 && (
              <Text
                key={entry.hour}
                numberOfLines={1}
                style={[
                  styles.label,
                  {
                    color: colors.textMuted,
                    left: `${columnCenterPercent(i, hourly.length)}%`,
                    marginLeft: -LABEL_WIDTH / 2,
                  },
                ]}
              >
                {formatHour(entry.hour)}
              </Text>
            )
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginTop: 12 },
  callout: { fontSize: 14, fontWeight: "600", marginBottom: 8 },
  barsRowWrapper: { position: "relative" },
  // A hand-built stack of small dots rather than a CSS-style dashed/dotted
  // border - a zero-width box with only borderLeftWidth set didn't reliably
  // paint anything, so this uses plain solid-colour Views instead, which
  // can't fail to render the same way.
  currentLine: {
    position: "absolute",
    top: 0,
    marginLeft: -DOT_SIZE / 2,
    alignItems: "center",
  },
  currentDot: {
    width: DOT_SIZE,
    height: DOT_SIZE,
    borderRadius: DOT_SIZE / 2,
    backgroundColor: CURRENT_COLOR,
  },
  barsRow: { flexDirection: "row", alignItems: "flex-end" },
  barColumn: { flex: 1, alignItems: "center" },
  barTrack: { height: CHART_HEIGHT, justifyContent: "flex-end" },
  bar: { width: 8, borderRadius: 3 },
  // Absolutely positioned (not flex columns, like barsRow) so each label
  // renders at its own natural width and can never be squeezed into
  // wrapping the way a narrow flex column forced "4am" onto two lines.
  labelsRow: { position: "relative", height: 14, marginTop: 4 },
  label: { position: "absolute", width: LABEL_WIDTH, fontSize: 10, textAlign: "center" },
});
