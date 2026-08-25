import { VenueCategory } from "../types/venue";

// Colours the map PIN by venue type (what kind of place it is) - separate
// from CrowdBadge, which colours by crowd LEVEL (how busy it is). As more
// categories are added (carpark, general areas, ...) give each one an entry
// here rather than reusing an existing colour, so pin type stays legible.
export const PIN_COLORS: Record<VenueCategory, string> = {
  MRT: "blue",
  LRT: "orange",
  Mall: "red",
  Attraction: "purple",
  Hawker: "green",
  Gym: "cyan",
  Park: "green",
  Worship: "yellow",
};
