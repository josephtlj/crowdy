import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { LatLng, RouteSegment } from "../types/directions";
import { useTheme } from "../theme/ThemeContext";

interface Props {
  origin: LatLng;
  destination: LatLng;
  destinationName: string;
  segments: RouteSegment[];
  bottomInset: number;
}

// react-native-maps has no web renderer, same as VenueMap. The step list on
// the Directions screen is the real content here and works everywhere, so
// this only has to explain the missing map rather than replace it.
export function RouteMap(_props: Props) {
  const { colors } = useTheme();

  return (
    <View style={[styles.placeholder, { backgroundColor: colors.surfaceAlt }]}>
      <Text style={[styles.text, { color: colors.textMuted }]}>
        Route map is available in the iOS app.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  placeholder: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: "center",
    alignItems: "center",
  },
  text: { fontSize: 14 },
});
