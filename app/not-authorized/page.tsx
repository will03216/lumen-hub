/**
 * /not-authorized — shown to an authenticated user whose email is not on the
 * access allowlist (see proxy.ts → ALLOWED_EMAIL_DOMAINS / ALLOWED_EMAILS).
 *
 * The user is signed in (they passed Clerk auth) but not permitted to use the
 * platform, so we offer a clear message and a sign-out.
 */

import { SignOutButton } from "@clerk/nextjs";

export default function NotAuthorizedPage() {
  return (
    <div className="min-h-screen bg-background text-foreground flex items-center justify-center px-6">
      <div className="max-w-md text-center">
        <h1 className="text-2xl font-semibold mb-3">Access restricted</h1>
        <p className="text-sm text-ink-dim mb-8">
          This platform is limited to ByteDance staff and approved customers.
          Your account isn’t on the access list. If you believe this is a
          mistake, contact the team that invited you.
        </p>
        <SignOutButton>
          <button
            type="button"
            className="bg-white text-black font-medium text-sm py-2.5 px-5 rounded-lg hover:bg-zinc-200 transition-colors"
          >
            Sign out
          </button>
        </SignOutButton>
      </div>
    </div>
  );
}
