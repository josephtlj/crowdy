import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { Venue } from "../types/venue";
import { MapRegion } from "../types/region";
import { RailLineSegment } from "../types/railLine";

interface Props {
  initialRegion: MapRegion;
  venues: Venue[];
  railLines: RailLineSegment[];
  selectedVenueId: string | null;
  onSelectVenue: (venueId: string) => void;
  onDeselect: () => void;
  onRegionChange: (region: MapRegion) => void;
}

// react-native-maps has no web renderer. Metro picks this file over
// VenueMap.native.tsx when bundling for web, so react-native-maps is never
// imported in the web build at all.
export function VenueMap(_props: Props) {
  return (
    <View style={styles.placeholder}>
      <Text style={styles.text}>Map view is available in the iOS/Android app.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  placeholder: {
    width: "100%",
    height: 120,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#eee",
  },
  text: { color: "#666" },
});
