// Shared by VenueHours (the mall Detail-screen dropdown) and VenueRow (the
// inline transit summary line) so both read the same `hours` field the
// same way - previously this lived only in VenueHours.tsx.
export interface OpenHoursEntry {
  day: number; // 0=Sun..6=Sat
  open: string;
  close: string;
}

export const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function parseTimeToMinutes(s: string): number | null {
  const m = s.match(/(\d+)(?::(\d+))?\s*(am|pm)/i);
  if (!m) return null;
  let hour = parseInt(m[1], 10) % 12;
  if (m[3].toLowerCase() === "pm") hour += 12;
  const minute = m[2] ? parseInt(m[2], 10) : 0;
  return hour * 60 + minute;
}

// "Open · Closes 10:30 pm" if within today's window, "Closed · Opens X"
// otherwise - searching forward through the week for the next day that
// actually has hours, so a fully-closed today (or a bad/unparseable entry)
// still resolves to a sensible next-opening message instead of nothing.
export function getTodayStatus(hours: OpenHoursEntry[]): { open: boolean; detail: string } | null {
  if (hours.length === 0) return null;
  const now = new Date();
  const todayDay = now.getDay();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();

  // Deep-night tail of yesterday's window, for hours that close after
  // midnight - transit stations' last train is typically ~12-1am, while
  // malls always close same-day, so this never fires for mall data (a
  // close time only sits numerically before its own day's open time when
  // the window genuinely wraps past midnight).
  const yesterday = hours.find((h) => h.day === (todayDay + 6) % 7);
  if (yesterday) {
    const yOpen = parseTimeToMinutes(yesterday.open);
    const yClose = parseTimeToMinutes(yesterday.close);
    if (yOpen !== null && yClose !== null && yClose < yOpen && nowMinutes < yClose) {
      return { open: true, detail: `Closes ${yesterday.close}` };
    }
  }

  const today = hours.find((h) => h.day === todayDay);
  if (today) {
    // "12 am"/"11:59 pm" is this module's own sentinel for a round-the-clock
    // venue (see popularTimes.ts) - "Closes 11:59 pm" would read as closing
    // near midnight rather than never closing, so it gets its own label.
    if (today.open === "12 am" && today.close === "11:59 pm") {
      return { open: true, detail: "Open 24 hours" };
    }
    const openMin = parseTimeToMinutes(today.open);
    const closeMin = parseTimeToMinutes(today.close);
    if (openMin !== null && closeMin !== null) {
      // closeMin < openMin means this window also wraps past midnight
      // (today's own overnight tail, picked up again tomorrow) - once
      // past today's open, it stays "open" through to midnight regardless.
      if (nowMinutes >= openMin && (nowMinutes < closeMin || closeMin < openMin)) {
        return { open: true, detail: `Closes ${today.close}` };
      }
      if (nowMinutes < openMin) {
        return { open: false, detail: `Opens ${today.open}` };
      }
    }
  }

  for (let i = 1; i <= 7; i++) {
    const day = (todayDay + i) % 7;
    const entry = hours.find((h) => h.day === day);
    if (entry) {
      return { open: false, detail: `Opens ${entry.open} ${i === 1 ? "tomorrow" : DAY_NAMES[day]}` };
    }
  }
  return { open: false, detail: "" };
}
