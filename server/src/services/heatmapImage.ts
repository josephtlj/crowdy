import { Venue } from "../types/venue";
import { getBrowser } from "./popularTimes";
import { HEATMAP_BOUNDS } from "./heatmap";

// Canvas resolution for the generated overlay image - wide enough to look
// smooth zoomed into a single region without generating a needlessly huge
// PNG for something regenerated periodically and refetched by every client.
const IMAGE_WIDTH = 1000;
const PIXELS_PER_DEGREE = IMAGE_WIDTH / (HEATMAP_BOUNDS.east - HEATMAP_BOUNDS.west);
const IMAGE_HEIGHT = Math.round(PIXELS_PER_DEGREE * (HEATMAP_BOUNDS.north - HEATMAP_BOUNDS.south));

// Mean metres per degree near Singapore's latitude (~1.3°N) - lat and lng
// degrees are close enough in length this near the equator that one shared
// constant for both keeps blobs circular instead of stretched, the same
// simplification haversineKm's own callers already lean on elsewhere.
const METERS_PER_DEGREE = 110_936;
const PIXELS_PER_METER = PIXELS_PER_DEGREE / METERS_PER_DEGREE;

// Same crowd-level colour scale as CrowdBadge.tsx (app/src/components/CrowdBadge.tsx)
// and the same thresholds as mapCrowdLevel() in popularTimes.ts - kept in
// sync by hand, same as the Venue type is between server and app. Stops at
// the exact band boundaries, so a blob's colour lines up with what the
// badge would show at that same percent, with a smooth blend in between
// instead of four hard-edged bands.
const COLOR_STOPS: { pct: number; hex: string }[] = [
  { pct: 0, hex: "#2E7D32" }, // Low
  { pct: 34, hex: "#F9A825" }, // Moderate
  { pct: 60, hex: "#EF6C00" }, // High
  { pct: 80, hex: "#C62828" }, // Very High
  { pct: 100, hex: "#C62828" },
];

function hexToRgb(hex: string): [number, number, number] {
  return [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
}

function colorForPercent(pct: number): [number, number, number] {
  const clamped = Math.max(0, Math.min(100, pct));
  for (let i = 0; i < COLOR_STOPS.length - 1; i++) {
    const a = COLOR_STOPS[i];
    const b = COLOR_STOPS[i + 1];
    if (clamped >= a.pct && clamped <= b.pct) {
      const t = b.pct === a.pct ? 0 : (clamped - a.pct) / (b.pct - a.pct);
      const [ar, ag, ab] = hexToRgb(a.hex);
      const [br, bg, bb] = hexToRgb(b.hex);
      return [Math.round(ar + (br - ar) * t), Math.round(ag + (bg - ag) * t), Math.round(ab + (bb - ab) * t)];
    }
  }
  return hexToRgb(COLOR_STOPS[COLOR_STOPS.length - 1].hex);
}

interface HeatPoint {
  x: number;
  y: number;
  radiusPx: number;
  rgb: [number, number, number];
}

// A closed (or not-yet-scraped) venue has no real crowd reading right now -
// same reasoning as the client-side filter this replaces (VenueMap.native.tsx):
// showing a blob for it would read as "some data, just quiet" when the
// honest answer is "no signal," same as anywhere else with no venue nearby.
function projectVenues(venues: Venue[]): HeatPoint[] {
  return venues
    .filter(
      (v) => v.category === "Venue" && v.heatmapRadiusM && v.crowdLevel !== "Closed" && v.crowdLevel !== "Unavailable"
    )
    .map((v) => ({
      x: (v.lng - HEATMAP_BOUNDS.west) * PIXELS_PER_DEGREE,
      y: (HEATMAP_BOUNDS.north - v.lat) * PIXELS_PER_DEGREE, // canvas y grows downward, north is up
      radiusPx: (v.heatmapRadiusM as number) * PIXELS_PER_METER,
      rgb: colorForPercent(v.crowdPercent),
    }));
}

// Renders the whole overlay as one blurred, colour-graded PNG instead of
// ~100 separate <Circle> markers on the live map - react-native-maps
// Circles have no gradient fill at all, so overlapping ones stacked as
// hard-edged discs rather than blending. A soft radial gradient per venue,
// composited onto one canvas, blends naturally wherever venues sit close
// together - the same visual effect a real heatmap library (e.g.
// Leaflet.heat, built on simpleheat) achieves. Each venue already carries
// its own meaningful colour (its crowd level), unlike a density heatmap
// where colour represents how many anonymous points overlap - so this
// skips simpleheat's monochrome-accumulate-then-recolour step and draws
// each blob in its own colour directly, which is simpler and gives the
// same soft-edged blending result for this use case.
//
// Runs inside the same headless Chromium already kept alive for Popular
// Times scraping (see getBrowser in popularTimes.ts) rather than launching
// a second browser, or adding a native canvas dependency (node-canvas,
// which needs a compiled cairo build) just for this one image.
export async function generateHeatmapPng(venues: Venue[]): Promise<Buffer> {
  const points = projectVenues(venues);
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.setContent("<!DOCTYPE html><html><body></body></html>");
    const dataUrl = await page.evaluate(
      (width: number, height: number, points: HeatPoint[], baseFill: string) => {
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;

        // Faint neutral wash over the whole map first - areas with no
        // venue nearby read as "no signal" rather than bare map, same as
        // the flat grey base circle this replaces.
        ctx.fillStyle = baseFill;
        ctx.fillRect(0, 0, width, height);

        for (const p of points) {
          const [r, g, b] = p.rgb;
          const gradient = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.radiusPx);
          gradient.addColorStop(0, `rgba(${r},${g},${b},0.55)`);
          gradient.addColorStop(1, `rgba(${r},${g},${b},0)`);
          ctx.fillStyle = gradient;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.radiusPx, 0, Math.PI * 2);
          ctx.fill();
        }

        return canvas.toDataURL("image/png");
      },
      IMAGE_WIDTH,
      IMAGE_HEIGHT,
      points,
      "rgba(120,120,120,0.12)"
    );
    return Buffer.from(dataUrl.split(",")[1], "base64");
  } finally {
    await page.close();
  }
}

// Crowd data itself only changes roughly daily (the Popular Times batch)
// plus the occasional on-demand single-venue check - regenerating this
// image on every request would mean spinning up a Chromium page for every
// client fetch for no real benefit. A few minutes of staleness is a
// non-issue against data that's already hours old by the time it's cached.
const CACHE_TTL_MS = 5 * 60 * 1000;
let cached: { buffer: Buffer; timestamp: number } | null = null;

export async function getHeatmapPng(venues: Venue[]): Promise<Buffer> {
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) return cached.buffer;
  const buffer = await generateHeatmapPng(venues);
  cached = { buffer, timestamp: Date.now() };
  return buffer;
}
