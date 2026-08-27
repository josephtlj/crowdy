import React from "react";
import { View, Text, FlatList, StyleSheet } from "react-native";
import { Venue } from "../types/venue";
import { CategoryPin } from "../components/CategoryPin";
import { CrowdBadge } from "../components/CrowdBadge";
import { useTheme } from "../theme/ThemeContext";

// Static mock data for the Lab 1 UI Mockup screenshot only - this is not
// the real Favourites feature (that's account/device-based, per the Lab 1
// spec, and still unbuilt). Numbers/timestamps are illustrative, not live.
const MOCK_FAVOURITES: Venue[] = [
  {
    id: "mock-vivocity",
    name: "VivoCity",
    category: "Mall",
    address: "1 HarbourFront Walk",
    lat: 1.264,
    lng: 103.8222,
    crowdPercent: 78,
    crowdLevel: "High",
    source: "Mock",
    lastUpdated: new Date().toISOString(),
  },
  {
    id: "mock-harbourfront-mrt",
    name: "HarbourFront MRT",
    category: "MRT",
    address: "HarbourFront MRT Station",
    lat: 1.2653,
    lng: 103.82,
    crowdPercent: 22,
    crowdLevel: "Low",
    source: "Mock",
    lastUpdated: new Date().toISOString(),
  },
  {
    id: "mock-maxwell",
    name: "Maxwell Food Centre",
    category: "Hawker",
    address: "1 Kadayanallur St",
    lat: 1.2802,
    lng: 103.8447,
    crowdPercent: 54,
    crowdLevel: "Moderate",
    source: "Mock",
    lastUpdated: new Date().toISOString(),
  },
  {
    id: "mock-gardens",
    name: "Gardens by the Bay",
    category: "Attraction",
    address: "18 Marina Gardens Dr",
    lat: 1.2816,
    lng: 103.8636,
    crowdPercent: 41,
    crowdLevel: "Moderate",
    source: "Mock",
    lastUpdated: new Date().toISOString(),
  },
];

export default function FavouritesScreen() {
  const { colors } = useTheme();

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <FlatList
        data={MOCK_FAVOURITES}
        keyExtractor={(item) => item.id}
        ListEmptyComponent={
          <Text style={[styles.empty, { color: colors.textMuted }]}>No favourites yet.</Text>
        }
        renderItem={({ item }) => (
          <View style={[styles.row, { borderBottomColor: colors.border }]}>
            <CategoryPin category={item.category} size={32} />
            <View style={styles.rowText}>
              <Text style={[styles.name, { color: colors.text }]}>{item.name}</Text>
              <Text style={[styles.meta, { color: colors.textMuted }]}>{item.category}</Text>
            </View>
            <CrowdBadge level={item.crowdLevel} />
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  empty: { textAlign: "center", padding: 24 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowText: { flex: 1 },
  name: { fontSize: 16, fontWeight: "600" },
  meta: { fontSize: 13, marginTop: 2 },
});
