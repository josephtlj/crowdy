import { CrowdLevel } from "./venue";

export interface PopularTimesResult {
  crowdPercent: number;
  crowdLevel: CrowdLevel;
  hourly: { hour: number; percent: number }[];
}
