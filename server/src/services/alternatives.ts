import { Venue } from "../types/venue";
import { haversineKm } from "./distance";

const ALTERNATIVE_RADIUS_KM = 3;
const MAX_ALTERNATIVES = 3;

// "Smart Neighborhood Alternatives": same category, less crowded, nearby.
// Pure function over data already in memory - no external calls, so this
// stays cheap even as the venue list grows.
export function findAlternatives(venue: Venue, allVenues: Venue[]): Venue[] {
  return allVenues
    .filter((candidate) => candidate.id !== venue.id)
    .filter((candidate) => candidate.category === venue.category)
    // A closed venue reads as "0% busy" but isn't a real alternative - you
    // can't actually go there right now.
    .filter((candidate) => candidate.crowdLevel !== "Closed")
    .filter((candidate) => candidate.crowdPercent < venue.crowdPercent)
    .map((candidate) => ({
      ...candidate,
      distanceKm: haversineKm(venue.lat, venue.lng, candidate.lat, candidate.lng),
    }))
    .filter((candidate) => candidate.distanceKm <= ALTERNATIVE_RADIUS_KM)
    .sort((a, b) => a.distanceKm - b.distanceKm)
    .slice(0, MAX_ALTERNATIVES);
}
