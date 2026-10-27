import React from "react";
import { View, Text, TouchableOpacity, Pressable, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { CrowdBadge } from "./CrowdBadge";
import { CategoryPin } from "./CategoryPin";
import { VenueCategory, CrowdLevel } from "../types/venue";
import { ThemeColors } from "../theme/ThemeContext";
import { getTodayStatus, OpenHoursEntry } from "../services/hours";
import { formatCurrentHour, formatUpdatedAt } from "../services/updatedAt";
import { useLanguage } from "../i18n/LanguageContext";
import { formatHoursDetail, StringKey } from "../i18n/strings";

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
  // Opening hours for malls, real first/last train times for stations
  // (see stationHours.ts) - shown in the expanded part of the card.
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
  const { t, language } = useLanguage();
  const categoryLabel = t(`category.${category}` as StringKey);

  function summary(): string {
    const isTransit = category === "Transit";
    const status = hours ? getTodayStatus(hours) : null;
    const hoursText = status?.detail ? formatHoursDetail(status.detail, language) : null;
    // LTA only ever gives a low/moderate/high category, never a real number,
    // so stations show the category (already on the badge) and their train
    // hours. "Unavailable" means no reading exists yet, where "0% of peak"
    // would misread as a real low crowd. A closed mall reads 0% and says
    // when it next opens.
    const parts: string[] = [];
    if (isTransit) {
      if (status) parts.push(status.open ? t("row.operating") : t("hours.closed"));
      if (hoursText) parts.push(hoursText);
      parts.push(t("row.updated", { time: formatUpdatedAt(lastUpdated, language) }));
    } else if (status && !status.open) {
      parts.push(t("row.percentOfPeak", { percent: 0 }));
      if (hoursText) parts.push(hoursText);
    } else if (crowdLevel !== "Unavailable") {
      parts.push(t("row.percentOfPeak", { percent: crowdPercent }));
      parts.push(t("row.asOf", { time: formatCurrentHour(language) }));
    } else {
      parts.push(t("row.updated", { time: formatUpdatedAt(lastUpdated, language) }));
    }
    return parts.join(" · ");
  }

  return (
    <View
      style={[
        styles.card,
        // Same border width either way, so selecting only changes the colour.
        { backgroundColor: colors.surface, borderColor: isSelected ? colors.accent : colors.border },
      ]}
    >
      <View style={styles.row}>
        {/* Select and save are two separate touchables side by side (not one
            nested in the other) - a heart nested inside the row's own
            touchable would ambiguously fire both on a single tap instead of
            cleanly toggling just the save state. Pressable rather than
            TouchableOpacity: the list's expand animation starts mid-tap and
            could leave TouchableOpacity's fade stuck half way, greying the
            row out until the next scroll. */}
        <Pressable style={({ pressed }) => [styles.rowMain, pressed && styles.pressed]} onPress={() => onToggleSelect(id)}>
          <CategoryPin category={category} size={32} />
          <View style={styles.rowText}>
            <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>
              {name}
            </Text>
            <Text style={[styles.meta, { color: colors.textMuted }]}>
              {categoryLabel} ·{" "}
              {distanceKm !== undefined ? t("row.kmAway", { distance: distanceKm.toFixed(1) }) : t("row.noDistance")}
            </Text>
          </View>
          <CrowdBadge level={crowdLevel} />
        </Pressable>

        <TouchableOpacity style={styles.saveButton} onPress={() => onToggleSaved(id)} hitSlop={10}>
          <Ionicons name={isSaved ? "heart" : "heart-outline"} size={20} color={isSaved ? colors.accent : colors.textMuted} />
        </TouchableOpacity>
      </View>

      {isSelected && (
        <View style={[styles.expanded, { borderTopColor: colors.border }]}>
          <Text style={[styles.summary, { color: colors.textMuted }]}>{summary()}</Text>
          {/* Stations are fixed destinations with no details page. */}
          {category !== "Transit" && (
            <TouchableOpacity style={[styles.button, { borderColor: colors.accent }]} onPress={() => onSeeDetails(id)}>
              <Text style={[styles.buttonText, { color: colors.accent }]}>{t("row.seeDetails")}</Text>
            </TouchableOpacity>
          )}
        </View>
      )}
    </View>
  );
}

// `hours` is the one non-primitive prop here (see the header comment above
// for why that matters) - it comes straight off the venue object the API
// returns, which is rebuilt fresh on every poll even though a venue's hours
// rarely change between polls. Plain React.memo would see a new array
// reference every 2 minutes and re-render every row regardless, so this
// compares `hours` by content instead of reference.
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
  card: {
    marginHorizontal: 12,
    marginBottom: 8,
    borderRadius: 10,
    borderWidth: 1,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 10,
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
  pressed: { opacity: 0.6 },
  rowText: { flex: 1 },
  name: { fontSize: 16, fontWeight: "600" },
  meta: { fontSize: 13, marginTop: 2 },
  expanded: {
    marginHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: 10,
  },
  summary: { fontSize: 13 },
  button: {
    alignSelf: "flex-start",
    borderWidth: 1,
    borderRadius: 18,
    paddingVertical: 6,
    paddingHorizontal: 14,
  },
  buttonText: { fontSize: 13.5, fontWeight: "600" },
});
