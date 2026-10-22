import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { useTheme } from "../theme/ThemeContext";
import { useLanguage } from "../i18n/LanguageContext";
import { useAuth } from "../context/AuthContext";
import * as api from "../services/api";
import { FriendsOverview } from "../types/social";
import { Venue } from "../types/venue";
import { StationPicker } from "../components/StationPicker";

// Friends for the meetup planner: your own home station, adding friends by
// username, answering requests, and the friends list with each friend's
// home station.
export default function FriendsScreen() {
  const { colors } = useTheme();
  const { t, errorText } = useLanguage();
  const { token } = useAuth();

  const [overview, setOverview] = useState<FriendsOverview | null>(null);
  const [loadFailed, setLoadFailed] = useState(false);
  const [stations, setStations] = useState<Venue[]>([]);
  const [stationsFailed, setStationsFailed] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [username, setUsername] = useState("");
  const [message, setMessage] = useState<{ text: string; error: boolean } | null>(null);
  const [busy, setBusy] = useState(false);

  const stationName = useMemo(() => new Map(stations.map((s) => [s.id, s.name])), [stations]);

  const load = useCallback(async () => {
    if (!token) return;
    try {
      setOverview(await api.getFriends(token));
      setLoadFailed(false);
    } catch {
      setLoadFailed(true);
    }
  }, [token]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  const loadStations = useCallback(() => {
    setStationsFailed(false);
    api
      .getAllVenues()
      .then((venues) => setStations(venues.filter((v) => v.category === "Transit")))
      .catch(() => setStationsFailed(true));
  }, []);

  useEffect(loadStations, [loadStations]);

  async function act(action: () => Promise<void>) {
    setBusy(true);
    try {
      await action();
      await load();
    } catch (err) {
      setMessage({ text: errorText(err instanceof Error ? err.message : ""), error: true });
    } finally {
      setBusy(false);
    }
  }

  async function addFriend() {
    const name = username.trim();
    if (!token || !name) return;
    setMessage(null);
    await act(async () => {
      const { status } = await api.sendFriendRequest(token, name);
      setUsername("");
      setMessage({ text: t(status === "accepted" ? "friends.nowFriends" : "friends.sent", { name }), error: false });
    });
  }

  function confirmRemove(accountId: number, name: string) {
    Alert.alert(t("friends.removeConfirm", { name }), undefined, [
      { text: t("friends.cancel"), style: "cancel" },
      { text: t("friends.remove"), style: "destructive", onPress: () => act(() => api.removeFriend(token!, accountId)) },
    ]);
  }

  if (!token) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.background }]}>
        <Text style={[styles.muted, { color: colors.textMuted, textAlign: "center" }]}>{t("friends.signIn")}</Text>
      </View>
    );
  }

  if (!overview) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.background }]}>
        {loadFailed ? (
          <>
            <Text style={[styles.muted, { color: colors.textMuted }]}>{t("friends.loadFailed")}</Text>
            <TouchableOpacity onPress={load} style={[styles.smallButton, { backgroundColor: colors.accent }]}>
              <Text style={styles.smallButtonText}>{t("friends.retry")}</Text>
            </TouchableOpacity>
          </>
        ) : (
          <ActivityIndicator />
        )}
      </View>
    );
  }

  const card = [styles.card, { backgroundColor: colors.surface, borderColor: colors.border }];
  const label = [styles.sectionLabel, { color: colors.textMuted }];

  return (
    <ScrollView style={{ backgroundColor: colors.background }} contentContainerStyle={styles.content}>
      <Text style={label}>{t("friends.homeStation")}</Text>
      <View style={card}>
        <View style={styles.rowBetween}>
          <Text style={[styles.name, { color: colors.text }]}>
            {overview.homeStationId ? stationName.get(overview.homeStationId) ?? overview.homeStationId : t("friends.notSet")}
          </Text>
          <View style={styles.actions}>
            {overview.homeStationId && (
              <TouchableOpacity disabled={busy} onPress={() => act(() => api.setHomeStation(token, null))}>
                <Text style={[styles.link, { color: colors.textMuted }]}>{t("friends.clear")}</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity disabled={busy} onPress={() => setPickerOpen(true)}>
              <Text style={[styles.link, { color: colors.accent }]}>{t("friends.change")}</Text>
            </TouchableOpacity>
          </View>
        </View>
        <Text style={[styles.hint, { color: colors.textMuted }]}>{t("friends.homeHint")}</Text>
      </View>

      <Text style={label}>{t("friends.add")}</Text>
      <View style={card}>
        <View style={styles.addRow}>
          <TextInput
            style={[styles.input, { color: colors.text, borderColor: colors.border }]}
            value={username}
            onChangeText={setUsername}
            placeholder={t("friends.usernamePlaceholder")}
            placeholderTextColor={colors.textMuted}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="send"
            onSubmitEditing={addFriend}
          />
          <TouchableOpacity
            disabled={busy || !username.trim()}
            onPress={addFriend}
            style={[styles.smallButton, { backgroundColor: colors.accent, opacity: busy || !username.trim() ? 0.5 : 1 }]}
          >
            <Text style={styles.smallButtonText}>{t("friends.send")}</Text>
          </TouchableOpacity>
        </View>
        {message && (
          <Text style={[styles.hint, { color: message.error ? "#D64545" : colors.textMuted }]}>{message.text}</Text>
        )}
      </View>

      {overview.incoming.length > 0 && (
        <>
          <Text style={label}>{t("friends.incoming")}</Text>
          <View style={card}>
            {overview.incoming.map((r) => (
              <View key={r.accountId} style={styles.rowBetween}>
                <Text style={[styles.name, { color: colors.text }]}>{r.username}</Text>
                <View style={styles.actions}>
                  <TouchableOpacity disabled={busy} onPress={() => act(() => api.removeFriend(token, r.accountId))}>
                    <Text style={[styles.link, { color: colors.textMuted }]}>{t("friends.decline")}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity disabled={busy} onPress={() => act(() => api.acceptFriendRequest(token, r.accountId))}>
                    <Text style={[styles.link, { color: colors.accent }]}>{t("friends.accept")}</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </View>
        </>
      )}

      {overview.outgoing.length > 0 && (
        <>
          <Text style={label}>{t("friends.outgoing")}</Text>
          <View style={card}>
            {overview.outgoing.map((r) => (
              <View key={r.accountId} style={styles.rowBetween}>
                <Text style={[styles.name, { color: colors.text }]}>{r.username}</Text>
                <TouchableOpacity disabled={busy} onPress={() => act(() => api.removeFriend(token, r.accountId))}>
                  <Text style={[styles.link, { color: colors.textMuted }]}>{t("friends.cancel")}</Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>
        </>
      )}

      <Text style={label}>{t("friends.list")}</Text>
      <View style={card}>
        {overview.friends.length === 0 ? (
          <Text style={[styles.muted, { color: colors.textMuted }]}>{t("friends.none")}</Text>
        ) : (
          overview.friends.map((f) => (
            <View key={f.accountId} style={styles.rowBetween}>
              <View style={styles.friendText}>
                <Text style={[styles.name, { color: colors.text }]}>{f.username}</Text>
                <Text style={[styles.hint, { color: colors.textMuted }]}>
                  {f.homeStationId ? stationName.get(f.homeStationId) ?? f.homeStationId : t("friends.noHome")}
                </Text>
              </View>
              <TouchableOpacity disabled={busy} onPress={() => confirmRemove(f.accountId, f.username)}>
                <Text style={[styles.link, { color: colors.textMuted }]}>{t("friends.remove")}</Text>
              </TouchableOpacity>
            </View>
          ))
        )}
      </View>

      <StationPicker
        visible={pickerOpen}
        stations={stations}
        loadFailed={stationsFailed}
        onRetry={loadStations}
        onClose={() => setPickerOpen(false)}
        onSelect={(stationId) => {
          setPickerOpen(false);
          void act(() => api.setHomeStation(token, stationId));
        }}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, paddingBottom: 40 },
  centered: { flex: 1, justifyContent: "center", alignItems: "center", padding: 32, gap: 14 },
  sectionLabel: { fontSize: 12, fontWeight: "600", letterSpacing: 0.5, marginTop: 20, marginBottom: 8 },
  card: { padding: 14, borderWidth: StyleSheet.hairlineWidth, borderRadius: 10, gap: 12 },
  rowBetween: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 12 },
  actions: { flexDirection: "row", gap: 18 },
  friendText: { flex: 1 },
  name: { fontSize: 15, fontWeight: "500" },
  link: { fontSize: 14, fontWeight: "600" },
  hint: { fontSize: 12.5 },
  muted: { fontSize: 14 },
  addRow: { flexDirection: "row", gap: 10 },
  input: {
    flex: 1,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
  },
  smallButton: { paddingHorizontal: 16, borderRadius: 8, justifyContent: "center", alignItems: "center", minHeight: 40 },
  smallButtonText: { color: "#FFFFFF", fontWeight: "600", fontSize: 14.5 },
});
