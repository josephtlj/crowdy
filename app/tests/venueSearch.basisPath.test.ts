import assert from "node:assert/strict";
import { test } from "node:test";
import { tokenHits } from "../src/services/venueSearch";

// White-box basis path tests for tokenHits. Its control flow graph has
// cyclomatic complexity 6, so six independent paths (WB2-P1 to P6, as in
// the Lab 4 test case table) cover every edge. Each test logs its actual
// output.

const paths: { id: string; path: string; query: string; words: string[]; expected: ReturnType<typeof tokenHits> }[] = [
  { id: "WB2-P1", path: "1-2-12", query: "orchard", words: ["orchard", "road"], expected: "exact" },
  { id: "WB2-P2", path: "1-3-4-9-11-12", query: "orchard", words: [], expected: null },
  { id: "WB2-P3", path: "1-3-4-5-6-12", query: "orch", words: ["orchard"], expected: "prefix" },
  { id: "WB2-P4", path: "1-3-4-5-7-4-9-11-12", query: "bugis", words: ["orchard"], expected: null },
  { id: "WB2-P5", path: "1-3-4-5-7-8-4-9-10-12", query: "orchrd", words: ["orchard"], expected: "fuzzy" },
  { id: "WB2-P6", path: "1-3-4-5-7-8-4-5-6-12", query: "vivo", words: ["viva", "vivocity"], expected: "prefix" },
];

for (const p of paths) {
  test(`${p.id} (path ${p.path})`, (t) => {
    const actual = tokenHits(p.query, p.words);
    t.diagnostic(`actual: ${actual}`);
    assert.equal(actual, p.expected);
  });
}
