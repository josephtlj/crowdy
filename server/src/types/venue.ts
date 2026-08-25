export type CrowdLevel = "Low" | "Moderate" | "High" | "Very High";

export type VenueCategory =
  | "Mall"
  | "Attraction"
  | "Hawker"
  | "Gym"
  | "Park"
  | "Worship"
  | "MRT"
  | "LRT";

export interface Venue {
  id: string;
  name: string;
  category: VenueCategory;
  address: string;
  lat: number;
  lng: number;
  crowdPercent: number;
  crowdLevel: CrowdLevel;
  source: "GooglePopularTimes" | "LTA" | "Mock";
  lastUpdated: string;
  distanceKm?: number;
}
