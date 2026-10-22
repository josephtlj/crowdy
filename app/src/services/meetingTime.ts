// Choosing when a group meets: a day up to a week ahead and an hour of the
// day. The server reads each mall's usual crowd at that hour from its
// Popular Times week, so a week ahead is as far as it makes sense to go.

export interface MeetingTime {
  // 0 = today, 1 = tomorrow, ... up to DAYS_AHEAD - 1.
  day: number;
  // Hour of the day, 0-23.
  hour: number;
}

export const DAYS_AHEAD = 7;
// Meeting hours on offer - malls open around 10 am and close around 10 pm,
// so this covers an early breakfast to a late supper.
export const FIRST_HOUR = 7;
export const LAST_HOUR = 23;
// The hour suggested when a day is first picked.
export const DEFAULT_HOUR = 19;

/**
 * The hours that can still be chosen on a day: every offered hour, or for
 * today only the hours after the current one ("Now" covers this hour).
 * @param day - days from today (0 = today)
 * @param now - the current time
 * @returns the hours, earliest first (empty late at night today)
 */
export function meetingHours(day: number, now: Date): number[] {
  const hours: number[] = [];
  for (let hour = FIRST_HOUR; hour <= LAST_HOUR; hour++) {
    if (day > 0 || hour > now.getHours()) hours.push(hour);
  }
  return hours;
}

/**
 * The days that can be chosen: today (while it still has hours left) and
 * the rest of the week.
 * @param now - the current time
 * @returns days from today, soonest first
 */
export function meetingDays(now: Date): number[] {
  const days: number[] = [];
  for (let day = 0; day < DAYS_AHEAD; day++) {
    if (meetingHours(day, now).length > 0) days.push(day);
  }
  return days;
}

/**
 * Picks the hour to show when a day is selected: the hour already chosen
 * if that day still has it, else 7 pm, else the earliest hour left.
 * @param day - days from today
 * @param current - the hour chosen so far, if any
 * @param now - the current time
 * @returns the hour, or null if the day has no hours left
 */
export function hourForDay(day: number, current: number | null, now: Date): number | null {
  const hours = meetingHours(day, now);
  if (current !== null && hours.includes(current)) return current;
  if (hours.includes(DEFAULT_HOUR)) return DEFAULT_HOUR;
  return hours[0] ?? null;
}

/**
 * Turns a chosen day and hour into a moment in the device's own time zone.
 * @param time - the chosen day and hour
 * @param now - the current time
 * @returns the start of that hour on that day
 */
export function meetingDate(time: MeetingTime, now: Date): Date {
  return new Date(now.getFullYear(), now.getMonth(), now.getDate() + time.day, time.hour);
}
