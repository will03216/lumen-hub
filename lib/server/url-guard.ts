/**
 * SSRF protection — blocks requests to private networks, loopback, and
 * cloud metadata endpoints before the app makes any outbound fetch.
 *
 * Checks hostname-level patterns. Not a substitute for network-level
 * egress filtering on the host, but catches the obvious attack vectors.
 */

const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  'metadata.google.internal',
  'metadata.goog',
  'instance-data',           // GCP alternate
  '169.254.169.254',         // AWS/Azure/GCP metadata IP
])

const PRIVATE_IP_RE = [
  /^127\./,                                        // loopback
  /^0\./,                                          // 0.0.0.0/8
  /^10\./,                                         // RFC 1918
  /^192\.168\./,                                   // RFC 1918
  /^172\.(1[6-9]|2[0-9]|3[01])\./,                // RFC 1918
  /^169\.254\./,                                   // link-local / cloud metadata
  /^100\.(6[4-9]|[7-9]\d|1[0-1]\d|12[0-7])\./,   // CGNAT RFC 6598
  /^::1$/,                                         // IPv6 loopback
  /^fc[0-9a-f]{2}:/i,                              // IPv6 unique local
  /^fe[89ab][0-9a-f]:/i,                           // IPv6 link-local
  /^::ffff:(127\.|10\.|192\.168\.|169\.254\.)/i,   // IPv4-mapped IPv6
]

/** Throws if the URL targets a private/metadata address.
 *  Call before any outbound fetch with a user-supplied URL. */
export function assertSafeUrl(url: URL): void {
  const h = url.hostname.toLowerCase().replace(/\.$/, '') // strip trailing dot

  if (BLOCKED_HOSTNAMES.has(h)) {
    throw new Error(`Blocked host: ${h}`)
  }

  for (const re of PRIVATE_IP_RE) {
    if (re.test(h)) {
      throw new Error(`Blocked private address: ${h}`)
    }
  }
}
