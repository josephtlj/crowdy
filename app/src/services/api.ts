import { Platform } from "react-native";
import Constants from "expo-constants";
import { Venue } from "../types/venue";
import { RailLineSegment } from "../types/railLine";

// Every screen talks to the app through this file only - screens never
// change when the data source does. On a physical device/simulator, "localhost"
// means the phone itself, not this laptop, so we read the LAN IP Metro is
// already using to reach the phone and reuse it for the backend's port too.
function resolveApiBaseUrl(): string {
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
async function postJson<T>(path: string, body: unknown, token?: string): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    method: "POST",
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

export async function getNearbyVenues(userLat: number, userLng: number): Promise<Venue[]> {
  return getJson<Venue[]>(`/venues?lat=${userLat}&lng=${userLng}`);
}

export async function getVenueById(id: string): Promise<Venue | undefined> {
  try {
    return await getJson<Venue>(`/venues/${id}`);
  } catch {
    return undefined;
  }
}

export async function getAlternatives(venue: Venue): Promise<Venue[]> {
  return getJson<Venue[]>(`/venues/${venue.id}/alternatives`);
}

// Static rail alignment geometry - doesn't change per request, fetched once
// alongside venues rather than re-fetched on every map interaction.
export async function getRailLines(): Promise<RailLineSegment[]> {
  return getJson<RailLineSegment[]>("/lines");
}

export interface PopularTimesRefresh {
  crowdPercent: number;
  crowdLevel: Venue["crowdLevel"];
  hourly: { hour: number; percent: number }[];
  hours: { day: number; open: string; close: string }[];
}

// Forces a fresh Google Popular Times scrape for one venue - slow (~15-20s,
// drives a real headless browser server-side, no cache short-circuit), so
// only call this for the one venue whose Detail screen is currently open,
// never in bulk. Returns null on any failure (including the normal "no
// Popular Times for this venue" case) since the caller only needs to know
// whether a fresh reading is available.
export async function refreshPopularTimesForVenue(venueId: string): Promise<PopularTimesRefresh | null> {
  try {
    return await getJson<PopularTimesRefresh>(`/venues/${venueId}/popular-times`);
  } catch {
    return null;
  }
}

export interface AuthSession {
  token: string;
  accountId: number;
}

export function signup(username: string, password: string): Promise<AuthSession> {
  return postJson<AuthSession>("/auth/signup", { username, password });
}

export function login(username: string, password: string): Promise<AuthSession> {
  return postJson<AuthSession>("/auth/login", { username, password });
}

export function getFavourites(token: string): Promise<string[]> {
  return authedGetJson<string[]>("/favourites", token);
}

export function saveFavourite(token: string, venueId: string): Promise<void> {
  return postJson("/favourites", { venueId }, token);
}

export function unsaveFavourite(token: string, venueId: string): Promise<void> {
  return authedDelete(`/favourites/${venueId}`, token);
}

// Called once right after login with whatever was saved locally as a
// guest, so those saves carry over into the account instead of being
// left behind on just this one device.
export function mergeFavourites(token: string, venueIds: string[]): Promise<void> {
  return postJson("/favourites/merge", { venueIds }, token);
}
