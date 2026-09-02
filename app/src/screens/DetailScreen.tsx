import React, { useEffect, useState } from "react";
import { View, Text, ScrollView, StyleSheet, ActivityIndicator, TouchableOpacity, Pressable } from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { RootStackParamList } from "../navigation/types";
import { Venue } from "../types/venue";
import { getVenueById, getAlternatives } from "../services/api";
import { CrowdBadge } from "../components/CrowdBadge";
import { PopularTimesChart } from "../components/PopularTimesChart";
import { useTheme } from "../theme/ThemeContext";

type Props = NativeStackScreenProps<RootStackParamList, "Detail">;

export default function DetailScreen({ route, navigation }: Props) {
  const { venueId } = route.params;
  const { colors } = useTheme();
  const [venue, setVenue] = useState<Venue | null>(null);
  const [alternatives, setAlternatives] = useState<Venue[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedHour, setSelectedHour] = useState(new Date().getHours());

  useEffect(() => {
    (async () => {
      const found = await getVenueById(venueId);
      if (found) {
        setVenue(found);
        // Transit stations are fixed destinations, not interchangeable like
        // malls/attractions - no "alternative" makes sense for them.
        setAlternatives(found.category === "Transit" ? [] : await getAlternatives(found));
      }
      setLoading(false);
    })();
  }, [venueId]);

  if (loading) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (!venue) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.background }]}>
        <Text style={{ color: colors.text }}>Venue not found.</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.content}
    >
      {/* The chart's bars fill its own width edge to edge, leaving nowhere
          inside it to tap for "deselect" - so tapping away from the chart
          resets it, scoped to the whole screen's content instead. A tap
          that lands on a bar (or the alternatives rows below) is still
          claimed by that element's own Touchable first and never reaches
          this handler, same as any nested RN touch target. */}
      <Pressable onPress={() => setSelectedHour(new Date().getHours())}>
      <Text style={[styles.name, { color: colors.text }]}>{venue.name}</Text>
      <Text style={[styles.address, { color: colors.textMuted }]}>{venue.address}</Text>

      <View style={styles.crowdRow}>
        <CrowdBadge level={venue.crowdLevel} />
        {/* LTA only gives a low/moderate/high category, never a real number -
            showing "20%/50%/80%" implied a precision that doesn't exist.
            "Unavailable" means no reading exists yet - showing "0% of peak"
            next to it would misread as an actual low-crowd measurement. */}
        {venue.category !== "Transit" && venue.crowdLevel !== "Unavailable" && (
          <Text style={[styles.percent, { color: colors.text }]}>{venue.crowdPercent}% of peak</Text>
        )}
      </View>

      <Text style={[styles.updated, { color: colors.textMuted }]}>
        Updated {new Date(venue.lastUpdated).toLocaleTimeString()} · source: {venue.source}
      </Text>

      {/* Transit already has real, official LTA crowd data - this is only
          useful for Venues, where the crowd figure above comes from Popular
          Times (or is still "Unavailable" if this venue hasn't been
          scraped yet - the batch scheduler fills this in automatically,
          nothing for the user to trigger). */}
      {venue.category !== "Transit" && (
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Crowd Information</Text>
          {venue.hourly && venue.hourly.length > 0 ? (
            <PopularTimesChart
              hourly={venue.hourly}
              selectedHour={selectedHour}
              onSelectHour={setSelectedHour}
            />
          ) : (
            <Text style={[styles.meta, { color: colors.textMuted }]}>
              No crowd data available yet for this venue.
            </Text>
          )}
        </View>
      )}

      {venue.carparks && venue.carparks.length > 0 && (
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Parking availability</Text>
          {venue.carparks.map((cp) => (
            <Text key={cp.label} style={[styles.meta, { color: colors.textMuted }]}>
              {cp.label}: {cp.availableLots} lots available
            </Text>
          ))}
        </View>
      )}

      {alternatives.length > 0 && (
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>
            Lower-crowd alternatives nearby
          </Text>
          {alternatives.map((alt) => (
            <TouchableOpacity
              key={alt.id}
              style={[styles.altRow, { borderBottomColor: colors.border }]}
              onPress={() => navigation.push("Detail", { venueId: alt.id })}
            >
              <View style={styles.rowText}>
                <Text style={[styles.altName, { color: colors.text }]}>{alt.name}</Text>
                <Text style={[styles.meta, { color: colors.textMuted }]}>
                  {alt.distanceKm?.toFixed(1)} km away
                </Text>
              </View>
              <CrowdBadge level={alt.crowdLevel} />
            </TouchableOpacity>
          ))}
        </View>
      )}
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16 },
  centered: { flex: 1, justifyContent: "center", alignItems: "center" },
  name: { fontSize: 22, fontWeight: "700" },
  address: { fontSize: 14, marginTop: 4 },
  crowdRow: { flexDirection: "row", alignItems: "center", marginTop: 16, gap: 10 },
  percent: { fontSize: 14 },
  updated: { fontSize: 12, marginTop: 8 },
  section: { marginTop: 28 },
  sectionTitle: { fontSize: 16, fontWeight: "600", marginBottom: 8 },
  altRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowText: { flex: 1, paddingRight: 12 },
  altName: { fontSize: 15, fontWeight: "500" },
  meta: { fontSize: 13, marginTop: 2 },
});
