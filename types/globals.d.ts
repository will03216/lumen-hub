export {}

declare global {
  /**
   * Shape of the custom claims we add to the Clerk session token.
   * Configure in Clerk dashboard → Sessions → "Customize session token":
   *   { "metadata": "{{user.public_metadata}}" }
   * `onboarded` is set true once a user has saved all required BYOK keys.
   */
  interface CustomJwtSessionClaims {
    /** Primary email — add to the Clerk session token as:
     *  { "email": "{{user.primary_email_address}}" }
     *  Used by proxy.ts to enforce the access allowlist. */
    email?: string
    metadata?: {
      onboarded?: boolean
      /** Per-user access grant. Set `{ "approved": true }` in the user's
       *  Clerk public metadata to allow an individual email past the access
       *  gate without touching ALLOWED_EMAILS/env or restarting. */
      approved?: boolean
    }
  }
}
