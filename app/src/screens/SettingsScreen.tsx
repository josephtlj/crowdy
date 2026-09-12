import React, { useState } from "react";
import {
  View,
  Text,
  Switch,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
} from "react-native";
import { useTheme } from "../theme/ThemeContext";
import { useAuth } from "../context/AuthContext";

// Placeholder version string - bump manually until a real build/release
// process assigns one.
const APP_VERSION = "1.0.0 (MVP)";

export default function SettingsScreen() {
  const { mode, colors, toggleTheme } = useTheme();
  const auth = useAuth();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(mode: "login" | "signup") {
    setSubmitting(true);
    setError(null);
    const result =
      mode === "login" ? await auth.login(username, password) : await auth.signup(username, password);
    setSubmitting(false);
    if (result.ok) {
      setPassword("");
    } else {
      setError(result.error);
    }
  }

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

      {auth.loading ? (
        <View style={[styles.row, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <ActivityIndicator size="small" color={colors.accent} />
        </View>
      ) : auth.username ? (
        <View style={[styles.accountCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.rowLabel, { color: colors.text }]}>{auth.username}</Text>
          <TouchableOpacity style={styles.logoutButton} onPress={() => auth.logout()}>
            <Text style={[styles.logoutText, { color: colors.accent }]}>Log Out</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <View style={[styles.accountCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <TextInput
            style={[styles.input, { color: colors.text, borderColor: colors.border }]}
            placeholder="Username"
            placeholderTextColor={colors.textMuted}
            value={username}
            onChangeText={setUsername}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <TextInput
            style={[styles.input, { color: colors.text, borderColor: colors.border }]}
            placeholder="Password (8+ characters)"
            placeholderTextColor={colors.textMuted}
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            autoCapitalize="none"
          />
          {error && <Text style={styles.errorText}>{error}</Text>}
          <View style={styles.authButtonRow}>
            <TouchableOpacity
              style={[styles.authButton, { backgroundColor: colors.accent }]}
              onPress={() => handleSubmit("login")}
              disabled={submitting}
            >
              {submitting ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text style={styles.authButtonText}>Log In</Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.authButton, styles.signupButton, { borderColor: colors.accent }]}
              onPress={() => handleSubmit("signup")}
              disabled={submitting}
            >
              <Text style={[styles.authButtonText, { color: colors.accent }]}>Sign Up</Text>
            </TouchableOpacity>
          </View>
          {/* Saving venues already works without an account (on this
              device only) - signing up carries those over rather than
              starting fresh, so this isn't a "you must sign up" gate. */}
          <Text style={[styles.hint, { color: colors.textMuted }]}>
            Saved venues work without an account too - signing in just syncs them across devices.
          </Text>
        </View>
      )}

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
  accountCard: {
    padding: 16,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    gap: 10,
  },
  rowLabel: { fontSize: 15, fontWeight: "500" },
  logoutButton: { alignSelf: "flex-start" },
  logoutText: { fontSize: 14, fontWeight: "600" },
  input: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
  },
  errorText: { color: "#D64545", fontSize: 13 },
  authButtonRow: { flexDirection: "row", gap: 10 },
  authButton: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  signupButton: { backgroundColor: "transparent", borderWidth: StyleSheet.hairlineWidth },
  authButtonText: { color: "#FFFFFF", fontWeight: "600", fontSize: 14.5 },
  hint: { fontSize: 12, marginTop: 2 },
  version: { textAlign: "center", fontSize: 12, marginTop: 40 },
});
