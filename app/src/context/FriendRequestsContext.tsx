import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { Alert, AppState } from "react-native";
import { useAuth } from "./AuthContext";
import { useLanguage } from "../i18n/LanguageContext";
import * as api from "../services/api";
import { FriendRequest } from "../types/social";

interface FriendRequestsValue {
  incoming: FriendRequest[];
  update: (incoming: FriendRequest[]) => void;
}

const FriendRequestsContext = createContext<FriendRequestsValue | undefined>(undefined);

/**
 * Tells a signed-in user about friend requests waiting for them. Checks on
 * sign-in, on app start and whenever the app comes back to the foreground,
 * and shows an alert for each request once per sign-in. The waiting
 * requests also drive the badges on the Settings tab and Friends row.
 * @param onView - opens the friends screen from the alert
 */
export function FriendRequestsProvider({ children, onView }: { children: React.ReactNode; onView: () => void }) {
  const { token } = useAuth();
  const { t } = useLanguage();
  const [incoming, setIncoming] = useState<FriendRequest[]>([]);
  // Requests already shown in an alert, so each one only pops up once.
  const notified = useRef(new Set<number>());

  const update = useCallback((next: FriendRequest[]) => {
    setIncoming(next);
    next.forEach((r) => notified.current.add(r.accountId));
  }, []);

  const check = useCallback(async () => {
    if (!token) return;
    let next: FriendRequest[];
    try {
      next = (await api.getFriends(token)).incoming;
    } catch {
      return;
    }
    setIncoming(next);
    const fresh = next.filter((r) => !notified.current.has(r.accountId));
    if (fresh.length === 0) return;
    fresh.forEach((r) => notified.current.add(r.accountId));
    Alert.alert(
      t("friends.requestTitle"),
      fresh.length === 1
        ? t("friends.requestOne", { name: fresh[0].username })
        : t("friends.requestMany", { count: fresh.length }),
      [
        { text: t("friends.later"), style: "cancel" },
        { text: t("friends.view"), onPress: onView },
      ]
    );
  }, [token, t, onView]);

  // Kept in a ref so the effects below only re-run when the account changes,
  // not when the language does.
  const checkRef = useRef(check);
  checkRef.current = check;

  // A new sign-in starts with a clean slate.
  useEffect(() => {
    notified.current = new Set();
    setIncoming([]);
    void checkRef.current();
  }, [token]);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") void checkRef.current();
    });
    return () => subscription.remove();
  }, []);

  const value = useMemo(() => ({ incoming, update }), [incoming, update]);
  return <FriendRequestsContext.Provider value={value}>{children}</FriendRequestsContext.Provider>;
}

/**
 * Returns the friend requests waiting for the signed-in user.
 * @returns the waiting requests, and update for screens that load them fresh
 */
export function useFriendRequests(): FriendRequestsValue {
  const ctx = useContext(FriendRequestsContext);
  if (!ctx) throw new Error("useFriendRequests must be used within a FriendRequestsProvider");
  return ctx;
}
