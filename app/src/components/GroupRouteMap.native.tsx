import React, { useEffect, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import MapView, { Marker, Polyline } from "react-native-maps";
import { LatLng, RouteSegment } from "../types/directions";
import { useTheme } from "../theme/ThemeContext";
import { DARK_MAP_STYLE } from "../theme/darkMapStyle";

export interface GroupRouteLine {
  name: string;
  color: string;
  origin: LatLng;
  // Empty when the trip couldn't be planned - only the start is marked.
  segments: RouteSegment[];
}

interface Props {
  destination: LatLng;
  destinationName: string;
  lines: GroupRouteLine[];
  // The person whose route is picked out, or null to show everyone evenly.
  highlighted: number | null;
  // How much of the map's bottom edge the list covers, so routes are fitted
  // into the part still visible.
  bottomInset: number;
}

const FIT_PADDING = 40;

// Metro picks this file on iOS/Android; GroupRouteMap.web.tsx is the web
// fallback. Each person's whole trip is drawn in their own colour (walking
// legs dashed), so the routes read as people rather than as train lines.
// The highlighted person's trip switches to its real line colours (MRT
// lines, bus, walking), the same as on the Directions screen.
export function GroupRouteMap({ destination, destinationName, lines, highlighted, bottomInset }: Props) {
  const { mode } = useTheme();
  const mapRef = useRef<MapView>(null);
  const [mapReady, setMapReady] = useState(false);

  // Fits everyone's routes, or just the highlighted one, plus the mall.
  useEffect(() => {
    if (!mapReady) return;
    const shown = highlighted === null ? lines : lines.slice(highlighted, highlighted + 1);
    const points = [destination, ...shown.flatMap((line) => [line.origin, ...line.segments.flatMap((s) => s.path)])];
    mapRef.current?.fitToCoordinates(
      points.map((p) => ({ latitude: p.lat, longitude: p.lng })),
      {
        edgePadding: { top: FIT_PADDING + 10, right: FIT_PADDING, bottom: bottomInset + FIT_PADDING, left: FIT_PADDING },
        animated: true,
      }
    );
  }, [lines, highlighted, destination, mapReady, bottomInset]);

  // The highlighted route goes last so it's drawn on top of the others.
  const order = lines.map((_, i) => i).sort((a, b) => Number(a === highlighted) - Number(b === highlighted));
  const casing = mode === "dark" ? "#00000088" : "#FFFFFFCC";

  return (
    <MapView
      ref={mapRef}
      style={StyleSheet.absoluteFill}
      onMapReady={() => setMapReady(true)}
      userInterfaceStyle={mode}
      customMapStyle={mode === "dark" ? DARK_MAP_STYLE : []}
      initialRegion={{ latitude: destination.lat, longitude: destination.lng, latitudeDelta: 0.15, longitudeDelta: 0.15 }}
      toolbarEnabled={false}
    >
      {order.map((i) => {
        const line = lines[i];
        const faded = highlighted !== null && highlighted !== i;
        const color = faded ? `${line.color}55` : line.color;
        const detailed = highlighted === i;
        const width = detailed ? 6 : 4;
        return line.segments.map((segment, j) => {
          const coordinates = segment.path.map((p) => ({ latitude: p.lat, longitude: p.lng }));
          return (
            <React.Fragment key={`${i}-${j}`}>
              {!segment.dashed && !faded && (
                <Polyline coordinates={coordinates} strokeColor={casing} strokeWidth={width + 4} />
              )}
              <Polyline
                coordinates={coordinates}
                strokeColor={detailed ? segment.color : color}
                strokeWidth={width}
                lineDashPattern={segment.dashed ? [2, 8] : undefined}
                lineCap="round"
              />
            </React.Fragment>
          );
        });
      })}

      {lines.map((line, i) => (
        <Marker
          key={`start-${i}`}
          coordinate={{ latitude: line.origin.lat, longitude: line.origin.lng }}
          title={line.name}
          anchor={{ x: 0.5, y: 0.5 }}
          opacity={highlighted !== null && highlighted !== i ? 0.45 : 1}
        >
          <View style={[styles.start, { backgroundColor: line.color }]}>
            <Text style={styles.startText}>{i + 1}</Text>
          </View>
        </Marker>
      ))}

      <Marker coordinate={{ latitude: destination.lat, longitude: destination.lng }} title={destinationName} />
    </MapView>
  );
}

const styles = StyleSheet.create({
  start: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: "#FFFFFF",
    alignItems: "center",
    justifyContent: "center",
  },
  startText: { color: "#FFFFFF", fontSize: 12, fontWeight: "700" },
});
