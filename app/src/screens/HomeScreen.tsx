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
import { useFocusEffect } from "@react-navigation/native";
import { SheetHandle, useSnapSheet } from "../components/SnapSheet";
import { NativeStackScreenProps } from "@react-navigation/native-stack";
import { RootStackParamList } from "../navigation/types";
import { Venue } from "../types/venue";
import { MapRegion } from "../types/region";
import { RailLineSegment } from "../types/railLine";
import { LayerState, isVenueInLayers } from "../types/layers";
import {
  getNearbyVenues,
  getRailLines,
  getFavourites,
  saveFavourite,
  unsaveFavourite,
  ApiError,
} from "../services/api";
import { haversineKm } from "../services/distance";
import { venueSearchRank } from "../services/venueSearch";
import { loadSavedVenueIds, persistSavedVenueIds } from "../services/savedVenues";
import { VenueRow } from "../components/VenueRow";
import { CrowdSnapshot } from "../components/CrowdSnapshot";
import { VenueMap } from "../components/VenueMap";
import { TabBar, TabKey } from "../components/TabBar";
import { useFriendRequests } from "../context/FriendRequestsContext";
import { useTheme } from "../theme/ThemeContext";
import { useLanguage } from "../i18n/LanguageContext";
import { useAuth } from "../context/AuthContext";

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
// The map takes this share of the screen (VenueMap's wrapper height), and the
// sheet's rounded top overlaps it by SHEET_OVERLAP.
const MAP_FRACTION = 0.58;
const SHEET_OVERLAP = 20;
// Raised, the sheet stops this far below the safe area, just under "Crowdy".
const BRAND_CLEARANCE = 40;

type Props = NativeStackScreenProps<RootStackParamList, "Home">;

function isWithinRegion(venue: Venue, region: MapRegion): boolean {
  const latMin = region.latitude - region.latitudeDelta / 2;
  const latMax = region.latitude + region.latitudeDelta / 2;
  const lngMin = region.longitude - region.longitudeDelta / 2;
  const lngMax = region.longitude + region.longitudeDelta / 2;
  return venue.lat >= latMin && venue.lat <= latMax && venue.lng >= lngMin && venue.lng <= lngMax;
}

/**
 * Home screen: the map of malls and stations with their crowd levels, the
 * layer toggles and heatmap, and the list sheet with the areas, saved and
 * search tabs.
 * @param navigation - opens a venue's details, settings and the meetup planner
 */
export default function HomeScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const { incoming: friendRequests } = useFriendRequests();
  const { colors } = useTheme();
  const { t } = useLanguage();
  const auth = useAuth();
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
  // Malls on by default, so the app opens on pins and a list of nearby
  // malls rather than a bare map. Lives here (not in VenueMap) so the list
  // below can filter to match what's on the map.
  const [layers, setLayers] = useState<LayerState>({
    transit: false,
    venue: true,
  });
  // A 401 here means the server rejected the token itself (expired, or
  // invalidated some other way) rather than a normal network hiccup - logs
  // the User out cleanly (drops back to on-device storage) instead of
  // silently failing to sync forever, which is what happened before this
  // check existed.
  const handleAuthError = useCallback(
    (err: unknown) => {
      if (err instanceof ApiError && err.status === 401) {
        auth.logout();
      }
    },
    [auth]
  );

  // Logged out: on-device only (see savedVenues.ts). Logged in: the
  // account's real favourites (see AuthContext - logging in already
  // merges whatever was saved locally into the account before this reads
  // the server, so nothing from before login gets lost). Re-runs whenever
  // auth state changes, not just once on mount, so logging in immediately
  // swaps the source instead of showing stale local ids.
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  // Reload when Home is shown again so a save on Detail updates this list.
  useFocusEffect(
    useCallback(() => {
      if (auth.token) {
        getFavourites(auth.token)
          .then((ids) => setSavedIds(new Set(ids)))
          .catch((err) => {
            console.error("Failed to load favourites from account:", err);
            handleAuthError(err);
          });
      } else {
        loadSavedVenueIds().then(setSavedIds);
      }
    }, [auth.token, handleAuthError])
  );

  // Depends on auth.token, so this reference does change on login/logout -
  // rare enough (not a per-render/per-poll thing) that it doesn't work
  // against VenueRow's memoization the way a reference changing every
  // render would. Updates local state immediately either way (optimistic,
  // no rollback on failure - matches the on-device version's own
  // fire-and-forget persistence), then syncs to whichever store is
  // current: the account if logged in, on-device storage otherwise.
  const handleToggleSaved = useCallback(
    (venueId: string) => {
      setSavedIds((current) => {
        const next = new Set(current);
        const nowSaved = !next.has(venueId);
        if (nowSaved) next.add(venueId);
        else next.delete(venueId);

        if (auth.token) {
          const sync = nowSaved ? saveFavourite(auth.token, venueId) : unsaveFavourite(auth.token, venueId);
          sync.catch((err) => {
            console.error("Failed to sync favourite to account:", err);
            handleAuthError(err);
          });
        } else {
          persistSavedVenueIds(next);
        }
        return next;
      });
    },
    [auth.token, handleAuthError]
  );

  const listRef = useRef<FlatList<Venue>>(null);
  // The map area the list is held to while a venue is selected (see
  // toggleSelection), and the latest map area to take it from.
  const frozenRegionRef = useRef<MapRegion | null>(null);
  const regionRef = useRef(region);
  regionRef.current = region;
  // A venue picked on the map that the list should scroll to once.
  const scrollToRef = useRef<string | null>(null);

  // The list sheet rests where it always has - just over the bottom of the
  // map - and can be dragged up to just below the "Crowdy" title and back
  // (see SnapSheet). It's laid out at its raised size and moved down while
  // resting, so the list never re-lays-out mid-drag; the list gets extra
  // bottom padding while resting so its last rows can still scroll into view.
  const [screenHeight, setScreenHeight] = useState(Dimensions.get("window").height);
  const raisedTop = insets.top + BRAND_CLEARANCE;
  const restingTop = screenHeight * MAP_FRACTION - SHEET_OVERLAP;
  const sheet = useSnapSheet(Math.max(0, restingTop - raisedTop));
  const handleScreenLayout = useCallback((e: LayoutChangeEvent) => {
    setScreenHeight(e.nativeEvent.layout.height);
  }, []);

  // When the keyboard opens on the search tab, the sheet is raised so the
  // search box clears the keyboard, and the list is sized to the room left
  // above it (with at least SEARCH_LIST_MIN_HEIGHT). FlatList needs that
  // explicit height to size its viewport. When the keyboard closes, the
  // sheet goes back to wherever it was before. "keyboardWillShow"/"Hide"
  // are iOS-only, so Android uses the "Did" variants.
  const listLayoutRef = useRef({ y: 0 });
  const raisedBeforeKeyboard = useRef(false);
  const [searchListHeight, setSearchListHeight] = useState<number | null>(null);
  const handleSearchListLayout = useCallback((e: LayoutChangeEvent) => {
    listLayoutRef.current = { y: e.nativeEvent.layout.y };
  }, []);
  const { raised, snap } = sheet;

  useEffect(() => {
    const showEvent = Platform.OS === "ios" ? "keyboardWillShow" : "keyboardDidShow";
    const hideEvent = Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide";

    const showSub = Keyboard.addListener(showEvent, (e) => {
      const keyboardTop = Dimensions.get("window").height - e.endCoordinates.height;
      setSearchListHeight(Math.max(SEARCH_LIST_MIN_HEIGHT, keyboardTop - raisedTop - listLayoutRef.current.y));
      snap(true);
    });
    const hideSub = Keyboard.addListener(hideEvent, () => {
      setSearchListHeight(null);
      snap(raisedBeforeKeyboard.current);
    });
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, [raisedTop, snap]);

  // Remembers where the sheet was before the keyboard raised it.
  useEffect(() => {
    if (searchListHeight === null) raisedBeforeKeyboard.current = raised;
  }, [raised, searchListHeight]);

  // Tapping the already-selected pin/row again deselects it, matching
  // ordinary toggle-select behaviour. Wrapped in useCallback (with no
  // dependencies - the functional setState form doesn't need any) so this
  // is the same function reference across every render, letting it be
  // handed to every row as a stable prop instead of a fresh per-row closure
  // - required for VenueRow's memoization to actually skip unchanged rows.
  //
  // While a venue is selected the Areas list stays filtered to the map area
  // from the moment of selecting (frozenRegionRef), so the map moving to the
  // venue doesn't add and remove rows around it. Deselecting lets the list
  // catch up with the map again.
  const toggleSelection = useCallback((venueId: string) => {
    if (!frozenRegionRef.current) frozenRegionRef.current = regionRef.current;
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setSelectedVenueId((current) => (current === venueId ? null : venueId));
  }, []);

  // A pin tapped on the map may be far down the list, so the list scrolls to
  // it once. A tapped row is already on screen, so the list stays put.
  const selectFromMap = useCallback(
    (venueId: string) => {
      scrollToRef.current = venueId;
      toggleSelection(venueId);
    },
    [toggleSelection]
  );

  const clearSelection = useCallback(() => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setSelectedVenueId(null);
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
    if (key === "meetup") return navigation.navigate("Meetup");
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
  const listRegion = selectedVenueId && frozenRegionRef.current ? frozenRegionRef.current : region;
  const visibleVenues = useMemo(() => {
    if (Platform.OS === "web" || !listRegion) return venues;
    return venues
      .filter((venue) => isWithinRegion(venue, listRegion))
      .map((venue) => ({
        ...venue,
        distanceKm: userLocation ? haversineKm(userLocation.lat, userLocation.lng, venue.lat, venue.lng) : undefined,
      }))
      .sort((a, b) => (a.distanceKm ?? 0) - (b.distanceKm ?? 0));
  }, [venues, listRegion, userLocation]);

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

  // Name, address, and postal code, against venues already loaded.
  const searchResults = useMemo(() => {
    const query = searchQuery.trim();
    if (!query) return [];
    return venues
      .map((venue) => ({ venue, rank: venueSearchRank(venue, query) }))
      .filter((hit): hit is { venue: Venue; rank: number } => hit.rank !== null)
      .sort((a, b) => a.rank - b.rank || a.venue.name.localeCompare(b.venue.name))
      .map(({ venue }) => ({
        ...venue,
        distanceKm: userLocation ? haversineKm(userLocation.lat, userLocation.lng, venue.lat, venue.lng) : undefined,
      }));
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
    // The list is held still while a venue is selected, so there is
    // nothing to animate.
    if (selectedVenueId) return setRegion(nextRegion);
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

  // Scrolls once to a venue picked on the map (see selectFromMap). Runs on
  // the selection only, not on every list change, so the list doesn't keep
  // pulling back to it.
  useEffect(() => {
    if (!selectedVenueId) {
      frozenRegionRef.current = null;
      return;
    }
    if (scrollToRef.current !== selectedVenueId) return;
    scrollToRef.current = null;
    const index = listData.findIndex((v) => v.id === selectedVenueId);
    if (index === -1) return; // filtered out of the current view - nothing to scroll to
    listRef.current?.scrollToIndex({ index, animated: true, viewPosition: 0 });
  }, [selectedVenueId]);


  if (loading || !region) {
    return (
      <View style={[styles.centered, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]} onLayout={handleScreenLayout}>
      <VenueMap
        initialRegion={region}
        venues={venues}
        railLines={railLines}
        layers={layers}
        onToggleLayer={handleToggleLayer}
        selectedVenueId={selectedVenueId}
        onSelectVenue={selectFromMap}
        onDeselect={clearSelection}
        onRegionChange={handleRegionChange}
      />

      <Text style={[styles.brand, { top: insets.top + 8 }]}>Crowdy</Text>

      <Animated.View
        style={[
          styles.sheet,
          { top: raisedTop, backgroundColor: colors.background, transform: [{ translateY: sheet.offset }] },
        ]}
      >
        <SheetHandle sheet={sheet} />
        <TabBar active={activeTab} onPress={handleTabPress} badges={{ settings: friendRequests.length }} />

        {activeTab === "search" && (
          <View style={[styles.searchRow, { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}>
            <TextInput
              style={[styles.searchInput, { color: colors.text }]}
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder={t("search.placeholder")}
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
          // While resting, the bottom of the sheet sits below the screen.
          contentContainerStyle={{ paddingTop: 8, paddingBottom: raised ? 0 : Math.max(0, restingTop - raisedTop) }}
          data={listData}
          keyExtractor={(item) => item.id}
          extraData={[selectedVenueId, savedIds]}
          // Rows have variable height (the selected one expands), so
          // FlatList can't always measure a far-off-screen target on the
          // first attempt - land approximately, then real positions settle
          // in as more rows render.
          onScrollToIndexFailed={(info) => {
            listRef.current?.scrollToOffset({ offset: info.averageItemLength * info.index, animated: true });
          }}
          ListHeaderComponent={
            activeTab === "areas" ? (
              <CrowdSnapshot
                venues={venues}
                userLocation={userLocation}
                colors={colors}
                onOpenVenue={handleSeeDetails}
              />
            ) : undefined
          }
          ListEmptyComponent={
            <Text style={[styles.empty, { color: colors.textMuted }]}>
              {activeTab === "saved"
                ? t("saved.empty")
                : activeTab === "search"
                  ? searchQuery.trim()
                    ? t("search.noMatch", { query: searchQuery.trim() })
                    : t("search.typeToSearch")
                  : noLayersOn
                    ? t("layers.none")
                    : t("map.empty")}
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
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    overflow: "hidden",
  },
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
