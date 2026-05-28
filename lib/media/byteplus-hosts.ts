/**
 * BytePlus / Volcengine CDN host allowlist — single source of truth.
 *
 * The same list used to live in four places (the `/api/media` proxy, the
 * `/api/library/mirror` route, the client-side `mediaProxyUrl` helper,
 * and the client-side `shouldMirror` check). Drift had already started:
 * `/api/media` carried two TOS-specific suffixes the others didn't,
 * which silently bypassed the mirror flow for any TOS-hosted asset.
 *
 * One list, one matcher, four importers. New CDN hostnames join here
 * and propagate everywhere automatically.
 */

export const BYTEPLUS_HOST_SUFFIXES = [
  ".bytepluses.com",
  ".byteplusapi.com",
  ".volccdn.com",
  ".volcengineusercontent.com",
  ".volces.com",
  ".tos-ap-southeast-1.bytepluses.com",
  ".tos-cn-beijing.volces.com",
] as const;

/** True when `hostname` ends in any allowlisted suffix (or matches the
 *  bare TLD+1 form, e.g. `bytepluses.com` without subdomain). Suffix
 *  match prevents `fakebytepluses.com` from sneaking through. */
export function isByteplusHost(hostname: string): boolean {
  const h = hostname.toLowerCase();
  return BYTEPLUS_HOST_SUFFIXES.some(
    (suffix) => h === suffix.slice(1) || h.endsWith(suffix),
  );
}
