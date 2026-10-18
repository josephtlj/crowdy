// Opens the scraper's Chrome profile in an ordinary Chrome window so you can
// sign in to the Google account Popular Times scraping uses (or sign in again
// once the session expires). Run it with the backend stopped - the scraper
// and this window can't use the profile at the same time.
//
// Usage: npm run google-signin
import { spawn } from "node:child_process";
import fs from "node:fs";
import { chromePath, googleProfileDir } from "../src/services/googleProfile";

try {
  process.loadEnvFile();
} catch {
  // No .env - the defaults in googleProfile.ts apply.
}

const profileDir = googleProfileDir();
fs.mkdirSync(profileDir, { recursive: true });

const chrome = spawn(
  chromePath(),
  [`--user-data-dir=${profileDir}`, "--no-first-run", "https://accounts.google.com/ServiceLogin?continue=https://www.google.com/maps"],
  { detached: true, stdio: "ignore" }
);
chrome.unref();

console.log(`Opened Chrome on the scraper's profile (${profileDir}).`);
console.log("1. Sign in to the Google account, and keep the account in this Chrome profile when asked (sync isn't needed).");
console.log("2. Check that a mall's Google Maps page shows Popular Times.");
console.log("3. Quit that Chrome window (Cmd+Q), then start the backend.");
