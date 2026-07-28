import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'

const isPublicRoute = createRouteMatcher([
  '/sign-in(.*)',
  '/sign-up(.*)',
  '/api/health',
])

// Routes a not-yet-onboarded user is still allowed to reach so they can
// actually finish setup (and sign out).
const isOnboardingRoute = createRouteMatcher([
  '/settings(.*)',
  '/onboarding(.*)',
])

// Reachable by an authenticated-but-denied user so the access gate doesn't loop.
const isAccessDeniedRoute = createRouteMatcher(['/not-authorized(.*)'])

// API routes self-guard with a 402/403 JSON response, so we never redirect
// them — an XHR should get clean JSON, not an HTML page.
const isApiRoute = createRouteMatcher(['/api/(.*)'])

// ── Access gate (opt-in) ────────────────────────────────────────────────────
// Two ways in, checked together:
//   1) Coarse env allowlist — internal staff by domain, plus specific emails.
//        ALLOWED_EMAIL_DOMAINS=bytedance.com
//        ALLOWED_EMAILS=alice@customer.com,bob@partner.io
//      Read at process start, so changes need a container restart.
//   2) Per-user grant in Clerk — set `{ "approved": true }` on the user's
//      public metadata. Read per-request from the session token, so granting
//      access is instant: no env edit, no restart, no redeploy.
//
// The gate is ON if either env list is non-empty OR REQUIRE_APPROVAL is set.
// Set REQUIRE_APPROVAL=true to run purely on Clerk approvals (no env list) —
// flip it on once, then manage every grant from the Clerk dashboard forever.
// Leave all three unset to disable the gate (any authenticated user is allowed).
function parseSet(raw: string | undefined): Set<string> {
  return new Set(
    (raw ?? '')
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  )
}
const ALLOWED_DOMAINS = parseSet(process.env.ALLOWED_EMAIL_DOMAINS)
const ALLOWED_EMAILS = parseSet(process.env.ALLOWED_EMAILS)
const REQUIRE_APPROVAL = /^(1|true|yes|on)$/i.test(process.env.REQUIRE_APPROVAL ?? '')
const gateActive = ALLOWED_DOMAINS.size > 0 || ALLOWED_EMAILS.size > 0 || REQUIRE_APPROVAL

// Passes the gate via the coarse env allowlist (domain or explicit email).
function emailAllowed(email: string | undefined): boolean {
  if (!email) return false // fail closed: no verifiable email when the gate is on
  const e = email.toLowerCase()
  const domain = e.slice(e.lastIndexOf('@') + 1)
  return ALLOWED_EMAILS.has(e) || ALLOWED_DOMAINS.has(domain)
}

export const proxy = clerkMiddleware(async (auth, request) => {
  if (isPublicRoute(request)) return

  const { userId, sessionClaims } = await auth.protect()

  // 1) Access gate — coarse env allowlist OR a per-user Clerk grant.
  // Requires the Clerk session token to expose both claims:
  //   { "email": "{{user.primary_email_address}}",
  //     "metadata": "{{user.public_metadata}}" }
  const approved = sessionClaims?.metadata?.approved === true
  const hasAccess = emailAllowed(sessionClaims?.email) || approved
  if (gateActive && !isAccessDeniedRoute(request) && !hasAccess) {
    if (isApiRoute(request)) {
      return NextResponse.json({ error: 'access_denied' }, { status: 403 })
    }
    return NextResponse.redirect(new URL('/not-authorized', request.url))
  }

  // 2) Strict BYOK: force key setup before the app is usable. `onboarded` is
  // mirrored into Clerk publicMetadata on every key save/delete and exposed on
  // the session token (see Clerk dashboard → Sessions → customize session token).
  const onboarded = sessionClaims?.metadata?.onboarded === true
  if (
    userId &&
    !onboarded &&
    !isOnboardingRoute(request) &&
    !isApiRoute(request) &&
    !isAccessDeniedRoute(request)
  ) {
    return NextResponse.redirect(new URL('/settings?setup=1', request.url))
  }
})

export const config = {
  matcher: [
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
  ],
}
