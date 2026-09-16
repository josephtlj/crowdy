const TRAIN_LINES = [
  "CCL",
  "CEL",
  "CGL",
  "DTL",
  "EWL",
  "NEL",
  "NSL",
  "BPL",
  "SLRT",
  "PLRT",
  "TEL",
];

interface LtaCrowdRecord {
  Station: string;
  StartTime: string;
  EndTime: string;
  CrowdLevel: "l" | "m" | "h" | "NA";
}

// One request per line - LTA's API is scoped per train line, not global.
// Interchange stations show up once per line they sit on; last write wins,
// which is fine since we only display one reading per physical station anyway.
export async function fetchStationCrowdLevels(): Promise<Map<string, LtaCrowdRecord>> {
  const accountKey = process.env.LTA_ACCOUNT_KEY;
  if (!accountKey) {
    throw new Error("LTA_ACCOUNT_KEY is not set - check server/.env");
  }

  const results = new Map<string, LtaCrowdRecord>();

  // Sequential, not Promise.all: firing all 11 lines at once triggers LTA's
  // rate limiting on concurrent bursts from a single AccountKey (observed
  // intermittent 500s under parallel load that didn't reproduce one-at-a-time).
  for (const line of TRAIN_LINES) {
    const res = await fetch(
      `https://datamall2.mytransport.sg/ltaodataservice/PCDRealTime?TrainLine=${line}`,
      { headers: { AccountKey: accountKey, accept: "application/json" } }
    );
    if (!res.ok) {
      console.error(`LTA PCDRealTime ${line} failed: HTTP ${res.status}`);
      continue;
    }
    const data = (await res.json()) as { value?: LtaCrowdRecord[] };
    for (const record of data.value ?? []) {
      results.set(record.Station, record);
    }
  }

  return results;
}

export function mapCrowdCode(
  code: LtaCrowdRecord["CrowdLevel"]
): { crowdLevel: "Low" | "Moderate" | "High"; crowdPercent: number } | null {
  switch (code) {
    case "l":
      return { crowdLevel: "Low", crowdPercent: 20 };
    case "m":
      return { crowdLevel: "Moderate", crowdPercent: 50 };
    case "h":
      return { crowdLevel: "High", crowdPercent: 80 };
    default:
      return null; // "NA" - LTA has no reading for this station right now
  }
}
