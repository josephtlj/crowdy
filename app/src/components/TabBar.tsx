import React from "react";
import { View, TouchableOpacity, Text, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "../theme/ThemeContext";
import { useLanguage } from "../i18n/LanguageContext";
import { StringKey } from "../i18n/strings";

export type TabKey = "areas" | "saved" | "search" | "settings";

const TABS: { key: TabKey; label: StringKey; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: "areas", label: "tab.areas", icon: "navigate-outline" },
  { key: "saved", label: "tab.saved", icon: "heart-outline" },
  { key: "search", label: "tab.search", icon: "search-outline" },
  { key: "settings", label: "tab.settings", icon: "settings-outline" },
];

interface Props {
  active: TabKey;
  onPress: (key: TabKey) => void;
}

export function TabBar({ active, onPress }: Props) {
  const { colors } = useTheme();
  const { t } = useLanguage();
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
              {t(tab.label)}
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
