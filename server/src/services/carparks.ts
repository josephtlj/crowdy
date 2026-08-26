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

// A handful of "Development" names in the LTA feed are attractions/venues,
// not shopping malls - the rest really are malls despite the API's blanket
// "carpark data" framing.
const ATTRACTION_NAMES = new Set([
  "Sentosa",
  "Resorts World",
  "Singapore Flyer",
  "National Gallery",
  "Esplanade",
]);

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

// LTA gives no total-capacity figure for these carparks, so there's no
// official denominator to compute "% full" against. Instead we track the
// highest AvailableLots ever observed per carpark (in-memory, since this
// process started) as a proxy for capacity - self-correcting the longer the
// server runs, but inaccurate/flat at 0% right after a restart until enough
// variation has been seen. This is an approximation, not official data.
const observedMaxLots = new Map<string, number>();

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

  return data.value
    .filter((r) => r.Agency === "LTA")
    .map((r) => {
      const [lat, lng] = r.Location.split(" ").map(Number);
      const { crowdPercent, crowdLevel } = estimateCrowd(r.CarParkID, r.AvailableLots);
      const venue: Venue = {
        id: `${slugify(r.Development)}-carpark`,
        name: r.Development,
        category: ATTRACTION_NAMES.has(r.Development) ? "Attraction" : "Mall",
        address: `${r.Development}, ${r.Area} (carpark)`,
        lat,
        lng,
        crowdPercent,
        crowdLevel,
        source: "LTA",
        lastUpdated: now,
      };
      return venue;
    });
}
