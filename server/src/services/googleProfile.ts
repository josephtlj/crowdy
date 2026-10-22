import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// Google Maps leaves Popular Times out for signed-out visitors (its "limited
// view"), so scraping runs in real Chrome on a profile signed in to a Google
// account. Only one backend needs this - the one with
// POPULAR_TIMES_SCRAPER=on and that signed-in profile (npm run
// google-signin) - and every other backend works from the shared database.
// Requiring the profile as well means the team can share one .env: a
// machine without the profile never scrapes. Read lazily, since index.ts
// loads .env at startup.

export function isScrapingEnabled(): boolean {
  return process.env.POPULAR_TIMES_SCRAPER === "on" && fs.existsSync(googleProfileDir());
}

// Holds the signed-in session - outside the repo on purpose, so it can never
// be committed. Anyone with this folder can use that Google account.
export function googleProfileDir(): string {
  return process.env.GOOGLE_PROFILE_DIR || path.join(os.homedir(), ".crowdy", "google-profile");
}

export function chromePath(): string {
  return process.env.CHROME_PATH || "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
}
