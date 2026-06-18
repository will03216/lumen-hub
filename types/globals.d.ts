export {}

declare global {
  /**
   * Shape of the custom claims we add to the Clerk session token.
   * Configure in Clerk dashboard → Sessions → "Customize session token":
   *   { "metadata": "{{user.public_metadata}}" }
   * `onboarded` is set true once a user has saved all required BYOK keys.
   */
  interface CustomJwtSessionClaims {
    metadata?: {
      onboarded?: boolean
    }
  }
}
