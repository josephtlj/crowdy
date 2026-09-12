// One-time build step: fetch real first/last train timings for every
// station in stations.ts and emit a static lookup file. Not run
// automatically - re-run by hand if the station list changes (see
// stations.ts's own header for where that list comes from).
//
// Source: sgtrainstatus.com's own JSON station index (/api/stations, gives
// a slug per station name/code) plus its per-station timing page
// (/timing/{slug}), which server-renders first/last train time for every
// line and direction serving that station, split into Weekdays/Saturday/
// Sun-PH. No official LTA API publishes this - confirmed via their own
// docs ("exact train timings are not public") - this is the same data
// SMRT's and SBS Transit's own sites publish per-station, just aggregated
// onto one site in a plain, parseable HTML format instead of a JS app or a
// Cloudflare-gated one (both of which the operators' own sites are).
//
// Simplification: a station can serve multiple lines/directions, each with
// its own first/last time. This collapses all of them down to one window
// per station - the earliest first train and the latest last train across
// every line/direction - since what the app actually needs is "is this
// station running at all right now", not per-platform precision.
import fs from "node:fs";
import path from "node:path";
import { STATIONS, StationInfo } from "../src/data/stations";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface StationIndexEntry {
  name: string;
  codes: string; // comma-separated, e.g. "CC34,DT16" for interchanges
  slug: string;
}

async function fetchStationIndex(): Promise<StationIndexEntry[]> {
  const res = await fetch("https://sgtrainstatus.com/api/stations");
  const json = (await res.json()) as { data: StationIndexEntry[] };
  return json.data;
}

function slugifyName(name: string): string {
  return name
    .replace(/\s+(MRT|LRT)$/i, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

// Resolves a station to sgtrainstatus's slug for its page. Matches by line
// code first (robust to name-spelling differences); falls back to a
// slugified name match for the couple of secondary/branch codes
// (e.g. Bayfront's CE1, Expo's CG1) that aren't in the index's own codes
// list - both resolve fine by name instead.
function resolveSlug(
  station: StationInfo,
  codeToSlug: Map<string, string>,
  nameToSlug: Map<string, string>
): string | null {
  return codeToSlug.get(station.code) ?? nameToSlug.get(slugifyName(station.name)) ?? null;
}

type DayType = "Weekdays" | "Saturday" | "Sun / PH";

// "5:35 AM" -> 335 (minutes since midnight). Used only for comparison, not
// for the final output string.
function to24hMinutes(t: string): number {
  const m = t.match(/(\d+):(\d+)\s*(AM|PM)/i);
  if (!m) return 0;
  let hour = parseInt(m[1], 10) % 12;
  if (m[3].toUpperCase() === "PM") hour += 12;
  return hour * 60 + parseInt(m[2], 10);
}

// "5:35 AM" -> "5:35 am", "12:10 AM" -> "12:10 am" - matches the
// "H[:MM] am/pm" convention the rest of the app already uses for opening
// hours (see popularTimes.ts): no leading zero, no ":00" when on the hour.
function normalize(t: string): string {
  const m = t.match(/(\d+):(\d+)\s*(AM|PM)/i)!;
  const hour = parseInt(m[1], 10);
  const minute = parseInt(m[2], 10);
  const period = m[3].toLowerCase();
  return minute === 0 ? `${hour} ${period}` : `${hour}:${minute.toString().padStart(2, "0")} ${period}`;
}

function earliest(times: string[]): string {
  return times.reduce((min, t) => (to24hMinutes(t) < to24hMinutes(min) ? t : min));
}

// A last train just after midnight (e.g. "12:10 AM") is later than one at
// "11:50 PM", not earlier - times before 4am are compared as if on the
// following day.
function latest(times: string[]): string {
  const effective = (t: string) => {
    const m = to24hMinutes(t);
    return m < 4 * 60 ? m + 24 * 60 : m;
  };
  return times.reduce((max, t) => (effective(t) > effective(max) ? t : max));
}

interface TimeWindow {
  weekdayFirst: string;
  weekdayLast: string;
  saturdayFirst: string;
  saturdayLast: string;
  sundayFirst: string;
  sundayLast: string;
}

const DAY_TYPE_TO_KEY: Record<DayType, "weekday" | "saturday" | "sunday"> = {
  Weekdays: "weekday",
  Saturday: "saturday",
  "Sun / PH": "sunday",
};

async function fetchStationWindow(slug: string): Promise<TimeWindow | null> {
  const res = await fetch(`https://sgtrainstatus.com/timing/${slug}`);
  if (!res.ok) return null;
  const html = await res.text();

  const pattern =
    /rounded-full bg-[a-z]+-500 mr-2"><\/span>\s*(Weekdays|Saturday|Sun \/ PH)\s*<\/span>[\s\S]*?text-green-700">\s*([\d:]+\s*[AP]M)\s*<\/div>[\s\S]*?text-red-700">\s*([\d:]+\s*[AP]M)\s*<\/div>/g;

  const firsts: Record<"weekday" | "saturday" | "sunday", string[]> = { weekday: [], saturday: [], sunday: [] };
  const lasts: Record<"weekday" | "saturday" | "sunday", string[]> = { weekday: [], saturday: [], sunday: [] };

  let match: RegExpExecArray | null;
  while ((match = pattern.exec(html)) !== null) {
    const [, dayType, first, last] = match;
    const key = DAY_TYPE_TO_KEY[dayType as DayType];
    firsts[key].push(first);
    lasts[key].push(last);
  }

  if (firsts.weekday.length === 0 || firsts.saturday.length === 0 || firsts.sunday.length === 0) return null;

  return {
    weekdayFirst: earliest(firsts.weekday),
    weekdayLast: latest(lasts.weekday),
    saturdayFirst: earliest(firsts.saturday),
    saturdayLast: latest(lasts.saturday),
    sundayFirst: earliest(firsts.sunday),
    sundayLast: latest(lasts.sunday),
  };
}

interface OpenHoursEntry {
  day: number;
  open: string;
  close: string;
}

// day: 0=Sun..6=Sat. Monday-Friday get the Weekdays window, Saturday gets
// its own, Sunday gets Sun/PH (public-holiday timings aren't tracked
// separately elsewhere in the app, so this just uses the Sunday window
// every day - a reasonable approximation).
function toWeeklyHours(w: TimeWindow): OpenHoursEntry[] {
  const weekday = { open: normalize(w.weekdayFirst), close: normalize(w.weekdayLast) };
  const saturday = { open: normalize(w.saturdayFirst), close: normalize(w.saturdayLast) };
  const sunday = { open: normalize(w.sundayFirst), close: normalize(w.sundayLast) };
  return [0, 1, 2, 3, 4, 5, 6].map((day) => ({
    day,
    ...(day === 0 ? sunday : day === 6 ? saturday : weekday),
  }));
}

async function main() {
  console.log(`Fetching station index for ${STATIONS.length} known stations...`);
  const index = await fetchStationIndex();
  const codeToSlug = new Map<string, string>();
  const nameToSlug = new Map<string, string>();
  for (const entry of index) {
    nameToSlug.set(slugifyName(entry.name), entry.slug);
    for (const code of entry.codes.split(",")) codeToSlug.set(code.trim(), entry.slug);
  }

  const results: { id: string; hours: OpenHoursEntry[] }[] = [];
  const failed: string[] = [];
  // Multiple STATIONS entries can share one physical slug (the 4
  // MRT/LRT interchanges - Bukit Panjang, Choa Chu Kang, Punggol,
  // Sengkang - each have a separate MRT and LRT entry in stations.ts but
  // one combined sgtrainstatus page) - cache by slug so each page is only
  // fetched once.
  const windowBySlug = new Map<string, TimeWindow | null>();

  for (const [i, station] of STATIONS.entries()) {
    const slug = resolveSlug(station, codeToSlug, nameToSlug);
    if (!slug) {
      console.warn(`  [no slug match] ${station.name} (${station.code})`);
      failed.push(station.name);
      continue;
    }

    if (!windowBySlug.has(slug)) {
      const w = await fetchStationWindow(slug);
      windowBySlug.set(slug, w);
      await sleep(150);
    }

    const w = windowBySlug.get(slug);
    if (!w) {
      console.warn(`  [no timing data] ${station.name} (slug: ${slug})`);
      failed.push(station.name);
      continue;
    }

    results.push({ id: station.id, hours: toWeeklyHours(w) });
    if ((i + 1) % 20 === 0) console.log(`  ...${i + 1}/${STATIONS.length}`);
  }

  const outFile = path.join(__dirname, "..", "src", "data", "stationHours.ts");
  const body = results.map((r) => `  ${JSON.stringify(r.id)}: ${JSON.stringify(r.hours)},`).join("\n");

  const fileContent = `// Generated by scripts/build-station-hours.ts - do not hand-edit the
// entries, re-run the script instead. First/last train times sourced from
// sgtrainstatus.com's per-station timing pages (no official LTA API
// publishes this). Each station's window is the earliest first train and
// latest last train across every line/direction serving it - "is this
// station running at all", not per-platform precision. Keyed by the same
// station id used in stations.ts; a station missing here (e.g. one added
// after this was last run) just gets no hours override - see venues.ts.
export const STATION_HOURS: Record<string, { day: number; open: string; close: string }[]> = {
${body}
};
`;

  fs.writeFileSync(outFile, fileContent);
  console.log(`\nWrote ${results.length}/${STATIONS.length} stations to ${outFile}`);
  console.log(`Failures: ${failed.length}${failed.length ? " - " + failed.join(", ") : ""}`);
  process.exit(0);
}

main().catch((err) => {
  console.error("Build script crashed:", err);
  process.exit(1);
});
