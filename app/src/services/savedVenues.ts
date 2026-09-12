import AsyncStorage from "@react-native-async-storage/async-storage";

// On-device only (AsyncStorage), not account-backed yet - a guest's saves
// live on this one phone and survive closing/reopening the app, but don't
// sync anywhere else. Per the submitted Lab 1 NFRs, a future account
// system is meant to merge whatever's stored here into the account on
// login rather than discarding it.
const STORAGE_KEY = "crowdy:savedVenueIds";

export async function loadSavedVenueIds(): Promise<Set<string>> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return new Set();
    const ids: string[] = JSON.parse(raw);
    return new Set(ids);
  } catch (err) {
    console.error("Failed to load saved venues from device storage:", err);
    return new Set();
  }
}

export async function persistSavedVenueIds(ids: Set<string>): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(ids)));
  } catch (err) {
    console.error("Failed to persist saved venues to device storage:", err);
  }
}
