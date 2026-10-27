import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  useWindowDimensions,
} from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Ionicons } from "@expo/vector-icons";
import { RootStackParamList } from "../navigation/types";
import { useTheme } from "../theme/ThemeContext";
import { useLanguage } from "../i18n/LanguageContext";
import { formatTime, StringKey } from "../i18n/strings";
import * as api from "../services/api";
import { GroupRoute, RouteTiming } from "../types/social";
import { Venue } from "../types/venue";
import { GroupRouteMap, GroupRouteLine } from "../components/GroupRouteMap";
import { StepRow, formatDuration } from "../components/DirectionsSheet";
import { personColor } from "../components/personColors";

type Props = NativeStackScreenProps<RootStackParamList, "GroupRoutes">;

const TIMINGS: { key: RouteTiming; label: StringKey; hint: StringKey }[] = [
  { key: "arrive", label: "routes.arrive", hint: "routes.arriveHint" },
  { key: "leave", label: "routes.leave", hint: "routes.leaveHint" },
];

// Everyone's public transport trip to one suggested mall: each person's
// route drawn on the map in their own colour, with their leave and arrive
// times and steps listed below. With a meeting time chosen, the group can
// either all leave at that time or each leave early enough to arrive by it.
export default function GroupRoutesScreen({ route: navRoute, navigation }: Props) {
  const { venueId, venueName, people, at } = navRoute.params;
  const { colors } = useTheme();
  const { t, language } = useLanguage();
  const { height: screenHeight } = useWindowDimensions();

  const [mall, setMall] = useState<Venue | null>(null);
  const [timing, setTiming] = useState<RouteTiming>("arrive");
  const [routes, setRoutes] = useState<GroupRoute[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [highlighted, setHighlighted] = useState<number | null>(null);
  // Each timing's routes once fetched, so switching back is instant.
  const cache = useRef(new Map<RouteTiming, GroupRoute[]>());
  const requestId = useRef(0);

  useEffect(() => {
    navigation.setOptions({ title: venueName });
    api.getVenueById(venueId).then((v) => setMall(v ?? null)).catch(() => setMall(null));
  }, [navigation, venueId, venueName]);

  const load = useCallback(
    async (which: RouteTiming, { useCache = true } = {}) => {
      const cached = cache.current.get(which);
      if (useCache && cached) {
        setRoutes(cached);
        setFailed(false);
        setLoading(false);
        return;
      }
      const id = ++requestId.current;
      setLoading(true);
      setFailed(false);
      try {
        const result = await api.getGroupRoutes(people.map((p) => p.stationId), venueId, at, which);
        cache.current.set(which, result);
        if (id === requestId.current) setRoutes(result);
      } catch {
        if (id === requestId.current) {
          setRoutes(null);
          setFailed(true);
        }
      } finally {
        if (id === requestId.current) setLoading(false);
      }
    },
    [people, venueId, at]
  );

  useEffect(() => {
    void load(timing);
  }, [timing, load]);

  const lines: GroupRouteLine[] = useMemo(
    () =>
      people.map((p, i) => ({
        name: p.name,
        color: personColor(i),
        origin: { lat: p.lat, lng: p.lng },
        segments: loading ? [] : routes?.[i]?.route?.segments ?? [],
      })),
    [people, routes, loading]
  );

  const meetAt = at ? formatTime(new Date(at), language) : null;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={{ height: screenHeight * 0.42 }}>
        {mall ? (
          <GroupRouteMap
            destination={{ lat: mall.lat, lng: mall.lng }}
            destinationName={venueName}
            lines={lines}
            highlighted={highlighted}
          />
        ) : (
          <View style={[styles.centered, { backgroundColor: colors.surfaceAlt }]}>
            <ActivityIndicator />
          </View>
        )}
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {meetAt && (
          <>
            <View style={styles.timings}>
              {TIMINGS.map((option) => {
                const selected = option.key === timing;
                return (
                  <TouchableOpacity
                    key={option.key}
                    onPress={() => setTiming(option.key)}
                    style={[
                      styles.timing,
                      {
                        borderColor: selected ? colors.accent : colors.border,
                        backgroundColor: selected ? colors.accent : "transparent",
                      },
                    ]}
                  >
                    <Text style={[styles.timingText, { color: selected ? "#FFFFFF" : colors.text }]}>
                      {t(option.label, { time: meetAt })}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <Text style={[styles.hint, { color: colors.textMuted }]}>
              {t(TIMINGS.find((o) => o.key === timing)!.hint)}
            </Text>
          </>
        )}

        {loading && (
          <View style={styles.status}>
            <ActivityIndicator />
            <Text style={[styles.hint, { color: colors.textMuted }]}>{t("routes.finding")}</Text>
          </View>
        )}
        {failed && (
          <View style={styles.status}>
            <Text style={[styles.hint, { color: colors.textMuted }]}>{t("routes.failed")}</Text>
            <TouchableOpacity onPress={() => void load(timing, { useCache: false })}>
              <Text style={[styles.link, { color: colors.accent }]}>{t("directions.retry")}</Text>
            </TouchableOpacity>
          </View>
        )}

        {!loading && routes && (
          <>
            <Text style={[styles.hint, { color: colors.textMuted }]}>{t("routes.tapHint")}</Text>
            {people.map((person, i) => {
              const trip = routes[i];
              if (!trip) return null;
              const open = highlighted === i;
              const color = personColor(i);
              return (
                <View
                  key={i}
                  style={[
                    styles.card,
                    { backgroundColor: colors.surface, borderColor: open ? color : colors.border },
                  ]}
                >
                  <TouchableOpacity style={styles.cardHead} onPress={() => setHighlighted(open ? null : i)}>
                    <View style={[styles.badge, { backgroundColor: color }]}>
                      <Text style={styles.badgeText}>{i + 1}</Text>
                    </View>
                    <View style={styles.cardText}>
                      <Text style={[styles.name, { color: colors.text }]} numberOfLines={1}>
                        {person.name}
                        <Text style={[styles.station, { color: colors.textMuted }]}>  {person.stationName}</Text>
                      </Text>
                      <Text style={[styles.hint, { color: colors.textMuted }]}>
                        {t("routes.times", {
                          leave: formatTime(new Date(trip.leaveAt), language),
                          arrive: formatTime(new Date(trip.arriveAt), language),
                        })}
                      </Text>
                    </View>
                    <Text style={[styles.minutes, { color: colors.text }]}>
                      {trip.route ? "" : "≈"}
                      {formatDuration(trip.minutes * 60, t)}
                    </Text>
                    <Ionicons name={open ? "chevron-up" : "chevron-down"} size={18} color={colors.textMuted} />
                  </TouchableOpacity>

                  {open &&
                    (trip.route ? (
                      <View style={styles.steps}>
                        {trip.route.steps.map((step, j) => (
                          <StepRow
                            key={j}
                            step={step}
                            isLast={j === trip.route!.steps.length - 1}
                            textColor={colors.text}
                            mutedColor={colors.textMuted}
                            borderColor={colors.border}
                            surfaceAltColor={colors.surfaceAlt}
                          />
                        ))}
                      </View>
                    ) : (
                      <Text style={[styles.hint, { color: colors.textMuted }]}>{t("routes.estimated")}</Text>
                    ))}
                </View>
              );
            })}
          </>
        )}

        <TouchableOpacity onPress={() => navigation.navigate("Detail", { venueId })} style={styles.mallLink}>
          <Text style={[styles.link, { color: colors.accent }]}>{venueName}</Text>
          <Ionicons name="chevron-forward" size={15} color={colors.accent} />
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, justifyContent: "center", alignItems: "center" },
  content: { padding: 16, paddingBottom: 40, gap: 10 },
  timings: { flexDirection: "row", gap: 8 },
  timing: {
    flex: 1,
    alignItems: "center",
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 18,
    paddingVertical: 8,
  },
  timingText: { fontSize: 14, fontWeight: "600" },
  hint: { fontSize: 12.5, lineHeight: 18 },
  status: { flexDirection: "row", alignItems: "center", gap: 10 },
  link: { fontSize: 14, fontWeight: "600" },
  card: { padding: 12, borderWidth: 1, borderRadius: 10, gap: 10 },
  cardHead: { flexDirection: "row", alignItems: "center", gap: 10 },
  badge: { width: 26, height: 26, borderRadius: 13, alignItems: "center", justifyContent: "center" },
  badgeText: { color: "#FFFFFF", fontSize: 13, fontWeight: "700" },
  cardText: { flex: 1, gap: 2 },
  name: { fontSize: 15, fontWeight: "600" },
  station: { fontSize: 13, fontWeight: "400" },
  minutes: { fontSize: 14, fontWeight: "700" },
  steps: { paddingTop: 2 },
  mallLink: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4, paddingVertical: 8 },
});
