import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Animated, PanResponder, PanResponderInstance, Pressable, StyleSheet, View } from "react-native";
import { useTheme } from "../theme/ThemeContext";

// Past this much of a drag, the sheet commits to the other position instead
// of springing back - the same feel as the Directions sheet.
const SNAP_THRESHOLD = 40;

export interface SnapSheet {
  // How far the sheet sits below its raised position: `travel` when resting,
  // 0 when raised. Used as the sheet's translateY.
  offset: Animated.Value;
  panHandlers: PanResponderInstance["panHandlers"];
  raised: boolean;
  snap: (up: boolean) => void;
}

/**
 * A list sheet over a map that rests at its normal position and can be
 * dragged (or its handle tapped) up to a raised position and back. The
 * sheet is laid out at its raised size and moved down by `offset`, so
 * dragging never re-lays-out the list inside it.
 * @param travel - the distance between the resting and raised positions
 * @returns the offset to apply, the handle's gesture handlers, and controls
 */
export function useSnapSheet(travel: number): SnapSheet {
  const offset = useRef(new Animated.Value(travel)).current;
  const raisedRef = useRef(false);
  const [raised, setRaised] = useState(false);

  // The travel is only known once the screen is measured (and changes on
  // rotation), so the resting position follows it.
  useEffect(() => {
    if (!raisedRef.current) offset.setValue(travel);
  }, [offset, travel]);

  const snap = useCallback(
    (up: boolean) => {
      raisedRef.current = up;
      setRaised(up);
      Animated.spring(offset, { toValue: up ? 0 : travel, useNativeDriver: true, bounciness: 2 }).start();
    },
    [offset, travel]
  );

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        // Claimed on a deliberate vertical drag only, so a tap still reaches
        // the handle's own press.
        onMoveShouldSetPanResponder: (_event, gesture) => Math.abs(gesture.dy) > 4,
        onMoveShouldSetPanResponderCapture: (_event, gesture) => Math.abs(gesture.dy) > 4,
        onPanResponderMove: (_event, gesture) => {
          const base = raisedRef.current ? 0 : travel;
          offset.setValue(Math.min(Math.max(base + gesture.dy, 0), travel));
        },
        onPanResponderRelease: (_event, gesture) => {
          const movedFarEnough = Math.abs(gesture.dy) > SNAP_THRESHOLD;
          snap(movedFarEnough ? gesture.dy < 0 : raisedRef.current);
        },
        onPanResponderTerminate: () => snap(raisedRef.current),
      }),
    [offset, travel, snap]
  );

  return { offset, panHandlers: panResponder.panHandlers, raised, snap };
}

// The grab bar at the top of a sheet, matching the Directions sheet. Drag it
// to move the sheet, or tap it to toggle between raised and resting.
export function SheetHandle({ sheet }: { sheet: SnapSheet }) {
  const { colors } = useTheme();
  return (
    <View {...sheet.panHandlers}>
      <Pressable onPress={() => sheet.snap(!sheet.raised)} hitSlop={6} style={styles.grabArea}>
        <View style={[styles.grabber, { backgroundColor: colors.border }]} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  grabArea: { paddingTop: 8, paddingBottom: 6, alignItems: "center" },
  grabber: { width: 38, height: 4, borderRadius: 2 },
});
