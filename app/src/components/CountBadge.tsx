import React from "react";
import { View, Text, StyleSheet, StyleProp, ViewStyle } from "react-native";
import { useTheme } from "../theme/ThemeContext";

/**
 * A small red circle with a number, for things waiting for the user such as
 * friend requests.
 * @param count - the number shown, capped at 9+
 */
export function CountBadge({ count, style }: { count: number; style?: StyleProp<ViewStyle> }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.badge, { backgroundColor: colors.accent }, style]}>
      <Text style={styles.text}>{count > 9 ? "9+" : count}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    minWidth: 16,
    height: 16,
    borderRadius: 8,
    paddingHorizontal: 4,
    alignItems: "center",
    justifyContent: "center",
  },
  text: { color: "#FFFFFF", fontSize: 10, fontWeight: "700" },
});
