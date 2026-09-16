import fs from "node:fs";
import path from "node:path";
import puppeteerExtra from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import type { Browser } from "puppeteer";
import { CrowdLevel } from "../types/venue";

puppeteerExtra.use(StealthPlugin());

// One day's typical hourly pattern. `day` is 0=Sun..6=Sat (matches
// Date.getDay()), so "today's" pattern can be picked out correctly no
// matter which day of the week the scrape itself actually ran on.
export interface DayPattern {
  day: number;
  hourly: { hour: number; percent: number }[];
}

// One day's opening hours, straight from Google's own formatting ("10 am",
// "10:30 pm") - not reparsed into a 24h clock, since it's only ever
// displayed, never compared against anything except in the client's own
// "open now" derivation. `day` is 0=Sun..6=Sat, closed days simply have no
// entry (checked once elsewhere, not worth a boolean per day).
export interface OpenHoursEntry {
  day: number;
  open: string;
  close: string;
}

export interface PopularTimesResult {
  weekly: DayPattern[];
  hours: OpenHoursEntry[];
}

// What every caller outside this module actually wants: the reading for
// right now, derived fresh from whichever day's pattern matches today.
export interface CurrentReading {
  crowdPercent: number;
  crowdLevel: CrowdLevel;
  hourly: { hour: number; percent: number }[];
  hours: OpenHoursEntry[];
}

interface CacheEntry {
  result: PopularTimesResult | null;
  timestamp: number;
}

// Not an official Google API - there isn't one. This drives a real headless
// browser through the exact flow a human visitor takes, since a plain HTTP
// request (what every known scraping library actually does) gets served a
// deliberately stripped-down page with Popular Times omitted entirely -
// confirmed by direct testing, not assumption. The three things that
// actually mattered: warming up on the homepage first instead of landing
// cold on a deep link, real synthesized mouse/wheel events instead of
// script-triggered scrolling, and the stealth plugin masking the most
// obvious automation tells. This is inherently fragile - Google can change
// their page at any time with no notice - so every failure mode here
// degrades to `null` rather than throwing.
//
// A single scrape captures the whole week (see scrapePopularTimes below),
// so there's no need to re-scrape often: the pattern itself barely moves,
// and "right now" is always recomputed fresh from whichever day's cached
// pattern matches the actual current day of week (see currentReading).
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

// Persisted to disk (same pattern as carpark-history.json) so a server
// restart doesn't wipe every venue back to "never checked" - without this,
// the bulk list would have zero Popular Times data until the scheduler's
// next full pass completes.
const CACHE_FILE = path.join(__dirname, "..", "..", "data", "popular-times-cache.json");

function loadCache(): Map<string, CacheEntry> {
  try {
    const raw = fs.readFileSync(CACHE_FILE, "utf-8");
    const parsed = JSON.parse(raw) as Record<string, CacheEntry>;
    // Older cache entries only ever held one day's pattern (no `weekly`
    // field) - not migratable to a full week, so they're dropped rather
    // than trusted, forcing a fresh scrape for those venues instead of
    // crashing on the shape mismatch.
    const entries = Object.entries(parsed).filter(([, v]) => Array.isArray(v.result?.weekly));
    return new Map(entries);
  } catch {
    return new Map(); // no file yet on first run, or unreadable - start fresh
  }
}

function saveCache(map: Map<string, CacheEntry>): void {
  try {
    fs.mkdirSync(path.dirname(CACHE_FILE), { recursive: true });
    fs.writeFileSync(CACHE_FILE, JSON.stringify(Object.fromEntries(map), null, 2));
  } catch (err) {
    console.error("Failed to persist Popular Times cache:", err);
  }
}

const cache = loadCache();

// A single long-lived browser instance is reused across lookups rather than
// relaunching per-request - but the underlying Chrome DevTools Protocol
// connection doesn't reliably survive the host machine sleeping (confirmed:
// every request failed with ConnectionClosedError after this process sat
// through ~18 hours including sleep/wake). Re-checking `.connected` and
// relaunching on demand fixes that without needing a server restart.
let browserPromise: Promise<Browser> | null = null;
// Exported so heatmapImage.ts can render its canvas in this same shared
// Chromium instead of launching a second one just for that.
export async function getBrowser(): Promise<Browser> {
  if (browserPromise) {
    const existing = await browserPromise;
    if (existing.connected) return existing;
    console.error("[popularTimes] Cached browser disconnected (likely a sleep/wake drop) - relaunching.");
    // The CDP connection dropping doesn't mean the underlying Chrome
    // process actually exited - discarding the reference without this
    // left one orphaned every time (confirmed: 8 leaked Chrome processes
    // after ~4.5 days uptime, each still fully running and using memory).
    // There's no live connection to close it through cleanly, so kill the
    // OS process directly.
    existing.process()?.kill();
    browserPromise = null;
  }
  browserPromise = puppeteerExtra.launch({ headless: true }) as Promise<Browser>;
  return browserPromise;
}

// For graceful shutdown (see index.ts) - without this, Ctrl+C leaves the
// launched Chromium process (and whatever page it's mid-navigation on)
// running past the Node process itself, which is part of why the server
// sometimes doesn't fully let go of its port right away.
export async function closeBrowser(): Promise<void> {
  if (!browserPromise) return;
  const existing = await browserPromise.catch(() => null);
  browserPromise = null;
  await existing?.close().catch(() => existing.process()?.kill());
}

function mapCrowdLevel(percent: number): CrowdLevel {
  if (percent < 34) return "Low";
  if (percent < 60) return "Moderate";
  if (percent < 80) return "High";
  return "Very High";
}

// The reading for right now: finds whichever day's pattern actually
// matches today (not just "whichever day was scraped"), then the entry for
// the current hour within it. A day with no pattern at all (venue closed
// that whole day - zero bars) or no entry for this specific hour both mean
// closed right now, same as before - a real result, not a scrape failure.
function currentReading(result: PopularTimesResult): CurrentReading {
  const now = new Date();
  const todayPattern = result.weekly.find((d) => d.day === now.getDay());
  const hourly = todayPattern?.hourly ?? [];
  const entry = hourly.find((e) => e.hour === now.getHours());
  // Older cache entries (scraped before hours extraction existed) simply
  // have no `hours` field - defaulting to empty rather than crashing, same
  // tolerance as any other pre-migration cache entry in this file.
  const hours = result.hours ?? [];
  if (!entry) return { crowdPercent: 0, crowdLevel: "Closed", hourly, hours };
  return { crowdPercent: entry.percent, crowdLevel: mapCrowdLevel(entry.percent), hourly, hours };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Carpark-derived venue names carry a parking-zone suffix (e.g. "VivoCity
// P3") that isn't part of the actual venue's own name - searching it
// verbatim resolves straight to that one carpark facility's own page
// (confirmed by testing: "VivoCity P3 Singapore" lands on "Vivocity P3
// Carpark", which has no Popular Times section at all) instead of the mall
// itself. Stripping it gets back to the real, popular-times-bearing page.
function cleanSearchName(name: string): string {
  return name.replace(/\s+P\d+$/i, "");
}

// A raw Puppeteer error's own console.error output is its full stack trace
// (a dozen+ lines through CDP/protocol internals that mean nothing here) -
// this keeps the terminal down to one line per failure: what actually
// happened, for which venue.
function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

async function scrapePopularTimes(venueName: string): Promise<PopularTimesResult | null> {
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.setViewport({ width: 1280, height: 1600 });
    await page.setUserAgent(
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    );
    await page.setExtraHTTPHeaders({ "Accept-Language": "en-SG,en;q=0.9" });

    await page.goto("https://www.google.com/", { waitUntil: "networkidle2", timeout: 30000 }).catch(() => {});
    await sleep(1200);
    await page.mouse.move(400, 300);
    await sleep(200);
    await page.mouse.move(600, 450, { steps: 10 });
    await sleep(400);

    const searchUrl = `https://www.google.com/maps/search/${encodeURIComponent(cleanSearchName(venueName) + " Singapore")}`;
    await page.goto(searchUrl, { waitUntil: "networkidle2", timeout: 45000 }).catch(() => {});
    await sleep(2500);

    await page.evaluate(() => {
      const link = document.querySelector('a[href*="/maps/place/"]') as HTMLElement | null;
      link?.click();
    });
    await sleep(2500);

    await page.mouse.move(700, 800);
    await sleep(300);

    // Waits for the Popular Times bars themselves to exist in the DOM
    // (they're lazy-rendered in on scroll, confirmed directly: zero
    // matching aria-labels immediately after opening the place page, 126
    // of them after scrolling) - previously this waited for the visible
    // text "Popular times" to appear instead, which seemed like a
    // reasonable proxy but wasn't: that heading's text and the bars'
    // aria-labels turned out to be two independent things, and a live
    // probe found real venues (Westgate, West Mall, Clarke Quay Central)
    // where the heading was visible in `innerText` while the bars' own
    // aria-labels - the actual data this function needs - simply weren't
    // there, so the old check could pass or fail independent of whether
    // there was anything to extract. Checking for the bars directly avoids
    // that mismatch entirely, since it's the same thing the extraction
    // step right below already queries.
    let found = false;
    for (let i = 0; i < 25; i++) {
      const hasBars = await page.evaluate(() =>
        Array.from(document.querySelectorAll("[aria-label]")).some((el) => {
          const label = el.getAttribute("aria-label");
          return !!label && /busy at/i.test(label);
        })
      );
      if (hasBars) {
        found = true;
        break;
      }
      await page.mouse.wheel({ deltaY: 700 });
      await sleep(600 + Math.random() * 300);
    }
    if (!found) {
      console.error(`Popular Times: no data found for "${venueName}" (page never showed the bars after scrolling)`);
      return null;
    }

    const ariaBars = await page.evaluate(() =>
      Array.from(document.querySelectorAll("[aria-label]"))
        .map((el) => el.getAttribute("aria-label"))
        .filter((l): l is string => !!l && /busy at/i.test(l))
    );

    const parsed = ariaBars
      .map((label) => {
        const m = label.match(/(\d+)% busy at (\d+)\s*(am|pm)\./i);
        if (!m) return null;
        let hour = parseInt(m[2], 10) % 12;
        if (m[3].toLowerCase() === "pm") hour += 12;
        return { hour, percent: parseInt(m[1], 10) };
      })
      .filter((x): x is { hour: number; percent: number } => x !== null);

    if (parsed.length === 0) return null;

    // Google's day-tab panels are all present in the DOM at once - querying
    // aria-labels without clicking any day tab already returns a full
    // week's worth (confirmed directly: ~126 entries for an 18-hour week,
    // not ~18 for a single day). The first day-block in DOM order is
    // always today (matches every "today" reading verified elsewhere this
    // session); hours increase monotonically within one day's block, so an
    // hour that doesn't increase from the previous entry marks the next
    // day's block starting.
    const dayBlocks: { hour: number; percent: number }[][] = [];
    let currentBlock: { hour: number; percent: number }[] = [];
    let prevHour = -1;
    for (const entry of parsed) {
      if (currentBlock.length > 0 && entry.hour <= prevHour) {
        dayBlocks.push(currentBlock);
        currentBlock = [];
      }
      currentBlock.push(entry);
      prevHour = entry.hour;
    }
    if (currentBlock.length > 0) dayBlocks.push(currentBlock);

    const todayDay = new Date().getDay();
    const weekly: DayPattern[] = dayBlocks.map((hourly, i) => ({
      day: (todayDay + i) % 7,
      hourly,
    }));

    // Google's per-day hours are exposed the same way as the Popular Times
    // bars - already in the DOM as aria-labels, no need to open the "Show
    // open hours for the week" dropdown (confirmed by direct testing:
    // querying for these without clicking anything already returns all 7
    // days). Format: "Wednesday, 10 am to 10 pm, Copy open hours" - a day
    // with no matching label (closed that day) is simply absent, same
    // convention as a closed hour being absent from the Popular Times data.
    const hoursLabels = await page.evaluate(() =>
      Array.from(document.querySelectorAll("[aria-label]"))
        .map((el) => el.getAttribute("aria-label"))
        .filter((l): l is string => !!l && /^\w+, .+ to .+, Copy open hours$/i.test(l))
    );
    const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
    let hours: OpenHoursEntry[] = hoursLabels
      .map((label) => {
        const m = label.match(/^(\w+), (.+) to (.+), Copy open hours$/i);
        if (!m) return null;
        const day = DAY_NAMES.findIndex((d) => d.toLowerCase() === m[1].toLowerCase());
        if (day === -1) return null;
        return { day, open: m[2].trim(), close: m[3].trim() };
      })
      .filter((x): x is OpenHoursEntry => x !== null);

    // A round-the-clock venue (e.g. Mustafa Centre, Jewel Changi Airport)
    // has no close time, so Google never renders the "Day, X to Y" labels
    // above at all - confirmed directly on NTU North Spine Plaza, whose
    // page literally says "Open 24 hours" in plain text instead. Without
    // this, such a venue would show no Hours line at all rather than an
    // honestly-empty one. "11:59 pm" (not "12 am") as the close time keeps
    // the open/close comparison in VenueHours.tsx correct - an open and
    // close both at midnight would never satisfy "now >= open && now < close".
    if (hours.length === 0) {
      const bodyText = await page.evaluate(() => document.body.innerText);
      if (/open 24 hours/i.test(bodyText)) {
        hours = Array.from({ length: 7 }, (_, day) => ({ day, open: "12 am", close: "11:59 pm" }));
      }
    }

    return { weekly, hours };
  } finally {
    await page.close();
  }
}

// On-demand path: triggered automatically whenever a venue's Detail screen
// opens, so what's shown is confirmed current rather than trusting
// whatever's cached. Always scrapes - deliberately ignores CACHE_TTL_MS -
// since the whole point is a fresh check on every view, not a cached one.
// Takes the full ~15-20s; fine for one venue on an explicit view, not fine
// for anything called in bulk.
export async function refreshPopularTimesNow(venueId: string, venueName: string): Promise<CurrentReading | null> {
  const result = await scrapePopularTimes(venueName).catch((err) => {
    console.error(`Popular Times: refresh failed for "${venueName}" - ${errorMessage(err)}`);
    return null;
  });

  if (result) {
    cache.set(venueId, { result, timestamp: Date.now() });
    saveCache(cache);
    return currentReading(result);
  }

  // A failed on-demand check (e.g. Google briefly rate-limiting this one
  // request) shouldn't erase whatever was already cached - leave the cache
  // untouched and fall back to serving that instead of "Unavailable" over
  // one bad attempt.
  const previous = cache.get(venueId);
  return previous?.result ? currentReading(previous.result) : null;
}

// Bulk-list path: only ever reads whatever the scheduler has already cached
// - never triggers a scrape itself, so a bulk /venues request stays fast
// regardless of cache state. `maxAgeMs` is intentionally separate from (and
// looser than) CACHE_TTL_MS, since this is read far more often than the
// scheduler refreshes.
export function getCachedPopularTimes(venueId: string, maxAgeMs: number): CurrentReading | null {
  const cached = cache.get(venueId);
  if (!cached || Date.now() - cached.timestamp >= maxAgeMs) return null;
  return cached.result ? currentReading(cached.result) : null;
}

// Scheduler path: sequentially refreshes a whole list of known venues,
// reusing the same shared browser instance a page at a time. Logs and moves
// on per-venue failure rather than aborting the whole batch over one bad
// name (e.g. an ambiguous name resolving to the wrong page).
//
// Saves to disk after every venue, not just once at the end - a batch over
// 100+ venues takes 15-30 minutes, and only saving at the end meant a crash
// partway through lost all of it, and a completely separate process
// starting up mid-batch (e.g. a dev server booted while this was still
// running) would read the cache file as if nothing had been scraped yet,
// triggering its own redundant full re-scrape in parallel with this one -
// confirmed happening exactly that way, not just a theoretical risk.
export async function refreshAllPopularTimes(
  venues: { id: string; name: string }[]
): Promise<{ succeeded: number; failed: number }> {
  let succeeded = 0;
  let failed = 0;
  let lastLoggedDecile = 0;

  for (let i = 0; i < venues.length; i++) {
    const venue = venues[i];
    // A failed attempt (scrapePopularTimes returning null, or throwing)
    // shouldn't erase an already-cached good result - previously it did,
    // which meant one bad batch run (Google rate-limiting, a page layout
    // hiccup) wiped every venue it touched to "Unavailable" even though
    // yesterday's still-fresh data was sitting right there. Only a venue
    // with no prior cache entry at all gets a null one recorded, so it at
    // least resolves to "no data yet" instead of nothing.
    try {
      const result = await scrapePopularTimes(venue.name);
      if (result) {
        cache.set(venue.id, { result, timestamp: Date.now() });
        succeeded++;
      } else {
        if (!cache.has(venue.id)) cache.set(venue.id, { result: null, timestamp: Date.now() });
        failed++;
      }
    } catch (err) {
      console.error(`Popular Times: batch refresh failed for "${venue.name}" - ${errorMessage(err)}`);
      if (!cache.has(venue.id)) cache.set(venue.id, { result: null, timestamp: Date.now() });
      failed++;
    }

    saveCache(cache);

    const decile = Math.floor(((i + 1) / venues.length) * 10);
    if (decile > lastLoggedDecile) {
      lastLoggedDecile = decile;
      console.log(
        `[popularTimes] Batch refresh progress: ${i + 1}/${venues.length} (${decile * 10}%) - ` +
          `${succeeded} succeeded, ${failed} failed so far.`
      );
    }
  }

  return { succeeded, failed };
}
