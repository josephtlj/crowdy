import React, { useEffect, useRef, useState } from "react";
import { StyleSheet, View, TouchableOpacity, Text, Alert } from "react-native";
import MapView, { Marker, Polyline, Region, MapPressEvent } from "react-native-maps";
// Wraps MapView with screen-proximity clustering (built on supercluster) -
// mixed across all venue categories, purely based on on-screen overlap at
// the current zoom level, not category or region. Its own `mapRef` prop
// (not a plain `ref`) is how it exposes the underlying MapView instance.
import ClusterMapView from "react-native-map-clustering";
import * as Location from "expo-location";
import { Venue } from "../types/venue";
import { MapRegion } from "../types/region";
import { RailLineSegment } from "../types/railLine";
import { LayerState, isVenueInLayers } from "../types/layers";
import { StationDot } from "./StationDot";
import { PIN_COLORS } from "./pinColors";
import { useTheme } from "../theme/ThemeContext";
import { DARK_MAP_STYLE } from "../theme/darkMapStyle";

// react-native-map-clustering reads `cluster` off each Marker's props at
// runtime to decide whether to include it in clustering, but that prop
// isn't part of react-native-maps' own typed MapMarkerProps.
const ClusterableMarker = Marker as unknown as React.ComponentType<
  React.ComponentProps<typeof Marker> & { cluster?: boolean }
>;

interface Props {
  initialRegion: MapRegion;
  venues: Venue[];
  railLines: RailLineSegment[];
  layers: LayerState;
  onToggleLayer: (key: keyof LayerState) => void;
  selectedVenueId: string | null;
  onSelectVenue: (venueId: string) => void;
  onDeselect: () => void;
  onRegionChange: (region: MapRegion) => void;
}

const LAYER_TOGGLES: { key: keyof LayerState; label: string; color: string }[] = [
  { key: "transit", label: "Transit", color: PIN_COLORS.Transit },
  { key: "venue", label: "Venue", color: PIN_COLORS.Venue },
];

// Metro picks this file automatically on iOS/Android (see VenueMap.web.tsx
// for the web fallback) - react-native-maps never enters the web bundle.
export function VenueMap({
  initialRegion,
  venues,
  railLines,
  layers,
  onToggleLayer,
  selectedVenueId,
  onSelectVenue,
  onDeselect,
  onRegionChange,
}: Props) {
  const { mode, colors } = useTheme();
  const mapRef = useRef<MapView>(null);
  // Tracks the map's own last known zoom level so centring (on a selected
  // venue, or on recentring) can keep whatever zoom the User was already
  // at, instead of resetting it - onRegionChange only reports upward, it
  // isn't fed back into the (uncontrolled) map, so this is its own memory.
  const lastRegionRef = useRef<MapRegion>(initialRegion);
  const [recentring, setRecentring] = useState(false);
  // Markers currently allowed to re-snapshot themselves. Previously this was
  // `hasSelection` applied to all ~200 markers at once - true for the entire
  // time any pin stayed selected, not just while switching. Forcing every
  // marker to continuously re-render its native snapshot simultaneously is
  // what was causing pins to intermittently render blank (the native side
  // couldn't keep up). Only the marker(s) whose actual appearance changes in
  // a given transition need this, and only for the brief moment they change.
  const [trackingIds, setTrackingIds] = useState<Set<string>>(new Set());
  const prevSelectedRef = useRef<string | null>(null);

  useEffect(() => {
    if (!selectedVenueId) return;
    const venue = venues.find((v) => v.id === selectedVenueId);
    if (!venue) return;
    const { latitudeDelta, longitudeDelta } = lastRegionRef.current;
    // One-time snap to centre on the newly selected venue - after this the
    // User can freely pan/zoom away again, nothing keeps pulling it back.
    mapRef.current?.animateToRegion(
      { latitude: venue.lat, longitude: venue.lng, latitudeDelta, longitudeDelta },
      300
    );
  }, [selectedVenueId, venues]);

  useEffect(() => {
    const prevSelected = prevSelectedRef.current;
    const wasSelectionActive = prevSelected !== null;
    const isSelectionActive = selectedVenueId !== null;

    // Entering or leaving "some pin selected" changes every marker's dim
    // state at once (all dim in, or all dim out) - everyone needs to
    // re-snapshot. Switching directly from one selected pin to another only
    // changes those two markers' appearance; the rest were already dimmed
    // and stay that way, so they don't need to redraw at all.
    const ids =
      wasSelectionActive !== isSelectionActive
        ? new Set(venues.map((v) => v.id))
        : new Set([prevSelected, selectedVenueId].filter((id): id is string => id !== null));

    prevSelectedRef.current = selectedVenueId;
    setTrackingIds(ids);

    if (ids.size === 0) return;
    // Give the native map a short settling window to capture the new
    // snapshot, then freeze it again - keeping ~200 markers permanently
    // trackable is what caused the blank-pin bug in the first place.
    const timer = setTimeout(() => setTrackingIds(new Set()), 500);
    return () => clearTimeout(timer);
  }, [selectedVenueId, venues]);

  const handleRegionChangeComplete = (region: Region) => {
    lastRegionRef.current = {
      latitude: region.latitude,
      longitude: region.longitude,
      latitudeDelta: region.latitudeDelta,
      longitudeDelta: region.longitudeDelta,
    };
    onRegionChange(lastRegionRef.current);
  };

  // Tapping a Marker can also bubble up to the MapView's own onPress on
  // Android (a known react-native-maps quirk) - without this check, that
  // immediately deselected whatever the Marker press just selected.
  // nativeEvent.action distinguishes a genuine empty-map tap from one that
  // originated on a marker.
  const handleMapPress = (event: MapPressEvent) => {
    if (event.nativeEvent.action === "marker-press") return;
    onDeselect();
  };

  const handleRecentre = async () => {
    setRecentring(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        Alert.alert(
          "Location access needed",
          "Enable location access for Crowdy in Settings to recentre the map."
        );
        return;
      }
      const position = await Location.getCurrentPositionAsync({});
      const { latitudeDelta, longitudeDelta } = lastRegionRef.current;
      mapRef.current?.animateToRegion(
        {
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          latitudeDelta,
          longitudeDelta,
        },
        300
      );
    } catch (err) {
      // Permission granted but the fix itself failed (no GPS set on an
      // emulator, weak signal, momentarily unavailable) - same fallback
      // philosophy as the denied-permission case above, just surfaced as
      // an alert instead of silently doing nothing, since this one's a
      // direct response to the User tapping the button.
      console.error("Failed to get current location for recentring:", err);
      Alert.alert("Location unavailable", "Couldn't get your current location. Try again in a moment.");
    } finally {
      setRecentring(false);
    }
  };

  const hasSelection = selectedVenueId !== null;

  // The selected venue always renders, even if its layer is toggled off -
  // otherwise searching for a venue/station while both layers are off (or
  // just its own layer is off) pans the map to a marker that's actually
  // invisible. Nothing else re-appears alongside it, so with both layers
  // off this is genuinely the only marker shown until it's deselected.
  const visibleVenues = venues.filter(
    (venue) => isVenueInLayers(venue, layers) || venue.id === selectedVenueId
  );

  return (
    <View style={styles.wrapper}>
      <ClusterMapView
        mapRef={(map: MapView) => {
          mapRef.current = map;
        }}
        style={styles.map}
        initialRegion={initialRegion}
        showsUserLocation
        onRegionChangeComplete={handleRegionChangeComplete}
        onPress={handleMapPress}
        userInterfaceStyle={mode} // Apple Maps (iOS default provider)
        customMapStyle={mode === "dark" ? DARK_MAP_STYLE : []} // Google Maps (Android)
        // Insets the native map chrome (Apple's legal/attribution link,
        // Google's logo/compass) away from the map's own edges - without
        // this, the bottom sheet's -20 overlap (see HomeScreen's marginTop)
        // clips straight through the attribution text at the bottom-left.
        mapPadding={{ top: 0, right: 0, bottom: 28, left: 0 }}
        clusterColor={colors.accent}
        clusterTextColor="#FFFFFF"
        // Two markers merging into an anonymous numbered bubble read as
        // confusing/ambiguous - only cluster once a group is dense enough
        // that showing individual pins would genuinely overlap.
        minPoints={4}
      >
        {layers.transit &&
          railLines.map((line, i) => (
            <Polyline
              key={`${line.code}-${i}`}
              coordinates={line.coordinates.map((c) => ({ latitude: c.lat, longitude: c.lng }))}
              strokeColor={line.color}
              strokeWidth={3}
            />
          ))}

        {visibleVenues.map((venue) => {
          const isSelected = venue.id === selectedVenueId;
          const isDimmed = hasSelection && !isSelected;
          return (
            <ClusterableMarker
              key={venue.id}
              coordinate={{ latitude: venue.lat, longitude: venue.lng }}
              anchor={{ x: 0.5, y: 0.5 }}
              onPress={() => onSelectVenue(venue.id)}
              // No title/description: the native callout bubble this would
              // otherwise show is redundant now that selecting a venue expands
              // its info inline in the list below instead.
              tracksViewChanges={trackingIds.has(venue.id)}
              // Every venue is now a crowd-colored dot (Transit and Venue
              // alike) - dots sit on their own, individually tappable, so
              // none of them cluster into an anonymous count bubble.
              cluster={false}
            >
              <StationDot level={venue.crowdLevel} dimmed={isDimmed} />
            </ClusterableMarker>
          );
        })}
      </ClusterMapView>

      <View style={styles.layerToggles}>
        {LAYER_TOGGLES.map(({ key, label, color }) => {
          const active = layers[key];
          return (
            <TouchableOpacity
              key={key}
              style={[
                styles.layerButton,
                { backgroundColor: active ? color : mode === "dark" ? "#000000" : "#FFFFFF" },
              ]}
              onPress={() => onToggleLayer(key)}
              accessibilityLabel={`Toggle ${label} layer`}
            >
              <Text style={[styles.layerButtonText, { color: active ? "#FFFFFF" : colors.accent }]}>
                {label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      <TouchableOpacity
        style={[
          styles.recentreButton,
          { backgroundColor: mode === "dark" ? "#000000" : "#FFFFFF" },
        ]}
        onPress={handleRecentre}
        disabled={recentring}
        accessibilityLabel="Recentre map on my location"
      >
        <Text style={[styles.recentreIcon, { color: colors.accent }]}>⌖</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { width: "100%", height: "58%" },
  map: { width: "100%", height: "100%" },
  layerToggles: {
    position: "absolute",
    left: 14,
    bottom: 34,
    gap: 10,
  },
  layerButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000",
    shadowOpacity: 0.25,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  layerButtonText: { fontSize: 10.5, fontWeight: "700" },
  recentreButton: {
    position: "absolute",
    right: 14,
    // The sheet below overlaps the map by 20 (its own negative marginTop),
    // so this needs to clear that or the sheet's rounded corner covers it.
    bottom: 34,
    width: 42,
    height: 42,
    borderRadius: 21,
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000",
    shadowOpacity: 0.25,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 4,
  },
  recentreIcon: { fontSize: 20 },
});
