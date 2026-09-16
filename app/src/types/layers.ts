import { Venue } from "./venue";

export interface LayerState {
  transit: boolean;
  venue: boolean;
}

// Shared by the map (which pins/lines to draw) and the list (which rows to
// show) so the two never drift out of sync with each other.
export function isVenueInLayers(venue: Venue, layers: LayerState): boolean {
  return venue.category === "Transit" ? layers.transit : layers.venue;
}
