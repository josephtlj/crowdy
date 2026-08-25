import { Venue } from "../types/venue";
import { STATIONS } from "./stations";
import { fetchStationCrowdLevels, mapCrowdCode } from "../services/lta";
import { spreadOverlappingVenues } from "../services/declutter";

// Malls/attractions/hawkers/gyms are still mock data - Google Popular Times
// isn't wired in yet. MRT stations below are real, live LTA data.
const mockVenues: Venue[] = [
  {
    id: "vivocity",
    name: "VivoCity",
    category: "Mall",
    address: "1 HarbourFront Walk",
    lat: 1.264,
    lng: 103.8222,
    crowdPercent: 90,
    crowdLevel: "Very High",
    source: "Mock",
    lastUpdated: new Date().toISOString(),
  },
  {
    id: "harbourfront-centre",
    name: "HarbourFront Centre",
    category: "Mall",
    address: "1 Maritime Square",
    lat: 1.2653,
    lng: 103.82,
    crowdPercent: 35,
    crowdLevel: "Moderate",
    source: "Mock",
    lastUpdated: new Date().toISOString(),
  },
  {
    id: "jewel-changi",
    name: "Jewel Changi Airport",
    category: "Attraction",
    address: "78 Airport Blvd",
    lat: 1.3603,
    lng: 103.9895,
    crowdPercent: 70,
    crowdLevel: "High",
    source: "Mock",
    lastUpdated: new Date().toISOString(),
  },
  {
    id: "gardens-by-the-bay",
    name: "Gardens by the Bay",
    category: "Attraction",
    address: "18 Marina Gardens Dr",
    lat: 1.2816,
    lng: 103.8636,
    crowdPercent: 55,
    crowdLevel: "Moderate",
    source: "Mock",
    lastUpdated: new Date().toISOString(),
  },
  {
    id: "ion-orchard",
    name: "ION Orchard",
    category: "Mall",
    address: "2 Orchard Turn",
    lat: 1.3039,
    lng: 103.8318,
    crowdPercent: 80,
    crowdLevel: "Very High",
    source: "Mock",
    lastUpdated: new Date().toISOString(),
  },
  {
    id: "orchard-central",
    name: "Orchard Central",
    category: "Mall",
    address: "181 Orchard Rd",
    lat: 1.301,
    lng: 103.839,
    crowdPercent: 45,
    crowdLevel: "Moderate",
    source: "Mock",
    lastUpdated: new Date().toISOString(),
  },
  {
    id: "maxwell-food-centre",
    name: "Maxwell Food Centre",
    category: "Hawker",
    address: "1 Kadayanallur St",
    lat: 1.2802,
    lng: 103.8447,
    crowdPercent: 60,
    crowdLevel: "High",
    source: "Mock",
    lastUpdated: new Date().toISOString(),
  },
  {
    id: "chinatown-complex",
    name: "Chinatown Complex Market",
    category: "Hawker",
    address: "335 Smith St",
    lat: 1.2822,
    lng: 103.8434,
    crowdPercent: 40,
    crowdLevel: "Moderate",
    source: "Mock",
    lastUpdated: new Date().toISOString(),
  },
  {
    id: "clementi-activesg-gym",
    name: "Clementi ActiveSG Gym",
    category: "Gym",
    address: "3155 Commonwealth Ave W",
    lat: 1.3162,
    lng: 103.7649,
    crowdPercent: 50,
    crowdLevel: "Moderate",
    source: "Mock",
    lastUpdated: new Date().toISOString(),
  },
  {
    id: "sentosa-beach-station",
    name: "Sentosa Beach Station",
    category: "Attraction",
    address: "50 Beach Station Rd",
    lat: 1.2494,
    lng: 103.8303,
    crowdPercent: 65,
    crowdLevel: "High",
    source: "Mock",
    lastUpdated: new Date().toISOString(),
  },
];

// LTA updates every 10 minutes; caching for 5 avoids hammering their API on
// every single incoming request while still staying well within freshness.
const CACHE_TTL_MS = 5 * 60 * 1000;
let cachedTransportVenues: Venue[] = [];
let cacheTimestamp = 0;

async function getTransportVenues(): Promise<Venue[]> {
  const isFresh = Date.now() - cacheTimestamp < CACHE_TTL_MS && cachedTransportVenues.length > 0;
  if (isFresh) return cachedTransportVenues;

  try {
    const crowdByStationCode = await fetchStationCrowdLevels();
    const now = new Date().toISOString();

    cachedTransportVenues = STATIONS.map((station) => {
      const record = crowdByStationCode.get(station.code);
      const mapped = record ? mapCrowdCode(record.CrowdLevel) : null;
      if (!mapped) return null;
      const venue: Venue = {
        id: station.id,
        name: station.name,
        category: station.mode,
        address: station.address,
        lat: station.lat,
        lng: station.lng,
        crowdPercent: mapped.crowdPercent,
        crowdLevel: mapped.crowdLevel,
        source: "LTA",
        lastUpdated: now,
      };
      return venue;
    }).filter((v): v is Venue => v !== null);
    cacheTimestamp = Date.now();
  } catch (err) {
    // Keep serving whatever we last had (even if stale) rather than a
    // total outage - the rest of the app (malls, hawkers) still works.
    console.error("LTA fetch failed, serving stale/empty transport data:", err);
  }

  return cachedTransportVenues;
}

export async function getVenues(): Promise<Venue[]> {
  const transportVenues = await getTransportVenues();
  return spreadOverlappingVenues([...mockVenues, ...transportVenues]);
}
