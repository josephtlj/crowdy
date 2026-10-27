export type RootStackParamList = {
  Home: undefined;
  Detail: { venueId: string };
  Directions: { venueId: string };
  Settings: undefined;
  Meetup: undefined;
  GroupRoutes: {
    venueId: string;
    venueName: string;
    // Everyone in the group, in list order.
    people: { name: string; stationId: string; stationName: string; lat: number; lng: number }[];
    // The meeting time (ISO), or undefined for now.
    at?: string;
  };
  Friends: undefined;
};
