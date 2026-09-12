import { useMemo } from "react";
import { NavigationContainer, DefaultTheme, DarkTheme, Theme } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { RootStackParamList } from "./src/navigation/types";
import { ThemeProvider, useTheme } from "./src/theme/ThemeContext";
import { AuthProvider } from "./src/context/AuthContext";
import HomeScreen from "./src/screens/HomeScreen";
import DetailScreen from "./src/screens/DetailScreen";
import SettingsScreen from "./src/screens/SettingsScreen";

const Stack = createNativeStackNavigator<RootStackParamList>();

// Reads the theme (must be inside ThemeProvider) to colour both the native
// header chrome (back button, title bar) and React Navigation's own
// background/status-bar theme, so Detail/Settings match Home instead of
// always showing the system's light-mode default.
function Navigation() {
  const { mode, colors } = useTheme();

  // Native-stack's header derives its background/tint from this `theme`
  // object automatically (colors.card / colors.text) - previously it also
  // got a manual override via screenOptions.headerStyle/headerTintColor,
  // using the same colors but from a second, separate prop path. React
  // Navigation's stock DarkTheme/DefaultTheme values (e.g. DarkTheme's
  // card is rgb(18,18,18), not our #1C1C1E) don't exactly match, so the
  // header could briefly paint with the stock theme colour before the
  // screenOptions override landed - the one-time flash on opening a new
  // screen. Building the nav theme directly from our own tokens and
  // dropping the redundant override leaves a single source of truth, so
  // there's nothing left for the header to flash away from.
  const navTheme: Theme = useMemo(
    () => ({
      dark: mode === "dark",
      colors: {
        primary: colors.accent,
        background: colors.background,
        card: colors.surface,
        text: colors.text,
        border: colors.border,
        notification: colors.accent,
      },
      fonts: (mode === "dark" ? DarkTheme : DefaultTheme).fonts,
    }),
    [mode, colors]
  );

  return (
    <NavigationContainer theme={navTheme}>
      {/* Without this the status bar icons (time/wifi/battery) stay dark
          regardless of app theme - invisible against a dark background on
          screens like Settings that fill the whole top edge. */}
      <StatusBar style={mode === "dark" ? "light" : "dark"} />
      {/* headerBackButtonDisplayMode "minimal" drops the "Home" text label,
          leaving just the chevron - this is very likely iOS's own native
          interactive-transition chrome (the back button legitimately
          highlights mid-swipe on every UIKit app; it's just far more
          visible against a dark header than a light one), not a bug in our
          code, so it's not something removable without giving up the real
          native header/swipe-back gesture. Dropping the label at least
          removes the more noticeable part of what flashes. */}
      <Stack.Navigator screenOptions={{ headerBackButtonDisplayMode: "minimal" }}>
        <Stack.Screen name="Home" component={HomeScreen} options={{ headerShown: false }} />
        <Stack.Screen name="Detail" component={DetailScreen} options={{ title: "Venue" }} />
        <Stack.Screen name="Settings" component={SettingsScreen} options={{ title: "Settings" }} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <SafeAreaProvider>
          <Navigation />
        </SafeAreaProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
