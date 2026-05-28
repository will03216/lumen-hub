import { Button, type ButtonProps } from "@/components/ui/button";

/**
 * DownloadButton — the styled "Save ↓" affordance shipped on every
 * media tile (image generator, video generator, Compare result tiles,
 * Compare lightbox). Wraps Button asChild + a download anchor with the
 * triplet `download / target=_blank / rel=noreferrer` we always need
 * when offering raw asset downloads from a third-party CDN.
 *
 * Defaults to size="sm" + variant="secondary" because that's the
 * shape every existing call site used; both are overridable via the
 * spread for the rare case where a primary variant fits better.
 */
export function DownloadButton({
  href,
  label = "Save ↓",
  size = "sm",
  variant = "secondary",
  ...rest
}: {
  href: string;
  label?: React.ReactNode;
} & Omit<ButtonProps, "asChild" | "children">) {
  return (
    <Button asChild size={size} variant={variant} {...rest}>
      <a href={href} download target="_blank" rel="noreferrer">
        {label}
      </a>
    </Button>
  );
}
