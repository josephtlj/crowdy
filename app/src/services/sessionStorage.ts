import * as SecureStore from "expo-secure-store";

// SecureStore rather than AsyncStorage (used for saved venues) since this
// holds an actual auth credential, not just a list of ids - SecureStore
// backs onto the OS's own encrypted storage (Keychain on iOS, Keystore on
// Android) instead of plain unencrypted storage. Underscore, not the colon
// used elsewhere for AsyncStorage keys - SecureStore only allows
// alphanumeric characters plus ".", "-", "_" and rejects anything else
// (confirmed directly: a colon here crashed with "Invalid key provided").
const SESSION_KEY = "crowdy_session";

export interface StoredSession {
  token: string;
  accountId: number;
  username: string;
}

export async function loadSession(): Promise<StoredSession | null> {
  try {
    const raw = await SecureStore.getItemAsync(SESSION_KEY);
    return raw ? (JSON.parse(raw) as StoredSession) : null;
  } catch (err) {
    console.error("Failed to load session from secure storage:", err);
    return null;
  }
}

export async function storeSession(session: StoredSession): Promise<void> {
  try {
    await SecureStore.setItemAsync(SESSION_KEY, JSON.stringify(session));
  } catch (err) {
    console.error("Failed to persist session to secure storage:", err);
  }
}

export async function clearSession(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(SESSION_KEY);
  } catch (err) {
    console.error("Failed to clear session from secure storage:", err);
  }
}
