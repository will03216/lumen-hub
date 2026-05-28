/**
 * Vitest — unit + integration test runner for modules under lib/.
 *
 * Scope progression:
 *   · Phase 1 (pre-§22): pure-function tests only — localStorage-backed
 *     state, coercion logic, error classifier, template drift guards.
 *   · Phase 2 (§22+): added `renderHook`-style contract tests for the
 *     render hooks under `lib/compare/` using @testing-library/react on
 *     happy-dom. These still don't mount real components — they exercise
 *     the hook's state machine against a stubbed `fetch`.
 *
 * Environment: happy-dom. We need `window.localStorage` for saved-pairs /
 * saved-history, plus a DOM for React Testing Library's `act()` to run
 * effects against. happy-dom is ~10x lighter than jsdom and fine for
 * anything short of full component rendering.
 *
 * Include glob is `.{ts,tsx}` so `.test.tsx` files (React-touching) run
 * alongside pure `.test.ts`. Both live under lib/ — we don't test
 * `app/**` components because those bring in Next's server/client split
 * which vitest doesn't model.
 *
 * Alias: mirrors tsconfig's `"@/*": ["./*"]` so imports like
 * `@/lib/studio/models` resolve identically under the runner and the build.
 */

import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "happy-dom",
    include: ["lib/**/*.test.{ts,tsx}", "lib/**/*.spec.{ts,tsx}"],
    // One-shot runs in CI; append `--watch` on the CLI for dev TDD loops.
    globals: false,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "."),
    },
  },
});
