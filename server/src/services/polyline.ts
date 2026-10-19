import { LatLng } from "../types/directions";

// OneMap returns route lines in Google's encoded polyline format (precision
// 5), for both `route_geometry` on walk/drive/cycle and `legGeometry.points`
// on each public-transport leg. Decoding here rather than in the app keeps
// the client free of a polyline dependency - it receives plain coordinates.
export function decodePolyline(encoded: string): LatLng[] {
  const points: LatLng[] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  while (index < encoded.length) {
    lat += decodeSignedValue();
    lng += decodeSignedValue();
    points.push({ lat: lat / 1e5, lng: lng / 1e5 });
  }

  return points;

  // Each value is a varint of 5-bit chunks, low chunk first, with bit 0x20
  // flagging "another chunk follows", then zigzag-decoded so negatives
  // survive the unsigned encoding.
  function decodeSignedValue(): number {
    let result = 0;
    let shift = 0;
    let chunk: number;
    do {
      chunk = encoded.charCodeAt(index++) - 63;
      result |= (chunk & 0x1f) << shift;
      shift += 5;
    } while (chunk >= 0x20 && index < encoded.length);
    return result & 1 ? ~(result >> 1) : result >> 1;
  }
}
