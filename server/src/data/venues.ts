import { Venue } from "../types/venue";
import { STATIONS } from "./stations";
import { fetchStationCrowdLevels, mapCrowdCode } from "../services/lta";
import { fetchLtaCarparkVenues } from "../services/carparks";
import { spreadOverlappingVenues } from "../services/declutter";

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
        category: "Transit",
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

// This feed updates every 1 minute per LTA's docs; cache 1 minute to stay
// close to that freshness without calling on every single incoming request.
const CARPARK_CACHE_TTL_MS = 60 * 1000;
let cachedCarparkVenues: Venue[] = [];
let carparkCacheTimestamp = 0;

async function getCarparkVenues(): Promise<Venue[]> {
  const isFresh = Date.now() - carparkCacheTimestamp < CARPARK_CACHE_TTL_MS && cachedCarparkVenues.length > 0;
  if (isFresh) return cachedCarparkVenues;

  try {
    cachedCarparkVenues = await fetchLtaCarparkVenues();
    carparkCacheTimestamp = Date.now();
  } catch (err) {
    console.error("LTA carpark fetch failed, serving stale/empty carpark data:", err);
  }

  return cachedCarparkVenues;
}

export async function getVenues(): Promise<Venue[]> {
  const [transportVenues, carparkVenues] = await Promise.all([
    getTransportVenues(),
    getCarparkVenues(),
  ]);
  return spreadOverlappingVenues([...transportVenues, ...carparkVenues]);
}
