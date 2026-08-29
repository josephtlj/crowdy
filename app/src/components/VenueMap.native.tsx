import React, { useEffect, useRef, useState } from "react";
import { StyleSheet, View, TouchableOpacity, Text, Alert } from "react-native";
import MapView, { Marker, Region, MapPressEvent } from "react-native-maps";
// Wraps MapView with screen-proximity clustering (built on supercluster) -
// mixed across all venue categories, purely based on on-screen overlap at
// the current zoom level, not category or region. Its own `mapRef` prop
// (not a plain `ref`) is how it exposes the underlying MapView instance.
import ClusterMapView from "react-native-map-clustering";
import * as Location from "expo-location";
import { Venue } from "../types/venue";
import { MapRegion } from "../types/region";
import { CategoryPin } from "./CategoryPin";
import { useTheme } from "../theme/ThemeContext";
import { DARK_MAP_STYLE } from "../theme/darkMapStyle";

interface Props {
  initialRegion: MapRegion;
  venues: Venue[];
  selectedVenueId: string | null;
  onSelectVenue: (venueId: string) => void;
  onDeselect: () => void;
  onRegionChange: (region: MapRegion) => void;
}

// Metro picks this file automatically on iOS/Android (see VenueMap.web.tsx
// for the web fallback) - react-native-maps never enters the web bundle.
export function VenueMap({
  initialRegion,
  venues,
  selectedVenueId,
  onSelectVenue,
  onDeselect,
  onRegionChange,
}: Props) {
  const { mode, colors } = useTheme();
  const mapRef = useRef<MapView>(null);
  // Tracks the map's own last known zoom level so centring (on a selected
  // venue, or on recentring) can keep whatever zoom the User was already
  // at, instead of resetting it - onRegionChange only reports upward, it
  // isn't fed back into the (uncontrolled) map, so this is its own memory.
  const lastRegionRef = useRef<MapRegion>(initialRegion);
  const [recentring, setRecentring] = useState(false);
  // Markers currently allowed to re-snapshot themselves. Previously this was
  // `hasSelection` applied to all ~200 markers at once - true for the entire
  // time any pin stayed selected, not just while switching. Forcing every
  // marker to continuously re-render its native snapshot simultaneously is
  // what was causing pins to intermittently render blank (the native side
  // couldn't keep up). Only the marker(s) whose actual appearance changes in
  // a given transition need this, and only for the brief moment they change.
  const [trackingIds, setTrackingIds] = useState<Set<string>>(new Set());
  const prevSelectedRef = useRef<string | null>(null);

  useEffect(() => {
    if (!selectedVenueId) return;
    const venue = venues.find((v) => v.id === selectedVenueId);
    if (!venue) return;
    const { latitudeDelta, longitudeDelta } = lastRegionRef.current;
    // One-time snap to centre on the newly selected venue - after this the
    // User can freely pan/zoom away again, nothing keeps pulling it back.
    mapRef.current?.animateToRegion(
      { latitude: venue.lat, longitude: venue.lng, latitudeDelta, longitudeDelta },
      300
    );
  }, [selectedVenueId, venues]);

  useEffect(() => {
    const prevSelected = prevSelectedRef.current;
    const wasSelectionActive = prevSelected !== null;
    const isSelectionActive = selectedVenueId !== null;

    // Entering or leaving "some pin selected" changes every marker's dim
    // state at once (all dim in, or all dim out) - everyone needs to
    // re-snapshot. Switching directly from one selected pin to another only
    // changes those two markers' appearance; the rest were already dimmed
    // and stay that way, so they don't need to redraw at all.
    const ids =
      wasSelectionActive !== isSelectionActive
        ? new Set(venues.map((v) => v.id))
        : new Set([prevSelected, selectedVenueId].filter((id): id is string => id !== null));

    prevSelectedRef.current = selectedVenueId;
    setTrackingIds(ids);

    if (ids.size === 0) return;
    // Give the native map a short settling window to capture the new
    // snapshot, then freeze it again - keeping ~200 markers permanently
    // trackable is what caused the blank-pin bug in the first place.
    const timer = setTimeout(() => setTrackingIds(new Set()), 500);
    return () => clearTimeout(timer);
  }, [selectedVenueId, venues]);

  const handleRegionChangeComplete = (region: Region) => {
    lastRegionRef.current = {
      latitude: region.latitude,
      longitude: region.longitude,
      latitudeDelta: region.latitudeDelta,
      longitudeDelta: region.longitudeDelta,
    };
    onRegionChange(lastRegionRef.current);
  };

  // Tapping a Marker can also bubble up to the MapView's own onPress on
  // Android (a known react-native-maps quirk) - without this check, that
  // immediately deselected whatever the Marker press just selected.
  // nativeEvent.action distinguishes a genuine empty-map tap from one that
  // originated on a marker.
  const handleMapPress = (event: MapPressEvent) => {
    if (event.nativeEvent.action === "marker-press") return;
    onDeselect();
  };

  const handleRecentre = async () => {
    setRecentring(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        Alert.alert(
          "Location access needed",
          "Enable location access for Crowdy in Settings to recentre the map."
        );
        return;
      }
      const position = await Location.getCurrentPositionAsync({});
      const { latitudeDelta, longitudeDelta } = lastRegionRef.current;
      mapRef.current?.animateToRegion(
        {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          latitudeDelta,
          longitudeDelta,
        },
        300
      );
    } finally {
      setRecentring(false);
    }
  };

  const hasSelection = selectedVenueId !== null;

  return (
    <View style={styles.wrapper}>
      <ClusterMapView
        mapRef={(map: MapView) => {
          mapRef.current = map;
        }}
        style={styles.map}
        initialRegion={initialRegion}
        showsUserLocation
        onRegionChangeComplete={handleRegionChangeComplete}
        onPress={handleMapPress}
        userInterfaceStyle={mode} // Apple Maps (iOS default provider)
        customMapStyle={mode === "dark" ? DARK_MAP_STYLE : []} // Google Maps (Android)
        // Insets the native map chrome (Apple's legal/attribution link,
        // Google's logo/compass) away from the map's own edges - without
        // this, the bottom sheet's -20 overlap (see HomeScreen's marginTop)
        // clips straight through the attribution text at the bottom-left.
        mapPadding={{ top: 0, right: 0, bottom: 28, left: 0 }}
        clusterColor={colors.accent}
        clusterTextColor="#FFFFFF"
      >
        {venues.map((venue) => {
          const isSelected = venue.id === selectedVenueId;
          const isDimmed = hasSelection && !isSelected;
          return (
            <Marker
              key={venue.id}
              coordinate={{ latitude: venue.lat, longitude: venue.lng }}
              anchor={{ x: 0.5, y: 1 }}
              onPress={() => onSelectVenue(venue.id)}
              // No title/description: the native callout bubble this would
              // otherwise show is redundant now that selecting a venue expands
              // its info inline in the list below instead.
              tracksViewChanges={trackingIds.has(venue.id)}
            >
              <View style={{ opacity: isDimmed ? 0.3 : 1 }}>
                <CategoryPin category={venue.category} pointer />
              </View>
            </Marker>
          );
        })}
      </ClusterMapView>

      <TouchableOpacity
        style={[
          styles.recentreButton,
          { backgroundColor: mode === "dark" ? "#000000" : "#FFFFFF" },
        ]}
        onPress={handleRecentre}
        disabled={recentring}
        accessibilityLabel="Recentre map on my location"
      >
        <Text style={[styles.recentreIcon, { color: colors.accent }]}>⌖</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { width: "100%", height: "58%" },
  map: { width: "100%", height: "100%" },
  recentreButton: {
    position: "absolute",
    right: 14,
    // The sheet below overlaps the map by 20 (its own negative marginTop),
    // so this needs to clear that or the sheet's rounded corner covers it.
    bottom: 34,
    width: 42,
    height: 42,
    borderRadius: 21,
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000",
    shadowOpacity: 0.25,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  recentreIcon: { fontSize: 20 },
});
