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
    shortlistMalls(malls, people, "fair", 2).map((m) => m.id),
    ["middle", "near-a"]
  );

  const allClosed = malls.map((m) => ({ ...m, crowdLevel: "Closed" as const }));
  assert.equal(shortlistMalls(allClosed, people, "fair", 1)[0].id, "middle");
});

test("each priority ranks the same options differently", () => {
  const options = [
    { venue: mall("even", 0, 0, "Moderate"), travel: times(30, 30, 30) },
    { venue: mall("quick-but-uneven", 0, 0, "Moderate"), travel: times(5, 10, 45) },
    { venue: mall("quiet-but-far", 0, 0, "Low"), travel: times(40, 40, 40) },
  ];
  assert.equal(rankMeetupOptions(options, "fair")[0].venueId, "even");
  assert.equal(rankMeetupOptions(options, "fast")[0].venueId, "quick-but-uneven");

  const busy = [
    { venue: mall("near-busy", 0, 0, "Very High"), travel: times(15, 15) },
    { venue: mall("further-quiet", 0, 0, "Low"), travel: times(30, 30) },
  ];
  assert.equal(rankMeetupOptions(busy, "fair")[0].venueId, "near-busy");
  assert.equal(rankMeetupOptions(busy, "quiet")[0].venueId, "further-quiet");
});

test("malls without crowd data are still suggested when nothing else is available", () => {
  const people: Participant[] = [
    { stationId: "a", lat: 1.3, lng: 103.8 },
    { stationId: "b", lat: 1.3, lng: 103.9 },
  ];
  const unknown = [mall("x", 1.3, 103.85, "Unavailable"), mall("y", 1.4, 103.85, "Unavailable")];
  assert.deepEqual(
    shortlistMalls(unknown, people).map((m) => m.id),
    ["x", "y"]
  );
  assert.deepEqual(shortlistMalls([], people), []);
  assert.deepEqual(rankMeetupOptions([]), []);
});

test("everyone starting from the same station still gets a ranking", () => {
  const ranked = rankMeetupOptions([{ venue: mall("only", 0, 0), travel: times(12, 12, 12) }]);
  assert.equal(ranked[0].maxMinutes, 12);
  assert.equal(ranked[0].avgMinutes, 12);
});

test("least crowded ignores quiet malls far out of reach for anyone", () => {
  const ranked = rankMeetupOptions(
    [
      { venue: mall("moderate-near", 0, 0, "Moderate"), travel: times(6, 54, 34) },
      { venue: mall("quiet-far", 0, 0, "Low"), travel: times(7, 76, 44) },
      { venue: mall("quiet-ok", 0, 0, "Low"), travel: times(20, 60, 40) },
    ],
    "quiet"
  );
  assert.deepEqual(
    ranked.map((r) => r.venueId),
    ["quiet-ok", "moderate-near"]
  );
});
