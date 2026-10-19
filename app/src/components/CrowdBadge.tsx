import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { CrowdLevel } from "../types/venue";
import { useLanguage } from "../i18n/LanguageContext";
import { StringKey } from "../i18n/strings";

// Colour scheme matches SpaceOut.gov.sg (green/yellow/orange/red) since
// that's the crowd-level convention Singapore users already recognise.
// Exported so other crowd-level-driven visuals (e.g. StationDot) match this
// exact palette instead of inventing a second one.
export const CROWD_COLORS: Record<CrowdLevel, string> = {
  Low: "#2E7D32",
  Moderate: "#F9A825",
  High: "#EF6C00",
  "Very High": "#C62828",
  Closed: "#757575",
  // Not scraped yet (a mall Popular Times hasn't been cached for), distinct
  // from Closed (which means we checked and it's shut) - a lighter grey so
  // the two don't read as the same thing at a glance.
  Unavailable: "#9E9E9E",
};

export function crowdKey(level: CrowdLevel): StringKey {
  if (level === "Very High") return "crowd.VeryHigh";
  return `crowd.${level}` as StringKey;
}

export function CrowdBadge({ level }: { level: CrowdLevel }) {
  const { t } = useLanguage();
  return (
    <View style={[styles.badge, { backgroundColor: CROWD_COLORS[level] }]}>
      <Text style={styles.text}>{t(crowdKey(level))}</Text>
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
