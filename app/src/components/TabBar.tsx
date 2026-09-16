import React from "react";
import { View, TouchableOpacity, Text, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../theme/ThemeContext";

export type TabKey = "areas" | "saved" | "search" | "settings";

const TABS: { key: TabKey; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: "areas", label: "Areas", icon: "navigate-outline" },
  { key: "saved", label: "Saved", icon: "heart-outline" },
  { key: "search", label: "Search", icon: "search-outline" },
  { key: "settings", label: "Settings", icon: "settings-outline" },
];

interface Props {
  active: TabKey;
  onPress: (key: TabKey) => void;
}

export function TabBar({ active, onPress }: Props) {
  const { colors } = useTheme();
  return (
    <View style={[styles.bar, { borderBottomColor: colors.border }]}>
      {TABS.map((tab) => {
        const isActive = tab.key === active;
        return (
          <TouchableOpacity key={tab.key} style={styles.tab} onPress={() => onPress(tab.key)}>
            <Ionicons
              name={tab.icon}
              size={21}
              color={isActive ? colors.accent : colors.textMuted}
            />
            <Text style={[styles.label, { color: isActive ? colors.accent : colors.textMuted }]}>
              {tab.label}
            </Text>
            {isActive && <View style={[styles.underline, { backgroundColor: colors.accent }]} />}
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
  },
  tab: {
    flex: 1,
    alignItems: "center",
    gap: 4,
    paddingTop: 10,
    paddingBottom: 10,
  },
  label: { fontSize: 11 },
  underline: {
    position: "absolute",
    bottom: 0,
    height: 2,
    width: "55%",
    borderRadius: 1,
  },
});
