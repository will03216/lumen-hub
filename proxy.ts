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

// ── Access allowlist (opt-in) ───────────────────────────────────────────────
// Limit the platform to internal staff (by email domain) plus specific
// whitelisted customer emails. Read at runtime (Proxy runs in the Node.js
// runtime), so updating the list only needs a container restart, no rebuild.
//   ALLOWED_EMAIL_DOMAINS=bytedance.com
//   ALLOWED_EMAILS=alice@customer.com,bob@partner.io
// Leave BOTH unset to disable the gate (any authenticated user is allowed).
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
const allowlistActive = ALLOWED_DOMAINS.size > 0 || ALLOWED_EMAILS.size > 0

function emailAllowed(email: string | undefined): boolean {
  if (!allowlistActive) return true // gate disabled
  if (!email) return false // fail closed: no verifiable email when the gate is on
  const e = email.toLowerCase()
  const domain = e.slice(e.lastIndexOf('@') + 1)
  return ALLOWED_EMAILS.has(e) || ALLOWED_DOMAINS.has(domain)
}

export const proxy = clerkMiddleware(async (auth, request) => {
  if (isPublicRoute(request)) return

  const { userId, sessionClaims } = await auth.protect()

  // 1) Access allowlist — internal domains + whitelisted customer emails.
  // Requires the Clerk session token to expose the email claim:
  //   { "email": "{{user.primary_email_address}}" }
  if (allowlistActive && !isAccessDeniedRoute(request) && !emailAllowed(sessionClaims?.email)) {
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
