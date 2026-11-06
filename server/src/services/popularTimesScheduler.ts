import readline from "node:readline/promises";
import { MALLS } from "../data/malls";
import { isScrapingEnabled } from "./googleProfile";
import { getLatestPopularTimes, scrapeVenue, syncPopularTimesWithDb, venuesDueForScrape } from "./popularTimes";

// A single scrape returns a venue's whole typical week, and "crowd level
// right now" is recomputed from that pattern on every read - so a mall only
// needs re-scraping about weekly (PATTERN_MAX_AGE_MS in popularTimes.ts).
//
// Scraping runs on one machine only: the backend whose .env has
// POPULAR_TIMES_SCRAPER=on and whose Google profile is signed in (npm run
// google-signin). Every other backend just syncs with the shared database.
//
// One due mall at a time, stalest first, moving straight on to the next mall
// once a page is done (a scrape itself takes about 10s, so all 104 take about
// 20 minutes). It runs at any hour: signed in, Google shows the chart even
// after a mall has closed (confirmed on VivoCity at 22:53). Any mall not
// reached yet keeps serving its last pattern, and a backend restarted partway
// carries on from the stalest.
//
// At start-up, if some malls were scraped less than a week ago, the terminal
// asks whether to scrape those again too. Malls older than a week are always
// scraped, with no question asked.
const CHECK_INTERVAL_MS = 60 * 60 * 1000;

let running = false;
// Logged once per stretch rather than on every hourly check.
let announcedUpToDate = false;

/**
 * Scrapes every mall that is due, one after another.
 * @param rescrapeAll - also scrape malls whose pattern is under a week old, once each
 */
async function runRefreshPass(rescrapeAll = false): Promise<void> {
  if (running) return;
  running = true;
  try {
    // Picks up anything already in the shared database first, so a mall
    // scraped elsewhere isn't scraped again.
    await syncPopularTimesWithDb();

    // A list fixed at the start, so each mall is scraped once even though
    // scraping it makes it "fresh" again.
    const queue = rescrapeAll ? venuesDueForScrape(MALLS, 0) : [];
    let scraped = 0;
    for (;;) {
      const due = queue.length > 0 ? queue : venuesDueForScrape(MALLS);
      if (due.length === 0) {
        if (!announcedUpToDate) {
          console.log("[popularTimesScheduler] Every mall's pattern is under a week old - nothing to scrape.");
          announcedUpToDate = true;
        }
        return;
      }
      announcedUpToDate = false;

      const mall = due === queue ? queue.shift()! : due[0];
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
          `(${scraped} this session, ${due === queue ? queue.length : due.length - 1} still due).`
      );
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

/**
 * Starts background Popular Times work: syncs with the shared database every 15 minutes
 * and, on the scraping backend, asks whether to rescrape recent malls, then refreshes
 * week-old patterns one venue after another.
 */
export function startPopularTimesScheduler(): void {
  void syncPopularTimesWithDb();
  setInterval(() => void syncPopularTimesWithDb(), DB_SYNC_INTERVAL_MS);

  if (!isScrapingEnabled()) {
    console.log(
      "[popularTimesScheduler] Scraping is off on this backend (it needs POPULAR_TIMES_SCRAPER=on and a " +
        "signed-in Google profile from npm run google-signin) - " +
        "using the shared Popular Times data."
    );
    return;
  }

  void startScraping();
}

/**
 * Asks a yes or no question in the terminal, until it gets "y", "yes", "n" or "no" in any case.
 * @param question - the question to print
 * @returns the answer, or null if there is no terminal to ask in
 */
async function askYesNo(question: string): Promise<boolean | null> {
  if (!process.stdin.isTTY) return null;
  // terminal: false leaves Ctrl+C to the terminal, so it still stops the server.
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: false });
  try {
    for (;;) {
      const answer = (await rl.question(question)).trim().toLowerCase();
      if (answer === "y" || answer === "yes") return true;
      if (answer === "n" || answer === "no") return false;
      console.log('Please type "yes" or "no".');
    }
  } finally {
    rl.close();
  }
}

/**
 * Loads the shared patterns, asks whether to rescrape recent ones, then starts the hourly passes.
 * @returns resolves once the first pass has started
 */
async function startScraping(): Promise<void> {
  await syncPopularTimesWithDb();
  const due = venuesDueForScrape(MALLS);
  const recent = MALLS.filter((m) => !due.includes(m));

  let rescrapeAll = false;
  if (recent.length > 0) {
    const scrapedTimes = recent.map((m) => getLatestPopularTimes(m.id)?.scrapedAt).filter((t): t is number => t !== undefined);
    const oldest = scrapedTimes.length > 0 ? new Date(Math.min(...scrapedTimes)) : null;
    const when = oldest
      ? ` (oldest on ${oldest.toLocaleString("en-SG", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })})`
      : "";
    const others = due.length > 0 ? ` The other ${due.length} are over a week old and will be scraped anyway.` : "";
    console.log(
      `\n[popularTimesScheduler] ${recent.length} of ${MALLS.length} malls were already scraped in the last week${when}.${others}`
    );
    const answer = await askYesNo(`Rescrape the ${recent.length} recent malls again? (yes/no): `);
    if (answer === null) {
      console.log("[popularTimesScheduler] No terminal to ask in, so recent malls are not rescraped.");
    }
    rescrapeAll = answer === true;
  }

  console.log(
    rescrapeAll
      ? `[popularTimesScheduler] Rescraping all ${MALLS.length} malls, one after another.`
      : "[popularTimesScheduler] Scheduler started - refreshing malls older than a week, one after another."
  );
  void runRefreshPass(rescrapeAll);
  setInterval(() => void runRefreshPass(), CHECK_INTERVAL_MS);
}
