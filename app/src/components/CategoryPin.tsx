import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { VenueCategory } from "../types/venue";
import { PIN_COLORS, PIN_LABELS } from "./pinColors";

interface Props {
  category: VenueCategory;
  size?: number;
  pointer?: boolean; // map pins get a teardrop tail; list-row badges don't
}

export function CategoryPin({ category, size = 34, pointer = false }: Props) {
  const color = PIN_COLORS[category];
  return (
    <View style={styles.wrapper}>
      <View
        style={[
          styles.circle,
          { width: size, height: size, borderRadius: size / 2, backgroundColor: color },
        ]}
      >
        <Text style={[styles.label, { fontSize: size * 0.32 }]}>{PIN_LABELS[category]}</Text>
      </View>
      {pointer && <View style={[styles.pointer, { borderTopColor: color }]} />}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { alignItems: "center" },
  circle: {
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
    borderColor: "white",
  },
  label: { color: "white", fontWeight: "700" },
  pointer: {
    width: 0,
    height: 0,
    borderLeftWidth: 6,
    borderRightWidth: 6,
    borderTopWidth: 8,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
    marginTop: -1,
  },
});
