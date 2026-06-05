/**
 * /onboarding — post-sign-in gate.
 *
 * Clerk redirects here after every sign-in. We check server-side whether
 * the user already has a BytePlus API key saved. If yes, send them to the
 * app. If no, send them to /settings?setup=1 to complete onboarding.
 *
 * This runs once per sign-in, not on every navigation, so the DB check
 * cost is minimal.
 */

import { redirect } from "next/navigation";
import { getUserKeys } from "@/lib/server/user-keys";

export default async function OnboardingPage() {
  const keys = await getUserKeys();

  if (keys.byteplus) {
    redirect("/");
  }

  redirect("/settings?setup=1");
}
