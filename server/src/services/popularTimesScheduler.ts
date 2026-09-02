import { MALLS } from "../data/malls";
import { getCachedPopularTimes, refreshAllPopularTimes } from "./popularTimes";

// Google's Popular Times is a historical/typical-day view, not a live-only
// one: a single scrape returns the venue's whole day's hourly pattern (every
// hour it's normally open, plus the closed hours) regardless of what time of
// day the scrape itself runs - checking VivoCity's page at 3am still shows
// its full 10am-10pm pattern. That means there's no "right" hour to run the
// batch at, and no need to gate it on whether anything's open right now -
// every venue's full day comes back either way, and "crowd level right now"
// is computed fresh from that cached pattern on every read (see
// currentReadingFromHourly in popularTimes.ts), not frozen at scrape time.
// So this can just run once every 24h, at whatever time it first fires.
const REFRESH_INTERVAL_MS = 24 * 60 * 60 * 1000;

// Slightly under 24h - the freshness check below uses this to decide which
// venues actually need re-scraping. Without it, every server restart (e.g.
// during dev, or the daily setInterval itself) would blindly re-scrape all
// 100 malls from scratch, even one restarted 5 minutes after the last full
// pass - a needless ~25-30 minute run every single time `npm run dev` starts.
const FRESH_ENOUGH_MS = 20 * 60 * 60 * 1000;

let running = false;

async function runRefreshPass(): Promise<void> {
  if (running) {
    console.log("[popularTimesScheduler] Previous pass still running, skipping this tick.");
    return;
  }

  const stale = MALLS.filter((m) => !getCachedPopularTimes(m.id, FRESH_ENOUGH_MS));
  if (stale.length === 0) {
    console.log("[popularTimesScheduler] All venues already fresh, nothing to refresh this tick.");
    return;
  }

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

export function startPopularTimesScheduler(): void {
  // Fire once shortly after boot (not instantly - let the server finish
  // starting up first), then once every 24h from then.
  setTimeout(runRefreshPass, 10_000);
  setInterval(runRefreshPass, REFRESH_INTERVAL_MS);
  console.log("[popularTimesScheduler] Scheduler started - refreshing once daily.");
}
