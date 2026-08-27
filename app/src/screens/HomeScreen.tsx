import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Platform,
  ActivityIndicator,
} from "react-native";
import * as Location from "expo-location";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { RootStackParamList } from "../navigation/types";
import { Venue } from "../types/venue";
import { MapRegion } from "../types/region";
import { getNearbyVenues } from "../services/api";
import { haversineKm } from "../services/distance";
import { CrowdBadge } from "../components/CrowdBadge";
import { CategoryPin } from "../components/CategoryPin";
import { VenueMap } from "../components/VenueMap";
import { TabBar } from "../components/TabBar";

// Marina Bay, used only if the user denies location permission.
const FALLBACK_REGION = { lat: 1.2838, lng: 103.8591 };
const DEFAULT_DELTA = 0.05;

type Props = NativeStackScreenProps<RootStackParamList, "Home">;

function isWithinRegion(venue: Venue, region: MapRegion): boolean {
  const latMin = region.latitude - region.latitudeDelta / 2;
  const latMax = region.latitude + region.latitudeDelta / 2;
  const lngMin = region.longitude - region.longitudeDelta / 2;
  const lngMax = region.longitude + region.longitudeDelta / 2;
  return venue.lat >= latMin && venue.lat <= latMax && venue.lng >= lngMin && venue.lng <= lngMax;
}

export default function HomeScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const [venues, setVenues] = useState<Venue[]>([]);
  const [region, setRegion] = useState<MapRegion | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedVenueId, setSelectedVenueId] = useState<string | null>(null);

  // Tapping the already-selected pin/row again deselects it, matching
  // ordinary toggle-select behaviour.
  const toggleSelection = (venueId: string) => {
    setSelectedVenueId((current) => (current === venueId ? null : venueId));
  };

  useEffect(() => {
    (async () => {
      let coords = FALLBACK_REGION;
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === "granted") {
        const position = await Location.getCurrentPositionAsync({});
        coords = { lat: position.coords.latitude, lng: position.coords.longitude };
      }
      setRegion({
        latitude: coords.lat,
        longitude: coords.lng,
        latitudeDelta: DEFAULT_DELTA,
        longitudeDelta: DEFAULT_DELTA,
      });
      const nearby = await getNearbyVenues(coords.lat, coords.lng);
      setVenues(nearby);
      setLoading(false);
    })();
  }, []);

  // Web has no map to pan, so it always shows the full nearby list.
  // Native re-filters to whatever's inside the map's current viewport,
  // sorted by distance to the viewport's centre rather than the user -
  // this is the Singabus-style "list follows the map" behaviour.
  const visibleVenues = useMemo(() => {
    if (Platform.OS === "web" || !region) return venues;
    return venues
      .filter((venue) => isWithinRegion(venue, region))
      .map((venue) => ({
        ...venue,
        distanceKm: haversineKm(region.latitude, region.longitude, venue.lat, venue.lng),
      }))
      .sort((a, b) => (a.distanceKm ?? 0) - (b.distanceKm ?? 0));
  }, [venues, region]);

  if (loading || !region) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <VenueMap
        initialRegion={region}
        venues={venues}
        selectedVenueId={selectedVenueId}
        onSelectVenue={toggleSelection}
        onDeselect={() => setSelectedVenueId(null)}
        onRegionChange={setRegion}
      />

      <Text style={[styles.brand, { top: insets.top + 8 }]}>Crowdy</Text>

      <View style={styles.sheet}>
        <TabBar active="areas" />

        <FlatList
          style={styles.list}
          data={visibleVenues}
          keyExtractor={(item) => item.id}
          extraData={selectedVenueId}
          ListEmptyComponent={
            <Text style={styles.empty}>No venues in view - pan or zoom out the map.</Text>
          }
          renderItem={({ item }) => {
            const isSelected = item.id === selectedVenueId;
            return (
              <View style={styles.rowWrapper}>
                <TouchableOpacity style={styles.row} onPress={() => toggleSelection(item.id)}>
                  <CategoryPin category={item.category} size={32} />
                  <View style={styles.rowText}>
                    <Text style={styles.name}>{item.name}</Text>
                    <Text style={styles.meta}>
                      {item.category} · {item.distanceKm?.toFixed(1)} km away
                    </Text>
                  </View>
                  <CrowdBadge level={item.crowdLevel} />
                </TouchableOpacity>

                {isSelected && (
                  <View style={styles.preview}>
                    <Text style={styles.previewText}>
                      {item.crowdPercent}% of peak · updated{" "}
                      {new Date(item.lastUpdated).toLocaleTimeString()} · {item.source}
                    </Text>
                    {/* MRT/LRT stations are fixed destinations, not interchangeable
                        like malls/hawker centres - no "alternative" makes sense. */}
                    {item.category !== "MRT" && item.category !== "LRT" && (
                      <TouchableOpacity
                        style={styles.previewButton}
                        onPress={() => navigation.navigate("Detail", { venueId: item.id })}
                      >
                        <Text style={styles.previewButtonText}>View Alternatives &rsaquo;</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                )}
              </View>
            );
          }}
        />
      </View>
    </View>
  );
}

const SHEET_BG = "#121212";

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: SHEET_BG },
  centered: { flex: 1, justifyContent: "center", alignItems: "center" },
  brand: {
    position: "absolute",
    left: 12,
    fontSize: 20,
    fontWeight: "800",
    color: "#EB5757",
    textShadowColor: "rgba(255,255,255,0.9)",
    textShadowRadius: 3,
  },
  sheet: {
    flex: 1,
    backgroundColor: SHEET_BG,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    marginTop: -20,
    paddingTop: 8,
  },
  list: { flex: 1 },
  empty: { textAlign: "center", padding: 24, color: "#888" },
  rowWrapper: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#2a2a2a",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  rowText: { flex: 1 },
  name: { fontSize: 16, fontWeight: "600", color: "white" },
  meta: { fontSize: 13, color: "#999", marginTop: 2 },
  preview: {
    paddingHorizontal: 16,
    paddingBottom: 14,
    paddingLeft: 60,
  },
  previewText: { fontSize: 12.5, color: "#aaa", marginBottom: 8 },
  previewButton: { alignSelf: "flex-start" },
  previewButtonText: { fontSize: 13.5, color: "#5B9EF5", fontWeight: "600" },
});
