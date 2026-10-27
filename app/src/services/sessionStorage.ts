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

/**
 * Reads the saved login from the phone's secure storage.
 * @returns the saved session, or null if there is none or it can't be read
 */
export async function loadSession(): Promise<StoredSession | null> {
  try {
    const raw = await SecureStore.getItemAsync(SESSION_KEY);
    return raw ? (JSON.parse(raw) as StoredSession) : null;
  } catch (err) {
    console.error("Failed to load session from secure storage:", err);
    return null;
  }
}

/**
 * Saves the login to the phone's secure storage so the user stays signed in.
 * @param session - the token, account id and username
 */
export async function storeSession(session: StoredSession): Promise<void> {
  try {
    await SecureStore.setItemAsync(SESSION_KEY, JSON.stringify(session));
  } catch (err) {
    console.error("Failed to persist session to secure storage:", err);
  }
}

/**
 * Removes the saved login on log out or when the session has expired.
 */
export async function clearSession(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(SESSION_KEY);
  } catch (err) {
    console.error("Failed to clear session from secure storage:", err);
  }
}
