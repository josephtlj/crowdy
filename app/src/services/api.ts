import { Platform } from "react-native";
import Constants from "expo-constants";
import { Venue } from "../types/venue";
import { RailLineSegment } from "../types/railLine";
import { PopularTimesResult } from "../types/popularTimes";

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

async function getJson<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`);
  if (!res.ok) {
    throw new Error(`Crowdy server request failed (${res.status}): ${path}`);
  }
  return res.json();
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

// Slow (~15-20s) - drives a real headless browser server-side. Only call
// this on an explicit User action for one specific venue, never in bulk.
// Returns null both when the server has nothing (404 - a normal outcome,
// not every venue has Popular Times available at every hour) and on any
// other failure, since the caller only needs to know "did this work."
export async function getPopularTimesForVenue(venueId: string): Promise<PopularTimesResult | null> {
  try {
    return await getJson<PopularTimesResult>(`/venues/${venueId}/popular-times`);
  } catch {
    return null;
  }
}
