// One-time validation pass: geocode every mall on Wikipedia's "List of
// shopping malls in Singapore" via OneMap's free search API, then run our
// proven Popular Times scraper against each to find out how many actually
// have real coverage. Not wired into the live app - this only measures
// feasibility and pre-warms the shared cache (by venue id = slugified name)
// for whichever malls end up added for real later.
import fs from "node:fs";
import path from "node:path";
import { refreshAllPopularTimes } from "../src/services/popularTimes";

const MALL_NAMES = [
  "313@somerset", "Alexandra Retail Centre", "Bugis Junction", "Bugis+", "Capitol Piazza",
  "Cathay Cineleisure Orchard", "The Centrepoint", "City Square Mall", "CityLink Mall",
  "Chinatown Point", "Clarke Quay Central", "Duo", "Far East Plaza", "Funan", "Great World",
  "HDB Hub", "Holland Village Shopping Mall", "ION Orchard", "Jelita Mall", "Junction 8",
  "Liat Towers", "Lucky Plaza", "Marina Bay Sands", "Marina Bay Link Mall", "Marina Square",
  "Millenia Walk", "Mustafa Centre", "Ngee Ann City", "Orchard Central", "Orchard Gateway",
  "Palais Renaissance", "The Paragon", "People's Park Centre", "People's Park Complex",
  "Plaza Singapura", "Raffles City", "Shaw House and Centre", "Sim Lim Square",
  "The South Beach", "Square 2", "Suntec City", "Tanjong Pagar Centre", "Tekka Centre",
  "Tiong Bahru Plaza", "Thomson Plaza", "Novena Square Shopping Mall", "VivoCity",
  "Wheelock Place", "Wisma Atria",
  "Bedok Mall", "Century Square", "Changi City Point", "Downtown East", "Eastpoint Mall",
  "Jewel Changi Airport", "Katong Shopping Centre", "Kallang Wave Mall", "Leisure Park Kallang",
  "i12 Katong", "Our Tampines Hub", "Parkway Parade", "Paya Lebar Quarter", "Paya Lebar Square",
  "SingPost Centre", "Tampines 1", "Tampines Mall", "White Sands", "Pasir Ris Mall",
  "AMK Hub", "Canberra Plaza", "Causeway Point", "Northpoint City", "Sembawang Shopping Centre",
  "Sun Plaza",
  "Compass One", "Heartland Mall", "Hougang Mall", "NEX", "Oasis Terraces", "Punggol Plaza",
  "Punggol Coast Mall", "The Seletar Mall", "Waterway Point", "Northshore Plaza I",
  "Northshore Plaza II", "Anchorvale Village", "Sengkang Grand Mall", "Hougang Village",
  "Bukit Panjang Plaza", "Dairy Farm Mall", "Fajar Shopping Centre", "Gek Poh Shopping Centre",
  "Greenridge Shopping Centre", "Hillion Mall", "IMM", "Jem", "Junction 10", "Jurong Point",
  "HillV2", "Le Quest", "Limbang Shopping Centre", "Lot 1", "Pioneer Mall", "Plantation Plaza",
  "Parc Point", "Queensway Shopping Centre", "The Clementi Mall", "The Rail Mall",
  "Teck Whye Shopping Centre", "The Star Vista", "West Coast Plaza", "Westgate", "West Mall",
  "Yew Tee Point",
];

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

interface Geocoded { name: string; id: string; lat: number; lng: number; address: string }
interface GeocodeFailure { name: string; reason: string }

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// OneMap's search endpoint rate-limits (429) well before its documented
// per-key quota if hit in a tight loop - confirmed by testing, not assumed.
// Retrying with backoff instead of treating a 429 as "no results" avoids
// mislabelling a rate-limited mall as unfindable.
async function geocode(name: string, attempt = 1): Promise<Geocoded | GeocodeFailure> {
  const url = `https://www.onemap.gov.sg/api/common/elastic/search?searchVal=${encodeURIComponent(name)}&returnGeom=Y&getAddrDetails=Y&pageNum=1`;
  try {
    const res = await fetch(url);
    const raw = await res.text();
    let data: { results?: { LATITUDE: string; LONGITUDE: string; ADDRESS: string }[] };
    try {
      data = JSON.parse(raw);
    } catch {
      if (attempt <= 4) {
        console.log(`  [geocode retry ${attempt}] ${name}: non-JSON response (likely rate-limited), backing off...`);
        await sleep(5000 * attempt);
        return geocode(name, attempt + 1);
      }
      return { name, reason: `non-JSON response after ${attempt} attempts: ${raw.slice(0, 100)}` };
    }
    if (!data.results || data.results.length === 0) {
      return { name, reason: "no OneMap results" };
    }
    const best = data.results[0];
    return {
      name,
      id: slugify(name),
      lat: parseFloat(best.LATITUDE),
      lng: parseFloat(best.LONGITUDE),
      address: best.ADDRESS,
    };
  } catch (err) {
    return { name, reason: `geocode error: ${err}` };
  }
}

async function main() {
  console.log(`Geocoding ${MALL_NAMES.length} malls via OneMap...`);
  const geocoded: Geocoded[] = [];
  const geocodeFailures: GeocodeFailure[] = [];

  for (const name of MALL_NAMES) {
    const result = await geocode(name);
    if ("reason" in result) {
      geocodeFailures.push(result);
      console.log(`  [geocode FAILED] ${name}: ${result.reason}`);
    } else {
      geocoded.push(result);
      console.log(`  [geocode ok] ${name} -> ${result.lat.toFixed(5)}, ${result.lng.toFixed(5)}`);
    }
    await sleep(1500);
  }

  console.log(
    `\nGeocoded ${geocoded.length}/${MALL_NAMES.length}. Starting Popular Times validation pass ` +
      `(~15-20s per venue, this will take a while)...\n`
  );

  const { succeeded, failed } = await refreshAllPopularTimes(
    geocoded.map((g) => ({ id: g.id, name: g.name }))
  );
  console.log(`\nPopular Times pass done: ${succeeded} returned data, ${failed} did not.`);

  const cacheFile = path.join(__dirname, "..", "data", "popular-times-cache.json");
  const cache = JSON.parse(fs.readFileSync(cacheFile, "utf-8")) as Record<
    string,
    { result: { crowdPercent: number; crowdLevel: string } | null }
  >;

  const withData: { name: string; status: string }[] = [];
  const withoutData: string[] = [];

  for (const g of geocoded) {
    const entry = cache[g.id];
    if (entry && entry.result) {
      withData.push({
        name: g.name,
        status: entry.result.crowdLevel === "Closed" ? "Closed right now (has data)" : `${entry.result.crowdPercent}% right now (has data)`,
      });
    } else {
      withoutData.push(g.name);
    }
  }

  const report = {
    generatedAt: new Date().toISOString(),
    totalCandidates: MALL_NAMES.length,
    geocodeFailures,
    popularTimesCoverage: withData,
    noPopularTimesData: withoutData,
  };

  const reportFile = path.join(__dirname, "..", "data", "mall-validation-report.json");
  fs.writeFileSync(reportFile, JSON.stringify(report, null, 2));

  console.log(`\n=== SUMMARY ===`);
  console.log(`Total candidate malls: ${MALL_NAMES.length}`);
  console.log(`Geocode failures: ${geocodeFailures.length}`);
  console.log(`Have Popular Times coverage: ${withData.length}`);
  console.log(`No Popular Times coverage: ${withoutData.length}`);
  console.log(`\nFull report written to: ${reportFile}`);
  process.exit(0);
}

main().catch((err) => {
  console.error("Validation script crashed:", err);
  process.exit(1);
});
