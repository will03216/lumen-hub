/**
 * The mark toolbar's icons, re-exported from lucide under the names the
 * toolbar uses.
 *
 * A thin alias file rather than importing lucide directly, because two of
 * these do not exist under the name the design calls for — "scribble" is
 * lucide's Pencil-with-a-line, and the pin is MapPin. Aliasing once here beats
 * a comment at each use site explaining why the import name disagrees with the
 * button beside it.
 */
export {
  Square,
  PencilLine as Scribble,
  MoveUpRight,
  Type,
  MapPin,
  Eraser,
  Undo2,
  Redo2,
} from "lucide-react";
