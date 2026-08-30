import { Venue } from "./venue";

export interface LayerState {
  transit: boolean;
  malls: boolean;
  attractions: boolean;
}

// Shared by the map (which pins/lines to draw) and the list (which rows to
// show) so the two never drift out of sync with each other.
export function isVenueInLayers(venue: Venue, layers: LayerState): boolean {
  if (venue.category === "MRT" || venue.category === "LRT") return layers.transit;
  if (venue.category === "Mall") return layers.malls;
  return layers.attractions; // only "Attraction" is left
}
