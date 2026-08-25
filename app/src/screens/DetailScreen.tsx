import React, { useEffect, useState } from "react";
import { View, Text, ScrollView, StyleSheet, ActivityIndicator, TouchableOpacity } from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { RootStackParamList } from "../navigation/types";
import { Venue } from "../types/venue";
import { getVenueById, getAlternatives } from "../services/api";
import { CrowdBadge } from "../components/CrowdBadge";

type Props = NativeStackScreenProps<RootStackParamList, "Detail">;

export default function DetailScreen({ route, navigation }: Props) {
  const { venueId } = route.params;
  const [venue, setVenue] = useState<Venue | null>(null);
  const [alternatives, setAlternatives] = useState<Venue[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const found = await getVenueById(venueId);
      if (found) {
        setVenue(found);
        setAlternatives(await getAlternatives(found));
      }
      setLoading(false);
    })();
  }, [venueId]);

  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (!venue) {
    return (
      <View style={styles.centered}>
        <Text>Venue not found.</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <Text style={styles.name}>{venue.name}</Text>
      <Text style={styles.address}>{venue.address}</Text>

      <View style={styles.crowdRow}>
        <CrowdBadge level={venue.crowdLevel} />
        <Text style={styles.percent}>{venue.crowdPercent}% of peak</Text>
      </View>

      <Text style={styles.updated}>
        Updated {new Date(venue.lastUpdated).toLocaleTimeString()} · source: {venue.source}
      </Text>

      {alternatives.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Lower-crowd alternatives nearby</Text>
          {alternatives.map((alt) => (
            <TouchableOpacity
              key={alt.id}
              style={styles.altRow}
              onPress={() => navigation.push("Detail", { venueId: alt.id })}
            >
              <View style={styles.rowText}>
                <Text style={styles.altName}>{alt.name}</Text>
                <Text style={styles.meta}>{alt.distanceKm?.toFixed(1)} km away</Text>
              </View>
              <CrowdBadge level={alt.crowdLevel} />
            </TouchableOpacity>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16 },
  centered: { flex: 1, justifyContent: "center", alignItems: "center" },
  name: { fontSize: 22, fontWeight: "700" },
  address: { fontSize: 14, color: "#666", marginTop: 4 },
  crowdRow: { flexDirection: "row", alignItems: "center", marginTop: 16, gap: 10 },
  percent: { fontSize: 14, color: "#333" },
  updated: { fontSize: 12, color: "#999", marginTop: 8 },
  section: { marginTop: 28 },
  sectionTitle: { fontSize: 16, fontWeight: "600", marginBottom: 8 },
  altRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#ddd",
  },
  rowText: { flex: 1, paddingRight: 12 },
  altName: { fontSize: 15, fontWeight: "500" },
  meta: { fontSize: 13, color: "#666", marginTop: 2 },
});
