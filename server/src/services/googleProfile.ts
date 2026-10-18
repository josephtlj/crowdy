import os from "node:os";
import path from "node:path";

// Google Maps leaves Popular Times out for signed-out visitors (its "limited
// view"), so scraping runs in real Chrome on a profile signed in to a Google
// account. Only one backend needs this - the one with
// POPULAR_TIMES_SCRAPER=on - and every other backend works from the shared
// database. Read lazily, since index.ts loads .env at startup.

export function isScrapingEnabled(): boolean {
  return process.env.POPULAR_TIMES_SCRAPER === "on";
}

// Holds the signed-in session - outside the repo on purpose, so it can never
// be committed. Anyone with this folder can use that Google account.
export function googleProfileDir(): string {
  return process.env.GOOGLE_PROFILE_DIR || path.join(os.homedir(), ".crowdy", "google-profile");
}

export function chromePath(): string {
  return process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
}
