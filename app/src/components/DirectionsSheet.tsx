import React, { useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Animated,
  PanResponder,
  useWindowDimensions,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Route, RouteStep, StepMode, TravelMode } from "../types/directions";
import { CrowdLevel } from "../types/venue";
import { CROWD_COLORS, crowdKey } from "./CrowdBadge";
import { useTheme } from "../theme/ThemeContext";
import { useLanguage } from "../i18n/LanguageContext";
import { StringKey } from "../i18n/strings";
import { translateInstruction } from "../i18n/routeInstructions";

type Translate = (key: StringKey, vars?: Record<string, string | number>) => string;

interface Props {
  mode: TravelMode;
  onSelectMode: (mode: TravelMode) => void;
  route: Route | null;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  destinationName: string;
  destinationCrowd: CrowdLevel;
}

const MODE_TABS: { mode: TravelMode; label: StringKey; icon: keyof typeof Ionicons.glyphMap }[] = [
  { mode: "transit", label: "directions.transit", icon: "train-outline" },
  { mode: "walk", label: "directions.walk", icon: "walk-outline" },
  { mode: "drive", label: "directions.drive", icon: "car-outline" },
  { mode: "cycle", label: "directions.cycle", icon: "bicycle-outline" },
];

const STEP_ICONS: Record<StepMode, keyof typeof Ionicons.glyphMap> = {
  WALK: "walk",
  SUBWAY: "train",
  BUS: "bus",
  DRIVE: "car",
  CYCLE: "bicycle",
};

// The sheet rests at two heights: enough to read the summary and first
// couple of steps without hiding the route, or raised to read the whole
// itinerary. Proportions of screen height rather than fixed points, so it
// behaves the same on an SE as on a Pro Max.
//
// Exported because the map behind has to know how much of its bottom edge
// this covers - it fits the route into the part still visible, so the last
// leg doesn't end up drawn underneath the sheet.
export const COLLAPSED_FRACTION = 0.45;
const EXPANDED_FRACTION = 0.85;

// Past this much of a drag, the sheet commits to the other position instead
// of springing back - short enough that a deliberate flick always lands.
const SNAP_THRESHOLD = 40;

/**
 * The draggable sheet on the directions screen: the travel mode tabs, the
 * route's time and distance, and its steps. Dragging it up shows every step.
 * @param mode - the travel mode shown
 * @param onSelectMode - called when a different mode tab is tapped
 * @param route - the route for that mode, or null while loading or after an error
 * @param destinationName - the venue being travelled to
 * @param destinationCrowd - that venue's crowd level
 */
export function DirectionsSheet({
  mode,
  onSelectMode,
  route,
  loading,
  error,
  onRetry,
  destinationName,
  destinationCrowd,
}: Props) {
  const { colors } = useTheme();
  const { t } = useLanguage();
  const { height: screenHeight } = useWindowDimensions();

  const collapsedHeight = screenHeight * COLLAPSED_FRACTION;
  const expandedHeight = screenHeight * EXPANDED_FRACTION;
  const travel = expandedHeight - collapsedHeight;

  // 0 = collapsed, `travel` = fully raised. Tracked as a translation of an
  // expanded-height sheet rather than an animated height, so dragging never
  // re-lays-out the step list underneath it.
  const raise = useRef(new Animated.Value(0)).current;
  const raised = useRef(false);
  // The same, as state - while collapsed the bottom `travel` of the sheet is
  // below the screen, so the step list gets that much extra bottom padding
  // to let its last steps scroll into view.
  const [isRaised, setIsRaised] = useState(false);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        // Claimed on a deliberate vertical drag only, so a tap on the grab
        // handle still reaches the underlying button.
        onMoveShouldSetPanResponder: (_event, gesture) => Math.abs(gesture.dy) > 4,
        onPanResponderMove: (_event, gesture) => {
          const base = raised.current ? travel : 0;
          raise.setValue(Math.min(Math.max(base - gesture.dy, 0), travel));
        },
        onPanResponderRelease: (_event, gesture) => {
          const movedFarEnough = Math.abs(gesture.dy) > SNAP_THRESHOLD;
          const draggedUp = gesture.dy < 0;
          const shouldRaise = movedFarEnough ? draggedUp : raised.current;

          raised.current = shouldRaise;
          setIsRaised(shouldRaise);
          Animated.spring(raise, {
            toValue: shouldRaise ? travel : 0,
            useNativeDriver: false,
            bounciness: 2,
          }).start();
        },
      }),
    [raise, travel]
  );

  return (
    <Animated.View
      style={[
        styles.sheet,
        {
          height: expandedHeight,
          backgroundColor: colors.surface,
          borderColor: colors.border,
          // Sits `travel` lower than its full height when collapsed, and
          // rides up as the gesture raises it.
          transform: [
            {
              translateY: raise.interpolate({
                inputRange: [0, Math.max(travel, 1)],
                outputRange: [travel, 0],
              }),
            },
          ],
        },
      ]}
    >
      <View {...panResponder.panHandlers} style={styles.grabArea}>
        <View style={[styles.grabber, { backgroundColor: colors.border }]} />
      </View>

      {/* How busy the place you're heading to is, kept in view above the
          itinerary - the crowd level is the reason to open Crowdy at all,
          and it shouldn't disappear the moment you ask how to get there. */}
      <View style={styles.destination}>
        <Text style={[styles.destinationLabel, { color: colors.textMuted }]}>{t("directions.to")}</Text>
        <Text style={[styles.destinationName, { color: colors.text }]} numberOfLines={1}>
          {destinationName}
        </Text>
        <View style={[styles.destinationCrowd, { backgroundColor: CROWD_COLORS[destinationCrowd] }]}>
          <Text style={styles.destinationCrowdText}>{t(crowdKey(destinationCrowd))}</Text>
        </View>
      </View>

      <View style={styles.tabs}>
        {MODE_TABS.map((tab) => {
          const active = tab.mode === mode;
          return (
            <TouchableOpacity
              key={tab.mode}
              onPress={() => onSelectMode(tab.mode)}
              style={[
                styles.tab,
                { backgroundColor: active ? colors.accent : colors.surfaceAlt },
              ]}
            >
              <Ionicons
                name={tab.icon}
                size={17}
                color={active ? "#FFFFFF" : colors.textMuted}
              />
              <Text
                style={[styles.tabLabel, { color: active ? "#FFFFFF" : colors.textMuted }]}
              >
                {t(tab.label)}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <SheetBody
        route={route}
        loading={loading}
        error={error}
        onRetry={onRetry}
        textColor={colors.text}
        mutedColor={colors.textMuted}
        borderColor={colors.border}
        accentColor={colors.accent}
        surfaceAltColor={colors.surfaceAlt}
        bottomPadding={isRaised ? 0 : travel}
      />
    </Animated.View>
  );
}

interface BodyProps {
  route: Route | null;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  textColor: string;
  mutedColor: string;
  borderColor: string;
  accentColor: string;
  surfaceAltColor: string;
  bottomPadding: number;
}

function SheetBody({
  route,
  loading,
  error,
  onRetry,
  textColor,
  mutedColor,
  borderColor,
  accentColor,
  surfaceAltColor,
  bottomPadding,
}: BodyProps) {
  const { t } = useLanguage();
  if (loading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator />
        <Text style={[styles.statusText, { color: mutedColor }]}>{t("directions.finding")}</Text>
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.centered}>
        <Ionicons name="cloud-offline-outline" size={26} color={mutedColor} />
        <Text style={[styles.statusText, { color: mutedColor }]}>{error}</Text>
        <TouchableOpacity onPress={onRetry} style={[styles.retry, { backgroundColor: accentColor }]}>
          <Text style={styles.retryLabel}>{t("directions.retry")}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!route) return null;

  return (
    <>
      <View style={[styles.summary, { borderBottomColor: borderColor }]}>
        <Text style={[styles.duration, { color: textColor }]}>
          {formatDuration(route.durationSeconds, t)}
        </Text>
        <Text style={[styles.summaryMeta, { color: mutedColor }]}>
          {formatDistance(route.distanceMeters, t)}
          {route.transfers !== undefined && route.mode === "transit"
            ? ` · ${t(route.transfers === 1 ? "directions.transfer" : "directions.transfers", { count: route.transfers })}`
            : ""}
          {route.walkSeconds ? ` · ${t("directions.walking", { time: formatDuration(route.walkSeconds, t) })}` : ""}
        </Text>
      </View>

      <ScrollView contentContainerStyle={[styles.steps, { paddingBottom: 18 + bottomPadding }]}>
        {route.steps.map((step, index) => (
          <StepRow
            key={index}
            step={step}
            isLast={index === route.steps.length - 1}
            textColor={textColor}
            mutedColor={mutedColor}
            borderColor={borderColor}
            surfaceAltColor={surfaceAltColor}
          />
        ))}
      </ScrollView>
    </>
  );
}

interface StepRowProps {
  step: RouteStep;
  isLast: boolean;
  textColor: string;
  mutedColor: string;
  borderColor: string;
  surfaceAltColor: string;
}

/**
 * One step of a route: its icon, line name, time, distance and instruction.
 * Also used for each person's steps on the group routes screen.
 * @param step - the step to show
 * @param isLast - stops the coloured line down the left at the final step
 */
export function StepRow({ step, isLast, textColor, mutedColor, borderColor, surfaceAltColor }: StepRowProps) {
  const { t, language } = useLanguage();
  const accent = step.lineColor ?? mutedColor;

  return (
    <View style={styles.stepRow}>
      {/* The rail down the left edge - a dot per step joined by a line in
          that leg's colour, so the journey reads as one connected thing
          rather than a list of unrelated rows. */}
      <View style={styles.rail}>
        <View style={[styles.railDot, { borderColor: accent, backgroundColor: surfaceAltColor }]} />
        {!isLast && <View style={[styles.railLine, { backgroundColor: accent }]} />}
      </View>

      <View style={styles.stepBody}>
        <View style={styles.stepHeader}>
          <Ionicons name={STEP_ICONS[step.mode]} size={15} color={accent} />
          {step.lineName && step.mode !== "WALK" && (
            <View style={[styles.linePill, { backgroundColor: accent }]}>
              <Text style={styles.linePillText}>{step.lineName}</Text>
            </View>
          )}
          <Text style={[styles.stepDuration, { color: mutedColor }]}>
            {formatDuration(step.durationSeconds, t)}
          </Text>
        </View>

        <Text style={[styles.stepInstruction, { color: textColor }]}>
          {translateInstruction(step.instruction, language)}
        </Text>

        <View style={styles.stepMetaRow}>
          {step.stopCount !== undefined && step.mode !== "WALK" && (
            <Text style={[styles.stepMeta, { color: mutedColor }]}>
              {t(step.stopCount === 1 ? "directions.stop" : "directions.stops", { count: step.stopCount })}
            </Text>
          )}
          {step.distanceMeters > 0 && (
            <Text style={[styles.stepMeta, { color: mutedColor }]}>
              {formatDistance(step.distanceMeters, t)}
            </Text>
          )}
        </View>

        {/* Why these directions live in Crowdy: how busy the station you're
            boarding at is, right now, without leaving the journey. */}
        {step.crowd && (
          <View style={[styles.crowdRow, { borderColor }]}>
            <View style={[styles.crowdDot, { backgroundColor: CROWD_COLORS[step.crowd.level] }]} />
            <Text style={[styles.crowdText, { color: mutedColor }]}>
              {t("directions.crowdAt", {
                level: t(crowdKey(step.crowd.level)),
                station: step.fromName ? shortStationName(step.fromName) : t("directions.thisStop"),
              })}
            </Text>
          </View>
        )}
      </View>
    </View>
  );
}

// "Orchard MRT Station" is already obvious as a station in context - the
// suffix just pushes the crowd line onto a second row on narrow screens.
function shortStationName(name: string): string {
  return name.replace(/\s+Station$/i, "");
}

/**
 * Words a trip duration in the app's language, e.g. "25 min" or "1 hr 5 min".
 * @param seconds - the duration in seconds
 * @param t - the translate function
 * @returns the duration text
 */
export function formatDuration(seconds: number, t: Translate): string {
  const minutes = Math.round(seconds / 60);
  if (minutes < 1) return t("duration.underMin");
  if (minutes < 60) return t("duration.min", { m: minutes });
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder ? t("duration.hrMin", { h: hours, m: remainder }) : t("duration.hr", { h: hours });
}

function formatDistance(meters: number, t: Translate): string {
  return meters < 1000
    ? t("distance.m", { n: Math.round(meters) })
    : t("distance.km", { n: (meters / 1000).toFixed(1) });
}

const styles = StyleSheet.create({
  sheet: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderRightWidth: StyleSheet.hairlineWidth,
    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: -3 },
    elevation: 12,
  },
  grabArea: { paddingTop: 10, paddingBottom: 6, alignItems: "center" },
  grabber: { width: 38, height: 4, borderRadius: 2 },
  destination: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 18,
    paddingTop: 4,
    paddingBottom: 12,
  },
  destinationLabel: { fontSize: 13 },
  destinationName: { fontSize: 15, fontWeight: "600", flex: 1 },
  destinationCrowd: { paddingHorizontal: 9, paddingVertical: 3, borderRadius: 10 },
  destinationCrowdText: { color: "#FFFFFF", fontSize: 11, fontWeight: "700" },
  tabs: { flexDirection: "row", paddingHorizontal: 12, paddingBottom: 12, gap: 8 },
  tab: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    paddingVertical: 9,
    borderRadius: 10,
  },
  tabLabel: { fontSize: 12, fontWeight: "600" },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", gap: 10, padding: 24 },
  statusText: { fontSize: 14, textAlign: "center" },
  retry: { paddingHorizontal: 18, paddingVertical: 9, borderRadius: 10, marginTop: 4 },
  retryLabel: { color: "#FFFFFF", fontWeight: "600", fontSize: 14 },
  summary: {
    paddingHorizontal: 18,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  duration: { fontSize: 26, fontWeight: "700" },
  summaryMeta: { fontSize: 13, marginTop: 2 },
  steps: { padding: 18, paddingTop: 14 },
  stepRow: { flexDirection: "row" },
  rail: { width: 22, alignItems: "center" },
  railDot: { width: 11, height: 11, borderRadius: 6, borderWidth: 2.5, marginTop: 3 },
  railLine: { width: 2.5, flex: 1, marginTop: 2, marginBottom: 2, borderRadius: 2 },
  stepBody: { flex: 1, paddingBottom: 20, paddingLeft: 10 },
  stepHeader: { flexDirection: "row", alignItems: "center", gap: 7 },
  linePill: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 5 },
  linePillText: { color: "#FFFFFF", fontSize: 11, fontWeight: "700" },
  stepDuration: { fontSize: 12, marginLeft: "auto" },
  stepInstruction: { fontSize: 15, fontWeight: "500", marginTop: 5 },
  stepMetaRow: { flexDirection: "row", gap: 10, marginTop: 3 },
  stepMeta: { fontSize: 12.5 },
  crowdRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    marginTop: 9,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  crowdDot: { width: 8, height: 8, borderRadius: 4 },
  crowdText: { fontSize: 12.5 },
});
