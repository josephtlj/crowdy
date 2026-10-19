import React, { useCallback, useEffect, useRef, useState } from "react";
import { View, StyleSheet, ActivityIndicator, Text, useWindowDimensions } from "react-native";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import * as Location from "expo-location";
import { RootStackParamList } from "../navigation/types";
import { Venue } from "../types/venue";
import { LatLng, Route, TravelMode } from "../types/directions";
import { getVenueById, getDirections } from "../services/api";
import { haversineKm } from "../services/distance";
import { RouteMap } from "../components/RouteMap";
import { DirectionsSheet, COLLAPSED_FRACTION } from "../components/DirectionsSheet";
import { useTheme } from "../theme/ThemeContext";

type Props = NativeStackScreenProps<RootStackParamList, "Directions">;

// How far you have to actually travel before the journey is recalculated.
// Position updates arrive far more often than this; re-routing on each one
// would mean a fresh OneMap lookup every few seconds and a route that
// flickers while standing still, since GPS drifts by tens of metres even
// stationary. 150m is past that noise while still catching a real move -
// you've left the bus stop, walked the wrong way out of the station.
const REROUTE_AFTER_M = 150;

export default function DirectionsScreen({ route: navRoute, navigation }: Props) {
  const { venueId } = navRoute.params;
  const { colors } = useTheme();
  const { height: screenHeight } = useWindowDimensions();

  const [venue, setVenue] = useState<Venue | null>(null);
  // The position the current route was calculated from - deliberately not
  // every GPS fix. Route loading keys off this, so a live position feed
  // can't trigger a refetch storm.
  const [routeOrigin, setRouteOrigin] = useState<LatLng | null>(null);
  const [mode, setMode] = useState<TravelMode>("transit");
  const [route, setRoute] = useState<Route | null>(null);
  const [loadingRoute, setLoadingRoute] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [setupError, setSetupError] = useState<string | null>(null);

  const routeOriginRef = useRef<LatLng | null>(null);
  // Each mode's route is kept once fetched, so flicking between tabs to
  // compare "train vs walk" is instant after the first look at each. Cleared
  // when you move far enough that those routes no longer start where you do.
  const routeCache = useRef(new Map<TravelMode, Route>());

  useEffect(() => {
    let subscription: Location.LocationSubscription | null = null;
    let cancelled = false;

    const acceptPosition = (coords: { latitude: number; longitude: number }) => {
      const next = { lat: coords.latitude, lng: coords.longitude };
      const current = routeOriginRef.current;

      if (current) {
        const movedMetres = haversineKm(current.lat, current.lng, next.lat, next.lng) * 1000;
        if (movedMetres < REROUTE_AFTER_M) return;
        routeCache.current.clear();
      }

      routeOriginRef.current = next;
      setRouteOrigin(next);
    };

    (async () => {
      const [found, permission] = await Promise.all([
        getVenueById(venueId),
        Location.requestForegroundPermissionsAsync(),
      ]);
      if (cancelled) return;

      if (!found) {
        setSetupError("Venue not found.");
        return;
      }
      setVenue(found);
      navigation.setOptions({ title: found.name });

      if (permission.status !== "granted") {
        setSetupError("Location access is needed to work out directions from where you are.");
        return;
      }

      // A cached fix, if the device has one, draws a route immediately
      // instead of holding an empty screen while the GPS settles - which
      // indoors (exactly where you'd look up directions to a mall) can take
      // a while, or never resolve at all.
      const lastKnown = await Location.getLastKnownPositionAsync();
      if (cancelled) return;
      if (lastKnown) acceptPosition(lastKnown.coords);

      subscription = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.Balanced,
          distanceInterval: 25,
          timeInterval: 5000,
        },
        (position) => acceptPosition(position.coords)
      );
      if (cancelled) subscription.remove();
    })();

    // Without this the watcher outlives the screen, keeping the GPS awake
    // and calling setState on something React has already unmounted.
    return () => {
      cancelled = true;
      subscription?.remove();
    };
  }, [venueId, navigation]);

  const loadRoute = useCallback(
    async (travelMode: TravelMode, { useCache = true } = {}) => {
      if (!routeOrigin) return;

      const cached = routeCache.current.get(travelMode);
      if (useCache && cached) {
        setRoute(cached);
        setError(null);
        setLoadingRoute(false);
        return;
      }

      setLoadingRoute(true);
      setError(null);
      try {
        const result = await getDirections(routeOrigin, venueId, travelMode);
        routeCache.current.set(travelMode, result);
        setRoute(result);
      } catch {
        setRoute(null);
        setError("Couldn't load this route right now.");
      } finally {
        setLoadingRoute(false);
      }
    },
    [routeOrigin, venueId]
  );

  useEffect(() => {
    void loadRoute(mode);
  }, [mode, loadRoute]);

  if (setupError) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.background }]}>
        <Text style={[styles.message, { color: colors.textMuted }]}>{setupError}</Text>
      </View>
    );
  }

  // The map can't draw until both ends of the journey are known; the sheet
  // has nothing to show either, so this waits rather than rendering a map of
  // nowhere behind an empty sheet.
  if (!venue || !routeOrigin) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <RouteMap
        origin={routeOrigin}
        destination={{ lat: venue.lat, lng: venue.lng }}
        destinationName={venue.name}
        // Cleared while a different mode loads rather than left showing the
        // previous one - a walking line drawn under "finding your train"
        // reads as the answer, and it isn't.
        segments={loadingRoute ? [] : route?.segments ?? []}
        bottomInset={screenHeight * COLLAPSED_FRACTION}
      />
      <DirectionsSheet
        mode={mode}
        onSelectMode={setMode}
        route={route}
        loading={loadingRoute}
        error={error}
        onRetry={() => void loadRoute(mode, { useCache: false })}
        destinationName={venue.name}
        destinationCrowd={venue.crowdLevel}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, justifyContent: "center", alignItems: "center", padding: 32 },
  message: { fontSize: 15, textAlign: "center", lineHeight: 21 },
});
