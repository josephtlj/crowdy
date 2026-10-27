import { Router } from "express";
import { getVenues } from "../data/venues";
import { haversineKm } from "../services/distance";
import { findAlternatives } from "../services/alternatives";
import { refreshPopularTimesNow, refreshPopularTimesOnRequest } from "../services/popularTimes";
import { rateLimit } from "../middleware/rateLimit";

export const venuesRouter = Router();

// GET /venues?lat=1.30&lng=103.85 -> all venues, sorted nearest first
venuesRouter.get("/", async (req, res) => {
  const lat = Number(req.query.lat);
  const lng = Number(req.query.lng);
  const hasLocation = !Number.isNaN(lat) && !Number.isNaN(lng);

  const venues = await getVenues();
  const result = venues
    .map((venue) => ({
      ...venue,
      distanceKm: hasLocation ? haversineKm(lat, lng, venue.lat, venue.lng) : undefined,
    }))
    .sort((a, b) => (a.distanceKm ?? 0) - (b.distanceKm ?? 0));

  res.json(result);
});

// GET /venues/:id -> single venue detail
venuesRouter.get("/:id", async (req, res) => {
  const venues = await getVenues();
  const venue = venues.find((v) => v.id === req.params.id);
  if (!venue) {
    return res.status(404).json({ error: "Venue not found" });
  }
  res.json(venue);
});

// GET /venues/:id/alternatives -> lower-crowd venues of the same category nearby
venuesRouter.get("/:id/alternatives", async (req, res) => {
  const venues = await getVenues();
  const venue = venues.find((v) => v.id === req.params.id);
  if (!venue) {
    return res.status(404).json({ error: "Venue not found" });
  }
  res.json(findAlternatives(venue, venues));
});

// GET /venues/:id/popular-times -> forces a fresh Google Popular Times
// scrape for this one venue, called automatically when its Detail screen
// opens. Always slow (~15-20s, drives a real headless browser, no cache
// short-circuit) - only ever call this for one specific venue at a time,
// never as part of the bulk /venues list.
venuesRouter.get("/:id/popular-times", async (req, res) => {
  const venues = await getVenues();
  const venue = venues.find((v) => v.id === req.params.id);
  if (!venue) {
    return res.status(404).json({ error: "Venue not found" });
  }
  const result = await refreshPopularTimesNow(venue.id, venue.name);
  if (!result) {
    return res.status(404).json({ error: "Popular Times not available for this venue right now" });
  }
  const { scrapedAt, ...reading } = result;
  res.json({ ...reading, lastUpdated: new Date(scrapedAt).toISOString() });
});

// A few manual refreshes a minute per client - each one can be a real page
// load on the scraping account.
const refreshLimit = rateLimit({ windowMs: 60_000, max: 5, message: "Too many refreshes - wait a minute and try again" });

// POST /venues/:id/popular-times/refresh -> the user tapped Refresh on a
// mall's page. Scrapes it now (unless it was refreshed in the last 15
// minutes) on the scraping backend, or pulls the latest shared data on any
// other backend. `status` says which happened.
venuesRouter.post("/:id/popular-times/refresh", refreshLimit, async (req, res) => {
  const venues = await getVenues();
  const venue = venues.find((v) => v.id === req.params.id);
  if (!venue || venue.category !== "Venue") {
    return res.status(404).json({ error: "Venue not found" });
  }
  const { reading, status } = await refreshPopularTimesOnRequest(venue.id, venue.name);
  if (!reading) {
    return res.status(404).json({ error: "Popular Times not available for this venue right now" });
  }
  const { scrapedAt, ...rest } = reading;
  res.json({ ...rest, lastUpdated: new Date(scrapedAt).toISOString(), status });
});
