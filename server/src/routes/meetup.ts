import { Router } from "express";
import { STATIONS } from "../data/stations";
import { MEETUP_PRIORITIES, MeetupPriority, planGroupRoutes, planMeetup, ROUTE_TIMINGS, RouteTiming } from "../services/meetup";
import { getVenues } from "../data/venues";
import { rateLimit } from "../middleware/rateLimit";

export const meetupRouter = Router();

// Each plan can take dozens of OneMap lookups, so one client gets 10 plans
// a minute.
meetupRouter.use(rateLimit({ windowMs: 60_000, max: 10, message: "Too many meetup searches - wait a minute and try again" }));

const STATION_IDS = new Set(STATIONS.map((s) => s.id));
const MIN_PEOPLE = 2;
const MAX_PEOPLE = 6;
// A chosen meeting time can be up to a week ahead (each mall's Popular
// Times pattern is a typical week), with an hour's grace either side for
// clock differences and for the current hour itself.
const HOUR_MS = 60 * 60 * 1000;
const MAX_AHEAD_MS = 7 * 24 * HOUR_MS + HOUR_MS;

function parseMeetingTime(raw: unknown): Date | null {
  if (typeof raw !== "string") return null;
  const at = new Date(raw);
  const ahead = at.getTime() - Date.now();
  return Number.isNaN(ahead) || ahead < -HOUR_MS || ahead > MAX_AHEAD_MS ? null : at;
}

// undefined for "now", null for a time that isn't allowed.
function optionalMeetingTime(raw: unknown): Date | null | undefined {
  return raw === undefined || raw === null ? undefined : parseMeetingTime(raw);
}

function validStations(stationIds: unknown): stationIds is string[] {
  return (
    Array.isArray(stationIds) &&
    stationIds.length >= MIN_PEOPLE &&
    stationIds.length <= MAX_PEOPLE &&
    stationIds.every((id) => typeof id === "string" && STATION_IDS.has(id))
  );
}

// POST /meetup { stationIds, priority?, at? } -> where a group should meet.
// One station id per person (the same station can appear more than once);
// priority is "fair" (default), "fast" or "quiet"; at is an ISO date-time
// within the next week, or left out for now. Public: it only needs
// stations, so it works for guests as well as signed-in friends.
meetupRouter.post("/", async (req, res) => {
  const { stationIds, priority = "fair", at } = req.body ?? {};
  if (!MEETUP_PRIORITIES.includes(priority)) {
    return res.status(400).json({ error: `priority must be one of: ${MEETUP_PRIORITIES.join(", ")}` });
  }
  if (!validStations(stationIds)) {
    return res.status(400).json({ error: `Choose a starting station for each of ${MIN_PEOPLE}-${MAX_PEOPLE} people` });
  }

  const meetingTime = optionalMeetingTime(at);
  if (meetingTime === null) {
    return res.status(400).json({ error: "Choose a meeting time within the next week" });
  }

  try {
    res.json(await planMeetup(stationIds, priority as MeetupPriority, meetingTime));
  } catch (err) {
    console.error("Meetup planning failed:", err);
    res.status(502).json({ error: "Meetup suggestions are unavailable right now" });
  }
});

// POST /meetup/routes { stationIds, venueId, at?, timing? } -> everyone's
// public transport route to one suggested mall, in the same order as
// stationIds. timing is "leave" (default: every trip starts at the meeting
// time) or "arrive" (each trip starts early enough to get there by it).
meetupRouter.post("/routes", async (req, res) => {
  const { stationIds, venueId, at, timing = "leave" } = req.body ?? {};
  if (!validStations(stationIds)) {
    return res.status(400).json({ error: `Choose a starting station for each of ${MIN_PEOPLE}-${MAX_PEOPLE} people` });
  }
  if (!ROUTE_TIMINGS.includes(timing)) {
    return res.status(400).json({ error: `timing must be one of: ${ROUTE_TIMINGS.join(", ")}` });
  }
  const meetingTime = optionalMeetingTime(at);
  if (meetingTime === null) {
    return res.status(400).json({ error: "Choose a meeting time within the next week" });
  }

  try {
    const mall = (await getVenues()).find((v) => v.id === venueId && v.category === "Venue");
    if (!mall) return res.status(404).json({ error: "Venue not found" });
    res.json({ routes: await planGroupRoutes(stationIds, mall, meetingTime, timing as RouteTiming) });
  } catch (err) {
    console.error("Group routes failed:", err);
    res.status(502).json({ error: "Routes are unavailable right now" });
  }
});
