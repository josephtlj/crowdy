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
const cache = new Map<string, { result: PopularTimesResult | null; timestamp: number }>();

let browserPromise: Promise<Browser> | null = null;
function getBrowser(): Promise<Browser> {
  if (!browserPromise) {
    browserPromise = puppeteerExtra.launch({ headless: true }) as Promise<Browser>;
  }
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
  return result;
}
