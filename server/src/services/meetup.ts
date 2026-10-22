import { CrowdLevel, Venue } from "../types/venue";
import { STATIONS } from "../data/stations";
import { getVenues } from "../data/venues";
import { getRoute } from "./directions";
import { getLatestPopularTimes } from "./popularTimes";
import { haversineKm } from "./distance";

// How many malls get a real travel-time check. Each one costs one OneMap
// route per distinct starting station, so this keeps a group of six to at
// most 30-42 lookups. "Least crowded" checks a few more, since the quietest
// mall is less likely to be among the very nearest.
const SHORTLIST_SIZE: Record<MeetupPriority, number> = { fair: 5, fast: 5, quiet: 7 };
const RESULT_COUNT = 3;
// "Least crowded" only considers malls whose longest trip is within this
// many minutes of the best option's, so a quiet mall doesn't win by sending
// someone across the island.
const QUIET_EXTRA_MINUTES = 20;
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

/**
 * What the group cares about most when choosing where to meet:
 * - fair: the longest anyone has to travel is as short as possible
 * - fast: the group's average trip is as short as possible
 * - quiet: the least crowded mall within reasonable reach
 */
export type MeetupPriority = "fair" | "fast" | "quiet";
export const MEETUP_PRIORITIES: MeetupPriority[] = ["fair", "fast", "quiet"];

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

// Malls to choose from, best data first: open malls with a crowd reading;
// if none (late at night) every mall with a reading, closed ones included;
// if no mall has a reading at all (e.g. a fresh server with no Popular Times
// data yet) every mall, so the group still gets somewhere to meet.
function candidateMalls(malls: Venue[]): Venue[] {
  const known = malls.filter((m) => m.crowdLevel !== "Unavailable");
  const open = known.filter((m) => m.crowdLevel !== "Closed");
  if (open.length > 0) return open;
  if (known.length > 0) return known;
  return malls;
}

/**
 * Picks the malls worth a real travel-time check, by straight-line distance:
 * nearest to the farthest person ("fair"), nearest on average ("fast"), or
 * nearest on average with busier malls pushed back ("quiet").
 * @param malls - candidate venues (malls only)
 * @param participants - each person's starting station
 * @param priority - what the group cares about most
 * @param size - how many malls to keep
 * @returns the shortlisted malls, best first (empty if there are no malls)
 */
export function shortlistMalls(
  malls: Venue[],
  participants: Participant[],
  priority: MeetupPriority = "fair",
  size = SHORTLIST_SIZE[priority]
): Venue[] {
  const km = (m: Venue) => participants.map((p) => haversineKm(p.lat, p.lng, m.lat, m.lng));
  const average = (xs: number[]) => xs.reduce((sum, x) => sum + x, 0) / xs.length;
  const metric = (m: Venue) => {
    if (priority === "fair") return Math.max(...km(m));
    if (priority === "fast") return average(km(m));
    return average(km(m)) + CROWD_PENALTY_MIN[m.crowdLevel] * 0.3;
  };
  return [...candidateMalls(malls)].sort((a, b) => metric(a) - metric(b)).slice(0, size);
}

// Each priority's score, in minutes (lower is better). Every score includes
// the crowd penalty; "quiet" triples it so crowding outweighs a few minutes
// of travel.
function score(maxMinutes: number, avgMinutes: number, crowd: CrowdLevel, priority: MeetupPriority): number {
  const penalty = CROWD_PENALTY_MIN[crowd];
  if (priority === "fast") return avgMinutes + 0.25 * maxMinutes + penalty;
  if (priority === "quiet") return 0.5 * (maxMinutes + avgMinutes) + 3 * penalty;
  return maxMinutes + 0.25 * avgMinutes + penalty;
}

/**
 * Ranks meetup options by the group's priority, with busier malls penalised.
 * @param options - each mall with every participant's travel time
 * @param priority - "fair" (shortest longest trip), "fast" (shortest average)
 *   or "quiet" (crowd level weighted most)
 * @returns the options with summary times, best first
 */
export function rankMeetupOptions(
  options: { venue: Venue; travel: TravelTime[] }[],
  priority: MeetupPriority = "fair"
): MeetupSuggestion[] {
  const longest = (o: { travel: TravelTime[] }) => Math.max(...o.travel.map((t) => t.minutes));
  const bestLongest = Math.min(...options.map(longest));
  const inReach = priority === "quiet" ? options.filter((o) => longest(o) <= bestLongest + QUIET_EXTRA_MINUTES) : options;
  return inReach
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
        score: score(maxMinutes, avgMinutes, venue.crowdLevel, priority),
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

// Fills in a time for one station-to-mall trip: cached, from OneMap, or (if
// OneMap fails or isn't configured) a marked estimate. `failures` collects
// failed trips so the caller logs one line per plan instead of one per trip.
// A trip at a chosen time is cached per hour, since timetables differ (e.g.
// late at night).
async function transitTime(
  from: Participant,
  to: Venue,
  venues: Venue[],
  failures: string[],
  at?: Date
): Promise<TravelTime> {
  const when = at ? `@${Math.floor(at.getTime() / 3_600_000)}` : "";
  const key = `${from.stationId}->${to.id}${when}`;
  const cached = travelCache.get(key);
  if (cached && Date.now() - cached.at < TRAVEL_CACHE_MS) {
    return { stationId: from.stationId, minutes: cached.minutes, estimated: false };
  }
  try {
    const route = await getRoute({ lat: from.lat, lng: from.lng }, { lat: to.lat, lng: to.lng }, "transit", venues, at);
    if (route) {
      const minutes = Math.max(1, Math.round(route.durationSeconds / 60));
      travelCache.set(key, { minutes, at: Date.now() });
      return { stationId: from.stationId, minutes, estimated: false };
    }
  } catch (err) {
    failures.push(`${key} (${err instanceof Error ? err.message : String(err)})`);
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

// Each mall's usual crowd level at a chosen time, from its Popular Times
// week, in place of its level right now. A mall never scraped stays
// "Unavailable".
function mallsAt(malls: Venue[], at: Date): Venue[] {
  return malls.map((mall) => {
    const reading = getLatestPopularTimes(mall.id, at);
    return {
      ...mall,
      crowdLevel: reading?.crowdLevel ?? "Unavailable",
      crowdPercent: reading?.crowdPercent ?? 0,
    };
  });
}

/**
 * Suggests where a group should meet: malls that suit the group's priority
 * by public transport and aren't too crowded, right now or at a chosen time.
 * @param stationIds - each person's starting MRT/LRT station id (2-6, repeats allowed)
 * @param priority - "fair", "fast" or "quiet"
 * @param at - when the group will meet; omitted means now. Crowd levels then
 *   come from each mall's usual level at that hour, and travel times from
 *   that time's timetable.
 * @returns up to three suggestions (none only if there are no malls at all),
 *   and whether every mall is closed at that time
 */
export async function planMeetup(
  stationIds: string[],
  priority: MeetupPriority = "fair",
  at?: Date
): Promise<{ suggestions: MeetupSuggestion[]; allClosed: boolean }> {
  const participants: Participant[] = stationIds.map((id) => {
    const station = STATIONS.find((s) => s.id === id)!;
    return { stationId: id, lat: station.lat, lng: station.lng };
  });

  const venues = await getVenues();
  const mallsNow = venues.filter((v) => v.category === "Venue");
  const malls = at ? mallsAt(mallsNow, at) : mallsNow;
  // Only "closed" if there are readings and all of them say closed - no
  // readings at all means crowd data is missing, not that malls are shut.
  const known = malls.filter((m) => m.crowdLevel !== "Unavailable");
  const allClosed = known.length > 0 && known.every((m) => m.crowdLevel === "Closed");
  const shortlist = shortlistMalls(malls, participants, priority);
  if (shortlist.length === 0) return { suggestions: [], allClosed };

  // People starting from the same station share one lookup per mall.
  const distinct = [...new Map(participants.map((p) => [p.stationId, p])).values()];
  const failures: string[] = [];
  const tasks = shortlist.flatMap((mall) => distinct.map((p) => () => transitTime(p, mall, venues, failures, at)));
  const times = await runLimited(tasks, MAX_CONCURRENT_ROUTES);
  if (failures.length > 0) {
    console.error(`Meetup: ${failures.length} OneMap route(s) failed, using estimates - first: ${failures[0]}`);
  }

  const options = shortlist.map((venue, i) => {
    const byStation = new Map(distinct.map((p, j) => [p.stationId, times[i * distinct.length + j]]));
    return { venue, travel: participants.map((p) => byStation.get(p.stationId)!) };
  });

  return { suggestions: rankMeetupOptions(options, priority).slice(0, RESULT_COUNT), allClosed };
}
