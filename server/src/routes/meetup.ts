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

// POST /meetup { stationIds, priority? } -> where a group should meet. One
// station id per person (the same station can appear more than once);
// priority is "fair" (default), "fast" or "quiet". Public: it only needs
// stations, so it works for guests as well as signed-in friends.
meetupRouter.post("/", async (req, res) => {
  const { stationIds, priority = "fair" } = req.body ?? {};
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

  try {
    res.json(await planMeetup(stationIds, priority as MeetupPriority));
  } catch (err) {
    console.error("Meetup planning failed:", err);
    res.status(502).json({ error: "Meetup suggestions are unavailable right now" });
  }
});
