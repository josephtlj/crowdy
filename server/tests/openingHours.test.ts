import assert from "node:assert/strict";
import { test } from "node:test";
import { isOpenAt } from "../src/services/openingHours";

// Sunday 18 Oct 2026, local time.
const at = (hour: number, minute = 0) => new Date(2026, 9, 18, hour, minute);
const everyDay = (open: string, close: string) =>
  Array.from({ length: 7 }, (_, day) => ({ day, open, close }));

test("a mall is closed from its closing time, even if the chart has a bar for that hour", () => {
  const hours = everyDay("10 am", "10 pm");
  assert.equal(isOpenAt(hours, at(21, 59)), true);
  assert.equal(isOpenAt(hours, at(22, 0)), false);
  assert.equal(isOpenAt(hours, at(9, 59)), false);
  assert.equal(isOpenAt(hours, at(10, 0)), true);
});

test("half-hour closing times are respected", () => {
  assert.equal(isOpenAt(everyDay("10 am", "10:30 pm"), at(22, 15)), true);
  assert.equal(isOpenAt(everyDay("10 am", "10:30 pm"), at(22, 30)), false);
});

test("a day with no hours listed is closed all day", () => {
  const hours = everyDay("10 am", "10 pm").filter((h) => h.day !== 0);
  assert.equal(isOpenAt(hours, at(14)), false);
});

test("round-the-clock and past-midnight hours count as open", () => {
  assert.equal(isOpenAt(everyDay("12 am", "11:59 pm"), at(23, 59)), true);
  const lateNight = everyDay("6 pm", "2 am");
  assert.equal(isOpenAt(lateNight, at(1)), true);
  assert.equal(isOpenAt(lateNight, at(3)), false);
});

test("no usable hours leaves the decision to the chart", () => {
  assert.equal(isOpenAt([], at(14)), null);
  assert.equal(isOpenAt(everyDay("dawn", "dusk"), at(14)), null);
});
