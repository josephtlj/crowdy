import { Venue } from "../types/venue";
import { mockVenues } from "../data/mockVenues";
import { haversineKm } from "./distance";

// Every screen talks to the app through this file only.
// Right now it reads mockVenues; once the backend aggregator (LTA + Google
// Popular Times) is live, only the bodies below need to change to fetch()
// calls against the server — HomeScreen/DetailScreen stay untouched.

const ALTERNATIVE_RADIUS_KM = 3;
const MAX_ALTERNATIVES = 3;

export async function getNearbyVenues(
  userLat: number,
  userLng: number
): Promise<Venue[]> {
  return mockVenues
    .map((venue) => ({
      ...venue,
      distanceKm: haversineKm(userLat, userLng, venue.lat, venue.lng),
    }))
    .sort((a, b) => (a.distanceKm ?? 0) - (b.distanceKm ?? 0));
}

export async function getVenueById(id: string): Promise<Venue | undefined> {
  return mockVenues.find((venue) => venue.id === id);
}

// "Smart Neighborhood Alternatives": same category, less crowded, nearby.
export async function getAlternatives(venue: Venue): Promise<Venue[]> {
  return mockVenues
    .filter((candidate) => candidate.id !== venue.id)
    .filter((candidate) => candidate.category === venue.category)
    .filter((candidate) => candidate.crowdPercent < venue.crowdPercent)
    .map((candidate) => ({
      ...candidate,
      distanceKm: haversineKm(venue.lat, venue.lng, candidate.lat, candidate.lng),
    }))
    .filter((candidate) => (candidate.distanceKm ?? Infinity) <= ALTERNATIVE_RADIUS_KM)
    .sort((a, b) => (a.distanceKm ?? 0) - (b.distanceKm ?? 0))
    .slice(0, MAX_ALTERNATIVES);
}
