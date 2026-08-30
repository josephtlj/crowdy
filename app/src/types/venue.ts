export type CrowdLevel = "Low" | "Moderate" | "High" | "Very High";

export type VenueCategory = "Mall" | "Attraction" | "MRT" | "LRT";

export interface Venue {
  id: string;
  name: string;
  category: VenueCategory;
  address: string;
  lat: number;
  lng: number;
  crowdPercent: number; // 0-100, drives crowdLevel
  crowdLevel: CrowdLevel;
  source: "GooglePopularTimes" | "LTA" | "Mock";
  lastUpdated: string; // ISO timestamp
  distanceKm?: number; // populated relative to the user's location
}
