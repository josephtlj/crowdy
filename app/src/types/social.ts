import { CrowdLevel } from "./venue";

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
