import { CrowdLevel, Venue } from "../types/venue";
import { STATIONS } from "./stations";
import { MALLS } from "./malls";
import { STATION_HOURS } from "./stationHours";
import { fetchStationCrowdLevels, mapCrowdCode } from "../services/lta";
import { fetchLtaCarparkRecords } from "../services/carparks";
import { spreadOverlappingVenues } from "../services/declutter";
import { getLatestPopularTimes } from "../services/popularTimes";
import { HEATMAP_RADII_M, STATION_HEATMAP_RADII_M } from "../services/heatmap";

// Last 6-digit group, so a street number earlier in the address is ignored.
/**
 * Extracts the six-digit postal code from a venue address.
 * @param address - the venue's full address
 * @returns the postal code, or undefined if the address has none
 */
export function postalCodeFromAddress(address: string): string | undefined {
  const matches = address.match(/\b\d{6}\b/g);
  return matches?.[matches.length - 1];
}

// Popular Times is the sole source for every mall in MALLS - no carpark
// fallback. There used to be one (a carpark-lots estimate for any venue
// without a fresh Popular Times reading), but it silently produced
// duplicate pins: an LTA carpark record whose nearest-neighbour match went
// to a different, nearby mall was left "unclaimed" and spawned its own
// separate legacy venue alongside the real one (this is exactly how Marina
// Square ended up listed twice). Live LTA lot counts, where a mall has them,
// are attached only as a bonus stat (Detail screen), never used to derive
// crowdPercent/crowdLevel.
//
// Every mall uses its most recent Popular Times pattern, however old - it's
// a typical-week pattern, so it stays a sound estimate long after the scrape
// that produced it, and scraping can fail for long stretches (e.g. Google
// serving a limited view of Maps without the chart). `lastUpdated` is the scrape time
// rather than now, so the app can show how old the pattern is. Only a mall
// that has never been scraped successfully shows "Unavailable".
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
    const popularTimes = getLatestPopularTimes(mall.id);
    const carparks = mall.carparkDevelopments?.map((dev) => ({
      label: dev,
      availableLots: lotsByDevelopment.get(dev) ?? 0,
    }));

    const venue: Venue = {
      id: mall.id,
      name: mall.name,
      category: "Venue",
      address: mall.address,
      postalCode: postalCodeFromAddress(mall.address),
      lat: mall.lat,
      lng: mall.lng,
      crowdPercent: popularTimes?.crowdPercent ?? 0,
      crowdLevel: popularTimes?.crowdLevel ?? "Unavailable",
      source: "GooglePopularTimes",
      lastUpdated: popularTimes ? new Date(popularTimes.scrapedAt).toISOString() : now,
      carparks,
      hourly: popularTimes?.hourly,
      hours: popularTimes?.hours,
      heatmapRadiusM: HEATMAP_RADII_M.get(mall.id),
    };
    return venue;
  });
}

// LTA updates every 10 minutes; caching for 5 avoids hammering their API on
// every single incoming request while still staying well within freshness.
const CACHE_TTL_MS = 5 * 60 * 1000;
let cachedTransportVenues: Venue[] = [];
let cacheTimestamp = 0;

// The real-time crowd feed this function calls reports a plain
// Low/Moderate/High with no notion of "closed" at all - confirmed
// directly, it just keeps returning a categorical reading even overnight -
// so whether a station is actually running has to come from somewhere
// else. STATION_HOURS (scripts/build-station-hours.ts) has real per-station
// first/last train times for most of the network; isStationOperatingNow
// parses those the same way a mall's `hours` field is read, with one extra
// wrinkle: a station's close time is essentially always just after
// midnight (e.g. "12:37 am"), so a same-day open/close check would treat
// it as closed almost the entire time it's actually running. This checks
// both today's opening (service started, hasn't hit midnight yet) and
// yesterday's closing (still inside last night's post-midnight tail).
//
// A station missing from STATION_HOURS (the script's own README-equivalent
// comment notes ~14 Bukit Panjang LRT loop stations aren't covered by its
// source) gets no override at all - the live LTA reading is trusted as-is
// rather than falling back to a guessed window.
function parseHourString(s: string): number | null {
  const m = s.match(/(\d+)(?::(\d+))?\s*(am|pm)/i);
  if (!m) return null;
  let hour = parseInt(m[1], 10) % 12;
  if (m[3].toLowerCase() === "pm") hour += 12;
  const minute = m[2] ? parseInt(m[2], 10) : 0;
  return hour * 60 + minute;
}

function isStationOperatingNow(stationId: string, now: Date): boolean | null {
  const hours = STATION_HOURS[stationId];
  if (!hours) return null;

  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const today = hours.find((h) => h.day === now.getDay());
  const yesterday = hours.find((h) => h.day === (now.getDay() + 6) % 7);

  if (today) {
    const openMinutes = parseHourString(today.open);
    if (openMinutes !== null && nowMinutes >= openMinutes) return true;
  }
  if (yesterday) {
    const closeMinutes = parseHourString(yesterday.close);
    // Only treat this as an overnight tail if the close time is itself in
    // the small hours - a same-day close (e.g. a station that somehow shut
    // by 11pm) shouldn't be read as "still open until 11pm tomorrow".
    if (closeMinutes !== null && closeMinutes < 4 * 60 && nowMinutes < closeMinutes) return true;
  }
  return false;
}

// Each station's most recent real LTA reading. LTA's feed fails per line
// (one line's request can error while the rest succeed) and sometimes
// entirely, so a station without a reading this round falls back to its
// last one - with that reading's own time - instead of disappearing. Unlike
// a mall's typical-week pattern, a live reading stops meaning anything once
// it's old, so past an hour it's dropped and the station shows "Unavailable".
const lastLiveReading = new Map<string, { crowdLevel: CrowdLevel; crowdPercent: number; at: string }>();
const LIVE_READING_MAX_AGE_MS = 60 * 60 * 1000;

async function getTransportVenues(): Promise<Venue[]> {
  const isFresh = Date.now() - cacheTimestamp < CACHE_TTL_MS && cachedTransportVenues.length > 0;
  if (isFresh) return cachedTransportVenues;

  let crowdByStationCode: Awaited<ReturnType<typeof fetchStationCrowdLevels>> = new Map();
  try {
    crowdByStationCode = await fetchStationCrowdLevels();
  } catch (err) {
    console.error("LTA fetch failed, using each station's last known reading:", err);
  }

  const now = new Date();
  const nowIso = now.toISOString();

  // Every station is always listed - its location and train hours are
  // fixed, so it belongs on the map whether or not LTA answered. Only the
  // crowd reading depends on the feed: live if there is one, else the last
  // known one if it's under an hour old, else "Unavailable".
  cachedTransportVenues = STATIONS.map((station) => {
    const record = crowdByStationCode.get(station.code);
    const mapped = record ? mapCrowdCode(record.CrowdLevel) : null;
    if (mapped) lastLiveReading.set(station.id, { ...mapped, at: nowIso });
    const stored = lastLiveReading.get(station.id);
    const reading = stored && now.getTime() - Date.parse(stored.at) <= LIVE_READING_MAX_AGE_MS ? stored : undefined;

    // null (no hours data for this station) means "don't override" -
    // trust whatever LTA's live feed reported.
    const operating = isStationOperatingNow(station.id, now);
    const venue: Venue = {
      id: station.id,
      name: station.name,
      category: "Transit",
      address: station.address,
      postalCode: postalCodeFromAddress(station.address),
      lat: station.lat,
      lng: station.lng,
      crowdPercent: operating === false ? 0 : reading?.crowdPercent ?? 0,
      crowdLevel: operating === false ? "Closed" : reading?.crowdLevel ?? "Unavailable",
      source: "LTA",
      lastUpdated: reading?.at ?? nowIso,
      hours: STATION_HOURS[station.id],
      heatmapRadiusM: STATION_HEATMAP_RADII_M.get(station.id),
    };
    return venue;
  });
  cacheTimestamp = Date.now();

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

/**
 * Returns every tracked venue - malls and MRT/LRT stations - with its current crowd level.
 * Station readings come from LTA DataMall and mall readings from cached Google Popular
 * Times patterns; if a source is unavailable, each venue keeps its last known data.
 * @returns all venues, with overlapping map pins spread apart
 */
export async function getVenues(): Promise<Venue[]> {
  const [transportVenues, mallVenues] = await Promise.all([
    getTransportVenues(),
    getCachedMallVenues(),
  ]);
  return spreadOverlappingVenues([...transportVenues, ...mallVenues]);
}
