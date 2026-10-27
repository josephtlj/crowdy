import { Router } from "express";
import { getVenues } from "../data/venues";
import { getRoute } from "../services/directions";
import { TravelMode } from "../types/directions";

/**
 * Directions endpoint: GET /directions returns a route from a starting point to
 * a venue by public transport, walking, driving or cycling.
 */
export const directionsRouter = Router();

const TRAVEL_MODES: TravelMode[] = ["transit", "walk", "drive", "cycle"];

// GET /directions?fromLat=1.30&fromLng=103.85&toId=ion-orchard&mode=transit
// -> one route, for the one mode asked for. The app requests a mode at a
// time as the User switches tabs rather than all four upfront, since each is
// a separate OneMap call and most journeys are only ever looked at one way.
directionsRouter.get("/", async (req, res) => {
  const fromLat = Number(req.query.fromLat);
  const fromLng = Number(req.query.fromLng);
  if (Number.isNaN(fromLat) || Number.isNaN(fromLng)) {
    return res.status(400).json({ error: "fromLat and fromLng are required" });
  }

  const mode = String(req.query.mode ?? "transit") as TravelMode;
  if (!TRAVEL_MODES.includes(mode)) {
    return res.status(400).json({ error: `mode must be one of: ${TRAVEL_MODES.join(", ")}` });
  }

  const venues = await getVenues();
  const destination = venues.find((venue) => venue.id === req.query.toId);
  if (!destination) {
    return res.status(404).json({ error: "Venue not found" });
  }

  try {
    const route = await getRoute(
      { lat: fromLat, lng: fromLng },
      { lat: destination.lat, lng: destination.lng },
      mode,
      venues
    );
    if (!route) {
      return res.status(404).json({ error: "No route found for this journey" });
    }
    res.json(route);
  } catch (err) {
    // OneMap being unreachable, rate-limiting, or rejecting our credentials
    // is an upstream failure, not a bad request from the app - 502 keeps
    // those distinguishable in the client, which shows a retry rather than
    // treating the journey itself as impossible.
    console.error(`Directions lookup failed (${mode} -> ${destination.id}):`, err);
    res.status(502).json({ error: "Directions are unavailable right now" });
  }
});
