import { CrowdLevel } from "./venue";
import { Route } from "./directions";

export interface Friend {
  accountId: number;
  username: string;
  homeStationId: string | null;
}

export interface FriendRequest {
  accountId: number;
  username: string;
}

export interface FriendsOverview {
  homeStationId: string | null;
  friends: Friend[];
  incoming: FriendRequest[];
  outgoing: FriendRequest[];
}

export type MeetupPriority = "fair" | "fast" | "quiet";

export interface MeetupTravelTime {
  stationId: string;
  minutes: number;
  estimated: boolean;
}

export interface MeetupSuggestion {
  venueId: string;
  name: string;
  crowdLevel: CrowdLevel;
  crowdPercent: number;
  travel: MeetupTravelTime[];
  maxMinutes: number;
  avgMinutes: number;
}

export interface MeetupPlan {
  suggestions: MeetupSuggestion[];
  allClosed: boolean;
}

// "leave": every trip starts at the meeting time; "arrive": each starts early
// enough to get there by it.
export type RouteTiming = "leave" | "arrive";

export interface GroupRoute {
  stationId: string;
  // null when OneMap couldn't plan the trip; minutes is then an estimate.
  route: Route | null;
  minutes: number;
  leaveAt: string;
  arriveAt: string;
}
