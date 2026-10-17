import { MALLS } from "../data/malls";
import { getCachedPopularTimes, refreshAllPopularTimes, syncPopularTimesWithDb } from "./popularTimes";

// A single scrape returns a venue's whole typical week, and "crowd level
// right now" is recomputed from that pattern on every read - so one
// successful pass a day is plenty. But it has to run while malls are open:
// Google Maps hides the Popular Times chart on a closed venue's page
// (confirmed at 1am on VivoCity - no chart, no heading, nothing to wait
// for), so a night-time pass fails on every venue and only adds traffic.
//
// So the scheduler checks every hour and only scrapes inside SCRAPE_WINDOW,
// in Singapore time regardless of where the server runs. A backend started
// at night simply waits for the window; anything already fresh (see
// FRESH_ENOUGH_MS) is skipped, so the hourly checks cost nothing once the
// day's pass has run.
const CHECK_INTERVAL_MS = 60 * 60 * 1000;
const SCRAPE_WINDOW = { startHour: 11, endHour: 21 };

function isInScrapeWindow(): boolean {
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Singapore", hour: "2-digit", hour12: false }).format(new Date())
  );
  return hour >= SCRAPE_WINDOW.startHour && hour < SCRAPE_WINDOW.endHour;
}

// Slightly under 24h - the freshness check below uses this to decide which
// venues actually need re-scraping. Without it, every server restart (e.g.
// during dev, or the daily setInterval itself) would blindly re-scrape all
// 100 malls from scratch, even one restarted 5 minutes after the last full
// pass - a needless ~25-30 minute run every single time `npm run dev` starts.
const FRESH_ENOUGH_MS = 20 * 60 * 60 * 1000;

let running = false;
// Logged once per stretch outside the window rather than every hourly check.
let announcedWaiting = false;

async function runRefreshPass(): Promise<void> {
  if (running) return;

  if (!isInScrapeWindow()) {
    if (!announcedWaiting) {
      console.log(
        `[popularTimesScheduler] Outside scraping hours (${SCRAPE_WINDOW.startHour}:00-${SCRAPE_WINDOW.endHour}:00 SGT) - ` +
          "malls are closed and Google hides their Popular Times. Serving the last known patterns until then."
      );
      announcedWaiting = true;
    }
    return;
  }
  announcedWaiting = false;

  // Picks up anything a teammate's backend already scraped first, so this
  // pass skips those venues instead of scraping them all over again.
  await syncPopularTimesWithDb();

  const stale = MALLS.filter((m) => !getCachedPopularTimes(m.id, FRESH_ENOUGH_MS));
  if (stale.length === 0) return;

  running = true;
  try {
    console.log(
      `[popularTimesScheduler] Starting batch refresh of ${stale.length}/${MALLS.length} venues ` +
        `(${MALLS.length - stale.length} already fresh, skipped)...`
    );
    const { succeeded, failed } = await refreshAllPopularTimes(stale.map((m) => ({ id: m.id, name: m.name })));
    console.log(`[popularTimesScheduler] Batch refresh done: ${succeeded} succeeded, ${failed} failed.`);
  } catch (err) {
    console.error("[popularTimesScheduler] Batch refresh pass threw:", err);
  } finally {
    running = false;
  }
}

// Keeps venue readings current with what teammates scrape while this server
// is running, not only at startup. A full pull is about a megabyte, so every
// 15 minutes is cheap.
const DB_SYNC_INTERVAL_MS = 15 * 60 * 1000;

export function startPopularTimesScheduler(): void {
  void syncPopularTimesWithDb();
  setInterval(() => void syncPopularTimesWithDb(), DB_SYNC_INTERVAL_MS);

  // First check shortly after boot (letting the server finish starting up),
  // then hourly.
  setTimeout(runRefreshPass, 10_000);
  setInterval(runRefreshPass, CHECK_INTERVAL_MS);
  console.log("[popularTimesScheduler] Scheduler started - refreshing once daily, during mall hours.");
}
