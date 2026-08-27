import React from "react";
import { View, Text, Switch, StyleSheet, ScrollView } from "react-native";
import { useTheme } from "../theme/ThemeContext";

// Placeholder version string - bump manually until a real build/release
// process assigns one.
const APP_VERSION = "1.0.0 (MVP)";

export default function SettingsScreen() {
  const { mode, colors, toggleTheme } = useTheme();

  return (
    <ScrollView
      style={{ backgroundColor: colors.background }}
      contentContainerStyle={styles.content}
    >
      <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>APPEARANCE</Text>
      <View style={[styles.row, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Text style={[styles.rowLabel, { color: colors.text }]}>Dark Mode</Text>
        <Switch
          value={mode === "dark"}
          onValueChange={toggleTheme}
          trackColor={{ false: "#ccc", true: colors.accent }}
        />
      </View>

      <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>ACCOUNT</Text>
      <View style={[styles.row, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <Text style={[styles.rowLabel, { color: colors.text }]}>Not signed in</Text>
        <Text style={[styles.placeholderTag, { color: colors.textMuted }]}>Coming soon</Text>
      </View>

      <Text style={[styles.version, { color: colors.textMuted }]}>Crowdy · {APP_VERSION}</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, flexGrow: 1 },
  sectionLabel: {
    fontSize: 12,
    fontWeight: "600",
    letterSpacing: 0.5,
    marginTop: 20,
    marginBottom: 8,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
  },
  rowLabel: { fontSize: 15, fontWeight: "500" },
  placeholderTag: { fontSize: 13, fontStyle: "italic" },
  version: { textAlign: "center", fontSize: 12, marginTop: 40 },
});
