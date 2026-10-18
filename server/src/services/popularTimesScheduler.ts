import { MALLS } from "../data/malls";
import { isScrapingEnabled } from "./googleProfile";
import { scrapeVenue, syncPopularTimesWithDb, venuesDueForScrape } from "./popularTimes";

// A single scrape returns a venue's whole typical week, and "crowd level
// right now" is recomputed from that pattern on every read - so a mall only
// needs re-scraping about weekly (PATTERN_MAX_AGE_MS in popularTimes.ts).
//
// Scraping runs on one machine only: the backend whose .env has
// POPULAR_TIMES_SCRAPER=on and whose Google profile is signed in (npm run
// google-signin). Every other backend just syncs with the shared database.
//
// It's paced rather than batched - one due mall at a time, stalest first,
// with a gap of PAGE_GAP_MS between pages, so all 104 take about two hours
// rather than a burst of 104 pages in half an hour, the kind of pattern
// most likely to get the signed-in account challenged. It runs at any hour:
// signed in, Google shows the chart even after a mall has closed (confirmed
// on VivoCity at 22:53). Any mall not reached yet keeps serving its last
// pattern, and a backend restarted partway carries on from the stalest.
const CHECK_INTERVAL_MS = 60 * 60 * 1000;
const PAGE_GAP_MS = { min: 45 * 1000, jitter: 15 * 1000 };

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

let running = false;
// Logged once per stretch rather than on every hourly check.
let announcedUpToDate = false;

async function runRefreshPass(): Promise<void> {
  if (running) return;
  running = true;
  try {
    // Picks up anything already in the shared database first, so a mall
    // scraped elsewhere isn't scraped again.
    await syncPopularTimesWithDb();

    let scraped = 0;
    for (;;) {
      const due = venuesDueForScrape(MALLS);
      if (due.length === 0) {
        if (!announcedUpToDate) {
          console.log("[popularTimesScheduler] Every mall's pattern is under a week old - nothing to scrape.");
          announcedUpToDate = true;
        }
        return;
      }
      announcedUpToDate = false;

      const mall = due[0];
      const outcome = await scrapeVenue(mall);
      scraped++;

      if (outcome === "limitedView") {
        console.log(
          "[popularTimesScheduler] Google served the signed-out limited view, so the Google session has likely expired. " +
            "Stop the backend, run `npm run google-signin`, sign in again, then restart. Trying again next hour."
        );
        return;
      }
      console.log(
        `[popularTimesScheduler] ${mall.name}: ${outcome === "updated" ? "updated" : "failed, keeping its last pattern"} ` +
          `(${scraped} this session, ${due.length - 1} still due).`
      );

      await sleep(PAGE_GAP_MS.min + Math.random() * PAGE_GAP_MS.jitter);
    }
  } catch (err) {
    console.error("[popularTimesScheduler] Refresh pass threw:", err);
  } finally {
    running = false;
  }
}

// Keeps venue readings current with what the scraping backend uploads while
// this server is running, not only at startup. A full pull is about a
// megabyte, so every 15 minutes is cheap.
const DB_SYNC_INTERVAL_MS = 15 * 60 * 1000;

export function startPopularTimesScheduler(): void {
  void syncPopularTimesWithDb();
  setInterval(() => void syncPopularTimesWithDb(), DB_SYNC_INTERVAL_MS);

  if (!isScrapingEnabled()) {
    console.log(
      "[popularTimesScheduler] Scraping is off on this backend (POPULAR_TIMES_SCRAPER isn't \"on\") - " +
        "using the shared Popular Times data."
    );
    return;
  }

  // First check shortly after boot (letting the server finish starting up),
  // then hourly.
  setTimeout(runRefreshPass, 10_000);
  setInterval(runRefreshPass, CHECK_INTERVAL_MS);
  console.log("[popularTimesScheduler] Scheduler started - refreshing malls older than a week, one at a time.");
}
