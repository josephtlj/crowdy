// LTA's Station Crowd Density API returns only a station code and crowd
// level - no name or coordinates. This is the lookup table that turns a
// code into something displayable. Interchange stations (e.g. Dhoby Ghaut)
// have a different code per line; we picked one representative code per
// physical station rather than trying to merge multiple platforms' readings.
export interface StationInfo {
  code: string;
  id: string;
  name: string;
  lat: number;
  lng: number;
  address: string;
}

export const STATIONS: StationInfo[] = [
  { code: "NS25", id: "city-hall-mrt", name: "City Hall MRT", lat: 1.2931, lng: 103.852, address: "City Hall MRT Station" },
  { code: "NS26", id: "raffles-place-mrt", name: "Raffles Place MRT", lat: 1.284, lng: 103.8515, address: "Raffles Place MRT Station" },
  { code: "NS24", id: "dhoby-ghaut-mrt", name: "Dhoby Ghaut MRT", lat: 1.2996, lng: 103.8455, address: "Dhoby Ghaut MRT Station" },
  { code: "NS1", id: "jurong-east-mrt", name: "Jurong East MRT", lat: 1.3329, lng: 103.7422, address: "Jurong East MRT Station" },
  { code: "CC29", id: "harbourfront-mrt", name: "HarbourFront MRT", lat: 1.2653, lng: 103.82, address: "HarbourFront MRT Station" },
  { code: "EW12", id: "bugis-mrt", name: "Bugis MRT", lat: 1.3006, lng: 103.8559, address: "Bugis MRT Station" },
  { code: "NS22", id: "orchard-mrt", name: "Orchard MRT", lat: 1.3041, lng: 103.8318, address: "Orchard MRT Station" },
  { code: "DT19", id: "chinatown-mrt", name: "Chinatown MRT", lat: 1.2846, lng: 103.844, address: "Chinatown MRT Station" },
  { code: "EW23", id: "clementi-mrt", name: "Clementi MRT", lat: 1.3151, lng: 103.7649, address: "Clementi MRT Station" },
  { code: "CG2", id: "changi-airport-mrt", name: "Changi Airport MRT", lat: 1.3644, lng: 103.9915, address: "Changi Airport MRT Station" },
];
