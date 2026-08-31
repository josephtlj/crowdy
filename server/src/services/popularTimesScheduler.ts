import { fetchLtaCarparkVenues, isLikelyOpenNow } from "./carparks";
import { refreshAllPopularTimes } from "./popularTimes";

// A full sequential pass over ~38 venues takes ~10-15 minutes (each lookup
// drives a real headless browser, ~15-20s) - hourly leaves comfortable
// headroom between runs, and matches how Popular Times data is bucketed
// anyway (it doesn't change faster than per-hour). Skipping the window
// nothing is open cuts daily runs roughly in half.
const REFRESH_INTERVAL_MS = 60 * 60 * 1000;

let running = false;

async function runRefreshPass(): Promise<void> {
  if (running) {
    console.log("[popularTimesScheduler] Previous pass still running, skipping this tick.");
    return;
  }
  if (!isLikelyOpenNow()) {
    console.log("[popularTimesScheduler] Nothing likely open right now, skipping this pass.");
    return;
  }

  running = true;
  try {
    const carparkVenues = await fetchLtaCarparkVenues();
    const knownVenues = carparkVenues.map((v) => ({ id: v.id, name: v.name }));
    console.log(`[popularTimesScheduler] Starting batch refresh of ${knownVenues.length} venues...`);
    const { succeeded, failed } = await refreshAllPopularTimes(knownVenues);
    console.log(`[popularTimesScheduler] Batch refresh done: ${succeeded} succeeded, ${failed} failed.`);
  } catch (err) {
    console.error("[popularTimesScheduler] Batch refresh pass threw:", err);
  } finally {
    running = false;
  }
}

export function startPopularTimesScheduler(): void {
  // Fire once shortly after boot (not instantly - let the server finish
  // starting up first), then on the regular interval.
  setTimeout(runRefreshPass, 10_000);
  setInterval(runRefreshPass, REFRESH_INTERVAL_MS);
  console.log("[popularTimesScheduler] Scheduler started - refreshing hourly while venues are likely open.");
}
