import type { OpenHoursEntry } from "./popularTimes";

// Google's "10 am" / "10:30 pm" -> minutes since midnight.
function parseMinutes(s: string): number | null {
  const m = s.match(/(\d+)(?::(\d+))?\s*(am|pm)/i);
  if (!m) return null;
  let hour = parseInt(m[1], 10) % 12;
  if (m[3].toLowerCase() === "pm") hour += 12;
  return hour * 60 + (m[2] ? parseInt(m[2], 10) : 0);
}

// Whether a venue is open at `at`, by its listed opening hours - the same
// rules the app's hours line uses (app/src/services/hours.ts), so the crowd
// badge and "Hours: Closed" can't disagree. null when there are no usable
// hours, so the caller falls back to the Popular Times bars alone.
/**
 * Checks whether a venue is open at a given time, by its listed opening hours.
 * @param hours - the venue's opening hours for each day
 * @param at - the time to check
 * @returns true or false, or null if the hours can't be read
 */
export function isOpenAt(hours: OpenHoursEntry[], at: Date): boolean | null {
  if (hours.length === 0) return null;
  const day = at.getDay();
  const minutes = at.getHours() * 60 + at.getMinutes();

  // Yesterday's window running past midnight.
  const yesterday = hours.find((h) => h.day === (day + 6) % 7);
  if (yesterday) {
    const open = parseMinutes(yesterday.open);
    const close = parseMinutes(yesterday.close);
    if (open !== null && close !== null && close < open && minutes < close) return true;
  }

  const today = hours.find((h) => h.day === day);
  // No entry for today means closed all day.
  if (!today) return false;
  // popularTimes.ts records a round-the-clock venue as 12 am - 11:59 pm.
  if (today.open === "12 am" && today.close === "11:59 pm") return true;

  const open = parseMinutes(today.open);
  const close = parseMinutes(today.close);
  if (open === null || close === null) return null;
  return minutes >= open && (minutes < close || close < open);
}
