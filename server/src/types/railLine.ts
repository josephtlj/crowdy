export interface RailLineSegment {
  code: string; // "NSL", "EWL", "CCL", "NEL", "DTL", "TEL", "SKLRT", "PGLRT", "BPLRT"
  color: string;
  coordinates: { lat: number; lng: number }[];
}
