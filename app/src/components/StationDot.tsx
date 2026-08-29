import React from "react";
import { View, StyleSheet } from "react-native";
import { CrowdLevel } from "../types/venue";
import { CROWD_COLORS } from "./CrowdBadge";

interface Props {
  level: CrowdLevel;
  dimmed?: boolean;
}

// A station sitting on a drawn rail line reads as a station from context
// alone - unlike CategoryPin (used for malls/attractions scattered with no
// such context), this needs no category label, just a crowd-colour fill so
// the line itself communicates "red/yellow/green stops along this route".
export function StationDot({ level, dimmed = false }: Props) {
  return (
    <View
      style={[
        styles.dot,
        { backgroundColor: CROWD_COLORS[level], opacity: dimmed ? 0.3 : 1 },
      ]}
    />
  );
}

const styles = StyleSheet.create({
  dot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: "white",
  },
});
