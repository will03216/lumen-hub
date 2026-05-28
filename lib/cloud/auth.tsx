"use client";

/**
 * AuthProvider — single source of truth for "is the user signed in"
 * across the app.
 *
 * Mounts at the layout root. Subscribes to Supabase's `auth.onAuthStateChange`
 * so sign-in / sign-out anywhere in the app propagates without a refresh.
 * When cloud isn't configured, the provider is a no-op shell — `useAuth()`
 * returns `{ user: null, status: "anonymous" }` and the rest of the app
 * carries on as before.
 *
 * The provider deliberately does NO data fetching beyond the session;
 * the cloud-sync bridge layers on top of the same hook. Keeping concerns
 * narrow lets the auth surface stay testable and replaceable.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { Session, User } from "@supabase/supabase-js";
import { getBrowserClient, isCloudConfigured } from "./supabase";

export type AuthStatus =
  /** Cloud sync isn't configured at all — sign-in is hidden. */
  | "disabled"
  /** Configured but we haven't checked for an existing session yet. */
  | "loading"
  /** Configured and the visitor isn't signed in. */
  | "anonymous"
  /** Configured and the visitor is signed in. */
  | "signed-in";

export type AuthState = {
  status: AuthStatus;
  user: User | null;
  /** Sign out, then refresh the page so server-rendered routes catch up. */
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const cloudOn = isCloudConfigured();
  const [user, setUser] = useState<User | null>(null);
  const [status, setStatus] = useState<AuthStatus>(
    cloudOn ? "loading" : "disabled",
  );

  useEffect(() => {
    if (!cloudOn) return;
    const supabase = getBrowserClient();
    if (!supabase) return;

    let unsub: (() => void) | undefined;

    // Pick up the existing session first so the "signed-in" pill renders
    // immediately on hard refresh; THEN attach the change listener for
    // future sign-in / sign-out events.
    void supabase.auth.getSession().then(({ data }) => {
      applySession(data.session);
      const { data: sub } = supabase.auth.onAuthStateChange(
        (_event, session) => applySession(session),
      );
      unsub = () => sub.subscription.unsubscribe();
    });

    function applySession(session: Session | null) {
      setUser(session?.user ?? null);
      setStatus(session?.user ? "signed-in" : "anonymous");
    }

    return () => {
      unsub?.();
    };
  }, [cloudOn]);

  const signOut = useCallback(async () => {
    const supabase = getBrowserClient();
    if (!supabase) return;
    await supabase.auth.signOut();
    // Force a full reload so any server-rendered surfaces re-evaluate
    // their session-bound queries (none today, but cheap insurance).
    if (typeof window !== "undefined") window.location.reload();
  }, []);

  const value = useMemo<AuthState>(
    () => ({ status, user, signOut }),
    [status, user, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/** Hook for any client component to read the current auth state. Safe
 *  to call without a provider — returns the disabled state, which is
 *  useful for tests + unit-rendered components. */
export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (ctx) return ctx;
  return {
    status: "disabled",
    user: null,
    signOut: async () => {},
  };
}
