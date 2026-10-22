import { Router } from "express";
import { STATIONS } from "../data/stations";
import { planMeetup } from "../services/meetup";

export const meetupRouter = Router();

const STATION_IDS = new Set(STATIONS.map((s) => s.id));
const MIN_PEOPLE = 2;
const MAX_PEOPLE = 6;

// POST /meetup { stationIds } -> where a group should meet. One station id
// per person (the same station can appear twice). Public: it only needs
// stations, so it works for guests as well as signed-in friends.
meetupRouter.post("/", async (req, res) => {
  const { stationIds } = req.body ?? {};
  if (
    !Array.isArray(stationIds) ||
    stationIds.length < MIN_PEOPLE ||
    stationIds.length > MAX_PEOPLE ||
    !stationIds.every((id) => typeof id === "string" && STATION_IDS.has(id))
  ) {
    return res.status(400).json({ error: `Choose a starting station for each of ${MIN_PEOPLE}-${MAX_PEOPLE} people` });
  }

  try {
    res.json(await planMeetup(stationIds));
  } catch (err) {
    console.error("Meetup planning failed:", err);
    res.status(502).json({ error: "Meetup suggestions are unavailable right now" });
  }
});
