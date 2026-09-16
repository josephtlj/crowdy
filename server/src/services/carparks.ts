interface LtaCarparkRecord {
  CarParkID: string;
  Area: string;
  Development: string;
  Location: string; // "lat lng", space-separated - already WGS84, no reprojection needed
  AvailableLots: number;
  LotType: string;
  Agency: string;
}

// Hilton Orchard and Concorde Hotel are hotels, not malls - LTA just
// happens to manage their carparks. Clarke Quay's own carpark is under
// "CQ @ Clarke Quay"; the venue itself has no Popular Times coverage, so
// there's no point carrying it even as a bonus stat.
const EXCLUDED_DEVELOPMENTS = new Set(["Hilton Orchard", "Concorde Hotel", "CQ @ Clarke Quay"]);

// Popular Times is the sole source of crowd data now (see venues.ts) - this
// raw feed only feeds the Detail screen's bonus "parking availability"
// stat for whichever malls happen to have LTA carpark coverage, matched by
// coordinate proximity in malls.ts. Never used to derive crowdPercent or
// crowdLevel for anything.
export async function fetchLtaCarparkRecords(): Promise<LtaCarparkRecord[]> {
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
  return data.value.filter((r) => r.Agency === "LTA" && !EXCLUDED_DEVELOPMENTS.has(r.Development));
}
