import React, { useEffect, useRef, useState } from "react";
import { StyleSheet } from "react-native";
import MapView, { Marker, Polyline } from "react-native-maps";
import { LatLng, RouteSegment } from "../types/directions";
import { useTheme } from "../theme/ThemeContext";
import { DARK_MAP_STYLE } from "../theme/darkMapStyle";

interface Props {
  origin: LatLng;
  destination: LatLng;
  destinationName: string;
  segments: RouteSegment[];
  // How much of the map's bottom edge the directions sheet sits over. The
  // fitted route has to clear it, or the last leg of every journey - the
  // part ending at the destination - is fitted into pixels nobody can see.
  bottomInset: number;
}

const FIT_EDGE_PADDING = 60;
const FIT_TOP_PADDING = 70;

// Metro picks this file on iOS/Android; RouteMap.web.tsx is the web
// fallback, so react-native-maps stays out of the web bundle entirely.
export function RouteMap({ origin, destination, destinationName, segments, bottomInset }: Props) {
  const { mode } = useTheme();
  const mapRef = useRef<MapView>(null);
  // fitToCoordinates is silently ignored by a map that hasn't finished
  // initialising, and the first route usually arrives before then - which
  // left the route drawn at whatever zoom the map happened to open at,
  // running off under the sheet. Waiting for readiness makes the first fit
  // land as reliably as later ones.
  const [mapReady, setMapReady] = useState(false);

  // Refits whenever the drawn route changes - switching travel mode replaces
  // the segments, and a driving route covers a different area than a walk.
  useEffect(() => {
    if (!mapReady) return;
    const points = segments.flatMap((segment) => segment.path);
    if (points.length === 0) return;

    mapRef.current?.fitToCoordinates(
      points.map((point) => ({ latitude: point.lat, longitude: point.lng })),
      {
        edgePadding: {
          top: FIT_TOP_PADDING,
          right: FIT_EDGE_PADDING,
          bottom: bottomInset + FIT_EDGE_PADDING,
          left: FIT_EDGE_PADDING,
        },
        animated: true,
      }
    );
  }, [segments, bottomInset, mapReady]);

  return (
    <MapView
      ref={mapRef}
      style={StyleSheet.absoluteFill}
      onMapReady={() => setMapReady(true)}
      userInterfaceStyle={mode} // Apple Maps (iOS default provider)
      customMapStyle={mode === "dark" ? DARK_MAP_STYLE : []} // Google Maps (Android)
      initialRegion={{
        latitude: (origin.lat + destination.lat) / 2,
        longitude: (origin.lng + destination.lng) / 2,
        latitudeDelta: Math.max(Math.abs(origin.lat - destination.lat) * 2, 0.02),
        longitudeDelta: Math.max(Math.abs(origin.lng - destination.lng) * 2, 0.02),
      }}
      showsUserLocation
      showsMyLocationButton={false}
      toolbarEnabled={false}
    >
      {/* A casing line under each coloured one - the same trick transit maps
          use to keep a route readable where it crosses busy map detail or
          another leg of itself. Skipped for walking legs, whose dashes are
          meant to read as gaps. */}
      {segments.map((segment, index) =>
        segment.dashed ? null : (
          <Polyline
            key={`casing-${index}`}
            coordinates={segment.path.map((p) => ({ latitude: p.lat, longitude: p.lng }))}
            strokeColor={mode === "dark" ? "#00000088" : "#FFFFFFCC"}
            strokeWidth={9}
          />
        )
      )}

      {segments.map((segment, index) => (
        <Polyline
          key={`segment-${index}`}
          coordinates={segment.path.map((p) => ({ latitude: p.lat, longitude: p.lng }))}
          strokeColor={segment.color}
          strokeWidth={5}
          lineDashPattern={segment.dashed ? [2, 8] : undefined}
          lineCap="round"
        />
      ))}

      <Marker
        coordinate={{ latitude: destination.lat, longitude: destination.lng }}
        title={destinationName}
      />
    </MapView>
  );
}
