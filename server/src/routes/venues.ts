import { Router } from "express";
import { venues } from "../data/venues";
import { haversineKm } from "../services/distance";
import { findAlternatives } from "../services/alternatives";

export const venuesRouter = Router();

// GET /venues?lat=1.30&lng=103.85 -> all venues, sorted nearest first
venuesRouter.get("/", (req, res) => {
  const lat = Number(req.query.lat);
  const lng = Number(req.query.lng);
  const hasLocation = !Number.isNaN(lat) && !Number.isNaN(lng);

  const result = venues
    .map((venue) => ({
      ...venue,
      distanceKm: hasLocation ? haversineKm(lat, lng, venue.lat, venue.lng) : undefined,
    }))
    .sort((a, b) => (a.distanceKm ?? 0) - (b.distanceKm ?? 0));

  res.json(result);
});

// GET /venues/:id -> single venue detail
venuesRouter.get("/:id", (req, res) => {
  const venue = venues.find((v) => v.id === req.params.id);
  if (!venue) {
    return res.status(404).json({ error: "Venue not found" });
  }
  res.json(venue);
});

// GET /venues/:id/alternatives -> lower-crowd venues of the same category nearby
venuesRouter.get("/:id/alternatives", (req, res) => {
  const venue = venues.find((v) => v.id === req.params.id);
  if (!venue) {
    return res.status(404).json({ error: "Venue not found" });
  }
  res.json(findAlternatives(venue, venues));
});
