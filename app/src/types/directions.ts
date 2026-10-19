import { CrowdLevel } from "./venue";

// Kept manually in sync with server/src/types/directions.ts, same as
// venue.ts is with its own server-side counterpart.

export type TravelMode = "transit" | "walk" | "drive" | "cycle";

export interface LatLng {
  lat: number;
  lng: number;
}

export type StepMode = "WALK" | "SUBWAY" | "BUS" | "DRIVE" | "CYCLE";

export interface RouteStep {
  mode: StepMode;
  instruction: string;
  distanceMeters: number;
  durationSeconds: number;
  lineName?: string;
  lineColor?: string;
  fromName?: string;
  toName?: string;
  stopCount?: number;
  crowd?: {
    venueId: string;
    level: CrowdLevel;
    percent: number;
  };
}

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
