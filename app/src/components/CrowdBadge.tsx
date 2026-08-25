import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { CrowdLevel } from "../types/venue";

// Colour scheme matches SpaceOut.gov.sg (green/yellow/orange/red) since
// that's the crowd-level convention Singapore users already recognise.
const COLORS: Record<CrowdLevel, string> = {
  Low: "#2E7D32",
  Moderate: "#F9A825",
  High: "#EF6C00",
  "Very High": "#C62828",
};

export function CrowdBadge({ level }: { level: CrowdLevel }) {
  return (
    <View style={[styles.badge, { backgroundColor: COLORS[level] }]}>
      <Text style={styles.text}>{level}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    alignSelf: "flex-start",
  },
  text: {
    color: "white",
    fontWeight: "600",
    fontSize: 12,
  },
});
