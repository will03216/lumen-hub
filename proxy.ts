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

// API routes self-guard with a 402 `missing_api_key` JSON response, so we never
// redirect them — an XHR should get clean JSON, not an HTML login/setup page.
const isApiRoute = createRouteMatcher(['/api/(.*)'])

export const proxy = clerkMiddleware(async (auth, request) => {
  if (isPublicRoute(request)) return

  const { userId, sessionClaims } = await auth.protect()

  // Strict BYOK: force key setup before the app is usable. `onboarded` is
  // mirrored into Clerk publicMetadata on every key save/delete and exposed on
  // the session token (see Clerk dashboard → Sessions → customize session token).
  const onboarded = sessionClaims?.metadata?.onboarded === true
  if (userId && !onboarded && !isOnboardingRoute(request) && !isApiRoute(request)) {
    const url = new URL('/settings?setup=1', request.url)
    return NextResponse.redirect(url)
  }
})

export const config = {
  matcher: [
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
  ],
}
