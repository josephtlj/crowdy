import fs from "node:fs";
import path from "node:path";
import puppeteerExtra from "puppeteer-extra";
import StealthPlugin from "puppeteer-extra-plugin-stealth";
import type { Browser } from "puppeteer";
import { CrowdLevel } from "../types/venue";

puppeteerExtra.use(StealthPlugin());

export interface PopularTimesResult {
  crowdPercent: number;
  crowdLevel: CrowdLevel;
  // Today's full hourly pattern (venue-closed hours are simply absent) -
  // not used yet, kept for a future mini-graph on the Detail screen.
  hourly: { hour: number; percent: number }[];
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
// degrades to `null` rather than throwing, letting the caller fall back to
// the carpark-based estimate instead.
const CACHE_TTL_MS = 4 * 60 * 60 * 1000; // typical patterns barely move hour to hour

// Persisted to disk (same pattern as carpark-history.json) so a server
// restart doesn't wipe every venue back to "never checked" - without this,
// the bulk list would have zero Popular Times data until the scheduler's
// next full pass completes, which could be up to an hour away.
const CACHE_FILE = path.join(__dirname, "..", "..", "data", "popular-times-cache.json");

function loadCache(): Map<string, CacheEntry> {
  try {
    const raw = fs.readFileSync(CACHE_FILE, "utf-8");
    return new Map(Object.entries(JSON.parse(raw) as Record<string, CacheEntry>));
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
// through ~18 hours including sleep/wake), and there was previously no way
// to recover from that short of restarting the whole server. Re-checking
// `.connected` and relaunching on demand fixes that without needing a
// restart.
let browserPromise: Promise<Browser> | null = null;
async function getBrowser(): Promise<Browser> {
  if (browserPromise) {
    const existing = await browserPromise;
    if (existing.connected) return existing;
    console.error("[popularTimes] Cached browser disconnected (likely a sleep/wake drop) - relaunching.");
    browserPromise = null;
  }
  browserPromise = puppeteerExtra.launch({ headless: true }) as Promise<Browser>;
  return browserPromise;
}

function mapCrowdLevel(percent: number): CrowdLevel {
  if (percent < 34) return "Low";
  if (percent < 60) return "Moderate";
  if (percent < 80) return "High";
  return "Very High";
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

    let found = false;
    for (let i = 0; i < 25; i++) {
      const text = await page.evaluate(() => document.body.innerText);
      if (text.includes("Popular times")) {
        found = true;
        break;
      }
      await page.mouse.wheel({ deltaY: 700 });
      await sleep(600 + Math.random() * 300);
    }
    if (!found) {
      console.error("[popularTimes DEBUG] 'Popular times' text never found. Page URL:", page.url());
      const bodyPreview = await page.evaluate(() => document.body.innerText.slice(0, 500));
      console.error("[popularTimes DEBUG] body preview:", bodyPreview);
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

    // The extraction doesn't explicitly label which day each block belongs
    // to - the UI defaults to today, and hours only ever increase within a
    // single day's block, so the first repeated hour marks the start of the
    // next day's data.
    const today: { hour: number; percent: number }[] = [];
    const seenHours = new Set<number>();
    for (const entry of parsed) {
      if (seenHours.has(entry.hour)) break;
      seenHours.add(entry.hour);
      today.push(entry);
    }

    const currentHour = new Date().getHours();
    const currentEntry = today.find((e) => e.hour === currentHour);
    if (!currentEntry) return null; // venue likely closed right now - no data for this hour

    return {
      crowdPercent: currentEntry.percent,
      crowdLevel: mapCrowdLevel(currentEntry.percent),
      hourly: today,
    };
  } finally {
    await page.close();
  }
}

// On-demand path: used by the DetailScreen "Check crowd now" button. Forces
// a fresh scrape on a cache miss, so it can take the full ~15-20s - fine for
// a single explicit user action, not fine for anything called in bulk.
export async function getPopularTimes(venueId: string, venueName: string): Promise<PopularTimesResult | null> {
  const cached = cache.get(venueId);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.result;
  }

  const result = await scrapePopularTimes(venueName).catch((err) => {
    console.error(`Popular Times scrape failed for "${venueName}":`, err);
    return null;
  });

  cache.set(venueId, { result, timestamp: Date.now() });
  saveCache(cache);
  return result;
}

// Bulk-list path: only ever reads whatever the scheduler has already cached
// - never triggers a scrape itself, so a bulk /venues request stays fast
// regardless of cache state. `maxAgeMs` is intentionally separate from (and
// looser than) CACHE_TTL_MS, since this is read far more often than the
// scheduler refreshes.
export function getCachedPopularTimes(venueId: string, maxAgeMs: number): PopularTimesResult | null {
  const cached = cache.get(venueId);
  if (!cached || Date.now() - cached.timestamp >= maxAgeMs) return null;
  return cached.result;
}

// Scheduler path: sequentially refreshes a whole list of known venues,
// reusing the same shared browser instance a page at a time. Logs and moves
// on per-venue failure rather than aborting the whole batch over one bad
// name (e.g. an ambiguous name resolving to the wrong page).
export async function refreshAllPopularTimes(
  venues: { id: string; name: string }[]
): Promise<{ succeeded: number; failed: number }> {
  let succeeded = 0;
  let failed = 0;

  for (const venue of venues) {
    try {
      const result = await scrapePopularTimes(venue.name);
      cache.set(venue.id, { result, timestamp: Date.now() });
      if (result) succeeded++;
      else failed++;
    } catch (err) {
      console.error(`[popularTimes] Batch refresh failed for "${venue.name}":`, err);
      cache.set(venue.id, { result: null, timestamp: Date.now() });
      failed++;
    }
  }

  saveCache(cache);
  return { succeeded, failed };
}
