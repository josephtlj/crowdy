import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  View,
  Text,
  FlatList,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Platform,
  ActivityIndicator,
  LayoutAnimation,
  Animated,
  Keyboard,
  Dimensions,
  LayoutChangeEvent,
} from "react-native";
import * as Location from "expo-location";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { RootStackParamList } from "../navigation/types";
import { Venue } from "../types/venue";
import { MapRegion } from "../types/region";
import { RailLineSegment } from "../types/railLine";
import { LayerState, isVenueInLayers } from "../types/layers";
import { getNearbyVenues, getRailLines } from "../services/api";
import { haversineKm } from "../services/distance";
import { loadSavedVenueIds, persistSavedVenueIds } from "../services/savedVenues";
import { VenueRow } from "../components/VenueRow";
import { VenueMap } from "../components/VenueMap";
import { TabBar, TabKey } from "../components/TabBar";
import { useTheme } from "../theme/ThemeContext";

// Marina Bay, used only if the user denies location permission.
const FALLBACK_REGION = { lat: 1.2838, lng: 103.8591 };
const DEFAULT_DELTA = 0.05;
// Crowd data can change server-side (a mall's daily Popular Times refresh, a
// transit station's 5-minute LTA cache) without anything on this screen
// triggering a re-fetch - previously the venue list was only ever fetched
// once, at mount, so a marker/list row could sit showing an increasingly
// stale reading for as long as the app stayed open. This keeps it close to
// what the server actually has without re-fetching on every tiny change.
const VENUE_REFRESH_INTERVAL_MS = 2 * 60 * 1000;
// Animating every pan regardless of size meant a big jump (dozens of rows
// swapping at once) paid the full cost of an animated layout pass for a
// change too large to visually track anyway. Only animate when the number
// of rows actually entering/leaving is small enough that the motion is
// still something you could follow - bigger changes just snap instantly.
const LAYOUT_ANIMATION_MAX_CHANGED = 10;
// While the keyboard's up on the search tab, the list is guaranteed at
// least this many rows of height - a floor, not a cap. If more room is
// actually available above the keyboard it fills the rest with more
// results instead of leaving it blank; this is only what it shrinks to
// when space is tight. FlatList needs an explicit height (not maxHeight)
// to size its virtualized viewport - unlike a plain View it doesn't
// shrink-to-fit content on its own.
const SEARCH_LIST_MIN_VISIBLE_ROWS = 3;
const SEARCH_ROW_HEIGHT_ESTIMATE = 64;
const SEARCH_LIST_MIN_HEIGHT = SEARCH_ROW_HEIGHT_ESTIMATE * SEARCH_LIST_MIN_VISIBLE_ROWS;

type Props = NativeStackScreenProps<RootStackParamList, "Home">;

function isWithinRegion(venue: Venue, region: MapRegion): boolean {
  const latMin = region.latitude - region.latitudeDelta / 2;
  const latMax = region.latitude + region.latitudeDelta / 2;
  const lngMin = region.longitude - region.longitudeDelta / 2;
  const lngMax = region.longitude + region.longitudeDelta / 2;
  return venue.lat >= latMin && venue.lat <= latMax && venue.lng >= lngMin && venue.lng <= lngMax;
}

export default function HomeScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const [venues, setVenues] = useState<Venue[]>([]);
  const [railLines, setRailLines] = useState<RailLineSegment[]>([]);
  const [region, setRegion] = useState<MapRegion | null>(null);
  // The User's actual GPS position, captured once and kept stable - distinct
  // from `region`, which moves every time the map is panned/zoomed. Null
  // means location permission was denied, not "not loaded yet" (loading
  // gates on `region`, which is set either way via the fallback).
  const [userLocation, setUserLocation] = useState<{ lat: number; lng: number } | null>(null);
  const queryCoordsRef = useRef(FALLBACK_REGION);
  const [loading, setLoading] = useState(true);
  const [selectedVenueId, setSelectedVenueId] = useState<string | null>(null);
  // "Areas" and "Saved" both stay on this screen - only the list beneath the
  // map swaps, matching the Singabus-style inline tab switch rather than
  // navigating to a second page.
  const [activeTab, setActiveTab] = useState<TabKey>("areas");
  const [searchQuery, setSearchQuery] = useState("");
  // Off by default - like Google/Apple Maps' own "explore" view, nothing
  // custom is drawn until the User picks a layer. Lives here (not in
  // VenueMap) so the list below can filter to match what's on the map.
  const [layers, setLayers] = useState<LayerState>({
    transit: false,
    venue: false,
  });
  // On-device only for now (see savedVenues.ts) - loaded once on mount,
  // written back to disk on every toggle.
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  useEffect(() => {
    loadSavedVenueIds().then(setSavedIds);
  }, []);

  // Functional-setState form (no `savedIds` dependency) so this is one
  // stable reference for VenueRow's memoization, same reasoning as
  // toggleSelection below.
  const handleToggleSaved = useCallback((venueId: string) => {
    setSavedIds((current) => {
      const next = new Set(current);
      if (next.has(venueId)) next.delete(venueId);
      else next.add(venueId);
      persistSavedVenueIds(next);
      return next;
    });
  }, []);

  const listRef = useRef<FlatList<Venue>>(null);

  // Slides the sheet (search bar + list) up over the map when the keyboard
  // opens, so the search input clears the keyboard - Android already
  // resizes the window itself by default - but that assumption was never
  // actually verified against this specific layout (a map behind a sheet
  // that overlaps it via negative margin), and there's no explicit
  // windowSoftInputMode set in app.json to confirm it either. Confirmed
  // directly: it doesn't - the same shift/resize logic below is needed on
  // both platforms, just driven by different Keyboard events, since
  // "keyboardWillShow"/"keyboardWillHide" are iOS-only and never fire on
  // Android at all (Android only has the "Did" variants, which fire after
  // the keyboard has already finished animating rather than in sync with
  // it - slightly less smooth, but otherwise identical behavior).
  // Deliberately a transform on the sheet rather than
  // resizing anything: an earlier attempt shrank the whole screen
  // (KeyboardAvoidingView around map + sheet), which resized the live
  // MapView on every animation frame and read as a slow, jittery zoom since
  // its region stayed fixed while its pixel size changed underneath it.
  //
  // `searchListHeight` is null whenever the keyboard's down (search tab
  // just uses the normal full-height list then, same as every other tab).
  // Once the keyboard shows, both the shift and the list's height are
  // computed together from real measured positions: `sheetLayoutRef` is the
  // sheet's own natural (untransformed - onLayout ignores the transform)
  // top position, `listLayoutRef` is the list's natural position relative
  // to the sheet (i.e. the height of the tab bar + search row above it).
  // Together they give the list's natural absolute top. If there's already
  // more room above the keyboard than SEARCH_LIST_MIN_HEIGHT needs, the
  // list just fills that room as-is (no shift, more results shown) -
  // otherwise the sheet shifts up by just enough to make exactly
  // SEARCH_LIST_MIN_HEIGHT of room, no more (an earlier version shifted by
  // the sheet's full height regardless, which overshot and pushed the
  // search bar needlessly high).
  const sheetOffset = useRef(new Animated.Value(0)).current;
  const sheetLayoutRef = useRef({ y: 0 });
  const listLayoutRef = useRef({ y: 0 });
  const [searchListHeight, setSearchListHeight] = useState<number | null>(null);
  const handleSheetLayout = useCallback((e: LayoutChangeEvent) => {
    sheetLayoutRef.current = { y: e.nativeEvent.layout.y };
  }, []);
  const handleSearchListLayout = useCallback((e: LayoutChangeEvent) => {
    listLayoutRef.current = { y: e.nativeEvent.layout.y };
  }, []);

  useEffect(() => {
    const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";

    const showSub = Keyboard.addListener(showEvent, (e) => {
      const screenHeight = Dimensions.get("window").height;
      const keyboardTop = screenHeight - e.endCoordinates.height;
      const listTopNatural = sheetLayoutRef.current.y + listLayoutRef.current.y;
      const naturalAvailable = keyboardTop - listTopNatural;
      const availableListHeight = Math.max(SEARCH_LIST_MIN_HEIGHT, naturalAvailable);
      const shift = Math.max(0, listTopNatural + availableListHeight - keyboardTop);
      setSearchListHeight(availableListHeight);
      Animated.timing(sheetOffset, {
        toValue: -shift,
        duration: e.duration || 250,
        useNativeDriver: true,
      }).start();
    });
    const hideSub = Keyboard.addListener(hideEvent, (e) => {
      setSearchListHeight(null);
      Animated.timing(sheetOffset, {
        toValue: 0,
        duration: e.duration || 250,
        useNativeDriver: true,
      }).start();
    });
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, [sheetOffset]);

  // Tapping the already-selected pin/row again deselects it, matching
  // ordinary toggle-select behaviour. Wrapped in useCallback (with no
  // dependencies - the functional setState form doesn't need any) so this
  // is the same function reference across every render, letting it be
  // handed to every row as a stable prop instead of a fresh per-row closure
  // - required for VenueRow's memoization to actually skip unchanged rows.
  const toggleSelection = useCallback((venueId: string) => {
    setSelectedVenueId((current) => (current === venueId ? null : venueId));
  }, []);

  const handleSeeDetails = useCallback(
    (venueId: string) => navigation.navigate("Detail", { venueId }),
    [navigation]
  );

  const handleToggleLayer = (key: keyof LayerState) => {
    setLayers((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleTabPress = (key: TabKey) => {
    if (key === "settings") return navigation.navigate("Settings");
    setActiveTab(key); // "areas", "saved", or "search"
  };

  useEffect(() => {
    (async () => {
      let coords = FALLBACK_REGION;
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === "granted") {
          const position = await Location.getCurrentPositionAsync({});
          coords = { lat: position.coords.latitude, lng: position.coords.longitude };
          setUserLocation(coords);
        }
      } catch (err) {
        // Permission granted but the fix itself failed (no GPS set on an
        // emulator, weak signal indoors, momentarily unavailable) - falls
        // back to the same default used for a denied permission, instead
        // of leaving the whole screen stuck on its loading spinner forever
        // (confirmed: this was previously unhandled, crashing the mount
        // effect before it ever reached setRegion/setLoading).
        console.error("Failed to get current location, falling back to default region:", err);
      }
      queryCoordsRef.current = coords;
      setRegion({
        latitude: coords.lat,
        longitude: coords.lng,
        latitudeDelta: DEFAULT_DELTA,
        longitudeDelta: DEFAULT_DELTA,
      });
      const nearby = await getNearbyVenues(coords.lat, coords.lng);
      setVenues(nearby);
      setLoading(false);
    })();
  }, []);

  // Static geometry, unrelated to the User's location - fetched once
  // independently rather than blocking the location/venues load above.
  useEffect(() => {
    getRailLines().then(setRailLines);
  }, []);

  // Keeps markers/list rows from silently going stale for as long as the
  // app stays open (see VENUE_REFRESH_INTERVAL_MS above) - reuses whatever
  // coordinates the initial load resolved, not a fresh GPS read each time,
  // since this is just about refreshing crowd data, not re-finding the User.
  useEffect(() => {
    const interval = setInterval(() => {
      getNearbyVenues(queryCoordsRef.current.lat, queryCoordsRef.current.lng).then(setVenues);
    }, VENUE_REFRESH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, []);

  // Web has no map to pan, so it always shows the full nearby list.
  // Native still re-filters to whatever's inside the map's current
  // viewport as it's panned (the Singabus-style "list follows the map"
  // behaviour), but sorts by distance to the User's own fixed location
  // rather than the moving viewport centre - previously every pan re-sorted
  // the whole list by a new centre point, which is what made it feel like
  // it was jumping around; sorting by a point that doesn't move means a pan
  // only adds/removes rows at the ends instead of reshuffling everything.
  const visibleVenues = useMemo(() => {
    if (Platform.OS === "web" || !region) return venues;
    return venues
      .filter((venue) => isWithinRegion(venue, region))
      .map((venue) => ({
        ...venue,
        distanceKm: userLocation ? haversineKm(userLocation.lat, userLocation.lng, venue.lat, venue.lng) : undefined,
      }))
      .sort((a, b) => (a.distanceKm ?? 0) - (b.distanceKm ?? 0));
  }, [venues, region, userLocation]);

  // Searches the full known venue list (not just what's in the map's
  // current viewport, unlike Areas), same as search - a saved venue should
  // still show up here even if it's currently off-screen or its layer is
  // toggled off.
  const savedVenues = useMemo(() => {
    return venues
      .filter((venue) => savedIds.has(venue.id))
      .map((venue) => ({
        ...venue,
        distanceKm: userLocation ? haversineKm(userLocation.lat, userLocation.lng, venue.lat, venue.lng) : undefined,
      }))
      .sort((a, b) => (a.distanceKm ?? 0) - (b.distanceKm ?? 0));
  }, [venues, savedIds, userLocation]);
  // The list mirrors whatever layers are toggled on, same as the map - a
  // venue type with its layer off shouldn't appear in one place but not the
  // other.
  const layeredVenues = useMemo(
    () => visibleVenues.filter((venue) => isVenueInLayers(venue, layers)),
    [visibleVenues, layers]
  );

  // Searches the full known venue list (not just what's in the map's
  // current viewport, unlike Areas) - purely client-side, matching by name
  // against every venue Crowdy already has loaded, no new API involved.
  // Matches that start with the query rank above ones that merely contain
  // it, so searching "vivo" puts VivoCity itself before some
  // Vivo-something-else it happens to also match.
  const searchResults = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return [];
    return venues
      .filter((venue) => venue.name.toLowerCase().includes(query))
      .map((venue) => ({
        ...venue,
        distanceKm: userLocation ? haversineKm(userLocation.lat, userLocation.lng, venue.lat, venue.lng) : undefined,
      }))
      .sort((a, b) => {
        const aStarts = a.name.toLowerCase().startsWith(query);
        const bStarts = b.name.toLowerCase().startsWith(query);
        if (aStarts !== bStarts) return aStarts ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
  }, [venues, searchQuery, userLocation]);

  const listData = activeTab === "saved" ? savedVenues : activeTab === "search" ? searchResults : layeredVenues;
  const noLayersOn = !layers.transit && !layers.venue;

  // Tracks which venues are currently in `listData` so handleRegionChange
  // can tell, before committing the new region, how many rows the pan is
  // actually about to add/remove.
  const visibleIdsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    visibleIdsRef.current = new Set(listData.map((v) => v.id));
  }, [listData]);

  // Smooths the add/remove transition as venues enter or leave the visible
  // set while panning - but only for small changes (see
  // LAYOUT_ANIMATION_MAX_CHANGED above). This replicates the region+layers
  // filter inline rather than reusing visibleVenues/layeredVenues because
  // the decision to animate has to be made *before* the state update that
  // would recompute them - LayoutAnimation only affects whatever layout
  // change happens in the very next commit.
  const handleRegionChange = (nextRegion: MapRegion) => {
    const nextVisibleIds = new Set(
      venues.filter((v) => isWithinRegion(v, nextRegion) && isVenueInLayers(v, layers)).map((v) => v.id)
    );
    let changed = 0;
    for (const id of nextVisibleIds) if (!visibleIdsRef.current.has(id)) changed++;
    for (const id of visibleIdsRef.current) if (!nextVisibleIds.has(id)) changed++;
    if (changed > 0 && changed <= LAYOUT_ANIMATION_MAX_CHANGED) {
      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    }
    setRegion(nextRegion);
  };

  // Selecting a venue re-centres the map on it, which changes which venues
  // are in view - but the list is now sorted by distance from the User, not
  // from the selected venue, so the selected one isn't guaranteed to land
  // at the top of the list any more (that was only ever incidental to the
  // old viewport-centre sort). Scrolls to wherever it actually ended up
  // instead of assuming position 0, so the User doesn't hunt for it.
  useEffect(() => {
    if (!selectedVenueId) return;
    const index = listData.findIndex((v) => v.id === selectedVenueId);
    if (index === -1) return; // filtered out of the current view - nothing to scroll to
    listRef.current?.scrollToIndex({ index, animated: true, viewPosition: 0 });
  }, [selectedVenueId, listData]);

  if (loading || !region) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <VenueMap
        initialRegion={region}
        venues={venues}
        railLines={railLines}
        layers={layers}
        onToggleLayer={handleToggleLayer}
        selectedVenueId={selectedVenueId}
        onSelectVenue={toggleSelection}
        onDeselect={() => setSelectedVenueId(null)}
        onRegionChange={handleRegionChange}
      />

      <Text style={[styles.brand, { top: insets.top + 8 }]}>Crowdy</Text>

      <Animated.View
        onLayout={handleSheetLayout}
        style={[
          styles.sheet,
          activeTab === "search" && searchListHeight != null && styles.sheetCompact,
          { backgroundColor: colors.background, transform: [{ translateY: sheetOffset }] },
        ]}
      >
        <TabBar active={activeTab} onPress={handleTabPress} />

        {activeTab === "search" && (
          <View style={[styles.searchRow, { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}>
            <TextInput
              style={[styles.searchInput, { color: colors.text }]}
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="Search venues by name"
              placeholderTextColor={colors.textMuted}
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="search"
              clearButtonMode="while-editing"
            />
            {/* clearButtonMode covers iOS - Android has no native equivalent,
                so this fills the same gap there without duplicating it on iOS. */}
            {Platform.OS === "android" && searchQuery.length > 0 && (
              <TouchableOpacity onPress={() => setSearchQuery("")} hitSlop={8}>
                <Text style={[styles.searchClear, { color: colors.textMuted }]}>✕</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        <FlatList
          ref={listRef}
          onLayout={activeTab === "search" ? handleSearchListLayout : undefined}
          style={[
            styles.list,
            activeTab === "search" && searchListHeight != null && { flex: 0, height: searchListHeight },
          ]}
          data={listData}
          keyExtractor={(item) => item.id}
          extraData={[selectedVenueId, savedIds]}
          // Rows have variable height (they expand when selected), so
          // FlatList can't always measure a far-off-screen target on the
          // first attempt - land approximately, then real positions settle
          // in as more rows render.
          onScrollToIndexFailed={(info) => {
            listRef.current?.scrollToOffset({ offset: info.averageItemLength * info.index, animated: true });
          }}
          ListEmptyComponent={
            <Text style={[styles.empty, { color: colors.textMuted }]}>
              {activeTab === "saved"
                ? "No saved areas."
                : activeTab === "search"
                  ? searchQuery.trim()
                    ? `No venues match "${searchQuery.trim()}".`
                    : "Type a venue name to search."
                  : noLayersOn
                    ? "Toggle on venue types to view crowds."
                    : "No venues in view - pan or zoom out the map."}
            </Text>
          }
          renderItem={({ item }) => (
            <VenueRow
              id={item.id}
              name={item.name}
              category={item.category}
              crowdLevel={item.crowdLevel}
              crowdPercent={item.crowdPercent}
              lastUpdated={item.lastUpdated}
              distanceKm={item.distanceKm}
              isSelected={item.id === selectedVenueId}
              isSaved={savedIds.has(item.id)}
              colors={colors}
              hours={item.hours}
              onToggleSelect={toggleSelection}
              onSeeDetails={handleSeeDetails}
              onToggleSaved={handleToggleSaved}
            />
          )}
          // Trims how much FlatList renders ahead of what's actually
          // visible - the defaults favour seamless fast-scrolling by
          // keeping a large buffer of extra rows mounted, but this list
          // updates far more often than it gets scrolled fast (every pan,
          // every 2-minute refresh), so a smaller buffer means less work on
          // every one of those updates, at the minor cost of occasionally
          // rendering a row just slightly ahead of it coming into view.
          initialNumToRender={12}
          maxToRenderPerBatch={10}
          windowSize={7}
          updateCellsBatchingPeriod={50}
        />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { flex: 1, justifyContent: "center", alignItems: "center" },
  brand: {
    position: "absolute",
    left: 12,
    fontSize: 20,
    fontWeight: "800",
    color: "#EB5757",
    textShadowColor: "rgba(255,255,255,0.9)",
    textShadowRadius: 3,
  },
  sheet: {
    flex: 1,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    marginTop: -20,
    paddingTop: 8,
    overflow: "hidden",
  },
  // Shrinks the sheet to fit its content (tab bar + search row + the
  // keyboard-sized list below) instead of stretching to fill the rest of
  // the screen - otherwise the list's explicit height would just leave
  // blank sheet background below it rather than actually taking up less
  // room.
  sheetCompact: { flex: 0 },
  list: { flex: 1 },
  empty: { textAlign: "center", padding: 24 },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 16,
    marginBottom: 8,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
  },
  searchInput: { flex: 1, height: 40, fontSize: 15 },
  searchClear: { fontSize: 16, paddingLeft: 8, paddingVertical: 4 },
});
