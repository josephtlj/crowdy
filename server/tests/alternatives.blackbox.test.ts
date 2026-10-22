import assert from "node:assert/strict";
import { test } from "node:test";
import { findAlternatives } from "../src/services/alternatives";
import type { Venue } from "../src/types/venue";

// Black-box tests for AlternativesFinder.findAlternatives (ViewAlternatives
// (#3-2)), designed with equivalence classes and boundary values. The case
// ids (BB-xx) match the Lab 4 test case table; each test logs its actual
// output.

const KM_PER_DEGREE = (6371 * Math.PI) / 180;

// The viewed mall: Moderate, 60%.
const viewed: Venue = {
  id: "viewed",
  name: "Viewed Mall",
  category: "Venue",
  address: "",
  lat: 1.3,
  lng: 103.8,
  crowdPercent: 60,
  crowdLevel: "Moderate",
  source: "GooglePopularTimes",
  lastUpdated: "",
};

// A candidate due north of the viewed mall. By default it is a valid
// alternative: same category, open with a reading, 30% (lower), 1 km away.
function candidate(id: string, overrides: Partial<Venue> & { km?: number } = {}): Venue {
  const { km = 1, ...rest } = overrides;
  return {
    ...viewed,
    id,
    name: id,
    lat: viewed.lat + km / KM_PER_DEGREE,
    crowdPercent: 30,
    crowdLevel: "Low",
    ...rest,
  };
}

const cases: { id: string; input: string; venues: Venue[]; expected: string[] }[] = [
  // Equivalence classes
  { id: "BB-01", input: "same category, Low 30%, 1 km", venues: [candidate("c")], expected: ["c"] },
  {
    id: "BB-02",
    input: "different category (station)",
    venues: [candidate("c", { category: "Transit", source: "LTA" })],
    expected: [],
  },
  { id: "BB-03", input: "candidate closed", venues: [candidate("c", { crowdLevel: "Closed", crowdPercent: 0 })], expected: [] },
  {
    id: "BB-04",
    input: "candidate has no reading",
    venues: [candidate("c", { crowdLevel: "Unavailable", crowdPercent: 0 })],
    expected: [],
  },
  { id: "BB-05", input: "no other venues", venues: [], expected: [] },
  // Boundary values: crowd percentage around the viewed mall's 60%
  { id: "BB-06", input: "candidate 59%", venues: [candidate("c", { crowdPercent: 59, crowdLevel: "Moderate" })], expected: ["c"] },
  { id: "BB-07", input: "candidate 60%", venues: [candidate("c", { crowdPercent: 60, crowdLevel: "High" })], expected: [] },
  { id: "BB-08", input: "candidate 61%", venues: [candidate("c", { crowdPercent: 61, crowdLevel: "High" })], expected: [] },
  // Boundary values: distance around 3 km
  { id: "BB-09", input: "candidate 2.999 km", venues: [candidate("c", { km: 2.999 })], expected: ["c"] },
  { id: "BB-10", input: "candidate 3.000 km", venues: [candidate("c", { km: 3 })], expected: ["c"] },
  { id: "BB-11", input: "candidate 3.001 km", venues: [candidate("c", { km: 3.001 })], expected: [] },
  // Boundary values: number of results around the limit of 3
  {
    id: "BB-12",
    input: "3 valid candidates at 2, 0.5, 1 km",
    venues: [candidate("c2", { km: 2 }), candidate("c0.5", { km: 0.5 }), candidate("c1", { km: 1 })],
    expected: ["c0.5", "c1", "c2"],
  },
  {
    id: "BB-13",
    input: "4 valid candidates at 2, 0.5, 1, 1.5 km",
    venues: [
      candidate("c2", { km: 2 }),
      candidate("c0.5", { km: 0.5 }),
      candidate("c1", { km: 1 }),
      candidate("c1.5", { km: 1.5 }),
    ],
    expected: ["c0.5", "c1", "c1.5"],
  },
];

for (const c of cases) {
  test(`${c.id}: ${c.input}`, (t) => {
    const actual = findAlternatives(viewed, [viewed, ...c.venues]).map((v) => v.id);
    t.diagnostic(`actual: ${JSON.stringify(actual)}`);
    assert.deepEqual(actual, c.expected);
  });
}
