"use client";

/**
 * Auth bridge — wraps Clerk's useUser/useClerk into the same
 * { status, user, signOut } interface the rest of the app expects.
 * Swap the underlying provider here without touching any consumer.
 */

import { useUser, useClerk } from "@clerk/nextjs";

export type AuthStatus =
  | "loading"    // Clerk hasn't resolved the session yet
  | "anonymous"  // No active session
  | "signed-in"; // Active session

export type AuthUser = { id: string; email: string };

export type AuthState = {
  status: AuthStatus;
  user: AuthUser | null;
  signOut: () => Promise<void>;
};

export function useAuth(): AuthState {
  const { isLoaded, isSignedIn, user } = useUser();
  const { signOut: clerkSignOut } = useClerk();

  const status: AuthStatus = !isLoaded
    ? "loading"
    : isSignedIn
    ? "signed-in"
    : "anonymous";

  const mappedUser: AuthUser | null =
    isSignedIn && user
      ? {
          id: user.id,
          email:
            user.primaryEmailAddress?.emailAddress ??
            user.emailAddresses[0]?.emailAddress ??
            "",
        }
      : null;

  const handleSignOut = async () => {
    await clerkSignOut();
    if (typeof window !== "undefined") window.location.reload();
  };

  return { status, user: mappedUser, signOut: handleSignOut };
}
