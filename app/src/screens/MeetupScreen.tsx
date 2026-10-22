import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Modal,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Ionicons } from "@expo/vector-icons";
import { RootStackParamList } from "../navigation/types";
import { useTheme } from "../theme/ThemeContext";
import { useLanguage } from "../i18n/LanguageContext";
import { useAuth } from "../context/AuthContext";
import * as api from "../services/api";
import { FriendsOverview, MeetupPlan, MeetupPriority } from "../types/social";
import { formatHour, StringKey } from "../i18n/strings";
import { Venue } from "../types/venue";
import { StationPicker } from "../components/StationPicker";
import { CrowdBadge } from "../components/CrowdBadge";
import { hourForDay, meetingDate, meetingDays, meetingHours, MeetingTime } from "../services/meetingTime";

type Props = NativeStackScreenProps<RootStackParamList, "Meetup">;

// The server accepts up to six starting points per plan.
const MAX_PEOPLE = 6;

interface Participant {
  key: string;
  label: string;
  stationId: string | null;
  // Set for "Me" and friends, so each can only be added once.
  accountId?: number;
}

const PRIORITIES: { key: MeetupPriority; label: StringKey; hint: StringKey }[] = [
  { key: "fair", label: "meetup.fair", hint: "meetup.fairHint" },
  { key: "fast", label: "meetup.fast", hint: "meetup.fastHint" },
  { key: "quiet", label: "meetup.quiet", hint: "meetup.quietHint" },
];

let nextKey = 0;
const newKey = () => `p${nextKey++}`;

// Meetup planner: add everyone's starting station (yourself, friends, or
// anyone else) and when you'll meet, then get malls that are fair for
// everyone to reach by public transport and not too crowded at that time.
export default function MeetupScreen({ navigation }: Props) {
  const { colors } = useTheme();
  const { t, language } = useLanguage();
  const { token, username, accountId } = useAuth();

  const [stations, setStations] = useState<Venue[]>([]);
  const [stationsFailed, setStationsFailed] = useState(false);
  const [priority, setPriority] = useState<MeetupPriority>("fair");
  // null means now.
  const [when, setWhen] = useState<MeetingTime | null>(null);
  // Bumped whenever the group, priority or time changes, so a search that was
  // still running for the old group can't overwrite the screen afterwards.
  const requestId = useRef(0);
  const [friends, setFriends] = useState<FriendsOverview | null>(null);
  const [people, setPeople] = useState<Participant[]>([]);
  const [pickingFor, setPickingFor] = useState<string | null>(null);
  const [friendChooserOpen, setFriendChooserOpen] = useState(false);
  const [plan, setPlan] = useState<MeetupPlan | null>(null);
  const [loading, setLoading] = useState(false);
  // The message to show when a search fails, or null.
  const [failed, setFailed] = useState<StringKey | null>(null);

  const stationName = useMemo(() => new Map(stations.map((s) => [s.id, s.name])), [stations]);

  const loadStations = useCallback(() => {
    setStationsFailed(false);
    api
      .getAllVenues()
      .then((venues) => setStations(venues.filter((v) => v.category === "Transit")))
      .catch(() => setStationsFailed(true));
  }, []);

  useEffect(loadStations, [loadStations]);

  // Refreshed on focus so friends added on the Friends screen show up here.
  useFocusEffect(
    useCallback(() => {
      if (!token) {
        setFriends(null);
        return;
      }
      api.getFriends(token).then(setFriends).catch(() => setFriends(null));
    }, [token])
  );

  // Any change to the group makes the previous suggestions out of date.
  function updatePeople(next: Participant[]) {
    setPeople(next);
    clearResults();
  }

  function clearResults() {
    requestId.current++;
    setPlan(null);
    setFailed(null);
    setLoading(false);
  }

  const hasMe = people.some((p) => p.accountId === accountId);
  const full = people.length >= MAX_PEOPLE;
  const ready = people.length >= 2 && people.every((p) => p.stationId);
  const availableFriends = (friends?.friends ?? []).filter((f) => !people.some((p) => p.accountId === f.accountId));

  function addMe() {
    if (!accountId || !username) return;
    updatePeople([
      ...people,
      { key: newKey(), label: t("meetup.me", { name: username }), stationId: friends?.homeStationId ?? null, accountId },
    ]);
  }

  function addSomeone() {
    const key = newKey();
    const others = people.filter((p) => p.accountId === undefined).length;
    updatePeople([...people, { key, label: t("meetup.person", { n: others + 1 }), stationId: null }]);
    setPickingFor(key);
  }

  async function findPlaces() {
    if (!ready) return;
    const id = ++requestId.current;
    setLoading(true);
    setFailed(null);
    setPlan(null);
    try {
      const at = when ? meetingDate(when, new Date()) : undefined;
      const result = await api.getMeetupSuggestions(people.map((p) => p.stationId!), priority, at);
      if (id === requestId.current) setPlan(result);
    } catch (err) {
      const status = err instanceof api.ApiError ? err.status : 0;
      // The server only refuses a valid group's time once that time has passed.
      const message = status === 429 ? "meetup.tooMany" : status === 400 && when ? "meetup.badTime" : "meetup.failed";
      if (id === requestId.current) setFailed(message);
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }

  const now = new Date();
  const dayLabel = (day: number) =>
    day === 0
      ? t("meetup.today")
      : day === 1
        ? t("meetup.tomorrow")
        : t(`day.${(now.getDay() + day) % 7}` as StringKey);
  const whenLabel = when ? `${dayLabel(when.day)}, ${formatHour(when.hour, language)}` : t("meetup.now");

  function chooseDay(day: number | null) {
    if (day === null) setWhen(null);
    else {
      const hour = hourForDay(day, when?.hour ?? null, now);
      setWhen(hour === null ? null : { day, hour });
    }
    clearResults();
  }

  // One selectable chip, highlighted when chosen.
  const choice = (key: string | number, label: string, selected: boolean, onPress: () => void) => (
    <TouchableOpacity
      key={key}
      onPress={onPress}
      style={[
        styles.chip,
        { borderColor: selected ? colors.accent : colors.border, backgroundColor: selected ? colors.accent : "transparent" },
      ]}
    >
      <Text style={[styles.chipText, { color: selected ? "#FFFFFF" : colors.text }]}>{label}</Text>
    </TouchableOpacity>
  );

  const card = [styles.card, { backgroundColor: colors.surface, borderColor: colors.border }];
  const labelFor = (stationId: string) => people.find((p) => p.stationId === stationId)?.label ?? stationId;

  return (
    <ScrollView style={{ backgroundColor: colors.background }} contentContainerStyle={styles.content}>
      <Text style={[styles.intro, { color: colors.textMuted }]}>{t("meetup.intro")}</Text>

      {people.length > 0 && (
        <View style={card}>
          {people.map((p) => (
            <View key={p.key} style={styles.personRow}>
              <View style={styles.personText}>
                <Text style={[styles.name, { color: colors.text }]}>{p.label}</Text>
                <TouchableOpacity onPress={() => setPickingFor(p.key)}>
                  <Text style={[styles.station, { color: p.stationId ? colors.textMuted : colors.accent }]}>
                    {p.stationId ? stationName.get(p.stationId) ?? p.stationId : t("meetup.chooseStation")}
                  </Text>
                </TouchableOpacity>
              </View>
              <TouchableOpacity hitSlop={10} onPress={() => updatePeople(people.filter((x) => x.key !== p.key))}>
                <Ionicons name="close-circle" size={22} color={colors.textMuted} />
              </TouchableOpacity>
            </View>
          ))}
        </View>
      )}

      <View style={styles.addRow}>
        {token && !hasMe && (
          <TouchableOpacity disabled={full} onPress={addMe} style={[styles.chip, { borderColor: colors.border }]}>
            <Ionicons name="person-outline" size={15} color={colors.text} />
            <Text style={[styles.chipText, { color: colors.text }]}>{t("meetup.addMe")}</Text>
          </TouchableOpacity>
        )}
        {token && (
          <TouchableOpacity
            disabled={full}
            onPress={() => setFriendChooserOpen(true)}
            style={[styles.chip, { borderColor: colors.border }]}
          >
            <Ionicons name="people-outline" size={15} color={colors.text} />
            <Text style={[styles.chipText, { color: colors.text }]}>{t("meetup.addFriend")}</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity disabled={full} onPress={addSomeone} style={[styles.chip, { borderColor: colors.border }]}>
          <Ionicons name="add" size={16} color={colors.text} />
          <Text style={[styles.chipText, { color: colors.text }]}>{t("meetup.addSomeone")}</Text>
        </TouchableOpacity>
      </View>
      {full && <Text style={[styles.hint, { color: colors.textMuted }]}>{t("meetup.max", { n: MAX_PEOPLE })}</Text>}

      <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>{t("meetup.priority")}</Text>
      <View style={styles.addRow}>
        {PRIORITIES.map((p) =>
          choice(p.key, t(p.label), p.key === priority, () => {
            setPriority(p.key);
            clearResults();
          })
        )}
      </View>
      <Text style={[styles.hint, { color: colors.textMuted }]}>{t(PRIORITIES.find((p) => p.key === priority)!.hint)}</Text>

      <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>{t("meetup.when")}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
        {choice("now", t("meetup.now"), when === null, () => chooseDay(null))}
        {meetingDays(now).map((day) => choice(day, dayLabel(day), when?.day === day, () => chooseDay(day)))}
      </ScrollView>
      {when && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
          {meetingHours(when.day, now).map((hour) =>
            choice(hour, formatHour(hour, language), when.hour === hour, () => {
              setWhen({ day: when.day, hour });
              clearResults();
            })
          )}
        </ScrollView>
      )}
      <Text style={[styles.hint, { color: colors.textMuted }]}>{t(when ? "meetup.laterHint" : "meetup.nowHint")}</Text>

      <TouchableOpacity
        disabled={!ready || loading}
        onPress={findPlaces}
        style={[styles.findButton, { backgroundColor: colors.accent, opacity: !ready || loading ? 0.5 : 1 }]}
      >
        <Text style={styles.findText}>{t("meetup.find")}</Text>
      </TouchableOpacity>
      {!ready && <Text style={[styles.hint, { color: colors.textMuted }]}>{t("meetup.needTwo")}</Text>}

      {loading && (
        <View style={styles.status}>
          <ActivityIndicator />
          <Text style={[styles.hint, { color: colors.textMuted }]}>{t("meetup.finding")}</Text>
        </View>
      )}
      {failed && (
        <View style={styles.status}>
          <Text style={[styles.hint, { color: colors.textMuted }]}>{t(failed)}</Text>
          <TouchableOpacity onPress={findPlaces}>
            <Text style={[styles.link, { color: colors.accent }]}>{t("directions.retry")}</Text>
          </TouchableOpacity>
        </View>
      )}

      {plan && (
        <>
          <Text style={[styles.sectionLabel, { color: colors.textMuted }]}>
            {when ? t("meetup.resultsAt", { when: whenLabel.toUpperCase() }) : t("meetup.results")}
          </Text>
          {plan.allClosed && (
            <Text style={[styles.hint, { color: colors.textMuted }]}>{t(when ? "meetup.allClosedAt" : "meetup.allClosed")}</Text>
          )}
          {plan.suggestions.length === 0 && (
            <Text style={[styles.hint, { color: colors.textMuted }]}>{t("meetup.none")}</Text>
          )}
          {plan.suggestions.map((s, i) => (
            <TouchableOpacity
              key={s.venueId}
              style={card}
              onPress={() => navigation.navigate("Detail", { venueId: s.venueId })}
            >
              <View style={styles.resultHead}>
                <Text style={[styles.resultName, { color: colors.text }]} numberOfLines={1}>
                  {i + 1}. {s.name}
                </Text>
                <CrowdBadge level={s.crowdLevel} />
              </View>
              <Text style={[styles.hint, { color: colors.textMuted }]}>
                {t("meetup.summary", { max: s.maxMinutes, avg: s.avgMinutes })}
              </Text>
              <View style={styles.trips}>
                {s.travel.map((trip, j) => (
                  <Text key={j} style={[styles.trip, { color: colors.text, backgroundColor: colors.surfaceAlt }]}>
                    {t("meetup.trip", {
                      name: people[j]?.label ?? labelFor(trip.stationId),
                      minutes: `${trip.estimated ? "≈" : ""}${trip.minutes}`,
                    })}
                  </Text>
                ))}
              </View>
            </TouchableOpacity>
          ))}
          {plan.suggestions.some((s) => s.travel.some((trip) => trip.estimated)) && (
            <Text style={[styles.hint, { color: colors.textMuted }]}>{t("meetup.estimatedNote")}</Text>
          )}
        </>
      )}

      <TouchableOpacity
        onPress={() => (token ? navigation.navigate("Friends") : navigation.navigate("Settings"))}
        style={styles.manage}
      >
        <Text style={[styles.link, { color: colors.accent }]}>
          {token ? t("meetup.manageFriends") : t("meetup.signInForFriends")}
        </Text>
      </TouchableOpacity>

      <StationPicker
        visible={pickingFor !== null}
        stations={stations}
        loadFailed={stationsFailed}
        onRetry={loadStations}
        onClose={() => setPickingFor(null)}
        onSelect={(stationId) => {
          updatePeople(people.map((p) => (p.key === pickingFor ? { ...p, stationId } : p)));
          setPickingFor(null);
        }}
      />

      <Modal
        visible={friendChooserOpen}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setFriendChooserOpen(false)}
      >
        <View style={[styles.sheet, { backgroundColor: colors.background }]}>
          <View style={styles.sheetHeader}>
            <Text style={[styles.sheetTitle, { color: colors.text }]}>{t("meetup.pickFriend")}</Text>
            <TouchableOpacity onPress={() => setFriendChooserOpen(false)} hitSlop={10}>
              <Text style={[styles.link, { color: colors.accent }]}>{t("common.close")}</Text>
            </TouchableOpacity>
          </View>
          {availableFriends.length === 0 ? (
            <Text style={[styles.hint, styles.sheetEmpty, { color: colors.textMuted }]}>{t("meetup.noFriends")}</Text>
          ) : (
            availableFriends.map((f) => (
              <TouchableOpacity
                key={f.accountId}
                style={[styles.sheetRow, { borderBottomColor: colors.border }]}
                onPress={() => {
                  updatePeople([
                    ...people,
                    { key: newKey(), label: f.username, stationId: f.homeStationId, accountId: f.accountId },
                  ]);
                  setFriendChooserOpen(false);
                }}
              >
                <Text style={[styles.name, { color: colors.text }]}>{f.username}</Text>
                <Text style={[styles.hint, { color: colors.textMuted }]}>
                  {f.homeStationId ? stationName.get(f.homeStationId) ?? f.homeStationId : t("friends.noHome")}
                </Text>
              </TouchableOpacity>
            ))
          )}
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 40, gap: 12 },
  intro: { fontSize: 14, lineHeight: 20 },
  card: { padding: 14, borderWidth: StyleSheet.hairlineWidth, borderRadius: 10, gap: 10 },
  personRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  personText: { flex: 1, gap: 2 },
  name: { fontSize: 15, fontWeight: "600" },
  station: { fontSize: 14 },
  addRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chipRow: { flexDirection: "row", gap: 8 },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 18,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  chipText: { fontSize: 14, fontWeight: "500" },
  findButton: { paddingVertical: 14, borderRadius: 10, alignItems: "center" },
  findText: { color: "#FFFFFF", fontSize: 16, fontWeight: "700" },
  hint: { fontSize: 12.5, lineHeight: 18 },
  status: { flexDirection: "row", alignItems: "center", gap: 10 },
  link: { fontSize: 14, fontWeight: "600" },
  sectionLabel: { fontSize: 12, fontWeight: "600", letterSpacing: 0.5, marginTop: 8 },
  resultHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 },
  resultName: { fontSize: 16, fontWeight: "700", flex: 1 },
  trips: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  trip: { fontSize: 13, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, overflow: "hidden" },
  manage: { alignItems: "center", paddingVertical: 8 },
  sheet: { flex: 1, paddingTop: 16 },
  sheetHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 16, marginBottom: 8 },
  sheetTitle: { fontSize: 17, fontWeight: "700" },
  sheetEmpty: { paddingHorizontal: 16 },
  sheetRow: { paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth, gap: 2 },
});
