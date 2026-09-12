import React from "react";
import { View, Text, TouchableOpacity, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { CrowdBadge } from "./CrowdBadge";
import { CategoryPin } from "./CategoryPin";
import { VenueCategory, CrowdLevel } from "../types/venue";
import { ThemeColors } from "../theme/ThemeContext";
import { getTodayStatus, OpenHoursEntry } from "../services/hours";

interface Props {
  id: string;
  name: string;
  category: VenueCategory;
  crowdLevel: CrowdLevel;
  crowdPercent: number;
  lastUpdated: string;
  distanceKm: number | undefined;
  isSelected: boolean;
  isSaved: boolean;
  colors: ThemeColors;
  // Real first/last train times, where known (see stationHours.ts) - shown
  // inline in the selected preview below instead of a separate Detail
  // screen, since transit stations don't have one (fixed destinations,
  // nothing else to show there beyond what the row already covers).
  hours?: OpenHoursEntry[];
  onToggleSelect: (id: string) => void;
  onSeeDetails: (id: string) => void;
  onToggleSaved: (id: string) => void;
}

// Split out of HomeScreen and wrapped in React.memo so panning the map
// (which swaps a handful of rows in and out of ~289 venues) only re-renders
// the rows that actually changed, not all of them. That only works because
// every prop here is either a primitive (compares by value, so an unchanged
// venue looks genuinely unchanged) or a stable reference (`colors`,
// `onToggleSelect`, `onSeeDetails` are all memoized/constant at the
// HomeScreen level) - passing the whole `Venue` object instead would've
// handed every row a freshly-built object on every recompute, and React
// would see that as "different" even when nothing about it actually was.
function VenueRowBase({
  id,
  name,
  category,
  crowdLevel,
  crowdPercent,
  lastUpdated,
  distanceKm,
  isSelected,
  isSaved,
  colors,
  hours,
  onToggleSelect,
  onSeeDetails,
  onToggleSaved,
}: Props) {
  const transitStatus = category === "Transit" && hours ? getTodayStatus(hours) : null;

  return (
    <View
      style={[
        styles.rowWrapper,
        { borderBottomColor: colors.border },
        // The base style sets borderBottomWidth/Color specifically (for the
        // plain separator line) - RN treats those as more specific than the
        // borderWidth/borderColor shorthand below regardless of array
        // order, so the bottom edge needs its own explicit override too or
        // it silently keeps showing the old thin grey line underneath.
        isSelected && {
          borderWidth: 1.5,
          borderColor: colors.accent,
          borderBottomWidth: 1.5,
          borderBottomColor: colors.accent,
        },
      ]}
    >
      <View style={styles.row}>
        {/* Select/expand and save are two separate touchables side by side
            (not one nested in the other) - a heart nested inside the
            row's own touchable would ambiguously fire both on a single
            tap instead of cleanly toggling just the save state. */}
        <TouchableOpacity style={styles.rowMain} onPress={() => onToggleSelect(id)}>
          <CategoryPin category={category} size={32} />
          <View style={styles.rowText}>
            <Text style={[styles.name, { color: colors.text }]}>{name}</Text>
            <Text style={[styles.meta, { color: colors.textMuted }]}>
              {category} ·{" "}
              {distanceKm !== undefined ? `${distanceKm.toFixed(1)}km away from you` : "Distance unavailable - enable location"}
            </Text>
          </View>
          <CrowdBadge level={crowdLevel} />
        </TouchableOpacity>

        <TouchableOpacity style={styles.saveButton} onPress={() => onToggleSaved(id)} hitSlop={10}>
          <Ionicons
            name={isSaved ? "heart" : "heart-outline"}
            size={20}
            color={isSaved ? colors.accent : colors.textMuted}
          />
        </TouchableOpacity>
      </View>

      {isSelected && (
        <View style={styles.preview}>
          <Text style={[styles.previewText, { color: colors.textMuted }]}>
            {/* LTA only ever gives a low/moderate/high category, never a
                real number - showing "20%/50%/80%" implied a precision
                that doesn't exist at the source, so Transit just shows
                the category label (already on the badge above).
                "Unavailable" means no reading exists yet - "0% of peak"
                would misread as an actual low-crowd measurement. */}
            {category !== "Transit" && crowdLevel !== "Unavailable" && `${crowdPercent}% of peak · `}
            {/* Real first/last train times where known (see
                stationHours.ts) - a station missing from that data (a
                small handful of LRT loop stations it isn't covered for)
                just shows nothing extra here rather than a guess. */}
            {transitStatus && `${transitStatus.open ? "Operating" : "Closed"}${transitStatus.detail ? ` · ${transitStatus.detail}` : ""} · `}
            updated {new Date(lastUpdated).toLocaleTimeString()}
          </Text>
          {/* Transit stations are fixed destinations, not interchangeable
              like malls/attractions - no "alternative" makes sense. */}
          {category !== "Transit" && (
            <TouchableOpacity style={styles.previewButton} onPress={() => onSeeDetails(id)}>
              <Text style={styles.previewButtonText}>See more details &rsaquo;</Text>
            </TouchableOpacity>
          )}
        </View>
      )}
    </View>
  );
}

// `hours` is the one non-primitive prop here (see the header comment above
// for why that matters) - it comes straight off the venue object the API
// returns, which is rebuilt fresh on every poll even though a station's
// actual hours (static data, see stationHours.ts) never changes between
// polls. Plain React.memo would see a new array reference every 2 minutes
// and re-render every transit row regardless, so this compares `hours` by
// content instead of reference - everything else still compares by value/
// reference exactly as default memo would.
function areHoursEqual(a?: OpenHoursEntry[], b?: OpenHoursEntry[]): boolean {
  if (a === b) return true;
  if (!a || !b || a.length !== b.length) return false;
  return a.every((entry, i) => entry.day === b[i].day && entry.open === b[i].open && entry.close === b[i].close);
}

function propsAreEqual(prev: Props, next: Props): boolean {
  return (
    prev.id === next.id &&
    prev.name === next.name &&
    prev.category === next.category &&
    prev.crowdLevel === next.crowdLevel &&
    prev.crowdPercent === next.crowdPercent &&
    prev.lastUpdated === next.lastUpdated &&
    prev.distanceKm === next.distanceKm &&
    prev.isSelected === next.isSelected &&
    prev.isSaved === next.isSaved &&
    prev.colors === next.colors &&
    prev.onToggleSelect === next.onToggleSelect &&
    prev.onSeeDetails === next.onSeeDetails &&
    prev.onToggleSaved === next.onToggleSaved &&
    areHoursEqual(prev.hours, next.hours)
  );
}

export const VenueRow = React.memo(VenueRowBase, propsAreEqual);

const styles = StyleSheet.create({
  rowWrapper: {
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  rowMain: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  saveButton: {
    paddingLeft: 12,
  },
  rowText: { flex: 1 },
  name: { fontSize: 16, fontWeight: "600" },
  meta: { fontSize: 13, marginTop: 2 },
  preview: {
    paddingHorizontal: 16,
    paddingBottom: 14,
    paddingLeft: 60,
  },
  previewText: { fontSize: 12.5, marginBottom: 8 },
  previewButton: { alignSelf: "flex-start" },
  previewButtonText: { fontSize: 13.5, color: "#5B9EF5", fontWeight: "600" },
});
