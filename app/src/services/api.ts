import { Platform } from "react-native";
import Constants from "expo-constants";
import { Venue } from "../types/venue";
import { RailLineSegment } from "../types/railLine";
import { FriendsOverview, MeetupPlan, MeetupPriority } from "../types/social";
import { Route, TravelMode } from "../types/directions";

// Every screen talks to the app through this file only - screens never
// change when the data source does. On a physical device/simulator, "localhost"
// means the phone itself, not this laptop, so we read the LAN IP Metro is
// already using to reach the phone and reuse it for the backend's port too.
//
// EXPO_PUBLIC_API_BASE_URL overrides all of that. Set it in app/.env (or the
// build environment) and the whole app points at a hosted backend instead of
// whichever laptop is running `npm run dev` - one value to change when the
// server moves off local development, with no feature code touched. Left
// unset, the LAN behaviour below is unchanged, so local dev needs no config
// at all.
function resolveApiBaseUrl(): string {
  const configured = process.env.EXPO_PUBLIC_API_BASE_URL?.trim();
  if (configured) return configured.replace(/\/$/, "");

  if (Platform.OS === "web") return "http://localhost:4000";
  const host = Constants.expoConfig?.hostUri?.split(":")[0];
  return host ? `http://${host}:4000` : "http://localhost:4000";
}

const API_BASE_URL = resolveApiBaseUrl();

// Carries the HTTP status code, not just a message - lets a caller tell a
// 401 (session expired/invalid - requireAuth on the server rejected the
// token) apart from any other failure, so AuthContext can log out
// cleanly instead of the app just silently failing to sync forever.
export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`);
  if (!res.ok) {
    throw new ApiError(res.status, `Crowdy server request failed (${res.status}): ${path}`);
  }
  return res.json();
}

// Surfaces the server's own { error: "..." } message when there is one
// (e.g. "Invalid username or password") instead of a generic status-code
// string, since auth/favourites callers show this text directly to the
// User. `token`, when given, is sent the same way requireAuth on the
// server expects it.
async function postJson<T>(path: string, body: unknown, token?: string, method: "POST" | "PUT" = "POST"): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const payload = await res.json().catch(() => null);
    throw new ApiError(res.status, payload?.error ?? `Crowdy server request failed (${res.status}): ${path}`);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

async function authedGetJson<T>(path: string, token: string): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) {
    throw new ApiError(res.status, `Crowdy server request failed (${res.status}): ${path}`);
  }
  return res.json();
}

async function authedDelete(path: string, token: string): Promise<void> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    throw new ApiError(res.status, `Crowdy server request failed (${res.status}): ${path}`);
  }
}

/**
 * Fetches every venue with its crowd level, sorted nearest first.
 * @param userLat - the user's latitude
 * @param userLng - the user's longitude
 * @returns the venue list
 */
export async function getNearbyVenues(userLat: number, userLng: number): Promise<Venue[]> {
  return getJson<Venue[]>(`/venues?lat=${userLat}&lng=${userLng}`);
}

/**
 * Fetches one venue's full detail.
 * @param id - the venue's id
 * @returns the venue, or undefined if it isn't found
 */
export async function getVenueById(id: string): Promise<Venue | undefined> {
  try {
    return await getJson<Venue>(`/venues/${id}`);
  } catch {
    return undefined;
  }
}

/**
 * Fetches quieter venues of the same type nearby.
 * @param venue - the venue being viewed
 * @returns up to three alternatives
 */
export async function getAlternatives(venue: Venue): Promise<Venue[]> {
  return getJson<Venue[]>(`/venues/${venue.id}/alternatives`);
}

// Static rail alignment geometry - doesn't change per request, fetched once
// alongside venues rather than re-fetched on every map interaction.
/**
 * Fetches the MRT/LRT line shapes drawn on the map.
 * @returns the rail line segments
 */
export async function getRailLines(): Promise<RailLineSegment[]> {
  return getJson<RailLineSegment[]>("/lines");
}

export interface PopularTimesRefresh {
  crowdPercent: number;
  crowdLevel: Venue["crowdLevel"];
  hourly: { hour: number; percent: number }[];
  hours: { day: number; open: string; close: string }[];
  // When this reading was actually scraped - not necessarily now, since the
  // server falls back to its last known reading when a fresh scrape fails.
  lastUpdated: string;
}

// Forces a fresh Google Popular Times scrape for one venue - slow (~15-20s,
// drives a real headless browser server-side, no cache short-circuit), so
// only call this for the one venue whose Detail screen is currently open,
// never in bulk. Returns null on any failure (including the normal "no
// Popular Times for this venue" case) since the caller only needs to know
// whether a fresh reading is available.
/**
 * Asks the server for a venue's latest Popular Times reading.
 * @param venueId - the venue's id
 * @returns the reading and when it was scraped, or null if none is available
 */
export async function refreshPopularTimesForVenue(venueId: string): Promise<PopularTimesRefresh | null> {
  try {
    return await getJson<PopularTimesRefresh>(`/venues/${venueId}/popular-times`);
  } catch {
    return null;
  }
}

// One mode at a time, fetched as the User switches tabs on the Directions
// screen - each mode is its own OneMap lookup server-side, so requesting
// all four upfront would pay for three journeys nobody asked to see.
/**
 * Fetches a route from the user's location to a venue.
 * @param from - the user's location
 * @param venueId - the destination venue's id
 * @param mode - transit, walk, drive or cycle
 * @returns the route with its steps
 */
export function getDirections(
  from: { lat: number; lng: number },
  venueId: string,
  mode: TravelMode
): Promise<Route> {
  return getJson<Route>(
    `/directions?fromLat=${from.lat}&fromLng=${from.lng}&toId=${encodeURIComponent(venueId)}&mode=${mode}`
  );
}

export interface AuthSession {
  token: string;
  accountId: number;
}

/**
 * Creates an account.
 * @param username - 3-24 letters, numbers or underscores
 * @param password - at least 8 characters
 * @returns the new session (token and account id)
 */
export function signup(username: string, password: string): Promise<AuthSession> {
  return postJson<AuthSession>("/auth/signup", { username, password });
}

/**
 * Signs in to an existing account.
 * @param username - the account's username
 * @param password - the account's password
 * @returns the session (token and account id)
 */
export function login(username: string, password: string): Promise<AuthSession> {
  return postJson<AuthSession>("/auth/login", { username, password });
}

/**
 * Fetches the signed-in user's saved venue ids.
 * @param token - the session token
 * @returns the saved venue ids
 */
export function getFavourites(token: string): Promise<string[]> {
  return authedGetJson<string[]>("/favourites", token);
}

/**
 * Saves a venue to the signed-in user's account.
 * @param token - the session token
 * @param venueId - the venue to save
 */
export function saveFavourite(token: string, venueId: string): Promise<void> {
  return postJson("/favourites", { venueId }, token);
}

/**
 * Removes a venue from the signed-in user's account.
 * @param token - the session token
 * @param venueId - the venue to remove
 */
export function unsaveFavourite(token: string, venueId: string): Promise<void> {
  return authedDelete(`/favourites/${venueId}`, token);
}

// Called once right after login with whatever was saved locally as a
// guest, so those saves carry over into the account instead of being
// left behind on just this one device.
/**
 * Adds guest saves from this device to the signed-in user's account.
 * @param token - the session token
 * @param venueIds - the venue ids saved on this device
 */
export function mergeFavourites(token: string, venueIds: string[]): Promise<void> {
  return postJson("/favourites/merge", { venueIds }, token);
}

export interface HeatmapBounds {
  south: number;
  west: number;
  north: number;
  east: number;
}

// The exact geographic box the server rendered heatmap image.png against -
// has to match precisely for the overlay image to land on the right spot,
// so this is fetched from the server rather than hardcoding a second copy
// of the same numbers on this side.
/**
 * Fetches the map area the heatmap image covers.
 * @returns the image's south, west, north and east edges
 */
export function getHeatmapBounds(): Promise<HeatmapBounds> {
  return getJson<HeatmapBounds>("/heatmap/bounds");
}

// A plain URL, not a fetch - the app hands this straight to an <Overlay>'s
// image prop, which loads it like any other image. The timestamp busts
// React Native's own image cache so re-enabling the toggle after crowd data
// has moved on actually shows a fresh image instead of a stale cached one.
/**
 * Returns the URL of the current heatmap image.
 * @returns the image URL, with a timestamp so a fresh image is loaded
 */
export function getHeatmapImageUrl(): string {
  return `${API_BASE_URL}/heatmap/image.png?t=${Date.now()}`;
}

/**
 * Fetches every venue (malls and stations), unsorted.
 * @returns the full venue list
 */
export function getAllVenues(): Promise<Venue[]> {
  return getJson<Venue[]>("/venues");
}

/**
 * Fetches the signed-in user's home station, friends and pending requests.
 * @param token - the session token
 * @returns friends (with their home stations) and requests in both directions
 */
export function getFriends(token: string): Promise<FriendsOverview> {
  return authedGetJson<FriendsOverview>("/friends", token);
}

/**
 * Sends a friend request by username. If they had already asked, it is accepted.
 * @param token - the session token
 * @param username - the other person's username
 * @returns "pending" for a new request, or "accepted" if it completed a pair
 */
export function sendFriendRequest(token: string, username: string): Promise<{ status: "pending" | "accepted" }> {
  return postJson("/friends/requests", { username }, token);
}

/**
 * Accepts a friend request another account sent.
 * @param token - the session token
 * @param accountId - the account that sent the request
 */
export function acceptFriendRequest(token: string, accountId: number): Promise<void> {
  return postJson(`/friends/requests/${accountId}/accept`, {}, token);
}

/**
 * Removes a friend, declines their request, or cancels a sent request.
 * @param token - the session token
 * @param accountId - the other account
 */
export function removeFriend(token: string, accountId: number): Promise<void> {
  return authedDelete(`/friends/${accountId}`, token);
}

/**
 * Sets (or with null, clears) the station the signed-in user usually starts from.
 * @param token - the session token
 * @param stationId - a station id, or null to clear it
 */
export function setHomeStation(token: string, stationId: string | null): Promise<void> {
  return postJson("/friends/home-station", { stationId }, token, "PUT");
}

/**
 * Asks the server where a group should meet.
 * @param stationIds - each person's starting station id (2-6)
 * @param priority - "fair" (shortest longest trip), "fast" (shortest average) or "quiet" (least crowded)
 * @param at - when the group will meet, within the next week; omitted means now
 * @returns up to three suggestions with everyone's travel times
 */
export function getMeetupSuggestions(stationIds: string[], priority: MeetupPriority, at?: Date): Promise<MeetupPlan> {
  return postJson("/meetup", { stationIds, priority, ...(at ? { at: at.toISOString() } : {}) });
}
