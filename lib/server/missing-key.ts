/**
 * Thrown by a provider adapter when no per-user credential is supplied.
 *
 * Strict BYOK: there is no env fallback. Routes catch this and convert it to a
 * 402 `missing_api_key` response via `missingKeyResponse(err.provider)`.
 */
export class MissingKeyError extends Error {
  provider: string
  constructor(provider: string) {
    super(`Missing ${provider} credential. Add your key in Settings.`)
    this.name = 'MissingKeyError'
    this.provider = provider
  }
}
