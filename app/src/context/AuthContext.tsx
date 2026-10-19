import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { Alert } from "react-native";
import * as api from "../services/api";
import { loadSession, storeSession, clearSession } from "../services/sessionStorage";
import { loadSavedVenueIds, persistSavedVenueIds } from "../services/savedVenues";
import { mergeGuestSavesIntoAccount } from "../services/mergeGuestSaves";
import { useLanguage } from "../i18n/LanguageContext";

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
  const { t } = useLanguage();
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
  // "Add to My Saved" clears the phone list only after the server merge succeeds.
  // "Don't Add" still discards the guest list.
  function promptToMergeLocalSaves(token: string, localIds: string[]): Promise<void> {
    return new Promise((resolve) => {
      Alert.alert(
        t("auth.savedTitle"),
        t("auth.savedBody", { count: localIds.length }),
        [
          {
            text: t("auth.dontAdd"),
            style: "cancel",
            onPress: async () => {
              await persistSavedVenueIds(new Set());
              resolve();
            },
          },
          {
            text: t("auth.add"),
            onPress: async () => {
              const result = await mergeGuestSavesIntoAccount(
                token,
                localIds,
                api.mergeFavourites,
                persistSavedVenueIds
              );
              if (!result.ok) {
                console.error("Failed to merge local favourites into account:", result.error);
                Alert.alert(
                  "Couldn't add saved venues",
                  "They're still saved on this device. You'll be asked again the next time you sign in."
                );
              }
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
    [accountId, username, token, loading, t]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
