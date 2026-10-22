import fs from "node:fs";
import path from "node:path";
import puppeteerExtra from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import type { Browser } from "puppeteer";
import { CrowdLevel } from "../types/venue";
import { loadStoredEntries, storeEntry, StoredEntry } from "./popularTimesStore";
import { chromePath, googleProfileDir, isScrapingEnabled } from "./googleProfile";
import { isOpenAt } from "./openingHours";

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
// obvious automation tells. Since some time between 18 Sep and 17 Oct 2026
// (the last successful logged-out scrape and the first failed one) it also has to be
// signed in to a Google account - signed-out visitors get a "limited view"
// without Popular Times (see googleProfile.ts). Both are needed: a test on
// the signed-in profile without the stealth plugin still got the limited
// view. This is inherently fragile - Google can change their page at any
// time with no notice - so every failure mode here degrades to `null`
// rather than throwing.
//
// A single scrape captures the whole week (see scrapePopularTimes below),
// so there's no need to re-scrape often: the pattern itself barely moves,
// and "right now" is always recomputed fresh from whichever day's cached
// pattern matches the actual current day of week (see readingAt).

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

// Every cache write goes through here: memory, the local file, and the
// shared database. The database write isn't awaited - a slow or asleep
// database must never hold up a scrape.
function recordEntry(venueId: string, entry: CacheEntry): void {
  cache.set(venueId, entry);
  saveCache(cache);
  void storeEntry(venueId, entry);
}

// Entries scraped before the full-week format existed can't be used - the
// same rule loadCache applies to the local file.
function isUsable(entry: StoredEntry): entry is CacheEntry {
  return entry.result === null || Array.isArray((entry.result as PopularTimesResult).weekly);
}

// A database that's asleep can take a while to refuse a connection. Bounded
// so the scheduler waiting on a sync can't stall behind it.
const SYNC_TIMEOUT_MS = 15 * 1000;

// Two-way sync with the shared database: takes anything a teammate scraped
// more recently than this machine, and uploads anything this machine has
// that's newer than the shared copy. The upload half is also what moves an
// existing local cache into the database the first time this runs.
/**
 * Two-way sync of the Popular Times cache with the shared database: pulls patterns
 * newer than this machine's and uploads this machine's newer ones.
 * @returns resolves once the sync finishes (does nothing if the database is unreachable)
 */
export async function syncPopularTimesWithDb(): Promise<void> {
  const stored = await Promise.race([
    loadStoredEntries(),
    new Promise<null>((resolve) => setTimeout(() => resolve(null), SYNC_TIMEOUT_MS)),
  ]);
  if (!stored) return;

  let pulled = 0;
  for (const [venueId, entry] of stored) {
    const local = cache.get(venueId);
    if (isUsable(entry) && (!local || entry.timestamp > local.timestamp) && (entry.result !== null || !local?.result)) {
      cache.set(venueId, entry);
      pulled++;
    }
  }
  if (pulled > 0) saveCache(cache);

  let pushed = 0;
  for (const [venueId, entry] of cache) {
    const remote = stored.get(venueId);
    if (!remote || entry.timestamp > remote.timestamp) {
      await storeEntry(venueId, entry);
      pushed++;
    }
  }

  if (pulled > 0 || pushed > 0) {
    console.log(`[popularTimes] Synced with database: ${pulled} pulled, ${pushed} pushed.`);
  }
}

// A single long-lived browser instance is reused across lookups rather than
// relaunching per-request - but the underlying Chrome DevTools Protocol
// connection doesn't reliably survive the host machine sleeping (confirmed:
// every request failed with ConnectionClosedError after this process sat
// through ~18 hours including sleep/wake). Re-checking `.connected` and
// relaunching on demand fixes that without needing a server restart.
interface BrowserSlot {
  promise: Promise<Browser> | null;
  launch: () => Promise<Browser>;
}

// The plain bundled Chromium, used by heatmapImage.ts to render its canvas.
const plainBrowser: BrowserSlot = {
  promise: null,
  launch: () => puppeteerExtra.launch({ headless: true }) as Promise<Browser>,
};

// Real Chrome on the signed-in profile (see googleProfile.ts), used only for
// Google Maps. Puppeteer's defaults swap in a fake macOS keychain, which
// can't decrypt the profile's saved session, so those two flags are dropped.
const mapsBrowser: BrowserSlot = {
  promise: null,
  launch: () =>
    puppeteerExtra.launch({
      headless: true,
      executablePath: chromePath(),
      userDataDir: googleProfileDir(),
      ignoreDefaultArgs: ["--use-mock-keychain", "--password-store=basic"],
    }) as Promise<Browser>,
};

async function getFromSlot(slot: BrowserSlot): Promise<Browser> {
  if (slot.promise) {
    const existing = await slot.promise;
    if (existing.connected) return existing;
    console.error("[popularTimes] Cached browser disconnected (likely a sleep/wake drop) - relaunching.");
    // The CDP connection dropping doesn't mean the underlying Chrome
    // process actually exited - discarding the reference without this
    // left one orphaned every time (confirmed: 8 leaked Chrome processes
    // after ~4.5 days uptime, each still fully running and using memory).
    // There's no live connection to close it through cleanly, so kill the
    // OS process directly.
    existing.process()?.kill();
    slot.promise = null;
  }
  const launching = slot.launch();
  slot.promise = launching;
  // A failed launch (e.g. the profile open in another Chrome window) is
  // retried on the next call instead of being cached forever.
  launching.catch(() => {
    if (slot.promise === launching) slot.promise = null;
  });
  return launching;
}

// Exported so heatmapImage.ts can render its canvas in a shared Chromium
// instead of launching a new one per render.
/**
 * Returns the shared headless browser used to render the heatmap image.
 * @returns a running browser instance, relaunched if the previous one disconnected
 */
export function getBrowser(): Promise<Browser> {
  return getFromSlot(plainBrowser);
}

function getMapsBrowser(): Promise<Browser> {
  return getFromSlot(mapsBrowser);
}

// For graceful shutdown (see index.ts) - without this, Ctrl+C leaves the
// launched Chromium process (and whatever page it's mid-navigation on)
// running past the Node process itself, which is part of why the server
// sometimes doesn't fully let go of its port right away.
/**
 * Closes every headless browser this server started. Called on shutdown.
 * @returns resolves once the browsers are closed
 */
export async function closeBrowser(): Promise<void> {
  await Promise.all(
    [plainBrowser, mapsBrowser].map(async (slot) => {
      if (!slot.promise) return;
      const existing = await slot.promise.catch(() => null);
      slot.promise = null;
      await existing?.close().catch(() => existing.process()?.kill());
    })
  );
}

function mapCrowdLevel(percent: number): CrowdLevel {
  if (percent < 34) return "Low";
  if (percent < 60) return "Moderate";
  if (percent < 80) return "High";
  return "Very High";
}

// The reading for a given moment (normally right now): finds whichever
// day's pattern actually matches that day (not just "whichever day was
// scraped"), then the entry for that hour within it. A day with no pattern at all (venue closed
// that whole day - zero bars) or no entry for this specific hour both mean
// closed right now, same as before - a real result, not a scrape failure.
// So does the venue's own opening hours saying it's shut: Google's chart
// often has a 0% bar for the closing hour itself (10pm for a mall that
// closes at 10pm), which on its own read as "Low" next to "Hours: Closed".
/**
 * Reads a venue's typical crowd level for one moment from its weekly pattern.
 * @param result - the venue's scraped weekly pattern and opening hours
 * @param at - the moment to read (day of week and hour are used)
 * @returns that day's hourly pattern, and the crowd level for that hour
 *   ("Closed" if the venue is shut then)
 */
export function readingAt(result: PopularTimesResult, at: Date): CurrentReading {
  const dayPattern = result.weekly.find((d) => d.day === at.getDay());
  const hourly = dayPattern?.hourly ?? [];
  const entry = hourly.find((e) => e.hour === at.getHours());
  // Older cache entries (scraped before hours extraction existed) simply
  // have no `hours` field - defaulting to empty rather than crashing, same
  // tolerance as any other pre-migration cache entry in this file.
  const hours = result.hours ?? [];
  if (!entry || isOpenAt(hours, at) === false) return { crowdPercent: 0, crowdLevel: "Closed", hourly, hours };
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

interface ScrapeAttempt {
  result: PopularTimesResult | null;
  // Only true for the specific "bars never loaded after scrolling" case -
  // confirmed directly to be a transient load-timing flake (a batch-run
  // failure for VivoCity was immediately followed by a successful
  // on-demand attempt for the exact same venue, page title and content
  // otherwise identical - not a block, just sometimes too slow to finish
  // within the scroll budget). Other null cases (e.g. bars existed but
  // nothing parsed) aren't retried - retrying those wouldn't address
  // whatever actually went wrong.
  retry: boolean;
  // Google served its signed-out "limited view" of Maps, which leaves out
  // Popular Times. It applies to every page, not just this venue, so the
  // batch stops instead of loading the rest for nothing.
  limitedView?: boolean;
}

async function scrapePopularTimesAttempt(venueName: string): Promise<ScrapeAttempt> {
  const browser = await getMapsBrowser();
  const page = await browser.newPage();
  try {
    // No user-agent override - real Chrome already sends its own, and a
    // made-up version wouldn't match the signed-in session's browser.
    await page.setViewport({ width: 1280, height: 1600 });
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
      // Lightweight, console-only diagnostic (no screenshot files this
      // time - the earlier version of this accumulated tens of megabytes
      // with little payoff). A page title/snippet is usually enough to
      // tell a genuine "no Popular Times for this venue" apart from
      // Google serving a CAPTCHA/"unusual traffic" block instead.
      const title = await page.title().catch(() => "(no title)");
      const bodyText = await page.evaluate(() => document.body?.innerText ?? "").catch(() => "");

      // Signed-out visitors can get a "limited view" of Maps with no
      // Popular Times at all - confirmed on an open mall (313@somerset,
      // Sunday 4pm) from two different networks and with a visible browser,
      // so it isn't a slow load or this IP. A retry gets the same page.
      if (/limited view of Google Maps/i.test(bodyText)) {
        console.error(
          `Popular Times: Google served a limited (signed-out) view of Maps for "${venueName}" ` +
            "without Popular Times - keeping the last known pattern."
        );
        return { result: null, retry: false, limitedView: true };
      }

      // A closed venue's page without the chart - a retry gets the same
      // page, so the cached pattern carries on.
      if (/\bClosed\b\s*·\s*Opens/i.test(bodyText) || /(Temporarily|Permanently) closed/i.test(bodyText)) {
        console.error(`Popular Times: "${venueName}" shows as closed and its page has no chart - keeping the last known pattern.`);
        return { result: null, retry: false };
      }

      console.error(
        `Popular Times: no data found for "${venueName}" (page never showed the bars after scrolling)\n` +
          `  page title: ${title}\n` +
          `  body snippet: ${bodyText.slice(0, 300).replace(/\n+/g, " ")}`
      );
      return { result: null, retry: true };
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

    if (parsed.length === 0) return { result: null, retry: false };

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

    return { result: { weekly, hours }, retry: false };
  } finally {
    await page.close();
  }
}

// Retries once, with a completely fresh page, specifically for the
// scroll-timeout case identified above - recovers most of those without
// masking a genuine "no Popular Times for this venue" result, since that
// case is marked non-retryable at the source.
async function scrapePopularTimes(venueName: string): Promise<ScrapeAttempt> {
  const first = await scrapePopularTimesAttempt(venueName);
  if (!first.retry) return first;
  console.error(`Popular Times: retrying "${venueName}" once after a scroll timeout...`);
  return scrapePopularTimesAttempt(venueName);
}

// How old a venue's pattern can get before it's scraped again. A typical
// week barely changes from one week to the next, so weekly is plenty - and
// every page load counts against the signed-in account.
export const PATTERN_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

// On-demand path: triggered automatically whenever a venue's Detail screen
// opens. Only scrapes on the scraping backend, and only when the venue's
// pattern is due anyway - otherwise browsing the app would add page loads
// on the signed-in account for patterns that are still current. A scrape
// takes ~15-20s; fine for one venue on an explicit view, not for bulk.
// `scrapedAt` says when the returned reading was actually gathered - now, or
// the cached reading's original time if no scrape ran or it failed - so a
// fallback is never passed off as a fresh check.
/**
 * Returns a venue's current Popular Times reading, scraping it first if this backend
 * scrapes and the venue's pattern is over a week old.
 * @param venueId - the venue's id
 * @param venueName - the venue's name, used to find it on Google Maps
 * @returns the reading and when it was scraped, or null if the venue has never been scraped
 */
export async function refreshPopularTimesNow(
  venueId: string,
  venueName: string
): Promise<(CurrentReading & { scrapedAt: number }) | null> {
  const latest = getLatestPopularTimes(venueId);
  if (!isScrapingEnabled() || (latest && Date.now() - latest.scrapedAt < PATTERN_MAX_AGE_MS)) return latest;

  const result = await scrapePopularTimes(venueName).then(
    (attempt) => attempt.result,
    (err) => {
      console.error(`Popular Times: refresh failed for "${venueName}" - ${errorMessage(err)}`);
      return null;
    }
  );

  if (result) {
    const scrapedAt = Date.now();
    recordEntry(venueId, { result, timestamp: scrapedAt });
    return { ...readingAt(result, new Date()), scrapedAt };
  }

  // A failed on-demand check (e.g. Google rate-limiting this request, or
  // serving its limited view without the chart) shouldn't erase what was already
  // cached - fall back to serving that instead of "Unavailable".
  return latest;
}

// The most recent reading this venue has ever had, however old. Popular
// Times is a typical-week pattern, so even a weeks-old scrape still says
// how busy the venue usually is right now - far more useful than showing
// nothing whenever scraping can't run (e.g. Google serving signed-out
// visitors a limited view of Maps without the chart). `scrapedAt` lets the
// app say how old the pattern is instead of passing it off as fresh.
/**
 * Returns the most recent Popular Times reading for a venue, however old.
 * @param venueId - the venue's id
 * @param at - the moment to read the pattern for (defaults to now)
 * @returns the reading for that hour and the scrape time, or null if never scraped
 */
export function getLatestPopularTimes(
  venueId: string,
  at: Date = new Date()
): (CurrentReading & { scrapedAt: number }) | null {
  const cached = cache.get(venueId);
  if (!cached?.result) return null;
  return { ...readingAt(cached.result, at), scrapedAt: cached.timestamp };
}

export type ScrapeOutcome = "updated" | "failed" | "limitedView";

// When each venue was last tried in this run, successful or not - so a venue
// that keeps failing isn't picked again straight away just because its
// cached pattern is still the oldest.
const lastAttemptAt = new Map<string, number>();

function lastTouched(venueId: string): number {
  return Math.max(cache.get(venueId)?.timestamp ?? 0, lastAttemptAt.get(venueId) ?? 0);
}

// Venues whose pattern is at least PATTERN_MAX_AGE_MS old (or never
// scraped), stalest first.
/**
 * Picks the venues whose Popular Times pattern is at least a week old, stalest first.
 * @param venues - the venues to check
 * @returns the venues due for a scrape, oldest pattern first
 */
export function venuesDueForScrape<T extends { id: string }>(venues: T[]): T[] {
  const now = Date.now();
  return venues
    .filter((v) => now - lastTouched(v.id) >= PATTERN_MAX_AGE_MS)
    .sort((a, b) => lastTouched(a.id) - lastTouched(b.id));
}

// Scheduler path: scrapes one venue and records the result. The scheduler
// paces these calls - see popularTimesScheduler.ts.
//
// A failed attempt (null, or throwing) never erases an already-cached good
// result - one bad run (Google rate-limiting, a page layout hiccup) used to
// wipe every venue it touched to "Unavailable" even though a good pattern
// was sitting right there. Only a venue with no prior cache entry at all
// gets a null one recorded, so it at least resolves to "no data yet".
/**
 * Scrapes one venue's Popular Times from Google Maps and records the result.
 * @param venue - the venue's id and name
 * @returns "updated", "failed" (its last pattern is kept), or "limitedView" (Google is
 *  serving the signed-out view, so the session needs signing in again)
 */
export async function scrapeVenue(venue: { id: string; name: string }): Promise<ScrapeOutcome> {
  lastAttemptAt.set(venue.id, Date.now());
  try {
    const { result, limitedView } = await scrapePopularTimes(venue.name);
    if (limitedView) return "limitedView";
    if (result) {
      recordEntry(venue.id, { result, timestamp: Date.now() });
      return "updated";
    }
  } catch (err) {
    const message = errorMessage(err);
    console.error(`Popular Times: scrape failed for "${venue.name}" - ${message}`);
    if (/already running/i.test(message)) {
      console.error(
        "Popular Times: the Google profile is open in another Chrome window - quit that window so the scraper can use it."
      );
    }
  }
  if (!cache.has(venue.id)) recordEntry(venue.id, { result: null, timestamp: Date.now() });
  return "failed";
}
