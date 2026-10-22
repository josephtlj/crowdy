import React, { useMemo, useState } from "react";
import { Modal, View, Text, TextInput, FlatList, TouchableOpacity, StyleSheet } from "react-native";
import { Venue } from "../types/venue";
import { useTheme } from "../theme/ThemeContext";
import { useLanguage } from "../i18n/LanguageContext";
import { venueSearchRank } from "../services/venueSearch";

interface Props {
  visible: boolean;
  stations: Venue[];
  onSelect: (stationId: string) => void;
  onClose: () => void;
}

/**
 * A searchable list of MRT/LRT stations, shown as a sheet, for picking where
 * someone starts from.
 */
export function StationPicker({ visible, stations, onSelect, onClose }: Props) {
  const { colors } = useTheme();
  const { t } = useLanguage();
  const [query, setQuery] = useState("");

  const results = useMemo(() => {
    const q = query.trim();
    if (!q) return [...stations].sort((a, b) => a.name.localeCompare(b.name));
    return stations
      .map((s) => ({ s, rank: venueSearchRank(s, q) }))
      .filter((hit): hit is { s: Venue; rank: number } => hit.rank !== null)
      .sort((a, b) => a.rank - b.rank || a.s.name.localeCompare(b.s.name))
      .map((hit) => hit.s);
  }, [stations, query]);

  const close = () => {
    setQuery("");
    onClose();
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={close}>
      <View style={[styles.sheet, { backgroundColor: colors.background }]}>
        <View style={styles.header}>
          <Text style={[styles.title, { color: colors.text }]}>{t("meetup.chooseStation")}</Text>
          <TouchableOpacity onPress={close} hitSlop={10}>
            <Text style={[styles.close, { color: colors.accent }]}>{t("common.close")}</Text>
          </TouchableOpacity>
        </View>
        <TextInput
          style={[styles.search, { color: colors.text, borderColor: colors.border, backgroundColor: colors.surface }]}
          value={query}
          onChangeText={setQuery}
          placeholder={t("station.search")}
          placeholderTextColor={colors.textMuted}
          autoCorrect={false}
          autoCapitalize="none"
          clearButtonMode="while-editing"
        />
        <FlatList
          data={results}
          keyExtractor={(s) => s.id}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[styles.row, { borderBottomColor: colors.border }]}
              onPress={() => {
                setQuery("");
                onSelect(item.id);
              }}
            >
              <Text style={[styles.rowText, { color: colors.text }]}>{item.name}</Text>
            </TouchableOpacity>
          )}
        />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  sheet: { flex: 1, paddingTop: 16 },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 16 },
  title: { fontSize: 17, fontWeight: "700" },
  close: { fontSize: 16, fontWeight: "600" },
  search: {
    margin: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
  },
  row: { paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  rowText: { fontSize: 15 },
});
