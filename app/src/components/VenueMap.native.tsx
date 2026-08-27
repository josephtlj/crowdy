import React, { useEffect, useRef } from "react";
import { StyleSheet, View } from "react-native";
import MapView, { Marker, Region, MapPressEvent } from "react-native-maps";
import { Venue } from "../types/venue";
import { MapRegion } from "../types/region";
import { CategoryPin } from "./CategoryPin";

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
  const mapRef = useRef<MapView>(null);
  // Tracks the map's own last known zoom level so centring on a selected
  // venue can keep whatever zoom the User was already at, instead of
  // resetting it - onRegionChange only reports upward, it isn't fed back
  // into the (uncontrolled) map, so this is the map's own memory of it.
  const lastRegionRef = useRef<MapRegion>(initialRegion);

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

  const hasSelection = selectedVenueId !== null;

  return (
    <MapView
      ref={mapRef}
      style={styles.map}
      initialRegion={initialRegion}
      showsUserLocation
      onRegionChangeComplete={handleRegionChangeComplete}
      onPress={handleMapPress}
    >
      {venues.map((venue) => {
        const isDimmed = hasSelection && venue.id !== selectedVenueId;
        return (
          <Marker
            key={venue.id}
            coordinate={{ latitude: venue.lat, longitude: venue.lng }}
            anchor={{ x: 0.5, y: 1 }}
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
  );
}

const styles = StyleSheet.create({
  map: { width: "100%", height: "45%" },
});
