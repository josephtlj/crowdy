import React from "react";
import { StyleSheet, View } from "react-native";
import MapView, { Marker } from "react-native-maps";
import { Venue } from "../types/venue";
import { MapRegion } from "../types/region";
import { CategoryPin } from "./CategoryPin";

interface Props {
  initialRegion: MapRegion;
  venues: Venue[];
  selectedVenueId: string | null;
  onSelectVenue: (venueId: string) => void;
  onRegionChange: (region: MapRegion) => void;
}

// Metro picks this file automatically on iOS/Android (see VenueMap.web.tsx
// for the web fallback) - react-native-maps never enters the web bundle.
export function VenueMap({
  initialRegion,
  venues,
  selectedVenueId,
  onSelectVenue,
  onRegionChange,
}: Props) {
  return (
    <MapView
      style={styles.map}
      initialRegion={initialRegion}
      showsUserLocation
      onRegionChangeComplete={onRegionChange}
    >
      {venues.map((venue) => {
        const isDimmed = selectedVenueId !== null && venue.id !== selectedVenueId;
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
            tracksViewChanges={selectedVenueId !== null}
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
