export type CrowdLevel = "Low" | "Moderate" | "High" | "Very High" | "Closed" | "Unavailable";

export type VenueCategory = "Transit" | "Venue";

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
  // Raw LTA carpark lot counts, shown as a bonus stat - not used to derive
  // crowdPercent/crowdLevel once Popular Times is the primary source. Most
  // venues have one entry; VivoCity has two (P2/P3 are separate LTA carpark
  // zones merged into a single venue/pin).
  carparks?: { label: string; availableLots: number }[];
  // Today's full Popular Times pattern, where available - lets the app
  // render the histogram straight from the venue itself, no separate
  // on-demand fetch needed.
  hourly?: { hour: number; percent: number }[];
  // Opening hours per day of week (0=Sun..6=Sat), straight from Google's
  // own formatting - a day with no entry means closed that day.
  hours?: { day: number; open: string; close: string }[];
}
