import { Router } from "express";
import { STATIONS } from "../data/stations";
import { MEETUP_PRIORITIES, MeetupPriority, planMeetup } from "../services/meetup";
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
  if (
    !Array.isArray(stationIds) ||
    stationIds.length < MIN_PEOPLE ||
    stationIds.length > MAX_PEOPLE ||
    !stationIds.every((id) => typeof id === "string" && STATION_IDS.has(id))
  ) {
    return res.status(400).json({ error: `Choose a starting station for each of ${MIN_PEOPLE}-${MAX_PEOPLE} people` });
  }

  const meetingTime = at === undefined || at === null ? undefined : parseMeetingTime(at);
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
