import assert from "node:assert/strict";
import { test } from "node:test";
import { rankMeetupOptions, shortlistMalls, type Participant, type TravelTime } from "../src/services/meetup";
import type { Venue } from "../src/types/venue";

const mall = (id: string, lat: number, lng: number, crowdLevel: Venue["crowdLevel"] = "Low"): Venue => ({
  id,
  name: id,
  category: "Venue",
  address: "",
  lat,
  lng,
  crowdPercent: 20,
  crowdLevel,
  source: "GooglePopularTimes",
  lastUpdated: "",
});

const times = (...minutes: number[]): TravelTime[] =>
  minutes.map((m, i) => ({ stationId: `s${i}`, minutes: m, estimated: false }));

test("the fairest option wins over a shorter average with one long trip", () => {
  const ranked = rankMeetupOptions([
    { venue: mall("lopsided", 0, 0), travel: times(5, 45) },
    { venue: mall("fair", 0, 0), travel: times(25, 25) },
  ]);
  assert.deepEqual(
    ranked.map((r) => r.venueId),
    ["fair", "lopsided"]
  );
  assert.equal(ranked[0].maxMinutes, 25);
  assert.equal(ranked[0].avgMinutes, 25);
});

test("a busier mall loses to a quieter one a few minutes further", () => {
  const ranked = rankMeetupOptions([
    { venue: mall("busy", 0, 0, "Very High"), travel: times(20, 20) },
    { venue: mall("quiet", 0, 0, "Low"), travel: times(26, 26) },
  ]);
  assert.equal(ranked[0].venueId, "quiet");
});

test("the shortlist keeps malls closest to everyone and prefers open ones", () => {
  const people: Participant[] = [
    { stationId: "a", lat: 1.3, lng: 103.8 },
    { stationId: "b", lat: 1.3, lng: 103.9 },
  ];
  const malls = [
    mall("middle", 1.3, 103.85),
    mall("near-a", 1.3, 103.8),
    mall("far", 1.45, 103.7),
    mall("middle-closed", 1.3, 103.851, "Closed"),
  ];
  assert.deepEqual(
    shortlistMalls(malls, people, 2).map((m) => m.id),
    ["middle", "near-a"]
  );

  const allClosed = malls.map((m) => ({ ...m, crowdLevel: "Closed" as const }));
  assert.equal(shortlistMalls(allClosed, people, 1)[0].id, "middle");
});
