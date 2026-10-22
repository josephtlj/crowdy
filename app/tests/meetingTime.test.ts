import assert from "node:assert/strict";
import { test } from "node:test";
import { hourForDay, meetingDate, meetingDays, meetingHours } from "../src/services/meetingTime";

// Thursday 22 Oct 2026, local time.
const at = (hour: number, minute = 0) => new Date(2026, 9, 22, hour, minute);

test("today only offers hours after the current one", () => {
  assert.deepEqual(meetingHours(0, at(20, 30)), [21, 22, 23]);
  assert.equal(meetingHours(1, at(20, 30)).length, 17);
});

test("late at night, today drops off the list of days", () => {
  assert.deepEqual(meetingDays(at(23, 15)), [1, 2, 3, 4, 5, 6]);
  assert.deepEqual(meetingDays(at(9)), [0, 1, 2, 3, 4, 5, 6]);
});

test("picking a day keeps the chosen hour when it can, else 7 pm, else the earliest left", () => {
  assert.equal(hourForDay(2, 13, at(9)), 13);
  assert.equal(hourForDay(2, null, at(9)), 19);
  assert.equal(hourForDay(0, 13, at(20)), 21);
  assert.equal(hourForDay(0, null, at(23, 30)), null);
});

test("a chosen day and hour becomes that hour's start, across a month end", () => {
  assert.deepEqual(meetingDate({ day: 0, hour: 19 }, at(9, 41)), new Date(2026, 9, 22, 19));
  assert.deepEqual(meetingDate({ day: 6, hour: 10 }, new Date(2026, 9, 28, 9)), new Date(2026, 10, 3, 10));
});
