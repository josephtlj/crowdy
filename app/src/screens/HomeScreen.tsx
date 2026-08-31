import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Platform,
  ActivityIndicator,
  Alert,
} from "react-native";
import * as Location from "expo-location";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { RootStackParamList } from "../navigation/types";
import { Venue } from "../types/venue";
import { MapRegion } from "../types/region";
import { RailLineSegment } from "../types/railLine";
import { LayerState, isVenueInLayers } from "../types/layers";
import { getNearbyVenues, getRailLines } from "../services/api";
import { haversineKm } from "../services/distance";
import { CrowdBadge } from "../components/CrowdBadge";
import { CategoryPin } from "../components/CategoryPin";
import { VenueMap } from "../components/VenueMap";
import { TabBar, TabKey } from "../components/TabBar";
import { useTheme } from "../theme/ThemeContext";

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
  const { colors } = useTheme();
  const [venues, setVenues] = useState<Venue[]>([]);
  const [railLines, setRailLines] = useState<RailLineSegment[]>([]);
  const [region, setRegion] = useState<MapRegion | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedVenueId, setSelectedVenueId] = useState<string | null>(null);
  // "Areas" and "Saved" both stay on this screen - only the list beneath the
  // map swaps, matching the Singabus-style inline tab switch rather than
  // navigating to a second page.
  const [activeTab, setActiveTab] = useState<TabKey>("areas");
  // Off by default - like Google/Apple Maps' own "explore" view, nothing
  // custom is drawn until the User picks a layer. Lives here (not in
  // VenueMap) so the list below can filter to match what's on the map.
  const [layers, setLayers] = useState<LayerState>({
    transit: false,
    venue: false,
  });

  const listRef = useRef<FlatList<Venue>>(null);

  // Tapping the already-selected pin/row again deselects it, matching
  // ordinary toggle-select behaviour.
  const toggleSelection = (venueId: string) => {
    setSelectedVenueId((current) => (current === venueId ? null : venueId));
  };

  // Selecting a venue re-centres the map on it, which re-sorts the list so
  // that venue lands at the top (nearest the new viewport centre) - but
  // FlatList doesn't follow a reorder with its own scroll position, so
  // without this the User is left scrolled wherever they were, looking at
  // the wrong rows while the actual selected venue sits off-screen above.
  useEffect(() => {
    if (selectedVenueId) {
      listRef.current?.scrollToOffset({ offset: 0, animated: true });
    }
  }, [selectedVenueId]);

  const handleToggleLayer = (key: keyof LayerState) => {
    setLayers((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleTabPress = (key: TabKey) => {
    if (key === "settings") return navigation.navigate("Settings");
    if (key === "search") return Alert.alert("Coming soon", "Search hasn't been built yet.");
    setActiveTab(key); // "areas" or "saved"
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

  // Static geometry, unrelated to the User's location - fetched once
  // independently rather than blocking the location/venues load above.
  useEffect(() => {
    getRailLines().then(setRailLines);
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

  // No real saving mechanism exists yet (no favourite toggle anywhere in the
  // app) - this stays empty until that's built, rather than showing mock data.
  const savedVenues: Venue[] = [];
  // The list mirrors whatever layers are toggled on, same as the map - a
  // venue type with its layer off shouldn't appear in one place but not the
  // other.
  const layeredVenues = useMemo(
    () => visibleVenues.filter((venue) => isVenueInLayers(venue, layers)),
    [visibleVenues, layers]
  );
  const listData = activeTab === "saved" ? savedVenues : layeredVenues;
  const noLayersOn = !layers.transit && !layers.venue;

  if (loading || !region) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <VenueMap
        initialRegion={region}
        venues={venues}
        railLines={railLines}
        layers={layers}
        onToggleLayer={handleToggleLayer}
        selectedVenueId={selectedVenueId}
        onSelectVenue={toggleSelection}
        onDeselect={() => setSelectedVenueId(null)}
        onRegionChange={setRegion}
      />

      <Text style={[styles.brand, { top: insets.top + 8 }]}>Crowdy</Text>

      <View style={[styles.sheet, { backgroundColor: colors.background }]}>
        <TabBar active={activeTab} onPress={handleTabPress} />

        <FlatList
          ref={listRef}
          style={styles.list}
          data={listData}
          keyExtractor={(item) => item.id}
          extraData={selectedVenueId}
          ListEmptyComponent={
            <Text style={[styles.empty, { color: colors.textMuted }]}>
              {activeTab === "saved"
                ? "No saved areas."
                : noLayersOn
                  ? "Toggle on venue types to view crowds."
                  : "No venues in view - pan or zoom out the map."}
            </Text>
          }
          renderItem={({ item }) => {
            const isSelected = item.id === selectedVenueId;
            return (
              <View style={[styles.rowWrapper, { borderBottomColor: colors.border }]}>
                <TouchableOpacity style={styles.row} onPress={() => toggleSelection(item.id)}>
                  <CategoryPin category={item.category} size={32} />
                  <View style={styles.rowText}>
                    <Text style={[styles.name, { color: colors.text }]}>{item.name}</Text>
                    <Text style={[styles.meta, { color: colors.textMuted }]}>
                      {item.category} · {item.distanceKm?.toFixed(1)} km away
                    </Text>
                  </View>
                  <CrowdBadge level={item.crowdLevel} />
                </TouchableOpacity>

                {isSelected && (
                  <View style={styles.preview}>
                    <Text style={[styles.previewText, { color: colors.textMuted }]}>
                      {item.crowdPercent}% of peak · updated{" "}
                      {new Date(item.lastUpdated).toLocaleTimeString()} · {item.source}
                    </Text>
                    {/* Transit stations are fixed destinations, not interchangeable
                        like malls/attractions - no "alternative" makes sense. */}
                    {item.category !== "Transit" && (
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

const styles = StyleSheet.create({
  container: { flex: 1 },
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
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    marginTop: -20,
    paddingTop: 8,
    overflow: "hidden",
  },
  list: { flex: 1 },
  empty: { textAlign: "center", padding: 24 },
  rowWrapper: {
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
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
