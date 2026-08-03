/**
 * Whose drag was that?
 *
 * Konva bubbles `dragend` from the shape that moved up through its Layer to
 * the Stage — the same way a DOM event bubbles. So a Stage-level `onDragEnd`
 * fires for EVERY mark drag as well as for the camera pan, and `e.target` is
 * the mark, not the Stage.
 *
 * That is not a subtlety you get to forget. The edit canvas folds the Stage's
 * position back into its own pan state on drag end, and without this guard a
 * dragged box at image (425, 913) set the pan to (425, 913) — throwing the
 * picture completely off screen, leaving an empty canvas and no clue why. It
 * reads as "the canvas crashed", because the result is a blank rectangle.
 *
 * Deliberately its own named function rather than an inline comparison: the
 * inline version is three tokens and looks like a redundant identity check,
 * which is exactly how it gets "cleaned up" by the next person.
 */

/** The minimum of a Konva node this needs — kept structural so this module
 *  does not import konva and stays outside the client-only boundary. */
type StageAware = { getStage: () => unknown };

/** True only when the node that was dragged IS the stage itself. */
export function isStageDrag(target: StageAware | null | undefined): boolean {
  return !!target && (target as unknown) === target.getStage();
}
