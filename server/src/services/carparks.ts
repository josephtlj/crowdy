import fs from "node:fs";
import path from "node:path";
import { Venue, CrowdLevel } from "../types/venue";

interface LtaCarparkRecord {
  CarParkID: string;
  Area: string;
  Development: string;
  Location: string; // "lat lng", space-separated - already WGS84, no reprojection needed
  AvailableLots: number;
  LotType: string;
  Agency: string;
}

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

// Available-lots-vs-historical-max is only a meaningful crowd proxy while
// the venue itself is actually open - a mall's carpark can still see real
// activity after closing (overnight parking, other tenants, nearby office
// use), which otherwise shows a misleading Low/Moderate crowd level for a
// venue that's actually shut. This is a single approximate default (most
// large Singapore malls run 10am-10pm daily), not verified per-venue hours -
// least accurate for the handful of non-mall attractions in this list
// (Sentosa, Resorts World, etc.), which can have different real hours.
const DEFAULT_OPEN_HOUR = 10;
const DEFAULT_CLOSE_HOUR = 22;

function isLikelyOpenNow(): boolean {
  const hour = new Date().getHours();
  return hour >= DEFAULT_OPEN_HOUR && hour < DEFAULT_CLOSE_HOUR;
}

// LTA gives no total-capacity figure for these carparks, so there's no
// official denominator to compute "% full" against. Instead we track the
// highest AvailableLots ever observed per carpark as a proxy for capacity -
// self-correcting the longer this history accumulates. Persisted to a JSON
// file (not just in-memory) so it survives server restarts - a plain object
// on disk is enough at this scale (39 carparks); revisit if this grows into
// something that needs concurrent writers or querying.
const HISTORY_FILE = path.join(__dirname, "..", "..", "data", "carpark-history.json");

function loadObservedMax(): Map<string, number> {
  try {
    const raw = fs.readFileSync(HISTORY_FILE, "utf-8");
    return new Map(Object.entries(JSON.parse(raw) as Record<string, number>));
  } catch {
    return new Map(); // no file yet on first run, or unreadable - start fresh
  }
}

function saveObservedMax(map: Map<string, number>): void {
  try {
    fs.mkdirSync(path.dirname(HISTORY_FILE), { recursive: true });
    fs.writeFileSync(HISTORY_FILE, JSON.stringify(Object.fromEntries(map), null, 2));
  } catch (err) {
    console.error("Failed to persist carpark history:", err);
  }
}

const observedMaxLots = loadObservedMax();

function estimateCrowd(carParkId: string, availableLots: number): { crowdPercent: number; crowdLevel: CrowdLevel } {
  const previousMax = observedMaxLots.get(carParkId) ?? availableLots;
  const newMax = Math.max(previousMax, availableLots);
  observedMaxLots.set(carParkId, newMax);

  const fractionFull = newMax > 0 ? 1 - availableLots / newMax : 0;
  const crowdPercent = Math.round(Math.max(0, Math.min(1, fractionFull)) * 100);

  let crowdLevel: CrowdLevel;
  if (crowdPercent < 34) crowdLevel = "Low";
  else if (crowdPercent < 60) crowdLevel = "Moderate";
  else if (crowdPercent < 80) crowdLevel = "High";
  else crowdLevel = "Very High";

  return { crowdPercent, crowdLevel };
}

export async function fetchLtaCarparkVenues(): Promise<Venue[]> {
  const accountKey = process.env.LTA_ACCOUNT_KEY;
  if (!accountKey) {
    throw new Error("LTA_ACCOUNT_KEY is not set - check server/.env");
  }

  const res = await fetch("https://datamall2.mytransport.sg/ltaodataservice/CarParkAvailabilityv2", {
    headers: { AccountKey: accountKey, accept: "application/json" },
  });
  if (!res.ok) {
    throw new Error(`LTA CarParkAvailabilityv2 failed: HTTP ${res.status}`);
  }

  const data = (await res.json()) as { value: LtaCarparkRecord[] };
  const now = new Date().toISOString();

  const open = isLikelyOpenNow();

  const venues = data.value
    .filter((r) => r.Agency === "LTA")
    .map((r) => {
      const [lat, lng] = r.Location.split(" ").map(Number);
      const estimate = estimateCrowd(r.CarParkID, r.AvailableLots);
      const venue: Venue = {
        id: `${slugify(r.Development)}-carpark`,
        name: r.Development,
        category: "Venue",
        address: `${r.Development}, ${r.Area} (carpark)`,
        lat,
        lng,
        crowdPercent: open ? estimate.crowdPercent : 0,
        crowdLevel: open ? estimate.crowdLevel : "Closed",
        source: "LTA",
        lastUpdated: now,
      };
      return venue;
    });

  saveObservedMax(observedMaxLots); // once per batch, not once per record
  return venues;
}
