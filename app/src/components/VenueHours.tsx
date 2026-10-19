import React, { useState } from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { useTheme } from "../theme/ThemeContext";
import { getTodayStatus, OpenHoursEntry } from "../services/hours";
import { useLanguage } from "../i18n/LanguageContext";
import { formatClock, formatHoursDetail, StringKey } from "../i18n/strings";

interface Props {
  hours: OpenHoursEntry[];
}

const OPEN_COLOR = "#2E7D32";

// Mirrors Google's own "Hours: Open · Closes 10:30 pm" summary line, with a
// tap-to-expand dropdown listing the full week - same day order Google
// uses (starting from today, wrapping through the week), matching how the
// weekly Popular Times data is already ordered.
export function VenueHours({ hours }: Props) {
  const { colors } = useTheme();
  const { t, language } = useLanguage();
  const [expanded, setExpanded] = useState(false);
  const status = getTodayStatus(hours);
  if (!status) return null;

  const todayDay = new Date().getDay();
  const orderedDays = Array.from({ length: 7 }, (_, i) => (todayDay + i) % 7);

  return (
    <View style={styles.container}>
      <TouchableOpacity style={styles.summaryRow} onPress={() => setExpanded((e) => !e)} activeOpacity={0.7}>
        <Text style={[styles.summary, { color: colors.textMuted }]}>
          {t("hours.prefix")} <Text style={{ color: status.open ? OPEN_COLOR : colors.textMuted, fontWeight: "600" }}>
            {status.open ? t("hours.open") : t("hours.closed")}
          </Text>
          {status.detail ? ` · ${formatHoursDetail(status.detail, language)}` : ""}
        </Text>
        <Text style={[styles.chevron, { color: colors.textMuted }]}>{expanded ? "▲" : "▼"}</Text>
      </TouchableOpacity>
      {expanded && (
        <View style={styles.week}>
          {orderedDays.map((day) => {
            const entry = hours.find((h) => h.day === day);
            return (
              <View key={day} style={styles.weekRow}>
                <Text style={[styles.weekDay, { color: colors.text }, day === todayDay && styles.weekDayToday]}>
                  {t(`day.${day}` as StringKey)}
                </Text>
                <Text style={[styles.weekTime, { color: colors.textMuted }]}>
                  {!entry
                    ? t("hours.closed")
                    : entry.open === "12 am" && entry.close === "11:59 pm"
                      ? t("hours.always")
                      : `${formatClock(entry.open, language)} – ${formatClock(entry.close, language)}`}
                </Text>
              </View>
            );
          })}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { marginBottom: 12 },
  summaryRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  summary: { fontSize: 13, flex: 1 },
  chevron: { fontSize: 11, marginLeft: 8 },
  week: { marginTop: 8, gap: 4 },
  weekRow: { flexDirection: "row", justifyContent: "space-between" },
  weekDay: { fontSize: 13 },
  weekDayToday: { fontWeight: "700" },
  weekTime: { fontSize: 13 },
});
