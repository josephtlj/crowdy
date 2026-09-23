import { CrowdLevel } from "./venue";

export type TravelMode = "transit" | "walk" | "drive" | "cycle";

export interface LatLng {
  lat: number;
  lng: number;
}

// How a single step is travelled. Kept distinct from TravelMode because one
// transit journey mixes several - a "transit" route is usually WALK, then
// SUBWAY, then WALK again.
export type StepMode = "WALK" | "SUBWAY" | "BUS" | "DRIVE" | "CYCLE";

export interface RouteStep {
  mode: StepMode;
  instruction: string;
  distanceMeters: number;
  durationSeconds: number;
  // Transit legs only - the service/line taken and where it's boarded/left.
  lineName?: string;
  lineColor?: string;
  fromName?: string;
  toName?: string;
  stopCount?: number;
  // The live crowd reading for the station this leg boards at, when that
  // station is one we track. This is the whole point of directions living
  // inside Crowdy rather than deep-linking out to Google Maps.
  crowd?: {
    venueId: string;
    level: CrowdLevel;
    percent: number;
  };
}

// One stretch of the route drawn as a single line. A walk/drive/cycle route
// is one segment; a transit journey is one per leg, so the map can paint the
// MRT portion in its own line colour and the walk to the station as a dashed
// grey, the way a network map reads. Geometry is decoded server-side, so the
// app hands these straight to a <Polyline> with no decoder of its own.
export interface RouteSegment {
  path: LatLng[];
  color: string;
  dashed: boolean;
}

export interface Route {
  mode: TravelMode;
  durationSeconds: number;
  distanceMeters: number;
  transfers?: number;
  walkSeconds?: number;
  segments: RouteSegment[];
  steps: RouteStep[];
}
