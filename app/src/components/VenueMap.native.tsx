import React, { useEffect, useRef, useState } from "react";
import { StyleSheet, View, TouchableOpacity, Text, Alert } from "react-native";
import MapView, { Marker, Region, MapPressEvent } from "react-native-maps";
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
  const { mode } = useTheme();
  const mapRef = useRef<MapView>(null);
  // Tracks the map's own last known zoom level so centring (on a selected
  // venue, or on recentring) can keep whatever zoom the User was already
  // at, instead of resetting it - onRegionChange only reports upward, it
  // isn't fed back into the (uncontrolled) map, so this is its own memory.
  const lastRegionRef = useRef<MapRegion>(initialRegion);
  const [recentring, setRecentring] = useState(false);

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

  // The selected marker must draw on top of dimmed ones, or a later,
  // greyed-out pin can visually cover the very pin the User just tapped.
  // zIndex alone isn't reliably honoured cross-platform, so it's also
  // reordered to render last (later markers draw on top on both platforms).
  const orderedVenues = hasSelection
    ? [...venues.filter((v) => v.id !== selectedVenueId), ...venues.filter((v) => v.id === selectedVenueId)]
    : venues;

  return (
    <View style={styles.wrapper}>
      <MapView
        ref={mapRef}
        style={styles.map}
        initialRegion={initialRegion}
        showsUserLocation
        onRegionChangeComplete={handleRegionChangeComplete}
        onPress={handleMapPress}
        userInterfaceStyle={mode} // Apple Maps (iOS default provider)
        customMapStyle={mode === "dark" ? DARK_MAP_STYLE : []} // Google Maps (Android)
      >
        {orderedVenues.map((venue) => {
          const isSelected = venue.id === selectedVenueId;
          const isDimmed = hasSelection && !isSelected;
          return (
            <Marker
              key={venue.id}
              coordinate={{ latitude: venue.lat, longitude: venue.lng }}
              anchor={{ x: 0.5, y: 1 }}
              zIndex={isSelected ? 1 : 0}
              onPress={() => onSelectVenue(venue.id)}
              // No title/description: the native callout bubble this would
              // otherwise show is redundant now that selecting a venue expands
              // its info inline in the list below instead.
              // Custom marker views need this while their appearance is changing
              // (dimming in/out on selection) - off the rest of the time to keep
              // ~200 markers cheap to redraw.
              tracksViewChanges={hasSelection}
            >
              <View style={{ opacity: isDimmed ? 0.3 : 1 }}>
                <CategoryPin category={venue.category} pointer />
              </View>
            </Marker>
          );
        })}
      </MapView>

      <TouchableOpacity
        style={styles.recentreButton}
        onPress={handleRecentre}
        disabled={recentring}
        accessibilityLabel="Recentre map on my location"
      >
        <Text style={styles.recentreIcon}>⌖</Text>
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
    backgroundColor: "white",
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000",
    shadowOpacity: 0.25,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  recentreIcon: { fontSize: 20, color: "#22262b" },
});
