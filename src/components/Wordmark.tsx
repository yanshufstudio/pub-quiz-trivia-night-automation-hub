import Link from "next/link";
import { BrandMark } from "@/components/BrandMark";

/**
 * "TriviaFoundry" as the lit sign: the coaster mark, then the name in the
 * slab display face. One word, medial capital — never "Trivia Foundry" as
 * two words, and never the flat "Triviafoundry" this file used to carry.
 *
 * The casing and the colour are both deliberate, and they are not two
 * answers to one question. Thirteen characters under a single capital fuse
 * into one run and the seam between the halves disappears; that needs
 * fixing twice, because it breaks in two different places:
 *
 * - The medial capital is the STRUCTURAL fix. It lives in the string, so it
 *   still works everywhere the rendering is not ours: the tab title, the PWA
 *   install prompt, `manifest.short_name`, the app switcher, a Paddle
 *   receipt, someone typing the name into a group chat. No amount of CSS
 *   reaches those. It is also the only fix that survives one-colour
 *   reproduction — vinyl on a window, an embossed coaster, a 1-bit favicon.
 * - The two-tone is the ATMOSPHERIC fix, and the reason the mark reads as a
 *   sign that is switched on rather than a logo that happens to be orange.
 *   Cream for the category word, neon amber for the half that is lit.
 *
 * Keep both. Alfa Slab One has a large x-height and short ascenders, so a
 * capital separates less forcefully here than it would in a text face — at
 * header sizes the colour is carrying real weight, not decorating. Drop
 * either one and the seam comes back somewhere.
 *
 * The domain stays lowercase (`triviafoundry.com`) and always has; a
 * lowercase domain under a camel-cased mark is the oldest convention on the
 * web and reads as one name, not two.
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
        Trivia<span className={`text-gold ${glow ? "sign-glow" : ""}`}>Foundry</span>
      </span>
    </>
  );
  const classes = `inline-flex items-center gap-[0.45em] ${className}`;
  return href ? (
    <Link href={href} className={classes} aria-label="TriviaFoundry home">
      {inner}
    </Link>
  ) : (
    <span className={classes}>{inner}</span>
  );
}
