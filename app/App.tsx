import { NavigationContainer, DefaultTheme, DarkTheme } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { RootStackParamList } from "./src/navigation/types";
import { ThemeProvider, useTheme } from "./src/theme/ThemeContext";
import HomeScreen from "./src/screens/HomeScreen";
import DetailScreen from "./src/screens/DetailScreen";
import SettingsScreen from "./src/screens/SettingsScreen";
import FavouritesScreen from "./src/screens/FavouritesScreen";

const Stack = createNativeStackNavigator<RootStackParamList>();

// Reads the theme (must be inside ThemeProvider) to colour both the native
// header chrome (back button, title bar) and React Navigation's own
// background/status-bar theme, so Detail/Settings/Favourites match Home
// instead of always showing the system's light-mode default.
function Navigation() {
  const { mode, colors } = useTheme();

  return (
    <NavigationContainer theme={mode === "dark" ? DarkTheme : DefaultTheme}>
      {/* Without this the status bar icons (time/wifi/battery) stay dark
          regardless of app theme - invisible against a dark background on
          screens like Favourites/Settings that fill the whole top edge. */}
      <StatusBar style={mode === "dark" ? "light" : "dark"} />
      <Stack.Navigator
        screenOptions={{
          headerStyle: { backgroundColor: colors.surface },
          headerTintColor: colors.text,
        }}
      >
        <Stack.Screen name="Home" component={HomeScreen} options={{ headerShown: false }} />
        <Stack.Screen name="Detail" component={DetailScreen} options={{ title: "Venue" }} />
        <Stack.Screen name="Settings" component={SettingsScreen} options={{ title: "Settings" }} />
        <Stack.Screen
          name="Favourites"
          component={FavouritesScreen}
          options={{ title: "Favourites" }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <SafeAreaProvider>
        <Navigation />
      </SafeAreaProvider>
    </ThemeProvider>
  );
}
