import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { LatLng, RouteSegment } from "../types/directions";
import { useTheme } from "../theme/ThemeContext";

export interface GroupRouteLine {
  name: string;
  color: string;
  origin: LatLng;
  segments: RouteSegment[];
}

interface Props {
  destination: LatLng;
  destinationName: string;
  lines: GroupRouteLine[];
  highlighted: number | null;
  bottomInset: number;
}

// react-native-maps has no web renderer, same as RouteMap. The itinerary
// list under the map still works everywhere.
export function GroupRouteMap(_props: Props) {
  const { colors } = useTheme();

  return (
    <View style={[styles.placeholder, { backgroundColor: colors.surfaceAlt }]}>
      <Text style={[styles.text, { color: colors.textMuted }]}>Route map is available in the iOS app.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  placeholder: { position: "absolute", top: 0, left: 0, right: 0, bottom: 0, justifyContent: "center", alignItems: "center" },
  text: { fontSize: 14 },
});
