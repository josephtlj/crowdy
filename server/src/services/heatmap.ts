import { haversineKm } from "./distance";
import { MALLS, MallEntry } from "../data/malls";

// How wide a venue's colour reach is on the heatmap - not a fixed number
// for every venue, since a fixed radius either leaves huge grey gaps
// between isolated venues (radius too small) or floods dense clusters like
// Orchard Road into one indistinct blob (radius too large). Instead, each
// venue's radius is based on the average distance to its 3 nearest other
// venues: a mall in a dense cluster gets a small radius (its neighbours
// already cover the space between them), an isolated one gets a larger
// radius so it casts a wider halo instead of a tiny dot surrounded by
// grey. Clamped so one truly isolated venue doesn't imply coverage
// kilometres away, and two venues right next to each other don't get an
// almost-zero radius.
const NEIGHBOURS_TO_AVERAGE = 3;
const MIN_RADIUS_M = 300;
const MAX_RADIUS_M = 2500;

function computeHeatmapRadiiM(malls: MallEntry[]): Map<string, number> {
  const radii = new Map<string, number>();
  for (const mall of malls) {
    const nearestDistancesM = malls
      .filter((other) => other.id !== mall.id)
      .map((other) => haversineKm(mall.lat, mall.lng, other.lat, other.lng) * 1000)
      .sort((a, b) => a - b)
      .slice(0, NEIGHBOURS_TO_AVERAGE);

    const avgM = nearestDistancesM.reduce((sum, d) => sum + d, 0) / nearestDistancesM.length;
    const clampedM = Math.min(MAX_RADIUS_M, Math.max(MIN_RADIUS_M, avgM));
    radii.set(mall.id, Math.round(clampedM));
  }
  return radii;
}

// Computed once at module load - mall positions are static (only change
// when malls.ts is regenerated), so there's no reason to redo this
// O(n^2) distance calculation on every request.
export const HEATMAP_RADII_M = computeHeatmapRadiiM(MALLS);

// Fixed geographic extent the heatmap overlay image (heatmapImage.ts) is
// rendered against, and the exact box the app places that image over via
// react-native-maps' Overlay `bounds` prop - the two have to agree exactly
// or the image lands offset from the real venues. Covers mainland
// Singapore with a little sea margin on every side (actual venue spread is
// roughly 1.26-1.45 lat, 103.68-103.99 lng - padded out further so the
// image still reads sensibly if the map is panned toward the coast),
// rather than being derived from the venue list itself, so areas with no
// venue nearby (Tengah Reservoir, etc.) are still inside the image and show
// the neutral "no signal" wash instead of being cropped out.
export const HEATMAP_BOUNDS = { south: 1.15, west: 103.59, north: 1.48, east: 104.1 };
