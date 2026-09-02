// One-time build step: geocode every mall confirmed (via
// validate-mall-list.ts) to have real Popular Times coverage, plus a couple
// of manually-added ones, cross-match against the live LTA carpark feed by
// coordinate proximity (so a mall that also has an LTA carpark keeps that as
// a bonus stat instead of becoming a duplicate pin), and emit the static
// data file consumed by the app. Not run automatically - re-run by hand if
// the mall list changes.
import fs from "node:fs";
import path from "node:path";

// The 94 names validate-mall-list.ts confirmed have real Popular Times data,
// using their exact Wikipedia names (OneMap resolved these fine as-is).
const CONFIRMED_94 = JSON.parse(
  fs.readFileSync(path.join(__dirname, "confirmed-94.json"), "utf-8")
) as string[];

// The 5 that failed OneMap's exact-name search, plus the search query that
// actually resolves them (found by hand, see conversation) - kept separate
// from their Wikipedia display name since the two can differ.
const FIXED_GEOCODE: { displayName: string; query: string }[] = [
  { displayName: "Clarke Quay Central", query: "The Central" },
  { displayName: "Holland Village Shopping Mall", query: "Holland Village" },
  { displayName: "Shaw House and Centre", query: "Shaw House" },
  { displayName: "Novena Square Shopping Mall", query: "Novena Square" },
  { displayName: "i12 Katong", query: "112 Katong" },
];

const EXTRA: { displayName: string; query: string }[] = [
  { displayName: "NTU North Spine Plaza", query: "Nanyang Technological University North Spine" },
];

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface GeoResult { lat: number; lng: number; address: string }

async function geocode(query: string, attempt = 1): Promise<GeoResult | null> {
  const url = `https://www.onemap.gov.sg/api/common/elastic/search?searchVal=${encodeURIComponent(query)}&returnGeom=Y&getAddrDetails=Y&pageNum=1`;
  const res = await fetch(url);
  const raw = await res.text();
  let data: { results?: { LATITUDE: string; LONGITUDE: string; ADDRESS: string }[] };
  try {
    data = JSON.parse(raw);
  } catch {
    if (attempt <= 4) {
      await sleep(5000 * attempt);
      return geocode(query, attempt + 1);
    }
    return null;
  }
  const best = data.results?.[0];
  if (!best) return null;
  return { lat: parseFloat(best.LATITUDE), lng: parseFloat(best.LONGITUDE), address: best.ADDRESS };
}

// Haversine, same formula as app/server distance.ts - duplicated here since
// this script runs standalone and isn't worth wiring into src/ for a
// one-off build step.
function distanceMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

interface LtaCarparkRecord {
  CarParkID: string;
  Development: string;
  Location: string;
  AvailableLots: number;
  Agency: string;
}

// Same exclusions as carparks.ts (Hilton Orchard and Concorde Hotel are
// hotels, CQ @ Clarke Quay isn't Clarke Quay Central's own carpark) -
// without this, an excluded record can still leak back in as a "bonus"
// stat on whichever nearby mall happens to be its nearest neighbour, which
// defeats the exclusion.
const EXCLUDED_DEVELOPMENTS = new Set(["Hilton Orchard", "Concorde Hotel", "CQ @ Clarke Quay"]);

async function fetchLtaCarparks(): Promise<LtaCarparkRecord[]> {
  const accountKey = process.env.LTA_ACCOUNT_KEY;
  const res = await fetch("https://datamall2.mytransport.sg/ltaodataservice/CarParkAvailabilityv2", {
    headers: { AccountKey: accountKey ?? "", accept: "application/json" },
  });
  const data = (await res.json()) as { value: LtaCarparkRecord[] };
  return data.value.filter((r) => r.Agency === "LTA" && !EXCLUDED_DEVELOPMENTS.has(r.Development));
}

// Within this radius, an LTA carpark record is treated as belonging to the
// same physical mall rather than a coincidentally-nearby different building.
// Tight on purpose: Orchard Road alone packs ION Orchard, Wisma Atria,
// Wheelock Place and Tang Plaza within ~150m of each other, so a loose
// radius (200m was tried first) matches the same carpark to several
// different malls at once - each carpark is instead assigned to its single
// *nearest* mall (see matching loop below), with this radius as a cutoff
// so a carpark with no real nearby mall doesn't get force-matched anyway.
const MATCH_RADIUS_M = 120;

async function main() {
  process.loadEnvFile(path.join(__dirname, "..", ".env"));

  const allEntries = [
    ...CONFIRMED_94.map((name) => ({ displayName: name, query: name })),
    ...FIXED_GEOCODE,
    ...EXTRA,
  ];

  console.log(`Geocoding ${allEntries.length} malls...`);
  const geocoded: { id: string; name: string; lat: number; lng: number; address: string }[] = [];
  const failed: string[] = [];

  for (const entry of allEntries) {
    const result = await geocode(entry.query);
    if (!result) {
      failed.push(entry.displayName);
      console.log(`  [FAILED] ${entry.displayName}`);
    } else {
      geocoded.push({ id: slugify(entry.displayName), name: entry.displayName, ...result });
      console.log(`  [ok] ${entry.displayName} -> ${result.lat.toFixed(5)}, ${result.lng.toFixed(5)}`);
    }
    await sleep(1500);
  }

  console.log(`\nGeocoded ${geocoded.length}/${allEntries.length}. Cross-matching against live LTA carpark feed...`);
  const carparks = await fetchLtaCarparks();

  // Each carpark record goes to its single nearest mall (not every mall
  // within radius) - otherwise the same physical carpark ends up "claimed"
  // as a bonus stat by several different malls in dense areas.
  const carparksByMall = new Map<string, LtaCarparkRecord[]>();
  for (const r of carparks) {
    const [rLat, rLng] = r.Location.split(" ").map(Number);
    let nearestMall: (typeof geocoded)[number] | null = null;
    let nearestDist = Infinity;
    for (const mall of geocoded) {
      const d = distanceMeters(mall.lat, mall.lng, rLat, rLng);
      if (d < nearestDist) {
        nearestDist = d;
        nearestMall = mall;
      }
    }
    if (nearestMall && nearestDist <= MATCH_RADIUS_M) {
      const list = carparksByMall.get(nearestMall.id) ?? [];
      list.push(r);
      carparksByMall.set(nearestMall.id, list);
    }
  }

  const withBonus = geocoded.map((mall) => {
    const matched = carparksByMall.get(mall.id) ?? [];
    if (matched.length > 0) {
      console.log(`  [carpark match] ${mall.name} <- ${matched.map((r) => r.Development).join(", ")}`);
    }
    return {
      ...mall,
      carparkDevelopments: matched.map((r) => r.Development),
    };
  });

  const outFile = path.join(__dirname, "..", "src", "data", "malls.ts");
  const body = withBonus
    .map(
      (m) =>
        `  { id: ${JSON.stringify(m.id)}, name: ${JSON.stringify(m.name)}, address: ${JSON.stringify(m.address)}, lat: ${m.lat}, lng: ${m.lng}${
          m.carparkDevelopments.length > 0
            ? `, carparkDevelopments: ${JSON.stringify(m.carparkDevelopments)}`
            : ""
        } },`
    )
    .join("\n");

  const fileContent = `// Generated by scripts/build-mall-list.ts - do not hand-edit the entries,
// re-run the script instead. Each mall was validated to have real Google
// Popular Times coverage before being added here (see the conversation /
// mall-validation-report.json for the methodology). Coordinates come from
// OneMap's free search API. carparkDevelopments, where present, names the
// matching live LTA carpark Development record(s) (matched by proximity,
// not by name) so the app can attach raw available-lot counts as a bonus
// stat without duplicating the venue as a second pin.
export interface MallEntry {
  id: string;
  name: string;
  address: string;
  lat: number;
  lng: number;
  carparkDevelopments?: string[];
}

export const MALLS: MallEntry[] = [
${body}
];
`;

  fs.writeFileSync(outFile, fileContent);
  console.log(`\nWrote ${withBonus.length} malls to ${outFile}`);
  console.log(`Geocode failures: ${failed.length}${failed.length ? " - " + failed.join(", ") : ""}`);
  console.log(`Malls with an LTA carpark match: ${withBonus.filter((m) => m.carparkDevelopments.length > 0).length}`);
  process.exit(0);
}

main().catch((err) => {
  console.error("Build script crashed:", err);
  process.exit(1);
});
