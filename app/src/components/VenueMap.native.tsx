import React, { useEffect, useRef } from "react";
import { StyleSheet, View } from "react-native";
import MapView, { Marker, Region } from "react-native-maps";
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

  const isLocked = selectedVenueId !== null;

  return (
    <MapView
      ref={mapRef}
      style={styles.map}
      initialRegion={initialRegion}
      showsUserLocation
      onRegionChangeComplete={handleRegionChangeComplete}
      onPress={onDeselect}
      scrollEnabled={!isLocked}
      zoomEnabled={!isLocked}
    >
      {venues.map((venue) => {
        const isDimmed = isLocked && venue.id !== selectedVenueId;
        return (
          <Marker
            key={venue.id}
            coordinate={{ latitude: venue.lat, longitude: venue.lng }}
            title={venue.name}
            description={`${venue.category} · ${venue.crowdLevel} crowd`}
            anchor={{ x: 0.5, y: 1 }}
            onPress={() => onSelectVenue(venue.id)}
            // Custom marker views need this while their appearance is changing
            // (dimming in/out on selection) - off the rest of the time to keep
            // ~200 markers cheap to redraw.
            tracksViewChanges={isLocked}
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
