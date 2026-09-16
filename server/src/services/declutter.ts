import { Venue } from "../types/venue";

// Two real, distinct stations (e.g. Punggol MRT and Punggol LRT share the
// same interchange building) can end up only metres apart - close enough
// that a map marker can only be tapped for whichever one renders on top.
// This spreads any venues that land in the same small grid cell into a
// small circle around their shared centre, so each stays independently
// tappable without visibly relocating them on a normally-zoomed map.
const GRID_SIZE_DEG = 0.0004; // ~44m near the equator
const SPREAD_RADIUS_DEG = 0.00035; // ~39m

export function spreadOverlappingVenues(venues: Venue[]): Venue[] {
  const groups = new Map<string, Venue[]>();
  for (const venue of venues) {
    const key = `${Math.round(venue.lat / GRID_SIZE_DEG)}:${Math.round(venue.lng / GRID_SIZE_DEG)}`;
    const group = groups.get(key);
    if (group) group.push(venue);
    else groups.set(key, [venue]);
  }

  const result: Venue[] = [];
  for (const group of groups.values()) {
    if (group.length === 1) {
      result.push(group[0]);
      continue;
    }
    const centerLat = group.reduce((sum, v) => sum + v.lat, 0) / group.length;
    const centerLng = group.reduce((sum, v) => sum + v.lng, 0) / group.length;
    const lngCompression = Math.cos((centerLat * Math.PI) / 180);
    group.forEach((venue, i) => {
      const angle = (2 * Math.PI * i) / group.length;
      result.push({
        ...venue,
        lat: centerLat + SPREAD_RADIUS_DEG * Math.sin(angle),
        lng: centerLng + (SPREAD_RADIUS_DEG * Math.cos(angle)) / lngCompression,
      });
    });
  }
  return result;
}
