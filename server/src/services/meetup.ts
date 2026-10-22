import { CrowdLevel, Venue } from "../types/venue";
import { STATIONS } from "../data/stations";
import { getVenues } from "../data/venues";
import { getRoute } from "./directions";
import { haversineKm } from "./distance";

// How many malls get a real travel-time check. Each one costs one OneMap
// route per person, so this keeps a group of six to 30 lookups.
const SHORTLIST_SIZE = 5;
const RESULT_COUNT = 3;
const MAX_CONCURRENT_ROUTES = 8;

// A travel time doesn't change much within a day, and the same group often
// re-plans, so each station-to-mall time is reused for a few hours.
const TRAVEL_CACHE_MS = 6 * 60 * 60 * 1000;

// Minutes added to a mall's score for its current crowd level, so a quieter
// mall beats a busier one a few minutes closer.
const CROWD_PENALTY_MIN: Record<CrowdLevel, number> = {
  Low: 0,
  Moderate: 4,
  High: 10,
  "Very High": 18,
  Unavailable: 8,
  Closed: 25,
};

export interface Participant {
  stationId: string;
  lat: number;
  lng: number;
}

export interface TravelTime {
  stationId: string;
  minutes: number;
  // true when OneMap couldn't route it and the time is a distance-based guess.
  estimated: boolean;
}

export interface MeetupSuggestion {
  venueId: string;
  name: string;
  crowdLevel: CrowdLevel;
  crowdPercent: number;
  travel: TravelTime[];
  maxMinutes: number;
  avgMinutes: number;
}

/**
 * Picks the malls worth a real travel-time check: those whose farthest
 * participant is closest in a straight line. Open malls are preferred; if
 * every mall is closed (late at night) all of them are considered.
 * @param malls - candidate venues (malls only)
 * @param participants - each person's starting station
 * @param size - how many malls to keep
 * @returns the shortlisted malls, best first
 */
export function shortlistMalls(malls: Venue[], participants: Participant[], size = SHORTLIST_SIZE): Venue[] {
  const usable = malls.filter((m) => m.crowdLevel !== "Unavailable");
  const open = usable.filter((m) => m.crowdLevel !== "Closed");
  const pool = open.length > 0 ? open : usable;
  const farthest = (m: Venue) => Math.max(...participants.map((p) => haversineKm(p.lat, p.lng, m.lat, m.lng)));
  return [...pool].sort((a, b) => farthest(a) - farthest(b)).slice(0, size);
}

/**
 * Ranks meetup options: fairest first (shortest longest-trip), then shortest
 * average trip, with a penalty for busier malls.
 * @param options - each mall with every participant's travel time
 * @returns the options with summary times, best first
 */
export function rankMeetupOptions(options: { venue: Venue; travel: TravelTime[] }[]): MeetupSuggestion[] {
  return options
    .map(({ venue, travel }) => {
      const minutes = travel.map((t) => t.minutes);
      const maxMinutes = Math.max(...minutes);
      const avgMinutes = minutes.reduce((sum, m) => sum + m, 0) / minutes.length;
      return {
        suggestion: {
          venueId: venue.id,
          name: venue.name,
          crowdLevel: venue.crowdLevel,
          crowdPercent: venue.crowdPercent,
          travel,
          maxMinutes: Math.round(maxMinutes),
          avgMinutes: Math.round(avgMinutes),
        },
        score: maxMinutes + 0.25 * avgMinutes + CROWD_PENALTY_MIN[venue.crowdLevel],
      };
    })
    .sort((a, b) => a.score - b.score)
    .map((o) => o.suggestion);
}

// Rough public-transport time when OneMap can't route a trip: the straight
// line stretched to road distance at an average 22 km/h, plus 8 minutes of
// walking and waiting.
function estimateMinutes(from: Participant, to: Venue): number {
  return Math.round((haversineKm(from.lat, from.lng, to.lat, to.lng) * 1.3 * 60) / 22 + 8);
}

const travelCache = new Map<string, { minutes: number; at: number }>();

async function transitTime(from: Participant, to: Venue, venues: Venue[]): Promise<TravelTime> {
  const key = `${from.stationId}->${to.id}`;
  const cached = travelCache.get(key);
  if (cached && Date.now() - cached.at < TRAVEL_CACHE_MS) {
    return { stationId: from.stationId, minutes: cached.minutes, estimated: false };
  }
  try {
    const route = await getRoute({ lat: from.lat, lng: from.lng }, { lat: to.lat, lng: to.lng }, "transit", venues);
    if (route) {
      const minutes = Math.max(1, Math.round(route.durationSeconds / 60));
      travelCache.set(key, { minutes, at: Date.now() });
      return { stationId: from.stationId, minutes, estimated: false };
    }
  } catch (err) {
    console.error(`Meetup: OneMap route failed (${key}), using an estimate:`, err instanceof Error ? err.message : err);
  }
  return { stationId: from.stationId, minutes: estimateMinutes(from, to), estimated: true };
}

// Runs the given tasks with at most `limit` in flight, keeping their order.
async function runLimited<T>(tasks: (() => Promise<T>)[], limit: number): Promise<T[]> {
  const results: T[] = new Array(tasks.length);
  let next = 0;
  async function worker() {
    while (next < tasks.length) {
      const i = next++;
      results[i] = await tasks[i]();
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, tasks.length) }, worker));
  return results;
}

/**
 * Suggests where a group should meet: malls that are fair for everyone to
 * reach by public transport and not too crowded right now.
 * @param stationIds - each person's starting MRT/LRT station id (2-6, repeats allowed)
 * @returns up to three suggestions, and whether every mall is currently closed
 */
export async function planMeetup(stationIds: string[]): Promise<{ suggestions: MeetupSuggestion[]; allClosed: boolean }> {
  const participants: Participant[] = stationIds.map((id) => {
    const station = STATIONS.find((s) => s.id === id)!;
    return { stationId: id, lat: station.lat, lng: station.lng };
  });

  const venues = await getVenues();
  const malls = venues.filter((v) => v.category === "Venue");
  const allClosed = !malls.some((m) => m.crowdLevel !== "Closed" && m.crowdLevel !== "Unavailable");
  const shortlist = shortlistMalls(malls, participants);

  const tasks = shortlist.flatMap((mall) => participants.map((p) => () => transitTime(p, mall, venues)));
  const times = await runLimited(tasks, MAX_CONCURRENT_ROUTES);
  const options = shortlist.map((venue, i) => ({
    venue,
    travel: times.slice(i * participants.length, (i + 1) * participants.length),
  }));

  return { suggestions: rankMeetupOptions(options).slice(0, RESULT_COUNT), allClosed };
}
