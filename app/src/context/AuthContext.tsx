import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { Alert } from "react-native";
import * as api from "../services/api";
import { loadSession, storeSession, clearSession } from "../services/sessionStorage";
import { loadSavedVenueIds, persistSavedVenueIds } from "../services/savedVenues";

interface AuthContextValue {
  // undefined while the stored session is still being read on boot - lets
  // callers tell "not logged in" apart from "haven't checked yet".
  accountId: number | null;
  username: string | null;
  token: string | null;
  loading: boolean;
  signup: (username: string, password: string) => Promise<{ ok: true } | { ok: false; error: string }>;
  login: (username: string, password: string) => Promise<{ ok: true } | { ok: false; error: string }>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : "Something went wrong - try again.";
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [accountId, setAccountId] = useState<number | null>(null);
  const [username, setUsername] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadSession().then((session) => {
      if (session) {
        setAccountId(session.accountId);
        setUsername(session.username);
        setToken(session.token);
      }
      setLoading(false);
    });
  }, []);

  // Confirmed bug in an earlier version of this: merging ran unconditionally
  // on every login, and never cleared the local guest list afterward - so
  // the same handful of guest-saved venues kept getting pushed into every
  // account that subsequently logged in on this device, not just the
  // first one. Two people sharing one phone (or one person testing
  // multiple accounts) would see venues neither of them actually saved
  // themselves appear in their account.
  //
  // Now: only prompt when there's actually something to ask about, and
  // resolve the local guest list one way or the other regardless of the
  // choice - accepted (merged in) or declined (discarded) - so it can
  // never be re-offered to a different account later. Blocks completing
  // login/signup until answered, which is fine here since the caller's
  // own submit button already shows a spinner for the duration.
  function promptToMergeLocalSaves(token: string, localIds: string[]): Promise<void> {
    return new Promise((resolve) => {
      Alert.alert(
        "Saved venues on this device",
        `This device has ${localIds.length} venue${localIds.length === 1 ? "" : "s"} saved without an account. Add them to your saved list?`,
        [
          {
            text: "Don't Add",
            style: "cancel",
            onPress: async () => {
              await persistSavedVenueIds(new Set());
              resolve();
            },
          },
          {
            text: "Add to My Saved",
            onPress: async () => {
              await api.mergeFavourites(token, localIds).catch((err) => {
                console.error("Failed to merge local favourites into account:", err);
              });
              await persistSavedVenueIds(new Set());
              resolve();
            },
          },
        ]
      );
    });
  }

  // Shared by signup and login - both end the same way: resolve any local
  // guest saves (see above), persist the session, then reflect it in state.
  async function completeAuth(session: api.AuthSession, loggedInUsername: string) {
    const localIds = Array.from(await loadSavedVenueIds());
    if (localIds.length > 0) {
      await promptToMergeLocalSaves(session.token, localIds);
    }
    await storeSession({ token: session.token, accountId: session.accountId, username: loggedInUsername });
    setAccountId(session.accountId);
    setUsername(loggedInUsername);
    setToken(session.token);
  }

  const value = useMemo<AuthContextValue>(
    () => ({
      accountId,
      username,
      token,
      loading,
      signup: async (signupUsername, password) => {
        try {
          const session = await api.signup(signupUsername, password);
          await completeAuth(session, signupUsername);
          return { ok: true };
        } catch (err) {
          return { ok: false, error: errorMessage(err) };
        }
      },
      login: async (loginUsername, password) => {
        try {
          const session = await api.login(loginUsername, password);
          await completeAuth(session, loginUsername);
          return { ok: true };
        } catch (err) {
          return { ok: false, error: errorMessage(err) };
        }
      },
      logout: async () => {
        await clearSession();
        setAccountId(null);
        setUsername(null);
        setToken(null);
      },
    }),
    [accountId, username, token, loading]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
