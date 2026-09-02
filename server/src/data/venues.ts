import { Venue } from "../types/venue";
import { STATIONS } from "./stations";
import { MALLS } from "./malls";
import { fetchStationCrowdLevels, mapCrowdCode } from "../services/lta";
import { fetchLtaCarparkRecords } from "../services/carparks";
import { spreadOverlappingVenues } from "../services/declutter";
import { getCachedPopularTimes } from "../services/popularTimes";

// A bit looser than the scheduler's own daily cadence, as slack for a pass
// running long or a tick getting delayed - a venue only shows "Unavailable"
// if even that generous a window has lapsed with no successful batch
// refresh. Wide because the underlying pattern barely moves day to day and
// "right now" is always recomputed fresh from it regardless of how old the
// scrape itself is (see getCachedPopularTimes).
const POPULAR_TIMES_MAX_AGE_MS = 30 * 60 * 60 * 1000;

// Popular Times is the sole source for every mall in MALLS - no carpark
// fallback. There used to be one (a carpark-lots estimate for any venue
// without a fresh Popular Times reading), but it silently produced
// duplicate pins: an LTA carpark record whose nearest-neighbour match went
// to a different, nearby mall was left "unclaimed" and spawned its own
// separate legacy venue alongside the real one (this is exactly how Marina
// Square ended up listed twice). Any mall genuinely missing a fresh scrape
// now shows "Unavailable" instead - honest about there being no reading,
// rather than quietly reusing carpark-lots as a stand-in. Live LTA lot
// counts, where a mall has them, are attached only as a bonus stat (Detail
// screen), never used to derive crowdPercent/crowdLevel.
async function getMallVenues(): Promise<Venue[]> {
  const now = new Date().toISOString();

  let lotsByDevelopment = new Map<string, number>();
  try {
    const records = await fetchLtaCarparkRecords();
    lotsByDevelopment = new Map(records.map((r) => [r.Development, r.AvailableLots]));
  } catch (err) {
    console.error("LTA carpark fetch failed for mall bonus stats, continuing without them:", err);
  }

  return MALLS.map((mall) => {
    const popularTimes = getCachedPopularTimes(mall.id, POPULAR_TIMES_MAX_AGE_MS);
    const carparks = mall.carparkDevelopments?.map((dev) => ({
      label: dev,
      availableLots: lotsByDevelopment.get(dev) ?? 0,
    }));

    const venue: Venue = {
      id: mall.id,
      name: mall.name,
      category: "Venue",
      address: mall.address,
      lat: mall.lat,
      lng: mall.lng,
      crowdPercent: popularTimes?.crowdPercent ?? 0,
      crowdLevel: popularTimes?.crowdLevel ?? "Unavailable",
      source: "GooglePopularTimes",
      lastUpdated: now,
      carparks,
      hourly: popularTimes?.hourly,
    };
    return venue;
  });
}

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

// The live LTA lot-count lookup (for bonus stats) updates every 1 minute
// per LTA's docs; cache 1 minute to stay close to that freshness without
// calling on every single incoming request.
const MALL_CACHE_TTL_MS = 60 * 1000;
let cachedMallVenues: Venue[] = [];
let mallCacheTimestamp = 0;

async function getCachedMallVenues(): Promise<Venue[]> {
  const isFresh = Date.now() - mallCacheTimestamp < MALL_CACHE_TTL_MS && cachedMallVenues.length > 0;
  if (isFresh) return cachedMallVenues;

  try {
    cachedMallVenues = await getMallVenues();
    mallCacheTimestamp = Date.now();
  } catch (err) {
    console.error("Mall venue fetch failed, serving stale/empty data:", err);
  }

  return cachedMallVenues;
}

export async function getVenues(): Promise<Venue[]> {
  const [transportVenues, mallVenues] = await Promise.all([
    getTransportVenues(),
    getCachedMallVenues(),
  ]);
  return spreadOverlappingVenues([...transportVenues, ...mallVenues]);
}
