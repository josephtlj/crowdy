import React, { useMemo } from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { Venue, CrowdLevel } from "../types/venue";
import { ThemeColors } from "../theme/ThemeContext";
import { useLanguage } from "../i18n/LanguageContext";
import { haversineKm } from "../services/distance";
import { CrowdBadge, CROWD_COLORS, crowdKey } from "./CrowdBadge";

// A quiet mall this close counts as "near you"; past it, the card falls
// back to the quietest open mall anywhere.
const NEAR_KM = 5;

// The "Near you" line: every open mall and station within this distance.
const AROUND_KM = 2;
// Busiest last, so a tie goes to the busier level.
const LEVEL_ORDER: CrowdLevel[] = ["Low", "Moderate", "High", "Very High"];

interface Props {
  venues: Venue[];
  userLocation: { lat: number; lng: number } | null;
  colors: ThemeColors;
  onOpenVenue: (venueId: string) => void;
}

// Sits at the top of the Areas list so the app opens on something useful:
// how busy the malls are right now, and the quietest open one nearby.
// Built only from the venue list already loaded - no extra requests.
export function CrowdSnapshot({ venues, userLocation, colors, onOpenVenue }: Props) {
  const { t } = useLanguage();

  // The level most open venues near you share - a level, not an average
  // percentage, since each mall's percentage is against its own peak and
  // stations have no percentage at all.
  const around = useMemo(() => {
    if (!userLocation) return null;
    const nearby = venues.filter(
      (v) =>
        LEVEL_ORDER.includes(v.crowdLevel) &&
        haversineKm(userLocation.lat, userLocation.lng, v.lat, v.lng) <= AROUND_KM
    );
    if (nearby.length === 0) return { level: null, count: 0 };
    let level: CrowdLevel = "Low";
    let best = -1;
    for (const candidate of LEVEL_ORDER) {
      const n = nearby.filter((v) => v.crowdLevel === candidate).length;
      if (n > 0 && n >= best) {
        level = candidate;
        best = n;
      }
    }
    return { level, count: nearby.length };
  }, [venues, userLocation]);

  const { counts, total, quietest, quietestKm } = useMemo(() => {
    const malls = venues.filter((v) => v.category === "Venue" && v.crowdLevel !== "Unavailable");
    const count = (levels: CrowdLevel[]) => malls.filter((v) => levels.includes(v.crowdLevel)).length;

    const distance = (v: Venue) => (userLocation ? haversineKm(userLocation.lat, userLocation.lng, v.lat, v.lng) : undefined);
    const open = malls
      .filter((v) => v.crowdLevel !== "Closed")
      .map((v) => ({ venue: v, km: distance(v) }));
    const byQuiet = (a: { venue: Venue; km?: number }, b: { venue: Venue; km?: number }) =>
      a.venue.crowdPercent - b.venue.crowdPercent || (a.km ?? 0) - (b.km ?? 0);
    const nearby = open.filter((m) => m.km !== undefined && m.km <= NEAR_KM).sort(byQuiet);
    const pick = nearby[0] ?? [...open].sort(byQuiet)[0];

    return {
      total: malls.length,
      counts: {
        quiet: count(["Low"]),
        moderate: count(["Moderate"]),
        busy: count(["High", "Very High"]),
        closed: count(["Closed"]),
      },
      quietest: pick?.venue,
      quietestKm: pick?.km,
    };
  }, [venues, userLocation]);

  if (total === 0) return null;

  const stats: { key: keyof typeof counts; label: string; color: string }[] = [
    { key: "quiet", label: t("snapshot.quiet", { count: counts.quiet }), color: CROWD_COLORS.Low },
    { key: "moderate", label: t("snapshot.moderate", { count: counts.moderate }), color: CROWD_COLORS.Moderate },
    { key: "busy", label: t("snapshot.busy", { count: counts.busy }), color: CROWD_COLORS.High },
    { key: "closed", label: t("snapshot.closed", { count: counts.closed }), color: CROWD_COLORS.Closed },
  ];

  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      <Text style={[styles.title, { color: colors.text }]}>{t("snapshot.title", { count: total })}</Text>

      <View style={styles.stats}>
        {stats.map((stat) => (
          <View key={stat.key} style={styles.stat}>
            <View style={[styles.dot, { backgroundColor: stat.color }]} />
            <Text style={[styles.statText, { color: colors.textMuted }]}>{stat.label}</Text>
          </View>
        ))}
      </View>

      {around && (
        <View style={[styles.around, { borderTopColor: colors.border }]}>
          <View style={[styles.dot, { backgroundColor: around.level ? CROWD_COLORS[around.level] : CROWD_COLORS.Closed }]} />
          <Text style={[styles.aroundText, { color: colors.text }]}>
            {around.level
              ? t("snapshot.around", { km: AROUND_KM, level: t(crowdKey(around.level)), count: around.count })
              : t("snapshot.aroundClosed", { km: AROUND_KM })}
          </Text>
        </View>
      )}

      {quietest ? (
        <TouchableOpacity
          style={[styles.pick, { borderTopColor: colors.border }]}
          onPress={() => onOpenVenue(quietest.id)}
          accessibilityRole="button"
        >
          <View style={styles.pickText}>
            <Text style={[styles.pickLabel, { color: colors.textMuted }]}>
              {quietestKm !== undefined && quietestKm <= NEAR_KM ? t("snapshot.quietestNear") : t("snapshot.quietestAnywhere")}
            </Text>
            <Text style={[styles.pickName, { color: colors.text }]} numberOfLines={1}>
              {quietest.name}
              {quietestKm !== undefined ? (
                <Text style={{ color: colors.textMuted }}>{`  ·  ${t("detail.kmAway", { distance: quietestKm.toFixed(1) })}`}</Text>
              ) : null}
            </Text>
          </View>
          <CrowdBadge level={quietest.crowdLevel} />
          <Text style={[styles.chevron, { color: colors.textMuted }]}>›</Text>
        </TouchableOpacity>
      ) : (
        <Text style={[styles.allClosed, { borderTopColor: colors.border, color: colors.textMuted }]}>
          {t("snapshot.allClosed")}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: 12,
    marginTop: 4,
    marginBottom: 8,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    paddingTop: 12,
    paddingHorizontal: 14,
  },
  title: { fontSize: 15, fontWeight: "700" },
  stats: { flexDirection: "row", flexWrap: "wrap", columnGap: 14, rowGap: 6, marginTop: 8, marginBottom: 12 },
  stat: { flexDirection: "row", alignItems: "center", gap: 6 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  statText: { fontSize: 13, fontVariant: ["tabular-nums"] },
  around: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  aroundText: { fontSize: 14, flex: 1 },
  pick: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  pickText: { flex: 1 },
  pickLabel: { fontSize: 12 },
  pickName: { fontSize: 15, fontWeight: "600", marginTop: 2 },
  chevron: { fontSize: 20, marginLeft: -2 },
  allClosed: { fontSize: 13, paddingVertical: 12, borderTopWidth: StyleSheet.hairlineWidth },
});
