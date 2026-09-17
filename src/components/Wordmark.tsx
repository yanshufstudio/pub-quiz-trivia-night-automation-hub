import Link from "next/link";
import { BrandMark } from "@/components/BrandMark";

/**
 * "Triviafoundry" as the lit sign: the coaster mark, then the name in the
 * slab display face. One word, capital T — never "Trivia Foundry", never
 * camel case.
 *
 * Two-tone on purpose. Fourteen characters with a single capital fuse into
 * one unparseable run, and the seam between the two halves disappears. The
 * usual fix is a medial capital, but Alfa Slab One is a very heavy slab: a
 * capital F mid-word plants a second thick vertical with two horizontal arms
 * right against the T, and the mark goes lumpy. Colour separates the compound
 * just as well, keeps one spelling everywhere (the card sets the wordmark
 * directly above `triviafoundry.com`, so a second casing would read as two
 * different names), and costs nothing downstream. Cream for the category
 * word, neon amber for the half that is actually the name.
 *
 * Sizes off font-size only. `glow` adds the sign's halo — reserved for the
 * homepage hero; on ordinary chrome the colour alone is enough. The halo sits
 * on the amber half only, since that is the part that is meant to be lit.
 */
export function Wordmark({
  href,
  className = "",
  glow = false,
}: {
  href?: string;
  className?: string;
  glow?: boolean;
}) {
  const inner = (
    <>
      <BrandMark className="text-[1.1em]" />
      <span className="font-serif leading-none text-stage-fg">
        Trivia<span className={`text-gold ${glow ? "sign-glow" : ""}`}>foundry</span>
      </span>
    </>
  );
  const classes = `inline-flex items-center gap-[0.45em] ${className}`;
  return href ? (
    <Link href={href} className={classes} aria-label="Triviafoundry home">
      {inner}
    </Link>
  ) : (
    <span className={classes}>{inner}</span>
  );
}
