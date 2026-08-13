/**
 * The measured variant defaults — PRD §10.5.
 *
 * EMPTY UNTIL A BENCH RUNS. That is the correct state, not a placeholder: with
 * no entries, `selectVariant` falls through to the §10.3 heuristic, which is
 * an honest hypothesis. Filling this in with a guess would launder that
 * hypothesis into something that reads like evidence.
 *
 * To populate it:
 *
 *   npm run video-edit:bench -- --manifest bench/clips.json --confirm
 *   npm run video-edit:bench -- --score bench/results.json   # writes the table
 *
 * The runner prints the table and the report; paste the table here and the
 * report into the PRD. Committing the numbers alongside the table is the point
 * — a default nobody can trace back to a measurement is a guess again within
 * one refactor.
 */

import type { MeasuredDefaults } from "./bench";

export const MEASURED_DEFAULTS: MeasuredDefaults = {};

/** When the table above was measured, and against which model. A default
 *  measured on a different model version is not evidence about this one. */
export const MEASURED_AGAINST: { model: string; date: string } | null = null;
