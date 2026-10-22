import assert from "node:assert/strict";
import { test } from "node:test";
import { isOpenAt } from "../src/services/openingHours";
import type { OpenHoursEntry } from "../src/services/popularTimes";

// White-box basis path tests for isOpenAt. Its control flow graph has
// cyclomatic complexity 7, so seven independent paths (WB1-P1 to P7, as in
// the Lab 4 test case table) cover every edge. Each test logs its actual
// output.

// Sunday 18 Oct 2026, local time - so "yesterday" is Saturday (day 6).
const sunday = (hour: number, minute = 0) => new Date(2026, 9, 18, hour, minute);
const everyDay = (open: string, close: string): OpenHoursEntry[] =>
  Array.from({ length: 7 }, (_, day) => ({ day, open, close }));

const paths: { id: string; path: string; hours: OpenHoursEntry[]; at: Date; expected: boolean | null }[] = [
  { id: "WB1-P1", path: "1-2-13", hours: [], at: sunday(15), expected: null },
  { id: "WB1-P2", path: "1-3-6-7-13", hours: [{ day: 3, open: "10 am", close: "10 pm" }], at: sunday(15), expected: false },
  { id: "WB1-P3", path: "1-3-4-5-13", hours: everyDay("6 pm", "2 am"), at: sunday(1), expected: true },
  { id: "WB1-P4", path: "1-3-4-6-7-13", hours: [{ day: 6, open: "10 am", close: "10 pm" }], at: sunday(15), expected: false },
  { id: "WB1-P5", path: "1-3-4-6-8-9-13", hours: everyDay("12 am", "11:59 pm"), at: sunday(3), expected: true },
  { id: "WB1-P6", path: "1-3-4-6-8-10-11-13", hours: everyDay("Open 24 hours", ""), at: sunday(15), expected: null },
  { id: "WB1-P7", path: "1-3-4-6-8-10-12-13", hours: everyDay("10 am", "10 pm"), at: sunday(15), expected: true },
];

for (const p of paths) {
  test(`${p.id} (path ${p.path})`, (t) => {
    const actual = isOpenAt(p.hours, p.at);
    t.diagnostic(`actual: ${actual}`);
    assert.equal(actual, p.expected);
  });
}
