import { VenueCategory } from "../types/venue";

// Colours the map pin/list badge by venue TYPE (what kind of place it is) -
// separate from CrowdBadge, which colours by crowd LEVEL (how busy it is).
// Labels mimic Singabus's 2-letter stop-code badges. As more categories are
// added (carpark, general areas, ...) give each one its own colour+label
// here rather than reusing an existing one, so type stays visually legible.
export const PIN_COLORS: Record<VenueCategory, string> = {
  MRT: "#2F6FED",
  LRT: "#F2994A",
  Mall: "#EB5757",
  Attraction: "#9B51E0",
};

export const PIN_LABELS: Record<VenueCategory, string> = {
  MRT: "MR",
  LRT: "LR",
  Mall: "ML",
  Attraction: "AT",
};
