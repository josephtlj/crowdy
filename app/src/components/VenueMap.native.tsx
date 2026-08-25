import React from "react";
import { StyleSheet } from "react-native";
import MapView, { Marker } from "react-native-maps";
import { Venue } from "../types/venue";
import { MapRegion } from "../types/region";
import { PIN_COLORS } from "./pinColors";

interface Props {
  initialRegion: MapRegion;
  venues: Venue[];
  onSelectVenue: (venueId: string) => void;
  onRegionChange: (region: MapRegion) => void;
}

// Metro picks this file automatically on iOS/Android (see VenueMap.web.tsx
// for the web fallback) - react-native-maps never enters the web bundle.
export function VenueMap({ initialRegion, venues, onSelectVenue, onRegionChange }: Props) {
  return (
    <MapView
      style={styles.map}
      initialRegion={initialRegion}
      showsUserLocation
      onRegionChangeComplete={onRegionChange}
    >
      {venues.map((venue) => (
        <Marker
          key={venue.id}
          coordinate={{ latitude: venue.lat, longitude: venue.lng }}
          title={venue.name}
          description={`${venue.category} · ${venue.crowdLevel} crowd`}
          pinColor={PIN_COLORS[venue.category]}
          onPress={() => onSelectVenue(venue.id)}
        />
      ))}
    </MapView>
  );
}

const styles = StyleSheet.create({
  map: { width: "100%", height: "45%" },
});
