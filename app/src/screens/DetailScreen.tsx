import React, { useCallback, useEffect, useLayoutEffect, useState } from "react";
import { View, Text, ScrollView, StyleSheet, ActivityIndicator, TouchableOpacity, Pressable } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { RootStackParamList } from "../navigation/types";
import { Venue } from "../types/venue";
import {
  getVenueById,
  getAlternatives,
  refreshPopularTimesForVenue,
  refreshPopularTimesManually,
  ManualRefreshStatus,
  getFavourites,
  saveFavourite,
  unsaveFavourite,
  ApiError,
} from "../services/api";
import { loadSavedVenueIds, persistSavedVenueIds } from "../services/savedVenues";
import { CrowdBadge } from "../components/CrowdBadge";
import { PopularTimesChart } from "../components/PopularTimesChart";
import { VenueHours } from "../components/VenueHours";
import { formatUpdatedAt } from "../services/updatedAt";
import { useTheme } from "../theme/ThemeContext";
import { useAuth } from "../context/AuthContext";
import { useLanguage } from "../i18n/LanguageContext";
import { sourceLabel, StringKey } from "../i18n/strings";

const REFRESH_NOTES: Record<ManualRefreshStatus, StringKey> = {
  updated: "detail.refreshUpdated",
  recent: "detail.refreshRecent",
  shared: "detail.refreshShared",
  failed: "detail.refreshFailed",
};

type Props = NativeStackScreenProps<RootStackParamList, "Detail">;

export default function DetailScreen({ route, navigation }: Props) {
  const { venueId } = route.params;
  const { colors } = useTheme();
  const auth = useAuth();
  const { t, language } = useLanguage();
  const [venue, setVenue] = useState<Venue | null>(null);
  const [alternatives, setAlternatives] = useState<Venue[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshingCrowd, setRefreshingCrowd] = useState(false);
  // What the last tap on Refresh did, shown under the Updated line.
  const [refreshNote, setRefreshNote] = useState<StringKey | null>(null);
  const [selectedHour, setSelectedHour] = useState(new Date().getHours());
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const loadSaved = auth.token
      ? getFavourites(auth.token).then((ids) => ids.includes(venueId))
      : loadSavedVenueIds().then((ids) => ids.has(venueId));
    loadSaved
      .then((isSaved) => {
        if (!cancelled) setSaved(isSaved);
      })
      .catch((err) => {
        console.error("Failed to load saved state:", err);
        if (err instanceof ApiError && err.status === 401) auth.logout();
      });
    return () => {
      cancelled = true;
    };
  }, [venueId, auth.token, auth.logout]);

  const toggleSaved = useCallback(() => {
    setSaved((current) => {
      const next = !current;
      if (auth.token) {
        const sync = next ? saveFavourite(auth.token, venueId) : unsaveFavourite(auth.token, venueId);
        sync.catch((err) => {
          console.error("Failed to sync favourite to account:", err);
          if (err instanceof ApiError && err.status === 401) auth.logout();
        });
      } else {
        loadSavedVenueIds().then((ids) => {
          if (next) ids.add(venueId);
          else ids.delete(venueId);
          return persistSavedVenueIds(ids);
        });
      }
      return next;
    });
  }, [auth, venueId]);

  useLayoutEffect(() => {
    navigation.setOptions({
      headerRight: () => (
        <TouchableOpacity
          onPress={toggleSaved}
          hitSlop={10}
          style={styles.headerSave}
          accessibilityLabel={saved ? t("detail.unsave") : t("detail.save")}
        >
          <Ionicons name={saved ? "heart" : "heart-outline"} size={22} color={saved ? colors.accent : colors.text} />
        </TouchableOpacity>
      ),
    });
  }, [navigation, toggleSaved, saved, colors.accent, colors.text, t]);

  useEffect(() => {
    (async () => {
      const found = await getVenueById(venueId);
      if (found) {
        setVenue(found);
        // Transit stations are fixed destinations, not interchangeable like
        // malls/attractions - no "alternative" makes sense for them.
        setAlternatives(found.category === "Transit" ? [] : await getAlternatives(found));
      }
      setLoading(false);

      // Shows the cached reading immediately (above), then kicks off a real
      // fresh scrape for just this one venue in the background - takes the
      // full ~15-20s, so this stays non-blocking rather than holding up the
      // page. Transit already has real, official LTA crowd data, so this
      // only applies to malls.
      if (found && found.category !== "Transit") {
        setRefreshingCrowd(true);
        const fresh = await refreshPopularTimesForVenue(venueId);
        if (fresh) {
          setVenue((current) =>
            current && current.id === venueId
              ? { ...current, ...fresh }
              : current
          );
        }
        setRefreshingCrowd(false);
      }
    })();
  }, [venueId]);

  // The user tapped Refresh: scrape this mall now (or fetch the latest shared
  // data on a backend that doesn't scrape) and say what happened.
  async function refreshNow() {
    if (refreshingCrowd) return;
    setRefreshingCrowd(true);
    setRefreshNote(null);
    try {
      const { status, ...fresh } = await refreshPopularTimesManually(venueId);
      setVenue((current) => (current && current.id === venueId ? { ...current, ...fresh } : current));
      setRefreshNote(REFRESH_NOTES[status]);
    } catch (err) {
      setRefreshNote(err instanceof ApiError && err.status === 429 ? "detail.refreshTooMany" : "detail.refreshFailed");
    } finally {
      setRefreshingCrowd(false);
    }
  }

  if (loading) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (!venue) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.background }]}>
        <Text style={{ color: colors.text }}>{t("detail.notFound")}</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.content}
    >
      {/* The chart's bars fill its own width edge to edge, leaving nowhere
          inside it to tap for "deselect" - so tapping away from the chart
          resets it, scoped to the whole screen's content instead. A tap
          that lands on a bar (or the alternatives rows below) is still
          claimed by that element's own Touchable first and never reaches
          this handler, same as any nested RN touch target. */}
      <Pressable onPress={() => setSelectedHour(new Date().getHours())}>
      <Text style={[styles.name, { color: colors.text }]}>{venue.name}</Text>
      <Text style={[styles.address, { color: colors.textMuted }]}>{venue.address}</Text>

      <View style={styles.crowdRow}>
        <CrowdBadge level={venue.crowdLevel} />
        {/* LTA only gives a low/moderate/high category, never a real number -
            showing "20%/50%/80%" implied a precision that doesn't exist.
            "Unavailable" means no reading exists yet - showing "0% of peak"
            next to it would misread as an actual low-crowd measurement. */}
        {venue.category !== "Transit" && venue.crowdLevel !== "Unavailable" && (
          <Text style={[styles.percent, { color: colors.text }]}>
            {t("detail.percentOfPeak", { percent: venue.crowdPercent })}
          </Text>
        )}
      </View>

      <View style={styles.updatedRow}>
        <Text style={[styles.updated, styles.updatedText, { color: colors.textMuted }]}>
          {t("detail.updated", {
            time: formatUpdatedAt(venue.lastUpdated, language),
            source: sourceLabel(venue.source, language),
          })}
        </Text>
        {/* Malls only - station crowds come live from LTA and need no refresh. */}
        {venue.category !== "Transit" && (
          <TouchableOpacity
            onPress={refreshNow}
            disabled={refreshingCrowd}
            style={[styles.refreshPill, { borderColor: colors.accent, opacity: refreshingCrowd ? 0.6 : 1 }]}
            accessibilityLabel={t("detail.refresh")}
          >
            {refreshingCrowd ? (
              <ActivityIndicator size="small" color={colors.accent} />
            ) : (
              <Ionicons name="refresh" size={13} color={colors.accent} />
            )}
            <Text style={[styles.refreshLabel, { color: colors.accent }]}>
              {refreshingCrowd ? t("detail.refreshing") : t("detail.refresh")}
            </Text>
          </TouchableOpacity>
        )}
      </View>
      {refreshNote && (
        <Text style={[styles.updated, styles.refreshNote, { color: colors.textMuted }]}>{t(refreshNote)}</Text>
      )}

      <TouchableOpacity
        style={[styles.directionsButton, { backgroundColor: colors.accent }]}
        onPress={() => navigation.navigate("Directions", { venueId: venue.id })}
      >
        <Ionicons name="navigate" size={17} color="#FFFFFF" />
        <Text style={styles.directionsLabel}>{t("detail.directions")}</Text>
      </TouchableOpacity>

      {/* Transit already has real, official LTA crowd data - this is only
          useful for Venues, where the crowd figure above comes from Popular
          Times (or is still "Unavailable" until the automatic refresh
          above finishes, or the batch scheduler's own daily pass reaches
          it - either way, nothing for the user to manually trigger). */}
      {venue.category !== "Transit" && (
        <View style={styles.section}>
          {venue.hours && <VenueHours hours={venue.hours} />}
          <Text style={[styles.sectionTitle, { color: colors.text }]}>{t("detail.typical")}</Text>
          {venue.hourly && venue.hourly.length > 0 ? (
            <PopularTimesChart
              hourly={venue.hourly}
              selectedHour={selectedHour}
              onSelectHour={setSelectedHour}
            />
          ) : (
            <Text style={[styles.meta, { color: colors.textMuted }]}>
              {t("detail.noCrowd")}
            </Text>
          )}
        </View>
      )}

      {venue.carparks && venue.carparks.length > 0 && (
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>{t("detail.parking")}</Text>
          {venue.carparks.map((cp) => (
            <Text key={cp.label} style={[styles.meta, { color: colors.textMuted }]}>
              {t("detail.lots", { label: cp.label, count: cp.availableLots })}
            </Text>
          ))}
        </View>
      )}

      {alternatives.length > 0 && (
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>
            {t("detail.alternatives")}
          </Text>
          {alternatives.map((alt) => (
            <TouchableOpacity
              key={alt.id}
              style={[styles.altRow, { borderBottomColor: colors.border }]}
              onPress={() => navigation.push("Detail", { venueId: alt.id })}
            >
              <View style={styles.rowText}>
                <Text style={[styles.altName, { color: colors.text }]}>{alt.name}</Text>
                <Text style={[styles.meta, { color: colors.textMuted }]}>
                  {t("detail.kmAway", { distance: alt.distanceKm?.toFixed(1) ?? "" })}
                </Text>
              </View>
              <CrowdBadge level={alt.crowdLevel} />
            </TouchableOpacity>
          ))}
        </View>
      )}
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16 },
  centered: { flex: 1, justifyContent: "center", alignItems: "center" },
  // iOS draws the round button around header items itself - any margin
  // here pushes the icon off-centre inside it.
  headerSave: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
  name: { fontSize: 22, fontWeight: "700" },
  address: { fontSize: 14, marginTop: 4 },
  crowdRow: { flexDirection: "row", alignItems: "center", marginTop: 16, gap: 10 },
  percent: { fontSize: 14 },
  updatedRow: { flexDirection: "row", alignItems: "center", marginTop: 8, gap: 10 },
  updated: { fontSize: 12 },
  updatedText: { flex: 1 },
  refreshPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  refreshLabel: { fontSize: 12.5, fontWeight: "600" },
  refreshNote: { marginTop: 6 },
  directionsButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 18,
    paddingVertical: 13,
    borderRadius: 12,
  },
  directionsLabel: { color: "#FFFFFF", fontSize: 15, fontWeight: "600" },
  section: { marginTop: 28 },
  sectionTitle: { fontSize: 16, fontWeight: "600", marginBottom: 8 },
  altRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowText: { flex: 1, paddingRight: 12 },
  altName: { fontSize: 15, fontWeight: "500" },
  meta: { fontSize: 13, marginTop: 2 },
});
