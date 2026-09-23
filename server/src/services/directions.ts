import { LatLng, Route, RouteSegment, RouteStep, StepMode, TravelMode } from "../types/directions";
import { Venue } from "../types/venue";
import { decodePolyline } from "./polyline";
import { oneMapGet } from "./onemap";
import { haversineKm } from "./distance";

const ROUTE_URL = "https://www.onemap.gov.sg/api/public/routingsvc/route";

// OneMap names the walking/driving/cycling profiles directly, but calls
// public transport "pt" - mapped here so the rest of the codebase can use
// the plainer "transit" everywhere.
const ONEMAP_ROUTE_TYPE: Record<TravelMode, string> = {
  walk: "walk",
  drive: "drive",
  cycle: "cycle",
  transit: "pt",
};

// Official MRT/LRT line colours, keyed by the line code OneMap reports.
// Used to colour both the route line on the map and the step rows, so a
// journey reads the way the network map does rather than as anonymous
// segments.
const LINE_COLORS: Record<string, string> = {
  NS: "#D42E12",
  EW: "#009645",
  CG: "#009645",
  NE: "#9900AA",
  CC: "#FA9E0D",
  CE: "#FA9E0D",
  DT: "#005EC4",
  TE: "#9D5B25",
  JR: "#0099AA",
  CR: "#97C616",
  BP: "#748477",
  SK: "#748477",
  PG: "#748477",
};

const BUS_COLOR = "#2E7D32";
const WALK_COLOR = "#7A7A7A";
const DRIVE_COLOR = "#2F6FED";
const CYCLE_COLOR = "#00897B";

// A station name from OneMap is matched to one of our own tracked venues by
// proximity, not by name - OneMap's naming ("ORCHARD MRT STATION") and ours
// ("Orchard MRT") differ in case, suffix and punctuation, while a station's
// coordinates are unambiguous. 400m is wide enough to absorb the difference
// between OneMap's entrance-level stop point and our footprint centroid,
// while staying well inside the gap to the next station.
const STATION_MATCH_KM = 0.4;

export async function getRoute(
  from: LatLng,
  to: LatLng,
  mode: TravelMode,
  venues: Venue[]
): Promise<Route | null> {
  const params = new URLSearchParams({
    start: `${from.lat},${from.lng}`,
    end: `${to.lat},${to.lng}`,
    routeType: ONEMAP_ROUTE_TYPE[mode],
  });

  // Public transport is timetable-dependent, so it needs the moment of
  // travel - "now", in Singapore time regardless of where the server runs.
  if (mode === "transit") {
    const { date, time } = singaporeDateTime();
    params.set("date", date);
    params.set("time", time);
    params.set("mode", "TRANSIT");
    params.set("maxWalkDistance", "1000");
    params.set("numItineraries", "1");
  }

  const payload = await oneMapGet<OneMapRouteResponse>(`${ROUTE_URL}?${params.toString()}`);

  return mode === "transit"
    ? normalizeTransitRoute(payload, venues)
    : normalizeDirectRoute(payload, mode);
}

// ---------------------------------------------------------------------------
// Walk / drive / cycle - a single geometry plus a flat list of manoeuvres.
// ---------------------------------------------------------------------------

function normalizeDirectRoute(payload: OneMapRouteResponse, mode: TravelMode): Route | null {
  if (!payload.route_geometry || !payload.route_summary) return null;

  const stepMode: StepMode = mode === "drive" ? "DRIVE" : mode === "cycle" ? "CYCLE" : "WALK";

  // Each instruction is a positional array rather than an object, so the
  // fields are read by index and every one is guarded - a shape change at
  // OneMap's end should degrade to a coarser instruction, not crash the
  // route. Index 9 is the ready-made human sentence; 0 and 1 (manoeuvre and
  // street) are the fallback when it's absent.
  const steps: RouteStep[] = (payload.route_instructions ?? []).map((raw) => ({
    mode: stepMode,
    instruction: instructionText(raw),
    distanceMeters: numberAt(raw, 2),
    durationSeconds: numberAt(raw, 4),
  }));

  return {
    mode,
    durationSeconds: payload.route_summary.total_time ?? 0,
    distanceMeters: payload.route_summary.total_distance ?? 0,
    segments: [
      {
        path: decodePolyline(payload.route_geometry),
        color: mode === "drive" ? DRIVE_COLOR : mode === "cycle" ? CYCLE_COLOR : WALK_COLOR,
        dashed: mode === "walk",
      },
    ],
    steps,
  };
}

function instructionText(raw: unknown[]): string {
  const sentence = raw[9];
  if (typeof sentence === "string" && sentence.trim()) return sentence.trim();

  const manoeuvre = typeof raw[0] === "string" ? raw[0] : "Continue";
  const street = typeof raw[1] === "string" && raw[1].trim() ? ` onto ${raw[1].trim()}` : "";
  return `${manoeuvre}${street}`;
}

function numberAt(raw: unknown[], index: number): number {
  const value = raw[index];
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

// ---------------------------------------------------------------------------
// Public transport - an itinerary of legs, each with its own geometry.
// ---------------------------------------------------------------------------

function normalizeTransitRoute(payload: OneMapRouteResponse, venues: Venue[]): Route | null {
  const itinerary = payload.plan?.itineraries?.[0];
  if (!itinerary) return null;

  const stations = venues.filter((venue) => venue.category === "Transit");

  const steps: RouteStep[] = (itinerary.legs ?? []).map((leg) => {
    const mode = stepModeFor(leg.mode);
    const lineName = leg.routeShortName?.trim() || leg.route?.trim() || undefined;

    const step: RouteStep = {
      mode,
      instruction: legInstruction(leg, mode, lineName),
      distanceMeters: Math.round(leg.distance ?? 0),
      durationSeconds: Math.round(leg.duration ?? 0),
    };

    if (mode !== "WALK") {
      step.lineName = lineName;
      step.lineColor = lineColorFor(mode, lineName);
      step.fromName = leg.from?.name;
      step.toName = leg.to?.name;
      // OTP counts intermediate stops, i.e. everything strictly between
      // boarding and alighting - the ride itself is one more than that.
      step.stopCount = (leg.intermediateStops?.length ?? 0) + 1;

      // The crowd reading that makes this Crowdy's directions rather than
      // anyone's: how busy the station being boarded is, right now.
      //
      // Rail only. LTA's PCDRealTime feed measures crowding on MRT/LRT
      // platforms - there is no equivalent for bus stops. Since a stop like
      // "Aft Orchard Stn Exit 12" sits within metres of a station, matching
      // by proximity happily attached the station's reading to the bus leg
      // and labelled it as the stop's own, which is a number that simply
      // doesn't exist. Better to show nothing than to invent it.
      const boarding = mode === "BUS" ? undefined : leg.from;
      if (boarding && typeof boarding.lat === "number" && typeof boarding.lon === "number") {
        const station = nearestStation(stations, boarding.lat, boarding.lon);
        if (station) {
          step.crowd = {
            venueId: station.id,
            level: station.crowdLevel,
            percent: station.crowdPercent,
          };
        }
      }
    }

    return step;
  });

  // Each leg keeps its own line rather than being merged into one, so the
  // train portion draws in its line's colour and the walk to the station
  // draws dashed and grey.
  const segments: RouteSegment[] = (itinerary.legs ?? [])
    .filter((leg) => leg.legGeometry?.points)
    .map((leg) => {
      const mode = stepModeFor(leg.mode);
      return {
        path: decodePolyline(leg.legGeometry!.points!),
        color: lineColorFor(mode, leg.routeShortName?.trim() || leg.route?.trim()),
        dashed: mode === "WALK",
      };
    });

  return {
    mode: "transit",
    durationSeconds: Math.round(itinerary.duration ?? 0),
    distanceMeters: steps.reduce((total, step) => total + step.distanceMeters, 0),
    transfers: itinerary.transfers ?? 0,
    walkSeconds: Math.round(itinerary.walkTime ?? 0),
    segments,
    steps,
  };
}

function stepModeFor(oneMapMode: string | undefined): StepMode {
  switch (oneMapMode) {
    case "SUBWAY":
    case "RAIL":
    case "TRAM":
      return "SUBWAY";
    case "BUS":
      return "BUS";
    default:
      return "WALK";
  }
}

function lineColorFor(mode: StepMode, lineName: string | undefined): string {
  if (mode === "BUS") return BUS_COLOR;
  // Line codes arrive with the station number attached on some services
  // (e.g. "NS1"), so the colour is keyed off the leading letters only.
  const code = lineName?.match(/^[A-Za-z]+/)?.[0]?.toUpperCase();
  return (code && LINE_COLORS[code]) || WALK_COLOR;
}

function legInstruction(leg: OneMapLeg, mode: StepMode, lineName: string | undefined): string {
  if (mode === "WALK") {
    const destination = leg.to?.name;
    return destination ? `Walk to ${titleCase(destination)}` : "Walk";
  }
  const service = lineName ?? (mode === "BUS" ? "Bus" : "Train");
  const boardAt = leg.from?.name ? titleCase(leg.from.name) : "your stop";
  const alightAt = leg.to?.name ? titleCase(leg.to.name) : "your destination";
  return `${service} · ${boardAt} → ${alightAt}`;
}

// OneMap returns stop names in full caps ("ORCHARD MRT STATION"), which
// reads as shouting next to the rest of the app's copy.
function titleCase(value: string): string {
  return value
    .toLowerCase()
    .replace(/\b[a-z]/g, (letter) => letter.toUpperCase())
    .replace(/\b(Mrt|Lrt)\b/g, (abbreviation) => abbreviation.toUpperCase());
}

function nearestStation(stations: Venue[], lat: number, lng: number): Venue | undefined {
  let closest: Venue | undefined;
  let closestKm = STATION_MATCH_KM;

  for (const station of stations) {
    const km = haversineKm(lat, lng, station.lat, station.lng);
    if (km < closestKm) {
      closest = station;
      closestKm = km;
    }
  }

  return closest;
}

function singaporeDateTime(): { date: string; time: string } {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Singapore",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(new Date());

  const find = (type: string) => parts.find((part) => part.type === type)?.value ?? "00";

  // OneMap expects MM-DD-YYYY, not the ISO ordering.
  return {
    date: `${find("month")}-${find("day")}-${find("year")}`,
    time: `${find("hour")}:${find("minute")}:${find("second")}`,
  };
}

// ---------------------------------------------------------------------------
// The shapes OneMap actually returns. Everything is optional because these
// come from outside the system - normalization above is what guarantees the
// Route handed to the app is complete.
// ---------------------------------------------------------------------------

interface OneMapStop {
  name?: string;
  lat?: number;
  lon?: number;
}

interface OneMapLeg {
  mode?: string;
  route?: string;
  routeShortName?: string;
  distance?: number;
  duration?: number;
  from?: OneMapStop;
  to?: OneMapStop;
  legGeometry?: { points?: string };
  intermediateStops?: unknown[];
}

interface OneMapRouteResponse {
  route_geometry?: string;
  route_instructions?: unknown[][];
  route_summary?: { total_time?: number; total_distance?: number };
  plan?: {
    itineraries?: {
      duration?: number;
      walkTime?: number;
      transfers?: number;
      legs?: OneMapLeg[];
    }[];
  };
}
