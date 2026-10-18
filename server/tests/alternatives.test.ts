import assert from "node:assert/strict";
import { test } from "node:test";
import { findAlternatives } from "../src/services/alternatives";
import type { Venue } from "../src/types/venue";

function venue(overrides: Partial<Venue> & Pick<Venue, "id" | "lat" | "lng" | "crowdPercent" | "crowdLevel">): Venue {
  return {
    name: overrides.id,
    category: "Venue",
    address: "1 Example Road SINGAPORE 238801",
    source: "GooglePopularTimes",
    lastUpdated: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

const origin = venue({ id: "origin", lat: 1.3, lng: 103.8, crowdPercent: 80, crowdLevel: "High" });

test("alternatives are the same category, less crowded, and within 3km", () => {
  const near = venue({ id: "near", lat: 1.31, lng: 103.8, crowdPercent: 20, crowdLevel: "Low" });
  const far = venue({ id: "far", lat: 1.35, lng: 103.8, crowdPercent: 10, crowdLevel: "Low" });
  const busier = venue({ id: "busier", lat: 1.301, lng: 103.8, crowdPercent: 90, crowdLevel: "Very High" });
  const closed = venue({ id: "closed", lat: 1.301, lng: 103.8, crowdPercent: 0, crowdLevel: "Closed" });
  const unavailable = venue({
    id: "unavailable",
    lat: 1.301,
    lng: 103.8,
    crowdPercent: 0,
    crowdLevel: "Unavailable",
  });
  const station = venue({
    id: "station",
    lat: 1.301,
    lng: 103.8,
    crowdPercent: 20,
    crowdLevel: "Low",
    category: "Transit",
    source: "LTA",
  });

  const result = findAlternatives(origin, [origin, near, far, busier, closed, unavailable, station]);
  assert.deepEqual(
    result.map((item) => item.id),
    ["near"]
  );
  assert.ok((result[0].distanceKm ?? 99) <= 3);
});

test("alternatives keep the three closest", () => {
  const candidates = [0.005, 0.012, 0.02, 0.025].map((delta, index) =>
    venue({
      id: `n${index}`,
      lat: origin.lat + delta,
      lng: origin.lng,
      crowdPercent: 10,
      crowdLevel: "Low",
    })
  );
  const result = findAlternatives(origin, [origin, ...candidates]);
  assert.deepEqual(
    result.map((item) => item.id),
    ["n0", "n1", "n2"]
  );
});
