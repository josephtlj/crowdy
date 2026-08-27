import React from "react";
import { View, TouchableOpacity, Text, StyleSheet, Alert } from "react-native";
import { Ionicons } from "@expo/vector-icons";

export type TabKey = "areas" | "favourites" | "search" | "settings";

const TABS: { key: TabKey; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: "areas", label: "Areas", icon: "navigate-outline" },
  { key: "favourites", label: "Favourites", icon: "heart-outline" },
  { key: "search", label: "Search", icon: "search-outline" },
  { key: "settings", label: "Settings", icon: "settings-outline" },
];

const ACCENT = "#EB5757";
const INACTIVE = "#8a8a8a";

// Favourites/Search/Settings are placeholders - not built yet. Tapping one
// gives a small acknowledgement rather than doing nothing, so the button
// doesn't feel broken while it's unimplemented.
export function TabBar({ active }: { active: TabKey }) {
  return (
    <View style={styles.bar}>
      {TABS.map((tab) => {
        const isActive = tab.key === active;
        return (
          <TouchableOpacity
            key={tab.key}
            style={styles.tab}
            onPress={() => {
              if (!isActive) {
                Alert.alert("Coming soon", `${tab.label} hasn't been built yet.`);
              }
            }}
          >
            <Ionicons name={tab.icon} size={21} color={isActive ? ACCENT : INACTIVE} />
            <Text style={[styles.label, isActive && styles.labelActive]}>{tab.label}</Text>
            {isActive && <View style={styles.underline} />}
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "#2a2a2a",
  },
  tab: {
    flex: 1,
    alignItems: "center",
    gap: 4,
    paddingTop: 10,
    paddingBottom: 10,
  },
  label: { fontSize: 11, color: INACTIVE },
  labelActive: { color: ACCENT, fontWeight: "600" },
  underline: {
    position: "absolute",
    bottom: 0,
    height: 2,
    width: "55%",
    backgroundColor: ACCENT,
    borderRadius: 1,
  },
});
